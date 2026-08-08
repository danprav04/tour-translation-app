import audioService from '../audioService';
import { requestRecordingPermissionsAsync, setAudioModeAsync, AudioModule } from 'expo-audio';

jest.mock('expo-audio', () => {
  return {
    requestRecordingPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
    setAudioModeAsync: jest.fn().mockResolvedValue(true),
    createAudioPlaylist: jest.fn(() => ({
      play: jest.fn(),
      pause: jest.fn(),
      clear: jest.fn(),
      add: jest.fn(),
      remove: jest.fn(),
      playing: false,
    })),
    AudioModule: {
      AudioStream: jest.fn().mockImplementation(() => {
        let listenerCb: any;
        return {
          start: jest.fn().mockResolvedValue(true),
          stop: jest.fn(),
          addListener: jest.fn((event, cb) => {
            listenerCb = cb;
            return { remove: jest.fn() };
          }),
          // helper to simulate audio input
          _simulateInput: (data: ArrayBuffer) => {
            if (listenerCb) listenerCb({ data });
          }
        };
      })
    }
  };
});

describe('AudioService', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await audioService.stopCapture();
    audioService.setMuted(false);
  });

  it('should request permissions', async () => {
    const granted = await audioService.requestPermissions();
    expect(granted).toBe(true);
    expect(requestRecordingPermissionsAsync).toHaveBeenCalled();
  });

  it('should enable playback mode', async () => {
    await audioService.enablePlaybackMode();
    expect(setAudioModeAsync).toHaveBeenCalledWith(expect.objectContaining({
      allowsRecording: false,
    }));
  });

  it('should start capture', async () => {
    const onChunk = jest.fn();
    await audioService.startCapture(onChunk);
    expect(audioService.isCapturing()).toBe(true);
    expect(setAudioModeAsync).toHaveBeenCalledWith(expect.objectContaining({
      allowsRecording: true,
    }));
  });

  it('should stop capture', async () => {
    await audioService.startCapture(() => {});
    await audioService.stopCapture();
    expect(audioService.isCapturing()).toBe(false);
    expect(setAudioModeAsync).toHaveBeenCalledWith(expect.objectContaining({
      allowsRecording: false,
    }));
  });

  it('should play chunk immediately if no seq is provided', () => {
    const base64Pcm = 'AAAAAA=='; // arbitrary 4 bytes of 0
    audioService.playChunk(base64Pcm, 16000);
    // playlist should be created
    expect(audioService['playlist']).not.toBeNull();
  });

  it('should buffer chunks with seq', () => {
    const base64Pcm = 'AAAAAA=='; 
    audioService.playChunk(base64Pcm, 16000, 1, Date.now());
    
    // shouldn't play immediately, should buffer
    expect(audioService['playlist']).toBeNull();
    expect(audioService['jitterBuffer'].length).toBe(1);
  });

  it('should handle muting', () => {
    audioService.setMuted(true);
    expect(audioService.isMuted()).toBe(true);
    
    audioService.playChunk('AAAAAA==', 16000);
    // Should not play or buffer
    expect(audioService['playlist']).toBeNull();
  });
});
