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
  BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useNavigation } from 'expo-router';
import { AudioSession, AndroidAudioTypePresets, LiveKitRoom, useParticipants } from '@livekit/react-native';
import { useHost } from '@/hooks/useHost';
import { useTTS } from '@/hooks/useTTS';
import { useSettingsContext } from '@/context/SettingsContext';
import { useDebugContext } from '@/context/DebugContext';
import { SUPPORTED_LANGUAGES } from '@/constants/languages';
import GlassCard from '@/components/GlassCard';
import ToggleCard from '@/components/ToggleCard';
import StatusBadge from '@/components/StatusBadge';
import QRCodeDisplay from '@/components/QRCodeDisplay';
import ListenerCard from '@/components/ListenerCard';
import AudioVisualizer from '@/components/AudioVisualizer';
import type { Participant } from 'livekit-client';

function ParticipantsRenderer({
  children,
  legacyListeners,
  useLegacy
}: {
  children: (activeListeners: any[]) => React.ReactNode,
  legacyListeners: any[],
  useLegacy: boolean
}) {
  if (useLegacy) {
    // In legacy mode, map socket listeners to LiveKit-like objects
    const mapped = legacyListeners.map(l => ({
      sid: l.id,
      identity: l.name,
      name: l.name,
      isLocal: false
    }));
    return <>{children(mapped)}</>;
  }

  return <LiveKitParticipantsRenderer>{children}</LiveKitParticipantsRenderer>;
}

function LiveKitParticipantsRenderer({ children }: { children: (activeListeners: any[]) => React.ReactNode }) {
  const participants = useParticipants();
  const activeListeners = participants.filter(p => !p.isLocal);
  return <>{children(activeListeners)}</>;
}

import { useRoomContext } from '@livekit/react-native';

function RoomDisconnectCatcher() {
  const room = useRoomContext();
  React.useEffect(() => {
    return () => {
      room.disconnect().catch((e) => console.warn('Caught unmount disconnect error:', e));
    };
  }, [room]);
  return null;
}

import { useLocalParticipant } from '@livekit/react-native';

// Explicitly manage the local microphone track
function LocalMicController({ isMicActive, isTranslating, setAudioLevel }: { isMicActive: boolean; isTranslating: boolean; setAudioLevel: (val: number) => void }) {
  const { localParticipant } = useLocalParticipant();
  const pendingMicTask = React.useRef<Promise<void>>(Promise.resolve());

  React.useEffect(() => {
    if (localParticipant) {
      // If we are translating, LiveKit must release the microphone so expo-audio can capture it for Gemini,
      // and so listeners don't hear the raw voice.
      const shouldEnableMic = isMicActive && !isTranslating;
      
      pendingMicTask.current = pendingMicTask.current
        .then(() => {
          console.log(`[Host] Setting microphone enabled to: ${shouldEnableMic}`);
          return localParticipant.setMicrophoneEnabled(shouldEnableMic);
        })
        .catch((e) => {
          console.error('[Host] Failed to set microphone state:', e);
        });

      // Poll audio level
      const interval = setInterval(() => {
        if (shouldEnableMic && localParticipant.audioLevel) {
          // LiveKit's audioLevel is often very small, so we boost it to match legacy visuals
          const boostedLevel = Math.min(1, localParticipant.audioLevel * 5);
          setAudioLevel(boostedLevel);
        } else if (!isTranslating) {
          setAudioLevel(0);
        }
      }, 100);

      return () => clearInterval(interval);
    } else {
      setAudioLevel(0);
    }
  }, [isMicActive, isTranslating, localParticipant, setAudioLevel]);

  return null;
}

function TranslationDataPublisher({ setPublisher }: { setPublisher: any }) {
  const { localParticipant } = useLocalParticipant();
  
  React.useEffect(() => {
    setPublisher((base64Data: string) => {
      if (localParticipant) {
        const binaryString = atob(base64Data);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        
        // WebRTC Data Channels have a 64KB hard limit and LiveKit recommends <15KB for reliability.
        // We slice the raw PCM bytes into 10KB chunks (must be an even number for 16-bit PCM).
        const CHUNK_SIZE = 10240;
        const publishAll = async () => {
          for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
            const slice = bytes.subarray(offset, offset + CHUNK_SIZE);
            try {
              await localParticipant.publishData(slice, { reliable: true, topic: 'translation-audio' });
            } catch (e) {
              console.log('Failed to publish translation audio chunk', e);
            }
          }
        };
        publishAll();
      }
    });
    return () => setPublisher(undefined);
  }, [localParticipant, setPublisher]);
  
  return null;
}

export default function HostScreen() {
  const router = useRouter();
  const navigation = useNavigation();



  const { settings } = useSettingsContext();
  const {
    roomCode,
    livekitToken,
    livekitUrl,
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
    isTTSActive,
    setLivekitPublisher,
    audioLevel,
    setAudioLevel,
    connectionHealth,
  } = useHost();
  const { setDebugState, addDebugEvent } = useDebugContext();

  React.useEffect(() => {
    setDebugState('host', {
      roomCode, isMicActive, isTranslating, isEchoEnabled, isConnected,
      selectedLanguage, isTTSActive, audioLevel,
      listenersCount: listeners.length,
      listeners: listeners.map((l: any) => ({ id: l.id || l.sid, name: l.name || l.identity }))
    });
  }, [roomCode, isMicActive, isTranslating, isEchoEnabled, isConnected, selectedLanguage, isTTSActive, audioLevel, listeners, setDebugState]);

  const prevMic = React.useRef(isMicActive);
  React.useEffect(() => {
    if (prevMic.current !== isMicActive) {
      addDebugEvent(`Host microphone active: ${isMicActive}`);
      prevMic.current = isMicActive;
    }
  }, [isMicActive, addDebugEvent]);

  React.useEffect(() => {
    if (!roomCode) return;

    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      // Prevent default behavior of leaving the screen
      e.preventDefault();

      Alert.alert(
        'End Session?',
        'Leaving this screen will disconnect all listeners and end the tour. Continue?',
        [
          { text: 'Cancel', style: 'cancel', onPress: () => {} },
          {
            text: 'End Session',
            style: 'destructive',
            onPress: () => {
              // Re-dispatch the action to actually leave
              navigation.dispatch(e.data.action);
            },
          },
        ]
      );
    });

    return unsubscribe;
  }, [navigation, roomCode]);

  React.useEffect(() => {
    if (!roomCode) return;

    const backAction = () => {
      Alert.alert(
        'End Session?',
        'Leaving this screen will disconnect all listeners and end the tour. Continue?',
        [
          { text: 'Cancel', style: 'cancel', onPress: () => {} },
          {
            text: 'End Session',
            style: 'destructive',
            onPress: () => {
              router.back();
            },
          },
        ]
      );
      return true; // prevent default back button behavior
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [roomCode, router]);

  const onTTSStart = useCallback(async () => {
    await pauseForTTS();
  }, [pauseForTTS]);

  const [isAudioSessionReady, setIsAudioSessionReady] = React.useState(false);

  // Initialize Audio Session for LiveKit (required on mobile)
  React.useEffect(() => {
    if (!settings.useLegacyWebSockets) {
      const initAudio = async () => {
        await AudioSession.configureAudio({
          android: {
            preferredOutputList: ['bluetooth', 'headset', 'speaker', 'earpiece'],
            audioTypeOptions: AndroidAudioTypePresets.media,
          },
          ios: {
            defaultOutput: 'speaker',
          }
        });
        await AudioSession.startAudioSession();
        setIsAudioSessionReady(true);
      };
      initAudio();
      return () => {
        AudioSession.stopAudioSession();
        setIsAudioSessionReady(false);
      };
    } else {
      setIsAudioSessionReady(true);
    }
  }, [settings.useLegacyWebSockets]);

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
      addDebugEvent('Host starting room');
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
            addDebugEvent('Host ended room');
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
    addDebugEvent(`Host toggled translation to: ${value}`);
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

  const seekTrackWidth = seekTrackWidthRef.current;

  const content = (
    <ParticipantsRenderer legacyListeners={listeners} useLegacy={settings.useLegacyWebSockets}>
      {(activeListeners) => (
        <SafeAreaView style={styles.safe}>
          <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <StatusBadge
            status={
              connectionHealth === 'degraded' || connectionHealth === 'critical'
                ? 'degraded'
                : isTTSPlaying ? 'broadcasting' : isMicActive ? 'broadcasting' : 'connected'
            }
            label={
              connectionHealth === 'critical'
                ? '⚠️ Connection Issues'
                : connectionHealth === 'degraded'
                  ? '⚠️ Weak Connection'
                  : isTTSPlaying
                    ? '📡 Broadcasting TTS'
                    : isMicActive
                      ? `Live · ${activeListeners.length} listeners`
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
              audioLevel={audioLevel}
              barCount={12}
              color={isTranslating ? '#7C5CFC' : '#00D4AA'}
              height={50}
            />
          </GlassCard>
        )}

        {/* ─── TTS Panel ─── */}
        {false && (
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
        )}

        {/* Connected Listeners */}
        <View style={styles.section}>
          <View style={styles.listenerHeader}>
            <Text style={styles.sectionTitle}>
              Connected Listeners ({activeListeners.length})
            </Text>
          </View>
          {activeListeners.length === 0 ? (
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
            activeListeners.map((listener) => (
              <ListenerCard
                key={listener.sid}
                id={listener.sid}
                name={listener.name || listener.identity}
                joinedAt={new Date().toISOString()} // Livekit participant joinedAt isn't directly exposed in React Native hook easily
                onKick={kickListener}
                onRename={renameListener}
              />
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
      )}
    </ParticipantsRenderer>
  );

  if (settings.useLegacyWebSockets) {
    return content;
  }

  if (!isAudioSessionReady || !livekitToken || !livekitUrl) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={[styles.container, styles.center]}>
          <Text style={styles.headerTitle}>Preparing Room...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <LiveKitRoom
      serverUrl={livekitUrl || ''}
      token={livekitToken}
      connect={true}
      audio={false} // Managed manually by LocalMicController
    >
      <RoomDisconnectCatcher />
      <LocalMicController isMicActive={isMicActive} isTranslating={isTranslating} setAudioLevel={setAudioLevel} />
      <TranslationDataPublisher setPublisher={setLivekitPublisher} />
      {content}
    </LiveKitRoom>
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
