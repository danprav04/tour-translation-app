import { useState, useEffect, useRef } from 'react';
import socketService, { ListenerInfo } from '@/services/socketService';
import audioService from '@/services/audioService';
import geminiTranslateService from '@/services/geminiTranslateService';
import { useSettingsContext } from '@/context/SettingsContext';
import foregroundService from '@/services/foregroundService';

const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
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

  const startRoom = async () => {
    try {
      socketService.connect(settings.serverUrl);
      const { roomCode } = await socketService.createRoom();
      setRoomCode(roomCode);
      setIsConnected(true);
      await updateSettings({ lastRoomCode: roomCode });

      await foregroundService.start(
        'TourCast Host Session',
        `Broadcasting room ${roomCode}`
      );

      socketService.onListenerJoined((listener) => {
        setListeners(prev => [...prev, listener]);
      });

      socketService.onListenerLeft((listenerId) => {
        setListeners(prev => prev.filter(l => l.id !== listenerId));
      });

      socketService.onListenerRenamed(({ listenerId, newName }) => {
        setListeners(prev => prev.map(l => l.id === listenerId ? { ...l, name: newName } : l));
      });

    } catch (error) {
      console.error('Failed to start room', error);
      setIsConnected(false);
    }
  };

  const stopRoom = async () => {
    if (isMicActive) {
      await toggleMic();
    }
    if (isTranslating) {
      geminiTranslateService.disconnect();
      setIsTranslating(false);
    }
    socketService.disconnect();
    await foregroundService.stop();
    setIsConnected(false);
    setRoomCode(null);
    setListeners([]);
  };

  const handleAudioChunk = (base64Data: string) => {
    // Block mic audio while TTS is broadcasting
    if (isTTSActiveRef.current) return;

    if (isTranslatingRef.current) {
      geminiTranslateService.sendAudioChunk(base64Data);
    } else {
      const buffer = base64ToArrayBuffer(base64Data);
      socketService.sendAudioChunk(buffer, 16000);
    }
  };

  const toggleMic = async () => {
    if (isMicActive) {
      await audioService.stopCapture();
      setIsMicActive(false);
    } else {
      await audioService.startCapture(handleAudioChunk);
      setIsMicActive(true);
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
        
        // Always broadcast to listeners
        const buffer = base64ToArrayBuffer(translatedBase64);
        socketService.sendAudioChunk(buffer, 24000);
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
    socketService.kickListener(id);
  };

  const renameListener = (id: string, newName: string) => {
    socketService.renameListener(id, newName);
  };

  /**
   * Pause mic stream for TTS broadcast.
   * Remembers whether mic was active so it can be restored.
   */
  const pauseForTTS = async () => {
    wasStreamingBeforeTTSRef.current = isMicActiveRef.current;
    isTTSActiveRef.current = true;
    if (isMicActiveRef.current) {
      await audioService.stopCapture();
      setIsMicActive(false);
    }
  };

  /**
   * Resume mic stream after TTS broadcast ends.
   * Only restarts mic if it was active before TTS started.
   */
  const resumeAfterTTS = async () => {
    isTTSActiveRef.current = false;
    if (wasStreamingBeforeTTSRef.current) {
      await audioService.startCapture(handleAudioChunk);
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
