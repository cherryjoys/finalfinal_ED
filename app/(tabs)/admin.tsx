import Ionicons from '@expo/vector-icons/Ionicons';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import GradientScreen from '@/components/GradientScreen';
import { COLORS, STATUS, TINTS } from '@/constants/colors';
import { PRESSED, RADIUS, SHADOWS, SPACING, TEXT } from '@/constants/theme';
import {
  deleteAttendance,
  deleteEvent,
  getAdminUsers,
  getAllEvents,
  getOverallAttendance,
  getSystemReport,
  listAuditLog,
  logAdminAction,
  reportToCsv,
  setUserActive,
  updateAttendanceStatus,
  updateUserRole,
  type AdminAttendanceRecord,
  type AdminUser,
  type AuditEntry,
  type SystemReport,
} from '@/lib/admin';
import { useAuth } from '@/lib/auth';
import {
  createEvent,
  updateEvent,
  type CloudEvent,
  type EventStatus,
} from '@/lib/events';
import type { AttendanceStatus } from '@/lib/attendance';
import type { Role } from '@/lib/profiles';
import { buildQRPayload } from '@/lib/qr';
import { useRole } from '@/lib/useRole';

const GLASS = 'rgba(255, 255, 255, 0.72)';
const GLASS_SOFT = 'rgba(255, 255, 255, 0.38)';
const GLASS_BORDER = 'rgba(255, 255, 255, 0.65)';
const ON_GRADIENT = 'rgba(255, 255, 255, 0.82)';

type AdminTab = 'overview' | 'users' | 'events' | 'attendance' | 'reports';

const TABS: { key: AdminTab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'overview', label: 'Overview', icon: 'stats-chart-outline' },
  { key: 'users', label: 'Users', icon: 'people-outline' },
  { key: 'events', label: 'Events', icon: 'calendar-outline' },
  { key: 'attendance', label: 'Attendance', icon: 'checkmark-done-outline' },
  { key: 'reports', label: 'Reports', icon: 'document-text-outline' },
];

const ROLE_OPTIONS: Role[] = ['student', 'teacher'];
const ROLE_LABELS: Record<Role, string> = {
  student: 'Student',
  teacher: 'Teacher',
  admin: 'Admin',
};

const ATTENDANCE_OPTIONS: AttendanceStatus[] = ['present', 'late', 'absent'];

function AdminScreenInner() {
  const { user } = useAuth();
  const { role, loading: roleLoading } = useRole();
  const [tab, setTab] = useState<AdminTab>('overview');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [events, setEvents] = useState<CloudEvent[]>([]);
  const [records, setRecords] = useState<AdminAttendanceRecord[]>([]);
  const [report, setReport] = useState<SystemReport | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creatingEvent, setCreatingEvent] = useState(false);
  const [qrPayload, setQrPayload] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState<CloudEvent | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftCode, setDraftCode] = useState('');
  const [draftVenue, setDraftVenue] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftStart, setDraftStart] = useState(() => new Date());
  const [draftEnd, setDraftEnd] = useState(
    () => new Date(Date.now() + 60 * 60 * 1000)
  );
  const [pickerTarget, setPickerTarget] = useState<'start' | 'end' | null>(
    null
  );
  const [pickerPart, setPickerPart] = useState<'date' | 'time'>('date');

  const loadAll = useCallback(async () => {
    if (role !== 'admin') {
      setLoading(false);
      return;
    }

    setLoading(true);
    const [nextUsers, nextEvents, nextRecords] = await Promise.all([
      getAdminUsers(),
      getAllEvents(),
      getOverallAttendance(),
    ]);
    setUsers(nextUsers);
    setEvents(nextEvents);
    setRecords(nextRecords);
    setLoading(false);
  }, [role]);

  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [loadAll])
  );

  const loadReport = useCallback(async () => {
    if (role !== 'admin') return;

    setReportLoading(true);
    setReportError(null);
    try {
      const [nextReport, nextAudit] = await Promise.all([
        getSystemReport(),
        listAuditLog(50),
      ]);
      setReport(nextReport);
      setAudit(nextAudit);
    } catch (error) {
      setReportError(
        error instanceof Error ? error.message : 'Could not generate the report.'
      );
    } finally {
      setReportLoading(false);
    }
  }, [role]);

  useEffect(() => {
    if (tab === 'reports') {
      loadReport();
    }
  }, [tab, loadReport]);

  const handleChangeRole = (target: AdminUser, nextRole: Role) => {
    if (target.role === nextRole) return;
    if (nextRole === 'admin') {
      Alert.alert(
        'Not allowed',
        'The administrator account is created in advance. New administrators cannot be created.'
      );
      return;
    }
    if (target.role === 'admin') {
      Alert.alert(
        'Not allowed',
        'The administrator account cannot be demoted or changed.'
      );
      return;
    }

    Alert.alert(
      'Change user role',
      `Set ${target.full_name || target.email} as ${ROLE_LABELS[nextRole]}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setBusyId(target.id);
            const { error } = await updateUserRole(target.id, nextRole);
            setBusyId(null);

            if (error) {
              Alert.alert('Error', error);
              return;
            }

            setUsers((prev) =>
              prev.map((item) =>
                item.id === target.id ? { ...item, role: nextRole } : item
              )
            );
            void logAdminAction(
              'user.role_changed',
              'profile',
              target.id,
              `${target.role} -> ${nextRole}`
            );
          },
        },
      ]
    );
  };

  const handleToggleActive = (target: AdminUser) => {
    if (target.role === 'admin') {
      Alert.alert(
        'Not allowed',
        'The administrator account must remain active.'
      );
      return;
    }
    if (target.id === user?.id) {
      Alert.alert('Not allowed', 'You cannot deactivate your own account.');
      return;
    }

    const nextActive = !target.is_active;
    Alert.alert(
      nextActive ? 'Activate account?' : 'Deactivate account?',
      nextActive
        ? `${target.full_name || target.email} will be able to sign in again.`
        : `${target.full_name || target.email} will be blocked from signing in and recording attendance.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: nextActive ? 'Activate' : 'Deactivate',
          style: nextActive ? 'default' : 'destructive',
          onPress: async () => {
            setBusyId(target.id);
            const { error } = await setUserActive(target.id, nextActive);
            setBusyId(null);

            if (error) {
              Alert.alert('Error', error);
              return;
            }

            setUsers((prev) =>
              prev.map((item) =>
                item.id === target.id
                  ? { ...item, is_active: nextActive }
                  : item
              )
            );
            void logAdminAction(
              nextActive ? 'user.activated' : 'user.deactivated',
              'profile',
              target.id,
              target.email ?? undefined
            );
          },
        },
      ]
    );
  };

  const handleToggleEvent = async (event: CloudEvent) => {
    const nextStatus: EventStatus =
      (event.status ?? 'open') === 'closed' ? 'open' : 'closed';

    setBusyId(event.id);
    const { error } = await updateEvent(event.id, { status: nextStatus });
    setBusyId(null);

    if (error) {
      Alert.alert('Error', error);
      return;
    }

    setEvents((prev) =>
      prev.map((item) =>
        item.id === event.id ? { ...item, status: nextStatus } : item
      )
    );
    void logAdminAction(
      'event.status_changed',
      'event',
      event.id,
      `${event.status ?? 'open'} -> ${nextStatus}`
    );
  };

  const handleDeleteEvent = (event: CloudEvent) => {
    Alert.alert(
      'Delete event?',
      `"${event.title}" and its attendance records will be permanently removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setBusyId(event.id);
            const { error } = await deleteEvent(event.id);
            setBusyId(null);

            if (error) {
              Alert.alert('Error', error);
              return;
            }

            setEvents((prev) =>
              prev.filter(
                (item) =>
                  item.id !== event.id &&
                  item.event_code !== event.event_code
              )
            );
            setRecords((prev) =>
              prev.filter(
                (item) =>
                  item.eventId !== event.id &&
                  item.eventCode !== event.event_code
              )
            );
            void logAdminAction(
              'event.deleted',
              'event',
              event.id,
              `${event.title} (${event.event_code})`
            );
          },
        },
      ]
    );
  };

  const handleShowQr = (event: CloudEvent) => {
    setQrPayload(
      buildQRPayload({
        eventId: event.event_code,
        title: event.title,
        start: event.start_time ?? undefined,
        end: event.end_time ?? undefined,
      })
    );
  };

  const handleStartCreateEvent = () => {
    setCreatingEvent(true);
    setQrPayload(null);
    setEditingEvent(null);
    setDraftTitle('');
    setDraftCode('');
    setDraftVenue('');
    setDraftDescription('');
    setDraftStart(new Date());
    setDraftEnd(new Date(Date.now() + 60 * 60 * 1000));
    setPickerTarget(null);
    setPickerPart('date');
  };

  const handleStartEditEvent = (event: CloudEvent) => {
    setCreatingEvent(false);
    setQrPayload(null);
    setEditingEvent(event);
    setDraftTitle(event.title);
    setDraftCode(event.event_code);
    setDraftVenue(event.venue ?? '');
    setDraftDescription(event.description ?? '');
    setDraftStart(
      event.start_time ? new Date(event.start_time) : new Date()
    );
    setDraftEnd(
      event.end_time
        ? new Date(event.end_time)
        : new Date(Date.now() + 60 * 60 * 1000)
    );
    setPickerTarget(null);
    setPickerPart('date');
  };

  const handleCancelEventForm = () => {
    setCreatingEvent(false);
    setEditingEvent(null);
    setPickerTarget(null);
    setPickerPart('date');
  };

  const handlePickerChange = (
    event: DateTimePickerEvent,
    selected?: Date
  ) => {
    if (!pickerTarget) return;
    if (event.type === 'dismissed' || !selected) {
      setPickerTarget(null);
      setPickerPart('date');
      return;
    }

    const current = pickerTarget === 'start' ? draftStart : draftEnd;
    const next = new Date(current);
    next.setFullYear(
      selected.getFullYear(),
      selected.getMonth(),
      selected.getDate()
    );
    next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);

    if (pickerTarget === 'start') setDraftStart(next);
    else setDraftEnd(next);

    if (Platform.OS === 'android' && pickerPart === 'date') {
      setPickerPart('time');
    } else {
      setPickerTarget(null);
      setPickerPart('date');
    }
  };

  const handleSaveEventForm = async () => {
    if (!creatingEvent && !editingEvent) return;

    if (!draftTitle.trim()) {
      Alert.alert('Missing title', 'Please enter an event title.');
      return;
    }

    if (creatingEvent && !draftCode.trim()) {
      Alert.alert('Missing event code', 'Please enter an event code.');
      return;
    }

    if (draftEnd.getTime() <= draftStart.getTime()) {
      Alert.alert('Invalid schedule', 'End time must be after start time.');
      return;
    }

    const nextTitle = draftTitle.trim();
    const nextStart = draftStart.toISOString();
    const nextEnd = draftEnd.toISOString();
    const nextVenue = draftVenue.trim();
    const nextDescription = draftDescription.trim();

    if (creatingEvent) {
      setBusyId('new-event');
      const { error } = await createEvent({
        eventId: draftCode.trim(),
        title: nextTitle,
        start: nextStart,
        end: nextEnd,
        venue: nextVenue,
        description: nextDescription,
      });
      setBusyId(null);

      if (error) {
        Alert.alert('Error', error);
        return;
      }

      void logAdminAction(
        'event.created',
        'event',
        draftCode.trim(),
        nextTitle
      );
      handleCancelEventForm();
      await loadAll();
      return;
    }

    if (!editingEvent) return;

    setBusyId(editingEvent.id);

    const { error } = await updateEvent(editingEvent.id, {
      title: nextTitle,
      start_time: nextStart,
      end_time: nextEnd,
      venue: nextVenue,
      description: nextDescription,
    });
    setBusyId(null);

    if (error) {
      Alert.alert('Error', error);
      return;
    }

    setEvents((prev) =>
      prev.map((item) =>
        item.id === editingEvent.id
          ? {
              ...item,
              title: nextTitle,
              start_time: nextStart,
              end_time: nextEnd,
              venue: nextVenue,
              description: nextDescription,
            }
          : item
      )
    );
    void logAdminAction(
      'event.updated',
      'event',
      editingEvent.id,
      nextTitle
    );
    handleCancelEventForm();
  };

  const handleAttendanceStatus = async (
    record: AdminAttendanceRecord,
    status: AttendanceStatus
  ) => {
    if (record.status === status) return;

    setBusyId(record.id);
    const { error } = await updateAttendanceStatus(record.id, status);
    setBusyId(null);

    if (error) {
      Alert.alert('Error', error);
      return;
    }

    if (status === 'absent') {
      setRecords((prev) =>
        prev.filter(
          (item) =>
            !(
              item.id === record.id ||
              (item.studentId === record.studentId &&
                item.eventCode === record.eventCode)
            )
        )
      );
    } else {
      setRecords((prev) =>
        prev.map((item) =>
          item.id === record.id ? { ...item, status } : item
        )
      );
    }
    void logAdminAction(
      'attendance.corrected',
      'attendance',
      record.id,
      `${record.studentName} / ${record.eventCode}: ${record.status} -> ${status}`
    );
  };

  const handleDeleteAttendance = (record: AdminAttendanceRecord) => {
    Alert.alert(
      'Delete attendance record?',
      'This correction cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setBusyId(record.id);
            const { error } = await deleteAttendance(record.id);
            setBusyId(null);

            if (error) {
              Alert.alert('Error', error);
              return;
            }

            setRecords((prev) =>
              prev.filter(
                (item) =>
                  item.id !== record.id &&
                  !(
                    item.studentId === record.studentId &&
                    item.eventCode === record.eventCode
                  )
              )
            );
            void logAdminAction(
              'attendance.deleted',
              'attendance',
              record.id,
              `${record.studentName} / ${record.eventCode}`
            );
          },
        },
      ]
    );
  };

  const handleShareReport = async () => {
    if (!report) return;

    const csv = reportToCsv(report);
    if (Platform.OS === 'web') {
      Alert.alert(
        'CSV report',
        'CSV sharing is available in the mobile app. Use the report below to review the data.'
      );
      return;
    }

    try {
      await Share.share({
        title: 'QR-ATT attendance report',
        message: csv,
      });
    } catch {
      Alert.alert('Error', 'Could not share the attendance report.');
    }
  };

  if (roleLoading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Text style={styles.lockedTitle}>Checking your account...</Text>
      </View>
    );
  }

  if (role !== 'admin') {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <View style={styles.stateCard}>
          <View style={styles.stateIcon}>
            <Ionicons name="shield-outline" size={44} color={COLORS.primary} />
          </View>
          <Text style={styles.lockedTitle}>Admins Only</Text>
          <Text style={styles.lockedSubtitle}>
            Administrator accounts can manage users, events, and attendance.
          </Text>
        </View>
      </View>
    );
  }

  const openEvents = events.filter((event) => (event.status ?? 'open') === 'open');
  const reportMap = new Map<
    string,
    { title: string; eventCode: string; count: number }
  >();
  for (const record of records) {
    const existing = reportMap.get(record.eventId);
    if (existing) {
      existing.count += 1;
    } else {
      reportMap.set(record.eventId, {
        title: record.eventTitle,
        eventCode: record.eventCode,
        count: 1,
      });
    }
  }
  const eventReport = Array.from(reportMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const isEventFormBusy = busyId === (editingEvent?.id ?? 'new-event');

  const renderEventForm = (mode: 'create' | 'edit') => (
    <>
      <Text style={styles.cardTitle}>
        {mode === 'create' ? 'Create event' : 'Edit event'}
      </Text>

      <Text style={styles.editLabel}>Event title</Text>
      <TextInput
        style={styles.editInput}
        value={draftTitle}
        onChangeText={setDraftTitle}
        placeholder="Event title"
        placeholderTextColor={COLORS.textSecondary}
        editable={!isEventFormBusy}
      />

      <Text style={styles.editLabel}>Event code</Text>
      {mode === 'create' ? (
        <TextInput
          style={styles.editInput}
          value={draftCode}
          onChangeText={setDraftCode}
          placeholder="e.g. EVT-2026-0002"
          placeholderTextColor={COLORS.textSecondary}
          autoCapitalize="characters"
          editable={!isEventFormBusy}
        />
      ) : (
        <View style={styles.editReadOnly}>
          <Text style={styles.editReadOnlyText}>{draftCode}</Text>
        </View>
      )}

      <Text style={styles.editLabel}>Venue</Text>
      <TextInput
        style={styles.editInput}
        value={draftVenue}
        onChangeText={setDraftVenue}
        placeholder="e.g. School Gymnasium"
        placeholderTextColor={COLORS.textSecondary}
        editable={!isEventFormBusy}
      />

      <Text style={styles.editLabel}>Description</Text>
      <TextInput
        style={[styles.editInput, styles.editInputMultiline]}
        value={draftDescription}
        onChangeText={setDraftDescription}
        placeholder="Short details about the event"
        placeholderTextColor={COLORS.textSecondary}
        multiline
        editable={!isEventFormBusy}
      />

      <Text style={styles.editLabel}>Starts</Text>
      <Pressable
        style={({ pressed }) => [styles.editDateChip, pressed && PRESSED]}
        onPress={() => {
          setPickerTarget('start');
          setPickerPart('date');
        }}
      >
        <Ionicons name="sunny-outline" size={16} color={COLORS.primary} />
        <Text style={styles.editDateText}>{formatDateTime(draftStart)}</Text>
      </Pressable>

      <Text style={styles.editLabel}>Ends</Text>
      <Pressable
        style={({ pressed }) => [styles.editDateChip, pressed && PRESSED]}
        onPress={() => {
          setPickerTarget('end');
          setPickerPart('date');
        }}
      >
        <Ionicons name="moon-outline" size={16} color={COLORS.primary} />
        <Text style={styles.editDateText}>{formatDateTime(draftEnd)}</Text>
      </Pressable>

      {pickerTarget && (
        <View style={styles.pickerContainer}>
          <DateTimePicker
            value={pickerTarget === 'start' ? draftStart : draftEnd}
            mode={Platform.OS === 'android' ? pickerPart : 'datetime'}
            display={Platform.OS === 'android' ? 'default' : 'spinner'}
            onChange={handlePickerChange}
          />
        </View>
      )}

      <View style={styles.chipsRow}>
        <ActionChip
          icon="save-outline"
          label={isEventFormBusy ? 'Saving...' : 'Save'}
          onPress={handleSaveEventForm}
          disabled={isEventFormBusy}
        />
        <ActionChip
          icon="close-outline"
          label="Cancel"
          onPress={handleCancelEventForm}
          disabled={isEventFormBusy}
        />
      </View>
    </>
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>Admin Dashboard</Text>
      <Text style={styles.subtitle}>
        Campus-wide users, events, attendance, and reports.
      </Text>

      <View style={styles.tabBar}>
        {TABS.map((item) => {
          const active = tab === item.key;
          return (
            <Pressable
              key={item.key}
              style={({ pressed }) => [
                styles.tabChip,
                active && styles.tabChipActive,
                pressed && PRESSED,
              ]}
              onPress={() => setTab(item.key)}
            >
              <Ionicons
                name={item.icon}
                size={15}
                color={active ? TINTS.white : COLORS.textPrimary}
              />
              <Text
                style={[styles.tabText, active && styles.tabTextActive]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <ActivityIndicator color={COLORS.primary} style={styles.loader} />
      ) : (
        <>
          {tab === 'overview' && (
            <>
              <View style={styles.statsGrid}>
                <StatCard
                  icon="people"
                  label="Users"
                  value={users.length}
                />
                <StatCard
                  icon="calendar"
                  label="Events"
                  value={events.length}
                />
                <StatCard
                  icon="checkmark-done"
                  label="Attendance"
                  value={records.length}
                />
                <StatCard
                  icon="lock-open"
                  label="Open Events"
                  value={openEvents.length}
                />
              </View>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>Users by role</Text>
                <ReportRow label="Students" value={countRole(users, 'student')} />
                <ReportRow label="Teachers" value={countRole(users, 'teacher')} />
                <ReportRow label="Administrators" value={countRole(users, 'admin')} />
              </View>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>Attendance report</Text>
                {eventReport.length === 0 ? (
                  <Text style={styles.emptyLine}>
                    No attendance records yet.
                  </Text>
                ) : (
                  eventReport.map((item) => (
                    <ReportRow
                      key={item.eventCode}
                      label={`${item.title} (${item.eventCode})`}
                      value={item.count}
                    />
                  ))
                )}
              </View>
            </>
          )}

          {tab === 'users' && (
            <>
              {users.length === 0 ? (
                <EmptyState
                  icon="people-outline"
                  text="No user profiles found."
                />
              ) : (
                users.map((item) => {
                  const isSelf = item.id === user?.id;
                  return (
                    <View key={item.id} style={styles.card}>
                      <View style={styles.rowTop}>
                        <View style={styles.avatar}>
                          <Ionicons
                            name={
                              item.role === 'admin'
                                ? 'shield-checkmark'
                                : item.role === 'teacher'
                                  ? 'school'
                                  : 'person'
                            }
                            size={18}
                            color={COLORS.primary}
                          />
                        </View>
                        <View style={styles.rowBody}>
                          <Text style={styles.rowTitle}>
                            {item.full_name || 'Unnamed user'}
                            {isSelf ? ' (you)' : ''}
                          </Text>
                          <Text style={styles.rowMeta}>{item.email}</Text>
                          <Text style={styles.rowMeta}>
                            Current role: {ROLE_LABELS[item.role]}
                          </Text>
                        </View>
                      </View>

                      {item.role === 'admin' ? (
                        <View style={styles.chipsRow}>
                          <View
                            style={[
                              styles.statusBadge,
                              styles.statusOpen,
                            ]}
                          >
                            <Text
                              style={[
                                styles.statusText,
                                styles.statusTextOpen,
                              ]}
                            >
                              Protected administrator
                            </Text>
                          </View>
                        </View>
                      ) : (
                        <View style={styles.chipsRow}>
                          {ROLE_OPTIONS.map((option) => {
                            const active = item.role === option;
                            return (
                              <Pressable
                                key={option}
                                style={({ pressed }) => [
                                  styles.roleChip,
                                  active && styles.roleChipActive,
                                  pressed && PRESSED,
                                ]}
                                onPress={() => handleChangeRole(item, option)}
                                disabled={active || busyId === item.id}
                              >
                                <Text
                                  style={[
                                    styles.roleChipText,
                                    active && styles.roleChipTextActive,
                                  ]}
                                >
                                  {busyId === item.id
                                    ? 'Saving...'
                                    : ROLE_LABELS[option]}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      )}

                      <View style={styles.chipsRow}>
                        <View
                          style={[
                            styles.statusBadge,
                            item.is_active
                              ? styles.statusOpen
                              : styles.statusClosed,
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusText,
                              item.is_active
                                ? styles.statusTextOpen
                                : styles.statusTextClosed,
                            ]}
                          >
                            {item.is_active ? 'Active' : 'Disabled'}
                          </Text>
                        </View>
                        {item.role !== 'admin' && (
                          <ActionChip
                            icon={
                              item.is_active
                                ? 'pause-circle-outline'
                                : 'play-circle-outline'
                            }
                            label={
                              busyId === item.id
                                ? 'Saving...'
                                : item.is_active
                                  ? 'Deactivate'
                                  : 'Activate'
                            }
                            onPress={() => handleToggleActive(item)}
                            disabled={busyId === item.id || isSelf}
                            danger={item.is_active}
                          />
                        )}
                      </View>
                    </View>
                  );
                })
              )}
            </>
          )}

          {tab === 'events' && (
            <>
              {!creatingEvent && !editingEvent && (
                <Pressable
                  style={({ pressed }) => [
                    styles.createEventButton,
                    pressed && PRESSED,
                  ]}
                  onPress={handleStartCreateEvent}
                >
                  <Ionicons
                    name="add-circle-outline"
                    size={20}
                    color={TINTS.white}
                  />
                  <Text style={styles.createEventText}>Create Event</Text>
                </Pressable>
              )}

              {qrPayload && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Event QR code</Text>
                  <View style={styles.qrBox}>
                    <QRCode value={qrPayload} size={200} />
                  </View>
                  <Text style={styles.qrPayloadText}>{qrPayload}</Text>
                  <View style={styles.chipsRow}>
                    <ActionChip
                      icon="close-outline"
                      label="Hide QR"
                      onPress={() => setQrPayload(null)}
                    />
                  </View>
                </View>
              )}

              {creatingEvent && (
                <View style={styles.card}>{renderEventForm('create')}</View>
              )}

              {events.length === 0 && !creatingEvent ? (
                <EmptyState
                  icon="calendar-outline"
                  text="No events have been created."
                />
              ) : (
                events.map((event) => {
                  const isOpen = (event.status ?? 'open') === 'open';
                  const isEditing = editingEvent?.id === event.id;

                  if (isEditing) {
                    return (
                      <View key={event.id} style={styles.card}>
                        {renderEventForm('edit')}
                      </View>
                    );
                  }

                  return (
                    <View key={event.id} style={styles.card}>
                      <View style={styles.rowTop}>
                        <View style={styles.avatar}>
                          <Ionicons
                            name="calendar"
                            size={18}
                            color={COLORS.primary}
                          />
                        </View>
                        <View style={styles.rowBody}>
                          <Text style={styles.rowTitle}>{event.title}</Text>
                          <Text style={styles.rowMeta}>{event.event_code}</Text>
                          <Text style={styles.rowMeta}>
                            {formatEventRange(event.start_time, event.end_time)}
                          </Text>
                          {event.venue ? (
                            <Text style={styles.rowMeta}>{event.venue}</Text>
                          ) : null}
                          {event.description ? (
                            <Text style={styles.rowMeta} numberOfLines={2}>
                              {event.description}
                            </Text>
                          ) : null}
                        </View>
                        <View
                          style={[
                            styles.statusBadge,
                            isOpen ? styles.statusOpen : styles.statusClosed,
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusText,
                              isOpen
                                ? styles.statusTextOpen
                                : styles.statusTextClosed,
                            ]}
                          >
                            {isOpen ? 'Open' : 'Closed'}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.chipsRow}>
                        <ActionChip
                          icon="qr-code-outline"
                          label="Show QR"
                          onPress={() => handleShowQr(event)}
                        />
                        <ActionChip
                          icon="create-outline"
                          label="Edit"
                          onPress={() => handleStartEditEvent(event)}
                          disabled={busyId === event.id}
                        />
                        <ActionChip
                          icon={
                            isOpen
                              ? 'lock-closed-outline'
                              : 'lock-open-outline'
                          }
                          label={
                            busyId === event.id
                              ? 'Updating...'
                              : isOpen
                                ? 'Close event'
                                : 'Reopen event'
                          }
                          onPress={() => handleToggleEvent(event)}
                          disabled={busyId === event.id}
                        />
                        <ActionChip
                          icon="trash-outline"
                          label="Delete"
                          onPress={() => handleDeleteEvent(event)}
                          disabled={busyId === event.id}
                          danger
                        />
                      </View>
                    </View>
                  );
                })
              )}
            </>
          )}

          {tab === 'attendance' && (
            <>
              {records.length === 0 ? (
                <EmptyState
                  icon="checkmark-done-outline"
                  text="No attendance records yet."
                />
              ) : (
                records.map((record) => (
                  <View key={record.id} style={styles.card}>
                    <View style={styles.rowTop}>
                      <View style={styles.avatar}>
                        <Ionicons
                          name="person"
                          size={18}
                          color={COLORS.primary}
                        />
                      </View>
                      <View style={styles.rowBody}>
                        <Text style={styles.rowTitle}>
                          {record.studentName ||
                            record.studentEmail ||
                            shortId(record.studentId)}
                        </Text>
                        <Text style={styles.rowMeta}>
                          {record.eventTitle} ({record.eventCode})
                        </Text>
                        <Text style={styles.rowMeta}>
                          {formatDate(record.scannedAt)}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.chipsRow}>
                      {ATTENDANCE_OPTIONS.map((option) => {
                        const active = record.status === option;
                        return (
                          <Pressable
                            key={option}
                            style={({ pressed }) => [
                              styles.statusChip,
                              active && {
                                backgroundColor: STATUS[option].bg,
                                borderColor: STATUS[option].fg,
                              },
                              pressed && PRESSED,
                            ]}
                            onPress={() =>
                              handleAttendanceStatus(record, option)
                            }
                            disabled={active || busyId === record.id}
                          >
                            <Text
                              style={[
                                styles.statusChipText,
                                active && { color: STATUS[option].fg },
                              ]}
                            >
                              {busyId === record.id
                                ? 'Saving...'
                                : option.charAt(0).toUpperCase() +
                                  option.slice(1)}
                            </Text>
                          </Pressable>
                        );
                      })}
                      <ActionChip
                        icon="trash-outline"
                        label="Delete"
                        onPress={() => handleDeleteAttendance(record)}
                        disabled={busyId === record.id}
                        danger
                      />
                    </View>
                  </View>
                ))
              )}
            </>
          )}

          {tab === 'reports' && (
            <>
              <View style={styles.chipsRow}>
                <ActionChip
                  icon="refresh-outline"
                  label={reportLoading ? 'Loading...' : 'Refresh report'}
                  onPress={loadReport}
                  disabled={reportLoading}
                />
                <ActionChip
                  icon="share-outline"
                  label="Share CSV"
                  onPress={handleShareReport}
                  disabled={!report}
                />
              </View>

              {reportLoading && !report ? (
                <ActivityIndicator
                  color={COLORS.primary}
                  style={styles.loader}
                />
              ) : reportError ? (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Report unavailable</Text>
                  <Text style={styles.emptyLine}>{reportError}</Text>
                </View>
              ) : report ? (
                <>
                  <View style={styles.statsGrid}>
                    <StatCard
                      icon="people"
                      label="Total users"
                      value={report.totals.users}
                    />
                    <StatCard
                      icon="checkmark-done"
                      label="Check-ins"
                      value={report.totals.checkIns}
                    />
                    <StatCard
                      icon="calendar"
                      label="Events"
                      value={report.totals.events}
                    />
                    <StatCard
                      icon="trending-up"
                      label="Attendance rate"
                      value={`${Math.round(report.totals.attendanceRate * 100)}%`}
                    />
                  </View>

                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>Attendance breakdown</Text>
                    <Text style={styles.rowMeta}>
                      Generated {formatDate(report.generatedAt)}
                    </Text>
                    <ReportRow label="Present" value={report.totals.present} />
                    <ReportRow label="Late" value={report.totals.late} />
                    <ReportRow label="Absent" value={report.totals.absent} />
                    <ReportRow
                      label="Students checked in"
                      value={report.totals.uniqueStudents}
                    />
                    <ReportRow
                      label="Active accounts"
                      value={report.totals.activeUsers}
                    />
                    <ReportRow
                      label="Disabled accounts"
                      value={report.totals.disabledUsers}
                    />
                  </View>

                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>Events at a glance</Text>
                    {report.events.length === 0 ? (
                      <Text style={styles.emptyLine}>No events yet.</Text>
                    ) : (
                      report.events.slice(0, 8).map((event) => (
                        <ReportRow
                          key={event.eventId}
                          label={`${event.title} - ${event.checkedIn}/${
                            event.expected || event.checkedIn
                          } checked in`}
                          value={`${Math.round(event.rate * 100)}%`}
                        />
                      ))
                    )}
                  </View>

                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>Top students</Text>
                    {report.students.length === 0 ? (
                      <Text style={styles.emptyLine}>
                        No student attendance data yet.
                      </Text>
                    ) : (
                      report.students.slice(0, 8).map((student) => (
                        <ReportRow
                          key={student.studentId}
                          label={`${student.name} - ${student.total} record${
                            student.total === 1 ? '' : 's'
                          }`}
                          value={`${Math.round(student.rate * 100)}%`}
                        />
                      ))
                    )}
                  </View>

                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>Recent admin activity</Text>
                    {audit.length === 0 ? (
                      <Text style={styles.emptyLine}>
                        No administrator actions recorded yet.
                      </Text>
                    ) : (
                      audit.slice(0, 10).map((entry) => (
                        <View key={entry.id} style={styles.auditRow}>
                          <Text style={styles.auditAction}>{entry.action}</Text>
                          <Text style={styles.rowMeta}>
                            {entry.actor_email || 'Administrator'} -{' '}
                            {formatDate(entry.created_at)}
                          </Text>
                          {entry.details ? (
                            <Text style={styles.rowMeta}>{entry.details}</Text>
                          ) : null}
                        </View>
                      ))
                    )}
                  </View>
                </>
              ) : (
                <EmptyState
                  icon="document-text-outline"
                  text="No report has been generated yet."
                />
              )}
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: number | string;
}) {
  return (
    <View style={styles.statCard}>
      <View style={styles.statIcon}>
        <Ionicons name={icon} size={18} color={COLORS.primary} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function ReportRow({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <View style={styles.reportRow}>
      <Text style={styles.reportLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.reportValue}>{value}</Text>
    </View>
  );
}

function EmptyState({
  icon,
  text,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
}) {
  return (
    <View style={styles.emptyCard}>
      <Ionicons name={icon} size={32} color={COLORS.primary} />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

function ActionChip({
  icon,
  label,
  onPress,
  disabled,
  danger,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.actionChip,
        danger && styles.actionChipDanger,
        pressed && PRESSED,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Ionicons
        name={icon}
        size={16}
        color={danger ? COLORS.danger : COLORS.primaryInk}
      />
      <Text
        style={[styles.actionText, danger && styles.actionTextDanger]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function countRole(users: AdminUser[], role: Role) {
  return users.filter((user) => user.role === role).length;
}

function shortId(id: string) {
  return id ? `…${id.slice(-8)}` : 'unknown';
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString();
}

function formatDateTime(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const month = date.toLocaleString('en-US', { month: 'short' });
  return `${month} ${pad(date.getDate())}, ${date.getFullYear()} at ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function formatEventRange(start: string | null, end: string | null) {
  if (!start && !end) return 'Schedule to be announced';

  const formatter = (value: string) =>
    new Date(value).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

  if (start && end) return `${formatter(start)} - ${formatter(end)}`;
  return formatter((start ?? end) as string);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  content: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xxxl,
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  title: {
    ...TEXT.display,
    color: '#FFFFFF',
    marginBottom: SPACING.xxs,
  },
  subtitle: {
    ...TEXT.meta,
    color: ON_GRADIENT,
    lineHeight: 21,
    marginBottom: SPACING.lg,
  },
  lockedTitle: {
    ...TEXT.title,
    textAlign: 'center',
    marginTop: SPACING.sm,
    marginBottom: SPACING.xxs,
  },
  lockedSubtitle: {
    ...TEXT.meta,
    textAlign: 'center',
    lineHeight: 21,
  },
  stateCard: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    borderRadius: RADIUS.card,
    padding: SPACING.xl,
    ...SHADOWS.card,
  },
  stateIcon: {
    width: 88,
    height: 88,
    borderRadius: RADIUS.pill,
    backgroundColor: TINTS.wash,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  tabBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: SPACING.md,
  },
  tabChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: GLASS,
    borderRadius: RADIUS.chip,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    marginRight: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  tabChipActive: {
    backgroundColor: COLORS.textPrimary,
    borderColor: COLORS.textPrimary,
  },
  tabText: {
    ...TEXT.chip,
    color: COLORS.textPrimary,
    marginLeft: 5,
  },
  tabTextActive: {
    color: TINTS.white,
  },
  loader: {
    marginVertical: SPACING.xl,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  statCard: {
    width: '48%',
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    borderRadius: RADIUS.card,
    padding: SPACING.lg,
    marginBottom: SPACING.sm,
    ...SHADOWS.card,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.pill,
    backgroundColor: TINTS.wash,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xs,
  },
  statValue: {
    ...TEXT.title,
  },
  statLabel: {
    ...TEXT.meta,
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
  cardTitle: {
    ...TEXT.cardTitle,
    marginBottom: SPACING.sm,
  },
  editLabel: {
    ...TEXT.label,
    marginBottom: SPACING.xs,
    marginTop: SPACING.sm,
  },
  editInput: {
    backgroundColor: TINTS.wash,
    borderRadius: RADIUS.field,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  editInputMultiline: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  editReadOnly: {
    backgroundColor: TINTS.washDeep,
    borderRadius: RADIUS.field,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  editReadOnlyText: {
    ...TEXT.body,
    fontWeight: '600',
  },
  qrBox: {
    alignItems: 'center',
    backgroundColor: TINTS.white,
    borderRadius: RADIUS.card,
    padding: SPACING.lg,
    marginTop: SPACING.sm,
  },
  qrPayloadText: {
    ...TEXT.hint,
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
  },
  editDateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TINTS.wash,
    borderRadius: RADIUS.field,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  editDateText: {
    ...TEXT.body,
    flex: 1,
    fontWeight: '600',
    marginLeft: SPACING.xs,
  },
  pickerContainer: {
    marginTop: SPACING.sm,
    alignItems: 'center',
  },
  reportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  reportLabel: {
    ...TEXT.body,
    flex: 1,
    paddingRight: SPACING.sm,
  },
  reportValue: {
    ...TEXT.cardTitle,
    color: COLORS.primaryInk,
  },
  auditRow: {
    paddingVertical: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  auditAction: {
    ...TEXT.body,
    fontWeight: '700',
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.pill,
    backgroundColor: TINTS.wash,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.sm,
  },
  rowBody: {
    flex: 1,
  },
  rowTitle: {
    ...TEXT.cardTitle,
    marginBottom: 2,
  },
  rowMeta: {
    ...TEXT.meta,
  },
  createEventButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#050505',
    borderRadius: RADIUS.pill,
    paddingVertical: SPACING.md,
    marginBottom: SPACING.md,
    ...SHADOWS.card,
  },
  createEventText: {
    ...TEXT.button,
    color: TINTS.white,
    marginLeft: SPACING.xs,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: SPACING.md,
  },
  roleChip: {
    backgroundColor: TINTS.wash,
    borderRadius: RADIUS.chip,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    marginRight: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  roleChipActive: {
    backgroundColor: COLORS.textPrimary,
    borderColor: COLORS.textPrimary,
  },
  roleChipText: {
    ...TEXT.chip,
    color: COLORS.textPrimary,
  },
  roleChipTextActive: {
    color: TINTS.white,
  },
  statusChip: {
    backgroundColor: TINTS.wash,
    borderRadius: RADIUS.chip,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    marginRight: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  statusChipText: {
    ...TEXT.chip,
    color: COLORS.textPrimary,
  },
  actionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TINTS.wash,
    borderRadius: RADIUS.chip,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    marginRight: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  actionChipDanger: {
    backgroundColor: STATUS.absent.bg,
  },
  actionText: {
    ...TEXT.chip,
    color: COLORS.primaryInk,
    marginLeft: 5,
  },
  actionTextDanger: {
    color: COLORS.danger,
  },
  statusBadge: {
    borderRadius: RADIUS.badge,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
    marginLeft: SPACING.xs,
  },
  statusOpen: {
    backgroundColor: 'rgba(31, 107, 71, 0.14)',
  },
  statusClosed: {
    backgroundColor: 'rgba(163, 42, 30, 0.12)',
  },
  statusText: {
    ...TEXT.badge,
  },
  statusTextOpen: {
    color: '#1F6B47',
  },
  statusTextClosed: {
    color: '#A32A1E',
  },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    borderRadius: RADIUS.card,
    padding: SPACING.xl,
    ...SHADOWS.card,
  },
  emptyText: {
    ...TEXT.meta,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: SPACING.sm,
  },
  emptyLine: {
    ...TEXT.meta,
  },
});


export default function AdminScreen() {
  return (
    <GradientScreen>
      <AdminScreenInner />
    </GradientScreen>
  );
}
