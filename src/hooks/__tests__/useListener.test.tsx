import { renderHook, act } from '@testing-library/react-native';
import { useListener } from '../useListener';
import { SettingsContext } from '@/context/SettingsContext';
import { DebugContext } from '@/context/DebugContext';
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
  onHostDisconnected: jest.fn(),
  onHostReconnected: jest.fn(),
  onHostStatus: jest.fn(),
  onSpeakingState: jest.fn(),
  onTranscriptChunk: jest.fn(),
  off: jest.fn(),
  refreshConnection: jest.fn(),
}));

jest.mock('@/services/foregroundService', () => ({
  start: jest.fn().mockResolvedValue(true),
  stop: jest.fn().mockResolvedValue(true),
}));

jest.mock('@/services/audioService', () => ({
  setAudioLevelCallback: jest.fn(),
  setPreferredAudioOutput: jest.fn(),
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
  preferredAudioOutput: 'speaker',
};

const updateSettingsMock = jest.fn();
const mockSetDebugState = jest.fn();

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <DebugContext.Provider value={{ debugState: {}, setDebugState: mockSetDebugState, addDebugEvent: jest.fn(), clearDebugLogs: jest.fn() }}>
    <SettingsContext.Provider value={{ settings: mockSettings, updateSettings: updateSettingsMock } as any}>
      {children}
    </SettingsContext.Provider>
  </DebugContext.Provider>
);

describe('useListener Hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize correctly', async () => {
    const { result, unmount } = await renderHook(() => useListener(), { wrapper });
    expect(result.current.roomCode).toBeNull();
    expect(result.current.isConnected).toBe(false);
    unmount();
  });

  it('should connect to room using legacy websockets', async () => {
    const { result, unmount } = await renderHook(() => useListener(), { wrapper });
    
    await act(async () => {
      await result.current.connect('ROOM12');
    });

    expect(socketService.connect).toHaveBeenCalledWith('http://localhost');
    expect(socketService.joinRoom).toHaveBeenCalledWith('ROOM12', 'ListenerDevice');
    expect(result.current.roomCode).toBe('ROOM12');
    expect(result.current.isConnected).toBe(true);
    expect(foregroundService.start).toHaveBeenCalled();
    expect(audioService.setPreferredAudioOutput).toHaveBeenCalled();
    unmount();
  });

  it('should toggle mute', async () => {
    const { result, unmount } = await renderHook(() => useListener(), { wrapper });
    
    await act(async () => {
      result.current.toggleMute();
    });
    
    expect(result.current.isMuted).toBe(true);
    expect(audioService.setMuted).toHaveBeenCalledWith(true);
    unmount();
  });

  it('should disconnect from room', async () => {
    const { result, unmount } = await renderHook(() => useListener(), { wrapper });
    
    await act(async () => {
      await result.current.connect('ROOM12');
      await result.current.disconnect();
    });

    expect(socketService.disconnect).toHaveBeenCalled();
    expect(foregroundService.stop).toHaveBeenCalled();
    expect(result.current.isConnected).toBe(false);
    expect(result.current.roomCode).toBeNull();
    unmount();
  });
});
