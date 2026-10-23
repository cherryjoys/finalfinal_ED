import Ionicons from '@expo/vector-icons/Ionicons';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import AppButton from '@/components/AppButton';
import GradientScreen from '@/components/GradientScreen';
import { COLORS, TINTS } from '@/constants/colors';
import { HIT, PRESSED, RADIUS, SHADOWS, SPACING, TEXT } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import {
  createEvent,
  getEventsByTeacher,
  updateEvent,
  type CloudEvent,
  type EventStatus,
} from '@/lib/events';
import { buildQRPayload } from '@/lib/qr';
import { useRole } from '@/lib/useRole';

const GLASS = 'rgba(255, 255, 255, 0.72)';
const GLASS_SOFT = 'rgba(255, 255, 255, 0.38)';
const GLASS_BORDER = 'rgba(255, 255, 255, 0.65)';
const ON_GRADIENT = 'rgba(255, 255, 255, 0.82)';

function toLocalISO(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:00`
  );
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

const QUICK_END_OPTIONS = [
  { label: '+30 min', ms: 30 * 60 * 1000 },
  { label: '+1 hour', ms: 60 * 60 * 1000 },
  { label: '+2 hours', ms: 2 * 60 * 60 * 1000 },
];

type EditTarget = 'start' | 'end';

function TeacherScreenInner() {
  const { user } = useAuth();
  const { role, loading: roleLoading } = useRole();
  const [title, setTitle] = useState('');
  const [eventId, setEventId] = useState('');
  const [venue, setVenue] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(() => new Date());
  const [endDate, setEndDate] = useState(
    () => new Date(Date.now() + 60 * 60 * 1000)
  );
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [editingPart, setEditingPart] = useState<'date' | 'time'>('date');
  const [payload, setPayload] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [events, setEvents] = useState<CloudEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [busyEventId, setBusyEventId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isAndroid = Platform.OS === 'android';
  const isEditing = editingEventId !== null;

  const loadEvents = useCallback(async () => {
    if (!user) {
      setEvents([]);
      setEventsLoading(false);
      return;
    }

    setEventsLoading(true);
    const list = await getEventsByTeacher(user.id);
    setEvents(list);
    setEventsLoading(false);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      if (role !== 'teacher') {
        setEventsLoading(false);
        return;
      }
      loadEvents();
    }, [role, loadEvents])
  );

  const resetForm = () => {
    setTitle('');
    setEventId('');
    setVenue('');
    setDescription('');
    setStartDate(new Date());
    setEndDate(new Date(Date.now() + 60 * 60 * 1000));
    setEditingEventId(null);
    setEditTarget(null);
    setEditingPart('date');
  };

  const openPicker = (target: EditTarget) => {
    setMessage(null);
    setEditTarget(target);
    setEditingPart('date');
  };

  const onPickerChange = (
    event: DateTimePickerEvent,
    selected?: Date
  ) => {
    if (!editTarget) return;
    if (event.type === 'dismissed' || !selected) {
      setEditTarget(null);
      setEditingPart('date');
      return;
    }

    const current = editTarget === 'start' ? startDate : endDate;
    const next = new Date(current);
    next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
    next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);

    if (editTarget === 'start') setStartDate(next);
    else setEndDate(next);

    if (isAndroid && editingPart === 'date') {
      setEditingPart('time');
    } else {
      setEditTarget(null);
      setEditingPart('date');
    }
  };

  const handleQuickEnd = (ms: number) => {
    setMessage(null);
    setEndDate(new Date(startDate.getTime() + ms));
  };

  const handleEditEvent = (event: CloudEvent) => {
    setEditingEventId(event.id);
    setTitle(event.title);
    setEventId(event.event_code);
    setVenue(event.venue ?? '');
    setDescription(event.description ?? '');
    setStartDate(
      event.start_time ? new Date(event.start_time) : new Date()
    );
    setEndDate(
      event.end_time
        ? new Date(event.end_time)
        : new Date(Date.now() + 60 * 60 * 1000)
    );
    setPayload(null);
    setMessage(null);
    setEditTarget(null);
    setEditingPart('date');
  };

  const handleCancelEdit = () => {
    resetForm();
    setMessage(null);
  };

  const handleSaveEvent = async () => {
    if (saving) return;

    const event = {
      eventId: eventId.trim(),
      title: title.trim(),
      start: toLocalISO(startDate),
      end: toLocalISO(endDate),
      venue: venue.trim(),
      description: description.trim(),
    };

    if (!event.eventId || !event.title) {
      setMessage('Event title and code are required.');
      return;
    }

    if (endDate.getTime() <= startDate.getTime()) {
      setMessage('End time must be after start time.');
      return;
    }

    setSaving(true);
    setMessage(null);

    if (editingEventId) {
      const { error } = await updateEvent(editingEventId, {
        title: event.title,
        start_time: event.start,
        end_time: event.end,
        venue: event.venue,
        description: event.description,
      });

      setSaving(false);

      if (error) {
        setMessage('Could not save the event. Please try again.');
        return;
      }

      resetForm();
      setMessage('Event updated.');
      await loadEvents();
      return;
    }

    const { error } = await createEvent(event);
    setSaving(false);

    if (error) {
      setMessage('Could not save the event. Please try again.');
      return;
    }

    resetForm();
    setMessage('Event saved! Scan the QR with the Scan tab to test it.');
    setPayload(buildQRPayload(event));
    await loadEvents();
  };

  const handleShowQR = (event: CloudEvent) => {
    setMessage(null);
    setPayload(
      buildQRPayload({
        eventId: event.event_code,
        title: event.title,
        start: event.start_time ?? undefined,
        end: event.end_time ?? undefined,
      })
    );
  };

  const handleToggleStatus = async (event: CloudEvent) => {
    const nextStatus: EventStatus =
      (event.status ?? 'open') === 'closed' ? 'open' : 'closed';

    setBusyEventId(event.id);
    setMessage(null);
    const { error } = await updateEvent(event.id, { status: nextStatus });
    setBusyEventId(null);

    if (error) {
      setMessage('Could not update the event status.');
      return;
    }

    setMessage(
      nextStatus === 'closed'
        ? `"${event.title}" is now closed.`
        : `"${event.title}" is open again.`
    );
    await loadEvents();
  };

  if (roleLoading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Text style={styles.lockedTitle}>Checking your account...</Text>
      </View>
    );
  }

  if (role !== 'teacher') {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <View style={styles.stateCard}>
          <View style={styles.stateIcon}>
            <Ionicons name="lock-closed-outline" size={44} color={COLORS.primary} />
          </View>
          <Text style={styles.lockedTitle}>Teachers Only</Text>
          <Text style={styles.lockedSubtitle}>
            Only teacher accounts can manage events.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>
        {isEditing ? 'Edit Event' : 'Create Event QR'}
      </Text>
      <Text style={styles.subtitle}>
        {isEditing
          ? 'Update the event details, then save your changes.'
          : 'Fill in the event details, then scan the generated QR with the Scan tab.'}
      </Text>

      <View style={styles.formCard}>
        <Text style={styles.label}>Event Title</Text>
        <View style={styles.inputWrap}>
          <Ionicons
            name="text-outline"
            size={18}
            color={COLORS.primary}
            style={styles.inputIcon}
          />
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Founders Day Assembly"
            placeholderTextColor={COLORS.textSecondary}
            editable={!saving}
          />
        </View>

        <Text style={styles.label}>Event Code</Text>
        <View style={[styles.inputWrap, isEditing && styles.inputWrapLocked]}>
          <Ionicons
            name="pricetag-outline"
            size={18}
            color={COLORS.primary}
            style={styles.inputIcon}
          />
          <TextInput
            style={styles.input}
            value={eventId}
            onChangeText={setEventId}
            placeholder="e.g. EVT-2026-0002"
            placeholderTextColor={COLORS.textSecondary}
            autoCapitalize="characters"
            editable={!saving && !isEditing}
          />
        </View>
        {isEditing && (
          <Text style={styles.hint}>
            Event codes stay fixed so existing QR codes keep working.
          </Text>
        )}

        <Text style={styles.label}>Venue</Text>
        <View style={styles.inputWrap}>
          <Ionicons
            name="location-outline"
            size={18}
            color={COLORS.primary}
            style={styles.inputIcon}
          />
          <TextInput
            style={styles.input}
            value={venue}
            onChangeText={setVenue}
            placeholder="e.g. School Gymnasium"
            placeholderTextColor={COLORS.textSecondary}
            editable={!saving}
          />
        </View>

        <Text style={styles.label}>Description</Text>
        <View style={[styles.inputWrap, styles.inputWrapMultiline]}>
          <Ionicons
            name="document-text-outline"
            size={18}
            color={COLORS.primary}
            style={styles.inputIcon}
          />
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            value={description}
            onChangeText={setDescription}
            placeholder="Short details about the event"
            placeholderTextColor={COLORS.textSecondary}
            multiline
            editable={!saving}
          />
        </View>

        <Text style={styles.label}>Starts</Text>
        <PickerField
          value={formatDateTime(startDate)}
          icon="sunny-outline"
          onPress={() => openPicker('start')}
        />

        <Text style={styles.label}>Ends</Text>
        <PickerField
          value={formatDateTime(endDate)}
          icon="moon-outline"
          onPress={() => openPicker('end')}
        />
        <View style={styles.chipRow}>
          {QUICK_END_OPTIONS.map((option) => (
            <Pressable
              key={option.label}
              style={styles.chip}
              onPress={() => handleQuickEnd(option.ms)}
              disabled={saving}
            >
              <Text style={styles.chipText}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.hint}>Tap a chip to set the end time from start.</Text>
      </View>

      {message && <Text style={styles.message}>{message}</Text>}

      <AppButton
        theme="primary"
        title={
          saving
            ? 'Saving...'
            : isEditing
              ? 'Save Changes'
              : 'Create Event'
        }
        icon={isEditing ? 'save-outline' : 'add-circle-outline'}
        onPress={handleSaveEvent}
      />

      {isEditing && (
        <AppButton
          title="Cancel Editing"
          icon="close-circle-outline"
          onPress={handleCancelEdit}
        />
      )}

      {editTarget && (
        <View style={styles.pickerContainer}>
          <DateTimePicker
            value={editTarget === 'start' ? startDate : endDate}
            mode={isAndroid ? editingPart : 'datetime'}
            display={isAndroid ? 'default' : 'spinner'}
            onChange={onPickerChange}
          />
        </View>
      )}

      {payload && (
        <View style={styles.resultCard}>
          <Text style={styles.resultTitle}>
            Scan this QR code with the Scan tab:
          </Text>
          <View style={styles.qrBox}>
            <QRCode value={payload} size={200} />
          </View>
          <Text style={styles.payloadText}>{payload}</Text>
          <Pressable
            style={({ pressed }) => [styles.linkButton, pressed && PRESSED]}
            onPress={() => setPayload(null)}
          >
            <Text style={styles.linkButtonText}>Hide QR</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.listHeader}>
        <Text style={styles.sectionTitle}>My Events</Text>
        {!eventsLoading && (
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{events.length}</Text>
          </View>
        )}
      </View>

      {eventsLoading ? (
        <ActivityIndicator color={COLORS.primary} style={styles.loader} />
      ) : events.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="calendar-outline" size={32} color={COLORS.primary} />
          <Text style={styles.emptyText}>
            No events yet. Create one above to generate its QR code.
          </Text>
        </View>
      ) : (
        events.map((event) => {
          const status = event.status ?? 'open';
          const isOpen = status === 'open';

          return (
            <View key={event.id} style={styles.eventCard}>
              <View style={styles.eventTop}>
                <View style={styles.eventHeading}>
                  <Text style={styles.eventTitle}>{event.title}</Text>
                  <Text style={styles.eventMeta}>{event.event_code}</Text>
                  {event.venue ? (
                    <Text style={styles.eventMeta}>{event.venue}</Text>
                  ) : null}
                  {event.description ? (
                    <Text style={styles.eventMeta} numberOfLines={2}>
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
                      isOpen ? styles.statusTextOpen : styles.statusTextClosed,
                    ]}
                  >
                    {isOpen ? 'Open' : 'Closed'}
                  </Text>
                </View>
              </View>

              <Text style={styles.eventMeta}>
                {formatEventRange(event.start_time, event.end_time)}
              </Text>

              <View style={styles.actionRow}>
                <Pressable
                  style={({ pressed }) => [styles.actionChip, pressed && PRESSED]}
                  onPress={() => handleEditEvent(event)}
                >
                  <Ionicons name="create-outline" size={16} color={COLORS.primaryInk} />
                  <Text style={styles.actionText}>Edit</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.actionChip, pressed && PRESSED]}
                  onPress={() => handleShowQR(event)}
                >
                  <Ionicons name="qr-code-outline" size={16} color={COLORS.primaryInk} />
                  <Text style={styles.actionText}>Show QR</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.actionChip, pressed && PRESSED]}
                  onPress={() => handleToggleStatus(event)}
                  disabled={busyEventId === event.id}
                >
                  <Ionicons
                    name={isOpen ? 'lock-closed-outline' : 'lock-open-outline'}
                    size={16}
                    color={COLORS.primaryInk}
                  />
                  <Text style={styles.actionText}>
                    {busyEventId === event.id
                      ? 'Updating...'
                      : isOpen
                        ? 'Close'
                        : 'Reopen'}
                  </Text>
                </Pressable>
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

type PickerFieldProps = {
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
};

function PickerField({ value, icon, onPress }: PickerFieldProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.pickerField, pressed && styles.pickerFieldPressed]}
      onPress={onPress}
    >
      <Ionicons name={icon} size={20} color={COLORS.primary} />
      <Text style={styles.pickerValue}>{value}</Text>
      <Ionicons name="calendar-outline" size={18} color={COLORS.textSecondary} />
    </Pressable>
  );
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
  formCard: {
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    borderRadius: RADIUS.card,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    ...SHADOWS.card,
  },
  label: {
    ...TEXT.label,
    marginBottom: SPACING.xs,
    marginTop: SPACING.md,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TINTS.wash,
    borderRadius: RADIUS.field,
    paddingHorizontal: SPACING.md,
    minHeight: HIT.min + 8,
  },
  inputWrapLocked: {
    backgroundColor: TINTS.washDeep,
  },
  inputWrapMultiline: {
    alignItems: 'flex-start',
    paddingTop: SPACING.sm,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textPrimary,
    paddingVertical: SPACING.sm,
  },
  inputMultiline: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  inputIcon: {
    marginRight: SPACING.xs,
  },
  pickerField: {
    backgroundColor: TINTS.wash,
    borderRadius: RADIUS.field,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    minHeight: HIT.min + 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pickerFieldPressed: {
    backgroundColor: TINTS.washDeep,
    opacity: 0.9,
  },
  pickerValue: {
    flex: 1,
    ...TEXT.body,
    fontWeight: '600',
    marginHorizontal: SPACING.sm,
  },
  chipRow: {
    flexDirection: 'row',
    marginTop: SPACING.sm,
  },
  chip: {
    minHeight: HIT.min,
    justifyContent: 'center',
    backgroundColor: GLASS,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.chip,
    paddingHorizontal: SPACING.md,
    marginRight: SPACING.xs,
  },
  chipText: {
    ...TEXT.chip,
    color: COLORS.primaryInk,
  },
  hint: {
    ...TEXT.hint,
    marginTop: SPACING.xs,
  },
  pickerContainer: {
    marginTop: SPACING.sm,
    alignItems: 'center',
  },
  message: {
    ...TEXT.chip,
    color: COLORS.primaryInk,
    textAlign: 'center',
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
    backgroundColor: TINTS.wash,
    borderRadius: RADIUS.chip,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    overflow: 'hidden',
  },
  resultCard: {
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    borderRadius: RADIUS.card,
    padding: SPACING.xl,
    marginTop: SPACING.lg,
    alignItems: 'center',
    ...SHADOWS.card,
  },
  resultTitle: {
    ...TEXT.cardTitle,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  qrBox: {
    backgroundColor: TINTS.white,
    padding: SPACING.lg,
    borderRadius: RADIUS.tile,
    marginBottom: SPACING.md,
    borderWidth: 2,
    borderColor: TINTS.wash,
  },
  payloadText: {
    ...TEXT.hint,
    textAlign: 'center',
    lineHeight: 18,
  },
  linkButton: {
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  linkButtonText: {
    ...TEXT.chip,
    color: COLORS.primaryInk,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.xl,
    marginBottom: SPACING.sm,
  },
  sectionTitle: {
    ...TEXT.section,
    flex: 1,
  },
  countBadge: {
    minWidth: 30,
    paddingHorizontal: SPACING.xs,
    paddingVertical: 4,
    borderRadius: RADIUS.badge,
    backgroundColor: COLORS.primaryInk,
    alignItems: 'center',
  },
  countBadgeText: {
    ...TEXT.badge,
    color: TINTS.white,
  },
  loader: {
    marginVertical: SPACING.lg,
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
  eventCard: {
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    borderRadius: RADIUS.card,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    ...SHADOWS.card,
  },
  eventTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: SPACING.xxs,
  },
  eventHeading: {
    flex: 1,
    paddingRight: SPACING.sm,
  },
  eventTitle: {
    ...TEXT.cardTitle,
    marginBottom: 2,
  },
  eventMeta: {
    ...TEXT.meta,
  },
  statusBadge: {
    borderRadius: RADIUS.badge,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
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
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: SPACING.md,
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
  actionText: {
    ...TEXT.chip,
    color: COLORS.primaryInk,
    marginLeft: 5,
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
});


export default function TeacherScreen() {
  return (
    <GradientScreen>
      <TeacherScreenInner />
    </GradientScreen>
  );
}
