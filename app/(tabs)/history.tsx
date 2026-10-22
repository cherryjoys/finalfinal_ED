import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppButton from '@/components/AppButton';
import Header from '@/components/Header';
import IconTile from '@/components/IconTile';
import StatusChip from '@/components/StatusChip';
import { COLORS } from '@/constants/colors';
import { APP_ICONS, STATUS_META, STATUS_ORDER, type StatusKey } from '@/constants/icons';
import { useAuth } from '@/lib/auth';
import {
  getAttendanceHistory,
  getTeacherAttendanceReport,
  getTeacherEventAttendance,
  getTeacherEventSummary,
  type AttendanceEntry,
  type AttendanceRecord,
  type ScannedStatus,
  type TeacherAttendanceReport,
  type TeacherEventAttendance,
  type TeacherEventSummary,
} from '@/lib/attendance';
import { useRole } from '@/lib/useRole';

export default function HistoryScreen() {
  const { user } = useAuth();
  const { role, loading: roleLoading } = useRole();
  const [studentRecords, setStudentRecords] = useState<AttendanceRecord[]>([]);
  const [teacherSummary, setTeacherSummary] = useState<TeacherEventSummary[]>([]);
  const [teacherReport, setTeacherReport] = useState<TeacherAttendanceReport | null>(null);
  const [showSummary, setShowSummary] = useState(true);
  const [expandedDetail, setExpandedDetail] =
    useState<TeacherEventAttendance | null>(null);
  const [expandingEventId, setExpandingEventId] = useState<string | null>(null);
  const [expanding, setExpanding] = useState(false);
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
      if (role === 'teacher') {
        const [summary, report] = await Promise.all([
          getTeacherEventSummary(user.id),
          getTeacherAttendanceReport(user.id),
        ]);
        setTeacherSummary(summary);
        setTeacherReport(report);
        setStudentRecords([]);
        setExpandedDetail(null);
      } else if (role === 'student') {
        const records = await getAttendanceHistory(user.id);
        setStudentRecords(records);
        setTeacherSummary([]);
        setTeacherReport(null);
        setExpandedDetail(null);
      } else {
        setStudentRecords([]);
        setTeacherSummary([]);
        setTeacherReport(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load history.');
    } finally {
      setLoading(false);
    }
  }, [user, role, roleLoading]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const handleExpand = async (eventId: string) => {
    if (!user || expanding) return;

    if (expandedDetail?.eventId === eventId) {
      setExpandedDetail(null);
      return;
    }

    setExpanding(true);
    setExpandingEventId(eventId);
    setExpandedDetail(null);
    setError(null);

    try {
      const events = await getTeacherEventAttendance(user.id);
      const detail = events.find((event) => event.eventId === eventId) ?? null;
      if (!detail) {
        setError('Could not load attendees.');
        return;
      }
      setExpandedDetail(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load attendees.');
    } finally {
      setExpanding(false);
      setExpandingEventId(null);
    }
  };

  const screenTitle = 'History';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {loading ? (
        <View style={styles.screen}>
           <Header title={screenTitle} compact />
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        </View>
      ) : role === 'teacher' ? (
        <View style={styles.screen}>
          <Header title={screenTitle} compact />
          {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
          {teacherReport ? (
            <TeacherSummaryCard
              report={teacherReport}
              expanded={showSummary}
              onToggle={() => setShowSummary((value) => !value)}
            />
          ) : null}
          {teacherSummary.length === 0 ? (
            <EmptyState
              icon={APP_ICONS.calendar}
              title="No events yet"
              buttonTitle="Create event"
              onPress={() => router.push('/teacher')}
            />
          ) : (
            <ScrollView
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            >
              {teacherSummary.map((item) => {
                const isExpanded =
                  expandedDetail?.eventId === item.eventId || expandingEventId === item.eventId;
                return (
                  <View key={item.eventId} style={styles.card}>
                    <Pressable
                      accessibilityRole="button"
                       accessibilityLabel={`${item.title}, ${item.checkedInCount} checked in, ${item.lateCount} late, ${item.absentCount} absent`}
                      accessibilityState={{ expanded: isExpanded }}
                      disabled={expanding}
                      onPress={() => void handleExpand(item.eventId)}
                      style={({ pressed }) => [styles.cardHeader, pressed && styles.cardPressed]}
                    >
                      <View style={styles.cardTitleCopy}>
                        <Text style={styles.eventTitle}>{item.title}</Text>
                        <Text style={styles.eventCode}>{item.eventCode}</Text>
                      </View>
                      <View style={styles.countBadge}>
                        <Ionicons name={APP_ICONS.roster} size={14} color={COLORS.primary} />
                        <Text style={styles.countBadgeText}>{item.checkedInCount}</Text>
                      </View>
                      <Ionicons
                        name={isExpanded ? 'chevron-up' : 'chevron-down'}
                        size={19}
                        color={COLORS.textSecondary}
                      />
                    </Pressable>

                    {item.startTime ? (
                      <View style={styles.metaRow}>
                        <Ionicons name={APP_ICONS.calendar} size={15} color={COLORS.textSecondary} />
                        <Text style={styles.eventMeta}>{formatDate(item.startTime)}</Text>
                      </View>
                    ) : null}

                    <StatusTally
                      present={item.presentCount}
                      late={item.lateCount}
                      absent={item.absentCount}
                      style={styles.metaTally}
                    />

                    {!isExpanded && (item.checkedInCount > 0 || item.expectedCount > 0) ? (
                       <Text style={styles.expandHint}>View roster</Text>
                    ) : null}

                    {isExpanded ? (
                      <View style={styles.detailSection}>
                        <View style={styles.separator} />
                        {expanding ? (
                          <View style={styles.detailLoading}>
                            <ActivityIndicator size="small" color={COLORS.primary} />
                             <Text style={styles.detailLoadingText}>Loading roster</Text>
                          </View>
                        ) : expandedDetail ? (
                          <RosterDetail detail={expandedDetail} />
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      ) : role === 'student' ? (
        <View style={styles.screen}>
          <Header title={screenTitle} compact />
          {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
          {studentRecords.length === 0 ? (
            <EmptyState
              icon={APP_ICONS.qr}
              title="No attendance yet"
              buttonTitle="Scan a QR"
              onPress={() => router.push('/scan')}
            />
          ) : (
            <FlatList
              data={studentRecords}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => <StudentRecord item={item} />}
            />
          )}
        </View>
      ) : (
        <View style={styles.screen}>
          <Header title={screenTitle} compact />
          <EmptyState
            icon={APP_ICONS.user}
            title="Role unavailable"
            buttonTitle="Retry"
            onPress={() => void load()}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

type ErrorBannerProps = {
  message: string;
  onRetry: () => void;
};

function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
  return (
    <View accessibilityRole="alert" style={styles.errorBanner}>
      <Ionicons name="alert-circle-outline" size={19} color={COLORS.danger} />
      <Text style={styles.errorText}>{message}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Retry loading history"
        onPress={onRetry}
        style={styles.retryButton}
      >
        <Ionicons name={APP_ICONS.retry} size={15} color={COLORS.danger} />
        <Text style={styles.retryText}>Retry</Text>
      </Pressable>
    </View>
  );
}

type TallyProps = {
  present: number;
  late: number;
  absent: number;
  hideEmpty?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Present / Late / Absent as a single compact strip. With `hideEmpty` it only
 * surfaces the states that actually have students in them.
 */
function StatusTally({ present, late, absent, hideEmpty = true, style }: TallyProps) {
  const counts: Record<StatusKey, number> = { present, late, absent };
  const visible = STATUS_ORDER.filter(
    (key) => !hideEmpty || counts[key] > 0
  );

  if (visible.length === 0) return null;

  return (
    <View style={[styles.tally, style]}>
      {visible.map((key) => (
        <View key={key} style={styles.tallyItem}>
          <Ionicons name={STATUS_META[key].icon} size={13} color={STATUS_META[key].color} />
          <Text style={[styles.tallyCount, { color: STATUS_META[key].color }]}>
            {counts[key]}
          </Text>
          <Text style={styles.tallyLabel}>{STATUS_META[key].label}</Text>
        </View>
      ))}
    </View>
  );
}

function TeacherSummaryCard({
  report,
  expanded,
  onToggle,
}: {
  report: TeacherAttendanceReport;
  expanded: boolean;
  onToggle: () => void;
}) {
  const visibleStudents = report.students.slice(0, 8);
  const hiddenCount = report.students.length - visibleStudents.length;

  return (
    <View style={styles.summaryCard}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          expanded ? 'Hide attendance summary' : 'Show attendance summary'
        }
        accessibilityState={{ expanded }}
        onPress={onToggle}
        style={styles.summaryHeader}
      >
        <IconTile name="stats-chart-outline" size={34} />
        <View style={styles.summaryHeaderCopy}>
          <Text style={styles.summaryTitle}>Attendance summary</Text>
          <Text style={styles.summarySubtitle}>
            {report.eventCount} {report.eventCount === 1 ? 'event' : 'events'} -{' '}
            {Math.round(report.attendanceRate * 100)}% attendance
          </Text>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={19}
          color={COLORS.textSecondary}
        />
      </Pressable>

      {expanded ? (
        <>
          <StatusTally
            present={report.presentCount}
            late={report.lateCount}
            absent={report.absentCount}
            hideEmpty={false}
            style={styles.metaTally}
          />

          {visibleStudents.length === 0 ? (
            <Text style={styles.summaryEmpty}>No students have been recorded yet.</Text>
          ) : (
            visibleStudents.map((student) => (
              <View key={student.key} style={styles.summaryStudentRow}>
                <View style={styles.summaryStudentCopy}>
                  <Text style={styles.summaryStudentName} numberOfLines={1}>
                    {student.name}
                  </Text>
                  <Text style={styles.summaryStudentMeta}>
                    {student.present} present - {student.late} late - {student.absent} absent
                  </Text>
                </View>
                <Text style={styles.summaryStudentRate}>
                  {Math.round(student.rate * 100)}%
                </Text>
              </View>
            ))
          )}

          {hiddenCount > 0 ? (
            <Text style={styles.summaryEmpty}>+{hiddenCount} more students</Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

function RosterDetail({ detail }: { detail: TeacherEventAttendance }) {
  if (detail.entries.length === 0) {
    return (
      <View style={styles.emptyDetail}>
        <Ionicons name={APP_ICONS.roster} size={20} color={COLORS.textSecondary} />
         <Text style={styles.emptyDetailText}>No check-ins yet</Text>
      </View>
    );
  }

  return (
    <>
      <StatusTally
        present={detail.presentCount}
        late={detail.lateCount}
        absent={detail.absentCount}
        hideEmpty={false}
        style={styles.detailTally}
      />
      <View style={styles.rosterNote}>
        <Ionicons name={APP_ICONS.timer} size={14} color={COLORS.textSecondary} />
        <Text style={styles.rosterNoteText}>
          Late after {detail.lateAfterMinutes} min
        </Text>
      </View>

      {detail.entries.map((entry) => (
        <RosterRow key={entry.key} entry={entry} />
      ))}

      {detail.expectedCount === 0 ? (
        <View style={styles.rosterHint}>
          <Ionicons name="information-circle-outline" size={15} color={COLORS.textSecondary} />
          <Text style={styles.rosterHintText}>
            Add expected students when you create the event to track absences.
          </Text>
        </View>
      ) : null}
    </>
  );
}

function RosterRow({ entry }: { entry: AttendanceEntry }) {
  const meta = STATUS_META[entry.status];

  return (
    <View style={styles.attendeeRow}>
      <IconTile
        name={APP_ICONS.user}
        size={34}
        tone="neutral"
        style={styles.attendeeAvatar}
      />
      <View style={styles.attendeeCopy}>
        <Text style={styles.attendeeText} numberOfLines={1}>
          {entry.studentName}
        </Text>
        <View style={styles.attendeeMetaRow}>
          <Ionicons
            name={entry.scannedAt ? APP_ICONS.clock : 'ellipse-outline'}
            size={12}
            color={COLORS.textSecondary}
          />
          <Text style={styles.attendeeMeta}>
            {entry.scannedAt
              ? `Checked in ${formatDate(entry.scannedAt)}`
              : 'No scan recorded'}
          </Text>
        </View>
      </View>
      <View style={[styles.statusDot, { backgroundColor: meta.soft }]}>
        <Ionicons name={meta.icon} size={15} color={meta.color} />
      </View>
    </View>
  );
}

type EmptyStateProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  buttonTitle: string;
  onPress: () => void;
};

function EmptyState({ icon, title, buttonTitle, onPress }: EmptyStateProps) {
  return (
    <View style={styles.emptyCard}>
      <IconTile name={icon} size={64} style={styles.emptyIcon} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <AppButton
        title={buttonTitle}
        icon={
          icon === APP_ICONS.calendar
            ? APP_ICONS.add
            : icon === APP_ICONS.user
              ? APP_ICONS.retry
              : APP_ICONS.qr
        }
        onPress={onPress}
        variant="secondary"
      />
    </View>
  );
}

function StudentRecord({ item }: { item: AttendanceRecord }) {
  const status = item.status as ScannedStatus;

  return (
    <View style={styles.card}>
      <View style={styles.studentRecordTop}>
        <IconTile
          name={STATUS_META[status].icon}
          size={40}
          tone={status === 'late' ? 'late' : 'present'}
          style={styles.recordIcon}
        />
        <View style={styles.recordCopy}>
          <Text style={styles.eventTitle} numberOfLines={2}>
            {item.eventTitle || 'School event'}
          </Text>
          <Text style={styles.eventCode}>{item.eventId || 'Event code unavailable'}</Text>
        </View>
        <StatusChip status={status} compact style={styles.recordChip} />
      </View>
      <View style={styles.metaRow}>
        <Ionicons name={APP_ICONS.clock} size={15} color={COLORS.textSecondary} />
        <Text style={styles.eventMeta}>Recorded {formatDate(item.scannedAt)}</Text>
      </View>
    </View>
  );
}

function formatDate(iso: string | null) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  screen: {
    flex: 1,
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  loadingCard: {
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 24,
    paddingVertical: 42,
    marginTop: 24,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.dangerSoft,
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 11,
    marginTop: 16,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.danger,
    marginLeft: 9,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: 8,
  },
  retryText: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.danger,
    marginLeft: 5,
  },
  listContent: {
    paddingTop: 18,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardPressed: {
    opacity: 0.76,
  },
  cardTitleCopy: {
    flex: 1,
    paddingRight: 10,
  },
  eventTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  eventCode: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
    marginTop: 4,
  },
  countBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primaryLight,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 6,
    marginRight: 8,
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.primaryDark,
    marginLeft: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  eventMeta: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginLeft: 6,
  },
  metaTally: {
    marginTop: 10,
  },
  expandHint: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginTop: 12,
  },
  detailSection: {
    marginTop: 2,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.border,
    marginVertical: 13,
  },
  detailLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  detailLoadingText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginLeft: 9,
  },
  emptyDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  emptyDetailText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginLeft: 8,
  },
  tally: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  tallyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 14,
  },
  tallyCount: {
    fontSize: 13,
    fontWeight: '800',
    marginLeft: 4,
  },
  tallyLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginLeft: 3,
  },
  detailTally: {
    marginBottom: 12,
  },
  rosterNote: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  rosterNoteText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginLeft: 6,
  },
  attendeeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  attendeeAvatar: {
    marginRight: 10,
  },
  attendeeCopy: {
    flex: 1,
    paddingRight: 8,
  },
  attendeeText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  attendeeMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  attendeeMeta: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginLeft: 4,
  },
  statusDot: {
    width: 30,
    height: 30,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rosterHint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 10,
  },
  rosterHintText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: COLORS.textSecondary,
    marginLeft: 6,
  },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 22,
    paddingVertical: 32,
    marginTop: 22,
  },
  emptyIcon: {
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 7,
  },
  studentRecordTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  recordIcon: {
    marginRight: 11,
  },
  recordCopy: {
    flex: 1,
    paddingRight: 8,
  },
  recordChip: {
    marginLeft: 4,
  },
  summaryCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginTop: 16,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryHeaderCopy: {
    flex: 1,
    paddingHorizontal: 11,
  },
  summaryTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  summarySubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  summaryEmpty: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 10,
  },
  summaryStudentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    marginTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  summaryStudentCopy: {
    flex: 1,
    paddingRight: 10,
  },
  summaryStudentName: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  summaryStudentMeta: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  summaryStudentRate: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.primary,
  },
});
