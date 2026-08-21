import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, AlertButton } from 'react-native';
import CustomModal from './CustomModal';

const customAlertRef = React.createRef<any>();

export class CustomAlert {
  static alert(title: string, message?: string, buttons?: AlertButton[]) {
    if (customAlertRef.current) {
      customAlertRef.current.alert(title, message, buttons);
    } else {
      console.warn("CustomAlert not mounted, fallback to console:", title, message);
    }
  }
}

export function GlobalCustomAlert() {
  const [visible, setVisible] = useState(false);
  const [config, setConfig] = useState<{
    title: string;
    message?: string;
    buttons?: AlertButton[];
  } | null>(null);

  React.useImperativeHandle(customAlertRef, () => ({
    alert: (title: string, message?: string, buttons?: AlertButton[]) => {
      setConfig({ title, message, buttons });
      setVisible(true);
    }
  }));

  const close = () => {
    setVisible(false);
  };

  if (!config) return <CustomModal visible={false}><View/></CustomModal>;

  const buttons = config.buttons && config.buttons.length > 0 ? config.buttons : [{ text: 'OK' }];

  return (
    <CustomModal
      visible={visible}
      onClose={close}
      title={config.title}
    >
      {!!config.message && (
        <Text style={styles.message}>{config.message}</Text>
      )}
      <View style={styles.buttonContainer}>
        {buttons.map((btn, index) => {
          const isCancel = btn.style === 'cancel';
          const isDestructive = btn.style === 'destructive';
          return (
            <Pressable
              key={index}
              style={[
                styles.button,
                isCancel && styles.cancelButton,
                isDestructive && styles.destructiveButton
              ]}
              onPress={() => {
                close();
                if (btn.onPress) btn.onPress();
              }}
            >
              <Text style={[
                styles.buttonText,
                isCancel && styles.cancelButtonText,
                isDestructive && styles.destructiveButtonText
              ]}>
                {(btn.text || 'OK').toUpperCase()}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </CustomModal>
  );
}

const styles = StyleSheet.create({
  message: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
    marginBottom: 24,
    lineHeight: 24,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    flexWrap: 'wrap',
  },
  button: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#00D4AA',
    borderRadius: 8,
  },
  buttonText: {
    color: '#0A0E1A',
    fontSize: 14,
    fontWeight: 'bold',
  },
  cancelButton: {
    backgroundColor: 'transparent',
  },
  cancelButtonText: {
    color: '#00D4AA',
  },
  destructiveButton: {
    backgroundColor: 'rgba(255,71,87,0.1)',
  },
  destructiveButtonText: {
    color: '#FF4757',
  }
});
