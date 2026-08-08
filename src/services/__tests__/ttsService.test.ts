import ttsService from '../ttsService';

describe('TTSService', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should generate TTS audio successfully on the first model', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{
              inlineData: {
                data: 'base64audio'
              }
            }]
          }
        }]
      })
    });

    const result = await ttsService.generateTTS('hello', 'fake-key');
    expect(result).toBe('base64audio');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const fetchArgs = (global.fetch as jest.Mock).mock.calls[0];
    expect(fetchArgs[0]).toContain('gemini-3.1-flash-tts-preview');
  });

  it('should fallback to second model if the first fails', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error'
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{
                inlineData: {
                  data: 'base64audio2'
                }
              }]
            }
          }]
        })
      });

    const result = await ttsService.generateTTS('hello', 'fake-key');
    expect(result).toBe('base64audio2');
    expect(global.fetch).toHaveBeenCalledTimes(2);
    const fetchArgs2 = (global.fetch as jest.Mock).mock.calls[1];
    expect(fetchArgs2[0]).toContain('gemini-2.5-flash-preview-tts');
  });

  it('should throw an error if all models fail', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'Forbidden'
    });

    await expect(ttsService.generateTTS('hello', 'fake-key')).rejects.toThrow('TTS API error (403): Forbidden');
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('should throw an error if no audio data is in response', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{
              // missing inlineData
            }]
          }
        }]
      })
    });

    await expect(ttsService.generateTTS('hello', 'fake-key')).rejects.toThrow('No audio data in TTS response');
  });
  
  it('should handle non-Error throwables gracefully', async () => {
    (global.fetch as jest.Mock).mockImplementation(() => {
      throw 'string error';
    });

    await expect(ttsService.generateTTS('hello', 'fake-key')).rejects.toThrow('string error');
  });
});
