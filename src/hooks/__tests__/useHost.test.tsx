import { renderHook, act } from '@testing-library/react-native';
import { useHost } from '../useHost';
import { SettingsContext } from '@/context/SettingsContext';
import React from 'react';
import socketService from '@/services/socketService';
import foregroundService from '@/services/foregroundService';
import audioService from '@/services/audioService';

jest.mock('@/services/socketService', () => ({
  connect: jest.fn(),
  disconnect: jest.fn(),
  createRoom: jest.fn().mockResolvedValue({ roomCode: 'ABCDEF', roomId: '123' }),
  onListenerJoined: jest.fn(),
  onListenerLeft: jest.fn(),
  onListenerRenamed: jest.fn(),
  off: jest.fn(),
  sendAudioChunk: jest.fn(),
}));

jest.mock('@/services/foregroundService', () => ({
  start: jest.fn().mockResolvedValue(true),
  stop: jest.fn().mockResolvedValue(true),
}));

jest.mock('@/services/audioService', () => ({
  setAudioLevelCallback: jest.fn(),
  setMuted: jest.fn(),
  requestPermissions: jest.fn().mockResolvedValue(true),
  startCapture: jest.fn().mockResolvedValue(true),
  stopCapture: jest.fn().mockResolvedValue(true),
}));

const mockSettings = {
  serverUrl: 'http://localhost',
  deviceName: 'HostDevice',
  useLegacyWebSockets: true,
  geminiApiKey: '',
  targetLanguage: 'en',
  translatorVoice: 'Aoede',
  noiseCancellation: true,
  autoGainControl: true,
  echoCancellation: true,
};

const updateSettingsMock = jest.fn();

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <SettingsContext.Provider value={{ settings: mockSettings, updateSettings: updateSettingsMock } as any}>
    {children}
  </SettingsContext.Provider>
);

describe('useHost Hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize correctly', () => {
    const { result } = renderHook(() => useHost(), { wrapper });
    expect(result.current.roomCode).toBeNull();
    expect(result.current.isConnected).toBe(false);
  });

  it('should start room using legacy websockets', async () => {
    const { result } = renderHook(() => useHost(), { wrapper });
    
    await act(async () => {
      await result.current.startRoom();
    });

    expect(socketService.connect).toHaveBeenCalledWith('http://localhost');
    expect(socketService.createRoom).toHaveBeenCalledWith({ architecture: 'legacy' });
    expect(result.current.roomCode).toBe('ABCDEF');
    expect(result.current.isConnected).toBe(true);
    expect(foregroundService.start).toHaveBeenCalled();
  });

  it('should toggle mic', async () => {
    const { result } = renderHook(() => useHost(), { wrapper });
    
    await act(async () => {
      await result.current.toggleMic();
    });
    
    expect(result.current.isMicActive).toBe(true);
    expect(audioService.startCapture).toHaveBeenCalled();

    await act(async () => {
      await result.current.toggleMic();
    });

    expect(result.current.isMicActive).toBe(false);
    expect(audioService.stopCapture).toHaveBeenCalled();
  });

  it('should stop room', async () => {
    const { result } = renderHook(() => useHost(), { wrapper });
    
    await act(async () => {
      await result.current.startRoom();
      await result.current.stopRoom();
    });

    expect(socketService.disconnect).toHaveBeenCalled();
    expect(foregroundService.stop).toHaveBeenCalled();
    expect(result.current.isConnected).toBe(false);
    expect(result.current.roomCode).toBeNull();
  });
});
