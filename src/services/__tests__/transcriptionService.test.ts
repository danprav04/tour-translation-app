import transcriptionService from '../transcriptionService';

// Mock WebSocket
class MockWebSocket {
  onopen: any;
  onmessage: any;
  onerror: any;
  onclose: any;
  readyState = 1; // OPEN
  send = jest.fn();
  close = jest.fn(() => {
    if (this.onclose) this.onclose({ code: 1000, reason: 'Closed' });
  });
}

global.WebSocket = MockWebSocket as any;

describe('TranscriptionService', () => {
  beforeEach(() => {
    transcriptionService.disconnect();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('connects and handles setup', async () => {
    const connectPromise = transcriptionService.connect('test-key');
    
    // Get the created MockWebSocket
    const ws = (transcriptionService as any).ws;
    expect(ws).toBeDefined();

    // Trigger open
    ws.onopen();
    
    expect(ws.send).toHaveBeenCalled();
    const setupMsg = JSON.parse(ws.send.mock.calls[0][0]);
    expect(setupMsg.setup.model).toBe('models/gemini-3-flash');
    expect(setupMsg.setup.generationConfig.responseModalities).toEqual(['TEXT']);

    // Trigger setup complete
    ws.onmessage({ data: JSON.stringify({ setupComplete: true }) });
    
    await connectPromise;
    expect(transcriptionService.connectionState).toBe('connected');
  });

  it('handles interim and final text', async () => {
    const onInterimText = jest.fn();
    const onFinalText = jest.fn();
    
    transcriptionService.onInterimText(onInterimText);
    transcriptionService.onFinalText(onFinalText);
    
    transcriptionService.connect('test-key');
    const ws = (transcriptionService as any).ws;
    ws.onmessage({ data: JSON.stringify({ setupComplete: true }) });

    // Interim chunk
    ws.onmessage({
      data: JSON.stringify({
        serverContent: {
          modelTurn: { parts: [{ text: 'Hello ' }] }
        }
      })
    });
    
    expect(onInterimText).toHaveBeenCalledWith('Hello ');
    
    // Final chunk
    ws.onmessage({
      data: JSON.stringify({
        serverContent: {
          turnComplete: true
        }
      })
    });
    
    expect(onFinalText).toHaveBeenCalledWith('Hello');
  });

  it('handles sendAudioChunk', async () => {
    transcriptionService.connect('test-key');
    const ws = (transcriptionService as any).ws;
    ws.onopen();
    ws.onmessage({ data: JSON.stringify({ setupComplete: true }) });
    
    transcriptionService.sendAudioChunk('base64data');
    expect(ws.send).toHaveBeenCalledTimes(2); // Setup + audio chunk
    
    const audioMsg = JSON.parse(ws.send.mock.calls[1][0]);
    expect(audioMsg.realtimeInput.mediaChunks[0].data).toBe('base64data');
  });
});
