import { renderHook, act } from '@testing-library/react-native';
import { useTranscript } from '../useTranscript';
import { useDatabaseContext } from '@/context/DatabaseContext';
import { useDebugContext } from '@/context/DebugContext';
import transcriptionService from '@/services/transcriptionService';
import { TextTranslationService } from '@/services/textTranslationService';

jest.mock('@/context/DatabaseContext');
jest.mock('@/context/DebugContext');
jest.mock('@/services/transcriptionService');
jest.mock('@/services/textTranslationService');

describe('useTranscript', () => {
  let mockDb: any;
  let onInterimCb: (text: string) => void;
  let onFinalCb: (text: string) => void;
  let onErrorCb: (err: any) => void;
  let onCloseCb: () => void;

  beforeEach(() => {
    mockDb = {
      createSession: jest.fn().mockResolvedValue('session-1'),
      insertChunk: jest.fn().mockResolvedValue(1),
      finalizeSession: jest.fn().mockResolvedValue(undefined),
    };
    (useDatabaseContext as jest.Mock).mockReturnValue(mockDb);
    (useDebugContext as jest.Mock).mockReturnValue({
      setDebugState: jest.fn(),
    });

    (transcriptionService.connect as jest.Mock).mockResolvedValue(undefined);
    (transcriptionService.disconnect as jest.Mock).mockImplementation(() => {});
    (transcriptionService.sendAudioChunk as jest.Mock).mockImplementation(() => {});
    (transcriptionService.onInterimText as jest.Mock).mockImplementation((cb) => {
      onInterimCb = cb;
    });
    (transcriptionService.onFinalText as jest.Mock).mockImplementation((cb) => {
      onFinalCb = cb;
    });
    (transcriptionService.onError as jest.Mock).mockImplementation((cb) => {
      onErrorCb = cb;
    });
    (transcriptionService.onClose as jest.Mock).mockImplementation((cb) => {
      onCloseCb = cb;
    });

    (TextTranslationService.translateTextStreaming as jest.Mock).mockImplementation(
      async (text, targetLang, apiKey, prompt, onPartial) => {
        if (onPartial) onPartial('Hola');
        return 'Hola Mundo';
      }
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('initializes with default state', async () => {
    const { result, unmount } = await renderHook(() => useTranscript());
    expect(result.current.finalChunks).toEqual([]);
    expect(result.current.interimText).toBe('');
    expect(result.current.isActive).toBe(false);
    expect(result.current.displayMode).toBe('both');
    unmount();
  });

  it('starts transcription and handles session creation', async () => {
    const { result, unmount } = await renderHook(() => useTranscript());
    
    await act(async () => {
      await result.current.startTranscription(
        'key',
        'auto',
        'es',
        'ABC',
        'Custom prompt',
        'SMART',
        'term1, term2'
      );
    });

    expect(mockDb.createSession).toHaveBeenCalledWith({
      sourceLang: 'auto',
      targetLang: 'es',
      roomCode: 'ABC'
    });
    expect(transcriptionService.connect).toHaveBeenCalledWith('key', 'SMART', ['term1', 'term2']);
    expect(result.current.isActive).toBe(true);
    expect(result.current.sessionId).toBe('session-1');
    unmount();
  });

  it('stops transcription', async () => {
    const { result, unmount } = await renderHook(() => useTranscript());
    
    await act(async () => {
      await result.current.startTranscription('key', 'auto', 'es', 'ABC');
    });

    await act(async () => {
      await result.current.stopTranscription();
    });

    expect(transcriptionService.disconnect).toHaveBeenCalled();
    expect(mockDb.finalizeSession).toHaveBeenCalledWith('session-1');
    expect(result.current.isActive).toBe(false);
    expect(result.current.sessionId).toBeNull();
    unmount();
  });

  it('sends audio chunk when active and ignores when inactive', async () => {
    const { result, unmount } = await renderHook(() => useTranscript());
    
    await act(async () => {
      result.current.sendAudioChunk('inactive-data');
    });
    expect(transcriptionService.sendAudioChunk).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.startTranscription('key', 'auto', 'es', 'ABC');
    });

    await act(async () => {
      result.current.sendAudioChunk('active-data');
    });

    expect(transcriptionService.sendAudioChunk).toHaveBeenCalledWith('active-data');
    unmount();
  });

  it('handles interim text updates', async () => {
    const { result, unmount } = await renderHook(() => useTranscript());
    
    await act(async () => {
      await result.current.startTranscription('key', 'auto', 'es', 'ABC');
    });

    await act(async () => {
      onInterimCb('Hello wor');
    });

    expect(result.current.interimText).toBe('Hello wor');
    unmount();
  });

  it('handles final text callback with streaming translation and DB save', async () => {
    const { result, unmount } = await renderHook(() => useTranscript());
    
    await act(async () => {
      await result.current.startTranscription('key', 'auto', 'es', 'ABC', 'Prompt');
    });

    await act(async () => {
      await onFinalCb('Hello world');
    });

    expect(TextTranslationService.translateTextStreaming).toHaveBeenCalledWith(
      'Hello world',
      'es',
      'key',
      'Prompt',
      expect.any(Function)
    );
    expect(mockDb.insertChunk).toHaveBeenCalledWith({
      sessionId: 'session-1',
      sequence: 0,
      timestampMs: expect.any(Number),
      originalText: 'Hello world',
      translatedText: 'Hola Mundo',
    });
    expect(result.current.finalChunks).toHaveLength(1);
    expect(result.current.finalChunks[0].originalText).toBe('Hello world');
    expect(result.current.finalChunks[0].translatedText).toBe('Hola Mundo');
    unmount();
  });

  it('handles translation failure gracefully', async () => {
    (TextTranslationService.translateTextStreaming as jest.Mock).mockRejectedValueOnce(new Error('Network error'));
    const { result, unmount } = await renderHook(() => useTranscript());
    
    await act(async () => {
      await result.current.startTranscription('key', 'auto', 'es', 'ABC');
    });

    await act(async () => {
      await onFinalCb('Hello world');
    });

    expect(result.current.finalChunks).toHaveLength(1);
    expect(result.current.finalChunks[0].translatedText).toBe('[Translation failed] Hello world');
    expect(mockDb.insertChunk).toHaveBeenCalledWith({
      sessionId: 'session-1',
      sequence: 0,
      timestampMs: expect.any(Number),
      originalText: 'Hello world',
      translatedText: '[Translation failed] Hello world',
    });
    unmount();
  });

  it('clears transcript and updates display mode', async () => {
    const { result, unmount } = await renderHook(() => useTranscript());
    
    await act(async () => {
      await result.current.startTranscription('key', 'auto', 'es', 'ABC');
      await onFinalCb('Hello world');
    });

    expect(result.current.finalChunks).toHaveLength(1);

    await act(async () => {
      result.current.clearTranscript();
      result.current.setDisplayMode('original');
    });

    expect(result.current.finalChunks).toEqual([]);
    expect(result.current.interimText).toBe('');
    expect(result.current.displayMode).toBe('original');
    unmount();
  });

  it('handles startTranscription error and throws', async () => {
    (transcriptionService.connect as jest.Mock).mockRejectedValueOnce(new Error('WS error'));
    const { result, unmount } = await renderHook(() => useTranscript());

    await expect(
      act(async () => {
        await result.current.startTranscription('key', 'auto', 'es');
      })
    ).rejects.toThrow('WS error');

    expect(result.current.isActive).toBe(false);
    unmount();
  });

  it('registers error and close callbacks without crashing', async () => {
    const { result, unmount } = await renderHook(() => useTranscript());
    
    await act(async () => {
      await result.current.startTranscription('key', 'auto', 'es');
    });

    expect(() => {
      onErrorCb(new Error('Test WS error'));
      onCloseCb();
    }).not.toThrow();
    unmount();
  });
});
