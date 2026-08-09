// jest.setup.js


// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Mock Expo Router
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
  useLocalSearchParams: () => ({}),
}));

// Mock LiveKit
jest.mock('@livekit/react-native', () => ({
  Room: jest.fn().mockImplementation(() => ({
    connect: jest.fn(),
    disconnect: jest.fn(),
    on: jest.fn(),
    localParticipant: {
      setMicrophoneEnabled: jest.fn(),
      publishData: jest.fn(),
    },
  })),
  RoomEvent: {
    TrackSubscribed: 'trackSubscribed',
    Disconnected: 'disconnected',
    DataReceived: 'dataReceived',
  },
  RemoteAudioTrack: jest.fn(),
}));

// Mock Socket.IO
jest.mock('socket.io-client', () => {
  const mockSocket = {
    on: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
    connect: jest.fn(),
  };
  return jest.fn(() => mockSocket);
});

// Mock react-native-background-timer
jest.mock('react-native-background-timer', () => ({
  setInterval: jest.fn().mockReturnValue(123),
  clearInterval: jest.fn(),
}));
