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

  private async connectWithModel(apiKey: string, modelName: string, version: string = 'v1alpha'): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.${version}.GenerativeService.BidiGenerateContent?key=${apiKey}`;
      const ws = new WebSocket(url);
      this.ws = ws;

      let isSetupComplete = false;

      ws.onopen = () => {
        if (this.ws !== ws) return;
        
        console.log(`[Transcription WS] Connected. Sending setup for model: ${modelName}...`);
        const setupMessage = {
          setup: {
            model: modelName,
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
            messageText = await new Promise((res, rej) => {
              const reader = new FileReader();
              reader.onload = () => res(reader.result as string);
              reader.onerror = rej;
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
              console.log(`[Transcription WS] Setup complete received for ${modelName}.`);
              this.connectionState = 'connected';
              isSetupComplete = true;
              this.startKeepalive();
              resolve();
            } else if (msg.serverContent?.modelTurn?.parts) {
              const parts = msg.serverContent.modelTurn.parts;
              for (const part of parts) {
                if (part.text) {
                  this.accumulatedInterim += part.text;
                  if (this.onInterimTextCallback) {
                    this.onInterimTextCallback(this.accumulatedInterim);
                  }
                }
              }
            } 
            
            if (msg.serverContent?.turnComplete) {
              if (this.accumulatedInterim.trim() && this.onFinalTextCallback) {
                this.onFinalTextCallback(this.accumulatedInterim.trim());
              }
              this.accumulatedInterim = '';
              if (this.onInterimTextCallback) {
                this.onInterimTextCallback('');
              }
            }

            if (msg.error) {
              console.error(`[Transcription WS] Error from server for ${modelName}:`, msg.error);
              const err = new Error(msg.error.message || 'Server returned an error');
              if (this.onErrorCallback && isSetupComplete) {
                this.onErrorCallback(err);
              }
              reject(err);
            }
          }
        } catch (error) {
          console.error('[Transcription WS] Failed in onmessage:', error);
          if (this.onErrorCallback && isSetupComplete) {
            this.onErrorCallback(error instanceof Error ? error : new Error('Unknown error parsing message'));
          }
        }
      };

      ws.onerror = () => {
        if (this.ws !== ws) return;
        
        console.error(`[Transcription WS] WebSocket error observed for ${modelName}`);
        this.connectionState = 'disconnected';
        if (this.onErrorCallback && isSetupComplete) {
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
        } else if (this.onCloseCallback) {
          this.onCloseCallback();
        }
      };
    });
  }

  async connect(apiKey: string): Promise<void> {
    if (this.ws) {
      this.disconnect();
    }
    this.currentApiKey = apiKey;
    this.connectionState = 'connecting';
    this.accumulatedInterim = '';

    const modelsToTry = [
      "models/gemini-2.0-flash",
      "models/gemini-2.5-flash",
      "models/gemini-3.0-flash",
      "models/gemini-3.5-flash",
      "models/gemini-2.0-flash-lite",
      "models/gemini-2.0-pro-exp",
      "models/gemini-2.0-flash-exp"
    ];

    const versionsToTry = ["v1alpha", "v1beta", "v1"];

    let lastError: Error | null = null;
    
    for (const version of versionsToTry) {
      for (const model of modelsToTry) {
        try {
          await this.connectWithModel(apiKey, model, version);
          return; // Success!
        } catch (err) {
          console.warn(`[Transcription WS] Model ${model} on ${version} failed:`, err instanceof Error ? err.message : String(err));
          lastError = err instanceof Error ? err : new Error(String(err));
        }
      }
    }
    
    // If we reach here, all combinations failed
    this.connectionState = 'disconnected';
    throw lastError || new Error('All model and version fallbacks failed');
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

  private chunkCount = 0;

  sendAudioChunk(base64PcmData: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    this.chunkCount++;
    if (this.chunkCount % 100 === 0) {
      console.log(`[Transcription WS] Sent ${this.chunkCount} audio chunks`);
    }

    const message = {
      realtimeInput: {
        audio: {
          mimeType: "audio/pcm;rate=16000",
          data: base64PcmData
        }
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
