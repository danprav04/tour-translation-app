import { AudioModule, setAudioModeAsync, requestRecordingPermissionsAsync, createAudioPlayer } from 'expo-audio';
import type { AudioRecorder, AudioPlayer } from 'expo-audio';

class AudioService {
  private recording: AudioRecorder | null = null;
  private captureInterval: ReturnType<typeof setTimeout> | null = null;
  private _isCapturing: boolean = false;
  private _isMuted: boolean = false;
  private playbackQueue: string[] = [];
  private isPlaying: boolean = false;
  private currentSound: AudioPlayer | null = null;

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

      const recordCycle = async () => {
        if (!this._isCapturing) return;

        try {
          this.recording = new AudioModule.AudioRecorder({
            isMeteringEnabled: false,
            extension: '.wav',
            sampleRate: 16000,
            numberOfChannels: 1,
            bitRate: 128000,
            ios: {
              audioQuality: 'high',
              linearPCMBitDepth: 16,
              linearPCMIsBigEndian: false,
              linearPCMIsFloat: false,
            },
            android: {
              outputFormat: 'default',
              audioEncoder: 'default'
            },
            web: {
              mimeType: 'audio/webm',
              bitsPerSecond: 128000,
            }
          });

          await this.recording.prepareToRecordAsync();
          this.recording.record();

          // Record for ~300ms chunks
          await new Promise(resolve => setTimeout(resolve, 300));

          if (this.recording && this._isCapturing) {
            await this.recording.stop();
            const uri = this.recording.uri;
            if (uri) {
              // Read file as base64 - use fetch to read local URI
              try {
                const response = await fetch(uri);
                const blob = await response.blob();
                const reader = new FileReader();
                const base64Promise = new Promise<string>((resolve) => {
                  reader.onloadend = () => {
                    const arrayBuffer = reader.result as ArrayBuffer;
                    // Skip the 44-byte WAV header to get raw PCM
                    const pcmBuffer = arrayBuffer.slice(44);
                    const bytes = new Uint8Array(pcmBuffer);
                    let binary = '';
                    for (let i = 0; i < bytes.byteLength; i++) {
                      binary += String.fromCharCode(bytes[i]);
                    }
                    resolve(btoa(binary));
                  };
                  reader.readAsArrayBuffer(blob);
                });
                const base64Data = await base64Promise;
                if (base64Data) {
                  onChunk(base64Data);
                }
              } catch (readError) {
                console.error('Failed to read recorded file', readError);
              }
            }
          }
        } catch (error) {
          console.error('Recording cycle error', error);
        }

        if (this._isCapturing) {
          this.captureInterval = setTimeout(recordCycle, 0);
        }
      };

      recordCycle();

    } catch (error) {
      console.error('Failed to start capture', error);
      this._isCapturing = false;
      throw error;
    }
  }

  async stopCapture(): Promise<void> {
    this._isCapturing = false;
    if (this.captureInterval) {
      clearTimeout(this.captureInterval);
      this.captureInterval = null;
    }
    if (this.recording) {
      try {
        await this.recording.stop();
      } catch {
        // Recording may already be stopped
      }
      this.recording = null;
    }
    // Reset audio mode for playback
    await setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
    });
  }

  async playChunk(base64AudioData: string, sampleRate: number = 24000): Promise<void> {
    if (this._isMuted) return;

    // Create a WAV with proper header from raw PCM data
    try {
      const pcmBytes = this.base64ToUint8Array(base64AudioData);
      const wavHeader = this.createWavHeader(pcmBytes.length, sampleRate, 16, 1);
      const wavBuffer = new Uint8Array(wavHeader.byteLength + pcmBytes.length);
      wavBuffer.set(new Uint8Array(wavHeader), 0);
      wavBuffer.set(pcmBytes, wavHeader.byteLength);

      // Convert to base64 data URI
      const wavBase64 = this.uint8ArrayToBase64(wavBuffer);
      const dataUri = `data:audio/wav;base64,${wavBase64}`;

      this.playbackQueue.push(dataUri);
      this.processPlaybackQueue();
    } catch (error) {
      console.error('Failed to prepare audio chunk for playback', error);
    }
  }

  private async processPlaybackQueue(): Promise<void> {
    if (this.isPlaying || this.playbackQueue.length === 0) return;

    this.isPlaying = true;
    const uri = this.playbackQueue.shift();

    if (!uri) {
      this.isPlaying = false;
      return;
    }

    try {
      this.currentSound = createAudioPlayer(uri);

      const statusListener = this.currentSound.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish) {
          statusListener.remove();
          this.currentSound?.remove();
          this.currentSound = null;
          this.isPlaying = false;
          this.processPlaybackQueue();
        }
      });

      this.currentSound.play();
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
