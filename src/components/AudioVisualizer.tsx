import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Animated, Easing } from 'react-native';

interface AudioVisualizerProps {
  isActive: boolean;
  barCount?: number;
  color?: string;
  height?: number;
}

export default function AudioVisualizer({
  isActive,
  barCount = 5,
  color = '#00D4AA',
  height = 40,
}: AudioVisualizerProps) {
  const [anims] = useState(() =>
    Array.from({ length: barCount }, () => new Animated.Value(0.15))
  );

  useEffect(() => {
    if (isActive) {
      const animations = anims.map((anim, i) =>
        Animated.loop(
          Animated.sequence([
            Animated.timing(anim, {
              toValue: 0.3 + Math.random() * 0.7,
              duration: 300 + Math.random() * 400,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
              delay: i * 80,
            }),
            Animated.timing(anim, {
              toValue: 0.15 + Math.random() * 0.2,
              duration: 300 + Math.random() * 400,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
          ])
        )
      );
      animations.forEach((a) => a.start());
      return () => animations.forEach((a) => a.stop());
    } else {
      anims.forEach((anim) => {
        Animated.timing(anim, {
          toValue: 0.15,
          duration: 300,
          useNativeDriver: true,
        }).start();
      });
    }
  }, [isActive, anims]);

  return (
    <View style={[styles.container, { height }]}>
      {anims.map((anim, i) => (
        <Animated.View
          key={i}
          style={[
            styles.bar,
            {
              backgroundColor: color,
              height,
              transform: [{ scaleY: anim }],
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  bar: {
    width: 4,
    borderRadius: 2,
  },
});
