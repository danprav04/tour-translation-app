import { useState, useRef, useCallback, useEffect } from 'react';
import transcriptionService from '@/services/transcriptionService';
import { TextTranslationService } from '@/services/textTranslationService';
import { useDatabaseContext } from '@/context/DatabaseContext';
import { useDebugContext } from '@/context/DebugContext';
import { TranscriptChunk } from '@/services/transcriptDatabase';

export type DisplayMode = 'translated' | 'original' | 'both';

export const useTranscript = () => {
  const db = useDatabaseContext();
  const { setDebugState } = useDebugContext();
  const [finalChunks, setFinalChunks] = useState<TranscriptChunk[]>([]);
  const [interimText, setInterimText] = useState<string>('');
  const [interimTranslatedText, setInterimTranslatedText] = useState<string>('');
  const [displayMode, setDisplayMode] = useState<DisplayMode>('both');
  const [isActive, setIsActive] = useState(false);
  const isActiveRef = useRef(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const chunkSequenceRef = useRef(0);
  const sessionIdRef = useRef<string | null>(null);
  const sourceLangRef = useRef<string>('auto');
  const targetLangRef = useRef<string>('en');
  const apiKeyRef = useRef<string | null>(null);
  const customTextPromptInjectionRef = useRef<string>('');
  const interimTranslationDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const latestInterimAbortControllerRef = useRef<AbortController | null>(null);

  const lastInterimTranslationTimeRef = useRef<number>(0);

  useEffect(() => {
    setDebugState('liveTranscript', {
      interimText,
      finalChunks
    });
  }, [interimText, finalChunks, setDebugState]);

  const startTranscription = useCallback(async (
    apiKey: string,
    sourceLang: string,
    targetLang: string,
    roomCode?: string,
    customTextPromptInjection?: string,
    transcriptionMode: 'SMART' | 'VERBATIM' = 'SMART',
    customVocabularyStr: string = '',
    loopDetectionSensitivity: number = 0.7,
    isReconnect: boolean = false
  ) => {
    try {
      sourceLangRef.current = sourceLang;
      targetLangRef.current = targetLang;
      apiKeyRef.current = apiKey;
      customTextPromptInjectionRef.current = customTextPromptInjection || '';
      
      if (!isReconnect) {
        // 1. Create a new DB session
        const newSessionId = await db.createSession({
          sourceLang,
          targetLang,
          roomCode
        });
        
        setSessionId(newSessionId);
        sessionIdRef.current = newSessionId;
        setFinalChunks([]);
        setInterimText('');
        setInterimTranslatedText('');
        chunkSequenceRef.current = 0;
        lastInterimTranslationTimeRef.current = 0;
      }

      // 2. Connect to transcription service
      transcriptionService.setLoopDetectionSensitivity(loopDetectionSensitivity);
      const parsedVocab = customVocabularyStr.split(',').map(s => s.trim()).filter(s => s.length > 0);
      await transcriptionService.connect(apiKey, transcriptionMode, parsedVocab);

      transcriptionService.onLoopDetected(() => {
        // We could show a UI toast here, but for now we just rely on the service logs
        // and let the service handle the rotation.
      });

      transcriptionService.onInterimText((text) => {
        setInterimText(text);
        
        if (interimTranslationDebounceTimerRef.current) {
          clearTimeout(interimTranslationDebounceTimerRef.current);
        }
        
        if (!text) {
          setInterimTranslatedText('');
          if (latestInterimAbortControllerRef.current) {
            latestInterimAbortControllerRef.current.abort();
            latestInterimAbortControllerRef.current = null;
          }
          return;
        }

        const now = Date.now();
        const timeSinceLast = now - lastInterimTranslationTimeRef.current;
        const throttleMs = 1200; // Translate at most once every 1.2 seconds

        const executeTranslation = async (textToTranslate: string) => {
          if (!apiKeyRef.current) return;
          
          lastInterimTranslationTimeRef.current = Date.now();
          
          if (latestInterimAbortControllerRef.current) {
            latestInterimAbortControllerRef.current.abort();
          }
          const abortController = new AbortController();
          latestInterimAbortControllerRef.current = abortController;
          
          try {
            await TextTranslationService.translateTextStreaming(
              textToTranslate,
              targetLangRef.current,
              apiKeyRef.current,
              customTextPromptInjectionRef.current,
              (partialTranslation) => {
                if (!abortController.signal.aborted) {
                   setInterimTranslatedText(partialTranslation);
                }
              },
              0,
              abortController.signal
            );
          } catch (e: any) {
            if (e.name !== 'AbortError' && !abortController.signal.aborted) {
              console.warn('[useTranscript] Interim translation failed', e);
            }
          }
        };

        if (timeSinceLast >= throttleMs) {
          executeTranslation(text);
        } else {
          interimTranslationDebounceTimerRef.current = setTimeout(() => {
            executeTranslation(text);
          }, throttleMs - timeSinceLast);
        }
      });

      transcriptionService.onFinalText(async (text) => {
        if (!text || !sessionIdRef.current || !apiKeyRef.current) return;
        
        if (interimTranslationDebounceTimerRef.current) {
          clearTimeout(interimTranslationDebounceTimerRef.current);
        }
        if (latestInterimAbortControllerRef.current) {
          latestInterimAbortControllerRef.current.abort();
          latestInterimAbortControllerRef.current = null;
        }
        setInterimText('');
        setInterimTranslatedText('');
        
        const timestampMs = Date.now();
        const seq = chunkSequenceRef.current++;
        
        // Optimistic UI update for original text while translating
        const tempChunk: TranscriptChunk = {
          id: `temp-${seq}`,
          sessionId: sessionIdRef.current,
          sequence: seq,
          timestampMs,
          originalText: text,
          translatedText: '', // Empty initially, will stream in
          createdAt: timestampMs
        };
        
        setFinalChunks(prev => [...prev, tempChunk]);

        try {
          // 3. Translate the finalized text progressively
          const finalTranslatedText = await TextTranslationService.translateTextStreaming(
            text,
            targetLangRef.current,
            apiKeyRef.current,
            customTextPromptInjectionRef.current,
            (partialTranslation) => {
              // 4. Update UI progressively
              setFinalChunks(prev => 
                prev.map(c => c.sequence === seq ? { ...c, translatedText: partialTranslation } : c)
              );
            }
          );

          // 5. Final state update and save to database
          setFinalChunks(prev => 
            prev.map(c => c.sequence === seq ? { ...c, translatedText: finalTranslatedText } : c)
          );

          await db.insertChunk({
            sessionId: sessionIdRef.current,
            sequence: seq,
            timestampMs,
            originalText: text,
            translatedText: finalTranslatedText
          });
        } catch (err) {
          console.error('[useTranscript] Failed to translate chunk:', err);
          
          const failedText = `[Translation failed] ${text}`;

          // Fallback UI update if translation failed completely
          setFinalChunks(prev => 
            prev.map(c => c.sequence === seq ? { ...c, translatedText: failedText } : c)
          );

          // Save to database anyway so original text isn't lost
          try {
            await db.insertChunk({
              sessionId: sessionIdRef.current,
              sequence: seq,
              timestampMs,
              originalText: text,
              translatedText: failedText
            });
          } catch (dbErr) {
            console.error('[useTranscript] Failed to save chunk after translation failure:', dbErr);
          }
        }
      });

      transcriptionService.onError((err) => {
        console.error('[useTranscript] Transcription WS Error:', err);
      });

      transcriptionService.onClose(() => {
        console.log('[useTranscript] Transcription WS Closed');
      });

      setIsActive(true);
      isActiveRef.current = true;
    } catch (err) {
      console.error('[useTranscript] Failed to start transcription:', err);
      setIsActive(false);
      isActiveRef.current = false;
      throw err;
    }
  }, [db]);

  const stopTranscription = useCallback(async () => {
    transcriptionService.disconnect();
    setIsActive(false);
    isActiveRef.current = false;
    
    if (sessionIdRef.current) {
      await db.finalizeSession(sessionIdRef.current);
      sessionIdRef.current = null;
      setSessionId(null);
    }
  }, [db]);

  const sendAudioChunk = useCallback((base64Data: string) => {
    if (isActiveRef.current) {
      transcriptionService.sendAudioChunk(base64Data);
    }
  }, []);

  const clearTranscript = useCallback(() => {
    setFinalChunks([]);
    setInterimText('');
    setInterimTranslatedText('');
    chunkSequenceRef.current = 0;
  }, []);

  return {
    finalChunks,
    interimText,
    interimTranslatedText,
    displayMode,
    setDisplayMode,
    isActive,
    sessionId,
    startTranscription,
    stopTranscription,
    sendAudioChunk,
    clearTranscript
  };
};
