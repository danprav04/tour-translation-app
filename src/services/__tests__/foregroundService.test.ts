import foregroundService from '../foregroundService';
import notifee, { AndroidImportance, AndroidForegroundServiceType } from '@notifee/react-native';

jest.mock('@notifee/react-native', () => ({
  __esModule: true,
  default: {
    registerForegroundService: jest.fn(),
    requestPermission: jest.fn().mockResolvedValue(true),
    createChannel: jest.fn().mockResolvedValue('test-channel'),
    displayNotification: jest.fn().mockResolvedValue(true),
    stopForegroundService: jest.fn().mockResolvedValue(true),
  },
  AndroidColor: { AQUA: 'aqua' },
  AndroidImportance: { LOW: 2 },
  AndroidForegroundServiceType: { FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK: 2 },
}));

describe('ForegroundService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('should register foreground service runner on initialization', () => {
    expect(notifee.registerForegroundService).toHaveBeenCalled();
  });

  it('should start foreground service successfully', async () => {
    await foregroundService.start('Test Title', 'Test Body');
    
    expect(notifee.requestPermission).toHaveBeenCalled();
    expect(notifee.createChannel).toHaveBeenCalled();
    expect(notifee.displayNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Test Title',
        body: 'Test Body',
      })
    );
  });

  it('should not start if already running', async () => {
    // Reset from previous test since it's a singleton
    await foregroundService.stop(); 
    jest.clearAllMocks();

    await foregroundService.start('Title 1', 'Body 1');
    await foregroundService.start('Title 2', 'Body 2');

    expect(notifee.displayNotification).toHaveBeenCalledTimes(1);
  });

  it('should handle start errors', async () => {
    await foregroundService.stop();
    (notifee.requestPermission as jest.Mock).mockRejectedValueOnce(new Error('Permission denied'));

    await expect(foregroundService.start('Title', 'Body')).rejects.toThrow('Permission denied');
    expect(console.error).toHaveBeenCalled();
  });

  it('should stop foreground service successfully', async () => {
    await foregroundService.start('Title', 'Body'); // ensure running
    
    // Simulate the runner callback execution to set resolveTask
    const registerCallback = (notifee.registerForegroundService as jest.Mock).mock.calls[0][0];
    const promise = registerCallback({}); // call the registered callback
    
    await foregroundService.stop();
    expect(notifee.stopForegroundService).toHaveBeenCalled();
    
    // Check if resolveTask was called (promise should resolve)
    await expect(promise).resolves.toBeUndefined();
  });

  it('should not stop if not running', async () => {
    await foregroundService.stop(); // ensure stopped
    jest.clearAllMocks();
    
    await foregroundService.stop();
    expect(notifee.stopForegroundService).not.toHaveBeenCalled();
  });

  it('should handle stop errors', async () => {
    await foregroundService.start('Title', 'Body'); // ensure running
    (notifee.stopForegroundService as jest.Mock).mockRejectedValueOnce(new Error('Stop failed'));

    await foregroundService.stop();
    expect(console.error).toHaveBeenCalledWith('Failed to stop foreground service', expect.any(Error));
  });
});
