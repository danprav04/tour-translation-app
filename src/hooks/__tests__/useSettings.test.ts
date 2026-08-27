import { renderHook, act } from '@testing-library/react-native';
import { useSettings } from '../useSettings';
import AsyncStorage from '@react-native-async-storage/async-storage';

describe('useSettings Hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should load default settings if none in storage', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);

    const { result, unmount } = await renderHook(() => useSettings());

    // Wait for async storage to resolve
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.isLoaded).toBe(true);
    expect(result.current.settings.targetLanguage).toBe('en');
    expect(result.current.settings.preferredAudioOutput).toBe('');
    expect(result.current.settings.micAmplification).toBe(3.0);
    expect(result.current.settings.transcriptionMode).toBe('SMART');
    expect(result.current.settings.customVocabulary).toBe('');
    unmount();
  });

  it('should load stored settings', async () => {
    const storedSettings = { 
      targetLanguage: 'es', 
      preferredAudioOutput: 'speaker',
      transcriptionMode: 'VERBATIM',
      customVocabulary: 'term1, term2'
    };
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(JSON.stringify(storedSettings));

    const { result, unmount } = await renderHook(() => useSettings());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.settings.targetLanguage).toBe('es');
    expect(result.current.settings.preferredAudioOutput).toBe('speaker');
    expect(result.current.settings.transcriptionMode).toBe('VERBATIM');
    expect(result.current.settings.customVocabulary).toBe('term1, term2');
    unmount();
  });

  it('should update settings and save to storage', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);

    const { result, unmount } = await renderHook(() => useSettings());
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.updateSettings({ serverUrl: 'http://test', transcriptionMode: 'VERBATIM' });
    });

    expect(result.current.settings.serverUrl).toBe('http://test');
    expect(result.current.settings.transcriptionMode).toBe('VERBATIM');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('@tour_settings', expect.any(String));
    unmount();
  });

  it('should handle load error gracefully', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('Storage Error'));

    const { result, unmount } = await renderHook(() => useSettings());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.isLoaded).toBe(true);
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
    unmount();
  });

  it('should handle update error gracefully', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('Storage Error'));

    const { result, unmount } = await renderHook(() => useSettings());
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.updateSettings({ serverUrl: 'http://test' });
    });

    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
    unmount();
  });
});
