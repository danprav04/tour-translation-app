import BackgroundTimer from 'react-native-background-timer';
import socketService from './socketService';
import geminiTranslateService from './geminiTranslateService';

type HealthStatus = 'healthy' | 'degraded' | 'critical';

interface HealthCallbacks {
  onRestartMic?: () => Promise<void>;
  onReconnectGemini?: () => Promise<void>;
  onRefreshSocket?: () => void;
  onListenerNoData?: (status: { hostConnected: boolean; hostStreaming: boolean }) => void;
  onHealthStatusChanged?: (status: HealthStatus) => void;
  onHostStreamingChanged?: (isStreaming: boolean) => void;
}

interface HealthState {
  socketHealthy: boolean;
  consecutiveSocketFailures: number;
  lastHealthCheckSentAt: number;
  pendingHealthCheckNonce: string | null;
  isHostStreaming: boolean;
  lastListenerResyncAt: number;
  lastMicActivityAt: number;
  lastTranslationStartedAt: number;
}

const HEALTH_CHECK_INTERVAL = 30_000;       // Check socket health every 30s
const HEALTH_CHECK_TIMEOUT = 10_000;        // Expect ack within 10s
const RTT_DEGRADED_THRESHOLD = 5_000;       // RTT > 5s = degraded
const MAX_SOCKET_FAILURES = 2;              // 2 consecutive failures = reconnect

const HOST_MIC_SILENCE_THRESHOLD = 3_000;   // Host mic silent for 3s = restart mic
const LISTENER_NO_DATA_THRESHOLD = 15_000;  // Listener no data for 15s = resync
const LISTENER_RESYNC_COOLDOWN = 20_000;    // Don't resync more than once per 20s
const LISTENER_FORCE_RECONNECT_DELAY = 5_000; // After resync, wait 5s then force reconnect

const GEMINI_NO_DATA_WARN = 8_000;          // Gemini no translated audio for 8s = warn
const GEMINI_NO_DATA_RECONNECT = 15_000;    // 15s = reconnect

const PREVENTIVE_RECONNECT_INTERVAL = 5 * 60_000;  // 5 minutes

class ConnectionHealthService {
  private callbacks: HealthCallbacks = {};
  private state: HealthState = {
    socketHealthy: true,
    consecutiveSocketFailures: 0,
    lastHealthCheckSentAt: 0,
    pendingHealthCheckNonce: null,
    isHostStreaming: true,
    lastListenerResyncAt: 0,
    lastMicActivityAt: 0,
    lastTranslationStartedAt: 0,
  };

  private healthCheckInterval: number | null = null;
  private dataFlowInterval: number | null = null;
  private preventiveReconnectInterval: number | null = null;
  private geminiPreventiveReconnectInterval: number | null = null;

  private isRunning = false;
  private role: 'host' | 'listener' | null = null;
  private isMicActive = false;
  private isTranslating = false;
  private isMuted = false;
  private roomCode: string | null = null;

  private isGeminiReconnecting = false;
  private lastGeminiReconnectAt = 0;
  private readonly GEMINI_RECONNECT_COOLDOWN = 30_000;

  // LiveKit data channel monitoring
  private lastLivekitDataAt: number = 0;
  private isLivekitMode = false;
  private livekitDataFlowInterval: number | null = null;

  registerCallbacks(callbacks: HealthCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  startHostMonitoring(roomCode: string, isLegacy: boolean): void {
    this.stop();
    this.role = 'host';
    this.roomCode = roomCode;
    this.isRunning = true;
    this.isLivekitMode = !isLegacy;
    this.resetState();

    if (isLegacy) {
      this.startSocketHealthCheck();
      this.startPreventiveReconnect();
    }
    this.startDataFlowMonitor();
    this.startGeminiPreventiveReconnect();
  }

  startListenerMonitoring(roomCode: string, isLegacy: boolean): void {
    this.stop();
    this.role = 'listener';
    this.roomCode = roomCode;
    this.isRunning = true;
    this.isLivekitMode = !isLegacy;
    this.resetState();

    if (isLegacy) {
      this.startSocketHealthCheck();
      this.startPreventiveReconnect();
      this.startDataFlowMonitor();
    }
    if (!isLegacy) {
      this.startLivekitDataFlowMonitor();
    }
  }

  stop(): void {
    this.isRunning = false;
    this.role = null;
    this.roomCode = null;

    if (this.healthCheckInterval !== null) {
      BackgroundTimer.clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    if (this.dataFlowInterval !== null) {
      BackgroundTimer.clearInterval(this.dataFlowInterval);
      this.dataFlowInterval = null;
    }
    if (this.preventiveReconnectInterval !== null) {
      BackgroundTimer.clearInterval(this.preventiveReconnectInterval);
      this.preventiveReconnectInterval = null;
    }
    if (this.geminiPreventiveReconnectInterval !== null) {
      BackgroundTimer.clearInterval(this.geminiPreventiveReconnectInterval);
      this.geminiPreventiveReconnectInterval = null;
    }
    if (this.livekitDataFlowInterval !== null) {
      BackgroundTimer.clearInterval(this.livekitDataFlowInterval);
      this.livekitDataFlowInterval = null;
    }

    socketService.off('health-check-ack');
    this.resetState();
  }

  // --- State updates from hooks ---

  updateMicState(active: boolean): void {
    this.isMicActive = active;
    if (active) {
      this.state.lastMicActivityAt = Date.now();
    }
  }

  recordMicActivity(): void {
    this.state.lastMicActivityAt = Date.now();
  }

  updateTranslationState(active: boolean): void {
    this.isTranslating = active;
  }

  updateTranslationStartTime(time: number): void {
    this.state.lastTranslationStartedAt = time;
  }

  updateMuteState(muted: boolean): void {
    this.isMuted = muted;
  }

  setGeminiReconnecting(value: boolean): void {
    this.isGeminiReconnecting = value;
    if (!value) {
      this.lastGeminiReconnectAt = Date.now();
    }
  }

  recordLivekitDataReceived(): void {
    this.lastLivekitDataAt = Date.now();
  }

  getHealthStatus(): HealthStatus {
    if (this.state.consecutiveSocketFailures >= MAX_SOCKET_FAILURES) return 'critical';
    if (!this.state.socketHealthy) return 'degraded';
    return 'healthy';
  }

  getIsHostStreaming(): boolean {
    return this.state.isHostStreaming;
  }

  // --- Socket.IO Health Check ---

  private startSocketHealthCheck(): void {
    // Register ack listener
    socketService.onHealthCheckAck((data) => {
      if (data.nonce === this.state.pendingHealthCheckNonce) {
        const rtt = Date.now() - this.state.lastHealthCheckSentAt;
        this.state.pendingHealthCheckNonce = null;

        if (rtt > RTT_DEGRADED_THRESHOLD) {
          console.log(`[HealthMonitor] High RTT detected: ${rtt}ms`);
          this.state.socketHealthy = false;
          this.state.consecutiveSocketFailures += 1;
          this.notifyStatusChange();
        } else {
          if (!this.state.socketHealthy) {
            this.state.socketHealthy = true;
            this.notifyStatusChange();
          }
          this.state.consecutiveSocketFailures = 0;
        }
      }
    });

    this.healthCheckInterval = BackgroundTimer.setInterval(() => {
      if (!this.isRunning) return;

      // Check if previous health check timed out
      if (this.state.pendingHealthCheckNonce !== null) {
        const elapsed = Date.now() - this.state.lastHealthCheckSentAt;
        if (elapsed > HEALTH_CHECK_TIMEOUT) {
          console.log('[HealthMonitor] Health check timed out');
          this.state.pendingHealthCheckNonce = null;
          this.state.consecutiveSocketFailures += 1;
          this.state.socketHealthy = false;
          this.notifyStatusChange();

          if (this.state.consecutiveSocketFailures >= MAX_SOCKET_FAILURES) {
            console.log('[HealthMonitor] Too many failures, refreshing socket connection...');
            this.state.consecutiveSocketFailures = 0;
            this.callbacks.onRefreshSocket?.();
          }
          return;
        }
      }

      // Send new health check
      const nonce = Math.random().toString(36).substring(2, 10);
      this.state.pendingHealthCheckNonce = nonce;
      this.state.lastHealthCheckSentAt = Date.now();
      socketService.sendHealthCheck(nonce);
    }, HEALTH_CHECK_INTERVAL);
  }

  // --- Audio Data Flow Monitor ---

  private startDataFlowMonitor(): void {
    this.dataFlowInterval = BackgroundTimer.setInterval(() => {
      if (!this.isRunning) return;
      const now = Date.now();

      if (this.role === 'host') {
        this.checkHostDataFlow(now);
      } else if (this.role === 'listener') {
        this.checkListenerDataFlow(now);
      }
    }, 3_000); // Check every 3 seconds
  }

  private checkHostDataFlow(now: number): void {
    // Check 1: Mic capture health
    if (this.isMicActive && !this.isMuted) {
      const lastSent = this.state.lastMicActivityAt;
      if (lastSent > 0 && (now - lastSent) > HOST_MIC_SILENCE_THRESHOLD) {
        console.log(`[HealthMonitor] Host mic silent for ${now - lastSent}ms, restarting capture...`);
        this.callbacks.onRestartMic?.();
      }
    }

    // Check 2: Gemini translation health
    if (this.isTranslating && this.isMicActive) {
      if (this.isGeminiReconnecting) return;
      if ((now - this.lastGeminiReconnectAt) < this.GEMINI_RECONNECT_COOLDOWN) return;

      const lastTranslated = geminiTranslateService.lastTranslatedAudioAt;
      if (lastTranslated > 0) {
        const silenceDuration = now - lastTranslated;
        if (silenceDuration > GEMINI_NO_DATA_RECONNECT) {
          console.log(`[HealthMonitor] No translated audio for ${silenceDuration}ms, reconnecting Gemini...`);
          this.callbacks.onReconnectGemini?.();
        } else if (silenceDuration > GEMINI_NO_DATA_WARN) {
          console.log(`[HealthMonitor] Gemini translation delayed: ${silenceDuration}ms since last audio`);
        }
      } else if (this.state.lastTranslationStartedAt > 0) {
        // Initial connection check: no audio arrived yet
        const setupDuration = now - this.state.lastTranslationStartedAt;
        if (setupDuration > 10_000) { // 10s wait for first response
          console.log(`[HealthMonitor] No initial translated audio after ${setupDuration}ms, reconnecting Gemini...`);
          this.callbacks.onReconnectGemini?.();
          // Reset to prevent rapid spamming before reconnect completes
          this.state.lastTranslationStartedAt = now;
        }
      }

      // Check 3: Send failures (silent drop detection)
      if (geminiTranslateService.getConsecutiveSendFailures() > 20) {
        console.log(`[HealthMonitor] High Gemini send failures (${geminiTranslateService.getConsecutiveSendFailures()}), reconnecting...`);
        this.callbacks.onReconnectGemini?.();
      }
    }
  }

  private checkListenerDataFlow(now: number): void {
    if (this.isMuted) return; // Don't check when muted

    const lastReceived = socketService.lastChunkReceivedAt;
    if (lastReceived === 0) return; // Haven't received anything yet, initial buffering

    const silenceDuration = now - lastReceived;
    if (silenceDuration > LISTENER_NO_DATA_THRESHOLD) {
      // Cooldown check
      if ((now - this.state.lastListenerResyncAt) < LISTENER_RESYNC_COOLDOWN) return;

      console.log(`[HealthMonitor] Listener has received no audio for ${silenceDuration}ms, requesting resync...`);
      this.state.lastListenerResyncAt = now;
      this.performListenerResync();
    } else {
      // Data is flowing normally, ensure host streaming state is true
      if (!this.state.isHostStreaming) {
        this.state.isHostStreaming = true;
        this.callbacks.onHostStreamingChanged?.(true);
      }
    }
  }

  private async performListenerResync(): Promise<void> {
    if (!this.roomCode) return;

    try {
      const status = await socketService.requestResync(this.roomCode);
      console.log('[HealthMonitor] Resync response:', status);

      if (!status.hostConnected) {
        // Host is gone
        this.state.isHostStreaming = false;
        this.callbacks.onHostStreamingChanged?.(false);
        this.callbacks.onListenerNoData?.(status);
        return;
      }

      if (!status.hostStreaming) {
        // Host connected but not streaming
        this.state.isHostStreaming = false;
        this.callbacks.onHostStreamingChanged?.(false);
        return;
      }

      // Host is streaming but we're not receiving — connection is stale
      this.state.isHostStreaming = true;
      this.callbacks.onHostStreamingChanged?.(true);
      
      console.log(`[HealthMonitor] Host is streaming but listener not receiving. Forcing reconnect in ${LISTENER_FORCE_RECONNECT_DELAY}ms...`);
      BackgroundTimer.setTimeout(() => {
        if (!this.isRunning || this.role !== 'listener') return;
        // Re-check: if still no data, force reconnect
        const now = Date.now();
        const lastReceived = socketService.lastChunkReceivedAt;
        if (lastReceived > 0 && (now - lastReceived) > LISTENER_NO_DATA_THRESHOLD) {
          console.log('[HealthMonitor] Still no data after resync, refreshing socket...');
          this.callbacks.onRefreshSocket?.();
        }
      }, LISTENER_FORCE_RECONNECT_DELAY);
    } catch (error) {
      console.error('[HealthMonitor] Resync request failed:', error);
      // If resync itself failed, try refreshing socket
      this.callbacks.onRefreshSocket?.();
    }
  }

  // --- LiveKit Data Channel Monitor ---

  private startLivekitDataFlowMonitor(): void {
    this.livekitDataFlowInterval = BackgroundTimer.setInterval(() => {
      if (!this.isRunning || this.role !== 'listener') return;
      if (this.isMuted) return;
      const now = Date.now();

      if (this.lastLivekitDataAt > 0) {
        const silenceDuration = now - this.lastLivekitDataAt;
        if (silenceDuration > LISTENER_NO_DATA_THRESHOLD) {
          console.log(`[HealthMonitor] LiveKit listener: no data for ${silenceDuration}ms`);
          // For LiveKit, we can't easily resync through the server.
          // Signal the UI that host may have paused.
          this.state.isHostStreaming = false;
          this.callbacks.onHostStreamingChanged?.(false);
        } else {
          if (!this.state.isHostStreaming) {
            this.state.isHostStreaming = true;
            this.callbacks.onHostStreamingChanged?.(true);
          }
        }
      }
    }, 5_000); // Check every 5 seconds
  }

  // --- Preventive Reconnection ---

  private startPreventiveReconnect(): void {
    this.preventiveReconnectInterval = BackgroundTimer.setInterval(() => {
      if (!this.isRunning) return;
      if (!socketService.isConnected()) return;

      console.log('[HealthMonitor] Preventive socket reconnect (scheduled every 5 min)...');
      socketService.refreshConnection();

      // Verify data flow resumes after reconnect
      BackgroundTimer.setTimeout(() => {
        if (!this.isRunning) return;
        if (!socketService.isConnected()) {
          console.log('[HealthMonitor] Socket not reconnected after preventive refresh, retrying...');
          this.callbacks.onRefreshSocket?.();
        } else {
          // Reset failure counters on successful reconnect
          this.state.consecutiveSocketFailures = 0;
          this.state.socketHealthy = true;
          this.notifyStatusChange();
        }
      }, 5_000);
    }, PREVENTIVE_RECONNECT_INTERVAL);
  }

  private startGeminiPreventiveReconnect(): void {
    this.geminiPreventiveReconnectInterval = BackgroundTimer.setInterval(() => {
      if (!this.isRunning) return;
      if (!this.isTranslating) return;
      if (!geminiTranslateService.isConnected()) return;

      console.log('[HealthMonitor] Preventive Gemini WS reconnect (scheduled every 5 min)...');
      this.performSeamlessGeminiReconnect();
    }, PREVENTIVE_RECONNECT_INTERVAL);
  }

  private async performSeamlessGeminiReconnect(): Promise<void> {
    const apiKey = geminiTranslateService.currentApiKey;
    const langCode = geminiTranslateService.currentLangCode;
    if (!apiKey || !langCode) return;

    try {
      await geminiTranslateService.connectOverlap(apiKey, langCode);
      console.log('[HealthMonitor] Gemini WS seamless reconnect successful');
    } catch (error) {
      console.error('[HealthMonitor] Gemini WS seamless reconnect failed:', error);
      // Fall back to full reconnect via callback
      this.callbacks.onReconnectGemini?.();
    }
  }

  // --- Helpers ---

  private notifyStatusChange(): void {
    this.callbacks.onHealthStatusChanged?.(this.getHealthStatus());
  }

  private resetState(): void {
    this.state = {
      socketHealthy: true,
      consecutiveSocketFailures: 0,
      lastHealthCheckSentAt: 0,
      pendingHealthCheckNonce: null,
      isHostStreaming: true,
      lastListenerResyncAt: 0,
      lastMicActivityAt: 0,
      lastTranslationStartedAt: 0,
    };
    this.isMicActive = false;
    this.isTranslating = false;
    this.isMuted = false;
    this.isGeminiReconnecting = false;
    this.lastGeminiReconnectAt = 0;
    this.lastLivekitDataAt = 0;
    this.isLivekitMode = false;
  }
}

export default new ConnectionHealthService();
