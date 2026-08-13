import AsyncStorage from '@react-native-async-storage/async-storage';
import BackgroundService from 'react-native-background-actions';
import BackgroundTimer from 'react-native-background-timer';
import socketService from '@/services/socketService';

class ForegroundService {
  private isRunning = false;
  private hostState: { isMicActive?: boolean; isTranslating?: boolean; targetLanguage?: string } | null = null;

  constructor() {
    // Constructor no longer needs to register notifee listener
  }

  public updateHostState(state: { isMicActive?: boolean; isTranslating?: boolean; targetLanguage?: string }) {
    this.hostState = state;
  }

  // The Headless JS task that runs in the background
  private backgroundTask = async (taskDataArguments: any) => {
    // Helper for sleep
    const sleep = (time: number) => new Promise<void>((resolve) => setTimeout(resolve, time));
    
    let reconnectAttempts = 0;
    let nextUpdate = Date.now() + 60000;
    
    // react-native-background-actions already holds a PARTIAL_WAKE_LOCK,
    // so standard setTimeout (via sleep) will work reliably here.
    while (BackgroundService.isRunning()) {
      // Background reconnection logic
      try {
        if (!socketService.isConnected()) {
           console.log(`[ForegroundService] Background task detected disconnected socket, refreshing (attempt ${reconnectAttempts + 1})...`);
           socketService.refreshConnection();
           reconnectAttempts++;
        } else {
           reconnectAttempts = 0;
        }
      } catch (e) {
        console.warn('[ForegroundService] Reconnect failed in background', e);
      }

      // Flush state to AsyncStorage for recovery
      try {
        const sessionState = await AsyncStorage.getItem('activeSession');
        if (sessionState && this.hostState) {
          const parsed = JSON.parse(sessionState);
          parsed.wasMicActive = this.hostState.isMicActive ?? parsed.wasMicActive;
          parsed.wasTranslating = this.hostState.isTranslating ?? parsed.wasTranslating;
          parsed.targetLanguage = this.hostState.targetLanguage ?? parsed.targetLanguage;
          await AsyncStorage.setItem('activeSession', JSON.stringify(parsed));
        }
      } catch (e) {
        // Ignore
      }

      // Keep notification fresh so Android knows the service is active
      if (Date.now() >= nextUpdate) {
          try {
              await BackgroundService.updateNotification({ 
                  taskDesc: socketService.isConnected() ? 'Connected • Tour Active' : 'Reconnecting...' 
              });
              nextUpdate = Date.now() + 60000;
          } catch (e) {
              console.warn('[ForegroundService] Failed to update notification', e);
          }
      }

      // Exponential backoff: 15s, 30s, 60s, up to 5 mins max
      const sleepDuration = socketService.isConnected() 
        ? 15000 
        : Math.min(15000 * Math.pow(2, reconnectAttempts), 300000);
      await sleep(sleepDuration);
    }
  };

  async start(title: string, body: string, role: 'host' | 'listener') {
    if (this.isRunning) return;
    
    try {
      const options = {
        taskName: 'TourTranslation',
        taskTitle: title,
        taskDesc: body,
        taskIcon: {
            name: 'ic_launcher',
            type: 'mipmap',
        },
        color: '#0A0E1A',
        linkingURI: 'tourcast://', // Optional: open app when notification is clicked
        foregroundServiceType: role === 'host' 
          ? ['microphone', 'mediaPlayback'] 
          : ['mediaPlayback'],
        parameters: {
          role,
        },
      } as any;

      await BackgroundService.start(this.backgroundTask, options);
      this.isRunning = true;
    } catch (e: any) {
      console.error('Failed to start background service', e);
      if (e?.message && e.message.includes('ForegroundServiceStartNotAllowedException')) {
        console.warn('Foreground service blocked by Android 12+ background start restrictions');
      } else {
        throw e;
      }
    }
  }

  async stop() {
    if (!this.isRunning) return;
    
    try {
      await BackgroundService.stop();
      BackgroundTimer.stop();
      this.isRunning = false;
    } catch (e) {
      console.error('Failed to stop background service', e);
    }
  }
}

export default new ForegroundService();
