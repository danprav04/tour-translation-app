import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator, Alert, ActionSheetIOS, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useDatabaseContext } from '@/context/DatabaseContext';
import { TourSession, TranscriptChunk } from '@/services/transcriptDatabase';
import { TranscriptExportService } from '@/services/transcriptExportService';
import TranscriptChunkRow from '@/components/TranscriptChunkRow';
import CustomModal from '@/components/CustomModal';
import { DisplayMode } from '@/hooks/useTranscript';
import { MaterialIcons } from '@expo/vector-icons';

export default function SessionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const db = useDatabaseContext();
  
  const [session, setSession] = useState<TourSession | null>(null);
  const [chunks, setChunks] = useState<TranscriptChunk[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [displayMode, setDisplayMode] = useState<DisplayMode>('both');
  const [isExporting, setIsExporting] = useState(false);
  const [exportModalVisible, setExportModalVisible] = useState(false);

  useEffect(() => {
    const loadSession = async () => {
      try {
        if (!id) return;
        const data = await db.getSessionWithChunks(id);
        if (data.session) {
          setSession(data.session);
          setChunks(data.chunks);
        } else {
          Alert.alert('Error', 'Session not found');
          router.back();
        }
      } catch (e) {
        console.error('Failed to load session details', e);
      } finally {
        setIsLoading(false);
      }
    };
    loadSession();
  }, [id, db, router]);

  const handleExport = async (format: 'pdf' | 'text') => {
    if (!session) return;
    try {
      setIsExporting(true);
      if (format === 'pdf') {
        await TranscriptExportService.exportToPdf({ session, chunks });
      } else {
        await TranscriptExportService.exportToPlainText({ session, chunks });
      }
    } catch (e) {
      console.error('Export failed', e);
      Alert.alert('Export Failed', 'Unable to generate export file.');
    } finally {
      setIsExporting(false);
    }
  };

  const showExportMenu = () => {
    setExportModalVisible(true);
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <ActivityIndicator size="large" color="#00D4AA" />
      </SafeAreaView>
    );
  }

  if (!session) return null;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Back</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>Session Details</Text>
        <Pressable onPress={showExportMenu} style={styles.exportBtn} disabled={isExporting}>
          {isExporting ? (
            <ActivityIndicator size="small" color="#00D4AA" />
          ) : (
            <MaterialIcons name="ios-share" size={24} color="#00D4AA" />
          )}
        </Pressable>
      </View>

      {/* Meta Bar */}
      <View style={styles.metaContainer}>
        <Text style={styles.metaTitle}>{session.title}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>
            ⏱️ {Math.ceil((session.durationMs > 1000000000000 ? session.durationMs - session.createdAt : session.durationMs) / 60000)} min
          </Text>
          <View style={styles.langBadge}>
            <Text style={styles.langBadgeText}>
              {session.sourceLang.toUpperCase()} ➔ {session.targetLang.toUpperCase()}
            </Text>
          </View>
        </View>
      </View>

      {/* Mode Toggles */}
      <View style={styles.toggleRow}>
        {(['translated', 'both', 'original'] as DisplayMode[]).map((mode) => (
          <Pressable
            key={mode}
            onPress={() => setDisplayMode(mode)}
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

      {/* Transcript List */}
      <FlatList
        data={chunks}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <TranscriptChunkRow item={item} displayMode={displayMode} />}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No transcript available for this session.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0A0E1A' },
  center: { justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  backBtn: { padding: 8, marginLeft: -8, width: 60 },
  backBtnText: { color: '#00D4AA', fontSize: 16, fontWeight: '600' },
  title: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', flex: 1, textAlign: 'center' },
  exportBtn: { padding: 8, marginRight: -8, width: 60, alignItems: 'flex-end' },
  metaContainer: { padding: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  metaTitle: { color: '#FFF', fontSize: 22, fontWeight: '800', marginBottom: 12 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  metaText: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: '500' },
  langBadge: { backgroundColor: 'rgba(124,92,252,0.15)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(124,92,252,0.3)' },
  langBadgeText: { color: '#7C5CFC', fontSize: 11, fontWeight: '700' },
  toggleRow: { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 16, gap: 8 },
  toggleBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.05)' },
  toggleBtnActive: { backgroundColor: 'rgba(124,92,252,0.15)', borderWidth: 1, borderColor: 'rgba(124,92,252,0.3)' },
  toggleText: { color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: '600' },
  toggleTextActive: { color: '#7C5CFC' },
  listContent: { padding: 20, paddingBottom: 40 },
  emptyContainer: { padding: 40, alignItems: 'center' },
  emptyText: { color: 'rgba(255,255,255,0.4)', fontSize: 15, textAlign: 'center' }
});
