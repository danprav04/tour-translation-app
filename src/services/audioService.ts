import { AudioModule, setAudioModeAsync, requestRecordingPermissionsAsync, createAudioPlayer } from 'expo-audio';
import type { AudioRecorder, AudioPlayer, AudioStream } from 'expo-audio';

class AudioService {
  private stream: AudioStream | null = null;
  private _isCapturing: boolean = false;
  private _isMuted: boolean = false;
  private playbackQueue: { uri: string; duration: number }[] = [];
  private isPlaying: boolean = false;
  private currentSound: AudioPlayer | null = null;

  async enablePlaybackMode(): Promise<void> {
    await setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
      shouldPlayInBackground: true,
    });
  }

  async startCapture(onChunk: (base64Data: string) => void): Promise<void> {
    if (this._isCapturing) return;

    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        throw new Error('Audio recording permission denied');
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        shouldPlayInBackground: true,
        interruptionMode: 'doNotMix',
      });

      this._isCapturing = true;

      this.stream = new AudioModule.AudioStream({
        sampleRate: 16000,
        channels: 1,
        encoding: 'int16'
      });

      let audioChunks: Uint8Array[] = [];
      let currentBufferSize = 0;
      const TARGET_BUFFER_SIZE = 8000; // ~250ms at 16kHz 16-bit mono

      this.stream.addListener('audioStreamBuffer', (buffer) => {
        if (!this._isCapturing) return;
        
        const bytes = new Uint8Array(buffer.data);
        audioChunks.push(bytes);
        currentBufferSize += bytes.length;

        if (currentBufferSize >= TARGET_BUFFER_SIZE) {
          // Combine chunks
          const combined = new Uint8Array(currentBufferSize);
          let offset = 0;
          for (const chunk of audioChunks) {
            combined.set(chunk, offset);
            offset += chunk.length;
          }
          
          // Reset buffer
          audioChunks = [];
          currentBufferSize = 0;

          // Fast base64 encoding for the combined PCM chunk
          let binary = '';
          const chunkSize = 8192;
          for (let i = 0; i < combined.length; i += chunkSize) {
            binary += String.fromCharCode.apply(null, Array.from(combined.subarray(i, i + chunkSize)));
          }
          
          onChunk(btoa(binary));
        }
      });

      await this.stream.start();

    } catch (error) {
      console.error('Failed to start capture', error);
      this._isCapturing = false;
      throw error;
    }
  }

  async stopCapture(): Promise<void> {
    this._isCapturing = false;
    
    if (this.stream) {
      try {
        this.stream.stop();
      } catch (e) {
        console.error('Failed to stop stream', e);
      }
      this.stream = null;
    }
    
    // Reset audio mode for playback
    await setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
      shouldPlayInBackground: true,
    });
  }

  private playbackBuffer: Uint8Array = new Uint8Array(0);

  playChunk(base64PcmData: string, sampleRate = 24000): void {
    if (this._isMuted) return;

    const chunkBuffer = this.base64ToUint8Array(base64PcmData);
    
    const newBuffer = new Uint8Array(this.playbackBuffer.length + chunkBuffer.length);
    newBuffer.set(this.playbackBuffer, 0);
    newBuffer.set(chunkBuffer, this.playbackBuffer.length);
    
    this.playbackBuffer = newBuffer;

    // Flush every ~1.5 seconds of audio to reduce Player creations
    // 24000 Hz * 2 bytes/sample * 1.5s = 72000 bytes
    if (this.playbackBuffer.length >= sampleRate * 2 * 1.5) {
      if (this.bufferFlushTimeout) {
        clearTimeout(this.bufferFlushTimeout);
        this.bufferFlushTimeout = null;
      }
      this.flushPlaybackBuffer(sampleRate);
    } else {
      // Properly debounce the flush: reset the timer every time we get a chunk
      if (this.bufferFlushTimeout) {
        clearTimeout(this.bufferFlushTimeout);
      }
      this.bufferFlushTimeout = setTimeout(() => {
        this.flushPlaybackBuffer(sampleRate);
      }, 300); // Wait 300ms of silence from Gemini before flushing
    }
  }

  private flushPlaybackBuffer(sampleRate: number): void {
    if (this.playbackBuffer.length === 0) return;
    
    const pcmBytes = this.playbackBuffer;
    this.playbackBuffer = new Uint8Array(0);

    const durationSeconds = pcmBytes.length / (sampleRate * 2);

    const wavHeader = this.createWavHeader(pcmBytes.length, sampleRate, 16, 1);
    const wavBuffer = new Uint8Array(wavHeader.byteLength + pcmBytes.length);
    wavBuffer.set(new Uint8Array(wavHeader), 0);
    wavBuffer.set(pcmBytes, wavHeader.byteLength);

    const wavBase64 = this.uint8ArrayToBase64(wavBuffer);
    const dataUri = `data:audio/wav;base64,${wavBase64}`;

    this.playbackQueue.push({ uri: dataUri, duration: durationSeconds });
    this.processPlaybackQueue();
  }


  private async processPlaybackQueue(): Promise<void> {
    if (this.isPlaying || this.playbackQueue.length === 0) return;

    this.isPlaying = true;
    const item = this.playbackQueue.shift();

    if (!item) {
      this.isPlaying = false;
      return;
    }

    try {
      this.currentSound = createAudioPlayer(item.uri);
      this.currentSound.play();

      // Only overlap if the chunk is long enough, otherwise it creates a "pop"
      const overlapMs = item.duration > 0.3 ? 50 : 0;
      const timeoutMs = Math.max(0, (item.duration * 1000) - overlapMs);

      // Trigger the next chunk and safely remove the current one
      setTimeout(() => {
        this.currentSound?.remove();
        this.currentSound = null;
        this.isPlaying = false;
        this.processPlaybackQueue();
      }, timeoutMs);

    } catch (error) {
      console.error('Failed to play audio chunk', error);
      this.isPlaying = false;
      this.processPlaybackQueue();
    }
  }

  setMuted(muted: boolean): void {
    this._isMuted = muted;
    if (muted) {
      // Clear queue and stop current playback
      this.playbackQueue = [];
      if (this.currentSound) {
        this.currentSound.remove();
        this.currentSound = null;
      }
      this.isPlaying = false;
    }
  }

  isMuted(): boolean {
    return this._isMuted;
  }

  isCapturing(): boolean {
    return this._isCapturing;
  }

  private base64ToUint8Array(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  private uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private createWavHeader(
    dataLength: number,
    sampleRate: number,
    bitsPerSample: number,
    channels: number
  ): ArrayBuffer {
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
    view.setUint32(16, 16, true);      // PCM chunk size
    view.setUint16(20, 1, true);       // PCM format
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * channels * (bitsPerSample / 8), true);
    view.setUint16(32, channels * (bitsPerSample / 8), true);
    view.setUint16(34, bitsPerSample, true);
    writeString(36, 'data');
    view.setUint32(40, dataLength, true);

    return buffer;
  }
}

export default new AudioService();
