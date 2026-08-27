import { renderHook, act } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { useHost } from '../useHost';
import { SettingsContext } from '@/context/SettingsContext';
import { DatabaseContext } from '@/context/DatabaseContext';
import React from 'react';
import socketService from '@/services/socketService';
import foregroundService from '@/services/foregroundService';
import audioService from '@/services/audioService';
import connectionHealthService from '@/services/connectionHealthService';
import geminiTranslateService from '@/services/geminiTranslateService';

const mockAddDebugEvent = jest.fn();
const mockSetDebugState = jest.fn();
jest.mock('@/context/DebugContext', () => ({
  useDebugContext: () => ({
    addDebugEvent: mockAddDebugEvent,
    setDebugState: mockSetDebugState,
  }),
}));

jest.mock('@/services/socketService', () => ({
  connect: jest.fn(),
  disconnect: jest.fn(),
  createRoom: jest.fn().mockResolvedValue({ roomCode: 'ABCDEF', roomId: '123' }),
  onListenerJoined: jest.fn(),
  onListenerLeft: jest.fn(),
  onListenerRenamed: jest.fn(),
  off: jest.fn(),
  sendAudioChunk: jest.fn(),
  refreshConnection: jest.fn(),
  isConnected: jest.fn().mockReturnValue(false),
}));

jest.mock('@/services/foregroundService', () => ({
  start: jest.fn().mockResolvedValue(true),
  stop: jest.fn().mockResolvedValue(true),
  updateHostState: jest.fn(),
}));

jest.mock('@/services/audioService', () => ({
  setAudioLevelCallback: jest.fn(),
  setPreferredAudioOutput: jest.fn(),
  setMuted: jest.fn(),
  requestPermissions: jest.fn().mockResolvedValue(true),
  startCapture: jest.fn().mockResolvedValue(true),
  stopCapture: jest.fn().mockResolvedValue(true),
  setMicAmplification: jest.fn(),
  startKeepAlive: jest.fn(),
  stopKeepAlive: jest.fn(),
  setAudioRouteFallbackCallback: jest.fn(),
  playChunk: jest.fn(),
}));

jest.mock('@/services/connectionHealthService', () => ({
  updateTranslationStartTime: jest.fn(),
  updateMicState: jest.fn(),
  updateTranslationState: jest.fn(),
  startHostMonitoring: jest.fn(),
  stop: jest.fn(),
  registerCallbacks: jest.fn(),
  recordMicActivity: jest.fn(),
  setGeminiReconnecting: jest.fn(),
}));

jest.mock('@/services/geminiTranslateService', () => ({
  connect: jest.fn().mockResolvedValue(true),
  connectOverlap: jest.fn().mockResolvedValue(true),
  disconnect: jest.fn(),
  onTranslatedAudio: jest.fn(),
  onClose: jest.fn(),
  onError: jest.fn(),
  isConnected: jest.fn().mockReturnValue(false),
}));

const mockTranscript = {
  interimText: '',
  finalChunks: [],
  isRecording: false,
  startTranscription: jest.fn().mockResolvedValue(undefined),
  stopTranscription: jest.fn().mockResolvedValue(undefined),
  clearTranscript: jest.fn(),
  sendAudioChunk: jest.fn(),
};

jest.mock('@/hooks/useTranscript', () => ({
  useTranscript: () => mockTranscript,
}));

const mockSettings = {
  serverUrl: 'http://localhost',
  deviceName: 'HostDevice',
  useLegacyWebSockets: true,
  geminiApiKey: 'mock-gemini-key',
  targetLanguage: 'en',
  translatorVoice: 'Aoede',
  noiseCancellation: true,
  autoGainControl: true,
  echoCancellation: true,
  micAmplification: 4.0,
  transcriptionMode: 'smart',
  customVocabulary: '',
};

const updateSettingsMock = jest.fn();

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <SettingsContext.Provider value={{ settings: mockSettings, updateSettings: updateSettingsMock } as any}>
    <DatabaseContext.Provider value={{} as any}>
      {children}
    </DatabaseContext.Provider>
  </SettingsContext.Provider>
);

describe('useHost Hook', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockAddDebugEvent.mockClear();
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('should log debug event when translation fails to start', async () => {
    (geminiTranslateService.connect as jest.Mock).mockRejectedValueOnce(new Error('API Error'));
    const hookResult = await renderHook(() => useHost(), { wrapper });
    
    await act(async () => {
      await hookResult.result.current.toggleTranslation();
    });

    expect(mockAddDebugEvent).toHaveBeenCalledWith('Translation failed to start: API Error');
    expect(hookResult.result.current.isTranslating).toBe(false);
    hookResult.unmount();
  });

  it('should initialize correctly', async () => {
    const { result } = await renderHook(() => useHost(), { wrapper });
    expect(result.current.roomCode).toBeNull();
    expect(result.current.isConnected).toBe(false);
  });

  it('should start room using legacy websockets', async () => {
    const { result } = await renderHook(() => useHost(), { wrapper });
    
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
    const { result } = await renderHook(() => useHost(), { wrapper });
    
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
    const { result } = await renderHook(() => useHost(), { wrapper });
    
    await act(async () => {
      await result.current.startRoom();
      await result.current.toggleTranslation();
      await result.current.stopRoom();
    });

    expect(socketService.disconnect).toHaveBeenCalled();
    expect(foregroundService.stop).toHaveBeenCalled();
    expect(result.current.isConnected).toBe(false);
    expect(result.current.roomCode).toBeNull();
  });

  it('should handle translation disconnect and retry with correct language', async () => {
    const { result, unmount } = await renderHook(() => useHost(), { wrapper });
    
    await act(async () => {
      await result.current.toggleTranslation();
    });

    expect(mockAddDebugEvent).toHaveBeenCalledWith('Translation started successfully');

    // Trigger disconnect
    const onCloseCallback = (geminiTranslateService.onClose as jest.Mock).mock.calls[0][0];
    await act(async () => {
      await onCloseCallback();
    });

    expect(mockAddDebugEvent).toHaveBeenCalledWith('Translation disconnected, reconnecting...');
    
    // While reconnecting, simulate another disconnect (should be ignored)
    await act(async () => {
      await onCloseCallback();
    });
    expect(mockAddDebugEvent).toHaveBeenCalledTimes(2);

    await act(async () => {
      jest.advanceTimersByTime(2500); // Wait for retry delay
      await Promise.resolve();
    });

    // It should call connect again with the current language (en from mockSettings)
    expect(geminiTranslateService.connect).toHaveBeenCalledWith('mock-gemini-key', 'en', undefined);

    await act(async () => {
      await result.current.stopRoom();
    });

    unmount();
  });



  it('should toggle translation and update health service', async () => {
    const { result, unmount } = await renderHook(() => useHost(), { wrapper });
    
    await act(async () => {
      await result.current.toggleTranslation();
    });
    
    expect(result.current.isTranslating).toBe(true);
    expect(connectionHealthService.updateTranslationStartTime).toHaveBeenCalled();
    unmount();
  });

  it('should show low audio warning when audio level is low for 10 seconds while mic is active', async () => {
    const { result, unmount } = await renderHook(() => useHost(), { wrapper });

    await act(async () => {
      await result.current.toggleMic();
    });

    expect(result.current.isMicActive).toBe(true);

    await act(async () => {
      result.current.setAudioLevel(0.01);
    });

    expect(result.current.showLowAudioWarning).toBe(false);

    await act(async () => {
      jest.advanceTimersByTime(10000);
    });

    expect(result.current.showLowAudioWarning).toBe(true);

    await act(async () => {
      result.current.setAudioLevel(0.1);
    });

    expect(result.current.showLowAudioWarning).toBe(false);

    unmount();
  });

  it('should handle AppState change and trigger background reconnect', async () => {
    let appStateCallback: any;
    const addEventListenerSpy = jest.spyOn(AppState, 'addEventListener').mockImplementation((type, handler) => {
      if (type === 'change') {
        appStateCallback = handler;
      }
      return { remove: jest.fn() } as any;
    });

    const { result, unmount } = await renderHook(() => useHost(), { wrapper });
    
    await act(async () => {
      await result.current.toggleMic();
    });

    expect(result.current.isMicActive).toBe(true);

    await act(async () => {
      if (appStateCallback) {
        await appStateCallback('active');
      }
    });

    expect(result.current.isReconnectingFromBackground).toBe(true);
    expect(socketService.refreshConnection).toHaveBeenCalled();
    
    await act(async () => {
      jest.advanceTimersByTime(500);
      await Promise.resolve();
    });
    
    expect(result.current.isReconnectingFromBackground).toBe(false);

    addEventListenerSpy.mockRestore();
    unmount();
  });

  it('should set mic amplification on startRoom', async () => {
    const { result, unmount } = await renderHook(() => useHost(), { wrapper });
    
    await act(async () => {
      await result.current.startRoom();
    });

    expect(audioService.setMicAmplification).toHaveBeenCalledWith(4.0);
    unmount();
  });
});
