import foregroundService from '../foregroundService';
import BackgroundService from 'react-native-background-actions';
import BackgroundTimer from 'react-native-background-timer';
import socketService from '@/services/socketService';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@/services/socketService', () => ({
  isConnected: jest.fn().mockReturnValue(true),
  refreshConnection: jest.fn(),
}));

describe('ForegroundService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('should start foreground service successfully for host', async () => {
    await foregroundService.stop();
    await foregroundService.start('Host Title', 'Host Body', 'host');

    expect(BackgroundService.start).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        taskTitle: 'Host Title',
        taskDesc: 'Host Body',
        foregroundServiceType: ['microphone', 'mediaPlayback'],
        parameters: { role: 'host' },
      })
    );
  });

  it('should start foreground service successfully for listener', async () => {
    await foregroundService.stop();
    await foregroundService.start('Listener Title', 'Listener Body', 'listener');

    expect(BackgroundService.start).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        taskTitle: 'Listener Title',
        taskDesc: 'Listener Body',
        foregroundServiceType: ['mediaPlayback'],
        parameters: { role: 'listener' },
      })
    );
  });

  it('should not start if already running', async () => {
    await foregroundService.stop();
    jest.clearAllMocks();

    await foregroundService.start('Title 1', 'Body 1', 'host');
    await foregroundService.start('Title 2', 'Body 2', 'host');

    expect(BackgroundService.start).toHaveBeenCalledTimes(1);
  });

  it('should handle ForegroundServiceStartNotAllowedException gracefully', async () => {
    await foregroundService.stop();
    (BackgroundService.start as jest.Mock).mockRejectedValueOnce(
      new Error('ForegroundServiceStartNotAllowedException: startForeground failed')
    );

    await expect(foregroundService.start('Title', 'Body', 'host')).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Foreground service blocked by Android 12+')
    );
  });

  it('should rethrow other start errors', async () => {
    await foregroundService.stop();
    (BackgroundService.start as jest.Mock).mockRejectedValueOnce(new Error('Fatal background error'));

    await expect(foregroundService.start('Title', 'Body', 'host')).rejects.toThrow('Fatal background error');
    expect(console.error).toHaveBeenCalled();
  });

  it('should stop foreground service and background timer successfully', async () => {
    await foregroundService.stop();
    await foregroundService.start('Title', 'Body', 'host');
    
    await foregroundService.stop();
    expect(BackgroundService.stop).toHaveBeenCalled();
    expect(BackgroundTimer.stop).toHaveBeenCalled();
  });

  it('should not stop if not running', async () => {
    await foregroundService.stop();
    jest.clearAllMocks();

    await foregroundService.stop();
    expect(BackgroundService.stop).not.toHaveBeenCalled();
  });

  it('should handle stop errors gracefully', async () => {
    await foregroundService.start('Title', 'Body', 'host');
    (BackgroundService.stop as jest.Mock).mockRejectedValueOnce(new Error('Stop failed'));

    await foregroundService.stop();
    expect(console.error).toHaveBeenCalledWith('Failed to stop background service', expect.any(Error));
  });

  it('should update host state', () => {
    expect(() => {
      foregroundService.updateHostState({
        isMicActive: true,
        isTranslating: true,
        targetLanguage: 'es',
      });
    }).not.toThrow();
  });

  it('executes background task loop iteration', async () => {
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation((cb: any) => {
      if (typeof cb === 'function') cb();
      return 1 as any;
    });

    let count = 0;
    (BackgroundService.isRunning as jest.Mock).mockImplementation(() => {
      count++;
      return count <= 1;
    });

    (socketService.isConnected as jest.Mock).mockReturnValue(false);
    jest.spyOn(AsyncStorage, 'getItem').mockResolvedValue(JSON.stringify({ wasMicActive: false }));

    foregroundService.updateHostState({
      isMicActive: true,
      isTranslating: true,
      targetLanguage: 'es',
    });

    await foregroundService.stop();
    await foregroundService.start('Title', 'Body', 'host');

    const backgroundTask = (BackgroundService.start as jest.Mock).mock.calls[0][0];
    await backgroundTask({});

    expect(socketService.refreshConnection).toHaveBeenCalled();
    expect(AsyncStorage.setItem).toHaveBeenCalled();

    setTimeoutSpy.mockRestore();
  });
});
