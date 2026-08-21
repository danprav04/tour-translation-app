import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto'; // Fallback if needed, but modern RN has randomUUID, let's use expo-crypto to be safe

export interface TourSession {
  id: string;
  title: string;
  createdAt: number;
  endedAt: number | null;
  durationMs: number;
  sourceLang: string;
  targetLang: string;
  roomCode: string | null;
  chunkCount: number;
}

export interface TranscriptChunk {
  id: string;
  sessionId: string;
  sequence: number;
  timestampMs: number;
  originalText: string;
  translatedText: string;
  createdAt: number;
}

export class TranscriptDatabaseService {
  private db: SQLite.SQLiteDatabase;

  constructor(db: SQLite.SQLiteDatabase) {
    this.db = db;
  }

  static async initDatabase(db: SQLite.SQLiteDatabase): Promise<void> {
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS tour_sessions (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        ended_at INTEGER,
        duration_ms INTEGER DEFAULT 0,
        source_lang TEXT NOT NULL,
        target_lang TEXT NOT NULL,
        room_code TEXT,
        chunk_count INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS transcript_chunks (
        id TEXT PRIMARY KEY NOT NULL,
        session_id TEXT NOT NULL REFERENCES tour_sessions(id) ON DELETE CASCADE,
        sequence INTEGER NOT NULL,
        timestamp_ms INTEGER NOT NULL,
        original_text TEXT NOT NULL,
        translated_text TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_chunks_session ON transcript_chunks(session_id, sequence ASC);
      CREATE INDEX IF NOT EXISTS idx_sessions_created ON tour_sessions(created_at DESC);
    `);
  }

  async createSession(session: {
    sourceLang: string;
    targetLang: string;
    roomCode?: string;
  }): Promise<string> {
    const id = Crypto.randomUUID();
    const now = Date.now();
    const dateStr = new Date(now).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
    const title = \`Tour – \${dateStr}\`;

    await this.db.runAsync(
      \`INSERT INTO tour_sessions (id, title, created_at, source_lang, target_lang, room_code)
       VALUES (?, ?, ?, ?, ?, ?)\`,
      [id, title, now, session.sourceLang, session.targetLang, session.roomCode || null]
    );

    return id;
  }

  async insertChunk(chunk: {
    sessionId: string;
    sequence: number;
    timestampMs: number;
    originalText: string;
    translatedText: string;
  }): Promise<void> {
    const id = Crypto.randomUUID();
    const now = Date.now();
    
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync(
        \`INSERT INTO transcript_chunks (id, session_id, sequence, timestamp_ms, original_text, translated_text, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)\`,
        [id, chunk.sessionId, chunk.sequence, chunk.timestampMs, chunk.originalText, chunk.translatedText, now]
      );

      await this.db.runAsync(
        \`UPDATE tour_sessions 
         SET chunk_count = chunk_count + 1,
             duration_ms = MAX(duration_ms, ?)
         WHERE id = ?\`,
        [chunk.timestampMs, chunk.sessionId]
      );
    });
  }

  async finalizeSession(sessionId: string): Promise<void> {
    const now = Date.now();
    await this.db.runAsync(
      \`UPDATE tour_sessions SET ended_at = ? WHERE id = ?\`,
      [now, sessionId]
    );
  }

  async getSessions(options?: { search?: string; limit?: number; offset?: number }): Promise<TourSession[]> {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    if (options?.search) {
      const searchPattern = \`%\${options.search}%\`;
      const rows = await this.db.getAllAsync<any>(
        \`SELECT DISTINCT s.* FROM tour_sessions s
         LEFT JOIN transcript_chunks c ON s.id = c.session_id
         WHERE s.title LIKE ? OR c.original_text LIKE ? OR c.translated_text LIKE ?
         ORDER BY s.created_at DESC
         LIMIT ? OFFSET ?\`,
        [searchPattern, searchPattern, searchPattern, limit, offset]
      );
      return rows.map(this.mapSessionRow);
    }

    const rows = await this.db.getAllAsync<any>(
      \`SELECT * FROM tour_sessions ORDER BY created_at DESC LIMIT ? OFFSET ?\`,
      [limit, offset]
    );
    return rows.map(this.mapSessionRow);
  }

  async getSessionWithChunks(sessionId: string): Promise<{ session: TourSession | null, chunks: TranscriptChunk[] }> {
    const sessionRow = await this.db.getFirstAsync<any>(
      \`SELECT * FROM tour_sessions WHERE id = ?\`,
      [sessionId]
    );
    
    if (!sessionRow) {
      return { session: null, chunks: [] };
    }

    const chunkRows = await this.db.getAllAsync<any>(
      \`SELECT * FROM transcript_chunks WHERE session_id = ? ORDER BY sequence ASC\`,
      [sessionId]
    );

    return {
      session: this.mapSessionRow(sessionRow),
      chunks: chunkRows.map(this.mapChunkRow)
    };
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.db.runAsync(\`DELETE FROM tour_sessions WHERE id = ?\`, [sessionId]);
  }

  private mapSessionRow(row: any): TourSession {
    return {
      id: row.id,
      title: row.title,
      createdAt: row.created_at,
      endedAt: row.ended_at,
      durationMs: row.duration_ms,
      sourceLang: row.source_lang,
      targetLang: row.target_lang,
      roomCode: row.room_code,
      chunkCount: row.chunk_count,
    };
  }

  private mapChunkRow(row: any): TranscriptChunk {
    return {
      id: row.id,
      sessionId: row.session_id,
      sequence: row.sequence,
      timestampMs: row.timestamp_ms,
      originalText: row.original_text,
      translatedText: row.translated_text,
      createdAt: row.created_at,
    };
  }
}
