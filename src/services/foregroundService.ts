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
  private async backgroundTask(taskDataArguments: any) {
    // We need to keep the background task alive
    await new Promise(async (resolve) => {
      // Start the CPU wakelock
      BackgroundTimer.start();
      
      let reconnectAttempts = 0;
      
      const interval = BackgroundTimer.setInterval(async () => {
        if (!BackgroundService.isRunning()) {
          BackgroundTimer.clearInterval(interval);
          resolve(null);
          return;
        }
        
        // Background reconnection logic
        try {
          if (!socketService.isConnected()) {
             console.log('[ForegroundService] Background task detected disconnected socket, refreshing...');
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
          // Arrow function captures 'this' from class
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
      }, 15000); // Check every 15 seconds
      
      // Cleanup when stopped
      BackgroundService.on('expiration', () => {
         BackgroundTimer.clearInterval(interval);
         resolve(null);
      });
    });
  }

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
          ? ['microphone', 'dataSync', 'mediaPlayback'] 
          : ['dataSync', 'mediaPlayback'],
        parameters: {
          role,
        },
      } as any;

      await BackgroundService.start(this.backgroundTask, options);
      this.isRunning = true;
    } catch (e) {
      console.error('Failed to start background service', e);
      throw e;
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
