import { useState, useEffect } from 'react';
import socketService from '@/services/socketService';
import audioService from '@/services/audioService';
import { useSettingsContext } from '@/context/SettingsContext';

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

export const useListener = () => {
  const { settings } = useSettingsContext();
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);

  const connect = async (code: string) => {
    try {
      socketService.connect(settings.serverUrl);
      await socketService.joinRoom(code, 'Listener Device');
      
      // Request audio mode so playback works in the background
      await audioService.enablePlaybackMode();

      setRoomCode(code);
      setIsConnected(true);
      setIsReconnecting(false);

      socketService.onAudioData((data: ArrayBuffer, sampleRate: number) => {
        if (!isMuted) {
          const base64Str = arrayBufferToBase64(data);
          audioService.playChunk(base64Str, sampleRate || 16000); // Fallback to 16000 if not provided
        }
      });

      socketService.onRoomClosed(() => {
        disconnect();
      });

      socketService.onKicked(() => {
        disconnect();
      });

    } catch (error) {
      console.error('Failed to connect to room', error);
      setIsConnected(false);
      setIsReconnecting(false);
      throw error;
    }
  };

  const disconnect = () => {
    socketService.disconnect();
    setIsConnected(false);
    setRoomCode(null);
  };

  const toggleMute = () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    audioService.setMuted(newMuted);
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
    isReconnecting,
    connect,
    disconnect,
    toggleMute
  };
};
