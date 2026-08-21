import { TranscriptExportService } from '../transcriptExportService';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';

jest.mock('expo-print', () => ({
  printToFileAsync: jest.fn().mockResolvedValue({ uri: 'file://test.pdf' })
}));

jest.mock('expo-sharing', () => ({
  shareAsync: jest.fn().mockResolvedValue(true)
}));

jest.mock('expo-file-system', () => ({
  writeAsStringAsync: jest.fn().mockResolvedValue(true),
  cacheDirectory: 'file://cache/',
  EncodingType: { UTF8: 'utf8' }
}));

describe('TranscriptExportService', () => {
  const mockData = {
    session: {
      id: '1', title: 'Test Tour', createdAt: 1000, endedAt: 2000, durationMs: 1000,
      sourceLang: 'en', targetLang: 'es', roomCode: null, chunkCount: 1
    },
    chunks: [
      { id: 'c1', sessionId: '1', sequence: 0, timestampMs: 1000, originalText: 'Hello', translatedText: 'Hola', createdAt: 1000 }
    ]
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('exports to PDF', async () => {
    await TranscriptExportService.exportToPdf(mockData);
    expect(Print.printToFileAsync).toHaveBeenCalled();
    expect(Sharing.shareAsync).toHaveBeenCalledWith('file://test.pdf', expect.any(Object));
  });

  it('exports to Plain Text', async () => {
    await TranscriptExportService.exportToPlainText(mockData);
    expect(FileSystem.writeAsStringAsync).toHaveBeenCalled();
    expect(Sharing.shareAsync).toHaveBeenCalledWith(expect.stringContaining('Test_Tour_transcript.txt'), expect.any(Object));
  });
});
