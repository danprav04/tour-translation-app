import { TextTranslationService } from '../textTranslationService';

describe('TextTranslationService', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.resetAllMocks();
    jest.useRealTimers();
  });

  it('translates text successfully using primary model', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'Hola' }] } }]
      })
    });

    const result = await TextTranslationService.translateText('Hello', 'en', 'es', 'test-key');
    expect(result).toBe('Hola');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain('gemini-3.5-flash-lite');
  });

  it('falls back to secondary model on failure', async () => {
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

    const translationPromise = TextTranslationService.translateText('Hello', 'en', 'es', 'test-key');
    
    // Fast forward the backoff timer
    await Promise.resolve(); // flush initial fetch
    jest.advanceTimersByTime(500);
    
    const result = await translationPromise;
    expect(result).toBe('Hola fallback');
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect((global.fetch as jest.Mock).mock.calls[1][0]).toContain('gemini-3.1-flash-lite');
  });

  it('returns failure indicator if both models fail', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: false, text: async () => 'Error 1' })
      .mockResolvedValueOnce({ ok: false, text: async () => 'Error 2' });

    const translationPromise = TextTranslationService.translateText('Hello', 'en', 'es', 'test-key');
    
    await Promise.resolve();
    jest.advanceTimersByTime(500);
    
    const result = await translationPromise;
    expect(result).toBe('[Translation failed] Hello');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
