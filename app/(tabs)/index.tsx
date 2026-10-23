import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import GradientScreen from '@/components/GradientScreen';
import { COLORS, TINTS } from '@/constants/colors';
import { PRESSED, RADIUS, SHADOWS, SPACING, TEXT } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { getAttendanceHistory, type AttendanceRecord } from '@/lib/attendance';
import { getAvailableEvents, type CloudEvent } from '@/lib/events';
import { useRole } from '@/lib/useRole';

const GLASS = 'rgba(255, 255, 255, 0.72)';
const GLASS_SOFT = 'rgba(255, 255, 255, 0.38)';
const GLASS_BORDER = 'rgba(255, 255, 255, 0.65)';
const ON_GRADIENT = 'rgba(255, 255, 255, 0.82)';

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function getWeek(today: Date) {
  const monday = new Date(today);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function formatTime(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function duration(start: string | null, end: string | null) {
  if (!start || !end) return null;
  const mins = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
  if (mins <= 0) return null;
  if (mins < 60) return `${mins}m`;
  const h = mins / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)}h`;
}

export default function Index() {
  const { user } = useAuth();
  const { role } = useRole();
  const [events, setEvents] = useState<CloudEvent[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (role !== 'student' || !user) {
        setEvents([]);
        setRecords([]);
        setLoading(false);
        return () => {
          active = false;
        };
      }
      setLoading(true);
      Promise.all([getAvailableEvents(), getAttendanceHistory(user.id)]).then(
        ([list, history]) => {
          if (!active) return;
          setEvents(list);
          setRecords(history);
          setLoading(false);
        }
      );
      return () => {
        active = false;
      };
    }, [role, user])
  );

  const today = useMemo(() => new Date(), []);
  const week = useMemo(() => getWeek(today), [today]);
  const rangeLabel = `${week[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${week[6].getDate()}`;
  const dateLabel = today.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  const isStudent = role === 'student';
  const attended = events.filter((e) =>
    records.some((r) => r.eventId === e.event_code || r.eventId === e.id)
  ).length;
  const progress = events.length ? Math.round((attended / events.length) * 100) : 0;

  const focus = events[0];
  const next = events[1];

  const cta =
    role === 'admin'
      ? { label: 'Open dashboard', icon: 'shield-checkmark' as const, to: '/admin' }
      : role === 'teacher'
        ? { label: 'Create event', icon: 'add' as const, to: '/teacher' }
        : { label: 'Scan to check in', icon: 'qr-code' as const, to: '/scan' };

  const focusTitle = isStudent
    ? focus?.title ?? 'No events right now'
    : role === 'admin'
      ? 'Review campus attendance'
      : 'Run your next event';
  const focusBody = isStudent
    ? focus
      ? focus.description ||
        [focus.venue, focus.start_time ? formatTime(focus.start_time) : null]
          .filter(Boolean)
          .join(' • ') ||
        focus.event_code
      : 'New events will show up here. Check back later.'
    : role === 'admin'
      ? 'Manage users, events and attendance corrections in one place.'
      : 'Create an event, then show its QR code so students can check in.';
  const focusDuration = focus ? duration(focus.start_time, focus.end_time) : null;

  return (
    <GradientScreen>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.today}>Today</Text>
            <Text style={styles.date}>{dateLabel}</Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.roundButton, pressed && PRESSED]}
            onPress={() => router.push('/profile')}
            accessibilityLabel="Open profile"
          >
            <Ionicons name="person-outline" size={20} color="#FFFFFF" />
          </Pressable>
        </View>

        <View style={styles.stack}>
          {isStudent && (
            <View style={styles.progressStrip}>
              <View style={styles.ring} />
              <Text style={styles.stripLabel}>Overall progress</Text>
              <Text style={styles.stripValue}>{progress}%</Text>
            </View>
          )}

          <View style={[styles.focusCard, isStudent && styles.focusCardOverlap]}>
            <View style={styles.focusTop}>
              <Text style={styles.focusLabel}>Today's focus</Text>
              <View style={styles.focusBadge}>
                <Ionicons name="calendar" size={16} color={COLORS.primary} />
              </View>
            </View>

            {loading ? (
              <ActivityIndicator color={COLORS.primary} style={styles.loader} />
            ) : (
              <>
                <Text style={styles.focusTitle} numberOfLines={3}>
                  {focusTitle}
                </Text>
                <Text style={styles.focusBody} numberOfLines={3}>
                  {focusBody}
                </Text>
              </>
            )}

            <View style={styles.focusFooter}>
              <Pressable
                style={({ pressed }) => [styles.startPill, pressed && PRESSED]}
                onPress={() => router.push(cta.to as never)}
              >
                <View style={styles.startIcon}>
                  <Ionicons name={cta.icon} size={18} color={COLORS.primaryInk} />
                </View>
                <Text style={styles.startText}>{cta.label}</Text>
              </Pressable>
              {focusDuration && isStudent && (
                <View style={styles.durationWrap}>
                  <Ionicons name="time-outline" size={15} color={COLORS.textSecondary} />
                  <Text style={styles.durationText}>{focusDuration}</Text>
                </View>
              )}
            </View>
          </View>

          {isStudent && (
            <View style={styles.nextStrip}>
              <Text style={styles.nextLabel}>Next up</Text>
              <Text style={styles.nextTitle} numberOfLines={1}>
                {next ? next.title : 'Nothing else scheduled'}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.weekCard}>
          <View style={styles.weekHeader}>
            <Text style={styles.weekLabel}>This week</Text>
            <Text style={styles.weekRange}>{rangeLabel}</Text>
          </View>
          <View style={styles.weekRow}>
            {week.map((d, i) => {
              const isToday = sameDay(d, today);
              const hasEvent = events.some(
                (e) => e.start_time && sameDay(new Date(e.start_time), d)
              );
              return (
                <View key={i} style={[styles.dayCol, isToday && styles.dayColActive]}>
                  <Text style={styles.dayLetter}>{DAY_LETTERS[i]}</Text>
                  <Text style={[styles.dayNumber, isToday && styles.dayNumberActive]}>
                    {d.getDate()}
                  </Text>
                  <View style={[styles.dot, hasEvent && styles.dotOn]} />
                </View>
              );
            })}
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [styles.historyPill, pressed && PRESSED]}
          onPress={() => router.push('/history')}
        >
          <Ionicons name="time-outline" size={18} color={COLORS.textSecondary} />
          <Text style={styles.historyText}>View attendance history</Text>
        </Pressable>
      </ScrollView>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: SPACING.lg,
  },
  today: { ...TEXT.display, color: '#FFFFFF', fontSize: 30 },
  date: {
    fontSize: 28,
    fontWeight: '500',
    letterSpacing: -0.6,
    color: 'rgba(255,255,255,0.7)',
  },
  roundButton: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.pill,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  stack: { marginBottom: SPACING.lg },
  progressStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: GLASS_SOFT,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    borderRadius: RADIUS.card,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xl,
  },
  ring: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'rgba(18,20,26,0.18)',
    borderTopColor: COLORS.primaryInk,
    marginRight: SPACING.sm,
  },
  stripLabel: { ...TEXT.chip, flex: 1 },
  stripValue: { ...TEXT.chip },

  focusCard: {
    zIndex: 2,
    backgroundColor: 'rgba(244,246,250,0.94)',
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: TINTS.white,
    padding: SPACING.lg,
    ...SHADOWS.card,
  },
  focusCardOverlap: { marginTop: -SPACING.lg },
  focusTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.lg,
  },
  focusLabel: { ...TEXT.meta },
  focusBadge: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.pill,
    backgroundColor: TINTS.wash,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loader: { marginVertical: SPACING.xl },
  focusTitle: {
    fontSize: 28,
    fontWeight: '600',
    letterSpacing: -0.8,
    lineHeight: 32,
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
  },
  focusBody: { ...TEXT.body, fontWeight: '400', lineHeight: 21, maxWidth: '90%' },
  focusFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACING.xxl,
  },
  startPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#050505',
    borderRadius: RADIUS.pill,
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: SPACING.md,
  },
  startIcon: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.pill,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.xs,
  },
  startText: { ...TEXT.chip, fontSize: 14, color: '#FFFFFF' },
  durationWrap: { flexDirection: 'row', alignItems: 'center' },
  durationText: { ...TEXT.meta, marginLeft: 4 },

  nextStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: GLASS_SOFT,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    borderRadius: RADIUS.card,
    marginTop: -SPACING.lg,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.sm,
  },
  nextLabel: { ...TEXT.meta, marginRight: SPACING.sm },
  nextTitle: { ...TEXT.chip, flex: 1 },

  weekCard: {
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    borderRadius: RADIUS.card,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  weekHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  weekLabel: { ...TEXT.meta },
  weekRange: { ...TEXT.chip },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between' },
  dayCol: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.field,
  },
  dayColActive: { backgroundColor: '#FFFFFF', ...SHADOWS.card },
  dayLetter: { ...TEXT.hint, marginBottom: 6 },
  dayNumber: { fontSize: 17, fontWeight: '500', color: COLORS.textPrimary },
  dayNumberActive: { fontWeight: '700' },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 6,
    backgroundColor: 'transparent',
  },
  dotOn: { backgroundColor: COLORS.textSecondary },

  historyPill: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    ...SHADOWS.card,
  },
  historyText: { ...TEXT.meta, marginLeft: SPACING.xs },
});
