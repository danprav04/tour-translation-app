class TranscriptionService {
  private ws: WebSocket | null = null;
  private onInterimTextCallback: ((text: string) => void) | null = null;
  private onFinalTextCallback: ((text: string) => void) | null = null;
  private onErrorCallback: ((error: Error) => void) | null = null;
  private onCloseCallback: (() => void) | null = null;
  public currentApiKey: string | null = null;
  public connectionState: 'disconnected' | 'connecting' | 'connected' = 'disconnected';
  private keepaliveInterval: ReturnType<typeof setInterval> | null = null;
  private accumulatedInterim: string = '';

  async connect(apiKey: string): Promise<void> {
    if (this.ws) {
      this.disconnect();
    }
    this.currentApiKey = apiKey;
    this.connectionState = 'connecting';
    this.accumulatedInterim = '';

    // We use gemini-3-flash-live as instructed
    const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;

      let isSetupComplete = false;

      ws.onopen = () => {
        if (this.ws !== ws) return;
        
        console.log('[Transcription WS] Connected. Sending setup...');
        const setupMessage = {
          setup: {
            model: "models/gemini-3-flash-live",
            generationConfig: {
              responseModalities: ["TEXT"],
            },
            systemInstruction: {
              parts: [{ text: "Transcribe the following spoken audio exactly as heard. Output only the transcription, nothing else." }]
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
            try {
              messageText = new TextDecoder().decode(event.data);
            } catch (err) {
              messageText = '';
            }
          }

          let message;
          try {
            message = JSON.parse(messageText);
          } catch {
            return;
          }

          const messages = Array.isArray(message) ? message : [message];

          for (const msg of messages) {
            if (msg.setupComplete) {
              console.log('[Transcription WS] Setup complete received.');
              this.connectionState = 'connected';
              isSetupComplete = true;
              this.startKeepalive();
              resolve();
            } else if (msg.serverContent?.modelTurn?.parts) {
              const parts = msg.serverContent.modelTurn.parts;
              for (const part of parts) {
                if (part.text) {
                  // For live API, text parts are usually interim until turnComplete
                  this.accumulatedInterim += part.text;
                  if (this.onInterimTextCallback) {
                    this.onInterimTextCallback(this.accumulatedInterim);
                  }
                }
              }
            } 
            
            if (msg.serverContent?.turnComplete) {
              // The API has finished an utterance turn (silence detected)
              if (this.accumulatedInterim.trim() && this.onFinalTextCallback) {
                this.onFinalTextCallback(this.accumulatedInterim.trim());
              }
              this.accumulatedInterim = '';
              if (this.onInterimTextCallback) {
                this.onInterimTextCallback('');
              }
            }

            if (msg.error) {
              console.error('[Transcription WS] Error from server:', msg.error);
              const err = new Error(msg.error.message || 'Server returned an error');
              if (this.onErrorCallback) {
                this.onErrorCallback(err);
              }
              reject(err);
            }
          }
        } catch (error) {
          console.error('[Transcription WS] Failed in onmessage:', error);
          if (this.onErrorCallback) {
            this.onErrorCallback(error instanceof Error ? error : new Error('Unknown error parsing message'));
          }
        }
      };

      ws.onerror = () => {
        if (this.ws !== ws) return;
        
        console.error('[Transcription WS] WebSocket error observed');
        this.connectionState = 'disconnected';
        if (this.onErrorCallback) {
          this.onErrorCallback(new Error('WebSocket connection failed.'));
        }
        reject(new Error('WebSocket connection failed.'));
      };

      ws.onclose = (event) => {
        console.log(`[Transcription WS] Closed with code ${event.code}, reason: ${event.reason}`);
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
    } catch (e) {
      console.warn('[Transcription WS] Failed to send audio chunk:', e);
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
    this.accumulatedInterim = '';
  }

  onInterimText(callback: (text: string) => void): void {
    this.onInterimTextCallback = callback;
  }

  onFinalText(callback: (text: string) => void): void {
    this.onFinalTextCallback = callback;
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

export default new TranscriptionService();
