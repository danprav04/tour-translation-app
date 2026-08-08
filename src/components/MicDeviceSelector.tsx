import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRoomContext } from '@livekit/react-native';
import GlassCard from './GlassCard';

export default function MicDeviceSelector() {
  const room = useRoomContext();
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const [activeInputId, setActiveInputId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchDevices = async () => {
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const audioInputs = devices.filter((d) => d.kind === 'audioinput');
          if (isMounted) {
            setInputs(audioInputs);
          }
        }
      } catch (e) {
        console.error("Failed to fetch mic devices", e);
      }
    };
    fetchDevices();
  }, []);

  const handleSelect = async (deviceId: string) => {
    try {
      if (room) {
        await room.switchActiveDevice('audioinput', deviceId);
        setActiveInputId(deviceId);
      }
    } catch (e) {
      console.error("Failed to select mic", e);
    }
  };

  if (!room || inputs.length <= 1) return null; // No need to show if only 1 mic or no room

  return (
    <GlassCard style={styles.card} padding={16}>
      <Text style={styles.title}><Text style={styles.icon}>🎙️</Text> Input Microphone</Text>
      <Text style={[styles.desc, { marginBottom: 12 }]}>Select input device</Text>
      <View style={styles.chipContainer}>
        {inputs.map((mic) => (
          <Pressable
            key={mic.deviceId}
            style={[styles.chip, activeInputId === mic.deviceId && styles.chipActive]}
            onPress={() => handleSelect(mic.deviceId)}
          >
            <Text style={[styles.chipText, activeInputId === mic.deviceId && styles.chipTextActive]}>
              {mic.label || `Microphone ${mic.deviceId.substring(0, 4)}`}
            </Text>
          </Pressable>
        ))}
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 12,
  },
  title: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  icon: {
    fontSize: 20,
    marginRight: 12,
  },
  desc: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    marginTop: 2,
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  chipActive: {
    backgroundColor: 'rgba(0,212,170,0.15)',
    borderColor: '#00D4AA',
  },
  chipText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
  },
  chipTextActive: {
    color: '#00D4AA',
    fontWeight: '600',
  },
});
