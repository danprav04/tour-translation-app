import notifee, { AndroidColor, AndroidImportance, AndroidForegroundServiceType } from '@notifee/react-native';

class ForegroundService {
  private isRunning = false;
  private resolveTask: (() => void) | null = null;

  constructor() {
    // Register the foreground service runner
    notifee.registerForegroundService((notification) => {
      return new Promise((resolve) => {
        this.resolveTask = resolve as () => void;
      });
    });
  }

  async start(title: string, body: string) {
    if (this.isRunning) return;
    
    try {
      await notifee.requestPermission();

      const channelId = await notifee.createChannel({
        id: 'tourcast-session',
        name: 'Active Session',
        importance: AndroidImportance.LOW,
      });

      await notifee.displayNotification({
        title,
        body,
        android: {
          channelId,
          asForegroundService: true,
          ongoing: true,
          color: AndroidColor.AQUA,
          foregroundServiceTypes: [
            AndroidForegroundServiceType.MICROPHONE,
            AndroidForegroundServiceType.MEDIA_PLAYBACK
          ],
          pressAction: {
            id: 'default',
          },
        },
      });

      this.isRunning = true;
    } catch (e) {
      console.error('Failed to start foreground service', e);
    }
  }

  async stop() {
    if (!this.isRunning) return;
    
    try {
      await notifee.stopForegroundService();
      if (this.resolveTask) {
        this.resolveTask();
        this.resolveTask = null;
      }
      this.isRunning = false;
    } catch (e) {
      console.error('Failed to stop foreground service', e);
    }
  }
}

export default new ForegroundService();
