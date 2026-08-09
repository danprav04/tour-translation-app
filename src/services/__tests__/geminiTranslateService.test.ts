import geminiTranslateService from '../geminiTranslateService';

class MockWebSocket {
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
  });

  it('should reject if websocket errors during connection', async () => {
    const connectPromise = geminiTranslateService.connect('dummyKey', 'en');
    
    setTimeout(() => {
      const ws = (geminiTranslateService as any).ws;
      ws.onerror(new Error('test'));
    }, 20);

    await expect(connectPromise).rejects.toThrow('WebSocket connection failed.');
  });

  it('should handle incoming translated audio', (done) => {
    geminiTranslateService.connect('key', 'en').catch(() => {}); // Catch closure
    setTimeout(() => {
      const ws = (geminiTranslateService as any).ws;
      
      geminiTranslateService.onTranslatedAudio((audio) => {
        expect(audio).toBe('base64audio');
        done();
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
    }, 20);
  });

  it('should send audio chunks if connected', (done) => {
    geminiTranslateService.connect('key', 'en').catch(() => {});
    setTimeout(() => {
      const ws = (geminiTranslateService as any).ws;
      geminiTranslateService.sendAudioChunk('audioData');
      expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('audioData'));
      expect(geminiTranslateService.getConsecutiveSendFailures()).toBe(0);
      done();
    }, 20);
  });

  it('should track consecutive send failures and connection state', (done) => {
    geminiTranslateService.connect('key', 'en').catch(() => {});
    
    // Should fail since not connected
    geminiTranslateService.sendAudioChunk('data1');
    expect(geminiTranslateService.getConsecutiveSendFailures()).toBe(1);

    setTimeout(() => {
      const ws = (geminiTranslateService as any).ws;
      ws.onmessage({ data: JSON.stringify({ setupComplete: true }) });
      
      setTimeout(() => {
        expect(geminiTranslateService.connectionState).toBe('connected');
        
        // Successful send
        geminiTranslateService.sendAudioChunk('data2');
        expect(geminiTranslateService.getConsecutiveSendFailures()).toBe(0);

        // Close connection
        ws.onclose({ code: 1000, reason: 'Test' });
        expect(geminiTranslateService.connectionState).toBe('disconnected');
        
        done();
      }, 10);
    }, 20);
  });
});
