import { supabase } from './supabase';
import { parseQRPayload } from './qr';
import { DEFAULT_LATE_AFTER_MINUTES, getEventByCode } from './events';
import type { StatusKey } from '@/constants/icons';

/** A scan can only ever be present or late. */
export type ScannedStatus = Exclude<StatusKey, 'absent'>;
/** Roster rows without a scan are absent, so all three can appear in a list. */
export type AttendanceStatus = StatusKey;

export type AttendanceRecord = {
  id: string;
  eventId: string;
  eventTitle: string;
  scannedAt: string;
  status: ScannedStatus;
};

export type RegisterResult = {
  success: boolean;
  message: string;
  eventTitle?: string;
  status?: ScannedStatus;
};

export type AttendanceEntry = {
  key: string;
  studentId: string | null;
  studentName: string;
  status: AttendanceStatus;
  scannedAt: string | null;
};

export type AttendanceCounts = {
  presentCount: number;
  lateCount: number;
  absentCount: number;
  checkedInCount: number;
  expectedCount: number;
};

export type TeacherEventAttendance = AttendanceCounts & {
  eventId: string;
  eventCode: string;
  title: string;
  startTime: string | null;
  endTime: string | null;
  lateAfterMinutes: number;
  entries: AttendanceEntry[];
  attendees: AttendanceEntry[];
};

export type TeacherEventSummary = AttendanceCounts & {
  eventId: string;
  eventCode: string;
  title: string;
  startTime: string | null;
  lateAfterMinutes: number;
  attendeeCount: number;
};


/**
 * Mirrors the `resolve_attendance_status` trigger in lib/schema.sql. The
 * database is authoritative — this exists so the app can reason about a scan
 * before it is written, and as a fallback if a row predates the trigger.
 */
export function resolveScannedStatus(
  scannedAtMs: number,
  startTime: string | null,
  lateAfterMinutes: number | null | undefined
): ScannedStatus {
  if (!startTime) return 'present';
  const startMs = new Date(startTime).getTime();
  if (Number.isNaN(startMs)) return 'present';
  const grace = lateAfterMinutes ?? DEFAULT_LATE_AFTER_MINUTES;
  return scannedAtMs > startMs + grace * 60_000 ? 'late' : 'present';
}

function statusMessage(status: ScannedStatus): string {
  return status === 'late'
    ? 'Attendance recorded as late.'
    : 'Attendance recorded on time.';
}

type SupabaseError = { message: string; code?: string };

/**
 * Turns a Postgres/Supabase error into something actionable. A missing column
 * or table almost always means lib/schema.sql has not been run against the
 * project yet, which is otherwise invisible to the user.
 */
function describeDbError(error: SupabaseError): Error {
  const message = error.message ?? 'Unknown database error';
  if (
    error.code === '42P01' ||
    error.code === '42703' ||
    /does not exist|could not find the .* column|schema cache/i.test(message)
  ) {
    return new Error(
      'Database is missing recent updates. Run lib/schema.sql in the Supabase SQL editor.'
    );
  }
  return new Error(message);
}

export async function registerAttendance(
  rawPayload: string,
  studentId: string
): Promise<RegisterResult> {
  const parsed = parseQRPayload(rawPayload);
  if (!parsed.ok) {
    return { success: false, message: parsed.message };
  }
  const payload = parsed.payload;

  const active = await isAccountActive(studentId);
  if (!active) {
    return { success: false, message: 'This account has been deactivated.' };
  }

  const now = Date.now();
  const start = payload.start ? new Date(payload.start).getTime() : null;
  const end = payload.end ? new Date(payload.end).getTime() : null;

  if (start && now < start) {
    return { success: false, message: 'Event has not started yet.' };
  }
  if (end && now > end) {
    return { success: false, message: 'Event has already ended.' };
  }

  const title = payload.title ?? payload.event;
  let event: { id: string; title: string; start_time: string | null; late_after_minutes: number } | null =
    null;

  const foundEvent = await getEventByCode(payload.event);
  if (foundEvent) {
    event = foundEvent;
  } else {
    const { data: newEvent, error: insertError } = await supabase
      .from('events')
      .insert([
        {
          event_code: payload.event,
          title,
          start_time: payload.start ?? null,
          end_time: payload.end ?? null,
        },
      ])
      .select('id, title, start_time, late_after_minutes')
      .single();

    if (insertError) {
      return { success: false, message: describeDbError(insertError).message };
    }
    event = newEvent;
  }

  // The trigger derives this too, but reading it back keeps one code path and
  // surfaces the real stored value instead of a client-side guess.
  const { data: inserted, error: attError } = await supabase
    .from('attendance')
    .insert([
      {
        student_id: studentId,
        event_id: event.id,
      },
    ])
    .select('status')
    .single();

  if (attError) {
    if (attError.code === '23505') {
      return {
        success: false,
        message: 'Already registered for this event.',
        eventTitle: event.title,
      };
    }
    return { success: false, message: describeDbError(attError).message };
  }

  const status =
    (inserted?.status as ScannedStatus | null | undefined) ??
    resolveScannedStatus(now, event.start_time ?? payload.start ?? null, event.late_after_minutes);

  return {
    success: true,
    message: statusMessage(status),
    eventTitle: event.title,
    status,
  };
}

export async function getAttendanceHistory(
  studentId: string
): Promise<AttendanceRecord[]> {
  const { data, error } = await supabase
    .from('attendance')
    .select('id, scanned_at, status, events ( event_code, title )')
    .eq('student_id', studentId)
    .order('scanned_at', { ascending: false });

  if (error) {
    throw describeDbError(error);
  }
  if (!data) {
    return [];
  }

  return data.map((row: any) => ({
    id: row.id,
    eventId: row.events?.event_code ?? '',
    eventTitle: row.events?.title ?? '',
    scannedAt: row.scanned_at,
    status: row.status === 'late' ? 'late' : 'present',
  }));
}

export async function getTeacherEventAttendance(
  teacherId: string
): Promise<TeacherEventAttendance[]> {
  const { data: events, error: eventError } = await supabase
    .from('events')
    .select('id, event_code, title, start_time, end_time, late_after_minutes')
    .eq('created_by', teacherId)
    .order('created_at', { ascending: false });

  if (eventError) {
    throw describeDbError(eventError);
  }
  if (!events) return [];

  const codeToEventIds = await mapCodeToEventIds(events);
  const allEventIds = Array.from(codeToEventIds.values()).flat();
  if (allEventIds.length === 0) return [];

  const [attendance, roster] = await Promise.all([
    supabase
      .from('attendance')
      .select('student_id, scanned_at, status, event_id')
      .in('event_id', allEventIds)
      .order('scanned_at', { ascending: false }),
    supabase
      .from('event_roster')
      .select('event_id, student_id, student_name')
      .in('event_id', allEventIds),
  ]);

  if (attendance.error) {
    throw describeDbError(attendance.error);
  }
  if (roster.error) {
    throw describeDbError(roster.error);
  }
  if (!attendance.data) return [];

  const nameById = await loadProfileNames(
    (attendance.data as any[]).map((a) => a.student_id as string)
  );

  return events.map((event: any) => {
    const matchIds = new Set(codeToEventIds.get(event.event_code) ?? [event.id]);
    const scans = earliestScanByStudent(
      (attendance.data as any[]).filter((a) => matchIds.has(a.event_id))
    );
    const rosterRows = ((roster.data ?? []) as any[]).filter((r) =>
      matchIds.has(r.event_id)
    );

    return buildEventDetail(event, scans, rosterRows, nameById);
  });
}

export async function getTeacherEventSummary(
  teacherId: string
): Promise<TeacherEventSummary[]> {
  const { data: events, error: eventError } = await supabase
    .from('events')
    .select('id, event_code, title, start_time, late_after_minutes')
    .eq('created_by', teacherId)
    .order('created_at', { ascending: false });

  if (eventError) {
    throw describeDbError(eventError);
  }
  if (!events) return [];

  const codeToEventIds = await mapCodeToEventIds(events);
  const allEventIds = Array.from(codeToEventIds.values()).flat();
  if (allEventIds.length === 0) return [];

  const [attendance, roster] = await Promise.all([
    supabase
      .from('attendance')
      .select('student_id, event_id, status')
      .in('event_id', allEventIds),
    supabase
      .from('event_roster')
      .select('event_id')
      .in('event_id', allEventIds),
  ]);

  if (attendance.error) {
    throw describeDbError(attendance.error);
  }
  if (roster.error) {
    throw describeDbError(roster.error);
  }
  if (!attendance.data) return [];

  const scansByEvent = new Map<string, Set<string>>();
  const lateStudents = new Map<string, Set<string>>();
  for (const row of attendance.data as any[]) {
    if (!addToSet(scansByEvent, row.event_id, row.student_id)) continue;
    if (row.status === 'late') {
      addToSet(lateStudents, row.event_id, row.student_id);
    }
  }

  const rosterByEvent = new Map<string, number>();
  for (const row of (roster.data ?? []) as any[]) {
    rosterByEvent.set(row.event_id, (rosterByEvent.get(row.event_id) ?? 0) + 1);
  }

  return events.map((event: any) => {
    const ids = codeToEventIds.get(event.event_code) ?? [event.id];
    const scans = new Set<string>();
    const late = new Set<string>();
    let expected = 0;

    for (const id of ids) {
      (scansByEvent.get(id) ?? new Set()).forEach((studentId) => scans.add(studentId));
      (lateStudents.get(id) ?? new Set()).forEach((studentId) => late.add(studentId));
      expected += rosterByEvent.get(id) ?? 0;
    }

    const lateCount = Array.from(scans).filter((id) => late.has(id)).length;
    const checkedInCount = scans.size;

    return {
      eventId: event.id,
      eventCode: event.event_code,
      title: event.title,
      startTime: event.start_time,
      lateAfterMinutes: event.late_after_minutes ?? DEFAULT_LATE_AFTER_MINUTES,
      presentCount: checkedInCount - lateCount,
      lateCount,
      absentCount: Math.max(0, expected - checkedInCount),
      checkedInCount,
      expectedCount: expected,
      attendeeCount: checkedInCount,
    };
  });
}

async function mapCodeToEventIds(
  events: any[]
): Promise<Map<string, string[]>> {
  const codes = Array.from(new Set(events.map((e) => e.event_code))).filter(
    Boolean
  ) as string[];
  if (codes.length === 0) return new Map();

  const { data: codeEvents } = await supabase
    .from('events')
    .select('id, event_code')
    .in('event_code', codes);

  const map = new Map<string, string[]>();
  for (const event of (codeEvents ?? []) as any[]) {
    const previous = map.get(event.event_code) ?? [];
    previous.push(event.id);
    map.set(event.event_code, previous);
  }
  return map;
}

/** First scan per student wins, so a re-scan never rewrites the check-in time. */
function earliestScanByStudent(rows: any[]): Map<string, any> {
  const byStudent = new Map<string, any>();
  for (const row of rows) {
    const existing = byStudent.get(row.student_id);
    if (!existing || row.scanned_at < existing.scanned_at) {
      byStudent.set(row.student_id, row);
    }
  }
  return byStudent;
}

function buildEventDetail(
  event: any,
  scans: Map<string, any>,
  rosterRows: any[],
  nameById: Map<string, string | null>
): TeacherEventAttendance {
  const entries: AttendanceEntry[] = [];
  const seenKeys = new Set<string>();

  for (const rosterRow of rosterRows) {
    const key = rosterRow.student_name as string;
    seenKeys.add(key.toLowerCase());

    const scan =
      (rosterRow.student_id ? scans.get(rosterRow.student_id) : undefined) ??
      findScanByName(scans, rosterRow.student_name as string, nameById);

    entries.push({
      key: `roster-${rosterRow.id ?? key}`,
      studentId: rosterRow.student_id ?? scan?.student_id ?? null,
      studentName: rosterRow.student_name,
      status: scan ? normalizeScannedStatus(scan.status) : 'absent',
      scannedAt: scan?.scanned_at ?? null,
    });
  }

  // Students who scanned an event they were not rostered for still count.
  for (const [studentId, scan] of scans) {
    const name = nameById.get(studentId) ?? null;
    if (name && seenKeys.has(name.toLowerCase())) continue;
    entries.push({
      key: `scan-${studentId}`,
      studentId,
      studentName: name ?? 'Student account',
      status: normalizeScannedStatus(scan.status),
      scannedAt: scan.scanned_at,
    });
  }

  const counts = countStatuses(entries);

  return {
    eventId: event.id,
    eventCode: event.event_code,
    title: event.title,
    startTime: event.start_time,
    endTime: event.end_time,
    lateAfterMinutes: event.late_after_minutes ?? DEFAULT_LATE_AFTER_MINUTES,
    entries,
    attendees: entries,
    ...counts,
  };
}

function countStatuses(entries: AttendanceEntry[]): AttendanceCounts {
  let presentCount = 0;
  let lateCount = 0;
  let absentCount = 0;

  for (const entry of entries) {
    if (entry.status === 'late') lateCount += 1;
    else if (entry.status === 'absent') absentCount += 1;
    else presentCount += 1;
  }

  return {
    presentCount,
    lateCount,
    absentCount,
    checkedInCount: presentCount + lateCount,
    expectedCount: entries.length,
  };
}

function normalizeScannedStatus(value: unknown): ScannedStatus {
  return value === 'late' ? 'late' : 'present';
}

/** Roster rows without a linked account fall back to matching by name. */
function findScanByName(
  scans: Map<string, any>,
  rosterName: string,
  nameById: Map<string, string | null>
): any | undefined {
  const wanted = rosterName.trim().toLowerCase();
  if (!wanted) return undefined;

  for (const [studentId, scan] of scans) {
    const name = nameById.get(studentId);
    if (name && name.trim().toLowerCase() === wanted) return scan;
  }
  return undefined;
}

async function loadProfileNames(
  ids: string[]
): Promise<Map<string, string | null>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const map = new Map<string, string | null>();
  if (unique.length === 0) return map;

  const { data } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', unique);

  for (const profile of (data ?? []) as any[]) {
    map.set(profile.id, profile.full_name ?? null);
  }
  return map;
}

function addToSet(
  map: Map<string, Set<string>>,
  key: string,
  value: string
): boolean {
  const set = map.get(key) ?? new Set<string>();
  if (set.has(value)) return false;
  set.add(value);
  map.set(key, set);
  return true;
}

// ---------------------------------------------------------------------------
// STUDENT VIEWS
// ---------------------------------------------------------------------------

export type StudentEventCheckIn = {
  status: ScannedStatus;
  scannedAt: string;
};

/**
 * The student's own check-ins keyed by event id. Powers the "Available events"
 * screen so a student can see at a glance which events they already joined.
 */
export async function getStudentCheckIns(
  studentId: string
): Promise<Map<string, StudentEventCheckIn>> {
  const map = new Map<string, StudentEventCheckIn>();

  const { data, error } = await supabase
    .from('attendance')
    .select('event_id, scanned_at, status')
    .eq('student_id', studentId);

  if (error || !data) return map;

  for (const row of data as any[]) {
    map.set(row.event_id, {
      status: row.status === 'late' ? 'late' : 'present',
      scannedAt: row.scanned_at,
    });
  }
  return map;
}

/**
 * The events the student is expected to attend. A roster row only carries a
 * student_id when the teacher's name matched an account exactly, so this is a
 * best-effort list rather than a guarantee.
 */
export async function getStudentExpectedEventIds(
  studentId: string
): Promise<Set<string>> {
  const ids = new Set<string>();

  const { data, error } = await supabase
    .from('event_roster')
    .select('event_id')
    .eq('student_id', studentId);

  if (error || !data) return ids;

  for (const row of data as any[]) {
    ids.add(row.event_id);
  }
  return ids;
}

/** True unless an administrator has deactivated the account. */
export async function isAccountActive(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('profiles')
    .select('is_active')
    .eq('id', userId)
    .maybeSingle();

  if (!data) return true;
  return (data as any).is_active !== false;
}

// ---------------------------------------------------------------------------
// TEACHER SUMMARIES
// ---------------------------------------------------------------------------

export type TeacherStudentStat = {
  key: string;
  studentId: string | null;
  name: string;
  present: number;
  late: number;
  absent: number;
  total: number;
  rate: number;
};

export type TeacherAttendanceReport = {
  eventCount: number;
  presentCount: number;
  lateCount: number;
  absentCount: number;
  checkedInCount: number;
  expectedCount: number;
  attendanceRate: number;
  students: TeacherStudentStat[];
};

/**
 * The roll-up of every event a teacher owns: the headline totals plus a
 * per-student breakdown used for the attendance summary.
 */
export async function getTeacherAttendanceReport(
  teacherId: string
): Promise<TeacherAttendanceReport> {
  const events = await getTeacherEventAttendance(teacherId);

  const stats = new Map<string, TeacherStudentStat>();
  let presentCount = 0;
  let lateCount = 0;
  let absentCount = 0;

  for (const event of events) {
    presentCount += event.presentCount;
    lateCount += event.lateCount;
    absentCount += event.absentCount;

    for (const entry of event.entries) {
      const key = entry.studentId ?? entry.studentName.trim().toLowerCase();
      const existing = stats.get(key);
      const stat: TeacherStudentStat = existing ?? {
        key,
        studentId: entry.studentId,
        name: entry.studentName,
        present: 0,
        late: 0,
        absent: 0,
        total: 0,
        rate: 0,
      };

      if (entry.status === 'late') stat.late += 1;
      else if (entry.status === 'absent') stat.absent += 1;
      else stat.present += 1;
      stat.total += 1;

      stats.set(key, stat);
    }
  }

  const students = Array.from(stats.values())
    .map((stat) => ({
      ...stat,
      rate: stat.total > 0 ? (stat.present + stat.late) / stat.total : 0,
    }))
    .sort((a, b) => b.rate - a.rate || a.name.localeCompare(b.name));

  const expectedCount = presentCount + lateCount + absentCount;

  return {
    eventCount: events.length,
    presentCount,
    lateCount,
    absentCount,
    checkedInCount: presentCount + lateCount,
    expectedCount,
    attendanceRate:
      expectedCount > 0 ? (presentCount + lateCount) / expectedCount : 0,
    students,
  };
}

