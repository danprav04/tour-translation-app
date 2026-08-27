class TranscriptionService {
  private ws: WebSocket | null = null;
  private onInterimTextCallback: ((text: string) => void) | null = null;
  private onFinalTextCallback: ((text: string) => void) | null = null;
  private onErrorCallback: ((error: Error) => void) | null = null;
  private onCloseCallback: (() => void) | null = null;
  public currentApiKey: string | null = null;
  public connectionState: 'disconnected' | 'connecting' | 'connected' = 'disconnected';
  private keepaliveInterval: ReturnType<typeof setInterval> | null = null;
  private sessionRotationTimer: ReturnType<typeof setTimeout> | null = null;

  private async connectWithModel(
    apiKey: string, 
    modelName: string, 
    transcriptionMode: 'SMART' | 'VERBATIM', 
    customVocabulary: string[]
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // Use v1alpha for gemini-3.5-transcribe-live, fallback uses v1beta
      const apiVersion = modelName.includes('transcribe') ? 'v1alpha' : 'v1beta';
      const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.${apiVersion}.GenerativeService.BidiGenerateContent?key=${apiKey}`;
      const ws = new WebSocket(url);
      this.ws = ws;

      let isSetupComplete = false;

      ws.onopen = () => {
        if (this.ws !== ws) return;
        
        console.log(`[Transcription WS] Connected. Sending setup for model: ${modelName}...`);
        
        let setupMessage: any;
        
        if (modelName.includes('transcribe')) {
          const sysText = [
            `You are a real-time transcription service.`,
            `Transcription mode: ${transcriptionMode}.`,
            customVocabulary.length > 0 ? `Custom vocabulary: ${customVocabulary.join(', ')}` : ''
          ].filter(Boolean).join(' ');

          setupMessage = {
            setup: {
              model: modelName,
              generationConfig: {
                responseModalities: ["TEXT"],
              },
              systemInstruction: {
                parts: [{ text: sysText }]
              }
            }
          };
        } else {
          // Fallback legacy setup for gemini-3.1-flash-live-preview
          setupMessage = {
            setup: {
              model: modelName,
              generationConfig: {
                responseModalities: ["AUDIO"],
              },
              inputAudioTranscription: {},
              realtimeInputConfig: {
                automaticActivityDetection: {
                  disabled: false,
                  prefixPaddingMs: 100,
                  silenceDurationMs: 1200
                }
              }
            }
          };
        }
        
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
            }

            // --- Transcribe Live Model Responses ---
            if (msg.serverContent?.interimInputTranscription) {
              const text = msg.serverContent.interimInputTranscription.text;
              if (text && this.onInterimTextCallback) {
                this.onInterimTextCallback(text);
              }
            }

            if (msg.serverContent?.inputTranscription) {
              const text = msg.serverContent.inputTranscription.text;
              if (text && this.onFinalTextCallback) {
                this.onFinalTextCallback(text.trim());
              }
            }
            
            // Clear interim text on turn completion
            if (msg.serverContent?.turnComplete) {
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

  async connect(
    apiKey: string, 
    transcriptionMode: 'SMART' | 'VERBATIM' = 'SMART',
    customVocabulary: string[] = []
  ): Promise<void> {
    if (this.ws) {
      this.disconnect();
    }
    this.currentApiKey = apiKey;
    this.connectionState = 'connecting';
    
    // Clear any previous rotation timer
    if (this.sessionRotationTimer) {
      clearTimeout(this.sessionRotationTimer);
      this.sessionRotationTimer = null;
    }

    const modelsToTry = [
      "models/gemini-3.5-transcribe-live",
      "models/gemini-3.1-flash-live-preview" // Fallback
    ];

    let lastError: Error | null = null;
    
    for (const model of modelsToTry) {
      try {
        await this.connectWithModel(apiKey, model, transcriptionMode, customVocabulary);
        
        // Schedule session rotation every 9 minutes (Live sessions expire at 10m)
        this.sessionRotationTimer = setTimeout(() => {
          console.log('[Transcription WS] 9 minutes elapsed, rotating session to prevent timeout...');
          this.connectOverlap(apiKey, transcriptionMode, customVocabulary).catch(err => {
            console.error('[Transcription WS] Session rotation failed:', err);
          });
        }, 9 * 60 * 1000);
        
        return; // Success!
      } catch (err) {
        console.warn(`[Transcription WS] Model ${model} failed:`, err instanceof Error ? err.message : String(err));
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }
    
    // If we reach here, all models failed
    this.connectionState = 'disconnected';
    throw lastError || new Error('All model fallbacks failed');
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
    if (this.chunkCount === 1 || this.chunkCount % 50 === 0) {
      console.log(`[Transcription WS] Sent ${this.chunkCount} audio chunks`);
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
    if (this.sessionRotationTimer) {
      clearTimeout(this.sessionRotationTimer);
      this.sessionRotationTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.connectionState = 'disconnected';
  }

  async connectOverlap(
    apiKey: string, 
    transcriptionMode: 'SMART' | 'VERBATIM', 
    customVocabulary: string[]
  ): Promise<void> {
    const oldWs = this.ws;
    this.ws = null; 
    
    if (this.sessionRotationTimer) {
      clearTimeout(this.sessionRotationTimer);
      this.sessionRotationTimer = null;
    }

    try {
      await this.connect(apiKey, transcriptionMode, customVocabulary);
    } catch (error) {
      if (!this.ws && oldWs && oldWs.readyState === WebSocket.OPEN) {
        this.ws = oldWs;
      }
      throw error;
    }
    
    if (oldWs) {
      oldWs.onclose = null;
      try { oldWs.close(); } catch (e) { /* ignore */ }
    }
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
