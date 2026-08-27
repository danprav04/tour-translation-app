import transcriptionService from '../transcriptionService';

// Mock WebSocket
class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  url: string;
  onopen: any;
  onmessage: any;
  onerror: any;
  onclose: any;
  readyState = 1; // OPEN
  send = jest.fn();
  close = jest.fn(() => {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) this.onclose({ code: 1000, reason: 'Closed' });
  });

  constructor(url: string) {
    this.url = url;
  }
}

global.WebSocket = MockWebSocket as any;

describe('TranscriptionService', () => {
  beforeEach(() => {
    transcriptionService.disconnect();
    jest.useFakeTimers();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    transcriptionService.disconnect();
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('connects to gemini-3.5-transcribe-live with SMART mode and custom vocabulary', async () => {
    const connectPromise = transcriptionService.connect('test-key', 'SMART', ['TermA', 'TermB']);
    
    const ws = (transcriptionService as any).ws;
    expect(ws).toBeDefined();
    expect(ws.url).toContain('v1alpha');

    // Trigger open
    ws.onopen();
    
    expect(ws.send).toHaveBeenCalled();
    const setupMsg = JSON.parse(ws.send.mock.calls[0][0]);
    expect(setupMsg.setup.model).toBe('models/gemini-3.5-transcribe-live');
    expect(setupMsg.setup.generationConfig.responseModalities).toEqual(['TEXT']);
    expect(setupMsg.setup.systemInstruction.parts[0].text).toContain('Transcription mode: SMART');
    expect(setupMsg.setup.systemInstruction.parts[0].text).toContain('Custom vocabulary: TermA, TermB');

    // Trigger setup complete
    ws.onmessage({ data: JSON.stringify({ setupComplete: true }) });
    
    await connectPromise;
    expect(transcriptionService.connectionState).toBe('connected');
    expect(transcriptionService.isConnected()).toBe(true);
  });

  it('falls back to gemini-3.1-flash-live-preview if primary model fails', async () => {
    const connectPromise = transcriptionService.connect('test-key', 'VERBATIM');
    
    const ws1 = (transcriptionService as any).ws;
    ws1.onopen();
    // Simulate error from primary model
    await ws1.onmessage({ data: JSON.stringify({ error: { message: 'Primary model unavailable' } }) });
    for (let i = 0; i < 5; i++) await Promise.resolve();

    // Let the second model attempt connect
    const ws2 = (transcriptionService as any).ws;
    expect(ws2).toBeDefined();
    expect(ws2.url).toContain('v1beta');

    ws2.onopen();
    const setupMsg = JSON.parse(ws2.send.mock.calls[0][0]);
    expect(setupMsg.setup.model).toBe('models/gemini-3.1-flash-live-preview');
    expect(setupMsg.setup.generationConfig.responseModalities).toEqual(['AUDIO']);

    ws2.onmessage({ data: JSON.stringify({ setupComplete: true }) });

    await connectPromise;
    expect(transcriptionService.connectionState).toBe('connected');
  });

  it('handles interim, final text, and turn complete messages', async () => {
    const onInterimText = jest.fn();
    const onFinalText = jest.fn();
    
    transcriptionService.onInterimText(onInterimText);
    transcriptionService.onFinalText(onFinalText);
    
    const connectPromise = transcriptionService.connect('test-key');
    const ws = (transcriptionService as any).ws;
    ws.onopen();
    ws.onmessage({ data: JSON.stringify({ setupComplete: true }) });
    await connectPromise;

    // Interim input transcription
    ws.onmessage({
      data: JSON.stringify({
        serverContent: {
          interimInputTranscription: { text: 'Hello ' }
        }
      })
    });
    expect(onInterimText).toHaveBeenCalledWith('Hello ');

    // Final input transcription
    ws.onmessage({
      data: JSON.stringify({
        serverContent: {
          inputTranscription: { text: 'Hello World' }
        }
      })
    });
    expect(onFinalText).toHaveBeenCalledWith('Hello World');

    // Turn complete
    ws.onmessage({
      data: JSON.stringify({
        serverContent: {
          turnComplete: true
        }
      })
    });
    expect(onInterimText).toHaveBeenCalledWith('');
  });

  it('handles sendAudioChunk format', async () => {
    const connectPromise = transcriptionService.connect('test-key');
    const ws = (transcriptionService as any).ws;
    ws.onopen();
    ws.onmessage({ data: JSON.stringify({ setupComplete: true }) });
    await connectPromise;
    
    transcriptionService.sendAudioChunk('base64audio');
    expect(ws.send).toHaveBeenCalledTimes(2); // Setup + audio chunk
    
    const audioMsg = JSON.parse(ws.send.mock.calls[1][0]);
    expect(audioMsg.realtimeInput.mediaChunks[0].mimeType).toBe('audio/pcm;rate=16000');
    expect(audioMsg.realtimeInput.mediaChunks[0].data).toBe('base64audio');
  });

  it('schedules session rotation at 9 minutes and calls connectOverlap', async () => {
    const connectOverlapSpy = jest.spyOn(transcriptionService, 'connectOverlap').mockResolvedValue();

    const connectPromise = transcriptionService.connect('test-key');
    const ws = (transcriptionService as any).ws;
    ws.onopen();
    ws.onmessage({ data: JSON.stringify({ setupComplete: true }) });
    await connectPromise;

    // Fast-forward 9 minutes
    jest.advanceTimersByTime(9 * 60 * 1000);

    expect(connectOverlapSpy).toHaveBeenCalledWith('test-key', 'SMART', []);
  });

  it('handles error callbacks and disconnect cleanup', async () => {
    const onError = jest.fn();
    const onClose = jest.fn();
    transcriptionService.onError(onError);
    transcriptionService.onClose(onClose);

    const connectPromise = transcriptionService.connect('test-key');
    const ws = (transcriptionService as any).ws;
    ws.onopen();
    ws.onmessage({ data: JSON.stringify({ setupComplete: true }) });
    await connectPromise;

    // Trigger server error
    ws.onmessage({ data: JSON.stringify({ error: { message: 'Something went wrong' } }) });
    expect(onError).toHaveBeenCalledWith(expect.any(Error));

    // Trigger close
    ws.onclose({ code: 1000, reason: 'Normal close' });
    expect(onClose).toHaveBeenCalled();
    expect(transcriptionService.connectionState).toBe('disconnected');
    expect(transcriptionService.isConnected()).toBe(false);
  });
});
