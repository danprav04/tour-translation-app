import geminiTranslateService from '../geminiTranslateService';

class MockWebSocket {
  static OPEN = 1;
  url: string;
  onopen: (() => void) | null = null;
  onmessage: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  onclose: ((event: any) => void) | null = null;
  readyState = 1;

  constructor(url: string) {
    this.url = url;
    setTimeout(() => {
      if (this.onopen) this.onopen();
    }, 10);
  }

  send = jest.fn();
  close = jest.fn(() => {
    this.readyState = 3;
    if (this.onclose) this.onclose({ code: 1000, reason: 'Normal Closure' });
  });
}

// Ensure global WebSocket is replaced
(global as any).WebSocket = MockWebSocket;

describe('GeminiTranslateService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    geminiTranslateService.disconnect();
  });

  it('should connect to WebSocket and send setup', async () => {
    const connectPromise = geminiTranslateService.connect('dummyKey', 'en');
    expect(geminiTranslateService.connectionState).toBe('connecting');
    
    // Simulate setupComplete response from server
    setTimeout(() => {
      const ws = (geminiTranslateService as any).ws;
      ws.onmessage({ data: JSON.stringify({ setupComplete: true }) });
    }, 20);

    await expect(connectPromise).resolves.toBeUndefined();
    expect(geminiTranslateService.connectionState).toBe('connected');
    
    const ws = (geminiTranslateService as any).ws;
    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('models/gemini-3.5-live-translate-preview'));
    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('"silenceDurationMs":1200'));
  });

  it('should reject if websocket errors during connection', async () => {
    const connectPromise = geminiTranslateService.connect('dummyKey', 'en');
    
    setTimeout(() => {
      const ws = (geminiTranslateService as any).ws;
      ws.onerror(new Error('test'));
    }, 20);

    await expect(connectPromise).rejects.toThrow('WebSocket connection failed.');
  });

  it('should handle incoming translated audio', async () => {
    jest.useFakeTimers();
    const connectPromise = geminiTranslateService.connect('key', 'en').catch(() => {});
    jest.advanceTimersByTime(20);

    const ws = (geminiTranslateService as any).ws;
    let receivedAudio = '';
    
    geminiTranslateService.onTranslatedAudio((audio) => {
      receivedAudio = audio;
    });

    ws.onmessage({
      data: JSON.stringify({
        serverContent: {
          modelTurn: {
            parts: [{ inlineData: { data: 'base64audio' } }]
          }
        }
      })
    });

    expect(receivedAudio).toBe('base64audio');
    jest.useRealTimers();
  });

  it('should send audio chunks if connected', async () => {
    jest.useFakeTimers();
    const connectPromise = geminiTranslateService.connect('key', 'en').catch(() => {});
    jest.advanceTimersByTime(20);

    const ws = (geminiTranslateService as any).ws;
    geminiTranslateService.sendAudioChunk('audioData');
    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('audioData'));
    expect(geminiTranslateService.getConsecutiveSendFailures()).toBe(0);

    jest.useRealTimers();
  });

  it('should track consecutive send failures and connection state', async () => {
    jest.useFakeTimers();
    const connectPromise = geminiTranslateService.connect('key', 'en').catch(() => {});
    
    expect(geminiTranslateService.connectionState).toBe('connecting');
    geminiTranslateService.sendAudioChunk('data1');
    expect(geminiTranslateService.getConsecutiveSendFailures()).toBe(0);

    jest.advanceTimersByTime(20);
    const ws = (geminiTranslateService as any).ws;
    ws.onmessage({ data: JSON.stringify({ setupComplete: true }) });
    
    expect(geminiTranslateService.connectionState).toBe('connected');
    
    geminiTranslateService.sendAudioChunk('data2');
    expect(geminiTranslateService.getConsecutiveSendFailures()).toBe(0);

    ws.onclose({ code: 1000, reason: 'Test' });
    expect(geminiTranslateService.connectionState).toBe('disconnected');
    
    geminiTranslateService.sendAudioChunk('data3');
    expect(geminiTranslateService.getConsecutiveSendFailures()).toBe(1);

    jest.useRealTimers();
  });


});
