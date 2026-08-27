import { TextTranslationService } from '../textTranslationService';

describe('TextTranslationService', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    jest.useFakeTimers();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.resetAllMocks();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('translateText (Batch)', () => {
    it('translates text successfully using primary model', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'Hola' }] } }]
        })
      });

      const result = await TextTranslationService.translateText('Hello', 'es', 'test-key', 'Custom instruction');
      expect(result).toBe('Hola');
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain('gemini-3.5-flash-lite');
    });

    it('falls back to secondary model on 429 quota error', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          text: async () => 'Rate limit exceeded'
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: 'Hola fallback' }] } }]
          })
        });

      const translationPromise = TextTranslationService.translateText('Hello', 'es', 'test-key');
      
      // Fast forward the backoff timer
      await Promise.resolve();
      await Promise.resolve();
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
      await Promise.resolve();
      
      const result = await translationPromise;
      expect(result).toBe('Hola fallback');
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect((global.fetch as jest.Mock).mock.calls[1][0]).toContain('gemini-3.1-flash-lite');
    });

    it('throws error if all models fail after retries', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValue({ ok: false, status: 500, text: async () => 'Internal Error' });

      const translationPromise = TextTranslationService.translateText('Hello', 'es', 'test-key');
      
      for (let i = 0; i < 4; i++) {
        await Promise.resolve();
        await Promise.resolve();
        jest.advanceTimersByTime(2000);
        await Promise.resolve();
        await Promise.resolve();
      }
      
      await expect(translationPromise).rejects.toThrow();
      expect(global.fetch).toHaveBeenCalledTimes(4);
    });

    it('throws error when response parts are missing', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ candidates: [] })
      });

      const translationPromise = TextTranslationService.translateText('Hello', 'es', 'test-key');
      for (let i = 0; i < 4; i++) {
        await Promise.resolve();
        await Promise.resolve();
        jest.advanceTimersByTime(2000);
        await Promise.resolve();
        await Promise.resolve();
      }

      await expect(translationPromise).rejects.toThrow('Unexpected response format');
    });
  });

  describe('translateTextStreaming (Live SSE)', () => {
    it('streams translation chunks and invokes callback progressively', async () => {
      const encoder = new TextEncoder();
      const chunks = [
        'data: ' + JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Hola ' }] } }] }) + '\n\n',
        'data: ' + JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Mundo' }] } }] }) + '\n\n',
        'data: [DONE]\n\n'
      ];

      let chunkIndex = 0;
      const mockReader = {
        read: jest.fn().mockImplementation(async () => {
          if (chunkIndex < chunks.length) {
            const val = encoder.encode(chunks[chunkIndex++]);
            return { value: val, done: false };
          }
          return { value: undefined, done: true };
        })
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        body: {
          getReader: () => mockReader
        }
      });

      const partialUpdates: string[] = [];
      const result = await TextTranslationService.translateTextStreaming(
        'Hello World',
        'es',
        'test-key',
        'Custom prompt',
        (partial) => partialUpdates.push(partial)
      );

      expect(result).toBe('Hola Mundo');
      expect(partialUpdates).toEqual(['Hola ', 'Hola Mundo']);
      expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain('streamGenerateContent?alt=sse');
    });

    it('falls back to secondary model on streaming network failure', async () => {
      const encoder = new TextEncoder();
      const fallbackChunks = [
        'data: ' + JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Hola Streaming' }] } }] }) + '\n\n'
      ];

      let fallbackIndex = 0;
      const fallbackReader = {
        read: jest.fn().mockImplementation(async () => {
          if (fallbackIndex < fallbackChunks.length) {
            return { value: encoder.encode(fallbackChunks[fallbackIndex++]), done: false };
          }
          return { value: undefined, done: true };
        })
      };

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          text: async () => 'Service Unavailable'
        })
        .mockResolvedValueOnce({
          ok: true,
          body: {
            getReader: () => fallbackReader
          }
        });

      const partialUpdates: string[] = [];
      const streamPromise = TextTranslationService.translateTextStreaming(
        'Hello',
        'es',
        'test-key',
        '',
        (partial) => partialUpdates.push(partial)
      );

      await Promise.resolve();
      await Promise.resolve();
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();

      const result = await streamPromise;
      expect(result).toBe('Hola Streaming');
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect((global.fetch as jest.Mock).mock.calls[1][0]).toContain('gemini-3.1-flash-lite');
    });

    it('throws error if streaming response body is missing', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        body: null
      });

      const streamPromise = TextTranslationService.translateTextStreaming(
        'Hello',
        'es',
        'test-key',
        '',
        () => {}
      );

      for (let i = 0; i < 4; i++) {
        await Promise.resolve();
        await Promise.resolve();
        jest.advanceTimersByTime(2000);
        await Promise.resolve();
        await Promise.resolve();
      }

      await expect(streamPromise).rejects.toThrow('No response body from streaming API');
    });
  });
});
