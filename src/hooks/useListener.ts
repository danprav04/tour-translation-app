import { useState, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSettingsContext } from '@/context/SettingsContext';
import { useDebugContext } from '@/context/DebugContext';
import foregroundService from '@/services/foregroundService';
import { uint8ArrayToBase64 } from '@/utils/base64';
import audioService from '@/services/audioService';
import socketService from '@/services/socketService';
import connectionHealthService from '@/services/connectionHealthService';

export const useListener = () => {
  const { settings, updateSettings } = useSettingsContext();
  const { setDebugState } = useDebugContext();
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [isStandby, setIsStandby] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  
  const [livekitToken, setLivekitToken] = useState<string | null>(null);
  const [livekitUrl, setLivekitUrl] = useState<string | null>(null);
  const [isHostStreaming, setIsHostStreaming] = useState(true);
  const [hostStatus, setHostStatus] = useState<'connected' | 'disconnected'>('connected');
  const isMutedRef = useRef(false);

  useEffect(() => {
    audioService.setAudioLevelCallback((level) => {
      setAudioLevel(level);
    });
    return () => audioService.setAudioLevelCallback(null);
  }, []);

  useEffect(() => {
    setDebugState('listenerStreamState', {
      isConnected,
      isMuted,
      roomCode,
      isReconnecting,
      isStandby,
      isStandby,
      isHostStreaming,
      hostStatus,
      hasLivekitToken: !!livekitToken,
      hasLivekitUrl: !!livekitUrl
    });
  }, [
    isConnected, isMuted, roomCode, isReconnecting, 
    isStandby, isHostStreaming, hostStatus, livekitToken, livekitUrl, setDebugState
  ]);

  useEffect(() => {
    isMutedRef.current = isMuted;
    connectionHealthService.updateMuteState(isMuted);
  }, [isMuted]);
  const isConnectingRef = useRef(false);

  const connect = async (code: string) => {
    if (isConnectingRef.current) return;
    isConnectingRef.current = true;
    try {
      setIsReconnecting(true);
      if (!settings.serverUrl) {
        throw new Error('Server URL is not configured. Please set it in Settings first.');
      }
      
      setIsHostStreaming(true);

      // Restore persisted audio output preference
      if (settings.preferredAudioOutput) {
        audioService.setPreferredAudioOutput(settings.preferredAudioOutput);
      }

      const deviceName = settings.deviceName || 'Listener';
      
      if (settings.useLegacyWebSockets) {
        socketService.connect(settings.serverUrl);
        await socketService.joinRoom(code, deviceName);
        await audioService.enablePlaybackMode();
        audioService.setMuted(isMuted);
      } else {
        const baseUrl = settings.serverUrl.replace(/\/+$/, '');
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(`${baseUrl}/api/livekit/token?roomId=${code}&userId=${encodeURIComponent(deviceName)}&role=listener`, {
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to fetch token (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        
        if (!data.token || !data.wsUrl) {
          throw new Error('Invalid response from server');
        }
        
        setLivekitToken(data.token);
        setLivekitUrl(data.wsUrl);
      }
      
      await foregroundService.start(
        'TourCast Listener',
        `Listening to room ${code}`,
        'listener'
      );

      setRoomCode(code);
      setIsConnected(true);
      setIsReconnecting(false);
      await AsyncStorage.setItem('activeSession', JSON.stringify({ role: 'listener', roomCode: code }));

    } catch (error) {
      console.error('Failed to connect to room', error);
      setIsConnected(false);
      setIsReconnecting(false);
      throw error;
    } finally {
      isConnectingRef.current = false;
    }
  };

  const enterStandby = async () => {
    if (!roomCode) return;
    console.log('[Listener] Entering standby mode...');
    connectionHealthService.stop();
    if (settings.useLegacyWebSockets) {
      socketService.disconnect();
      audioService.setMuted(true);
    }
    setLivekitToken(null);
    setLivekitUrl(null);
    setIsConnected(false);
    setIsStandby(true);
    setHostStatus('connected'); // Reset for next connection
  };

  const disconnect = async () => {
    connectionHealthService.stop();
    if (settings.useLegacyWebSockets) {
      socketService.disconnect();
      audioService.setMuted(true); // Effectively pauses/clears playlist
    }
    await foregroundService.stop();
    setIsConnected(false);
    setIsStandby(false);
    setRoomCode(null);
    setLivekitToken(null);
    setLivekitUrl(null);
    setHostStatus('connected');
    await AsyncStorage.removeItem('activeSession');
  };

  useEffect(() => {
    if (settings.useLegacyWebSockets && isConnected) {
      socketService.onKicked(() => {
        console.log('[Listener] Kicked from room');
        disconnect();
      });
      socketService.onRenamed(({ newName }) => {
        console.log(`[Listener] Renamed to: ${newName}`);
        updateSettings({ deviceName: newName });
      });
      socketService.onRoomClosed(() => {
        console.log('[Listener] Room closed by host');
        enterStandby();
      });
      socketService.onHostDisconnected(() => {
        console.log('[Listener] Host disconnected unexpectedly');
        setHostStatus('disconnected');
      });
      socketService.onHostReconnected(() => {
        console.log('[Listener] Host reconnected successfully');
        setHostStatus('connected');
      });
      socketService.onAudioData((data, sampleRate, seq, timestamp) => {
        // console.log(`[Listener] Received audio chunk seq=${seq}`); // too noisy
        const base64Data = uint8ArrayToBase64(new Uint8Array(data));
        audioService.playChunk(base64Data, sampleRate, seq, timestamp);
      });
    }
    return () => {
      socketService.off('kicked');
      socketService.off('renamed');
      socketService.off('room-closed');
      socketService.off('host-disconnected');
      socketService.off('host-reconnected');
      socketService.off('audio-data');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.useLegacyWebSockets, isConnected]);

  // Connection health monitoring
  useEffect(() => {
    if (!isConnected || !roomCode) return;

    connectionHealthService.registerCallbacks({
      onRefreshSocket: () => {
        console.log('[HealthMonitor] Refreshing listener socket...');
        socketService.refreshConnection();
      },
      onHostStreamingChanged: (streaming) => {
        setIsHostStreaming(streaming);
      },
      onHealthStatusChanged: (status) => {
        console.log('[HealthMonitor] Listener health status:', status);
      },
    });

    connectionHealthService.startListenerMonitoring(roomCode, settings.useLegacyWebSockets);

    return () => {
      connectionHealthService.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, roomCode]);

  // Standby and Room Health Polling
  useEffect(() => {
    if (!roomCode || !settings.serverUrl) return;
    
    const interval = setInterval(async () => {
      try {
        const baseUrl = settings.serverUrl.replace(/\/+$/, '');
        const res = await fetch(`${baseUrl}/room/${roomCode}`);
        const data = await res.json();
        
        if (isConnected && !data.exists) {
          console.log('[Listener] Room no longer exists on server. Entering standby...');
          enterStandby();
        } else if (isStandby && data.exists) {
          console.log('[Listener] Host recreated room! Reconnecting...');
          setIsStandby(false);
          connect(roomCode);
        }
      } catch (e) {
        // Ignore network errors
      }
    }, 4000);
    
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, isConnected, isStandby, settings.serverUrl]);

  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (settings.useLegacyWebSockets) {
      audioService.setMuted(!isMuted);
    }
  };

  const refreshConnection = () => {
    socketService.refreshConnection();
  };

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []);

  return {
    isConnected,
    isMuted,
    roomCode,
    livekitToken,
    livekitUrl,
    isReconnecting,
    isStandby,
    isHostStreaming,
    connect,
    disconnect,
    toggleMute,
    audioLevel,
    refreshConnection,
    hostStatus
  };
};
