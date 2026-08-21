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
  private chunksSinceLastTurn: number = 0;

  private async connectWithModel(apiKey: string, modelName: string, customPromptInjection?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;
      const ws = new WebSocket(url);
      this.ws = ws;

      let isSetupComplete = false;

      ws.onopen = () => {
        if (this.ws !== ws) return;
        
        console.log(`[Transcription WS] Connected. Sending setup for model: ${modelName}...`);
        
        const systemInstructionText = customPromptInjection 
          ? `Listen to the audio input.\n\nAdditional instructions: ${customPromptInjection}`
          : "Listen to the audio input.";

        const setupMessage = {
          setup: {
            model: modelName,
            generationConfig: {
              responseModalities: ["AUDIO"],
            },
            inputAudioTranscription: {},
            systemInstruction: {
              parts: [{ text: systemInstructionText }]
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
            // DEBUG: Log all incoming message keys to diagnose transcription
            const topKeys = Object.keys(msg);
            const serverContentKeys = msg.serverContent ? Object.keys(msg.serverContent) : [];
            console.log(`[Transcription WS] MSG keys: [${topKeys.join(',')}], serverContent keys: [${serverContentKeys.join(',')}]`);

            if (msg.setupComplete) {
              console.log(`[Transcription WS] Setup complete received for ${modelName}.`);
              this.connectionState = 'connected';
              isSetupComplete = true;
              this.startKeepalive();
              resolve();
            }

            // Handle input transcription (user's speech → text)
            if (msg.serverContent?.inputTranscription) {
              console.log(`[Transcription WS] inputTranscription received:`, JSON.stringify(msg.serverContent.inputTranscription));
              const text = msg.serverContent.inputTranscription.text;
              if (text) {
                this.accumulatedInterim += text;
                this.processInterimText();
              }
            }

            // Also check for legacy modelTurn text (fallback)
            if (msg.serverContent?.modelTurn?.parts) {
              console.log(`[Transcription WS] modelTurn received:`, JSON.stringify(msg.serverContent.modelTurn.parts.map((p: any) => ({ text: p.text, hasInlineData: !!p.inlineData }))));
            }

            // Ignore model audio output (inlineData) — we only need the input transcription
            
            if (msg.serverContent?.turnComplete) {
              console.log(`[Transcription WS] turnComplete. accumulatedInterim: "${this.accumulatedInterim}"`);
              this.chunksSinceLastTurn = 0;
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

  async connect(apiKey: string, customPromptInjection?: string): Promise<void> {
    if (this.ws) {
      this.disconnect();
    }
    this.currentApiKey = apiKey;
    this.connectionState = 'connecting';
    this.accumulatedInterim = '';
    this.chunksSinceLastTurn = 0;

    const modelsToTry = [
      "models/gemini-3.1-flash-live-preview",
      "models/gemini-2.5-flash-native-audio",
    ];

    let lastError: Error | null = null;
    
    for (const model of modelsToTry) {
      try {
        await this.connectWithModel(apiKey, model, customPromptInjection);
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
    this.chunksSinceLastTurn++;
    if (this.chunkCount === 1 || this.chunkCount % 50 === 0) {
      console.log(`[Transcription WS] Sent ${this.chunkCount} audio chunks (data length: ${base64PcmData.length})`);
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
    
    if (this.chunksSinceLastTurn >= 40) {
      console.log(`[Transcription WS] Forcing server VAD trigger with 1.2s of artificial silence after ${this.chunksSinceLastTurn} chunks`);
      try {
        // 1.2 seconds of 16kHz 16-bit PCM silence is 38,400 bytes of zeros.
        // In base64, every 3 zero bytes = 4 'A's. 38400 / 3 * 4 = 51200 'A's.
        const silentBase64 = 'A'.repeat(51200);
        this.ws.send(JSON.stringify({
          realtimeInput: {
            audio: {
              mimeType: "audio/pcm;rate=16000",
              data: silentBase64
            }
          }
        }));
      } catch (e) {
        console.warn('[Transcription WS] Failed to send artificial silence:', e);
      }
      this.chunksSinceLastTurn = 0;
    }
  }

  private processInterimText() {
    let forcedChunk = false;
    const sentenceMatches = this.accumulatedInterim.match(/[^.?!。？！]+[.?!。？！]+/g);
    const sentenceCount = sentenceMatches ? sentenceMatches.length : 0;
    const isLong = this.accumulatedInterim.length > 150;
    
    if (sentenceCount >= 2 || (isLong && sentenceCount >= 1)) {
      const match = this.accumulatedInterim.match(/.*[.?!。？！](?=\s|$)/);
      if (match) {
        const splitIndex = match[0].length;
        const chunkToFinalize = this.accumulatedInterim.substring(0, splitIndex).trim();
        const remaining = this.accumulatedInterim.substring(splitIndex).trimStart();
        
        if (chunkToFinalize && this.onFinalTextCallback) {
          console.log(`[Transcription WS] Forcing chunk (sentences): "${chunkToFinalize}"`);
          this.onFinalTextCallback(chunkToFinalize);
          this.accumulatedInterim = remaining;
          forcedChunk = true;
        }
      }
    } else if (this.accumulatedInterim.length > 250) {
      const lastSpace = this.accumulatedInterim.lastIndexOf(' ');
      if (lastSpace > 0) {
        const chunkToFinalize = this.accumulatedInterim.substring(0, lastSpace).trim();
        const remaining = this.accumulatedInterim.substring(lastSpace).trimStart();
        if (chunkToFinalize && this.onFinalTextCallback) {
          console.log(`[Transcription WS] Forcing chunk (length fallback): "${chunkToFinalize}"`);
          this.onFinalTextCallback(chunkToFinalize);
          this.accumulatedInterim = remaining;
          forcedChunk = true;
        }
      }
    }
    
    if (this.onInterimTextCallback) {
      this.onInterimTextCallback(this.accumulatedInterim);
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
    this.chunksSinceLastTurn = 0;
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
