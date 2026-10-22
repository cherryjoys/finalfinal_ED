import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
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
import {
  deleteAttendanceRecord,
  getSystemReport,
  listAuditLog,
  listEventRoster,
  listUsers,
  logAdminAction,
  markAttendancePresent,
  reportToCsv,
  setAttendanceStatus,
  setUserActive,
  setUserRole,
  type AdminAttendanceRecord,
  type AdminEventSummary,
  type AdminRosterEntry,
  type AdminRole,
  type AdminStudentStat,
  type AdminUser,
  type AuditEntry,
  type SystemReport,
} from '@/lib/admin';
import { useAuth } from '@/lib/auth';
import { deleteEvent } from '@/lib/events';
import { useRole } from '@/lib/useRole';

const ROLES: AdminRole[] = ['student', 'teacher', 'admin'];
const MAX_VISIBLE_ROWS = 50;

export default function AdminScreen() {
  const { user } = useAuth();
  const { role, loading: roleLoading } = useRole();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [events, setEvents] = useState<AdminEventSummary[]>([]);
  const [records, setRecords] = useState<AdminAttendanceRecord[]>([]);
  const [students, setStudents] = useState<AdminStudentStat[]>([]);
  const [report, setReport] = useState<SystemReport | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [roster, setRoster] = useState<AdminRosterEntry[]>([]);
  const [rosterEventId, setRosterEventId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (roleLoading) {
        if (!silent) setLoading(true);
        return;
      }
      if (!user || role !== 'admin') {
        setLoading(false);
        return;
      }
      if (!silent) setLoading(true);
      setError(null);

      try {
        const [userList, systemReport, auditLog] = await Promise.all([
          listUsers(),
          getSystemReport(),
          listAuditLog(25),
        ]);
        setUsers(userList);
        setReport(systemReport);
        setEvents(systemReport.events);
        setRecords(systemReport.records);
        setStudents(systemReport.students);
        setAudit(auditLog);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load admin data.');
      } finally {
        setLoading(false);
      }
    },
    [user, role, roleLoading]
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  /**
   * Runs one administrator action, records it in the audit log and refreshes
   * the dashboard. `busyKey` keeps the rest of the screen tappable while a
   * single row is being written.
   */
  const runAction = useCallback(
    async (
      key: string,
      action: () => Promise<{ error: string | null }>,
      successMessage: string
    ) => {
      setBusyKey(key);
      setError(null);
      setNotice(null);
      try {
        const result = await action();
        if (result.error) {
          setError(result.error);
        } else {
          setNotice(successMessage);
          await load(true);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'The action could not be completed.');
      } finally {
        setBusyKey(null);
      }
    },
    [load]
  );

  const handleRoleChange = (account: AdminUser, nextRole: AdminRole) => {
    if (account.role === nextRole) return;
    void runAction(
      `role-${account.id}`,
      async () => {
        const result = await setUserRole(account.id, nextRole);
        if (!result.error) {
          await logAdminAction(
            'change_role',
            'profile',
            account.id,
            `${account.email ?? account.id}: ${account.role} to ${nextRole}`
          );
        }
        return result;
      },
      `${account.full_name ?? account.email ?? 'Account'} is now a ${nextRole}.`
    );
  };

  const handleToggleActive = (account: AdminUser) => {
    const nextActive = !account.is_active;
    void runAction(
      `active-${account.id}`,
      async () => {
        const result = await setUserActive(account.id, nextActive);
        if (!result.error) {
          await logAdminAction(
            nextActive ? 'enable_account' : 'disable_account',
            'profile',
            account.id,
            account.email ?? account.id
          );
        }
        return result;
      },
      nextActive ? 'Account re-enabled.' : 'Account disabled.'
    );
  };

  const handleDeleteEvent = (event: AdminEventSummary) => {
    Alert.alert(
      'Delete this event?',
      `"${event.title}" (${event.eventCode}) and every attendance record inside it will be removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void runAction(
              `event-${event.eventId}`,
              async () => {
                const result = await deleteEvent(event.eventId);
                if (!result.error) {
                  await logAdminAction(
                    'delete_event',
                    'event',
                    event.eventId,
                    `${event.title} (${event.eventCode})`
                  );
                }
                return result;
              },
              'Event deleted.'
            );
          },
        },
      ]
    );
  };

  const handleStatusChange = (
    record: AdminAttendanceRecord,
    status: 'present' | 'late'
  ) => {
    if (record.status === status) return;
    void runAction(
      `att-${record.id}`,
      async () => {
        const result = await setAttendanceStatus(record.id, status);
        if (!result.error) {
          await logAdminAction(
            'correct_attendance',
            'attendance',
            record.id,
            `${record.student_name}: ${record.status} to ${status}`
          );
        }
        return result;
      },
      'Check-in updated.'
    );
  };

  const handleDeleteRecord = (record: AdminAttendanceRecord) => {
    Alert.alert(
      'Remove this check-in?',
      `${record.student_name} will count as absent for "${record.event_title}".`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void runAction(
              `att-${record.id}`,
              async () => {
                const result = await deleteAttendanceRecord(record.id);
                if (!result.error) {
                  await logAdminAction(
                    'delete_attendance',
                    'attendance',
                    record.id,
                    `${record.student_name} - ${record.event_title}`
                  );
                }
                return result;
              },
              'Check-in removed.'
            );
          },
        },
      ]
    );
  };

  const openRoster = useCallback(async (eventId: string) => {
    setRosterEventId(eventId);
    setRoster([]);
    try {
      setRoster(await listEventRoster(eventId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the roster.');
    }
  }, []);

  const handleMarkPresent = (entry: AdminRosterEntry) => {
    const studentId = entry.student_id;
    const eventId = rosterEventId;
    if (!studentId || !eventId) return;
    void runAction(
      `mark-${entry.id}`,
      async () => {
        const result = await markAttendancePresent(eventId, studentId);
        if (!result.error) {
          await logAdminAction(
            'mark_attendance_present',
            'attendance',
            studentId,
            `${entry.student_name} - event ${eventId}`
          );
        }
        return result;
      },
      `${entry.student_name} marked present.`
    );
  };

  const handleExport = async () => {
    if (!report) return;
    try {
      await Share.share({
        title: 'Attendance report',
        message: reportToCsv(report),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not export the report.');
    }
  };

  if (roleLoading || loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <Header title="Admin" compact />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading admin dashboard...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (role !== 'admin') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
        <Header title="Admin" compact />
        <View style={styles.center}>
          <IconTile name={APP_ICONS.lock} size={64} />
          <Text style={styles.title}>Admins only</Text>
          <Text style={styles.subtitle}>You do not have permission to access this section.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const totals = report?.totals;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Header title="Admin dashboard" compact />

        {error ? (
          <View accessibilityRole="alert" style={styles.errorBanner}>
            <Ionicons name="alert-circle-outline" size={19} color={COLORS.danger} />
            <Text style={styles.errorText}>{error}</Text>
            <Pressable accessibilityRole="button" onPress={() => void load()} style={styles.retryBtn}>
              <Ionicons name={APP_ICONS.retry} size={15} color={COLORS.danger} />
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        {notice ? (
          <View accessibilityRole="alert" style={styles.noticeBanner}>
            <Ionicons name="checkmark-circle-outline" size={19} color={COLORS.present} />
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <IconTile name="stats-chart-outline" size={38} />
            <Text style={styles.cardTitle}>System overview</Text>
          </View>
          <View style={styles.statsRow}>
            <StatBox label="Users" value={totals?.users ?? 0} icon="people-outline" />
            <StatBox label="Events" value={totals?.events ?? 0} icon={APP_ICONS.calendar} />
            <StatBox label="Check-ins" value={totals?.checkIns ?? 0} icon={APP_ICONS.history} />
          </View>
          <View style={styles.statsRow}>
            <StatBox label="Students" value={totals?.students ?? 0} icon="school-outline" />
            <StatBox label="Teachers" value={totals?.teachers ?? 0} icon="briefcase-outline" />
            <StatBox
              label="Attendance"
              value={`${Math.round((totals?.attendanceRate ?? 0) * 100)}%`}
              icon="trending-up-outline"
            />
          </View>
          <Text style={styles.hint}>
            {totals?.activeUsers ?? 0} active - {totals?.disabledUsers ?? 0} disabled -{' '}
            {totals?.openEvents ?? 0} open events
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <IconTile name="people-circle-outline" size={38} />
            <Text style={styles.cardTitle}>Manage users</Text>
          </View>
          <Text style={styles.hint}>
            Promote, demote or disable an account. Every change is written to the audit log.
          </Text>
          {users.length === 0 ? (
            <Text style={styles.emptyText}>No users found.</Text>
          ) : (
            users.map((account) => (
              <View key={account.id} style={styles.userRow}>
                <View style={styles.userHead}>
                  <View style={styles.userCopy}>
                    <Text style={styles.userName}>{account.full_name || '- No name -'}</Text>
                    <Text style={styles.userEmail}>{account.email}</Text>
                  </View>
                  <View style={[styles.rolePill, !account.is_active && styles.rolePillMuted]}>
                    <Text style={styles.rolePillText}>
                      {account.is_active ? account.role : 'disabled'}
                    </Text>
                  </View>
                </View>
                <View style={styles.userActions}>
                  <View style={styles.roleOptions}>
                    {ROLES.map((option) => {
                      const selected = account.role === option;
                      return (
                        <Pressable
                          key={option}
                          accessibilityRole="button"
                          accessibilityLabel={`Make ${account.full_name ?? account.email ?? 'account'} a ${option}`}
                          accessibilityState={{ selected }}
                          disabled={busyKey === `role-${account.id}`}
                          onPress={() => handleRoleChange(account, option)}
                          style={[styles.roleOption, selected && styles.roleOptionActive]}
                        >
                          <Text
                            style={[styles.roleOptionText, selected && styles.roleOptionTextActive]}
                          >
                            {option}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      account.is_active
                        ? `Disable ${account.email ?? 'account'}`
                        : `Enable ${account.email ?? 'account'}`
                    }
                    disabled={busyKey === `active-${account.id}`}
                    onPress={() => handleToggleActive(account)}
                    style={[
                      styles.actionButton,
                      account.is_active ? styles.actionDanger : styles.actionSuccess,
                    ]}
                  >
                    <Text
                      style={[
                        styles.actionText,
                        account.is_active ? styles.actionDangerText : styles.actionSuccessText,
                      ]}
                    >
                      {account.is_active ? 'Disable' : 'Enable'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <IconTile name="calendar-outline" size={38} />
            <Text style={styles.cardTitle}>Manage events</Text>
          </View>
          <Text style={styles.hint}>Deleting an event removes its attendance records too.</Text>
          {events.length === 0 ? (
            <Text style={styles.emptyText}>No events found.</Text>
          ) : (
            events.map((event) => (
              <View key={event.eventId} style={styles.eventRow}>
                <View style={styles.eventCopy}>
                  <Text style={styles.eventTitle}>{event.title}</Text>
                  <Text style={styles.eventCode}>{event.eventCode}</Text>
                  {event.startTime ? (
                    <Text style={styles.eventMeta}>Starts {formatDate(event.startTime)}</Text>
                  ) : null}
                  <Text style={styles.eventMeta}>
                    {event.checkedIn} checked in - {event.expected} expected - {event.absent} absent
                  </Text>
                  {event.ownerName ? (
                    <Text style={styles.eventMeta}>Owned by {event.ownerName}</Text>
                  ) : null}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${event.title}`}
                  disabled={busyKey === `event-${event.eventId}`}
                  onPress={() => handleDeleteEvent(event)}
                  style={styles.iconButton}
                >
                  <Ionicons name="trash-outline" size={17} color={COLORS.danger} />
                </Pressable>
              </View>
            ))
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <IconTile name="checkmark-done-outline" size={38} />
            <Text style={styles.cardTitle}>Attendance records</Text>
          </View>
          <Text style={styles.hint}>
            Correct a status or remove a check-in. Showing {Math.min(records.length, MAX_VISIBLE_ROWS)}{' '}
            of {records.length} records.
          </Text>
          {records.length === 0 ? (
            <Text style={styles.emptyText}>No attendance records yet.</Text>
          ) : (
            records.slice(0, MAX_VISIBLE_ROWS).map((record) => (
              <View key={record.id} style={styles.attRow}>
                <View style={styles.attCopy}>
                  <Text style={styles.attEvent}>{record.student_name}</Text>
                  <Text style={styles.attMeta}>
                    {record.event_title} - {formatDate(record.scanned_at)}
                  </Text>
                </View>
                <StatusChip status={record.status} compact />
                <View style={styles.attActions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Mark ${record.student_name} present`}
                    disabled={busyKey === `att-${record.id}` || record.status === 'present'}
                    onPress={() => handleStatusChange(record, 'present')}
                    style={styles.attAction}
                  >
                    <Text style={styles.attActionText}>Present</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Mark ${record.student_name} late`}
                    disabled={busyKey === `att-${record.id}` || record.status === 'late'}
                    onPress={() => handleStatusChange(record, 'late')}
                    style={styles.attAction}
                  >
                    <Text style={styles.attActionText}>Late</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove the check-in for ${record.student_name}`}
                    disabled={busyKey === `att-${record.id}`}
                    onPress={() => handleDeleteRecord(record)}
                    style={styles.iconButton}
                  >
                    <Ionicons name="trash-outline" size={16} color={COLORS.danger} />
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <IconTile name="person-add-outline" size={38} />
            <Text style={styles.cardTitle}>Record a missed check-in</Text>
          </View>
          <Text style={styles.hint}>
            Pick an event, then mark the students who were there but were never scanned.
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {events.map((event) => {
              const selected = event.eventId === rosterEventId;
              return (
                <Pressable
                  key={event.eventId}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => void openRoster(event.eventId)}
                  style={[styles.filterChip, selected && styles.filterChipActive]}
                >
                  <Text
                    style={[styles.filterChipText, selected && styles.filterChipTextActive]}
                    numberOfLines={1}
                  >
                    {event.title}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          {!rosterEventId ? (
            <Text style={styles.emptyText}>Choose an event to see who was expected.</Text>
          ) : roster.length === 0 ? (
            <Text style={styles.emptyText}>This event has no expected students.</Text>
          ) : (
            roster.map((entry) => (
              <View key={entry.id} style={styles.attRow}>
                <View style={styles.attCopy}>
                  <Text style={styles.attEvent}>{entry.student_name}</Text>
                  <Text style={styles.attMeta}>
                    {entry.scanned
                      ? `Checked in - ${entry.status}`
                      : entry.student_id
                        ? 'Not checked in'
                        : 'No linked account'}
                  </Text>
                </View>
                {entry.scanned ? (
                  <StatusChip status={entry.status ?? 'present'} compact />
                ) : entry.student_id ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Mark ${entry.student_name} present`}
                    disabled={busyKey === `mark-${entry.id}`}
                    onPress={() => handleMarkPresent(entry)}
                    style={[styles.actionButton, styles.actionSuccess]}
                  >
                    <Text style={[styles.actionText, styles.actionSuccessText]}>Mark present</Text>
                  </Pressable>
                ) : null}
              </View>
            ))
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <IconTile name="document-text-outline" size={38} />
            <Text style={styles.cardTitle}>Attendance report</Text>
          </View>
          <Text style={styles.hint}>Per-student totals across every event on the system.</Text>
          {students.length === 0 ? (
            <Text style={styles.emptyText}>No student records yet.</Text>
          ) : (
            students.slice(0, MAX_VISIBLE_ROWS).map((student) => (
              <View key={student.studentId} style={styles.attRow}>
                <View style={styles.attCopy}>
                  <Text style={styles.attEvent}>{student.name}</Text>
                  <Text style={styles.attMeta}>
                    {student.present} present - {student.late} late - {student.absent} absent
                  </Text>
                </View>
                <Text style={styles.rateText}>{Math.round(student.rate * 100)}%</Text>
              </View>
            ))
          )}
          <View style={styles.reportActions}>
            <AppButton
              title="Export CSV"
              icon="download-outline"
              variant="secondary"
              onPress={() => void handleExport()}
            />
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <IconTile name="reader-outline" size={38} />
            <Text style={styles.cardTitle}>Audit log</Text>
          </View>
          {audit.length === 0 ? (
            <Text style={styles.emptyText}>No administrator actions recorded yet.</Text>
          ) : (
            audit.map((entry) => (
              <View key={entry.id} style={styles.auditRow}>
                <Text style={styles.auditAction}>{entry.action}</Text>
                <Text style={styles.auditMeta}>
                  {entry.actor_email ?? 'unknown'} - {formatDate(entry.created_at)}
                  {entry.details ? ` - ${entry.details}` : ''}
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatBox({
  label,
  value,
  icon,
}: {
  label: string;
  value: number | string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={styles.statBox}>
      <Ionicons name={icon} size={18} color={COLORS.primary} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
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
  noticeBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.presentSoft, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 11, marginTop: 16 },
  noticeText: { flex: 1, fontSize: 13, color: COLORS.present, marginLeft: 9 },
  card: { backgroundColor: COLORS.card, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, padding: 16, marginTop: 18 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 10 },
  cardTitle: { fontSize: 17, fontWeight: '800', color: COLORS.textPrimary },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginBottom: 10 },
  statBox: { flex: 1, backgroundColor: COLORS.surface, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, padding: 12, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: 18, fontWeight: '800', color: COLORS.primary, marginTop: 4 },
  statLabel: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2, textAlign: 'center' },
  userRow: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  userHead: { flexDirection: 'row', alignItems: 'center' },
  userCopy: { flex: 1, paddingRight: 10 },
  userName: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary },
  userEmail: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  userActions: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 8 },
  roleOptions: { flexDirection: 'row', flex: 1, gap: 6 },
  roleOption: { borderRadius: 999, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, paddingHorizontal: 10, paddingVertical: 6 },
  roleOptionActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  roleOptionText: { fontSize: 11, fontWeight: '800', color: COLORS.textSecondary, textTransform: 'capitalize' },
  roleOptionTextActive: { color: COLORS.textOnPrimary },
  rolePill: { backgroundColor: COLORS.primaryLight, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  rolePillMuted: { backgroundColor: COLORS.dangerSoft },
  rolePillText: { fontSize: 11, fontWeight: '800', color: COLORS.primaryDark, textTransform: 'capitalize' },
  actionButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
  actionDanger: { borderColor: 'rgba(239, 68, 68, 0.24)', backgroundColor: COLORS.dangerSoft },
  actionSuccess: { borderColor: 'rgba(22, 163, 74, 0.24)', backgroundColor: COLORS.presentSoft },
  actionText: { fontSize: 11, fontWeight: '800' },
  actionDangerText: { color: COLORS.danger },
  actionSuccessText: { color: COLORS.present },
  iconButton: { minWidth: 34, minHeight: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: COLORS.dangerSoft },
  eventRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  eventCopy: { flex: 1, paddingRight: 8 },
  eventTitle: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary },
  eventCode: { fontSize: 12, fontWeight: '700', color: COLORS.primary, marginTop: 2 },
  eventMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  attRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border, gap: 8 },
  attCopy: { flex: 1 },
  attEvent: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary },
  attMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  attActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  attAction: { borderRadius: 999, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, paddingHorizontal: 9, paddingVertical: 5 },
  attActionText: { fontSize: 11, fontWeight: '800', color: COLORS.primary },
  rateText: { fontSize: 13, fontWeight: '800', color: COLORS.primary },
  chipRow: { paddingVertical: 8, gap: 8 },
  filterChip: { maxWidth: 200, borderRadius: 999, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, paddingHorizontal: 12, paddingVertical: 7 },
  filterChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterChipText: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary },
  filterChipTextActive: { color: COLORS.textOnPrimary },
  reportActions: { marginTop: 12, alignItems: 'flex-start' },
  auditRow: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  auditAction: { fontSize: 13, fontWeight: '800', color: COLORS.textPrimary },
  auditMeta: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  hint: { fontSize: 12, color: COLORS.textSecondary, lineHeight: 18, marginBottom: 8 },
  emptyText: { fontSize: 13, color: COLORS.textSecondary, marginTop: 6 },
});