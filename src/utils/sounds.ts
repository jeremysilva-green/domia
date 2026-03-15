type SoundKey = 'notification' | 'paid' | 'request' | 'dueDate' | 'passedDueDate';

const SOUND_SOURCES: Record<SoundKey, any> = {
  notification: require('../../assets/Notifications.mp3'),
  paid: require('../../assets/Payed.mp3'),
  request: require('../../assets/Requests.mp3'),
  dueDate: require('../../assets/Due Date.mp3'),
  passedDueDate: require('../../assets/Passed Due Date.mp3'),
};

export async function playSound(key: SoundKey): Promise<void> {
  try {
    // Dynamic require so a missing native module doesn't crash the app at import time
    const { Audio } = require('expo-av');
    await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
    const { sound } = await Audio.Sound.createAsync(SOUND_SOURCES[key]);
    await sound.playAsync();
    sound.setOnPlaybackStatusUpdate((status: any) => {
      if (status.isLoaded && status.didJustFinish) {
        sound.unloadAsync();
      }
    });
  } catch (e) {
    // Silently ignore — native module not available in this build
  }
}
