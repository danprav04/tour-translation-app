import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TranscriptChunk } from '@/services/transcriptDatabase';
import { DisplayMode } from '@/hooks/useTranscript';

interface TranscriptChunkRowProps {
  item: TranscriptChunk;
  displayMode: DisplayMode;
}

const TranscriptChunkRow = React.memo(({ item, displayMode }: TranscriptChunkRowProps) => {
  const timeFormatted = new Date(item.timestampMs).toLocaleTimeString([], {
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <View style={styles.rowContainer}>
      <Text style={styles.timestamp}>{timeFormatted}</Text>
      <View style={styles.textContainer}>
        {(displayMode === 'translated' || displayMode === 'both') && (
          <Text style={styles.translatedText}>{item.translatedText}</Text>
        )}
        {(displayMode === 'original' || displayMode === 'both') && (
          <Text style={[styles.originalText, displayMode === 'both' && styles.mutedText]}>
            {item.originalText}
          </Text>
        )}
      </View>
    </View>
  );
});

TranscriptChunkRow.displayName = 'TranscriptChunkRow';
export default TranscriptChunkRow;

const styles = StyleSheet.create({
  rowContainer: { 
    flexDirection: 'row', 
    marginBottom: 16, 
    alignItems: 'flex-start' 
  },
  timestamp: { 
    color: 'rgba(255,255,255,0.4)', 
    fontSize: 11, 
    width: 44, 
    marginTop: 2,
    fontFamily: 'monospace'
  },
  textContainer: { 
    flex: 1, 
    paddingLeft: 8 
  },
  translatedText: { 
    color: '#FFFFFF', 
    fontSize: 16, 
    lineHeight: 22, 
    fontWeight: '500' 
  },
  originalText: { 
    color: 'rgba(255,255,255,0.7)', 
    fontSize: 15, 
    lineHeight: 21, 
    marginTop: 4 
  },
  mutedText: { 
    color: 'rgba(255,255,255,0.4)', 
    fontSize: 14,
    fontStyle: 'italic',
    marginTop: 4
  },
});
