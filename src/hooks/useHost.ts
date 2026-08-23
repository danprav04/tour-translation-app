import { useState, useEffect, useRef } from 'react';
import { Alert, AppState, Platform, ToastAndroid } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { base64ToUint8Array } from '@/utils/base64';
import geminiTranslateService from '@/services/geminiTranslateService';
import { useSettingsContext } from '@/context/SettingsContext';
import { useDebugContext } from '@/context/DebugContext';
import BackgroundTimer from 'react-native-background-timer';
import NetInfo from '@react-native-community/netinfo';
import { livekitService } from '@/services/livekitService';
import foregroundService from '@/services/foregroundService';
import audioService from '@/services/audioService';
import socketService, { ListenerInfo } from '@/services/socketService';
import connectionHealthService from '@/services/connectionHealthService';
import { useTranscript } from './useTranscript';

const generateRoomCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

export const useHost = () => {
  const { settings, updateSettings } = useSettingsContext();
  const { addDebugEvent, setDebugState } = useDebugContext();
  const transcript = useTranscript();
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [listeners, setListeners] = useState<ListenerInfo[]>([]);
  const [isMicActive, setIsMicActive] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isEchoEnabled, setIsEchoEnabled] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [connectionHealth, setConnectionHealth] = useState<'healthy' | 'degraded' | 'critical'>('healthy');
  const [isReconnectingFromBackground, setIsReconnectingFromBackground] = useState(false);
  const [showLowAudioWarning, setShowLowAudioWarning] = useState(false);
  const selectedLanguage = settings.targetLanguage;
  const selectedLanguageRef = useRef(selectedLanguage);

  useEffect(() => {
    selectedLanguageRef.current = selectedLanguage;
  }, [selectedLanguage]);

  const isTranslatingRef = useRef(isTranslating);
  const isEchoEnabledRef = useRef(isEchoEnabled);
  const [isTTSActive, setIsTTSActive] = useState(false);
  const wasStreamingBeforeTTSRef = useRef(false);
  const isMicActiveRef = useRef(false);
  const reconnectAttempts = useRef(0);
  const isReconnectingGeminiRef = useRef(false);
  const geminiFirstErrorTimeRef = useRef<number | null>(null);

  useEffect(() => {
    isTranslatingRef.current = isTranslating;
    isEchoEnabledRef.current = isEchoEnabled;
  }, [isTranslating, isEchoEnabled]);

  useEffect(() => {
    isMicActiveRef.current = isMicActive;
  }, [isMicActive]);



  const [livekitToken, setLivekitToken] = useState<string | null>(null);
  const [livekitUrl, setLivekitUrl] = useState<string | null>(null);

  useEffect(() => {
    audioService.setAudioLevelCallback((level) => {
      setAudioLevel(level);
    });
    return () => audioService.setAudioLevelCallback(null);
  }, []);

  useEffect(() => {
    setDebugState('hostStreamState', {
      isMicActive,
      isTranslating,
      isEchoEnabled,
      isConnected,
      roomCode,
      isReconnectingFromBackground,
      isTTSActive,
      connectionHealth,
      hasLivekitToken: !!livekitToken,
      hasLivekitUrl: !!livekitUrl
    });
  }, [
    isMicActive, isTranslating, isEchoEnabled, isConnected,
    roomCode, isReconnectingFromBackground, isTTSActive,
    connectionHealth, livekitToken, livekitUrl, setDebugState
  ]);

  useEffect(() => {
    audioService.setAudioRouteFallbackCallback(() => {
      if (Platform.OS === 'android') {
        ToastAndroid.show('Audio route dropped, falling back to default.', ToastAndroid.SHORT);
      } else {
        Alert.alert('Audio Route Failed', 'Could not route audio to preferred device. Falling back to default.');
      }
      addDebugEvent('Audio route fallback triggered');
      updateSettings({ preferredAudioOutput: 'speaker' });
    });
    return () => audioService.setAudioRouteFallbackCallback(null);
  }, [addDebugEvent, updateSettings]);

  // Setup legacy socket listeners
  useEffect(() => {
    if (settings.useLegacyWebSockets && isConnected) {
      socketService.onListenerJoined((listener) => {
        console.log(`[Host] Listener joined: ${listener.name} (${listener.id})`);
        setListeners(prev => {
          if (prev.some(l => l.id === listener.id)) return prev;
          return [...prev, listener];
        });
      });
      socketService.onListenerLeft((listenerId) => {
        console.log(`[Host] Listener left: ${listenerId}`);
        setListeners(prev => prev.filter(l => l.id !== listenerId));
      });
      socketService.onListenerRenamed(({ listenerId, newName }) => {
        console.log(`[Host] Listener renamed: ${listenerId} -> ${newName}`);
        setListeners(prev => prev.map(l => l.id === listenerId ? { ...l, name: newName } : l));
      });
    }
    return () => {
      socketService.off('listener-joined');
      socketService.off('listener-left');
      socketService.off('listener-renamed');
    };
  }, [settings.useLegacyWebSockets, isConnected]);

  const startRoom = async (customRoomCode?: string) => {
    try {
      if (!settings.serverUrl) {
        throw new Error('Server URL is not configured.');
      }
      audioService.setMuted(false); // Ensure host isn't muted from a previous listener session
      if (settings.preferredAudioOutput) {
        audioService.setPreferredAudioOutput(settings.preferredAudioOutput);
      }
      audioService.setMicAmplification(settings.micAmplification ?? 3.0);
      const deviceName = settings.deviceName || 'Host';
      let code = '';

      socketService.connect(settings.serverUrl);
      const res = await socketService.createRoom({ 
        architecture: settings.useLegacyWebSockets ? 'legacy' : 'webrtc',
        existingRoomCode: customRoomCode ? customRoomCode.trim().toUpperCase() : undefined
      });
      code = res.roomCode;

      if (!settings.useLegacyWebSockets) {
        // LIVEKIT MODE
        if (!settings.geminiApiKey) {
          throw new Error('Gemini API key is required for LiveKit mode.');
        }
        const baseUrl = settings.serverUrl.replace(/\/+$/, '');
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(`${baseUrl}/api/livekit/token?roomId=${code}&userId=${encodeURIComponent(deviceName)}&role=host`, {
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error('Failed to fetch LiveKit token from server');
        }

        const data = await response.json();
        
        if (!data.token || !data.wsUrl) {
          throw new Error('Invalid response from server');
        }

        setLivekitToken(data.token);
        setLivekitUrl(data.wsUrl);
      }
      setRoomCode(code);
      setIsConnected(true);
      await AsyncStorage.setItem('activeSession', JSON.stringify({ role: 'host', roomCode: code }));
      await updateSettings({ lastRoomCode: code });

      const hasPermission = await audioService.requestPermissions();
      if (!hasPermission) {
        throw new Error('Microphone permission is required to start a session.');
      }

      await foregroundService.start(
        'TourCast Host Session',
        `Broadcasting room ${code}`,
        'host'
      );

    } catch (error) {
      console.error('Failed to start room', error);
      Alert.alert(
        'Session Failed',
        error instanceof Error ? error.message : 'Failed to start session.'
      );
      setIsConnected(false);
    }
  };

  const stopRoom = async () => {
    addDebugEvent('stopRoom called');
    connectionHealthService.stop();
    // Unconditionally clean up translation state
    isTranslatingRef.current = false;
    geminiTranslateService.disconnect();
    transcript.stopTranscription();
    transcript.clearTranscript();
    setIsTranslating(false);
    
    // Unconditionally stop mic capture to prevent zombie streams
    try {
      await audioService.stopCapture();
    } catch (e) {
      console.error('Error stopping capture in stopRoom', e);
    }
    
    // Unconditionally clean up socket
    socketService.disconnect();

    await foregroundService.stop();
    setIsConnected(false);
    setRoomCode(null);
    setLivekitToken(null);
    setLivekitUrl(null);
    setIsMicActive(false);
    setListeners([]);
    await AsyncStorage.removeItem('activeSession');
  };

  const handleAudioChunk = (base64Data: string) => {
    connectionHealthService.recordMicActivity();
    if (isTranslatingRef.current) {
      // In both legacy and LiveKit mode, if translating, send to Gemini
      geminiTranslateService.sendAudioChunk(base64Data);
      transcript.sendAudioChunk(base64Data);
    } else if (settings.useLegacyWebSockets) {
      // If not translating, only legacy mode broadcasts raw audio chunks
      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      socketService.sendAudioChunk(bytes.buffer, 16000, false);
    }
  };

  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextAppState) => {
      if (nextAppState === 'active' && isMicActiveRef.current) {
        console.log('[Host] App returned to active state. Ensuring connections and mic are capturing.');
        
        setIsReconnectingFromBackground(true);
        
        if (settings.useLegacyWebSockets) {
          if (!socketService.isConnected()) {
            console.log('[Host] Reconnecting socketService after background drop');
            socketService.refreshConnection();
          }
        }
        
        if (isTranslatingRef.current) {
          if (!geminiTranslateService.isConnected() && settings.geminiApiKey) {
            console.log('[Host] Reconnecting Gemini WS after background drop');
            try {
              await geminiTranslateService.connectOverlap(settings.geminiApiKey, settings.targetLanguage, settings.customVoicePromptInjection);
            } catch (e) {
              console.error('[Host] Background reconnect for Gemini failed', e);
            }
          }
        }

        if (settings.useLegacyWebSockets || isTranslatingRef.current) {
          try {
            await audioService.stopCapture();
          } catch (e) {
            console.log('[Host] Error stopping capture on resume', e);
          }
          
          setTimeout(async () => {
             if (isMicActiveRef.current) {
               try {
                 await audioService.startCapture(handleAudioChunk);
               } catch (e) {
                 console.error('[Host] Failed to restart mic after interruption', e);
               }
             }
             setIsReconnectingFromBackground(false);
          }, 500);
        } else {
           setIsReconnectingFromBackground(false);
        }
      }
    });

    return () => subscription.remove();
  }, [settings.useLegacyWebSockets, settings.geminiApiKey, settings.targetLanguage]);

  const toggleMic = async () => {
    if (isMicActive) {
      addDebugEvent('Mic toggled OFF');
      setIsMicActive(false);
      
      const wasTranslating = isTranslatingRef.current;
      if (wasTranslating) {
        stopTranslation();
      }
      if (isEchoEnabledRef.current) {
        setIsEchoEnabled(false);
      }

      // Stop expo-audio capture if we were using legacy websockets OR translating in LiveKit
      if (settings.useLegacyWebSockets || wasTranslating) {
        await audioService.stopCapture();
      }
    } else {
      addDebugEvent('Mic toggled ON');
      setIsMicActive(true);
      // Start expo-audio capture if using legacy websockets OR translating in LiveKit
      if (settings.useLegacyWebSockets || isTranslatingRef.current) {
        await audioService.startCapture(handleAudioChunk);
      }
    }
  };

  const livekitPublisherRef = useRef<(data: string) => void>();
  const setLivekitPublisher = (publisher: ((data: string) => void) | undefined) => {
    livekitPublisherRef.current = publisher;
  };

  const echoSeqRef = useRef(0);


  const startTranslation = async (langCode: string, isReconnect = false) => {
    // Guard against overlapping connection attempts
    if (isReconnectingGeminiRef.current && !isReconnect) return;

    try {
      if (isReconnect) {
        connectionHealthService.setGeminiReconnecting(true);
      } else {
        reconnectAttempts.current = 0;
      }

      if (!settings.geminiApiKey) {
        throw new Error('Gemini API key is not configured. Please add it in Settings.');
      }
      await geminiTranslateService.connect(settings.geminiApiKey, langCode, settings.customVoicePromptInjection);
      
      // Start parallel transcription service
      try {
        if (!isReconnect) {
          console.log('[Host] Starting transcript service...');
          await transcript.startTranscription(settings.geminiApiKey, 'auto', langCode, roomCode || undefined, settings.customTextPromptInjection);
          console.log('[Host] Transcript service started successfully');
        }
      } catch (err) {
        console.error('[Host] Failed to start transcription service', err);
      }
      
      // On success, reset the reconnect flag
      isReconnectingGeminiRef.current = false;
      geminiFirstErrorTimeRef.current = null;
      connectionHealthService.setGeminiReconnecting(false);

      geminiTranslateService.onTranslatedAudio((translatedBase64) => {
        // Reset backoff counter upon receiving valid audio data
        reconnectAttempts.current = 0;
        
        // Play locally if echo is enabled
        if (isEchoEnabledRef.current) {
          echoSeqRef.current += 1;
          audioService.playChunk(translatedBase64, 24000, echoSeqRef.current, Date.now());
        }
        


        // Broadcast to listeners (Legacy)
        if (settings.useLegacyWebSockets) {
          const bytes = base64ToUint8Array(translatedBase64);
          socketService.sendAudioChunk(bytes.buffer, 24000, true);
        } else if (livekitPublisherRef.current) {
          // Broadcast to LiveKit data channel
          livekitPublisherRef.current(translatedBase64);
        }
      });

      const handleDisconnect = async () => {
        if (!isTranslatingRef.current) return; // Intentional disconnect
        if (isReconnectingGeminiRef.current) return; // Already reconnecting

        if (geminiFirstErrorTimeRef.current === null) {
          geminiFirstErrorTimeRef.current = Date.now();
        } else if (Date.now() - geminiFirstErrorTimeRef.current > 30000) {
          console.error('[Host] Gemini failed to reconnect after 30 seconds.');
          addDebugEvent('Translation reconnect timed out after 30s');
          Alert.alert('Translation Error', 'Lost connection to translation service.');
          setIsTranslating(false);
          isTranslatingRef.current = false;
          isReconnectingGeminiRef.current = false;
          geminiFirstErrorTimeRef.current = null;
          connectionHealthService.setGeminiReconnecting(false);
          return;
        }

        isReconnectingGeminiRef.current = true;
        connectionHealthService.setGeminiReconnecting(true);

        console.log('[Host] Gemini disconnected unexpectedly. Reconnecting...');
        addDebugEvent('Translation disconnected, reconnecting...');
        
        // Don't spam reconnects if offline
        const netState = await NetInfo.fetch();
        if (!netState.isConnected) {
           console.log('[Host] Network is offline, waiting before reconnect attempt...');
        }

        if (reconnectAttempts.current < 30) {
          reconnectAttempts.current += 1;
          // Exponential backoff: 2s, 4s, 8s, up to max 30s
          let delay = Math.min(2000 * Math.pow(2, reconnectAttempts.current - 1), 30000);
          if (!netState.isConnected) delay = Math.max(delay, 5000); // at least 5s if offline
          
          BackgroundTimer.setTimeout(() => {
            if (isTranslatingRef.current) {
              startTranslation(selectedLanguageRef.current, true).catch(() => {
                isReconnectingGeminiRef.current = false;
                connectionHealthService.setGeminiReconnecting(false);
              });
            } else {
              isReconnectingGeminiRef.current = false;
              connectionHealthService.setGeminiReconnecting(false);
            }
          }, delay);
        } else {
          console.error('[Host] Gemini failed to reconnect after 30 attempts.');
          addDebugEvent('Translation reconnect failed after 30 attempts');
          Alert.alert('Translation Error', 'Lost connection to translation service.');
          setIsTranslating(false);
          isTranslatingRef.current = false;
          isReconnectingGeminiRef.current = false;
          geminiFirstErrorTimeRef.current = null;
          connectionHealthService.setGeminiReconnecting(false);
        }
      };

      geminiTranslateService.onClose(handleDisconnect);
      geminiTranslateService.onError((err) => {
        console.error('[Host] Gemini API error:', err);
        addDebugEvent(`Gemini API error: ${err.message}`);
        
        // If it's a fatal error (like quota exceeded, invalid request, etc), stop immediately instead of looping.
        const msg = err.message.toLowerCase();
        if (msg.includes('quota') || msg.includes('limit') || msg.includes('unauthorized') || msg.includes('forbidden') || msg.includes('invalid') || msg.includes('bad request')) {
          console.error('[Host] Fatal Gemini error detected. Stopping translation.');
          addDebugEvent('Fatal Gemini error detected. Stopping translation explicitly.');
          Alert.alert('Translation Error', `Failed to translate: ${err.message}`);
          
          if (isTranslatingRef.current) {
            stopTranslation();
          }
        }
      });

      setIsTranslating(true);
      isTranslatingRef.current = true;
      connectionHealthService.updateTranslationStartTime(Date.now());
      
      // If LiveKit mode and the mic is on, we need to take over the mic from LiveKit
      // Wait for the LocalMicController to release the mic, with exponential backoff retries
      if (!settings.useLegacyWebSockets && isMicActiveRef.current) {
        addDebugEvent('Initiating mic takeover for translation');
        let attempts = 0;
        const tryTakeover = async () => {
          try {
            await audioService.startCapture(handleAudioChunk);
            addDebugEvent(`Mic takeover succeeded on attempt ${attempts + 1}`);
          } catch (e) {
            attempts++;
            if (attempts < 10) {
              const delay = 300 * Math.pow(1.5, attempts - 1); 
              addDebugEvent(`Mic takeover failed, retrying in ${Math.round(delay)}ms...`);
              setTimeout(tryTakeover, delay);
            } else {
              console.error('Failed to take over mic after 10 attempts', e);
              addDebugEvent('Fatal: Mic takeover failed after 10 attempts');
            }
          }
        };
        setTimeout(tryTakeover, 400); // Increased initial delay
      }

      addDebugEvent('Translation started successfully');
    } catch (error) {
      isReconnectingGeminiRef.current = false;
      connectionHealthService.setGeminiReconnecting(false);
      console.error('Failed to start translation', error);
      addDebugEvent(`Translation failed to start: ${error instanceof Error ? error.message : String(error)}`);
      setIsTranslating(false);
    }
  };

  // Connection health monitoring
  useEffect(() => {
    if (!isConnected || !roomCode) return;

    connectionHealthService.registerCallbacks({
      onRestartMic: async () => {
        console.log('[HealthMonitor] Restarting mic capture...');
        try {
          await audioService.stopCapture();
          await new Promise(resolve => setTimeout(resolve, 500));
          if (isMicActiveRef.current) {
            await audioService.startCapture(handleAudioChunk);
          }
        } catch (e) {
          console.error('[HealthMonitor] Mic restart failed:', e);
        }
      },
      onMicFatalError: () => {
        console.log('[HealthMonitor] Mic fatal error triggered. Shutting down translation...');
        addDebugEvent('Mic fatally disconnected in background. Stopping translation explicitly.');
        setIsMicActive(false);
        if (isTranslatingRef.current) {
          stopTranslation();
        }
        if (isEchoEnabledRef.current) {
          setIsEchoEnabled(false);
        }
        if (Platform.OS === 'android') {
          ToastAndroid.show('Microphone interrupted by system. Translation stopped.', ToastAndroid.LONG);
        }
      },
      onReconnectGemini: async () => {
        if (!isTranslatingRef.current || isReconnectingGeminiRef.current) return;
        console.log('[HealthMonitor] Reconnecting Gemini...');
        isReconnectingGeminiRef.current = true;
        connectionHealthService.setGeminiReconnecting(true);
        try {
          geminiTranslateService.disconnect();
          await startTranslation(settings.targetLanguage, true);
        } catch (e) {
          isReconnectingGeminiRef.current = false;
          connectionHealthService.setGeminiReconnecting(false);
          console.error('[HealthMonitor] Gemini reconnect failed:', e);
        }
      },
      onRefreshSocket: () => {
        console.log('[HealthMonitor] Refreshing socket...');
        addDebugEvent('Standard socket refresh triggered');
        socketService.refreshConnection();
      },
      onSignalingSocketRecovery: async () => {
        addDebugEvent('Signaling socket recovery triggered');
        console.log('[Host] Layered socket recovery started...');
        try {
          socketService.refreshConnection();
          // Small delay to let transport connect
          await new Promise(resolve => setTimeout(resolve, 500));
          
          if (roomCode) {
            console.log('[Host] Reclaiming room on server...');
            addDebugEvent(`Reclaiming room ${roomCode}`);
            const res = await socketService.createRoom({
              architecture: settings.useLegacyWebSockets ? 'legacy' : 'webrtc',
              existingRoomCode: roomCode
            });
            addDebugEvent(`Room reclaimed: ${res.roomCode}`);
          }
        } catch (e) {
           console.error('[Host] Fatal: Could not recover signaling', e);
           addDebugEvent(`Fatal signaling recovery error: ${e}`);
           Alert.alert('Connection Lost', 'Unable to recover connection to server. Session ended.');
           stopRoom();
        }
      },
      onHealthStatusChanged: (status) => {
        setConnectionHealth(status);
      },
    });

    connectionHealthService.startHostMonitoring(roomCode, settings.useLegacyWebSockets);

    return () => {
      connectionHealthService.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, roomCode]);

  // Keep health monitor in sync with streaming state
  useEffect(() => {
    connectionHealthService.updateMicState(isMicActive);
  }, [isMicActive]);

  useEffect(() => {
    connectionHealthService.updateTranslationState(isTranslating);
  }, [isTranslating]);

  useEffect(() => {
    foregroundService.updateHostState({
      isMicActive,
      isTranslating,
      targetLanguage: selectedLanguage
    });
  }, [isMicActive, isTranslating, selectedLanguage]);

  useEffect(() => {
    let lowAudioTimer: NodeJS.Timeout;
    if (isMicActive && audioLevel < 0.05) {
      lowAudioTimer = setTimeout(() => {
        setShowLowAudioWarning(true);
      }, 10000);
    } else {
      setShowLowAudioWarning(false);
    }
    return () => clearTimeout(lowAudioTimer);
  }, [isMicActive, audioLevel]);

  async function stopTranslation() {
    addDebugEvent('stopTranslation called');
    isTranslatingRef.current = false;
    isReconnectingGeminiRef.current = false;
    connectionHealthService.setGeminiReconnecting(false);
    geminiTranslateService.disconnect();
    transcript.stopTranscription();
    setIsTranslating(false);
    
    // If LiveKit mode and the mic is on, stop our manual capture so LiveKit can take it back
    if (!settings.useLegacyWebSockets && isMicActiveRef.current) {
      await audioService.stopCapture();
    }
  }

  const toggleTranslation = async () => {
    if (isTranslating) {
      stopTranslation();
    } else {
      await startTranslation(selectedLanguage);
    }
  };

  const toggleEcho = () => {
    setIsEchoEnabled(prev => !prev);
  };

  const setLanguage = async (code: string) => {
    await updateSettings({ targetLanguage: code });
    if (isTranslating) {
      stopTranslation();
      await startTranslation(code);
    }
  };

  const kickListener = (id: string) => {
    if (settings.useLegacyWebSockets) {
      socketService.kickListener(id);
    }
  };

  const renameListener = (id: string, newName: string) => {
    if (settings.useLegacyWebSockets) {
      socketService.renameListener(id, newName);
    }
  };

  const pauseForTTS = async () => {
    wasStreamingBeforeTTSRef.current = isMicActiveRef.current;
    setIsTTSActive(true);
    if (isMicActiveRef.current) {
      setIsMicActive(false);
      if (settings.useLegacyWebSockets) {
        await audioService.stopCapture();
      }
    }
  };

  /**
   * Resume mic stream after TTS broadcast ends.
   */
  const resumeAfterTTS = async () => {
    setIsTTSActive(false);
    if (wasStreamingBeforeTTSRef.current) {
      setIsMicActive(true);
      if (settings.useLegacyWebSockets) {
        await audioService.startCapture(handleAudioChunk);
      }
      wasStreamingBeforeTTSRef.current = false;
    }
  };

  const refreshConnection = () => {
    addDebugEvent('Manual connection refresh triggered');
    socketService.refreshConnection();
  };

  useEffect(() => {
    return () => {
      stopRoom();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    transcript,
    roomCode,
    livekitToken,
    livekitUrl,
    listeners,
    isMicActive,
    isTranslating,
    isEchoEnabled,
    setIsEchoEnabled,
    isConnected,
    selectedLanguage,
    startRoom,
    stopRoom,
    toggleMic,
    toggleTranslation,
    toggleEcho,
    startTranslation,
    setLanguage,
    kickListener,
    renameListener,
    pauseForTTS,
    resumeAfterTTS,
    isTTSActive,
    setLivekitPublisher,
    audioLevel,
    setAudioLevel,
    connectionHealth,
    isReconnectingFromBackground,
    showLowAudioWarning,
    refreshConnection,
  };
};
