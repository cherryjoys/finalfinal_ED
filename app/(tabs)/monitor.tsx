import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Header from '@/components/Header';
import IconTile from '@/components/IconTile';
import StatusChip from '@/components/StatusChip';
import { COLORS } from '@/constants/colors';
import { APP_ICONS } from '@/constants/icons';
import { useAuth } from '@/lib/auth';
import {
  getTeacherEventAttendance,
  type AttendanceStatus,
  type TeacherEventAttendance,
} from '@/lib/attendance';
import { useRole } from '@/lib/useRole';

type Row = TeacherEventAttendance['entries'][number];

export default function MonitorScreen() {
  const { user } = useAuth();
  const { role, loading: roleLoading } = useRole();
  const [events, setEvents] = useState<TeacherEventAttendance[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!user) {
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (!silent) setLoading(true);
      else setRefreshing(true);
      setError(null);

      try {
        const list = await getTeacherEventAttendance(user.id);
        setEvents(list);
        if (!selectedId && list.length > 0) {
          setSelectedId(list[0].eventId);
        }
        setLastUpdated(new Date());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load attendance.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [selectedId, user]
  );

  useFocusEffect(
    useCallback(() => {
      void load();
      intervalRef.current = setInterval(() => void load(true), 15000);
      const sub = AppState.addEventListener('change', (state) => {
        if (state === 'active') void load(true);
      });
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        sub.remove();
      };
    }, [load])
  );

  if (roleLoading || loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <Header title="Monitor attendance" compact />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading live attendance...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (role !== 'teacher') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
        <Header title="Monitor attendance" compact />
        <View style={styles.center}>
          <IconTile name={APP_ICONS.lock} size={64} />
          <Text style={styles.title}>Teachers only</Text>
          <Text style={styles.subtitle}>Watch check-ins in real time.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const detail = events.find((event) => event.eventId === selectedId) ?? null;
  const presentRows = sortRows(detail?.entries ?? [], 'present');
  const lateRows = sortRows(detail?.entries ?? [], 'late');
  const absentRows = sortRows(detail?.entries ?? [], 'absent');

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Header title="Monitor attendance" compact />

        <View style={styles.liveBar}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>Live — refreshes every 15s</Text>
          {refreshing ? <ActivityIndicator size="small" color={COLORS.primary} /> : null}
          {lastUpdated ? (
            <Text style={styles.liveTime}>Updated {lastUpdated.toLocaleTimeString()}</Text>
          ) : null}
        </View>

        {error ? (
          <View accessibilityRole="alert" style={styles.errorBanner}>
            <Ionicons name="alert-circle-outline" size={19} color={COLORS.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {events.length === 0 ? (
          <View style={styles.emptyCard}>
            <IconTile name={APP_ICONS.calendar} size={64} style={styles.emptyIcon} />
            <Text style={styles.emptyTitle}>No events to monitor</Text>
            <Text style={styles.emptySubtitle}>Create an event or wait for students to check in.</Text>
          </View>
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
              {events.map((event) => {
                const active = event.eventId === selectedId;
                return (
                  <Pressable
                    key={event.eventId}
                    onPress={() => setSelectedId(event.eventId)}
                    style={[styles.tab, active && styles.tabActive]}
                  >
                    <Text style={[styles.tabTitle, active && styles.tabTitleActive]} numberOfLines={1}>
                      {event.title}
                    </Text>
                    <Text style={[styles.tabSub, active && styles.tabSubActive]}>
                      {event.presentCount + event.lateCount} / {event.expectedCount || event.entries.length} checked in
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {detail ? (
              <>
                <View style={styles.tallyCard}>
                  <Tally label="Present" count={detail.presentCount} status="present" />
                  <Tally label="Late" count={detail.lateCount} status="late" />
                  <Tally label="Absent" count={detail.absentCount} status="absent" />
                </View>

                <Section title="Present" count={presentRows.length} rows={presentRows} />
                <Section title="Late" count={lateRows.length} rows={lateRows} />
                <Section title="Absent" count={absentRows.length} rows={absentRows} />
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Tally({ label, count, status }: { label: string; count: number; status: AttendanceStatus }) {
  return (
    <View style={styles.tallyItem}>
      <StatusChip status={status} />
      <Text style={styles.tallyCount}>{count}</Text>
      <Text style={styles.tallyLabel}>{label}</Text>
    </View>
  );
}

function Section({ title, count, rows }: { title: string; count: number; rows: Row[] }) {
  if (count === 0) return null;
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.sectionBadge}>
          <Text style={styles.sectionBadgeText}>{count}</Text>
        </View>
      </View>
      {rows.map((row) => (
        <View key={row.key} style={styles.row}>
          <IconTile name={APP_ICONS.user} size={36} tone="neutral" style={styles.rowIcon} />
          <View style={styles.rowCopy}>
            <Text style={styles.rowName} numberOfLines={1}>{row.studentName}</Text>
            {row.scannedAt ? (
              <Text style={styles.rowMeta}>{new Date(row.scannedAt).toLocaleTimeString()}</Text>
            ) : (
              <Text style={styles.rowMeta}>No scan</Text>
            )}
          </View>
          {row.status !== 'absent' ? <StatusChip status={row.status} compact /> : null}
        </View>
      ))}
    </View>
  );
}

function sortRows(rows: Row[], status: AttendanceStatus): Row[] {
  return rows
    .filter((row) => row.status === status)
    .sort((a, b) => {
      if (!a.scannedAt && !b.scannedAt) return a.studentName.localeCompare(b.studentName);
      if (!a.scannedAt) return 1;
      if (!b.scannedAt) return -1;
      return new Date(a.scannedAt).getTime() - new Date(b.scannedAt).getTime();
    });
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  content: { width: '100%', maxWidth: 680, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 12, paddingBottom: 36 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  loadingText: { marginTop: 12, fontSize: 14, color: COLORS.textSecondary },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.textPrimary, marginTop: 16 },
  subtitle: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', marginTop: 6 },
  liveBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 999, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 14, paddingVertical: 9, marginTop: 16, alignSelf: 'flex-start' },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.present },
  liveText: { fontSize: 12, fontWeight: '700', color: COLORS.textPrimary, marginLeft: 8 },
  liveTime: { fontSize: 12, color: COLORS.textSecondary, marginLeft: 10 },
  errorBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.dangerSoft, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 11, marginTop: 16 },
  errorText: { flex: 1, fontSize: 13, color: COLORS.danger, marginLeft: 9 },
  tabs: { paddingTop: 16, gap: 8 },
  tab: { backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 14, paddingVertical: 10, maxWidth: 220 },
  tabActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  tabTitle: { fontSize: 14, fontWeight: '800', color: COLORS.textPrimary },
  tabTitleActive: { color: COLORS.primaryDark },
  tabSub: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  tabSubActive: { color: COLORS.primaryDark },
  tallyCard: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: COLORS.card, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, padding: 14, marginTop: 16 },
  tallyItem: { alignItems: 'center', flex: 1 },
  tallyCount: { fontSize: 20, fontWeight: '800', color: COLORS.textPrimary, marginTop: 6 },
  tallyLabel: { fontSize: 11, color: COLORS.textSecondary },
  section: { backgroundColor: COLORS.card, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, padding: 16, marginTop: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: COLORS.textPrimary },
  sectionBadge: { backgroundColor: COLORS.surface, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, marginLeft: 8 },
  sectionBadgeText: { fontSize: 11, fontWeight: '800', color: COLORS.textSecondary },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border },
  rowIcon: { marginRight: 10 },
  rowCopy: { flex: 1 },
  rowName: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary },
  rowMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 1 },
  emptyCard: { alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 22, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 22, paddingVertical: 32, marginTop: 22 },
  emptyIcon: { marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 6 },
  emptySubtitle: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center' },
});
