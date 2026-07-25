class GeminiTranslateService {
  private ws: WebSocket | null = null;
  private onTranslatedAudioCallback: ((base64PcmData: string) => void) | null = null;
  private onErrorCallback: ((error: Error) => void) | null = null;

  async connect(apiKey: string, targetLanguageCode: string): Promise<void> {
    if (this.ws) {
      this.disconnect();
    }

    const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;

      ws.onopen = () => {
        if (this.ws !== ws) return;
        
        const setupMessage = {
          setup: {
            model: "models/gemini-3.5-live-translate-preview",
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } }
              }
            },
            targetLanguageCode: targetLanguageCode
          }
        };
        ws.send(JSON.stringify(setupMessage));
      };

      ws.onmessage = (event) => {
        if (this.ws !== ws) return;
        
        try {
          const message = JSON.parse(event.data);
          
          if (message.setupComplete) {
            resolve();
          } else if (message.serverContent?.modelTurn?.parts) {
            const parts = message.serverContent.modelTurn.parts;
            for (const part of parts) {
              if (part.inlineData && part.inlineData.data) {
                if (this.onTranslatedAudioCallback) {
                  this.onTranslatedAudioCallback(part.inlineData.data);
                }
              }
            }
          }
        } catch (error) {
          if (this.onErrorCallback) {
            this.onErrorCallback(error instanceof Error ? error : new Error('Unknown error parsing message'));
          }
        }
      };

      ws.onerror = (error) => {
        if (this.ws !== ws) return;
        
        if (this.onErrorCallback) {
          this.onErrorCallback(new Error('WebSocket error'));
        }
        reject(new Error('WebSocket connection failed'));
      };

      ws.onclose = () => {
        if (this.ws === ws) {
          this.ws = null;
        }
      };
    });
  }

  sendAudioChunk(base64PcmData: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const message = {
      realtimeInput: {
        mediaChunks: [
          {
            mimeType: "audio/pcm;rate=16000",
            data: base64PcmData
          }
        ]
      }
    };
    this.ws.send(JSON.stringify(message));
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  onTranslatedAudio(callback: (base64PcmData: string) => void): void {
    this.onTranslatedAudioCallback = callback;
  }

  onError(callback: (error: Error) => void): void {
    this.onErrorCallback = callback;
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

export default new GeminiTranslateService();
