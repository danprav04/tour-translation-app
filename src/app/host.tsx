import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  Pressable,
  FlatList,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useHost } from '@/hooks/useHost';
import { useSettingsContext } from '@/context/SettingsContext';
import { SUPPORTED_LANGUAGES } from '@/constants/languages';
import GlassCard from '@/components/GlassCard';
import ToggleCard from '@/components/ToggleCard';
import StatusBadge from '@/components/StatusBadge';
import QRCodeDisplay from '@/components/QRCodeDisplay';
import ListenerCard from '@/components/ListenerCard';
import AudioVisualizer from '@/components/AudioVisualizer';

export default function HostScreen() {
  const router = useRouter();
  const { settings } = useSettingsContext();
  const {
    roomCode,
    listeners,
    isMicActive,
    isTranslating,
    isEchoEnabled,
    isConnected,
    selectedLanguage,
    startRoom,
    stopRoom,
    toggleMic,
    toggleTranslation,
    toggleEcho,
    setLanguage,
    kickListener,
    renameListener,
  } = useHost();

  const handleStart = async () => {
    if (!settings.serverUrl) {
      Alert.alert('Server Required', 'Please configure the server URL in Settings first.');
      return;
    }
    await startRoom();
  };

  const handleStop = () => {
    Alert.alert(
      'End Session',
      'This will disconnect all listeners. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'End Session', style: 'destructive', onPress: stopRoom },
      ]
    );
  };

  const handleTranslationToggle = (value: boolean) => {
    if (value && !settings.geminiApiKey) {
      Alert.alert(
        'API Key Required',
        'Please add your Gemini API key in Settings to use live translation.'
      );
      return;
    }
    toggleTranslation();
  };

  // Not connected / no room yet
  if (!roomCode) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} hitSlop={16}>
              <Text style={styles.backBtn}>← Back</Text>
            </Pressable>
            <Text style={styles.title}>Host Mode</Text>
            <View style={styles.placeholder} />
          </View>

          <View style={styles.startContainer}>
            <Text style={styles.startIcon}>📡</Text>
            <Text style={styles.startTitle}>Ready to Broadcast</Text>
            <Text style={styles.startDesc}>
              Create a session and share the QR code with your group to start broadcasting audio.
            </Text>
            <Pressable
              onPress={handleStart}
              style={({ pressed }) => [styles.startBtn, pressed && styles.pressed]}
            >
              <Text style={styles.startBtnText}>Create Session</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <StatusBadge
            status={isMicActive ? 'broadcasting' : 'connected'}
            label={isMicActive ? `Live · ${listeners.length} listeners` : 'Session Active'}
          />
          <Pressable onPress={handleStop} hitSlop={8}>
            <Text style={styles.endBtn}>End Session</Text>
          </Pressable>
        </View>

        {/* QR Code */}
        <GlassCard variant="primary" style={styles.section}>
          <Text style={styles.sectionTitle}>Invite Listeners</Text>
          <QRCodeDisplay roomCode={roomCode} serverUrl={settings.serverUrl} />
        </GlassCard>

        {/* Audio Controls */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Audio Controls</Text>
          <View style={styles.controlsGap}>
            <ToggleCard
              icon="🎤"
              label="Microphone"
              description="Broadcast microphone audio to listeners"
              value={isMicActive}
              onToggle={toggleMic}
              accentColor="#00D4AA"
            >
              {/* Translation sub-toggle */}
              <View style={styles.translationRow}>
                <ToggleCard
                  icon="🌐"
                  label="Live Translation"
                  description="AI-powered real-time translation"
                  value={isTranslating}
                  onToggle={handleTranslationToggle}
                  accentColor="#7C5CFC"
                  style={styles.subToggle}
                >
                  {/* Language selector */}
                  <View style={styles.languageGrid}>
                    {SUPPORTED_LANGUAGES.map((lang) => (
                      <Pressable
                        key={lang.code}
                        onPress={() => setLanguage(lang.code)}
                        style={[
                          styles.langBtn,
                          selectedLanguage === lang.code && styles.langBtnActive,
                        ]}
                      >
                        <Text style={styles.langFlag}>{lang.flag}</Text>
                        <Text
                          style={[
                            styles.langName,
                            selectedLanguage === lang.code && styles.langNameActive,
                          ]}
                        >
                          {lang.name}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  
                  {/* Local Echo Sub-toggle */}
                  <View style={{ marginTop: 12 }}>
                    <ToggleCard
                      icon="🔊"
                      label="Local Echo"
                      description="Hear the translated audio on your own speaker (use headphones to avoid feedback)"
                      value={isEchoEnabled}
                      onToggle={toggleEcho}
                      accentColor="#FF5C93"
                      style={{ padding: 12, backgroundColor: 'rgba(255,255,255,0.02)' }}
                    />
                  </View>
                </ToggleCard>
              </View>
            </ToggleCard>
          </View>
        </View>

        {/* Audio Visualizer */}
        {isMicActive && (
          <GlassCard style={styles.section} padding={24}>
            <AudioVisualizer
              isActive={isMicActive}
              barCount={12}
              color={isTranslating ? '#7C5CFC' : '#00D4AA'}
              height={50}
            />
          </GlassCard>
        )}

        {/* Connected Listeners */}
        <View style={styles.section}>
          <View style={styles.listenerHeader}>
            <Text style={styles.sectionTitle}>
              Connected Listeners ({listeners.length})
            </Text>
          </View>
          {listeners.length === 0 ? (
            <GlassCard padding={32}>
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>👥</Text>
                <Text style={styles.emptyText}>
                  Waiting for listeners to join...
                </Text>
                <Text style={styles.emptyHint}>
                  Share the QR code above
                </Text>
              </View>
            </GlassCard>
          ) : (
            listeners.map((listener) => (
              <ListenerCard
                key={listener.id}
                id={listener.id}
                name={listener.name}
                joinedAt={listener.joinedAt}
                onKick={kickListener}
                onRename={renameListener}
              />
            ))
          )}
        </View>
      </ScrollView>
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
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
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
  endBtn: {
    color: '#FF4757',
    fontSize: 14,
    fontWeight: '700',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,71,87,0.3)',
    overflow: 'hidden',
    backgroundColor: 'rgba(255,71,87,0.08)',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 14,
  },
  controlsGap: {
    gap: 12,
  },
  translationRow: {
    marginTop: 0,
  },
  subToggle: {
    backgroundColor: 'rgba(124,92,252,0.06)',
    borderColor: 'rgba(124,92,252,0.15)',
  },
  languageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  langBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 6,
  },
  langBtnActive: {
    backgroundColor: 'rgba(124,92,252,0.15)',
    borderColor: 'rgba(124,92,252,0.4)',
  },
  langFlag: {
    fontSize: 18,
  },
  langName: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontWeight: '600',
  },
  langNameActive: {
    color: '#FFFFFF',
  },
  listenerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  emptyState: {
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 15,
    fontWeight: '500',
  },
  emptyHint: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: 13,
    marginTop: 4,
  },
  startContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 80,
  },
  startIcon: {
    fontSize: 64,
    marginBottom: 20,
  },
  startTitle: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 12,
  },
  startDesc: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 32,
    marginBottom: 32,
  },
  startBtn: {
    backgroundColor: '#00D4AA',
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 16,
  },
  startBtnText: {
    color: '#0A0E1A',
    fontSize: 17,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
});
