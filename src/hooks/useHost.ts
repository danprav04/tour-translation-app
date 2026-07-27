import { useState, useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import geminiTranslateService from '@/services/geminiTranslateService';
import { useSettingsContext } from '@/context/SettingsContext';
import foregroundService from '@/services/foregroundService';
import audioService from '@/services/audioService';
import socketService, { ListenerInfo } from '@/services/socketService';
import { AndroidForegroundServiceType } from '@notifee/react-native';

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
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [listeners, setListeners] = useState<ListenerInfo[]>([]);
  const [isMicActive, setIsMicActive] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isEchoEnabled, setIsEchoEnabled] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const selectedLanguage = settings.targetLanguage;

  const isTranslatingRef = useRef(isTranslating);
  const isEchoEnabledRef = useRef(isEchoEnabled);
  const [isTTSActive, setIsTTSActive] = useState(false);
  const wasStreamingBeforeTTSRef = useRef(false);
  const isMicActiveRef = useRef(false);

  useEffect(() => {
    isTranslatingRef.current = isTranslating;
    isEchoEnabledRef.current = isEchoEnabled;
  }, [isTranslating, isEchoEnabled]);

  useEffect(() => {
    isMicActiveRef.current = isMicActive;
  }, [isMicActive]);

  const [livekitToken, setLivekitToken] = useState<string | null>(null);
  const [livekitUrl, setLivekitUrl] = useState<string | null>(null);

  // Setup legacy socket listeners
  useEffect(() => {
    if (settings.useLegacyWebSockets && isConnected) {
      socketService.onListenerJoined((listener) => {
        console.log(`[Host] Listener joined: ${listener.name} (${listener.id})`);
        setListeners(prev => [...prev, listener]);
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

  const startRoom = async () => {
    try {
      if (!settings.serverUrl) {
        throw new Error('Server URL is not configured.');
      }
      const deviceName = settings.deviceName || 'Host';
      let code = '';

      if (settings.useLegacyWebSockets) {
        // LEGACY SOCKET.IO MODE
        socketService.connect(settings.serverUrl);
        const res = await socketService.createRoom();
        code = res.roomCode;
      } else {
        // LIVEKIT MODE
        code = generateRoomCode();
        const baseUrl = settings.serverUrl.replace(/\/+$/, '');
        const response = await fetch(`${baseUrl}/api/livekit/token?roomId=${code}&userId=${encodeURIComponent(deviceName)}&role=host`);
        
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
    if (isTranslating) {
      geminiTranslateService.disconnect();
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
    if (settings.useLegacyWebSockets) {
      if (isTranslatingRef.current) {
        geminiTranslateService.sendAudioChunk(base64Data);
      } else {
        const binaryString = atob(base64Data);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        socketService.sendAudioChunk(bytes.buffer, 16000, false);
      }
    }
  };

  const toggleMic = async () => {
    if (isMicActive) {
      setIsMicActive(false);
      if (settings.useLegacyWebSockets) {
        await audioService.stopCapture();
      }
    } else {
      setIsMicActive(true);
      if (settings.useLegacyWebSockets) {
        await audioService.startCapture(handleAudioChunk);
      }
    }
  };

  const startTranslation = async (langCode: string) => {
    try {
      await geminiTranslateService.connect(settings.geminiApiKey, langCode);
      geminiTranslateService.onTranslatedAudio((translatedBase64) => {
        // Play locally if echo is enabled
        if (isEchoEnabledRef.current) {
          audioService.playChunk(translatedBase64, 24000);
        }
        
        // Broadcast to listeners (Legacy)
        if (settings.useLegacyWebSockets) {
          const binaryString = atob(translatedBase64);
          const len = binaryString.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          socketService.sendAudioChunk(bytes.buffer, 24000, true);
        }
        // TODO: LiveKit translation broadcasting logic
      });
      setIsTranslating(true);
    } catch (error) {
      console.error('Failed to start translation', error);
      setIsTranslating(false);
    }
  };

  const stopTranslation = () => {
    geminiTranslateService.disconnect();
    setIsTranslating(false);
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
  };
};
