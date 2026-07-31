import { AudioModule, setAudioModeAsync, requestRecordingPermissionsAsync, createAudioPlaylist } from 'expo-audio';
import type { AudioPlaylist, AudioStream } from 'expo-audio';

class AudioService {
  private stream: AudioStream | null = null;
  private streamSubscription: any = null;
  private _isCapturing: boolean = false;
  private _isMuted: boolean = false;
  private isPlaying: boolean = false;
  private playlist: AudioPlaylist | null = null;
  private playlistItemCount: number = 0;
  private bufferFlushTimeout: ReturnType<typeof setTimeout> | null = null;
  private onChunkCallback: ((base64Data: string) => void) | null = null;
  private onAudioLevelCallback: ((level: number) => void) | null = null;

  setAudioLevelCallback(callback: ((level: number) => void) | null) {
    this.onAudioLevelCallback = callback;
  }

  async requestPermissions(): Promise<boolean> {
    const permission = await requestRecordingPermissionsAsync();
    return permission.granted;
  }

  async enablePlaybackMode(): Promise<void> {
    await setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'mixWithOthers',
    });
  }

  async startCapture(onChunk?: (base64Data: string) => void): Promise<void> {
    if (this._isCapturing) return;

    if (onChunk) {
      this.onChunkCallback = onChunk;
    }

    const callback = this.onChunkCallback;
    if (!callback) throw new Error('No audio chunk callback provided');

    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        throw new Error('Audio recording permission denied');
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        shouldPlayInBackground: true,
        interruptionMode: 'mixWithOthers',
      });

      this._isCapturing = true;

      // @ts-ignore - AudioModule.AudioStream exists at runtime but may be missing from types
      // eslint-disable-next-line import/namespace
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

        // Calculate audio level for visualizer
        if (this.onAudioLevelCallback) {
          const dataView = new DataView(buffer.data);
          let maxPeak = 0;
          for (let i = 0; i < dataView.byteLength - 1; i += 2) {
            const val = Math.abs(dataView.getInt16(i, true));
            if (val > maxPeak) maxPeak = val;
          }
          const level = Math.min(1, maxPeak / 32768);
          this.onAudioLevelCallback(level);
        }

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
          
          callback(btoa(binary));
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
      interruptionMode: 'mixWithOthers',
    });
  }

  private jitterBuffer: { seq: number, buffer: Uint8Array, sampleRate: number }[] = [];
  private lastPlayedSeq: number = -1;
  private isBuffering: boolean = false;
  private chunkFlushTimeout: ReturnType<typeof setTimeout> | null = null;
  private burstTimeout: ReturnType<typeof setTimeout> | null = null;
  private estimatedPlaybackEnd: number = 0;

  playChunk(base64PcmData: string, sampleRate = 24000, seq?: number, timestamp?: number): void {
    if (this._isMuted) return;

    let chunkBuffer = this.base64ToUint8Array(base64PcmData);

    // Amplify legacy audio and calculate audio level
    const multiplier = 3.0;
    const dataView = new DataView(chunkBuffer.buffer, chunkBuffer.byteOffset, chunkBuffer.byteLength);
    let maxPeak = 0;
    for (let i = 0; i < chunkBuffer.length - 1; i += 2) {
      let val = dataView.getInt16(i, true);
      // Amplify
      val = Math.max(-32768, Math.min(32767, val * multiplier));
      dataView.setInt16(i, val, true);
      // Peak tracking
      const absVal = Math.abs(val);
      if (absVal > maxPeak) maxPeak = absVal;
    }

    // (Peak calculation happens in pushToPlaylist now to sync with actual audio playback)

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

    // Burst detection: If no chunks arrive for 2 seconds, assume the burst is over.
    // Resetting the playlist ensures we don't try to resurrect a dead playlist
    // and resets any accumulated latency drift.
    if (this.burstTimeout) {
      clearTimeout(this.burstTimeout);
    }
    this.burstTimeout = setTimeout(() => {
      this.resetPlaylist();
    }, 1000);

    let totalBufferedBytes = 0;
    for (const item of this.jitterBuffer) {
      totalBufferedBytes += item.buffer.length;
    }

    // Target 2.5 seconds of buffer before we start playing a new burst
    const targetBufferBytes = sampleRate * 2 * 2.5; 
    
    // If not playing, wait until we hit the target buffer size
    const isPlaylistActive = this.playlist && this.playlist.playing;
    
    if (!isPlaylistActive && totalBufferedBytes < targetBufferBytes) {
      this.isBuffering = true;
      
      if (this.bufferFlushTimeout) {
        clearTimeout(this.bufferFlushTimeout);
      }
      this.bufferFlushTimeout = setTimeout(() => {
        this.processJitterBuffer(sampleRate, true);
      }, 3000);
      
      return;
    }

    this.isBuffering = false;
    this.processJitterBuffer(sampleRate, false);
  }

  private resetPlaylist() {
    if (this.playlist) {
      this.playlist.pause();
      this.playlist.clear();
      try {
        this.playlist.remove(); 
      } catch {}
      this.playlist = null;
    }
    this.playlistItemCount = 0;
    this.isPlaying = false;
    this.jitterBuffer = [];
    this.lastPlayedSeq = -1;
    this.estimatedPlaybackEnd = 0;
  }

  private processJitterBuffer(sampleRate: number, forceFlush: boolean) {
    if (this.bufferFlushTimeout) {
      clearTimeout(this.bufferFlushTimeout);
      this.bufferFlushTimeout = null;
    }
    if (this.chunkFlushTimeout) {
      clearTimeout(this.chunkFlushTimeout);
      this.chunkFlushTimeout = null;
    }

    if (this.jitterBuffer.length === 0) return;

    if (this.lastPlayedSeq === -1) {
      this.lastPlayedSeq = this.jitterBuffer[0].seq - 1;
    }

    // We only want to extract chunks if we have a solid block of audio (e.g. 1.5 seconds)
    // AudioPlaylist stutters if we feed it tiny 200ms files.
    const CHUNK_BLOCK_SECONDS = 1.5;
    const targetBytes = sampleRate * 2 * CHUNK_BLOCK_SECONDS;

    // Check if we have enough sequential data, or if we are forced to flush
    let sequentialBytes = 0;
    let tempSeq = this.lastPlayedSeq;
    for (let i = 0; i < this.jitterBuffer.length; i++) {
      if (this.jitterBuffer[i].seq === tempSeq + 1 || this.jitterBuffer[i].seq > tempSeq + 1) {
        sequentialBytes += this.jitterBuffer[i].buffer.length;
        tempSeq = this.jitterBuffer[i].seq;
      } else {
        break;
      }
    }

    if (!forceFlush && sequentialBytes < targetBytes) {
      // Not enough data yet. Set a timeout to force flush if no more data arrives (e.g. host stopped)
      this.chunkFlushTimeout = setTimeout(() => {
        this.processJitterBuffer(sampleRate, true);
      }, 1000);
      return;
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

      // Group chunks into ~1.5s blocks to ensure smooth playlist transition
      let bytesGathered = chunksToProcess.reduce((acc, val) => acc + val.length, 0);
      if (bytesGathered >= targetBytes) {
        break;
      }
    }

    if (chunksToProcess.length > 0) {
      if (this.playlistItemCount > 50) {
        this.resetPlaylist();
      }
      let totalLength = chunksToProcess.reduce((acc, val) => acc + val.length, 0);
      let combined = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunksToProcess) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }
      this.pushToPlaylist(combined, sampleRate);
    }
    
    // If we still have enough for ANOTHER block, process again immediately
    if (this.jitterBuffer.length > 0) {
      this.chunkFlushTimeout = setTimeout(() => {
        this.processJitterBuffer(sampleRate, false);
      }, 10);
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

    if (this.onAudioLevelCallback) {
      // Synchronize visualizer timeouts with the playlist queue
      const now = Date.now();
      if (this.estimatedPlaybackEnd < now) {
        // OS player takes ~150ms to initialize and start playing
        this.estimatedPlaybackEnd = now + 150; 
      }
      
      let delay = this.estimatedPlaybackEnd - now;
      
      // Split into 100ms chunks and schedule levels
      const sliceDurationMs = 100;
      const bytesPerSlice = Math.floor((sampleRate * 2 * sliceDurationMs) / 1000);
      const alignedBytesPerSlice = bytesPerSlice % 2 !== 0 ? bytesPerSlice - 1 : bytesPerSlice;
      
      const totalDurationMs = (pcmBytes.length / (sampleRate * 2)) * 1000;
      this.estimatedPlaybackEnd += totalDurationMs;
      
      const dataView = new DataView(pcmBytes.buffer, pcmBytes.byteOffset, pcmBytes.byteLength);
      
      for (let i = 0; i < pcmBytes.length; i += alignedBytesPerSlice) {
        let maxPeak = 0;
        const end = Math.min(i + alignedBytesPerSlice, pcmBytes.length);
        for (let j = i; j < end - 1; j += 2) {
          const val = Math.abs(dataView.getInt16(j, true));
          if (val > maxPeak) maxPeak = val;
        }
        const level = Math.min(1, maxPeak / 32768);
        
        setTimeout(() => {
          if (this.onAudioLevelCallback) this.onAudioLevelCallback(level);
        }, delay);
        
        delay += sliceDurationMs;
      }
    }

    if (!this.playlist) {
      this.playlist = createAudioPlaylist({
        sources: [{ uri: dataUri }],
        loop: 'none',
      });
      this.playlistItemCount = 1;
      this.playlist.play();
      this.isPlaying = true;
    } else {
      this.playlist.add({ uri: dataUri });
      this.playlistItemCount++;
      if (!this.playlist.playing) {
        this.playlist.play();
        this.isPlaying = true;
      }
    }
  }

  setMuted(muted: boolean): void {
    this._isMuted = muted;
    if (muted) {
      this.resetPlaylist();
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
