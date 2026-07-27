import { useState, useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import geminiTranslateService from '@/services/geminiTranslateService';
import { useSettingsContext } from '@/context/SettingsContext';
import foregroundService from '@/services/foregroundService';
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
  const isTTSActiveRef = useRef(false);
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

  const startRoom = async () => {
    try {
      const code = generateRoomCode();
      const deviceName = settings.deviceName || 'Host';

      const response = await fetch(`${settings.serverUrl}/api/livekit/token?roomId=${code}&userId=${encodeURIComponent(deviceName)}&role=host`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch LiveKit token from server');
      }

      const data = await response.json();
      
      if (!data.token || !data.wsUrl) {
        throw new Error('Invalid response from server');
      }

      setLivekitToken(data.token);
      setLivekitUrl(data.wsUrl);
      setRoomCode(code);
      setIsConnected(true);
      await updateSettings({ lastRoomCode: code });

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
    await foregroundService.stop();
    setIsConnected(false);
    setRoomCode(null);
    setLivekitToken(null);
    setLivekitUrl(null);
    setIsMicActive(false);
  };

  const handleAudioChunk = (base64Data: string) => {
    // Translation will be handled differently with LiveKit, stubbed out for now
  };

  const toggleMic = async () => {
    setIsMicActive(!isMicActive);
  };

  const startTranslation = async (langCode: string) => {
    try {
      await geminiTranslateService.connect(settings.geminiApiKey, langCode);
      geminiTranslateService.onTranslatedAudio((translatedBase64) => {
        // Play locally if echo is enabled
        if (isEchoEnabledRef.current) {
          audioService.playChunk(translatedBase64, 24000);
        }
        
        // Always broadcast to listeners
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
    // TODO: Implement kick via LiveKit server API or Data channel
  };

  const renameListener = (id: string, newName: string) => {
    // Handled by participant metadata in LiveKit
  };

  /**
   * Pause mic stream for TTS broadcast.
   */
  const pauseForTTS = async () => {
    wasStreamingBeforeTTSRef.current = isMicActiveRef.current;
    isTTSActiveRef.current = true;
    if (isMicActiveRef.current) {
      setIsMicActive(false);
    }
  };

  /**
   * Resume mic stream after TTS broadcast ends.
   */
  const resumeAfterTTS = async () => {
    isTTSActiveRef.current = false;
    if (wasStreamingBeforeTTSRef.current) {
      setIsMicActive(true);
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
    isTTSActive: isTTSActiveRef.current,
  };
};
