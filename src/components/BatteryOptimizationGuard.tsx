import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import * as Battery from 'expo-battery';
import * as IntentLauncher from 'expo-intent-launcher';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import CustomModal from './CustomModal';

interface BatteryOptimizationGuardProps {
  children: React.ReactNode;
}

const REMINDER_KEY = 'battery-optimization-reminder-timestamp';
const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

export default function BatteryOptimizationGuard({ children }: BatteryOptimizationGuardProps) {
  const [showPrompt, setShowPrompt] = useState(false);
  const manufacturer = Device.manufacturer?.toLowerCase() || '';
  const isAggressiveOEM = ['samsung', 'xiaomi', 'huawei', 'oneplus', 'oppo', 'vivo'].includes(manufacturer);

  useEffect(() => {
    checkBatteryOptimization();
  }, []);

  const checkBatteryOptimization = async () => {
    try {
      const isEnabled = await Battery.isBatteryOptimizationEnabledAsync();
      if (!isEnabled) {
        return; // Optimization is disabled, all good
      }

      // Check if user has dismissed the prompt recently
      const lastDismissed = await AsyncStorage.getItem(REMINDER_KEY);
      if (lastDismissed) {
        const timestamp = parseInt(lastDismissed, 10);
        if (Date.now() - timestamp < COOLDOWN_MS) {
          return; // Still in cooldown
        }
      }

      setShowPrompt(true);
    } catch (e) {
      console.warn('Failed to check battery optimization status', e);
    }
  };

  const handleFix = async () => {
    try {
      if (Platform.OS === 'android') {
        const pkg = Constants.expoConfig?.android?.package || 'com.tourcast.app';
        await IntentLauncher.startActivityAsync(
          'android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
          { data: `package:${pkg}` }
        );
      }
      
      // Wait a moment and then check if they fixed it
      setTimeout(async () => {
        const isEnabled = await Battery.isBatteryOptimizationEnabledAsync();
        if (!isEnabled) {
          setShowPrompt(false);
        }
      }, 3000);
    } catch (e) {
      console.warn('Failed to launch direct intent, falling back to general settings', e);
      try {
        await IntentLauncher.startActivityAsync(
          IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS
        );
      } catch (fallbackErr) {
        console.warn('Fallback intent failed', fallbackErr);
      }
    }
  };

  const handleDismiss = async () => {
    try {
      await AsyncStorage.setItem(REMINDER_KEY, Date.now().toString());
      setShowPrompt(false);
    } catch (e) {
      console.warn('Failed to save reminder timestamp', e);
      setShowPrompt(false);
    }
  };

  return (
    <>
      {children}
      <CustomModal
        visible={showPrompt}
        contentStyle={{ alignItems: 'center' }}
      >
        <Text style={styles.icon}>🔋</Text>
        <Text style={styles.title}>Battery Optimization</Text>
        <Text style={styles.text}>
          Your phone&apos;s battery saver may disconnect you during the tour. 
          Tap &apos;Fix&apos; to allow Tour Translator to run in the background.
        </Text>
        
        {Platform.OS === 'android' && isAggressiveOEM && (
          <Text style={styles.oemText}>
            Note: On {Device.manufacturer} devices, you may also need to check your device&apos;s &quot;App Launch&quot;, &quot;Deep Sleep&quot;, or &quot;Pause app activity&quot; settings to prevent the app from being restricted.
          </Text>
        )}
        
        <View style={styles.actions}>
          <Pressable
            style={[styles.button, styles.fixButton]}
            onPress={handleFix}
          >
            <Text style={styles.fixButtonText}>Fix</Text>
          </Pressable>
          
          <Pressable
            style={[styles.button, styles.dismissButton]}
            onPress={handleDismiss}
          >
            <Text style={styles.dismissButtonText}>Remind me later</Text>
          </Pressable>
        </View>
      </CustomModal>
    </>
  );
}

const styles = StyleSheet.create({
  icon: {
    fontSize: 48,
    marginBottom: 16,
  },
  title: {
    color: '#FFAB00',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  text: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  oemText: {
    color: '#FFAB00',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 24,
    backgroundColor: 'rgba(255, 171, 0, 0.1)',
    padding: 10,
    borderRadius: 8,
  },
  actions: {
    width: '100%',
    gap: 12,
  },
  button: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  fixButton: {
    backgroundColor: '#FFAB00',
  },
  fixButtonText: {
    color: '#0A0E1A',
    fontSize: 16,
    fontWeight: 'bold',
  },
  dismissButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  dismissButtonText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 16,
    fontWeight: '600',
  },
});
