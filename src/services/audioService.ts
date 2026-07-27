import { setAudioModeAsync, requestRecordingPermissionsAsync } from 'expo-audio';

class AudioService {
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
}

export default new AudioService();
