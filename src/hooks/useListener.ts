import { useState, useEffect } from 'react';
import { useSettingsContext } from '@/context/SettingsContext';
import foregroundService from '@/services/foregroundService';

export const useListener = () => {
  const { settings } = useSettingsContext();
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  
  const [livekitToken, setLivekitToken] = useState<string | null>(null);
  const [livekitUrl, setLivekitUrl] = useState<string | null>(null);

  const connect = async (code: string) => {
    try {
      setIsReconnecting(true);
      if (!settings.serverUrl) {
        throw new Error('Server URL is not configured. Please set it in Settings first.');
      }

      const deviceName = settings.deviceName || 'Listener';
      
      const baseUrl = settings.serverUrl.replace(/\/+$/, '');
      const response = await fetch(`${baseUrl}/api/livekit/token?roomId=${code}&userId=${encodeURIComponent(deviceName)}&role=listener`);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch token (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      
      if (!data.token || !data.wsUrl) {
        throw new Error('Invalid response from server');
      }
      
      await foregroundService.start(
        'TourCast Listener',
        `Listening to room ${code}`
      );

      setLivekitToken(data.token);
      setLivekitUrl(data.wsUrl);
      setRoomCode(code);
      setIsConnected(true);
      setIsReconnecting(false);

    } catch (error) {
      console.error('Failed to connect to room', error);
      setIsConnected(false);
      setIsReconnecting(false);
      throw error;
    }
  };

  const disconnect = async () => {
    await foregroundService.stop();
    setIsConnected(false);
    setRoomCode(null);
    setLivekitToken(null);
    setLivekitUrl(null);
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
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
    connect,
    disconnect,
    toggleMute
  };
};
