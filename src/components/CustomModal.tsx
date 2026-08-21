import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ModalProps,
  ViewStyle,
} from 'react-native';

interface CustomModalProps extends ModalProps {
  visible: boolean;
  onClose?: () => void;
  title?: string;
  children: React.ReactNode;
  showCloseButton?: boolean;
  useKeyboardAvoidingView?: boolean;
  contentStyle?: ViewStyle;
}

export default function CustomModal({
  visible,
  onClose,
  title,
  children,
  showCloseButton = false,
  useKeyboardAvoidingView = false,
  contentStyle,
  ...rest
}: CustomModalProps) {
  const content = (
    <View style={[styles.modalContent, contentStyle]}>
      {(title || showCloseButton) && (
        <View style={styles.header}>
          {title ? <Text style={styles.title}>{title}</Text> : <View />}
          {showCloseButton && (
            <Pressable onPress={onClose} style={styles.closeBtnWrapper}>
              <Text style={styles.closeBtn}>✕</Text>
            </Pressable>
          )}
        </View>
      )}
      {children}
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType={rest.animationType || "fade"}
      onRequestClose={onClose}
      {...rest}
    >
      {useKeyboardAvoidingView ? (
        <KeyboardAvoidingView
          style={styles.overlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {content}
        </KeyboardAvoidingView>
      ) : (
        <View style={styles.overlay}>
          {content}
        </View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 24,
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#1E2336',
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    width: '100%',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  closeBtnWrapper: {
    padding: 5,
  },
  closeBtn: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 20,
    fontWeight: 'bold',
  },
});
