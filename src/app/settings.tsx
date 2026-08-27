import React, { useState, useEffect } from 'react';
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
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Updates from 'expo-updates';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import packageJson from '../../package.json';
import { useSettingsContext } from '@/context/SettingsContext';
import GlassCard from '@/components/GlassCard';

const DONT_KILL_MY_APP_SCORES: Record<string, number> = {
  'xiaomi': 5, 'samsung': 5, 'oneplus': 5, 'huawei': 5,
  'ulefone': 4, 'oppo': 4, 'meizu': 4, 'asus': 4,
  'wiko': 3, 'vivo': 3, 'tecno': 3, 'realme': 3, 'motorola': 3, 'lenovo': 3, 'blackview': 3,
  'unihertz': 2, 'sony': 2,
  'google': 0, 'nokia': 0, 'htc': 0, 'stock-android': 0,
};

export const appSubversion = '07';

export default function SettingsScreen() {
  const router = useRouter();
  const { settings, updateSettings } = useSettingsContext();
  const [serverUrl, setServerUrl] = useState(settings.serverUrl);
  const [apiKey, setApiKey] = useState(settings.geminiApiKey);
  const [deviceName, setDeviceName] = useState(settings.deviceName);
  const [useLegacy, setUseLegacy] = useState(settings.useLegacyWebSockets);
  const [showBugReport, setShowBugReport] = useState(settings.showBugReportButton ?? true);
  const [micAmplification, setMicAmplification] = useState(settings.micAmplification ?? 3.0);
  const [showApiKey, setShowApiKey] = useState(false);
  const [isBatteryOptimized, setIsBatteryOptimized] = useState<boolean | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customTextPromptInjection, setCustomTextPromptInjection] = useState(settings.customTextPromptInjection ?? '');
  const [customVoicePromptInjection, setCustomVoicePromptInjection] = useState(settings.customVoicePromptInjection ?? '');
  const [transcriptionMode, setTranscriptionMode] = useState<'SMART' | 'VERBATIM'>(settings.transcriptionMode ?? 'SMART');
  const [customVocabulary, setCustomVocabulary] = useState(settings.customVocabulary ?? '');

  useEffect(() => {
    if (Platform.OS === 'android') {
      import('expo-battery').then((Battery) => {
        Battery.isBatteryOptimizationEnabledAsync().then((enabled) => {
          setIsBatteryOptimized(enabled);
        });
      });
    }
  }, []);

  const handleOpenBatterySettings = async () => {
    if (Platform.OS === 'android') {
      try {
        const IntentLauncher = await import('expo-intent-launcher');
        await IntentLauncher.startActivityAsync(
          IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS
        );
        // We re-check after returning from settings
        setTimeout(() => {
          import('expo-battery').then((Battery) => {
            Battery.isBatteryOptimizationEnabledAsync().then((enabled) => {
              setIsBatteryOptimized(enabled);
            });
          });
        }, 2000);
      } catch (error) {
        console.error('Failed to open battery settings', error);
      }
    }
  };

  const handleSave = () => {
    updateSettings({
      serverUrl: serverUrl.trim(),
      geminiApiKey: apiKey.trim(),
      deviceName: deviceName.trim() || 'Listener Device',
      useLegacyWebSockets: useLegacy,
      showBugReportButton: showBugReport,
      micAmplification: micAmplification,
      customTextPromptInjection: customTextPromptInjection,
      customVoicePromptInjection: customVoicePromptInjection,
      transcriptionMode: transcriptionMode,
      customVocabulary: customVocabulary,
    });
  };

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      handleSave();
    }, 100);
    return () => clearTimeout(timeoutId);
  }, [
    serverUrl,
    apiKey,
    deviceName,
    customTextPromptInjection,
    customVoicePromptInjection,
    transcriptionMode,
    customVocabulary,
  ]);

  const appVersion = Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? packageJson.version ?? '1.0.0';
  const fullVersion = `${appVersion}.${appSubversion}`;
  const appName = Constants.expoConfig?.name ?? 'TourCast';

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
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
                  Alert.alert(
                    'Restart Required',
                    'Changing the audio engine requires the app to restart. Continue?',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Restart',
                        style: 'destructive',
                        onPress: async () => {
                          setUseLegacy(val);
                          await updateSettings({
                            ...settings,
                            serverUrl: serverUrl.trim(),
                            deviceName: deviceName.trim() || 'Listener Device',
                            geminiApiKey: apiKey.trim(),
                            useLegacyWebSockets: val,
                          });
                          await Updates.reloadAsync();
                        },
                      },
                    ]
                  );
                }}
                trackColor={{ false: 'rgba(255,255,255,0.1)', true: '#00D4AA' }}
                thumbColor="#FFFFFF"
              />
            </View>
          </GlassCard>

          {/* Microphone Boost */}
          <GlassCard style={styles.section}>
            <View style={styles.switchRow}>
              <View style={styles.switchTextContainer}>
                <Text style={styles.sectionTitle}>🎤 Microphone Boost</Text>
                <Text style={styles.sectionDesc}>
                  Amplify microphone input for quiet speakers. (Current: {micAmplification.toFixed(1)}x)
                </Text>
              </View>
              <View style={styles.stepperContainer}>
                <Pressable
                  onPress={() => {
                    const next = Math.max(1.0, micAmplification - 0.5);
                    setMicAmplification(next);
                    updateSettings({ ...settings, micAmplification: next });
                  }}
                  style={styles.stepperBtn}
                >
                  <Text style={styles.stepperBtnText}>-</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    const next = Math.min(5.0, micAmplification + 0.5);
                    setMicAmplification(next);
                    updateSettings({ ...settings, micAmplification: next });
                  }}
                  style={styles.stepperBtn}
                >
                  <Text style={styles.stepperBtnText}>+</Text>
                </Pressable>
              </View>
            </View>
          </GlassCard>

          {/* Bug Report Button Toggle */}
          <GlassCard style={styles.section}>
            <View style={styles.switchRow}>
              <View style={styles.switchTextContainer}>
                <Text style={styles.sectionTitle}>🐞 Bug Report Button</Text>
                <Text style={styles.sectionDesc}>
                  Show a floating button to easily report bugs and submit logs.
                </Text>
              </View>
              <Switch
                value={showBugReport}
                onValueChange={(val) => {
                  setShowBugReport(val);
                  updateSettings({
                    ...settings,
                    serverUrl: serverUrl.trim(),
                    deviceName: deviceName.trim() || 'Listener Device',
                    geminiApiKey: apiKey.trim(),
                    useLegacyWebSockets: useLegacy,
                    showBugReportButton: val,
                  });
                }}
                trackColor={{ false: 'rgba(255,255,255,0.1)', true: '#00D4AA' }}
                thumbColor="#FFFFFF"
              />
            </View>
          </GlassCard>

          {/* Battery Optimization (Android only) */}
          {Platform.OS === 'android' && (() => {
            const rawMfg = Device.manufacturer?.toLowerCase() || '';
            const mfg = rawMfg.replace(/\s+/g, '-');
            const hasGuide = mfg in DONT_KILL_MY_APP_SCORES;
            const score = hasGuide ? DONT_KILL_MY_APP_SCORES[mfg] : 0;
            
            let warnColor = '#00D4AA';
            let warnIcon = 'ℹ️';
            let warnText = 'Stock Android devices generally handle background apps well, but you may still want to review the guide.';
            let btnColor = 'rgba(0,212,170,0.1)';
            
            if (score >= 4) {
              warnColor = '#FF4757';
              warnIcon = '🚨';
              warnText = `${Device.manufacturer} devices aggressively kill background apps. Standard settings may not be enough. Please view the guide.`;
              btnColor = 'rgba(255,71,87,0.1)';
            } else if (score >= 2) {
              warnColor = '#FFAB00';
              warnIcon = '⚠️';
              warnText = `${Device.manufacturer} devices sometimes kill background apps. If you experience drops, please view the guide.`;
              btnColor = 'rgba(255,171,0,0.1)';
            }

            return (
              <GlassCard style={styles.section}>
                <View style={styles.switchRow}>
                  <View style={styles.switchTextContainer}>
                    <Text style={styles.sectionTitle}>🔋 Battery Optimization</Text>
                    <Text style={styles.sectionDesc}>
                      {isBatteryOptimized === false
                        ? 'App is unrestricted. Audio will run perfectly in background.'
                        : 'App is restricted. Audio may drop when screen is off.'}
                    </Text>
                  </View>
                  {(isBatteryOptimized !== false || hasGuide) && (
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {hasGuide && (
                        <Pressable 
                          style={[styles.batteryBtn, { backgroundColor: btnColor }]} 
                          onPress={() => Linking.openURL(`https://dontkillmyapp.com/${mfg}`)}
                        >
                          <Text style={[styles.batteryBtnText, { color: warnColor }]}>Guide</Text>
                        </Pressable>
                      )}
                      {isBatteryOptimized !== false && (
                        <Pressable style={styles.batteryBtn} onPress={handleOpenBatterySettings}>
                          <Text style={styles.batteryBtnText}>Fix</Text>
                        </Pressable>
                      )}
                    </View>
                  )}
                </View>
                {hasGuide && (
                  <Text style={[styles.sectionDesc, { marginTop: 12, color: warnColor }]}>
                    {warnIcon} {warnText}
                  </Text>
                )}
              </GlassCard>
            );
          })()}

          {/* Advanced Options */}
          <GlassCard style={styles.section}>
            <Pressable 
              onPress={() => setShowAdvanced(!showAdvanced)}
              style={styles.switchRow}
            >
              <View style={styles.switchTextContainer}>
                <Text style={styles.sectionTitle}>⚙️ Advanced Options</Text>
                <Text style={styles.sectionDesc}>
                  Custom prompt injections and other advanced settings
                </Text>
              </View>
              <Text style={{ color: '#00D4AA', fontSize: 20 }}>
                {showAdvanced ? '▼' : '▶'}
              </Text>
            </Pressable>
            
            {showAdvanced && (
              <View style={{ marginTop: 16 }}>
                <Text style={[styles.sectionTitle, { fontSize: 16 }]}>Smart Transcription</Text>
                <View style={[styles.switchRow, { marginBottom: 16, marginTop: 4 }]}>
                  <View style={styles.switchTextContainer}>
                    <Text style={styles.sectionDesc}>
                      Automatically remove filler words ("um", "uh") and format dates/numbers. Turn off for word-for-word Verbatim mode.
                    </Text>
                  </View>
                  <Switch
                    value={transcriptionMode === 'SMART'}
                    onValueChange={(val) => {
                      setTranscriptionMode(val ? 'SMART' : 'VERBATIM');
                    }}
                    trackColor={{ false: 'rgba(255,255,255,0.1)', true: '#00D4AA' }}
                    thumbColor="#FFFFFF"
                  />
                </View>

                <Text style={[styles.sectionTitle, { fontSize: 16 }]}>Custom Vocabulary</Text>
                <Text style={styles.sectionDesc}>
                  Comma-separated domain terms (e.g. "Eiffel Tower, Louvre") to improve recognition. Max 1,000 terms.
                </Text>
                <TextInput
                  style={[styles.input, { marginBottom: 16 }]}
                  value={customVocabulary}
                  onChangeText={setCustomVocabulary}
                  onBlur={handleSave}
                  placeholder="e.g. Louvre, Mona Lisa"
                  placeholderTextColor="rgba(255,255,255,0.2)"
                />

                <Text style={[styles.sectionTitle, { fontSize: 16 }]}>Text Translation Prompt</Text>
                <Text style={styles.sectionDesc}>
                  Add additional instructions to the text translation flow (e.g. tone, style).
                </Text>
                <TextInput
                  style={[styles.input, { minHeight: 80, textAlignVertical: 'top', marginBottom: 16 }]}
                  value={customTextPromptInjection}
                  onChangeText={setCustomTextPromptInjection}
                  onBlur={handleSave}
                  placeholder="e.g. Please speak formally..."
                  placeholderTextColor="rgba(255,255,255,0.2)"
                  multiline
                />

                <Text style={[styles.sectionTitle, { fontSize: 16 }]}>Voice Translation Prompt</Text>
                <Text style={styles.sectionDesc}>
                  Add additional instructions to the live voice-to-voice translation flow.
                </Text>
                <TextInput
                  style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
                  value={customVoicePromptInjection}
                  onChangeText={setCustomVoicePromptInjection}
                  onBlur={handleSave}
                  placeholder="e.g. Please speak formally..."
                  placeholderTextColor="rgba(255,255,255,0.2)"
                  multiline
                />
              </View>
            )}
          </GlassCard>

          {/* About */}
          <GlassCard style={styles.section}>
            <Text style={styles.sectionTitle}>ℹ️ About</Text>
            <Text style={styles.aboutText}>
              {appName} v{fullVersion}{'\n'}
              Real-time audio broadcasting for tour groups.{'\n'}
              Powered by Gemini Live Translate.
            </Text>
            <Pressable 
              onPress={() => Linking.openURL('https://github.com/danprav04/tour-translation-app')}
              style={{ marginTop: 12 }}
            >
              <Text style={[styles.aboutText, { color: '#00D4AA', textDecorationLine: 'underline' }]}>
                View on GitHub
              </Text>
            </Pressable>
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
    paddingBottom: 40,
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
  infoText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 12,
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepperBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  stepperBtnText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 24,
  },
  aboutText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    lineHeight: 22,
  },
  batteryBtn: {
    backgroundColor: '#00D4AA',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  batteryBtnText: {
    color: '#0A0E1A',
    fontWeight: '700',
    fontSize: 14,
  },
});
