import { AudioModule, setAudioModeAsync, requestRecordingPermissionsAsync, createAudioPlayer } from 'expo-audio';
import type { AudioRecorder, AudioPlayer, AudioStream } from 'expo-audio';

class AudioService {
  private stream: AudioStream | null = null;
  private streamSubscription: any = null;
  private _isCapturing: boolean = false;
  private _isMuted: boolean = false;
  private playbackQueue: { uri: string; duration: number }[] = [];
  private isPlaying: boolean = false;
  private currentSound: AudioPlayer | null = null;
  private bufferFlushTimeout: ReturnType<typeof setTimeout> | null = null;

  async requestPermissions(): Promise<boolean> {
    const permission = await requestRecordingPermissionsAsync();
    return permission.granted;
  }

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

      this.streamSubscription = this.stream.addListener('audioStreamBuffer', (buffer) => {
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
    
    if (this.streamSubscription) {
      this.streamSubscription.remove();
      this.streamSubscription = null;
    }

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

  private jitterBuffer: { seq: number, buffer: Uint8Array, sampleRate: number }[] = [];
  private lastPlayedSeq: number = -1;
  private isBuffering: boolean = false;
  private playbackBuffer: Uint8Array = new Uint8Array(0);

  playChunk(base64PcmData: string, sampleRate = 24000, seq?: number, timestamp?: number): void {
    if (this._isMuted) return;

    const chunkBuffer = this.base64ToUint8Array(base64PcmData);

    // If no sequence number (e.g. local TTS echo), play immediately or append to current buffer
    if (seq === undefined) {
      this.appendAndFlush(chunkBuffer, sampleRate, true);
      return;
    }

    // Drop old chunks
    if (this.lastPlayedSeq !== -1 && seq <= this.lastPlayedSeq) {
      return;
    }

    // Insert into jitter buffer, maintaining sequence order
    this.jitterBuffer.push({ seq, buffer: chunkBuffer, sampleRate });
    this.jitterBuffer.sort((a, b) => a.seq - b.seq);

    // Deep Buffer Strategy (2 seconds latency target)
    // 1 chunk is typically ~250ms (or depends on source).
    // Let's flush when we have at least 1.5 to 2 seconds of audio in the jitter buffer,
    // OR if we are already playing and just keeping up.
    
    let totalBufferedBytes = 0;
    for (const item of this.jitterBuffer) {
      totalBufferedBytes += item.buffer.length;
    }

    // Target 2 seconds of buffer before we start playing (for 5s acceptable latency)
    // sampleRate * 2 bytes per sample * 2 seconds
    const targetBufferBytes = sampleRate * 2 * 2; 
    
    // If we're not playing yet, wait until we hit the target buffer size
    if (!this.isPlaying && totalBufferedBytes < targetBufferBytes) {
      this.isBuffering = true;
      
      // Failsafe flush if we don't get enough data within 3 seconds
      if (this.bufferFlushTimeout) {
        clearTimeout(this.bufferFlushTimeout);
      }
      this.bufferFlushTimeout = setTimeout(() => {
        this.processJitterBuffer(sampleRate);
      }, 3000);
      
      return;
    }

    this.isBuffering = false;
    
    // Process the jitter buffer
    this.processJitterBuffer(sampleRate);
  }

  private processJitterBuffer(sampleRate: number) {
    if (this.bufferFlushTimeout) {
      clearTimeout(this.bufferFlushTimeout);
      this.bufferFlushTimeout = null;
    }

    if (this.jitterBuffer.length === 0) return;

    let combinedBuffer = new Uint8Array(0);

    // If this is our first time playing, initialize lastPlayedSeq
    if (this.lastPlayedSeq === -1) {
      this.lastPlayedSeq = this.jitterBuffer[0].seq - 1;
    }

    // Process all chunks that are sequential or missing
    const chunksToProcess = [];
    
    while (this.jitterBuffer.length > 0) {
      const nextExpectedSeq = this.lastPlayedSeq + 1;
      const nextAvailable = this.jitterBuffer[0];

      if (nextAvailable.seq === nextExpectedSeq) {
        chunksToProcess.push(this.jitterBuffer.shift()!.buffer);
        this.lastPlayedSeq = nextExpectedSeq;
      } else if (nextAvailable.seq > nextExpectedSeq) {
        // Missing sequence! Packet Loss Concealment (PLC)
        // We will insert silence for the missing chunk to maintain timing.
        // Assuming chunk size is same as next available.
        console.warn(`[JitterBuffer] Packet loss detected. Missing seq ${nextExpectedSeq}. Concealing...`);
        const silence = new Uint8Array(nextAvailable.buffer.length);
        silence.fill(0); // Silence (0 for 16-bit PCM is 0)
        chunksToProcess.push(silence);
        this.lastPlayedSeq = nextExpectedSeq;
      } else {
        // Somehow we have an old chunk, just drop it
        this.jitterBuffer.shift();
      }

      // Break if we've gathered enough to play (e.g. 1.5 seconds)
      // to avoid blocking the thread too long or creating massive WAV files
      let bytesGathered = chunksToProcess.reduce((acc, val) => acc + val.length, 0);
      if (bytesGathered >= sampleRate * 2 * 1.5) {
        break;
      }
    }

    if (chunksToProcess.length > 0) {
      let totalLength = chunksToProcess.reduce((acc, val) => acc + val.length, 0);
      let combined = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunksToProcess) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }
      this.appendAndFlush(combined, sampleRate, false);
    }
  }

  private appendAndFlush(chunkBuffer: Uint8Array, sampleRate: number, immediate: boolean) {
    const newBuffer = new Uint8Array(this.playbackBuffer.length + chunkBuffer.length);
    newBuffer.set(this.playbackBuffer, 0);
    newBuffer.set(chunkBuffer, this.playbackBuffer.length);
    this.playbackBuffer = newBuffer;

    if (immediate || this.playbackBuffer.length >= sampleRate * 2 * 1.0) {
      this.flushPlaybackBuffer(sampleRate);
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
      const player = createAudioPlayer(item.uri);
      this.currentSound = player;
      player.play();

      // Start the next chunk slightly early to prevent gaps,
      // but do NOT stop the current player prematurely so it naturally crossfades.
      const overlapMs = item.duration > 0.3 ? 80 : 0; // Increased to 80ms for smoother native handoff
      const timeoutMs = Math.max(0, (item.duration * 1000) - overlapMs);

      // Trigger the next chunk
      setTimeout(() => {
        // Unlink current sound so processPlaybackQueue can start the next one
        if (this.currentSound === player) {
            this.currentSound = null;
        }
        this.isPlaying = false;
        this.processPlaybackQueue();

        // Safely remove this player a short time after it should have naturally finished
        setTimeout(() => {
          try {
            player.remove();
          } catch (e) {
            // ignore
          }
        }, overlapMs + 200);

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
      this.jitterBuffer = [];
      this.lastPlayedSeq = -1;
      this.playbackBuffer = new Uint8Array(0);
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
