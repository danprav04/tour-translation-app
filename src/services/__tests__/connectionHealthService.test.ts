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
  getConsecutiveSendFailures: jest.fn().mockReturnValue(0),
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

  it('should update translation start time', () => {
    connectionHealthService.updateTranslationStartTime(12345);
    expect(connectionHealthService['state'].lastTranslationStartedAt).toBe(12345);
  });

  it('should reconnect Gemini if initial setup takes too long', () => {
    jest.useFakeTimers();
    const onReconnectGemini = jest.fn();
    connectionHealthService.registerCallbacks({ onReconnectGemini });
    connectionHealthService.startHostMonitoring('R', true);
    
    connectionHealthService.updateMicState(true);
    connectionHealthService.updateTranslationState(true);
    connectionHealthService.updateTranslationStartTime(Date.now() - 11000);
    
    jest.advanceTimersByTime(3000);
    expect(onReconnectGemini).toHaveBeenCalled();
    
    jest.useRealTimers();
  });

  it('should reconnect Gemini on high send failures', () => {
    jest.useFakeTimers();
    const onReconnectGemini = jest.fn();
    connectionHealthService.registerCallbacks({ onReconnectGemini });
    connectionHealthService.startHostMonitoring('R', true);
    
    connectionHealthService.updateMicState(true);
    connectionHealthService.updateTranslationState(true);
    (geminiTranslateService.getConsecutiveSendFailures as jest.Mock).mockReturnValue(25);
    
    jest.advanceTimersByTime(3000);
    expect(onReconnectGemini).toHaveBeenCalled();
    
    jest.useRealTimers();
  });

  it('should skip Gemini health checks during reconnection and cooldown', () => {
    jest.useFakeTimers();
    const onReconnectGemini = jest.fn();
    connectionHealthService.registerCallbacks({ onReconnectGemini });
    connectionHealthService.startHostMonitoring('R', true);
    
    connectionHealthService.updateMicState(true);
    connectionHealthService.updateTranslationState(true);
    (geminiTranslateService.getConsecutiveSendFailures as jest.Mock).mockReturnValue(25);
    
    // Set reconnecting
    connectionHealthService.setGeminiReconnecting(true);
    jest.advanceTimersByTime(3000);
    expect(onReconnectGemini).not.toHaveBeenCalled();
    
    // End reconnecting (starts cooldown)
    connectionHealthService.setGeminiReconnecting(false);
    jest.advanceTimersByTime(3000);
    expect(onReconnectGemini).not.toHaveBeenCalled();
    
    // Advance past cooldown (30s)
    jest.advanceTimersByTime(30000);
    expect(onReconnectGemini).toHaveBeenCalled();
    
    jest.useRealTimers();
  });
});
