import { AudioModule, setAudioModeAsync, requestRecordingPermissionsAsync, createAudioPlaylist } from 'expo-audio';
import type { AudioPlaylist, AudioStream } from 'expo-audio';

class AudioService {
  private stream: AudioStream | null = null;
  private streamSubscription: any = null;
  private _isCapturing: boolean = false;
  private _isMuted: boolean = false;
  private isPlaying: boolean = false;
  private playlist: AudioPlaylist | null = null;
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

  playChunk(base64PcmData: string, sampleRate = 24000, seq?: number, timestamp?: number): void {
    if (this._isMuted) return;

    const chunkBuffer = this.base64ToUint8Array(base64PcmData);

    // If no sequence number (e.g. local TTS echo), play immediately
    if (seq === undefined) {
      this.pushToPlaylist(chunkBuffer, sampleRate);
      return;
    }

    // Drop old chunks
    if (this.lastPlayedSeq !== -1 && seq <= this.lastPlayedSeq) {
      return;
    }

    // Insert into jitter buffer, maintaining sequence order
    this.jitterBuffer.push({ seq, buffer: chunkBuffer, sampleRate });
    this.jitterBuffer.sort((a, b) => a.seq - b.seq);

    let totalBufferedBytes = 0;
    for (const item of this.jitterBuffer) {
      totalBufferedBytes += item.buffer.length;
    }

    // Target 2 seconds of buffer before we start playing
    const targetBufferBytes = sampleRate * 2 * 2; 
    
    // If we're not playing yet, wait until we hit the target buffer size
    const isPlaylistActive = this.playlist && this.playlist.playing;
    
    if (!isPlaylistActive && totalBufferedBytes < targetBufferBytes) {
      this.isBuffering = true;
      
      if (this.bufferFlushTimeout) {
        clearTimeout(this.bufferFlushTimeout);
      }
      this.bufferFlushTimeout = setTimeout(() => {
        this.processJitterBuffer(sampleRate);
      }, 3000);
      
      return;
    }

    this.isBuffering = false;
    this.processJitterBuffer(sampleRate);
  }

  private processJitterBuffer(sampleRate: number) {
    if (this.bufferFlushTimeout) {
      clearTimeout(this.bufferFlushTimeout);
      this.bufferFlushTimeout = null;
    }

    if (this.jitterBuffer.length === 0) return;

    if (this.lastPlayedSeq === -1) {
      this.lastPlayedSeq = this.jitterBuffer[0].seq - 1;
    }

    const chunksToProcess = [];
    
    while (this.jitterBuffer.length > 0) {
      const nextExpectedSeq = this.lastPlayedSeq + 1;
      const nextAvailable = this.jitterBuffer[0];

      if (nextAvailable.seq === nextExpectedSeq) {
        chunksToProcess.push(this.jitterBuffer.shift()!.buffer);
        this.lastPlayedSeq = nextExpectedSeq;
      } else if (nextAvailable.seq > nextExpectedSeq) {
        console.warn(`[JitterBuffer] Packet loss detected. Missing seq ${nextExpectedSeq}. Concealing...`);
        const silence = new Uint8Array(nextAvailable.buffer.length);
        silence.fill(0);
        chunksToProcess.push(silence);
        this.lastPlayedSeq = nextExpectedSeq;
      } else {
        this.jitterBuffer.shift();
      }

      // Group chunks into roughly 0.5s chunks to avoid excessive small files in the playlist
      let bytesGathered = chunksToProcess.reduce((acc, val) => acc + val.length, 0);
      if (bytesGathered >= sampleRate * 2 * 0.5) {
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
      this.pushToPlaylist(combined, sampleRate);
    }
  }

  private pushToPlaylist(pcmBytes: Uint8Array, sampleRate: number): void {
    if (pcmBytes.length === 0) return;

    const wavHeader = this.createWavHeader(pcmBytes.length, sampleRate, 16, 1);
    const wavBuffer = new Uint8Array(wavHeader.byteLength + pcmBytes.length);
    wavBuffer.set(new Uint8Array(wavHeader), 0);
    wavBuffer.set(pcmBytes, wavHeader.byteLength);

    const wavBase64 = this.uint8ArrayToBase64(wavBuffer);
    const dataUri = `data:audio/wav;base64,${wavBase64}`;

    if (!this.playlist) {
      this.playlist = createAudioPlaylist({
        sources: [{ uri: dataUri }],
        loop: 'none',
      });
      this.playlist.play();
      this.isPlaying = true;
    } else {
      this.playlist.add({ uri: dataUri });
      if (!this.playlist.playing) {
        this.playlist.play();
        this.isPlaying = true;
      }
    }
  }

  setMuted(muted: boolean): void {
    this._isMuted = muted;
    if (muted) {
      this.jitterBuffer = [];
      this.lastPlayedSeq = -1;
      if (this.playlist) {
        this.playlist.pause();
        this.playlist.clear();
        try {
          this.playlist.remove(); // Release memory
        } catch (e) {}
        this.playlist = null;
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
