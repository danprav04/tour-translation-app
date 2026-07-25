/**
 * useTTS — Hook for TTS generation, playback, and broadcast coordination.
 * 
 * Manages the lifecycle: text input → generate audio → play/pause/seek/clear.
 * Coordinates with the host mic stream via onTTSStart/onTTSEnd callbacks.
 * Broadcasts TTS audio to listeners through the existing socket audio channel.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { createAudioPlayer } from 'expo-audio';
import type { AudioPlayer } from 'expo-audio';
import ttsService from '@/services/ttsService';
import socketService from '@/services/socketService';

// PCM format constants for Gemini TTS output
const TTS_SAMPLE_RATE = 24000;
const BYTES_PER_SAMPLE = 2; // 16-bit
const CHANNELS = 1;

interface UseTTSOptions {
  apiKey: string;
  onTTSStart: () => void;
  onTTSEnd: () => void;
}

const base64ToUint8Array = (base64: string): Uint8Array => {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

const uint8ArrayToBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
};

const createWavHeader = (
  dataLength: number,
  sampleRate: number,
  bitsPerSample: number,
  channels: number,
): ArrayBuffer => {
  const buffer = new ArrayBuffer(44);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * (bitsPerSample / 8), true);
  view.setUint16(32, channels * (bitsPerSample / 8), true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, 'data');
  view.setUint32(40, dataLength, true);

  return buffer;
};

export const useTTS = ({ apiKey, onTTSStart, onTTSEnd }: UseTTSOptions) => {
  const [ttsText, setTTSText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [ttsAudioBase64, setTTSAudioBase64] = useState<string | null>(null);
  const [isTTSPlaying, setIsTTSPlaying] = useState(false);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [playbackDuration, setPlaybackDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const playerRef = useRef<AudioPlayer | null>(null);
  const positionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isTTSPlayingRef = useRef(false);
  const playbackPositionRef = useRef(0);
  const lastBroadcastTimeRef = useRef(0);

  // Keep refs in sync
  useEffect(() => {
    isTTSPlayingRef.current = isTTSPlaying;
  }, [isTTSPlaying]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupPlayer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cleanupPlayer = useCallback(() => {
    if (positionIntervalRef.current) {
      clearInterval(positionIntervalRef.current);
      positionIntervalRef.current = null;
    }
    if (playerRef.current) {
      try {
        playerRef.current.remove();
      } catch (e) {
        // Ignore cleanup errors
      }
      playerRef.current = null;
    }
  }, []);

  /**
   * Generate TTS audio from the current text input.
   */
  const generate = useCallback(async () => {
    if (!ttsText.trim() || !apiKey) return;

    setIsGenerating(true);
    setError(null);

    // Clear any existing audio
    cleanupPlayer();
    setTTSAudioBase64(null);
    setPlaybackPosition(0);
    setPlaybackDuration(0);
    setIsTTSPlaying(false);
    lastBroadcastTimeRef.current = 0;

    try {
      const audioBase64 = await ttsService.generateTTS(ttsText.trim(), apiKey);
      
      // Calculate duration from PCM byte length
      const pcmBytes = base64ToUint8Array(audioBase64);
      const durationSeconds = pcmBytes.length / (TTS_SAMPLE_RATE * BYTES_PER_SAMPLE * CHANNELS);
      
      setTTSAudioBase64(audioBase64);
      setPlaybackDuration(durationSeconds);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate TTS audio';
      setError(message);
      console.error('[useTTS] Generation failed:', err);
    } finally {
      setIsGenerating(false);
    }
  }, [ttsText, apiKey, cleanupPlayer]);


  /**
   * Start/resume TTS playback and broadcast.
   */
  const play = useCallback(async () => {
    if (!ttsAudioBase64) return;

    // Pause mic stream
    onTTSStart();

    try {
      const pcmBytes = base64ToUint8Array(ttsAudioBase64);
      
      // Create WAV for local playback
      const wavHeader = createWavHeader(pcmBytes.length, TTS_SAMPLE_RATE, 16, 1);
      const wavBuffer = new Uint8Array(wavHeader.byteLength + pcmBytes.length);
      wavBuffer.set(new Uint8Array(wavHeader), 0);
      wavBuffer.set(pcmBytes, wavHeader.byteLength);
      
      const wavBase64 = uint8ArrayToBase64(wavBuffer);
      const dataUri = `data:audio/wav;base64,${wavBase64}`;

      // Clean up previous player if exists
      cleanupPlayer();

      // Create player for local playback
      const player = createAudioPlayer(dataUri);
      playerRef.current = player;

      // Seek to current position if resuming
      if (playbackPositionRef.current > 0) {
        player.seekTo(playbackPositionRef.current);
        lastBroadcastTimeRef.current = playbackPositionRef.current;
      } else {
        lastBroadcastTimeRef.current = 0;
      }

      player.play();
      setIsTTSPlaying(true);

      // Track playback position
      positionIntervalRef.current = setInterval(() => {
        if (playerRef.current) {
          const currentTime = playerRef.current.currentTime;
          const duration = playerRef.current.duration;
          
          playbackPositionRef.current = currentTime;
          setPlaybackPosition(currentTime);

          // Broadcast the audio that just played
          if (currentTime > lastBroadcastTimeRef.current) {
            const startByte = Math.floor(lastBroadcastTimeRef.current * TTS_SAMPLE_RATE * BYTES_PER_SAMPLE * CHANNELS);
            let endByte = Math.floor(currentTime * TTS_SAMPLE_RATE * BYTES_PER_SAMPLE * CHANNELS);
            // Ensure endByte aligns to the sample size (16-bit = 2 bytes)
            if (endByte % BYTES_PER_SAMPLE !== 0) {
              endByte -= (endByte % BYTES_PER_SAMPLE);
            }

            if (endByte > startByte && startByte < pcmBytes.length) {
              const chunk = pcmBytes.slice(startByte, Math.min(endByte, pcmBytes.length));
              socketService.sendAudioChunk(chunk.buffer, TTS_SAMPLE_RATE);
            }
            
            lastBroadcastTimeRef.current = currentTime;
          }

          // Check if playback finished
          if (duration > 0 && currentTime >= duration - 0.1) {
            handlePlaybackFinished();
          }
        }
      }, 200);

    } catch (err) {
      console.error('[useTTS] Playback failed:', err);
      setIsTTSPlaying(false);
      onTTSEnd();
    }
  }, [ttsAudioBase64, onTTSStart, onTTSEnd, cleanupPlayer]);

  /**
   * Called when playback reaches the end naturally.
   */
  const handlePlaybackFinished = useCallback(() => {
    if (positionIntervalRef.current) {
      clearInterval(positionIntervalRef.current);
      positionIntervalRef.current = null;
    }
    cleanupPlayer();
    setIsTTSPlaying(false);
    playbackPositionRef.current = 0;
    setPlaybackPosition(0);
    onTTSEnd();
  }, [cleanupPlayer, onTTSEnd]);

  /**
   * Pause TTS playback. Resumes mic stream if it was active.
   */
  const pause = useCallback(() => {
    if (playerRef.current) {
      playbackPositionRef.current = playerRef.current.currentTime;
      setPlaybackPosition(playerRef.current.currentTime);
      playerRef.current.pause();
    }
    if (positionIntervalRef.current) {
      clearInterval(positionIntervalRef.current);
      positionIntervalRef.current = null;
    }
    setIsTTSPlaying(false);
    onTTSEnd();
  }, [onTTSEnd]);

  /**
   * Seek to a specific position in the audio.
   */
  const seek = useCallback((positionSeconds: number) => {
    const clampedPosition = Math.max(0, Math.min(positionSeconds, playbackDuration));
    playbackPositionRef.current = clampedPosition;
    setPlaybackPosition(clampedPosition);
    lastBroadcastTimeRef.current = clampedPosition;

    if (playerRef.current) {
      playerRef.current.seekTo(clampedPosition);
    }
  }, [playbackDuration]);

  /**
   * Clear the generated audio and reset everything.
   */
  const clear = useCallback(() => {
    const wasPlaying = isTTSPlayingRef.current;
    
    cleanupPlayer();
    setTTSAudioBase64(null);
    setTTSText('');
    setIsTTSPlaying(false);
    setPlaybackPosition(0);
    setPlaybackDuration(0);
    playbackPositionRef.current = 0;
    lastBroadcastTimeRef.current = 0;
    setError(null);

    if (wasPlaying) {
      onTTSEnd();
    }
  }, [cleanupPlayer, onTTSEnd]);

  /**
   * Format seconds to m:ss display.
   */
  const formatTime = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  return {
    // State
    ttsText,
    isGenerating,
    ttsAudioBase64,
    isTTSPlaying,
    playbackPosition,
    playbackDuration,
    error,
    hasAudio: ttsAudioBase64 !== null,

    // Actions
    setTTSText,
    generate,
    play,
    pause,
    seek,
    clear,

    // Helpers
    formatTime,
  };
};
