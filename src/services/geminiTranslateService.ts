class GeminiTranslateService {
  private ws: WebSocket | null = null;
  private onTranslatedAudioCallback: ((base64PcmData: string) => void) | null = null;
  private onErrorCallback: ((error: Error) => void) | null = null;
  private onCloseCallback: (() => void) | null = null;
  public lastTranslatedAudioAt: number = 0;
  public currentApiKey: string | null = null;
  public currentLangCode: string | null = null;
  public connectionState: 'disconnected' | 'connecting' | 'connected' = 'disconnected';
  public consecutiveSendFailures: number = 0;
  private keepaliveInterval: ReturnType<typeof setInterval> | null = null;

  getConsecutiveSendFailures(): number {
    return this.consecutiveSendFailures;
  }

  async connect(apiKey: string, targetLanguageCode: string): Promise<void> {
    if (this.ws) {
      this.disconnect();
    }
    this.currentApiKey = apiKey;
    this.currentLangCode = targetLanguageCode;
    this.lastTranslatedAudioAt = 0;
    this.connectionState = 'connecting';
    this.consecutiveSendFailures = 0;

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
                silenceDurationMs: 1200
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
            // Convert ArrayBuffer to string safely using TextDecoder
            try {
              messageText = new TextDecoder().decode(event.data);
            } catch (err) {
              console.error('[Gemini WS] Failed to decode ArrayBuffer:', err);
              messageText = '';
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
              this.connectionState = 'connected';
              isSetupComplete = true;
              this.startKeepalive();
              resolve();
            } else if (msg.serverContent?.modelTurn?.parts) {
              const parts = msg.serverContent.modelTurn.parts;
              for (const part of parts) {
                if (part.inlineData && part.inlineData.data) {
                  // console.log('[Gemini WS] Received audio chunk of length', part.inlineData.data.length);
                  this.lastTranslatedAudioAt = Date.now();
                  if (this.onTranslatedAudioCallback) {
                    this.onTranslatedAudioCallback(part.inlineData.data);
                  }
                }
              }
            } else if (msg.serverContent) {
              // console.log('[Gemini WS] serverContent without audio parts:', JSON.stringify(msg.serverContent));
            } else if (msg.error) {
              console.error('[Gemini WS] Error from server:', msg.error);
              const err = new Error(msg.error.message || 'Server returned an error');
              if (this.onErrorCallback) {
                this.onErrorCallback(err);
              }
              reject(err);
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
        this.connectionState = 'disconnected';
        if (this.onErrorCallback) {
          this.onErrorCallback(new Error('WebSocket connection failed.'));
        }
        reject(new Error('WebSocket connection failed. Check your API key and network.'));
      };

      ws.onclose = (event) => {
        console.log(`[Gemini WS] Closed with code ${event.code}, reason: ${event.reason}`);
        this.connectionState = 'disconnected';
        this.stopKeepalive();
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

  startKeepalive(): void {
    if (this.keepaliveInterval) return;
    // 50ms of silence at 16kHz 16-bit mono = 1600 bytes
    // Base64 encode an array of zeros
    const silentChunk = btoa(String.fromCharCode(...new Uint8Array(1600)));
    this.keepaliveInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.sendAudioChunk(silentChunk);
      }
    }, 8000);
  }

  stopKeepalive(): void {
    if (this.keepaliveInterval) {
      clearInterval(this.keepaliveInterval);
      this.keepaliveInterval = null;
    }
  }

  sendAudioChunk(base64PcmData: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      if (this.connectionState !== 'connecting') {
        this.consecutiveSendFailures++;
      }
      return;
    }

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
    try {
      this.ws.send(JSON.stringify(message));
      this.consecutiveSendFailures = 0;
    } catch (e) {
      console.warn('[Gemini WS] Failed to send audio chunk:', e);
      this.consecutiveSendFailures++;
    }
  }

  disconnect(): void {
    this.onCloseCallback = null;
    this.onErrorCallback = null;
    this.stopKeepalive();
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.connectionState = 'disconnected';
    this.lastTranslatedAudioAt = 0;
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

  async connectOverlap(apiKey: string, targetLanguageCode: string): Promise<void> {
    // Create a new WS connection without closing the old one.
    // The caller is responsible for swapping and closing the old connection.
    const oldWs = this.ws;
    this.ws = null; // Temporarily clear so connect() doesn't close old one
    try {
      await this.connect(apiKey, targetLanguageCode);
    } catch (error) {
      // If new connection fails, restore old one
      if (!this.ws && oldWs && oldWs.readyState === WebSocket.OPEN) {
        this.ws = oldWs;
      }
      throw error;
    }
    // New connection succeeded. Close old one safely without triggering callbacks.
    if (oldWs) {
      oldWs.onclose = null;
      try { oldWs.close(); } catch (e) { /* ignore */ }
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

export default new GeminiTranslateService();
