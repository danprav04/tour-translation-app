import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

export interface Settings {
  serverUrl: string;
  geminiApiKey: string;
  targetLanguage: string;
  lastRoomCode: string;
  deviceName: string;
  useLegacyWebSockets: boolean;
  showBugReportButton: boolean;
  preferredAudioOutput: string;
  micAmplification: number;
  customTextPromptInjection: string;
  customVoicePromptInjection: string;
}

const DEFAULT_SETTINGS: Settings = {
  serverUrl: '',
  geminiApiKey: '',
  targetLanguage: 'en',
  lastRoomCode: '',
  deviceName: Constants.deviceName || 'Listener Device',
  useLegacyWebSockets: false,
  showBugReportButton: true,
  preferredAudioOutput: '',
  micAmplification: 3.0,
  customTextPromptInjection: '',
  customVoicePromptInjection: '',
};

const SETTINGS_KEY = '@tour_settings';

export const useSettings = () => {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const stored = await AsyncStorage.getItem(SETTINGS_KEY);
        if (stored) {
          setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(stored) });
        }
      } catch (error) {
        console.error('Failed to load settings', error);
      } finally {
        setIsLoaded(true);
      }
    };
    loadSettings();
  }, []);

  const updateSettings = async (newSettings: Partial<Settings>) => {
    try {
      const updated = { ...settings, ...newSettings };
      setSettings(updated);
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
    } catch (error) {
      console.error('Failed to update settings', error);
    }
  };

  return { settings, updateSettings, isLoaded };
};
