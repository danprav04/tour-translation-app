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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { AudioSession, AndroidAudioTypePresets, LiveKitRoom, useRoomContext, useTracks } from '@livekit/react-native';
import { Track, RoomEvent } from 'livekit-client';
import { useListener } from '@/hooks/useListener';
import { useSettingsContext } from '@/context/SettingsContext';
import audioService from '@/services/audioService';
import StatusBadge from '@/components/StatusBadge';
import AudioVisualizer from '@/components/AudioVisualizer';
import GlassCard from '@/components/GlassCard';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MUTE_BTN_SIZE = Math.min(SCREEN_WIDTH * 0.45, 180);

export default function StreamScreen() {
  const router = useRouter();
  const { settings } = useSettingsContext();
  const { roomCode } = useLocalSearchParams<{ roomCode: string }>();
  const {
    isConnected,
    isMuted,
    isReconnecting,
    livekitToken,
    livekitUrl,
    connect,
    disconnect,
    toggleMute,
  } = useListener();

  const [pulseAnim] = useState(() => new Animated.Value(1));
  const [scaleAnim] = useState(() => new Animated.Value(1));

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
    if (roomCode) {
      connect(roomCode as string).catch((error) => {
        Alert.alert('Connection Error', error.message || 'Failed to connect to room', [
          { text: 'OK', onPress: () => router.canGoBack() ? router.back() : router.replace('/') }
        ]);
      });
    }
    return () => {
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

  const connectionStatus = isReconnecting
    ? 'reconnecting'
    : isConnected
    ? 'connected'
    : 'disconnected';

  if (!settings.useLegacyWebSockets && (!livekitToken || !livekitUrl || !isAudioSessionReady)) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={[styles.container, styles.center]}>
          <Text style={styles.statusText}>Connecting...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const content = (
    <StreamContent
      roomCode={roomCode}
      isMuted={isMuted}
      isConnected={isConnected}
      isReconnecting={isReconnecting}
      connectionStatus={connectionStatus}
      pulseAnim={pulseAnim}
      scaleAnim={scaleAnim}
      handleMutePress={handleMutePress}
      handleDisconnect={handleDisconnect}
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
      video={false}
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
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < payload.length; i += chunkSize) {
          binary += String.fromCharCode.apply(null, Array.from(payload.subarray(i, i + chunkSize)));
        }
        
        const currentSeq = seqRef.current++;
        
        // Play the decoded TTS chunk using the audioService JitterBuffer
        audioService.playChunk(btoa(binary), 24000, currentSeq);
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

  return <StreamContentUI {...props} handleDisconnect={handleDisconnect} />;
}

function StreamContentUI({
  roomCode,
  isMuted,
  isConnected,
  isReconnecting,
  connectionStatus,
  pulseAnim,
  scaleAnim,
  handleMutePress,
  handleDisconnect,
}: any) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <StatusBadge status={connectionStatus} />
          <Text style={styles.roomCode}>Room: {roomCode}</Text>
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
              ? isMuted
                ? 'Audio is muted. Tap to listen.'
                : 'Receiving audio from host'
              : 'Connecting...'}
          </Text>
        </View>

        {/* Disconnect */}
        <View style={styles.footer}>
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
});
