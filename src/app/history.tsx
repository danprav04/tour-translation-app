import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, SectionList, TextInput, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useDatabaseContext } from '@/context/DatabaseContext';
import { TourSession } from '@/services/transcriptDatabase';
import GlassCard from '@/components/GlassCard';
import { Swipeable } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { MaterialIcons } from '@expo/vector-icons';

type Section = {
  title: string;
  data: TourSession[];
};

export default function HistoryScreen() {
  const router = useRouter();
  const db = useDatabaseContext();
  const [sessions, setSessions] = useState<TourSession[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [undoItem, setUndoItem] = useState<{ session: TourSession, timeout: NodeJS.Timeout } | null>(null);

  const loadSessions = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await db.getSessions({ search: searchQuery });
      setSessions(data);
    } catch (e) {
      console.error('Failed to load history', e);
      Alert.alert('Error', 'Failed to load transcript history');
    } finally {
      setIsLoading(false);
    }
  }, [db, searchQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadSessions();
    }, 300);
    return () => clearTimeout(timer);
  }, [loadSessions]);

  const handleDelete = (session: TourSession) => {
    // Optimistic UI removal
    setSessions(prev => prev.filter(s => s.id !== session.id));
    
    // Clear previous undo if exists
    if (undoItem) {
      clearTimeout(undoItem.timeout);
      // Process pending deletion
      db.deleteSession(undoItem.session.id).catch(console.error);
    }

    const timeout = setTimeout(() => {
      db.deleteSession(session.id).catch(console.error);
      setUndoItem(null);
    }, 5000);

    setUndoItem({ session, timeout });
  };

  const handleUndo = () => {
    if (undoItem) {
      clearTimeout(undoItem.timeout);
      // Re-insert optimistically
      setSessions(prev => {
        const newSessions = [...prev, undoItem.session];
        return newSessions.sort((a, b) => b.createdAt - a.createdAt);
      });
      setUndoItem(null);
    }
  };

  const groupedSessions = useMemo(() => {
    const groups: Record<string, TourSession[]> = {
      'Today': [],
      'Yesterday': [],
      'This Week': [],
      'Earlier': []
    };

    const now = new Date();
    const todayStr = now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const yesterdayStr = yesterday.toDateString();

    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 7);

    sessions.forEach(session => {
      const date = new Date(session.createdAt);
      const dateStr = date.toDateString();
      if (dateStr === todayStr) {
        groups['Today'].push(session);
      } else if (dateStr === yesterdayStr) {
        groups['Yesterday'].push(session);
      } else if (date > weekAgo) {
        groups['This Week'].push(session);
      } else {
        groups['Earlier'].push(session);
      }
    });

    return Object.entries(groups)
      .filter(([_, data]) => data.length > 0)
      .map(([title, data]) => ({ title, data }));
  }, [sessions]);

  const renderRightActions = (item: TourSession) => {
    return (
      <Pressable style={styles.deleteAction} onPress={() => handleDelete(item)}>
        <MaterialIcons name="delete" size={24} color="#FFF" />
      </Pressable>
    );
  };

  const renderItem = ({ item }: { item: TourSession }) => (
    <Swipeable renderRightActions={() => renderRightActions(item)}>
      <Pressable onPress={() => router.push(\`/session-detail?id=\${item.id}\`)}>
        <GlassCard style={styles.sessionCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <View style={styles.langBadge}>
              <Text style={styles.langBadgeText}>
                {item.sourceLang.toUpperCase()} ➔ {item.targetLang.toUpperCase()}
              </Text>
            </View>
          </View>
          <View style={styles.cardMeta}>
            <Text style={styles.metaText}>⏱️ {Math.ceil(item.durationMs / 60000)} min</Text>
            <Text style={styles.metaText}>📝 {item.chunkCount} parts</Text>
          </View>
        </GlassCard>
      </Pressable>
    </Swipeable>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>Tour History</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search transcripts..."
          placeholderTextColor="rgba(255,255,255,0.4)"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {isLoading && sessions.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#00D4AA" />
        </View>
      ) : sessions.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>📭</Text>
          <Text style={styles.emptyTitle}>No History Found</Text>
          <Text style={styles.emptyDesc}>Transcripts from your hosted tours will appear here.</Text>
        </View>
      ) : (
        <SectionList
          sections={groupedSessions}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          renderSectionHeader={({ section: { title } }) => (
            <Text style={styles.sectionTitle}>{title}</Text>
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {undoItem && (
        <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.snackbar}>
          <Text style={styles.snackbarText}>Transcript deleted</Text>
          <Pressable onPress={handleUndo}>
            <Text style={styles.undoText}>UNDO</Text>
          </Pressable>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0A0E1A' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20 },
  backBtn: { padding: 8, marginLeft: -8 },
  backBtnText: { color: '#00D4AA', fontSize: 16, fontWeight: '600' },
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  searchContainer: { paddingHorizontal: 20, marginBottom: 16 },
  searchInput: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 14, color: '#FFF', fontSize: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  listContent: { paddingHorizontal: 20, paddingBottom: 100 },
  sectionTitle: { color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginTop: 24, marginBottom: 12 },
  sessionCard: { padding: 16, marginBottom: 12 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardTitle: { color: '#FFF', fontSize: 16, fontWeight: '600', flex: 1, marginRight: 12 },
  langBadge: { backgroundColor: 'rgba(124,92,252,0.15)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(124,92,252,0.3)' },
  langBadgeText: { color: '#7C5CFC', fontSize: 11, fontWeight: '700' },
  cardMeta: { flexDirection: 'row', gap: 16 },
  metaText: { color: 'rgba(255,255,255,0.5)', fontSize: 13 },
  deleteAction: { backgroundColor: '#FF4757', justifyContent: 'center', alignItems: 'flex-end', paddingRight: 24, marginBottom: 12, borderRadius: 16, flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { color: '#FFF', fontSize: 18, fontWeight: '600', marginBottom: 8 },
  emptyDesc: { color: 'rgba(255,255,255,0.5)', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  snackbar: { position: 'absolute', bottom: 30, left: 20, right: 20, backgroundColor: '#1E293B', borderRadius: 12, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  snackbarText: { color: '#FFF', fontSize: 14 },
  undoText: { color: '#00D4AA', fontSize: 14, fontWeight: '700' }
});
