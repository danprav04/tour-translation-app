import connectionHealthService from '../connectionHealthService';
import BackgroundTimer from 'react-native-background-timer';
import socketService from '../socketService';
import geminiTranslateService from '../geminiTranslateService';

jest.mock('react-native-background-timer', () => ({
  setInterval: jest.fn((cb) => {
    return setInterval(cb, 100);
  }),
  clearInterval: jest.fn((id) => clearInterval(id)),
  setTimeout: jest.fn((cb) => setTimeout(cb, 10)),
}));

jest.mock('../socketService', () => ({
  onHealthCheckAck: jest.fn(),
  sendHealthCheck: jest.fn(),
  off: jest.fn(),
  refreshConnection: jest.fn(),
  requestResync: jest.fn().mockResolvedValue({ hostConnected: true, hostStreaming: true, listenerCount: 1 }),
  isConnected: jest.fn().mockReturnValue(true),
  lastChunkReceivedAt: 0,
}));

jest.mock('../geminiTranslateService', () => ({
  isConnected: jest.fn().mockReturnValue(true),
  connectOverlap: jest.fn().mockResolvedValue(true),
  lastTranslatedAudioAt: 0,
  currentApiKey: 'key',
  currentLangCode: 'en',
}));

describe('ConnectionHealthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    connectionHealthService.stop();
  });

  it('should initialize and stop correctly for host', () => {
    connectionHealthService.startHostMonitoring('ROOM1', true);
    expect(connectionHealthService['isRunning']).toBe(true);
    expect(connectionHealthService['role']).toBe('host');

    connectionHealthService.stop();
    expect(connectionHealthService['isRunning']).toBe(false);
  });

  it('should initialize and stop correctly for listener', () => {
    connectionHealthService.startListenerMonitoring('ROOM1', true);
    expect(connectionHealthService['isRunning']).toBe(true);
    expect(connectionHealthService['role']).toBe('listener');

    connectionHealthService.stop();
    expect(connectionHealthService['isRunning']).toBe(false);
  });

  it('should update mic state', () => {
    connectionHealthService.updateMicState(true);
    expect(connectionHealthService['isMicActive']).toBe(true);
    expect(connectionHealthService['state'].lastMicActivityAt).toBeGreaterThan(0);
  });

  it('should get health status', () => {
    connectionHealthService.startHostMonitoring('R', true);
    expect(connectionHealthService.getHealthStatus()).toBe('healthy');
    
    connectionHealthService['state'].socketHealthy = false;
    expect(connectionHealthService.getHealthStatus()).toBe('degraded');

    connectionHealthService['state'].consecutiveSocketFailures = 2;
    expect(connectionHealthService.getHealthStatus()).toBe('critical');
  });
  
  it('should run socket health check intervals', () => {
    jest.useFakeTimers();
    connectionHealthService.startHostMonitoring('R', true);
    jest.advanceTimersByTime(35000); // Trigger interval
    expect(socketService.sendHealthCheck).toHaveBeenCalled();
    jest.useRealTimers();
  });
});
