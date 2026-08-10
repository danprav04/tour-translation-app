import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal } from 'react-native';
import * as Battery from 'expo-battery';
import * as IntentLauncher from 'expo-intent-launcher';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface BatteryOptimizationGuardProps {
  children: React.ReactNode;
}

const REMINDER_KEY = 'battery-optimization-reminder-timestamp';
const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

export default function BatteryOptimizationGuard({ children }: BatteryOptimizationGuardProps) {
  const [showPrompt, setShowPrompt] = useState(false);

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
      await IntentLauncher.startActivityAsync(
        IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS
      );
      // Wait a moment and then check if they fixed it
      setTimeout(async () => {
        const isEnabled = await Battery.isBatteryOptimizationEnabledAsync();
        if (!isEnabled) {
          setShowPrompt(false);
        }
      }, 3000);
    } catch (e) {
      console.warn('Failed to launch intent', e);
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
      <Modal
        visible={showPrompt}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.overlay}>
          <View style={styles.modalContent}>
            <Text style={styles.icon}>🔋</Text>
            <Text style={styles.title}>Battery Optimization</Text>
            <Text style={styles.text}>
              Your phone's battery saver may disconnect you during the tour. 
              Tap 'Fix' to allow Tour Translator to run in the background.
            </Text>
            
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
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 14, 26, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#1E2333',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
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
