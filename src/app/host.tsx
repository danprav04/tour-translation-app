import React, { useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useHost } from '@/hooks/useHost';
import { useTTS } from '@/hooks/useTTS';
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
    pauseForTTS,
    resumeAfterTTS,
  } = useHost();

  const onTTSStart = useCallback(async () => {
    await pauseForTTS();
  }, [pauseForTTS]);

  const onTTSEnd = useCallback(async () => {
    await resumeAfterTTS();
  }, [resumeAfterTTS]);

  const {
    ttsText,
    isGenerating,
    isTTSPlaying,
    playbackPosition,
    playbackDuration,
    error: ttsError,
    hasAudio,
    setTTSText,
    generate,
    play,
    pause,
    seek,
    clear,
    formatTime,
  } = useTTS({
    apiKey: settings.geminiApiKey,
    onTTSStart,
    onTTSEnd,
  });

  const handleStart = async () => {
    if (!settings.serverUrl) {
      Alert.alert('Server Required', 'Please configure the server URL in Settings first.');
      return;
    }
    try {
      await startRoom();
    } catch (error: any) {
      Alert.alert('Failed to Start', error.message || 'Could not start the session. Check your server connection.');
    }
  };

  const handleStop = () => {
    Alert.alert(
      'End Session',
      'This will disconnect all listeners. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'End Session', 
          style: 'destructive', 
          onPress: () => {
            clear();
            stopRoom();
          }
        },
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

  const handleGenerateTTS = () => {
    if (!settings.geminiApiKey) {
      Alert.alert(
        'API Key Required',
        'Please add your Gemini API key in Settings to use text-to-speech.'
      );
      return;
    }
    generate();
  };

  const handleSeek = (evt: { nativeEvent: { locationX: number } }, trackWidth: number) => {
    if (playbackDuration <= 0 || trackWidth <= 0) return;
    const ratio = Math.max(0, Math.min(1, evt.nativeEvent.locationX / trackWidth));
    seek(ratio * playbackDuration);
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

  const seekProgress = playbackDuration > 0 ? playbackPosition / playbackDuration : 0;

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
            status={isTTSPlaying ? 'broadcasting' : isMicActive ? 'broadcasting' : 'connected'}
            label={
              isTTSPlaying
                ? '📡 Broadcasting TTS'
                : isMicActive
                  ? `Live · ${listeners.length} listeners`
                  : 'Session Active'
            }
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
              description={isTTSPlaying ? 'Paused — TTS is broadcasting' : 'Broadcast microphone audio to listeners'}
              value={isMicActive}
              onToggle={toggleMic}
              accentColor="#00D4AA"
              disabled={isTTSPlaying}
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

        {/* ─── TTS Panel ─── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📢 Text-to-Speech Broadcast</Text>
          <GlassCard style={styles.ttsCard}>
            {/* Text Input */}
            <TextInput
              style={styles.ttsInput}
              value={ttsText}
              onChangeText={setTTSText}
              placeholder="Type a message to broadcast as speech..."
              placeholderTextColor="rgba(255,255,255,0.25)"
              multiline
              textAlignVertical="top"
              editable={!isGenerating}
            />

            {/* Error Message */}
            {ttsError && (
              <View style={styles.ttsErrorContainer}>
                <Text style={styles.ttsErrorText}>⚠️ {ttsError}</Text>
              </View>
            )}

            {/* Generate Button */}
            {!hasAudio && (
              <Pressable
                onPress={handleGenerateTTS}
                disabled={isGenerating || !ttsText.trim()}
                style={({ pressed }) => [
                  styles.ttsGenerateBtn,
                  (!ttsText.trim() || isGenerating) && styles.ttsGenerateBtnDisabled,
                  pressed && styles.pressed,
                ]}
              >
                {isGenerating ? (
                  <View style={styles.ttsGeneratingRow}>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                    <Text style={styles.ttsGenerateBtnText}>Generating...</Text>
                  </View>
                ) : (
                  <Text style={styles.ttsGenerateBtnText}>🎙️ Generate Audio</Text>
                )}
              </Pressable>
            )}

            {/* Audio Player */}
            {hasAudio && (
              <View style={styles.ttsPlayer}>
                {/* Play/Pause + Seek + Time */}
                <View style={styles.ttsPlayerControls}>
                  {/* Play/Pause Button */}
                  <Pressable
                    onPress={isTTSPlaying ? pause : play}
                    style={({ pressed }) => [
                      styles.ttsPlayPauseBtn,
                      isTTSPlaying && styles.ttsPlayPauseBtnActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.ttsPlayPauseIcon}>
                      {isTTSPlaying ? '⏸' : '▶️'}
                    </Text>
                  </Pressable>

                  {/* Seek Bar */}
                  <View style={styles.ttsSeekContainer}>
                    <Pressable
                      onPress={(e) => handleSeek(e, seekTrackWidth)}
                      style={styles.ttsSeekTrack}
                      onLayout={(e) => {
                        seekTrackWidthRef.current = e.nativeEvent.layout.width;
                      }}
                    >
                      <View
                        style={[
                          styles.ttsSeekFill,
                          { width: `${seekProgress * 100}%` },
                        ]}
                      />
                      <View
                        style={[
                          styles.ttsSeekThumb,
                          { left: `${seekProgress * 100}%` },
                        ]}
                      />
                    </Pressable>
                  </View>

                  {/* Time Display */}
                  <Text style={styles.ttsTimeText}>
                    {formatTime(playbackPosition)}/{formatTime(playbackDuration)}
                  </Text>
                </View>

                {/* Clear Button */}
                <Pressable
                  onPress={clear}
                  style={({ pressed }) => [
                    styles.ttsClearBtn,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.ttsClearBtnText}>✕ Clear Audio</Text>
                </Pressable>

                {/* Broadcasting indicator */}
                {isTTSPlaying && (
                  <View style={styles.ttsBroadcastingBadge}>
                    <View style={styles.ttsBroadcastingDot} />
                    <Text style={styles.ttsBroadcastingText}>Broadcasting to listeners...</Text>
                  </View>
                )}
              </View>
            )}
          </GlassCard>
        </View>

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

// Track width for seek calculations — stored via closure
let seekTrackWidthRef = { current: 200 };
let seekTrackWidth = 200;

// Update seekTrackWidth from ref on layout
Object.defineProperty(seekTrackWidthRef, 'current', {
  get() { return seekTrackWidth; },
  set(v) { seekTrackWidth = v; },
});

const TTS_ACCENT = '#a78bfa';
const TTS_ACCENT_DIM = 'rgba(167,139,250,0.15)';
const TTS_ACCENT_BRIGHT = 'rgba(167,139,250,0.4)';

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

  // ─── TTS Panel Styles ───
  ttsCard: {
    padding: 0,
    overflow: 'hidden',
    borderColor: TTS_ACCENT_BRIGHT,
    backgroundColor: TTS_ACCENT_DIM,
  },
  ttsInput: {
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 22,
    minHeight: 100,
    maxHeight: 180,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  ttsErrorContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,71,87,0.1)',
  },
  ttsErrorText: {
    color: '#FF4757',
    fontSize: 13,
    fontWeight: '500',
  },
  ttsGenerateBtn: {
    margin: 16,
    backgroundColor: TTS_ACCENT,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ttsGenerateBtnDisabled: {
    opacity: 0.4,
  },
  ttsGeneratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ttsGenerateBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  ttsPlayer: {
    padding: 16,
    gap: 12,
  },
  ttsPlayerControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  ttsPlayPauseBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: TTS_ACCENT_DIM,
    borderWidth: 1.5,
    borderColor: TTS_ACCENT_BRIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ttsPlayPauseBtnActive: {
    backgroundColor: TTS_ACCENT,
    borderColor: TTS_ACCENT,
  },
  ttsPlayPauseIcon: {
    fontSize: 18,
  },
  ttsSeekContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  ttsSeekTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.1)',
    position: 'relative',
    overflow: 'visible',
  },
  ttsSeekFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: TTS_ACCENT,
  },
  ttsSeekThumb: {
    position: 'absolute',
    top: -5,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    marginLeft: -8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },
  ttsTimeText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '600',
    minWidth: 72,
    textAlign: 'right',
  },
  ttsClearBtn: {
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  ttsClearBtnText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '600',
  },
  ttsBroadcastingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(167,139,250,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.3)',
    gap: 8,
  },
  ttsBroadcastingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: TTS_ACCENT,
  },
  ttsBroadcastingText: {
    color: TTS_ACCENT,
    fontSize: 12,
    fontWeight: '600',
  },
});
