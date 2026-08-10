import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  Animated,
  Easing,
  Alert,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Updates from 'expo-updates';
import { uint8ArrayToBase64 } from '@/utils/base64';
import { AudioSession, AndroidAudioTypePresets, LiveKitRoom, useRoomContext, useTracks } from '@livekit/react-native';
import { Track, RoomEvent } from 'livekit-client';
import { useListener } from '@/hooks/useListener';
import { useSettingsContext } from '@/context/SettingsContext';
import { useDebugContext } from '@/context/DebugContext';
import audioService from '@/services/audioService';
import connectionHealthService from '@/services/connectionHealthService';
import StatusBadge from '@/components/StatusBadge';
import AudioVisualizer from '@/components/AudioVisualizer';
import GlassCard from '@/components/GlassCard';
import AudioRoutePicker from '@/components/AudioRoutePicker';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MUTE_BTN_SIZE = Math.min(SCREEN_WIDTH * 0.45, 180);

export default function StreamScreen() {
  const router = useRouter();
  const { settings, updateSettings } = useSettingsContext();
  const { roomCode } = useLocalSearchParams<{ roomCode: string }>();
  const {
    isConnected,
    isMuted,
    isReconnecting,
    isHostStreaming,
    livekitToken,
    livekitUrl,
    connect,
    disconnect,
    toggleMute,
    audioLevel,
    isStandby,
    refreshConnection,
  } = useListener();

  const [pulseAnim] = useState(() => new Animated.Value(1));
  const [scaleAnim] = useState(() => new Animated.Value(1));

  const { setDebugState, addDebugEvent } = useDebugContext();

  useEffect(() => {
    setDebugState('listener', {
      roomCode, isConnected, isMuted, isReconnecting, audioLevel
    });
  }, [roomCode, isConnected, isMuted, isReconnecting, audioLevel, setDebugState]);

  const prevMute = useRef(isMuted);
  useEffect(() => {
    if (prevMute.current !== isMuted) {
      addDebugEvent(`Listener muted: ${isMuted}`);
      prevMute.current = isMuted;
    }
  }, [isMuted, addDebugEvent]);

  const prevConnect = useRef(isConnected);
  useEffect(() => {
    if (prevConnect.current !== isConnected) {
      addDebugEvent(`Listener connected: ${isConnected}`);
      prevConnect.current = isConnected;
    }
  }, [isConnected, addDebugEvent]);

  const [isAudioSessionReady, setIsAudioSessionReady] = useState(false);

  // Initialize Audio Session for LiveKit (required on mobile)
  useEffect(() => {
    if (!settings.useLegacyWebSockets) {
      const initAudio = async () => {
        // Configure for media playback (loudspeaker) instead of call (earpiece)
        await AudioSession.configureAudio({
          android: {
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

  // Connect on mount
  useEffect(() => {
    let mounted = true;
    if (roomCode) {
      addDebugEvent(`Listener attempting to connect to room: ${roomCode}`);
      connect(roomCode as string).catch((error) => {
        if (!mounted) return;
        addDebugEvent(`Listener connection failed: ${error.message}`);
        Alert.alert('Connection Error', error.message || 'Failed to connect to room', [
          { text: 'OK', onPress: () => router.canGoBack() ? router.back() : router.replace('/') }
        ]);
      });
    }
    return () => {
      mounted = false;
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode]);

  // Pulse animation when connected & unmuted
  useEffect(() => {
    if (isConnected && !isMuted) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 1500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isConnected, isMuted, pulseAnim]);

  const handleMutePress = () => {
    // Button press animation
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.92,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.back(2)),
        useNativeDriver: true,
      }),
    ]).start();
    toggleMute();
  };

  const handleDisconnect = () => {
    Alert.alert(
      'Disconnect',
      'Leave this audio session?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: () => {
            addDebugEvent('Listener manually disconnected');
            disconnect();
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace('/');
            }
          },
        },
      ]
    );
  };

  const handleHardRestart = () => {
    Alert.alert(
      'Hard Restart',
      'This will reload the entire app and resume the session. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Restart', 
          style: 'destructive', 
          onPress: async () => {
            if (roomCode) {
              await AsyncStorage.setItem('autoRestart', JSON.stringify({ role: 'listener', roomCode }));
            }
            Updates.reloadAsync();
          }
        },
      ]
    );
  };

  const connectionStatus = isReconnecting
    ? 'reconnecting'
    : isConnected
    ? (!isHostStreaming ? 'host-paused' : 'connected')
    : 'disconnected';

  if (!settings.useLegacyWebSockets && (!livekitToken || !livekitUrl || !isAudioSessionReady)) {
    if (!isStandby) {
      return (
        <SafeAreaView style={styles.safe}>
          <View style={[styles.container, styles.center]}>
            <Text style={styles.statusText}>Connecting...</Text>
          </View>
        </SafeAreaView>
      );
    }
  }

  const content = (
    <StreamContent
      roomCode={roomCode}
      isMuted={isMuted}
      isConnected={isConnected}
      isReconnecting={isReconnecting}
      isStandby={isStandby}
      connectionStatus={connectionStatus}
      pulseAnim={pulseAnim}
      scaleAnim={scaleAnim}
      handleMutePress={handleMutePress}
      handleDisconnect={handleDisconnect}
      handleHardRestart={handleHardRestart}
      handleRefreshConnection={refreshConnection}
      audioLevel={audioLevel}
      useLegacy={settings.useLegacyWebSockets}
    />
  );

  if (settings.useLegacyWebSockets) {
    return content;
  }

  return (
    <LiveKitRoom
      serverUrl={livekitUrl}
      token={livekitToken}
      connect={true}
      audio={false}
      connectOptions={{ autoSubscribe: false }}
    >
      {content}
    </LiveKitRoom>
  );
}

function StreamContent(props: any) {
  // Use a child component to only call LiveKit hooks when not in legacy mode
  if (props.useLegacy) {
    return <StreamContentUI 
      {...props}
    />;
  }

  return <StreamContentLiveKit {...props} />;
}

function StreamContentLiveKit(props: any) {
  const room = useRoomContext();
  const { isMuted, handleDisconnect: originalHandleDisconnect } = props;
  const [livekitAudioLevel, setLivekitAudioLevel] = React.useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      let maxLevel = 0;
      room.remoteParticipants.forEach(p => {
        if (p.audioLevel > maxLevel) maxLevel = p.audioLevel;
      });
      setLivekitAudioLevel(Math.min(1, maxLevel * 5));
    }, 100);
    return () => clearInterval(interval);
  }, [room]);

  useEffect(() => {
    const applyMute = () => {
      room.remoteParticipants.forEach(p => {
        p.audioTrackPublications.forEach(pub => {
          pub.setSubscribed(!isMuted);
        });
      });
    };
    
    applyMute();
    
    room.on(RoomEvent.TrackPublished, applyMute);
    room.on(RoomEvent.TrackSubscribed, applyMute);
    
    return () => {
      room.off(RoomEvent.TrackPublished, applyMute);
      room.off(RoomEvent.TrackSubscribed, applyMute);
    };
  }, [room, isMuted]);

  const seqRef = React.useRef(0);

  // Listen for LiveKit Data Channel messages containing translated audio
  useEffect(() => {
    const handleData = (payload: Uint8Array, participant?: any, kind?: any, topic?: string) => {
      if (topic === 'translation-audio' && !isMuted) {
        const currentSeq = seqRef.current++;
        
        connectionHealthService.recordLivekitDataReceived();
        // Play the decoded TTS chunk using the audioService JitterBuffer
        audioService.playChunk(uint8ArrayToBase64(payload), 24000, currentSeq);
      }
    };
    room.on(RoomEvent.DataReceived, handleData);
    return () => {
      room.off(RoomEvent.DataReceived, handleData);
    };
  }, [room, isMuted]);

  // Intercept disconnect to catch LiveKit race condition errors
  const handleDisconnect = async () => {
    try {
      await room.disconnect();
    } catch (e) {
      console.warn('Caught LiveKit disconnect error:', e);
    }
    originalHandleDisconnect();
  };

  useEffect(() => {
    // Catch disconnect errors when component unmounts (e.g. back button)
    return () => {
      room.disconnect().catch((e) => console.warn('Caught unmount disconnect error:', e));
    };
  }, [room]);

  return <StreamContentUI {...props} handleDisconnect={handleDisconnect} audioLevel={Math.max(props.audioLevel || 0, livekitAudioLevel)} />;
}

function StreamContentUI({
  roomCode,
  isMuted,
  isConnected,
  isReconnecting,
  isStandby,
  connectionStatus,
  pulseAnim,
  scaleAnim,
  handleMutePress,
  handleDisconnect,
  handleHardRestart,
  handleRefreshConnection,
  audioLevel,
}: any) {
  return (
    <SafeAreaView style={styles.safe}>
      {isStandby && (
        <View style={[StyleSheet.absoluteFill, styles.standbyOverlay]}>
          <Text style={[styles.standbyIcon, { fontSize: 48 }]}>⚠️</Text>
          <Text style={styles.standbyTitle}>Host Disconnected</Text>
          <Text style={styles.standbyText}>
            Waiting for host to recreate room {roomCode}...
          </Text>
        </View>
      )}
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <StatusBadge status={connectionStatus} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Pressable onPress={handleHardRestart} hitSlop={8}>
              <Text style={styles.hardRestartBtn}>Hard Restart</Text>
            </Pressable>
            <Pressable onPress={handleRefreshConnection} hitSlop={8}>
              <Text style={styles.refreshBtn}>↻ Refresh</Text>
            </Pressable>
            <Text style={styles.roomCode}>Room: {roomCode}</Text>
          </View>
        </View>

        {/* Main content */}
        <View style={styles.center}>
          {/* Mute Button */}
          <Animated.View
            style={[
              styles.muteRing,
              {
                transform: [{ scale: pulseAnim }],
                borderColor: isMuted
                  ? 'rgba(255,71,87,0.2)'
                  : 'rgba(124,92,252,0.2)',
              },
            ]}
          >
            <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
              <Pressable
                onPress={handleMutePress}
                style={[
                  styles.muteBtn,
                  isMuted ? styles.muteBtnMuted : styles.muteBtnActive,
                ]}
              >
                <Text style={styles.muteIcon}>{isMuted ? '🔇' : '🔊'}</Text>
                <Text style={styles.muteLabel}>
                  {isMuted ? 'Muted' : 'Listening'}
                </Text>
              </Pressable>
            </Animated.View>
          </Animated.View>

          {/* Visualizer */}
          <View style={styles.visualizer}>
            <AudioVisualizer
              isActive={isConnected && !isMuted}
              audioLevel={audioLevel}
              barCount={9}
              color={isMuted ? '#FF4757' : '#7C5CFC'}
              height={45}
            />
          </View>

          {/* Status text */}
          <Text style={styles.statusText}>
            {isReconnecting
              ? 'Attempting to reconnect...'
              : isConnected
              ? connectionStatus === 'host-paused'
                ? 'Waiting for host to resume...'
                : isMuted
                ? 'Audio is muted. Tap to listen.'
                : 'Receiving audio from host'
              : 'Connecting...'}
          </Text>
        </View>

        {/* Disconnect */}
        <View style={styles.footer}>
          <View style={{ marginBottom: 24, width: '100%' }}>
            <AudioRoutePicker onRouteChanged={(deviceId) => updateSettings({ preferredAudioOutput: deviceId })} />
          </View>
          <Pressable
            onPress={handleDisconnect}
            style={({ pressed }) => [
              styles.disconnectBtn,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.disconnectText}>Disconnect</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0A0E1A',
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  roomCode: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 1,
  },
  hardRestartBtn: {
    color: '#FFAB00',
    fontSize: 14,
    fontWeight: '700',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,171,0,0.3)',
    overflow: 'hidden',
    backgroundColor: 'rgba(255,171,0,0.08)',
  },
  refreshBtn: {
    color: '#00D4AA',
    fontSize: 14,
    fontWeight: '700',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(0,212,170,0.3)',
    overflow: 'hidden',
    backgroundColor: 'rgba(0,212,170,0.08)',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  muteRing: {
    width: MUTE_BTN_SIZE + 30,
    height: MUTE_BTN_SIZE + 30,
    borderRadius: (MUTE_BTN_SIZE + 30) / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  muteBtn: {
    width: MUTE_BTN_SIZE,
    height: MUTE_BTN_SIZE,
    borderRadius: MUTE_BTN_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  muteBtnActive: {
    backgroundColor: 'rgba(124,92,252,0.15)',
    borderColor: 'rgba(124,92,252,0.4)',
  },
  muteBtnMuted: {
    backgroundColor: 'rgba(255,71,87,0.1)',
    borderColor: 'rgba(255,71,87,0.3)',
  },
  muteIcon: {
    fontSize: 48,
    marginBottom: 8,
  },
  muteLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  visualizer: {
    marginTop: 40,
    marginBottom: 20,
  },
  statusText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  footer: {
    alignItems: 'center',
  },
  disconnectBtn: {
    backgroundColor: 'rgba(255,71,87,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,71,87,0.3)',
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 16,
  },
  disconnectText: {
    color: '#FF4757',
    fontSize: 16,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.97 }],
  },
  standbyOverlay: {
    backgroundColor: 'rgba(10, 14, 26, 0.95)',
    zIndex: 100,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },
  standbyIcon: {
    marginBottom: 20,
  },
  standbyTitle: {
    color: '#FF9800',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  standbyText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
});
