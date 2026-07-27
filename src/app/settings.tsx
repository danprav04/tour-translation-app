import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useSettingsContext } from '@/context/SettingsContext';
import GlassCard from '@/components/GlassCard';

export default function SettingsScreen() {
  const router = useRouter();
  const { settings, updateSettings } = useSettingsContext();
  const [serverUrl, setServerUrl] = useState(settings.serverUrl);
  const [apiKey, setApiKey] = useState(settings.geminiApiKey);
  const [deviceName, setDeviceName] = useState(settings.deviceName);
  const [useLegacy, setUseLegacy] = useState(settings.useLegacyWebSockets);
  const [showApiKey, setShowApiKey] = useState(false);

  const handleSave = () => {
    updateSettings({
      serverUrl: serverUrl.trim(),
      geminiApiKey: apiKey.trim(),
      deviceName: deviceName.trim() || 'Listener Device',
      useLegacyWebSockets: useLegacy,
    });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} hitSlop={16}>
              <Text style={styles.backBtn}>← Back</Text>
            </Pressable>
            <Text style={styles.title}>Settings</Text>
            <View style={styles.placeholder} />
          </View>

          {/* Server URL */}
          <GlassCard style={styles.section}>
            <Text style={styles.sectionTitle}>🌐 Server Connection</Text>
            <Text style={styles.sectionDesc}>
              URL of the relay server (include http:// or https://)
            </Text>
            <TextInput
              style={styles.input}
              value={serverUrl}
              onChangeText={setServerUrl}
              onBlur={handleSave}
              placeholder="e.g. https://tour.myserver.com"
              placeholderTextColor="rgba(255,255,255,0.2)"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </GlassCard>

          {/* Device Name */}
          <GlassCard style={styles.section}>
            <Text style={styles.sectionTitle}>📱 Device Name</Text>
            <Text style={styles.sectionDesc}>
              This is the name that the host will see when you join a room.
            </Text>
            <TextInput
              style={styles.input}
              value={deviceName}
              onChangeText={setDeviceName}
              onBlur={handleSave}
              placeholder="e.g. Galaxy S25"
              placeholderTextColor="rgba(255,255,255,0.2)"
            />
          </GlassCard>

          {/* API Key */}
          <GlassCard style={styles.section}>
            <Text style={styles.sectionTitle}>🔑 Gemini API Key</Text>
            <Text style={styles.sectionDesc}>
              Required for live translation. Get yours at ai.google.dev
            </Text>
            <View style={styles.apiKeyRow}>
              <TextInput
                style={[styles.input, styles.apiKeyInput]}
                value={apiKey}
                onChangeText={setApiKey}
                onBlur={handleSave}
                placeholder="Enter your Gemini API key"
                placeholderTextColor="rgba(255,255,255,0.2)"
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry={!showApiKey}
              />
              <Pressable
                onPress={() => setShowApiKey(!showApiKey)}
                style={styles.eyeBtn}
              >
                <Text style={styles.eyeIcon}>{showApiKey ? '🙈' : '👁️'}</Text>
              </Pressable>
            </View>
            {apiKey ? (
              <View style={styles.keyStatus}>
                <Text style={styles.keyStatusDot}>●</Text>
                <Text style={styles.keyStatusText}>Key configured</Text>
              </View>
            ) : (
              <View style={styles.keyStatus}>
                <Text style={[styles.keyStatusDot, styles.keyMissing]}>●</Text>
                <Text style={[styles.keyStatusText, styles.keyMissing]}>
                  No key set — translation won't work
                </Text>
              </View>
            )}
          </GlassCard>

          {/* Legacy Mode Toggle */}
          <GlassCard style={styles.section}>
            <View style={styles.switchRow}>
              <View style={styles.switchTextContainer}>
                <Text style={styles.sectionTitle}>📡 Legacy Socket.io Mode</Text>
                <Text style={styles.sectionDesc}>
                  Use the older WebSocket audio engine instead of LiveKit Cloud.
                </Text>
              </View>
              <Switch
                value={useLegacy}
                onValueChange={(val) => {
                  setUseLegacy(val);
                  // Need to save immediately when switch toggles since it doesn't blur
                  updateSettings({
                    ...settings,
                    serverUrl: serverUrl.trim(),
                    deviceName: deviceName.trim() || 'Listener Device',
                    geminiApiKey: apiKey.trim(),
                    useLegacyWebSockets: val,
                  });
                }}
                trackColor={{ false: 'rgba(255,255,255,0.1)', true: '#00D4AA' }}
                thumbColor="#FFFFFF"
              />
            </View>
          </GlassCard>

          {/* About */}
          <GlassCard style={styles.section}>
            <Text style={styles.sectionTitle}>ℹ️ About</Text>
            <Text style={styles.aboutText}>
              TourCast v1.0.0{'\n'}
              Real-time audio broadcasting for tour groups.{'\n'}
              Powered by Gemini Live Translate.
            </Text>
          </GlassCard>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0A0E1A',
  },
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 32,
  },
  backBtn: {
    color: '#00D4AA',
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
  placeholder: {
    width: 60,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchTextContainer: {
    flex: 1,
    paddingRight: 16,
  },
  sectionDesc: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    marginBottom: 16,
    lineHeight: 18,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#FFFFFF',
    fontSize: 15,
  },
  apiKeyRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  apiKeyInput: {
    flex: 1,
    marginRight: 8,
  },
  eyeBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyeIcon: {
    fontSize: 20,
  },
  keyStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  keyStatusDot: {
    color: '#00D4AA',
    fontSize: 10,
    marginRight: 8,
  },
  keyStatusText: {
    color: '#00D4AA',
    fontSize: 13,
    fontWeight: '500',
  },
  keyMissing: {
    color: '#FFA502',
  },
  aboutText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    lineHeight: 22,
  },
});
