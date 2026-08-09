import { renderHook, act } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { useHost } from '../useHost';
import { SettingsContext } from '@/context/SettingsContext';
import React from 'react';
import socketService from '@/services/socketService';
import foregroundService from '@/services/foregroundService';
import audioService from '@/services/audioService';
import connectionHealthService from '@/services/connectionHealthService';

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
  setPreferredAudioOutput: jest.fn(),
  setMuted: jest.fn(),
  requestPermissions: jest.fn().mockResolvedValue(true),
  startCapture: jest.fn().mockResolvedValue(true),
  stopCapture: jest.fn().mockResolvedValue(true),
  setMicAmplification: jest.fn(),
}));

jest.mock('@/services/connectionHealthService', () => ({
  updateTranslationStartTime: jest.fn(),
  updateMicState: jest.fn(),
  updateTranslationState: jest.fn(),
  startHostMonitoring: jest.fn(),
  stop: jest.fn(),
  registerCallbacks: jest.fn(),
  recordMicActivity: jest.fn(),
}));

jest.mock('@/services/geminiTranslateService', () => ({
  connect: jest.fn().mockResolvedValue(true),
  disconnect: jest.fn(),
  onTranslatedAudio: jest.fn(),
  onClose: jest.fn(),
  onError: jest.fn(),
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
  micAmplification: 4.0,
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
    expect(audioService.setPreferredAudioOutput).toHaveBeenCalled();
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

  it('should toggle translation and update health service', async () => {
    const { result } = renderHook(() => useHost(), { wrapper });
    
    await act(async () => {
      await result.current.toggleTranslation();
    });
    
    expect(result.current.isTranslating).toBe(true);
    expect(connectionHealthService.updateTranslationStartTime).toHaveBeenCalled();
  });

  it('should show low audio warning when audio level is low for 10 seconds while mic is active', async () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useHost(), { wrapper });

    await act(async () => {
      await result.current.toggleMic();
    });

    expect(result.current.isMicActive).toBe(true);

    act(() => {
      result.current.setAudioLevel(0.01);
    });

    expect(result.current.showLowAudioWarning).toBe(false);

    act(() => {
      jest.advanceTimersByTime(10000);
    });

    expect(result.current.showLowAudioWarning).toBe(true);

    act(() => {
      result.current.setAudioLevel(0.1);
    });

    expect(result.current.showLowAudioWarning).toBe(false);
    jest.useRealTimers();
  });

  it('should handle AppState change and trigger background reconnect', async () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useHost(), { wrapper });
    
    await act(async () => {
      await result.current.toggleMic();
    });

    let appStateCallback: any;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((type, handler) => {
      if (type === 'change') {
        appStateCallback = handler;
      }
      return { remove: jest.fn() } as any;
    });

    // Re-render to attach event listener
    const { result: newResult } = renderHook(() => useHost(), { wrapper });

    await act(async () => {
      await newResult.current.toggleMic();
    });

    await act(async () => {
      appStateCallback('active');
    });

    expect(newResult.current.isReconnectingFromBackground).toBe(true);
    expect(socketService.refreshConnection).toHaveBeenCalled();
    
    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    
    expect(newResult.current.isReconnectingFromBackground).toBe(false);

    jest.useRealTimers();
  });

  it('should set mic amplification on startRoom', async () => {
    const { result } = renderHook(() => useHost(), { wrapper });
    
    await act(async () => {
      await result.current.startRoom();
    });

    expect(audioService.setMicAmplification).toHaveBeenCalledWith(4.0);
  });
});
