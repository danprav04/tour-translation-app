export class TextTranslationService {
  private static PRIMARY_MODEL = 'gemini-3.5-flash-lite';
  private static FALLBACK_MODEL = 'gemini-3.1-flash-lite';

  static async translateText(
    text: string, 
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
                  text: `Translate the following text to ${targetLang}. Output only the translation, nothing else.${customPromptInjection ? `\n\nAdditional instructions: ${customPromptInjection}` : ''}\n\nText: "${text}"`
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
        return this.translateText(text, targetLang, apiKey, customPromptInjection, retryCount + 1);
      }
      
      console.error(`[TextTranslationService] All models failed after 3 retries.`, error);
      throw error;
    }
  }

  static async translateTextStreaming(
    text: string,
    targetLang: string,
    apiKey: string,
    customPromptInjection: string,
    onPartialText: (partial: string) => void,
    retryCount = 0,
    abortSignal?: AbortSignal
  ): Promise<string> {
    const isFallback = retryCount > 0;
    const model = isFallback ? this.FALLBACK_MODEL : this.PRIMARY_MODEL;
    
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;
      
      const response = await fetch(url, {
        method: 'POST',
        signal: abortSignal,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: `Translate the following text to ${targetLang}. Output only the translation, nothing else.${customPromptInjection ? `\n\nAdditional instructions: ${customPromptInjection}` : ''}\n\nText: "${text}"`
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
        throw new Error(`Streaming Translation API Error (${model}): ${response.status} ${errorText}`);
      }

      if (!response.body) {
        throw new Error(`No response body from streaming API`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let done = false;
      let fullText = '';
      let buffer = '';

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;
          
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep the last incomplete line in buffer

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data: ')) {
              const dataStr = trimmed.slice(6);
              if (dataStr === '[DONE]') continue;
              
              try {
                const data = JSON.parse(dataStr);
                const partText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (partText) {
                  fullText += partText;
                  onPartialText(fullText.trimStart());
                }
              } catch (e) {
                // Ignore parse errors on partial chunks
              }
            }
          }
        }
      }
      
      // Process any remaining buffer
      if (buffer.trim().startsWith('data: ')) {
        const dataStr = buffer.trim().slice(6);
        if (dataStr !== '[DONE]') {
          try {
            const data = JSON.parse(dataStr);
            const partText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (partText) {
              fullText += partText;
              onPartialText(fullText.trimStart());
            }
          } catch (e) {}
        }
      }

      return fullText.trim();
    } catch (error) {
      if (abortSignal?.aborted) {
        throw error;
      }
      if (retryCount < 3) {
        console.warn(`[TextTranslationService] Streaming model ${model} failed (attempt ${retryCount + 1}/4), retrying...`, error);
        
        const errorMessage = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
        const isQuotaError = errorMessage.includes('429') || errorMessage.includes('quota');
        const delay = isQuotaError ? 1000 : 2000;
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.translateTextStreaming(text, targetLang, apiKey, customPromptInjection, onPartialText, retryCount + 1, abortSignal);
      }
      
      console.error(`[TextTranslationService] All streaming models failed after 3 retries.`, error);
      throw error;
    }
  }
}
