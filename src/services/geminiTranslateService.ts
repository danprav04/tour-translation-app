class GeminiTranslateService {
  private ws: WebSocket | null = null;
  private onTranslatedAudioCallback: ((base64PcmData: string) => void) | null = null;
  private onErrorCallback: ((error: Error) => void) | null = null;
  private onCloseCallback: (() => void) | null = null;

  async connect(apiKey: string, targetLanguageCode: string): Promise<void> {
    if (this.ws) {
      this.disconnect();
    }

    const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;

      let isSetupComplete = false;

      ws.onopen = () => {
        if (this.ws !== ws) return;
        
        console.log('[Gemini WS] Connected. Sending setup...');
        const setupMessage = {
          setup: {
            model: "models/gemini-3.5-live-translate-preview",
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } }
              },
              translationConfig: {
                targetLanguageCode: targetLanguageCode
              }
            },
            realtimeInputConfig: {
              automaticActivityDetection: {
                disabled: false,
                prefixPaddingMs: 100,
                silenceDurationMs: 600 // Aggressively detect end of speech after 600ms of silence
              }
            }
          }
        };
        ws.send(JSON.stringify(setupMessage));
      };

      ws.onmessage = async (event) => {
        if (this.ws !== ws) return;
        
        try {
          let messageText = '';
          
          if (typeof event.data === 'string') {
            messageText = event.data;
          } else if (event.data instanceof Blob) {
            messageText = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsText(event.data);
            });
          } else if (event.data instanceof ArrayBuffer) {
            // Convert ArrayBuffer to string safely
            const bytes = new Uint8Array(event.data);
            let binary = '';
            for (let i = 0; i < bytes.byteLength; i++) {
              binary += String.fromCharCode(bytes[i]);
            }
            // Naive utf8 decode
            try {
              messageText = decodeURIComponent(escape(binary));
            } catch {
              messageText = binary;
            }
          } else {
            console.log('[Gemini WS] Received unknown object type:', Object.prototype.toString.call(event.data));
            messageText = JSON.stringify(event.data);
          }

          // console.log('[Gemini WS] Raw message text:', messageText);

          let message;
          try {
            message = JSON.parse(messageText);
          } catch {
            console.log('[Gemini WS] Parsed message is not JSON, or parse failed.');
            return;
          }

          // In case the API wraps the response in an array
          const messages = Array.isArray(message) ? message : [message];

          for (const msg of messages) {
            if (msg.setupComplete) {
              console.log('[Gemini WS] Setup complete received.');
              isSetupComplete = true;
              resolve();
            } else if (msg.serverContent?.modelTurn?.parts) {
              const parts = msg.serverContent.modelTurn.parts;
              for (const part of parts) {
                if (part.inlineData && part.inlineData.data) {
                  // console.log('[Gemini WS] Received audio chunk of length', part.inlineData.data.length);
                  if (this.onTranslatedAudioCallback) {
                    this.onTranslatedAudioCallback(part.inlineData.data);
                  }
                }
              }
            } else if (msg.serverContent) {
              // console.log('[Gemini WS] serverContent without audio parts:', JSON.stringify(msg.serverContent));
            } else if (msg.error) {
              console.error('[Gemini WS] Error from server:', msg.error);
              reject(new Error(msg.error.message || 'Server returned an error'));
            } else {
              // console.log('[Gemini WS] Unhandled message part:', msg);
            }
          }
        } catch (error) {
          console.error('[Gemini WS] Failed in onmessage:', error);
          if (this.onErrorCallback) {
            this.onErrorCallback(error instanceof Error ? error : new Error('Unknown error parsing message'));
          }
        }
      };

      ws.onerror = () => {
        if (this.ws !== ws) return;
        
        console.error('[Gemini WS] WebSocket error observed (Check network/API key)');
        if (this.onErrorCallback) {
          this.onErrorCallback(new Error('WebSocket connection failed.'));
        }
        reject(new Error('WebSocket connection failed. Check your API key and network.'));
      };

      ws.onclose = (event) => {
        console.log(`[Gemini WS] Closed with code ${event.code}, reason: ${event.reason}`);
        if (this.ws === ws) {
          this.ws = null;
        }
        if (!isSetupComplete) {
          reject(new Error(`WebSocket closed before setup: ${event.reason}`));
        }
        if (this.onCloseCallback) {
          this.onCloseCallback();
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

  onClose(callback: () => void): void {
    this.onCloseCallback = callback;
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

export default new GeminiTranslateService();
