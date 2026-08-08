import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Platform, StyleSheet } from 'react-native';
import { AudioSession } from '@livekit/react-native';
import GlassCard from './GlassCard';

export default function AudioDeviceSelector() {
  const [outputs, setOutputs] = useState<string[]>([]);
  const [activeOutput, setActiveOutput] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS === 'android') {
      const fetchDevices = async () => {
        try {
          const devices = await AudioSession.getAudioOutputs();
          setOutputs(devices);
          // AudioSession doesn't natively expose the "current" route easily via a sync property, 
          // but we can default to speaker or leave it null until selected.
          if (devices.includes('speaker') && !activeOutput) {
            setActiveOutput('speaker'); // Most common default
          }
        } catch (e) {
          console.error("Failed to fetch audio outputs", e);
        }
      };
      fetchDevices();
    }
  }, []);

  const handleAndroidSelect = async (output: string) => {
    try {
      await AudioSession.selectAudioOutput(output);
      setActiveOutput(output);
    } catch (e) {
      console.error("Failed to select audio output", e);
    }
  };

  const handleIOSSelect = async () => {
    try {
      await AudioSession.showAudioRoutePicker();
    } catch (e) {
      console.error("Failed to show audio route picker", e);
    }
  };

  if (Platform.OS === 'ios') {
    return (
      <GlassCard style={styles.card} padding={16}>
        <View style={styles.row}>
          <Text style={styles.icon}>🎧</Text>
          <View style={styles.textCol}>
            <Text style={styles.title}>Audio Route</Text>
            <Text style={styles.desc}>Select input/output device</Text>
          </View>
          <Pressable onPress={handleIOSSelect} style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}>
            <Text style={styles.btnText}>Change</Text>
          </Pressable>
        </View>
      </GlassCard>
    );
  }

  // Android
  if (outputs.length === 0) return null; // Not ready or no devices

  return (
    <GlassCard style={styles.card} padding={16}>
      <Text style={styles.title}><Text style={styles.icon}>🎧</Text> Audio Route</Text>
      <Text style={[styles.desc, { marginBottom: 12 }]}>Select input/output device</Text>
      <View style={styles.chipContainer}>
        {outputs.map((out) => (
          <Pressable
            key={out}
            style={[styles.chip, activeOutput === out && styles.chipActive]}
            onPress={() => handleAndroidSelect(out)}
          >
            <Text style={[styles.chipText, activeOutput === out && styles.chipTextActive]}>
              {out.charAt(0).toUpperCase() + out.slice(1)}
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  icon: {
    fontSize: 20,
    marginRight: 12,
  },
  textCol: {
    flex: 1,
  },
  title: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  desc: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    marginTop: 2,
  },
  btn: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  btnPressed: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  btnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
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
