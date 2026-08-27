import React, { useState, useRef, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { TranscriptChunk } from '@/services/transcriptDatabase';
import { DisplayMode } from '@/hooks/useTranscript';
import TranscriptChunkRow from './TranscriptChunkRow';
import Animated, { FadeIn, FadeOut, FadeInUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import GlassCard from './GlassCard';

interface LiveTranscriptPanelProps {
  finalChunks: TranscriptChunk[];
  interimText: string;
  interimTranslatedText: string;
  displayMode: DisplayMode;
  onDisplayModeChange: (mode: DisplayMode) => void;
  isActive: boolean;
}

export default function LiveTranscriptPanel({
  finalChunks,
  interimText,
  interimTranslatedText,
  displayMode,
  onDisplayModeChange,
  isActive
}: LiveTranscriptPanelProps) {
  const listRef = useRef<FlashList<TranscriptChunk>>(null);
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const paddingToBottom = 60;
    const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom;
    setIsScrolledUp(!isCloseToBottom);
  }, []);

  const scrollToBottom = () => {
    listRef.current?.scrollToEnd({ animated: true });
    setIsScrolledUp(false);
  };

  // Auto-scroll when new chunks or interim text arrives
  React.useEffect(() => {
    if (!isScrolledUp && !isCollapsed) {
      setTimeout(() => {
        listRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [finalChunks.length, interimText, interimTranslatedText, isScrolledUp, isCollapsed]);

  const renderItem = useCallback(
    ({ item }: { item: TranscriptChunk }) => (
      <TranscriptChunkRow item={item} displayMode={displayMode} />
    ),
    [displayMode]
  );

  const InterimRow = () => {
    if (!interimText && !interimTranslatedText) return null;
    return (
      <Animated.View entering={FadeIn}>
        <View style={styles.interimContainer}>
          <View style={styles.liveIndicator} />
          <View style={styles.textContainer}>
            {displayMode !== 'translated' && interimText ? (
              <Text style={[styles.interimText, displayMode === 'both' && styles.dimmedText]}>
                {interimText}
              </Text>
            ) : null}
            {displayMode !== 'original' && interimTranslatedText ? (
              <Text style={styles.interimTranslatedText}>{interimTranslatedText}</Text>
            ) : null}
          </View>
        </View>
      </Animated.View>
    );
  };

  if (!isActive && finalChunks.length === 0) {
    return null;
  }

  return (
    <GlassCard style={styles.container} padding={0}>
      {/* Header */}
      <Pressable 
        style={styles.header} 
        onPress={() => setIsCollapsed(!isCollapsed)}
      >
        <Text style={styles.headerTitle}>📝 Live Transcript</Text>
        <Text style={styles.collapseIcon}>{isCollapsed ? '▼' : '▲'}</Text>
      </Pressable>

      {!isCollapsed && (
        <>
          {/* Mode Toggles */}
          <View style={styles.toggleRow}>
            {(['translated', 'both', 'original'] as DisplayMode[]).map((mode) => (
              <Pressable
                key={mode}
                onPress={() => onDisplayModeChange(mode)}
                style={[
                  styles.toggleBtn,
                  displayMode === mode && styles.toggleBtnActive
                ]}
              >
                <Text style={[
                  styles.toggleText,
                  displayMode === mode && styles.toggleTextActive
                ]}>
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* List */}
          <View style={styles.listWrapper}>
            {finalChunks.length === 0 && !interimText ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>Transcript will appear here...</Text>
              </View>
            ) : (
              <FlashList
                ref={listRef}
                onScroll={handleScroll}
                scrollEventThrottle={16}
                contentContainerStyle={styles.listContent}
                nestedScrollEnabled={true}
                data={finalChunks}
                renderItem={renderItem}
                keyExtractor={(item) => item.id}
                estimatedItemSize={100}
                ListFooterComponent={InterimRow}
              />
            )}

            {/* Scroll to bottom button */}
            {isScrolledUp && (
              <Animated.View entering={FadeInUp} exiting={FadeOut} style={styles.floatingBtnContainer}>
                <Pressable style={styles.scrollBtn} onPress={scrollToBottom}>
                  <Ionicons name="arrow-down" size={20} color="#00D4AA" />
                </Pressable>
              </Animated.View>
            )}
          </View>
        </>
      )}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  collapseIcon: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
  },
  toggleRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  toggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  toggleBtnActive: {
    backgroundColor: 'rgba(124,92,252,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(124,92,252,0.3)',
  },
  toggleText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '600',
  },
  toggleTextActive: {
    color: '#7C5CFC',
  },
  listWrapper: {
    height: 300,
    position: 'relative',
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 14,
  },
  interimContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    opacity: 0.8,
    marginTop: 8,
  },
  liveIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#00D4AA',
    marginTop: 8,
    marginRight: 10,
    marginLeft: 14,
  },
  textContainer: {
    flex: 1,
  },
  interimText: {
    color: '#00D4AA',
    fontSize: 15,
    fontStyle: 'italic',
  },
  interimTranslatedText: {
    color: '#7C5CFC',
    fontSize: 16,
    fontWeight: '500',
    fontStyle: 'italic',
  },
  dimmedText: {
    opacity: 0.6,
    marginBottom: 4,
  },
  floatingBtnContainer: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    zIndex: 10,
  },
  scrollBtn: {
    backgroundColor: 'rgba(30, 41, 59, 0.95)',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
});
