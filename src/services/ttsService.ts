/**
 * TTS Service — Generates speech audio from text using Gemini TTS REST API.
 * 
 * Uses gemini-3.1-flash as primary model with gemini-2.5-flash fallback.
 * Returns raw PCM audio data (24kHz, 16-bit, mono) as base64 string.
 */

const TTS_MODELS = [
  'gemini-3.1-flash-tts-preview', // Current valid model name for TTS
  'gemini-2.5-flash-tts-preview', // Fallback
];

// Charon: Informative voice well-suited for a tour guide
const DEFAULT_VOICE = 'Charon';

const SYSTEM_PROMPT = `You are a professional and friendly tour guide narrator. 
Read the provided text clearly and naturally, as if you are guiding a group of tourists through an attraction. 
Use a warm, engaging, and informative tone. Pace yourself so that every word is easy to understand.`;

class TTSService {

  /**
   * Generate TTS audio from text using Gemini TTS API.
   * Tries models in order, falling back on failure.
   * 
   * @returns base64-encoded PCM audio data (24kHz, 16-bit, mono)
   */
  async generateTTS(
    text: string,
    apiKey: string,
    voiceName: string = DEFAULT_VOICE,
  ): Promise<string> {
    let lastError: Error | null = null;

    for (const model of TTS_MODELS) {
      try {
        console.log(`[TTS] Generating with model: ${model}`);
        const audioBase64 = await this.callTTSAPI(text, apiKey, model, voiceName);
        console.log(`[TTS] Successfully generated audio with ${model}`);
        return audioBase64;
      } catch (error) {
        console.warn(`[TTS] Model ${model} failed:`, error);
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    throw lastError || new Error('All TTS models failed');
  }

  private async callTTSAPI(
    text: string,
    apiKey: string,
    model: string,
    voiceName: string,
  ): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: `${SYSTEM_PROMPT}\n\nPlease read the following text:\n\n${text}` },
            ],
          },
        ],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName,
              },
            },
          },
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`TTS API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const audioData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (!audioData) {
      throw new Error('No audio data in TTS response');
    }

    return audioData;
  }
}

export default new TTSService();
