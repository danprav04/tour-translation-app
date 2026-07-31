import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import GlassCard from '@/components/GlassCard';

export default function HomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.appName}>TourCast</Text>
          <Text style={styles.tagline}>Live audio for your group</Text>
        </View>



        {/* Role Cards */}
        <View style={styles.cards}>
          <GlassCard
            variant="primary"
            onPress={() => router.push('/host')}
            style={styles.card}
          >
            <View style={styles.cardContent}>
              <Text style={styles.cardIcon}>📡</Text>
              <Text style={styles.cardTitle}>Host</Text>
              <Text style={styles.cardSubtitle}>Broadcaster</Text>
              <Text style={styles.cardDescription}>
                Capture and broadcast audio to your group. Translate in real-time with AI.
              </Text>
              <View style={[styles.cardBadge, styles.hostBadge]}>
                <Text style={[styles.badgeText, styles.hostBadgeText]}>Start Broadcasting →</Text>
              </View>
            </View>
          </GlassCard>

          <GlassCard
            variant="secondary"
            onPress={() => router.push('/listener')}
            style={styles.card}
          >
            <View style={styles.cardContent}>
              <Text style={styles.cardIcon}>🎧</Text>
              <Text style={styles.cardTitle}>Listener</Text>
              <Text style={styles.cardSubtitle}>Receiver</Text>
              <Text style={styles.cardDescription}>
                Connect to a host and listen through your headphones. Simple and seamless.
              </Text>
              <View style={[styles.cardBadge, styles.listenerBadge]}>
                <Text style={[styles.badgeText, styles.listenerBadgeText]}>Join Session →</Text>
              </View>
            </View>
          </GlassCard>
        </View>

        {/* Settings link */}
        <Pressable
          onPress={() => router.push('/settings')}
          style={({ pressed }) => [styles.settingsLink, pressed && styles.pressed]}
        >
          <Text style={styles.settingsText}>⚙️ Settings</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0A0E1A',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  appName: {
    fontSize: 36,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -1,
  },
  tagline: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.45)',
    marginTop: 6,
    fontWeight: '400',
  },
  visualizerContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  cards: {
    gap: 16,
    flexGrow: 1,
  },
  card: {
    flexGrow: 1,
  },
  cardContent: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  cardIcon: {
    fontSize: 44,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  cardSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginTop: 2,
  },
  cardDescription: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 20,
    paddingHorizontal: 16,
  },
  cardBadge: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  hostBadge: {
    backgroundColor: 'rgba(0,212,170,0.12)',
    borderColor: 'rgba(0,212,170,0.3)',
  },
  listenerBadge: {
    backgroundColor: 'rgba(124,92,252,0.12)',
    borderColor: 'rgba(124,92,252,0.3)',
  },
  badgeText: {
    fontSize: 14,
    fontWeight: '700',
  },
  hostBadgeText: {
    color: '#00D4AA',
  },
  listenerBadgeText: {
    color: '#7C5CFC',
  },
  settingsLink: {
    alignSelf: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    marginBottom: 20,
    marginTop: 24,
  },
  settingsText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 15,
    fontWeight: '500',
  },
  pressed: {
    opacity: 0.6,
  },
});
