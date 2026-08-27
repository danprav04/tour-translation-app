import { renderHook, act } from '@testing-library/react-native';
import { useTTS } from '../useTTS';
import ttsService from '@/services/ttsService';

jest.mock('@/services/ttsService', () => ({
  generateTTS: jest.fn().mockResolvedValue('AAAAAA=='),
}));

jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(() => ({
    play: jest.fn(),
    pause: jest.fn(),
    seekTo: jest.fn(),
    remove: jest.fn(),
    currentTime: 0,
    duration: 10,
  })),
}));

describe('useTTS Hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should generate audio', async () => {
    const onTTSStart = jest.fn();
    const onTTSEnd = jest.fn();

    const { result, unmount } = await renderHook(() => useTTS({ apiKey: 'dummy', onTTSStart, onTTSEnd }));

    await act(async () => {
      result.current.setTTSText('hello');
    });

    await act(async () => {
      await result.current.generate();
    });

    expect(ttsService.generateTTS).toHaveBeenCalledWith('hello', 'dummy');
    expect(result.current.hasAudio).toBe(true);
    unmount();
  });

  it('should handle playback', async () => {
    const onTTSStart = jest.fn();
    const onTTSEnd = jest.fn();

    const { result, unmount } = await renderHook(() => useTTS({ apiKey: 'dummy', onTTSStart, onTTSEnd }));

    await act(async () => {
      result.current.setTTSText('hello');
    });

    await act(async () => {
      await result.current.generate();
    });

    await act(async () => {
      await result.current.play();
    });

    expect(onTTSStart).toHaveBeenCalled();
    expect(result.current.isTTSPlaying).toBe(true);

    await act(async () => {
      result.current.pause();
    });

    expect(result.current.isTTSPlaying).toBe(false);
    expect(onTTSEnd).toHaveBeenCalled();
    unmount();
  });

  it('should format time correctly', async () => {
    const { result, unmount } = await renderHook(() => useTTS({ apiKey: 'dummy', onTTSStart: jest.fn(), onTTSEnd: jest.fn() }));
    expect(result.current.formatTime(65)).toBe('1:05');
    unmount();
  });

  it('should clear', async () => {
    const { result, unmount } = await renderHook(() => useTTS({ apiKey: 'dummy', onTTSStart: jest.fn(), onTTSEnd: jest.fn() }));
    
    await act(async () => {
      result.current.setTTSText('hello');
    });
    
    await act(async () => {
      await result.current.generate();
    });
    
    await act(async () => {
      result.current.clear();
    });

    expect(result.current.ttsText).toBe('');
    expect(result.current.hasAudio).toBe(false);
    unmount();
  });
});
