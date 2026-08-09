import { renderHook, act } from '@testing-library/react-native';
import { useSettings } from '../useSettings';
import AsyncStorage from '@react-native-async-storage/async-storage';

describe('useSettings Hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should load default settings if none in storage', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);

    const { result } = renderHook(() => useSettings());

    expect(result.current.isLoaded).toBe(false);

    // Wait for async storage to resolve
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.isLoaded).toBe(true);
    expect(result.current.settings.targetLanguage).toBe('en');
    expect(result.current.settings.preferredAudioOutput).toBe('');
  });

  it('should load stored settings', async () => {
    const storedSettings = { targetLanguage: 'es', preferredAudioOutput: 'speaker' };
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(JSON.stringify(storedSettings));

    const { result } = renderHook(() => useSettings());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.settings.targetLanguage).toBe('es');
    expect(result.current.settings.preferredAudioOutput).toBe('speaker');
  });

  it('should update settings and save to storage', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);

    const { result } = renderHook(() => useSettings());
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.updateSettings({ serverUrl: 'http://test' });
    });

    expect(result.current.settings.serverUrl).toBe('http://test');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('@tour_settings', expect.any(String));
  });

  it('should handle load error gracefully', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('Storage Error'));

    const { result } = renderHook(() => useSettings());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.isLoaded).toBe(true);
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('should handle update error gracefully', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('Storage Error'));

    const { result } = renderHook(() => useSettings());
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.updateSettings({ serverUrl: 'http://test' });
    });

    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});
