import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSettingsContext } from '@/context/SettingsContext';
import { useDebugContext } from '@/context/DebugContext';
import Constants from 'expo-constants';
import * as Device from 'expo-device';

export default function BugReportButton() {
  const { settings, isLoaded } = useSettingsContext();
  const { getDebugData } = useDebugContext();
  const [modalVisible, setModalVisible] = useState(false);
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isLoaded || settings.showBugReportButton === false) {
    return null;
  }

  const handleSubmit = async () => {
    if (!description.trim()) {
      Alert.alert('Error', 'Please enter a short description of the bug.');
      return;
    }

    if (!settings.serverUrl) {
      Alert.alert('Error', 'Server URL is not set in settings.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        description: description.trim(),
        settings: settings,
        debugData: getDebugData(),
        deviceInfo: {
          brand: Device.brand,
          modelName: Device.modelName,
          osName: Device.osName,
          osVersion: Device.osVersion,
          appVersion: Constants.expoConfig?.version ?? Constants.nativeAppVersion,
        },
        timestamp: new Date().toISOString(),
      };

      const serverUrl = settings.serverUrl.endsWith('/')
        ? settings.serverUrl.slice(0, -1)
        : settings.serverUrl;

      const response = await fetch(`${serverUrl}/api/bug-reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      Alert.alert('Success', 'Bug report submitted successfully!');
      setModalVisible(false);
      setDescription('');
    } catch (error) {
      console.error('Failed to submit bug report', error);
      Alert.alert('Error', 'Failed to submit bug report. Check your server connection.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Pressable
        style={styles.floatingBtn}
        onPress={() => setModalVisible(true)}
      >
        <Text style={styles.btnText}>🐞</Text>
      </Pressable>

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalContent}>
            <View style={styles.header}>
              <Text style={styles.title}>Report a Bug</Text>
              <Pressable onPress={() => setModalVisible(false)}>
                <Text style={styles.closeBtn}>✕</Text>
              </Pressable>
            </View>

            <Text style={styles.label}>Error Description</Text>
            <TextInput
              style={styles.input}
              placeholder="What went wrong?"
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            
            <Text style={styles.infoText}>
              Submitting this will include your app settings and device info for debugging.
            </Text>

            <Pressable
              style={styles.submitBtn}
              onPress={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#0A0E1A" />
              ) : (
                <Text style={styles.submitBtnText}>Submit Report</Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  floatingBtn: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  btnText: {
    fontSize: 24,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#1E2336',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  closeBtn: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 20,
    fontWeight: 'bold',
    padding: 5,
  },
  label: {
    color: '#FFFFFF',
    fontSize: 14,
    marginBottom: 8,
    fontWeight: '600',
  },
  input: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    color: '#FFFFFF',
    padding: 12,
    fontSize: 16,
    minHeight: 100,
    marginBottom: 16,
  },
  infoText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    marginBottom: 20,
    fontStyle: 'italic',
  },
  submitBtn: {
    backgroundColor: '#00D4AA',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitBtnText: {
    color: '#0A0E1A',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
