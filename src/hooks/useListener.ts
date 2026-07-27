import { useState, useEffect } from 'react';
import { useSettingsContext } from '@/context/SettingsContext';
import foregroundService from '@/services/foregroundService';
import audioService from '@/services/audioService';
import socketService from '@/services/socketService';

export const useListener = () => {
  const { settings, updateSettings } = useSettingsContext();
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
      
      if (settings.useLegacyWebSockets) {
        socketService.connect(settings.serverUrl);
        await socketService.joinRoom(code, deviceName);
        await audioService.enablePlaybackMode();
        audioService.setMuted(isMuted);
      } else {
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
        
        setLivekitToken(data.token);
        setLivekitUrl(data.wsUrl);
      }
      
      await foregroundService.start(
        'TourCast Listener',
        `Listening to room ${code}`
      );

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
    if (settings.useLegacyWebSockets) {
      socketService.disconnect();
      audioService.setMuted(true); // Effectively pauses/clears playlist
    }
    await foregroundService.stop();
    setIsConnected(false);
    setRoomCode(null);
    setLivekitToken(null);
    setLivekitUrl(null);
  };

  useEffect(() => {
    if (settings.useLegacyWebSockets) {
      socketService.onKicked(() => {
        disconnect();
      });
      socketService.onRenamed(({ newName }) => {
        updateSettings({ deviceName: newName });
      });
      socketService.onRoomClosed(() => {
        disconnect();
      });
      socketService.onAudioData((data, sampleRate, seq, timestamp) => {
        const base64Data = btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(data))));
        audioService.playChunk(base64Data, sampleRate, seq, timestamp);
      });
    }
    return () => {
      socketService.removeAllListeners();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.useLegacyWebSockets]);

  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (settings.useLegacyWebSockets) {
      audioService.setMuted(!isMuted);
    }
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
