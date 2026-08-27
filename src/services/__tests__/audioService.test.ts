import audioService from '../audioService';
import { requestRecordingPermissionsAsync, setAudioModeAsync, AudioModule } from 'expo-audio';
import { AudioSession } from '@livekit/react-native';
import BackgroundTimer from 'react-native-background-timer';

jest.mock('@livekit/react-native', () => ({
  AudioSession: {
    selectAudioOutput: jest.fn().mockResolvedValue(true)
  }
}));

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
    (audioService as any).resetPlaylist();
  });

  it('should request permissions', async () => {
    const granted = await audioService.requestPermissions();
    expect(granted).toBe(true);
    expect(requestRecordingPermissionsAsync).toHaveBeenCalled();
  });

  it('should set and get preferred audio output', () => {
    audioService.setPreferredAudioOutput('speaker1');
    expect(audioService.getPreferredAudioOutput()).toBe('speaker1');
  });

  it('should set mic amplification', () => {
    audioService.setMicAmplification(4.0);
    expect((audioService as any)._micAmplification).toBe(4.0);
    
    // Test boundaries
    audioService.setMicAmplification(6.0);
    expect((audioService as any)._micAmplification).toBe(5.0);
    
    audioService.setMicAmplification(0.5);
    expect((audioService as any)._micAmplification).toBe(1.0);
  });

  it('should enable playback mode', async () => {
    audioService.setPreferredAudioOutput('speaker1');
    await audioService.enablePlaybackMode();
    expect(setAudioModeAsync).toHaveBeenCalledWith(expect.objectContaining({
      allowsRecording: false,
    }));
    expect(AudioSession.selectAudioOutput).toHaveBeenCalledWith('speaker1');
  });

  it('should start capture', async () => {
    audioService.setPreferredAudioOutput('speaker2');
    const onChunk = jest.fn();
    await audioService.startCapture(onChunk);
    expect(audioService.isCapturing()).toBe(true);
    expect(setAudioModeAsync).toHaveBeenCalledWith(expect.objectContaining({
      allowsRecording: true,
    }));
    expect(AudioSession.selectAudioOutput).toHaveBeenCalledWith('speaker2');
  });

  it('should stop capture', async () => {
    audioService.setPreferredAudioOutput('speaker3');
    await audioService.startCapture(() => {});
    await audioService.stopCapture();
    expect(audioService.isCapturing()).toBe(false);
    expect(setAudioModeAsync).toHaveBeenCalledWith(expect.objectContaining({
      allowsRecording: false,
    }));
    expect(AudioSession.selectAudioOutput).toHaveBeenCalledWith('speaker3');
  });

  it('should fall back to default audio route on failure and trigger callback', async () => {
    const fallbackCallback = jest.fn();
    audioService.setAudioRouteFallbackCallback(fallbackCallback);
    audioService.setPreferredAudioOutput('failing-device');
    
    (AudioSession.selectAudioOutput as jest.Mock)
      .mockRejectedValueOnce(new Error('Failed to set output'))
      .mockResolvedValueOnce(true);

    await audioService.enablePlaybackMode();

    expect(AudioSession.selectAudioOutput).toHaveBeenCalledWith('failing-device');
    expect(AudioSession.selectAudioOutput).toHaveBeenCalledWith(null);
    expect(fallbackCallback).toHaveBeenCalled();
  });

  it('should fall back to default audio route on failure and trigger callback even if fallback fails', async () => {
    const fallbackCallback = jest.fn();
    audioService.setAudioRouteFallbackCallback(fallbackCallback);
    audioService.setPreferredAudioOutput('failing-device');
    
    (AudioSession.selectAudioOutput as jest.Mock)
      .mockRejectedValueOnce(new Error('Failed to set output'))
      .mockRejectedValueOnce(new Error('Fallback failed'));

    await audioService.enablePlaybackMode();

    expect(AudioSession.selectAudioOutput).toHaveBeenCalledWith('failing-device');
    expect(AudioSession.selectAudioOutput).toHaveBeenCalledWith(null);
    expect(fallbackCallback).toHaveBeenCalled();
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
