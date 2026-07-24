import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Text, Animated, Easing } from 'react-native';

type StatusType = 'connected' | 'disconnected' | 'reconnecting' | 'broadcasting';

interface StatusBadgeProps {
  status: StatusType;
  label?: string;
}

const STATUS_CONFIG: Record<StatusType, { color: string; label: string }> = {
  connected: { color: '#00D4AA', label: 'Connected' },
  disconnected: { color: '#FF4757', label: 'Disconnected' },
  reconnecting: { color: '#FFA502', label: 'Reconnecting...' },
  broadcasting: { color: '#00D4AA', label: 'Broadcasting' },
};

export default function StatusBadge({ status, label }: StatusBadgeProps) {
  const [pulseAnim] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (status === 'broadcasting' || status === 'reconnecting') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.3,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [status]);

  const config = STATUS_CONFIG[status];
  const displayLabel = label || config.label;

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.dot,
          { backgroundColor: config.color, opacity: pulseAnim },
        ]}
      />
      <Text style={[styles.label, { color: config.color }]}>
        {displayLabel}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignSelf: 'flex-start',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});
