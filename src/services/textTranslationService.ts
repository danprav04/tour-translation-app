export class TextTranslationService {
  private static PRIMARY_MODEL = 'gemini-3.5-flash-lite';
  private static FALLBACK_MODEL = 'gemini-3.1-flash-lite';

  static async translateText(
    text: string, 
    sourceLang: string, 
    targetLang: string, 
    apiKey: string,
    retryCount = 0
  ): Promise<string> {
    const isFallback = retryCount > 0;
    const model = isFallback ? this.FALLBACK_MODEL : this.PRIMARY_MODEL;
    
    try {
      const url = \`https://generativelanguage.googleapis.com/v1beta/models/\${model}:generateContent?key=\${apiKey}\`;
      
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
                  text: \`Translate the following text from \${sourceLang} to \${targetLang}. Output only the translation, nothing else.\\n\\nText: "\${text}"\`
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
        throw new Error(\`Translation API Error (\${model}): \${response.status} \${errorText}\`);
      }

      const data = await response.json();
      const translatedText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!translatedText) {
        throw new Error(\`Unexpected response format from \${model}\`);
      }

      return translatedText.trim();
    } catch (error) {
      if (!isFallback) {
        console.warn(\`[TextTranslationService] Primary model failed, falling back to \${this.FALLBACK_MODEL}...\`, error);
        // Add exponential backoff for the retry
        await new Promise(resolve => setTimeout(resolve, 500));
        return this.translateText(text, sourceLang, targetLang, apiKey, retryCount + 1);
      }
      
      console.error(\`[TextTranslationService] Fallback model also failed.\`, error);
      // Return original text prefixed with error indicator so feed doesn't crash
      return \`[Translation failed] \${text}\`;
    }
  }
}
