import React from 'react';
import {
  StyleSheet,
  View,
  Pressable,
  type ViewStyle,
  type StyleProp,
} from 'react-native';

interface GlassCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  variant?: 'default' | 'primary' | 'secondary' | 'danger';
  padding?: number;
}

const VARIANT_BORDERS: Record<string, string> = {
  default: 'rgba(255,255,255,0.08)',
  primary: 'rgba(0,212,170,0.25)',
  secondary: 'rgba(124,92,252,0.25)',
  danger: 'rgba(255,71,87,0.25)',
};

const VARIANT_GLOW: Record<string, string> = {
  default: 'transparent',
  primary: 'rgba(0,212,170,0.06)',
  secondary: 'rgba(124,92,252,0.06)',
  danger: 'rgba(255,71,87,0.06)',
};

export default function GlassCard({
  children,
  style,
  onPress,
  variant = 'default',
  padding = 20,
}: GlassCardProps) {
  const cardStyle: ViewStyle = {
    ...styles.card,
    borderColor: VARIANT_BORDERS[variant],
    backgroundColor: VARIANT_GLOW[variant] === 'transparent'
      ? 'rgba(255,255,255,0.04)'
      : VARIANT_GLOW[variant],
    padding,
  };

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          cardStyle,
          pressed && styles.pressed,
          style,
        ]}
      >
        {children}
      </Pressable>
    );
  }

  return <View style={[cardStyle, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
});
