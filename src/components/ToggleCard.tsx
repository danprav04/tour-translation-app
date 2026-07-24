import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  Switch,
  type ViewStyle,
  type StyleProp,
} from 'react-native';

interface ToggleCardProps {
  icon: string;
  label: string;
  description?: string;
  value: boolean;
  onToggle: (value: boolean) => void;
  disabled?: boolean;
  accentColor?: string;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

export default function ToggleCard({
  icon,
  label,
  description,
  value,
  onToggle,
  disabled = false,
  accentColor = '#00D4AA',
  style,
  children,
}: ToggleCardProps) {
  return (
    <View style={[styles.container, style]}>
      <View style={styles.header}>
        <View style={styles.labelRow}>
          <Text style={styles.icon}>{icon}</Text>
          <View style={styles.textContainer}>
            <Text style={[styles.label, disabled && styles.disabledText]}>
              {label}
            </Text>
            {description && (
              <Text style={[styles.description, disabled && styles.disabledText]}>
                {description}
              </Text>
            )}
          </View>
        </View>
        <Switch
          value={value}
          onValueChange={onToggle}
          disabled={disabled}
          trackColor={{
            false: 'rgba(255,255,255,0.1)',
            true: accentColor,
          }}
          thumbColor={value ? '#FFFFFF' : 'rgba(255,255,255,0.6)'}
          ios_backgroundColor="rgba(255,255,255,0.1)"
        />
      </View>
      {value && children && <View style={styles.childContainer}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  icon: {
    fontSize: 24,
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  label: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  description: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    marginTop: 2,
  },
  disabledText: {
    opacity: 0.4,
  },
  childContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
});
