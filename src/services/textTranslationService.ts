export class TextTranslationService {
  private static PRIMARY_MODEL = 'gemini-3.5-flash-lite';
  private static FALLBACK_MODEL = 'gemini-3.1-flash-lite';

  static async translateText(
    text: string, 
    sourceLang: string, 
    targetLang: string, 
    apiKey: string,
    customPromptInjection: string = '',
    retryCount = 0
  ): Promise<string> {
    const isFallback = retryCount > 0;
    const model = isFallback ? this.FALLBACK_MODEL : this.PRIMARY_MODEL;
    
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: `Translate the following text from ${sourceLang} to ${targetLang}. Output only the translation, nothing else.${customPromptInjection ? `\n\nAdditional instructions: ${customPromptInjection}` : ''}\n\nText: "${text}"`
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.3,
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Translation API Error (${model}): ${response.status} ${errorText}`);
      }

      const data = await response.json();
      const translatedText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!translatedText) {
        throw new Error(`Unexpected response format from ${model}`);
      }

      return translatedText.trim();
    } catch (error) {
      if (retryCount < 3) {
        console.warn(`[TextTranslationService] Model ${model} failed (attempt ${retryCount + 1}/4), retrying...`, error);
        
        const errorMessage = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
        const isQuotaError = errorMessage.includes('429') || errorMessage.includes('quota');
        const delay = isQuotaError ? 1000 : 2000;
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.translateText(text, sourceLang, targetLang, apiKey, customPromptInjection, retryCount + 1);
      }
      
      console.error(`[TextTranslationService] All models failed after 3 retries.`, error);
      throw error;
    }
  }
}
