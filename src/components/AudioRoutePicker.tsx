import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  ActivityIndicator,
  Platform,
  Alert,
  StyleSheet,
} from 'react-native';
import { AudioSession } from '@livekit/react-native';
import GlassCard from './GlassCard';
import audioService from '@/services/audioService';

interface AudioRoutePickerProps {
  onRouteChanged?: (deviceId: string) => void;
}

export default function AudioRoutePicker({ onRouteChanged }: AudioRoutePickerProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [availableOutputs, setAvailableOutputs] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentDevice, setCurrentDevice] = useState<string | null>(audioService.getPreferredAudioOutput());

  const handleOpen = async () => {
    try {
      if (Platform.OS === 'ios') {
        await AudioSession.showAudioRoutePicker();
      } else {
        setIsVisible(true);
        setIsLoading(true);
        await AudioSession.startAudioSession();
        const outputs = await AudioSession.getAudioOutputs();
        setAvailableOutputs(outputs || []);
      }
    } catch (e) {
      console.error('Failed to get audio outputs', e);
      Alert.alert('Error', 'Failed to retrieve audio devices.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelect = async (deviceId: string) => {
    try {
      await AudioSession.selectAudioOutput(deviceId);
      audioService.setPreferredAudioOutput(deviceId);
      setCurrentDevice(deviceId);
      onRouteChanged?.(deviceId);
      setIsVisible(false);
    } catch (e) {
      console.error('Failed to set audio output', e);
      Alert.alert('Error', 'Failed to change audio route.');
    }
  };

  const getDeviceLabel = (deviceId: string | null) => {
    if (!deviceId) return 'Default Output';
    return deviceId.charAt(0).toUpperCase() + deviceId.slice(1);
  };

  const getDeviceIcon = (deviceId: string | null) => {
    switch (deviceId) {
      case 'speaker':
      case 'force_speaker':
        return '🔊';
      case 'earpiece':
        return '📱';
      case 'bluetooth':
      case 'headset':
        return '🎧';
      default:
        return '🎧';
    }
  };

  return (
    <>
      <Pressable onPress={handleOpen}>
        <GlassCard style={styles.card}>
          <View style={styles.iconContainer}>
            <Text style={styles.icon}>{getDeviceIcon(currentDevice)}</Text>
          </View>
          <View style={styles.textContainer}>
            <Text style={styles.title}>Audio Routing</Text>
            <Text style={styles.desc}>{getDeviceLabel(currentDevice)}</Text>
          </View>
        </GlassCard>
      </Pressable>

      <Modal
        visible={isVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsVisible(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.content}>
            <Text style={styles.modalTitle}>Select Audio Output</Text>
            <Text style={styles.modalDesc}>
              Note: On Android, this will also route your microphone to the selected device if it has one (like a Bluetooth headset).
            </Text>

            {isLoading ? (
              <ActivityIndicator color="#00D4AA" style={{ marginVertical: 20 }} />
            ) : availableOutputs.length === 0 ? (
              <Text style={styles.emptyText}>
                No alternate audio outputs found.
              </Text>
            ) : (
              availableOutputs.map((deviceId) => (
                <Pressable
                  key={deviceId}
                  style={({ pressed }) => [
                    styles.item,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => handleSelect(deviceId)}
                >
                  <Text style={styles.itemIcon}>
                    {deviceId === 'speaker'
                      ? '🔊'
                      : deviceId === 'earpiece'
                      ? '📱'
                      : deviceId === 'bluetooth'
                      ? '🎧'
                      : deviceId === 'headset'
                      ? '🎧'
                      : '🔈'}
                  </Text>
                  <Text style={styles.itemText}>
                    {deviceId.charAt(0).toUpperCase() + deviceId.slice(1)}
                  </Text>
                </Pressable>
              ))
            )}

            <Pressable
              style={styles.cancelBtn}
              onPress={() => setIsVisible(false)}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  icon: {
    fontSize: 22,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  desc: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 24,
  },
  content: {
    backgroundColor: '#1E2336',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  modalTitle: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  modalDesc: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    marginBottom: 20,
    lineHeight: 18,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    marginVertical: 20,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  pressed: {
    opacity: 0.7,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  itemIcon: {
    fontSize: 24,
    marginRight: 16,
  },
  itemText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelBtn: {
    marginTop: 12,
    padding: 16,
    alignItems: 'center',
    borderRadius: 16,
    backgroundColor: 'rgba(255,71,87,0.1)',
  },
  cancelText: {
    color: '#FF4757',
    fontSize: 16,
    fontWeight: '700',
  },
});
