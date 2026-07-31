import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Animated, Easing } from 'react-native';

interface AudioVisualizerProps {
  isActive: boolean;
  audioLevel?: number;
  barCount?: number;
  color?: string;
  height?: number;
}

export default function AudioVisualizer({
  isActive,
  audioLevel = 0,
  barCount = 5,
  color = '#00D4AA',
  height = 40,
}: AudioVisualizerProps) {
  const [anims] = useState(() =>
    Array.from({ length: barCount }, () => new Animated.Value(0.15))
  );

  useEffect(() => {
    if (isActive) {
      // Animate based on the current audio level
      const targetBase = Math.max(0.15, audioLevel);
      const animations = anims.map((anim) => {
        // Add a slight random variation so bars don't move exactly the same
        const variation = 0.5 + Math.random() * 0.8; 
        const toValue = Math.min(1.0, targetBase * variation);
        
        return Animated.timing(anim, {
          toValue,
          duration: 150, // quick transition for responsiveness
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        });
      });
      Animated.parallel(animations).start();
    } else {
      const animations = anims.map((anim) =>
        Animated.timing(anim, {
          toValue: 0.15,
          duration: 300,
          useNativeDriver: true,
        })
      );
      Animated.parallel(animations).start();
    }
  }, [isActive, audioLevel, anims]);

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
