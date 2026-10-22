import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppButton from '@/components/AppButton';
import Header from '@/components/Header';
import IconTile from '@/components/IconTile';
import StatusChip from '@/components/StatusChip';
import { COLORS } from '@/constants/colors';
import { APP_ICONS } from '@/constants/icons';
import { useAuth } from '@/lib/auth';
import { getStudentCheckIns, getStudentExpectedEventIds } from '@/lib/attendance';
import { getAvailableEvents, getEventPhase, sortBySchedule, type CloudEvent } from '@/lib/events';
import { useRole } from '@/lib/useRole';

export default function EventsScreen() {
  const { user } = useAuth();
  const { role, loading: roleLoading } = useRole();
  const [events, setEvents] = useState<CloudEvent[]>([]);
  const [checkedIn, setCheckedIn] = useState<Map<string, { status: 'present' | 'late'; scannedAt: string }>>(new Map());
  const [expected, setExpected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (roleLoading) {
      setLoading(true);
      return;
    }
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [list, checkIns, expectedSet] = await Promise.all([
        getAvailableEvents(),
        getStudentCheckIns(user.id),
        getStudentExpectedEventIds(user.id),
      ]);

      const sorted = [...list].sort(sortBySchedule);
      setEvents(sorted);
      setCheckedIn(checkIns);
      setExpected(expectedSet);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load events.');
    } finally {
      setLoading(false);
    }
  }, [user, roleLoading]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  if (roleLoading || loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <Header title="Available events" compact />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading events...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (role !== 'student') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
        <Header title="Available events" compact />
        <View style={styles.center}>
          <IconTile name={APP_ICONS.lock} size={64} />
          <Text style={styles.title}>Students only</Text>
          <Text style={styles.subtitle}>View the events published by your teachers.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Header title="Available events" compact />

        {error ? (
          <View accessibilityRole="alert" style={styles.errorBanner}>
            <Ionicons name="alert-circle-outline" size={19} color={COLORS.danger} />
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={() => void load()} style={styles.retryBtn}>
              <Ionicons name={APP_ICONS.retry} size={15} color={COLORS.danger} />
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.heroCard}>
          <IconTile name={APP_ICONS.calendar} size={48} style={styles.heroIcon} />
          <Text style={styles.heroTitle}>Check in by scanning your event QR</Text>
          <AppButton
            variant="secondary"
            title="Scan attendance"
            icon={APP_ICONS.qr}
            onPress={() => router.push('/scan')}
            accessibilityHint="Open the QR scanner to record attendance"
          />
        </View>

        {events.length === 0 ? (
          <View style={styles.emptyCard}>
            <IconTile name={APP_ICONS.calendar} size={64} style={styles.emptyIcon} />
            <Text style={styles.emptyTitle}>No events available yet</Text>
            <Text style={styles.emptySubtitle}>Your teachers haven't published any events.</Text>
          </View>
        ) : (
          events.map((event) => {
            const phase = getEventPhase(event);
            const isCheckedIn = checkedIn.has(event.id);
            const isExpected = expected.has(event.id);
            const entry = checkedIn.get(event.id);

            return (
              <View key={event.id} style={styles.eventCard}>
                <View style={styles.eventHeader}>
                  <View style={styles.eventCopy}>
                    <Text style={styles.eventTitle}>{event.title}</Text>
                    <Text style={styles.eventCode}>{event.event_code}</Text>
                  </View>
                  <PhasePill phase={phase} />
                </View>

                <View style={styles.metaRow}>
                  <Ionicons name={APP_ICONS.clock} size={15} color={COLORS.textSecondary} />
                  <Text style={styles.metaText}>
                    {formatSchedule(event.start_time, event.end_time)}
                  </Text>
                </View>

                {isExpected ? (
                  <View style={styles.metaRow}>
                    <Ionicons name={APP_ICONS.roster} size={15} color={COLORS.textSecondary} />
                    <Text style={styles.metaText}>You are on the expected list</Text>
                  </View>
                ) : null}

                {isCheckedIn && entry ? (
                  <View style={styles.checkedInRow}>
                    <StatusChip status={entry.status} compact />
                    <Text style={styles.checkedInText}>
                      Checked in {formatTime(entry.scannedAt)}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.notCheckedIn}>
                    {phase === 'ended' ? 'Event has ended' : phase === 'upcoming' ? 'Opens at the start time' : 'Not checked in yet'}
                  </Text>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function PhasePill({ phase }: { phase: ReturnType<typeof getEventPhase> }) {
  const config: Record<ReturnType<typeof getEventPhase>, { label: string; color: string; bg: string }> = {
    upcoming: { label: 'Upcoming', color: COLORS.primaryDark, bg: COLORS.primaryLight },
    ongoing: { label: 'Ongoing', color: COLORS.present, bg: COLORS.presentSoft },
    ended: { label: 'Ended', color: COLORS.textSecondary, bg: COLORS.surface },
    unscheduled: { label: 'TBA', color: COLORS.textSecondary, bg: COLORS.surface },
  };
  const c = config[phase];
  return (
    <View style={[styles.phasePill, { backgroundColor: c.bg }]}>
      <Text style={[styles.phaseText, { color: c.color }]}>{c.label}</Text>
    </View>
  );
}

function formatSchedule(start: string | null, end: string | null): string {
  if (!start && !end) return 'Time to be announced';
  if (start && !end) return `Starts ${formatDate(start)}`;
  if (start && end) return `${formatDate(start)} — ${formatTimeOnly(end)}`;
  if (end) return `Ends ${formatDate(end)}`;
  return 'Time to be announced';
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatTimeOnly(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  content: { width: '100%', maxWidth: 680, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 12, paddingBottom: 36 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  loadingText: { marginTop: 12, fontSize: 14, color: COLORS.textSecondary },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.textPrimary, marginTop: 16 },
  subtitle: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', marginTop: 6 },
  errorBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.dangerSoft, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 11, marginTop: 16 },
  errorText: { flex: 1, fontSize: 13, color: COLORS.danger, marginLeft: 9 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingHorizontal: 8 },
  retryText: { fontSize: 13, fontWeight: '800', color: COLORS.danger, marginLeft: 5 },
  heroCard: { backgroundColor: COLORS.primary, borderRadius: 24, padding: 22, marginTop: 18 },
  heroIcon: { marginBottom: 14 },
  heroTitle: { fontSize: 19, fontWeight: '800', color: COLORS.textOnPrimary, marginBottom: 16 },
  eventCard: { backgroundColor: COLORS.card, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, padding: 16, marginTop: 16 },
  eventHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  eventCopy: { flex: 1, paddingRight: 10 },
  eventTitle: { fontSize: 16, fontWeight: '800', color: COLORS.textPrimary },
  eventCode: { fontSize: 12, fontWeight: '700', color: COLORS.primary, marginTop: 3 },
  phasePill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  phaseText: { fontSize: 11, fontWeight: '800' },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  metaText: { fontSize: 13, color: COLORS.textSecondary, marginLeft: 6 },
  checkedInRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  checkedInText: { fontSize: 12, color: COLORS.textSecondary, marginLeft: 8 },
  notCheckedIn: { fontSize: 12, color: COLORS.textSecondary, marginTop: 12 },
  emptyCard: { alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 22, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 22, paddingVertical: 32, marginTop: 22 },
  emptyIcon: { marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 6 },
  emptySubtitle: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center' },
});
