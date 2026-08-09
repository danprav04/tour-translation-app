import { useState, useEffect, useRef } from 'react';
import { Alert, AppState, Platform, ToastAndroid } from 'react-native';
import { base64ToUint8Array } from '@/utils/base64';
import geminiTranslateService from '@/services/geminiTranslateService';
import { useSettingsContext } from '@/context/SettingsContext';
import { useDebugContext } from '@/context/DebugContext';
import foregroundService from '@/services/foregroundService';
import audioService from '@/services/audioService';
import socketService, { ListenerInfo } from '@/services/socketService';
import { AndroidForegroundServiceType } from '@notifee/react-native';
import connectionHealthService from '@/services/connectionHealthService';

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
  const { addDebugEvent } = useDebugContext();
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
      await updateSettings({ lastRoomCode: code });

      const hasPermission = await audioService.requestPermissions();
      if (!hasPermission) {
        throw new Error('Microphone permission is required to start a session.');
      }

      await foregroundService.start(
        'TourCast Host Session',
        `Broadcasting room ${code}`,
        [
          AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_MICROPHONE,
          AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
        ]
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
    connectionHealthService.stop();
    if (isTranslating) {
      isTranslatingRef.current = false;
      geminiTranslateService.disconnect();
      audioService.stopKeepAlive();
      setIsTranslating(false);
    }
    if (isMicActiveRef.current && settings.useLegacyWebSockets) {
      await audioService.stopCapture();
    }
    if (settings.useLegacyWebSockets) {
      socketService.disconnect();
    }
    await foregroundService.stop();
    setIsConnected(false);
    setRoomCode(null);
    setLivekitToken(null);
    setLivekitUrl(null);
    setIsMicActive(false);
    setListeners([]);
  };

  const handleAudioChunk = (base64Data: string) => {
    connectionHealthService.recordMicActivity();
    if (isTranslatingRef.current) {
      // In both legacy and LiveKit mode, if translating, send to Gemini
      geminiTranslateService.sendAudioChunk(base64Data);
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
              await geminiTranslateService.connectOverlap(settings.geminiApiKey, settings.targetLanguage);
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


  const startTranslation = async (langCode: string) => {
    try {
      if (!settings.geminiApiKey) {
        throw new Error('Gemini API key is not configured. Please add it in Settings.');
      }
      await geminiTranslateService.connect(settings.geminiApiKey, langCode);
      geminiTranslateService.onTranslatedAudio((translatedBase64) => {
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

      const handleDisconnect = () => {
        if (!isTranslatingRef.current) return; // Intentional disconnect

        console.log('[Host] Gemini disconnected unexpectedly. Reconnecting...');
        addDebugEvent('Translation disconnected, reconnecting...');
        if (reconnectAttempts.current < 30) {
          reconnectAttempts.current += 1;
          // Exponential backoff: 2s, 4s, 8s, up to max 30s
          const delay = Math.min(2000 * Math.pow(2, reconnectAttempts.current - 1), 30000);
          setTimeout(() => {
            if (isTranslatingRef.current) {
              startTranslation(selectedLanguageRef.current);
            }
          }, delay);
        } else {
          console.error('[Host] Gemini failed to reconnect after 30 attempts.');
          addDebugEvent('Translation reconnect failed after 30 attempts');
          Alert.alert('Translation Error', 'Lost connection to translation service.');
          setIsTranslating(false);
          isTranslatingRef.current = false;
        }
      };

      geminiTranslateService.onClose(handleDisconnect);
      geminiTranslateService.onError((err) => {
        console.error('[Host] Gemini API error:', err);
        // Error usually precedes close, handleDisconnect will manage retries.
      });

      setIsTranslating(true);
      isTranslatingRef.current = true;
      reconnectAttempts.current = 0;
      connectionHealthService.updateTranslationStartTime(Date.now());
      
      // If LiveKit mode and the mic is on, we need to take over the mic from LiveKit
      // Wait for the LocalMicController to release the mic, with exponential backoff retries
      if (!settings.useLegacyWebSockets && isMicActiveRef.current) {
        let attempts = 0;
        const tryTakeover = async () => {
          try {
            await audioService.startCapture(handleAudioChunk);
          } catch (e) {
            attempts++;
            if (attempts < 5) {
              const delay = 200 * Math.pow(2, attempts - 1); // 200, 400, 800, 1600ms
              setTimeout(tryTakeover, delay);
            } else {
              console.error('Failed to take over mic after 5 attempts', e);
            }
          }
        };
        setTimeout(tryTakeover, 200);
      }

      audioService.startKeepAlive();
      addDebugEvent('Translation started successfully');
    } catch (error) {
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
      onReconnectGemini: async () => {
        if (!isTranslatingRef.current) return;
        console.log('[HealthMonitor] Reconnecting Gemini...');
        try {
          geminiTranslateService.disconnect();
          await startTranslation(settings.targetLanguage);
        } catch (e) {
          console.error('[HealthMonitor] Gemini reconnect failed:', e);
        }
      },
      onRefreshSocket: () => {
        console.log('[HealthMonitor] Refreshing socket...');
        socketService.refreshConnection();
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

  const stopTranslation = async () => {
    isTranslatingRef.current = false;
    geminiTranslateService.disconnect();
    audioService.stopKeepAlive();
    setIsTranslating(false);
    
    // If LiveKit mode and the mic is on, stop our manual capture so LiveKit can take it back
    if (!settings.useLegacyWebSockets && isMicActiveRef.current) {
      await audioService.stopCapture();
    }
  };

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

  useEffect(() => {
    return () => {
      stopRoom();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
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
  };
};
