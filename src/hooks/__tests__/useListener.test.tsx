import { renderHook, act } from '@testing-library/react-native';
import { useListener } from '../useListener';
import { SettingsContext } from '@/context/SettingsContext';
import React from 'react';
import socketService from '@/services/socketService';
import foregroundService from '@/services/foregroundService';
import audioService from '@/services/audioService';

jest.mock('@/services/socketService', () => ({
  connect: jest.fn(),
  disconnect: jest.fn(),
  joinRoom: jest.fn().mockResolvedValue({ success: true, listenerId: 'l1', roomId: '123' }),
  onKicked: jest.fn(),
  onRenamed: jest.fn(),
  onRoomClosed: jest.fn(),
  onAudioData: jest.fn(),
  off: jest.fn(),
  refreshConnection: jest.fn(),
}));

jest.mock('@/services/foregroundService', () => ({
  start: jest.fn().mockResolvedValue(true),
  stop: jest.fn().mockResolvedValue(true),
}));

jest.mock('@/services/audioService', () => ({
  setAudioLevelCallback: jest.fn(),
  setMuted: jest.fn(),
  enablePlaybackMode: jest.fn().mockResolvedValue(true),
}));

jest.mock('@/services/connectionHealthService', () => ({
  updateMuteState: jest.fn(),
  stop: jest.fn(),
  startListenerMonitoring: jest.fn(),
  registerCallbacks: jest.fn(),
}));

const mockSettings = {
  serverUrl: 'http://localhost',
  deviceName: 'ListenerDevice',
  useLegacyWebSockets: true,
};

const updateSettingsMock = jest.fn();

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <SettingsContext.Provider value={{ settings: mockSettings, updateSettings: updateSettingsMock } as any}>
    {children}
  </SettingsContext.Provider>
);

describe('useListener Hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize correctly', () => {
    const { result } = renderHook(() => useListener(), { wrapper });
    expect(result.current.roomCode).toBeNull();
    expect(result.current.isConnected).toBe(false);
  });

  it('should connect to room using legacy websockets', async () => {
    const { result } = renderHook(() => useListener(), { wrapper });
    
    await act(async () => {
      await result.current.connect('ROOM12');
    });

    expect(socketService.connect).toHaveBeenCalledWith('http://localhost');
    expect(socketService.joinRoom).toHaveBeenCalledWith('ROOM12', 'ListenerDevice');
    expect(result.current.roomCode).toBe('ROOM12');
    expect(result.current.isConnected).toBe(true);
    expect(foregroundService.start).toHaveBeenCalled();
  });

  it('should toggle mute', () => {
    const { result } = renderHook(() => useListener(), { wrapper });
    
    act(() => {
      result.current.toggleMute();
    });
    
    expect(result.current.isMuted).toBe(true);
    expect(audioService.setMuted).toHaveBeenCalledWith(true);
  });

  it('should disconnect from room', async () => {
    const { result } = renderHook(() => useListener(), { wrapper });
    
    await act(async () => {
      await result.current.connect('ROOM12');
      await result.current.disconnect();
    });

    expect(socketService.disconnect).toHaveBeenCalled();
    expect(foregroundService.stop).toHaveBeenCalled();
    expect(result.current.isConnected).toBe(false);
    expect(result.current.roomCode).toBeNull();
  });
});
