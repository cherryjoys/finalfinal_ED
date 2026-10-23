import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import GradientScreen from '@/components/GradientScreen';
import { COLORS, STATUS, TINTS } from '@/constants/colors';
import { RADIUS, SHADOWS, SPACING, TEXT } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { getAttendanceHistory, type AttendanceRecord } from '@/lib/attendance';
import {
  getTeacherEventAttendance,
  getTeacherEventSummary,
  type TeacherEventAttendance,
  type TeacherEventSummary,
} from '@/lib/attendance';
import { useRole } from '@/lib/useRole';

const GLASS = 'rgba(255, 255, 255, 0.72)';
const GLASS_SOFT = 'rgba(255, 255, 255, 0.38)';
const GLASS_BORDER = 'rgba(255, 255, 255, 0.65)';
const ON_GRADIENT = 'rgba(255, 255, 255, 0.82)';

function HistoryScreenInner() {
  const { user } = useAuth();
  const { role } = useRole();
  const [studentRecords, setStudentRecords] = useState<AttendanceRecord[]>([]);
  const [teacherSummary, setTeacherSummary] = useState<TeacherEventSummary[]>(
    []
  );
  const [expandedDetail, setExpandedDetail] =
    useState<TeacherEventAttendance | null>(null);
  const [expanding, setExpanding] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    if (role === 'teacher') {
      const summary = await getTeacherEventSummary(user.id);
      setTeacherSummary(summary);
      setExpandedDetail(null);
      setStudentRecords([]);
    } else if (role === 'student') {
      const records = await getAttendanceHistory(user.id);
      setStudentRecords(records);
      setTeacherSummary([]);
      setExpandedDetail(null);
    }

    setLoading(false);
  }, [user, role]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  const handleExpand = async (eventId: string) => {
    if (expandedDetail?.eventId === eventId) {
      setExpandedDetail(null);
      return;
    }
    setExpanding(true);
    setExpandedDetail(null);
    const events = await getTeacherEventAttendance(user?.id ?? '');
    const detail = events.find((e) => e.eventId === eventId) ?? null;
    setExpandedDetail(detail);
    setExpanding(false);
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Attendance History</Text>
        <Text style={styles.subtitle}>Loading records...</Text>
      </View>
    );
  }

  if (role === 'teacher') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Attendance History</Text>
        <Text style={styles.subtitle}>Events you created and who attended</Text>

        {teacherSummary.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Ionicons name="calendar-outline" size={40} color={COLORS.primary} />
            </View>
            <Text style={styles.emptyText}>
              No events yet. Create one in the Teacher tab to start tracking
              attendance.
            </Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          >
            {teacherSummary.map((item) => {
              const isExpanded = expandedDetail?.eventId === item.eventId;
              return (
                <View key={item.eventId} style={styles.card}>
                  <Pressable
                    style={styles.cardHeader}
                    onPress={() => handleExpand(item.eventId)}
                  >
                    <View style={styles.tile}>
                      <Ionicons
                        name="ticket-outline"
                        size={22}
                        color={COLORS.primary}
                      />
                    </View>
                    <View style={styles.cardHeaderText}>
                      <Text style={styles.eventTitle}>{item.title}</Text>
                      <Text style={styles.eventMeta}>{item.eventCode}</Text>
                    </View>
                    <View style={styles.countBadge}>
                      <Ionicons name="people" size={13} color={TINTS.white} />
                      <Text style={styles.countBadgeText}>
                        {item.attendeeCount}
                      </Text>
                    </View>
                    <Ionicons
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color={COLORS.textSecondary}
                      style={styles.chevron}
                    />
                  </Pressable>
                  {item.startTime && (
                    <Text style={styles.eventMeta}>
                      {formatDate(item.startTime)}
                    </Text>
                  )}

                  {!isExpanded && item.attendeeCount > 0 && (
                    <Text style={styles.expandHint}>
                      Tap to see the full attendee list
                    </Text>
                  )}

                  {isExpanded && (
                    <>
                      <View style={styles.separator} />
                      {expanding ? (
                        <Text style={styles.eventMeta}>Loading attendees...</Text>
                      ) : expandedDetail &&
                        expandedDetail.attendees.length === 0 ? (
                        <Text style={styles.eventMeta}>
                          No attendance recorded yet.
                        </Text>
                      ) : (
                        expandedDetail &&
                        expandedDetail.attendees.map((attendee) => (
                          <View key={attendee.key} style={styles.attendeeRow}>
                            <View style={styles.attendeeAvatar}>
                              <Ionicons
                                name="person"
                                size={16}
                                color={COLORS.primary}
                              />
                            </View>
                            <Text style={styles.attendeeText}>
                              {attendee.studentName ||
                                shortId(attendee.studentId ?? '')}
                            </Text>
                            <Text style={styles.attendeeMeta} numberOfLines={1}>
                              {attendee.scannedAt
                                ? formatDate(attendee.scannedAt)
                                : 'Not scanned'}
                            </Text>
                          </View>
                        ))
                      )}
                    </>
                  )}
                </View>
              );
            })}
          </ScrollView>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Attendance History</Text>

      {studentRecords.length === 0 ? (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIcon}>
            <Ionicons name="time-outline" size={40} color={COLORS.primary} />
          </View>
          <Text style={styles.emptyText}>
            No records yet. Scan a QR code to register your attendance.
          </Text>
        </View>
      ) : (
        <FlatList
          data={studentRecords}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.recordTop}>
                <View style={styles.tile}>
                  <Ionicons
                    name="checkmark-done-outline"
                    size={22}
                    color={COLORS.primary}
                  />
                </View>
                <Text style={styles.eventTitle}>{item.eventTitle}</Text>
                <View
                  style={[
                    styles.presentBadge,
                    { backgroundColor: STATUS[item.status].bg },
                  ]}
                >
                  <Text
                    style={[
                      styles.presentBadgeText,
                      { color: STATUS[item.status].fg },
                    ]}
                  >
                    {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                  </Text>
                </View>
              </View>
              <Text style={styles.eventMeta}>{item.eventId}</Text>
              <Text style={styles.eventMeta}>{formatDate(item.scannedAt)}</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

function shortId(id: string) {
  return id ? `…${id.slice(-8)}` : 'unknown';
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString();
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
  },
  title: {
    ...TEXT.display,
    color: '#FFFFFF',
    marginBottom: SPACING.xxs,
  },
  subtitle: {
    ...TEXT.meta,
    color: ON_GRADIENT,
    textAlign: 'center',
    marginTop: SPACING.xs,
    marginBottom: SPACING.md,
  },
  list: {
    paddingBottom: SPACING.xl,
  },
  card: {
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    borderRadius: RADIUS.card,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    ...SHADOWS.card,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  cardHeaderText: {
    flex: 1,
    paddingRight: SPACING.xs,
  },
  recordTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  tile: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.pill,
    backgroundColor: TINTS.wash,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.sm,
  },
  eventTitle: {
    ...TEXT.cardTitle,
    flex: 1,
    paddingRight: SPACING.xs,
  },
  countBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primaryInk,
    borderRadius: RADIUS.badge,
    minWidth: 34,
    paddingHorizontal: SPACING.xs,
    paddingVertical: 5,
    justifyContent: 'center',
  },
  countBadgeText: {
    ...TEXT.badge,
    color: TINTS.white,
    marginLeft: 4,
  },
  presentBadge: {
    backgroundColor: STATUS.present.bg,
    borderRadius: RADIUS.badge,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
  },
  presentBadgeText: {
    ...TEXT.badge,
    color: STATUS.present.fg,
  },
  chevron: {
    marginLeft: SPACING.xs,
  },
  expandHint: {
    ...TEXT.hint,
    fontStyle: 'italic',
    marginTop: SPACING.xs,
  },
  eventMeta: {
    ...TEXT.meta,
    marginTop: 2,
  },
  separator: {
    alignSelf: 'stretch',
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.sm,
  },
  attendeeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TINTS.wash,
    borderRadius: RADIUS.badge,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    marginTop: SPACING.xs,
  },
  attendeeAvatar: {
    width: 28,
    height: 28,
    borderRadius: RADIUS.pill,
    backgroundColor: TINTS.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.xs,
  },
  attendeeText: {
    ...TEXT.body,
    fontWeight: '700',
    flex: 1,
    flexShrink: 1,
  },
  attendeeMeta: {
    ...TEXT.hint,
    flexShrink: 0,
    marginLeft: SPACING.xs,
  },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    borderRadius: RADIUS.card,
    padding: SPACING.xl,
    marginTop: SPACING.lg,
    ...SHADOWS.card,
  },
  emptyIcon: {
    width: 84,
    height: 84,
    borderRadius: RADIUS.pill,
    backgroundColor: TINTS.wash,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  emptyText: {
    ...TEXT.body,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
  },
});

export default function HistoryScreen() {
  return (
    <GradientScreen>
      <HistoryScreenInner />
    </GradientScreen>
  );
}
