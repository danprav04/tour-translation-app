import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Linking, TouchableOpacity } from 'react-native';
import Constants from 'expo-constants';
import { useSettingsContext } from '@/context/SettingsContext';

const isVersionLessThan = (v1: string, v2: string) => {
  const p1 = v1.split('.').map(Number);
  const p2 = v2.split('.').map(Number);
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const num1 = p1[i] || 0;
    const num2 = p2[i] || 0;
    if (num1 < num2) return true;
    if (num1 > num2) return false;
  }
  return false;
};

export default function VersionCheck() {
  const { settings, isLoaded } = useSettingsContext();
  const [isUnsupported, setIsUnsupported] = useState(false);

  useEffect(() => {
    if (!isLoaded || !settings.serverUrl) return;

    const checkVersion = async () => {
      try {
        const url = settings.serverUrl.endsWith('/')
          ? settings.serverUrl.slice(0, -1)
          : settings.serverUrl;
        const response = await fetch(`${url}/health`);
        if (response.ok) {
          const data = await response.json();
          if (data.minSupportedVersion) {
            const currentVersion = Constants.expoConfig?.version || '0.0.0';
            if (isVersionLessThan(currentVersion, data.minSupportedVersion)) {
              setIsUnsupported(true);
            }
          }
        }
      } catch (error) {
        console.error('Failed to check version:', error);
      }
    };

    checkVersion();
  }, [settings.serverUrl, isLoaded]);

  if (!isUnsupported) return null;

  const handleUpdate = () => {
    Linking.openURL(settings.serverUrl);
  };

  return (
    <View style={styles.container} testID="version-check-screen">
      <Text style={styles.title}>Update Required</Text>
      <Text style={styles.message}>
        This app version is no longer supported by the server. Please update the app.
      </Text>
      <TouchableOpacity style={styles.button} onPress={handleUpdate}>
        <Text style={styles.buttonText}>Go to Server Landing Page</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0A0E1A',
    zIndex: 9999,
    elevation: 99,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
  },
  message: {
    fontSize: 16,
    color: '#A0AEC0',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  button: {
    backgroundColor: '#3182CE',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
