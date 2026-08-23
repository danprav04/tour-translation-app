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

  beforeEach(() => {
    mockDb = {
      createSession: jest.fn().mockResolvedValue('session-1'),
      insertChunk: jest.fn(),
      finalizeSession: jest.fn(),
    };
    (useDatabaseContext as jest.Mock).mockReturnValue(mockDb);
    (useDebugContext as jest.Mock).mockReturnValue({
      setDebugState: jest.fn(),
    });

    (transcriptionService.connect as jest.Mock).mockResolvedValue(undefined);
    (transcriptionService.onInterimText as jest.Mock).mockImplementation((cb) => cb);
    (transcriptionService.onFinalText as jest.Mock).mockImplementation((cb) => cb);
    (transcriptionService.onError as jest.Mock).mockImplementation((cb) => cb);
    (transcriptionService.onClose as jest.Mock).mockImplementation((cb) => cb);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('initializes with default state', () => {
    const { result } = renderHook(() => useTranscript());
    expect(result.current.finalChunks).toEqual([]);
    expect(result.current.interimText).toBe('');
    expect(result.current.isActive).toBe(false);
    expect(result.current.displayMode).toBe('both');
  });

  it('starts transcription and handles session creation', async () => {
    const { result } = renderHook(() => useTranscript());
    
    await act(async () => {
      await result.current.startTranscription('key', 'en', 'es', 'ABC');
    });

    expect(mockDb.createSession).toHaveBeenCalledWith({
      sourceLang: 'en',
      targetLang: 'es',
      roomCode: 'ABC'
    });
    expect(transcriptionService.connect).toHaveBeenCalledWith('key');
    expect(result.current.isActive).toBe(true);
    expect(result.current.sessionId).toBe('session-1');
  });

  it('stops transcription', async () => {
    const { result } = renderHook(() => useTranscript());
    
    await act(async () => {
      await result.current.startTranscription('key', 'en', 'es', 'ABC');
    });

    await act(async () => {
      await result.current.stopTranscription();
    });

    expect(transcriptionService.disconnect).toHaveBeenCalled();
    expect(mockDb.finalizeSession).toHaveBeenCalledWith('session-1');
    expect(result.current.isActive).toBe(false);
  });

  it('sends audio chunk when active', async () => {
    const { result } = renderHook(() => useTranscript());
    
    await act(async () => {
      await result.current.startTranscription('key', 'en', 'es', 'ABC');
    });

    act(() => {
      result.current.sendAudioChunk('data');
    });

    expect(transcriptionService.sendAudioChunk).toHaveBeenCalledWith('data');
  });
});
