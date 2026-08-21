import { useState, useRef, useCallback } from 'react';
import transcriptionService from '@/services/transcriptionService';
import { TextTranslationService } from '@/services/textTranslationService';
import { useDatabaseContext } from '@/context/DatabaseContext';
import { TranscriptChunk } from '@/services/transcriptDatabase';

export type DisplayMode = 'translated' | 'original' | 'both';

export const useTranscript = () => {
  const db = useDatabaseContext();
  const [finalChunks, setFinalChunks] = useState<TranscriptChunk[]>([]);
  const [interimText, setInterimText] = useState<string>('');
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

  const startTranscription = useCallback(async (
    apiKey: string,
    sourceLang: string,
    targetLang: string,
    roomCode?: string,
    customTextPromptInjection?: string
  ) => {
    try {
      sourceLangRef.current = sourceLang;
      targetLangRef.current = targetLang;
      apiKeyRef.current = apiKey;
      customTextPromptInjectionRef.current = customTextPromptInjection || '';
      
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
      chunkSequenceRef.current = 0;

      // 2. Connect to transcription service
      await transcriptionService.connect(apiKey, customTextPromptInjection);

      transcriptionService.onInterimText((text) => {
        console.log('[useTranscript] onInterimText callback triggered, text length:', text?.length, 'text:', text);
        setInterimText(text);
      });

      transcriptionService.onFinalText(async (text) => {
        console.log('[useTranscript] onFinalText callback triggered, text:', text);
        if (!text || !sessionIdRef.current || !apiKeyRef.current) return;
        
        const timestampMs = Date.now();
        const seq = chunkSequenceRef.current++;
        
        // Optimistic UI update for original text while translating
        const tempChunk: TranscriptChunk = {
          id: `temp-${seq}`,
          sessionId: sessionIdRef.current,
          sequence: seq,
          timestampMs,
          originalText: text,
          translatedText: '...', // Loading indicator
          createdAt: timestampMs
        };
        
        setFinalChunks(prev => [...prev, tempChunk]);

        try {
          // 3. Translate the finalized text
          const translatedText = await TextTranslationService.translateText(
            text,
            sourceLangRef.current,
            targetLangRef.current,
            apiKeyRef.current,
            customTextPromptInjectionRef.current
          );

          // 4. Update UI with translated text
          setFinalChunks(prev => 
            prev.map(c => c.sequence === seq ? { ...c, translatedText } : c)
          );

          // 5. Save to database
          await db.insertChunk({
            sessionId: sessionIdRef.current,
            sequence: seq,
            timestampMs,
            originalText: text,
            translatedText
          });
        } catch (err) {
          console.error('[useTranscript] Failed to translate or save chunk:', err);
          // Fallback UI update if translation failed completely
          setFinalChunks(prev => 
            prev.map(c => c.sequence === seq ? { ...c, translatedText: '[Translation failed]' } : c)
          );
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

  return {
    finalChunks,
    interimText,
    displayMode,
    setDisplayMode,
    isActive,
    sessionId,
    startTranscription,
    stopTranscription,
    sendAudioChunk
  };
};
