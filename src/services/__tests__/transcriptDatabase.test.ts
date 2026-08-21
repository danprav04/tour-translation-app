import { TranscriptDatabaseService } from '../transcriptDatabase';

jest.mock('expo-crypto', () => ({
  randomUUID: () => 'mocked-uuid'
}));

describe('TranscriptDatabaseService', () => {
  let db: any;
  let service: TranscriptDatabaseService;

  beforeEach(() => {
    db = {
      execAsync: jest.fn(),
      runAsync: jest.fn(),
      getAllAsync: jest.fn(),
      getFirstAsync: jest.fn(),
      withTransactionAsync: jest.fn((cb) => cb()),
    };
    service = new TranscriptDatabaseService(db);
    jest.useFakeTimers().setSystemTime(new Date('2026-08-21T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('initializes database', async () => {
    await TranscriptDatabaseService.initDatabase(db);
    expect(db.execAsync).toHaveBeenCalled();
  });

  it('creates session', async () => {
    const id = await service.createSession({
      sourceLang: 'en',
      targetLang: 'es',
      roomCode: 'ABCD'
    });
    expect(id).toBe('mocked-uuid');
    expect(db.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO tour_sessions'),
      expect.arrayContaining(['mocked-uuid', expect.any(String), expect.any(Number), 'en', 'es', 'ABCD'])
    );
  });

  it('inserts chunk', async () => {
    await service.insertChunk({
      sessionId: 'session-1',
      sequence: 0,
      timestampMs: 1000,
      originalText: 'Hello',
      translatedText: 'Hola'
    });
    expect(db.withTransactionAsync).toHaveBeenCalled();
    expect(db.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO transcript_chunks'),
      ['mocked-uuid', 'session-1', 0, 1000, 'Hello', 'Hola', expect.any(Number)]
    );
    expect(db.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE tour_sessions'),
      [1000, 'session-1']
    );
  });

  it('gets sessions', async () => {
    db.getAllAsync.mockResolvedValueOnce([
      { id: '1', title: 'Test', created_at: 1, duration_ms: 0, source_lang: 'en', target_lang: 'es', chunk_count: 0 }
    ]);
    const sessions = await service.getSessions();
    expect(sessions.length).toBe(1);
    expect(sessions[0].id).toBe('1');
  });

  it('gets session with chunks', async () => {
    db.getFirstAsync.mockResolvedValueOnce({ id: '1' });
    db.getAllAsync.mockResolvedValueOnce([{ id: 'c1', session_id: '1', original_text: 'Test' }]);
    
    const result = await service.getSessionWithChunks('1');
    expect(result.session?.id).toBe('1');
    expect(result.chunks.length).toBe(1);
  });

  it('deletes session', async () => {
    await service.deleteSession('1');
    expect(db.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM tour_sessions'),
      ['1']
    );
  });
});
