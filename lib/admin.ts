import { supabase } from './supabase';
import type { ScannedStatus } from './attendance';
import { listAllEvents, type CloudEvent } from './events';

/**
 * Everything the administrator dashboard needs. It talks to the same tables
 * the students and teachers use — the database's RLS policies (see
 * lib/schema.sql, section 3B) are what keep these reads and writes limited
 * to administrators.
 */

export type AdminRole = 'student' | 'teacher' | 'admin';

export type AdminUser = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: AdminRole;
  is_active: boolean;
  created_at: string | null;
};

export type AdminAttendanceRecord = {
  id: string;
  student_id: string;
  student_name: string;
  event_id: string;
  event_code: string;
  event_title: string;
  scanned_at: string;
  status: ScannedStatus;
};

export type AdminEventSummary = {
  eventId: string;
  eventCode: string;
  title: string;
  startTime: string | null;
  endTime: string | null;
  ownerName: string | null;
  checkedIn: number;
  present: number;
  late: number;
  expected: number;
  absent: number;
  rate: number;
};

export type AdminStudentStat = {
  studentId: string;
  name: string;
  email: string | null;
  present: number;
  late: number;
  absent: number;
  total: number;
  rate: number;
};

export type SystemReport = {
  generatedAt: string;
  totals: {
    users: number;
    activeUsers: number;
    disabledUsers: number;
    students: number;
    teachers: number;
    admins: number;
    events: number;
    openEvents: number;
    checkIns: number;
    present: number;
    late: number;
    absent: number;
    uniqueStudents: number;
    attendanceRate: number;
  };
  events: AdminEventSummary[];
  students: AdminStudentStat[];
  records: AdminAttendanceRecord[];
};

export type AuditEntry = {
  id: string;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: string | null;
  created_at: string;
};

function describeError(error: { message?: string } | null): string {
  return error?.message ?? 'Unknown database error.';
}

// ---------------------------------------------------------------------------
// USERS
// ---------------------------------------------------------------------------

export async function listUsers(): Promise<AdminUser[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, is_active, created_at')
    .order('full_name', { ascending: true });

  if (error || !data) return [];

  return (data as any[]).map((row) => ({
    id: row.id,
    email: row.email ?? null,
    full_name: row.full_name ?? null,
    role: (row.role ?? 'student') as AdminRole,
    is_active: row.is_active !== false,
    created_at: row.created_at ?? null,
  }));
}

/** Promotes or demotes an account. Only administrators may do this. */
export async function setUserRole(
  userId: string,
  role: AdminRole
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('profiles')
    .update({ role })
    .eq('id', userId);

  return { error: error ? describeError(error) : null };
}

/**
 * Deactivates or reactivates an account. A deactivated account keeps all of
 * its data but is refused at sign-in and cannot record attendance.
 */
export async function setUserActive(
  userId: string,
  isActive: boolean
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('profiles')
    .update({ is_active: isActive, disabled_at: isActive ? null : new Date().toISOString() })
    .eq('id', userId);

  return { error: error ? describeError(error) : null };
}

// ---------------------------------------------------------------------------
// ATTENDANCE
// ---------------------------------------------------------------------------

/** Every check-in on the system, newest first, with names resolved. */
export async function listSystemAttendance(): Promise<AdminAttendanceRecord[]> {
  const { data, error } = await supabase
    .from('attendance')
    .select('id, student_id, event_id, scanned_at, status, events ( event_code, title )')
    .order('scanned_at', { ascending: false })
    .limit(500);

  if (error || !data) return [];

  const rows = data as any[];
  const names = await loadNames(rows.map((row) => row.student_id));

  return rows.map((row) => ({
    id: row.id,
    student_id: row.student_id,
    student_name: names.get(row.student_id) ?? 'Unknown student',
    event_id: row.event_id,
    event_code: row.events?.event_code ?? '',
    event_title: row.events?.title ?? 'Unknown event',
    scanned_at: row.scanned_at,
    status: row.status === 'late' ? 'late' : 'present',
  }));
}

/**
 * Corrects a check-in. 'present' and 'late' are the only two stored states —
 * an absent student simply has no row.
 */
export async function setAttendanceStatus(
  recordId: string,
  status: ScannedStatus
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('attendance')
    .update({ status })
    .eq('id', recordId);

  return { error: error ? describeError(error) : null };
}

/** Removes a check-in entirely — the student shows as absent again. */
export async function deleteAttendanceRecord(
  recordId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('attendance').delete().eq('id', recordId);
  return { error: error ? describeError(error) : null };
}

/**
 * Records a check-in for a student who was missed — the fix for "the app did
 * not scan him but he was there". If the student already has a row the
 * existing row is corrected instead of failing on the unique constraint.
 */
export async function markAttendancePresent(
  eventId: string,
  studentId: string,
  status: ScannedStatus = 'present'
): Promise<{ error: string | null }> {
  const { data: existing } = await supabase
    .from('attendance')
    .select('id')
    .eq('event_id', eventId)
    .eq('student_id', studentId)
    .maybeSingle();

  if (existing) {
    return setAttendanceStatus(existing.id, status);
  }

  const { error, data: inserted } = await supabase
    .from('attendance')
    .insert({ event_id: eventId, student_id: studentId })
    .select('id')
    .single();

  if (error) {
    return { error: describeError(error) };
  }

  // The insert trigger derives the status from the clock; an administrator
  // correcting a record means their choice wins.
  const insertedId = (inserted as any)?.id;
  if (!insertedId) {
    return { error: 'Could not record the attendance correction.' };
  }

  return setAttendanceStatus(insertedId, status);
}

export type AdminRosterEntry = {
  id: string;
  student_id: string | null;
  student_name: string;
  scanned: boolean;
  status: ScannedStatus | null;
};

/**
 * The expected students of one event, each flagged with whether they already
 * have a check-in. A roster row only carries an account id when the teacher's
 * name matched a profile exactly, so a row without one can be read but not
 * corrected - there is no account to write the check-in against.
 */
export async function listEventRoster(eventId: string): Promise<AdminRosterEntry[]> {
  const { data: roster, error } = await supabase
    .from('event_roster')
    .select('id, student_id, student_name')
    .eq('event_id', eventId);

  if (error || !roster) return [];

  const { data: scans } = await supabase
    .from('attendance')
    .select('student_id, status')
    .eq('event_id', eventId);

  const statusByStudent = new Map<string, ScannedStatus>();
  for (const row of (scans ?? []) as any[]) {
    statusByStudent.set(row.student_id, row.status === 'late' ? 'late' : 'present');
  }

  return ((roster ?? []) as any[]).map((row) => ({
    id: row.id,
    student_id: row.student_id ?? null,
    student_name: row.student_name,
    scanned: row.student_id ? statusByStudent.has(row.student_id) : false,
    status: row.student_id ? statusByStudent.get(row.student_id) ?? null : null,
  }));
}

// ---------------------------------------------------------------------------
// REPORTS
// ---------------------------------------------------------------------------

/**
 * The full system picture: totals, a per-event breakdown, a per-student
 * breakdown and every check-in.
 */
export async function getSystemReport(): Promise<SystemReport> {
  const [users, events, records] = await Promise.all([
    listUsers(),
    listAllEventsSafe(),
    listSystemAttendance(),
  ]);

  const roster = await listAllRoster();

  const namesById = new Map(users.map((user) => [user.id, user.full_name ?? user.email ?? '']));
  const emailsById = new Map(users.map((user) => [user.id, user.email]));

  const checkedInByEvent = new Map<string, Set<string>>();
  const lateByEvent = new Map<string, Set<string>>();
  for (const record of records) {
    addToSet(checkedInByEvent, record.event_id, record.student_id);
    if (record.status === 'late') addToSet(lateByEvent, record.event_id, record.student_id);
  }

  const expectedByEvent = new Map<string, number>();
  const rosterByEvent = new Map<string, any[]>();
  for (const row of roster) {
    expectedByEvent.set(row.event_id, (expectedByEvent.get(row.event_id) ?? 0) + 1);
    const list = rosterByEvent.get(row.event_id) ?? [];
    list.push(row);
    rosterByEvent.set(row.event_id, list);
  }

  const eventSummaries: AdminEventSummary[] = events.map((event) => {
    const checkedIn = checkedInByEvent.get(event.id) ?? new Set<string>();
    const late = lateByEvent.get(event.id) ?? new Set<string>();
    const expected = expectedByEvent.get(event.id) ?? 0;
    const lateCount = Array.from(checkedIn).filter((id) => late.has(id)).length;
    const presentCount = checkedIn.size - lateCount;
    const absentCount = Math.max(0, expected - checkedIn.size);

    return {
      eventId: event.id,
      eventCode: event.event_code,
      title: event.title,
      startTime: event.start_time,
      endTime: event.end_time,
      ownerName: event.created_by ? namesById.get(event.created_by) ?? null : null,
      checkedIn: checkedIn.size,
      present: presentCount,
      late: lateCount,
      expected,
      absent: absentCount,
      rate: expected > 0 ? checkedIn.size / expected : checkedIn.size > 0 ? 1 : 0,
    };
  });

  const studentStats = buildStudentStats(records, roster, namesById, emailsById);

  const checkIns = records.length;
  const late = records.filter((record) => record.status === 'late').length;
  const present = checkIns - late;
  const expectedTotal = eventSummaries.reduce((sum, event) => sum + event.expected, 0);
  const absent = Math.max(0, expectedTotal - checkIns);
  const denominator = present + late + absent;

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      users: users.length,
      activeUsers: users.filter((user) => user.is_active).length,
      disabledUsers: users.filter((user) => !user.is_active).length,
      students: users.filter((user) => user.role === 'student').length,
      teachers: users.filter((user) => user.role === 'teacher').length,
      admins: users.filter((user) => user.role === 'admin').length,
      events: events.length,
      openEvents: events.filter((event) => !event.end_time).length,
      checkIns,
      present,
      late,
      absent,
      uniqueStudents: new Set(records.map((record) => record.student_id)).size,
      attendanceRate: denominator > 0 ? (present + late) / denominator : 0,
    },
    events: eventSummaries,
    students: studentStats,
    records,
  };
}

/** Flattens a report into CSV so it can be shared or saved. */
export function reportToCsv(report: SystemReport): string {
  const header = [
    'Student',
    'Email',
    'Event',
    'Event Code',
    'Status',
    'Scanned At',
  ].join(',');

  const rows = report.records.map((record) =>
    [
      csvCell(record.student_name),
      csvCell(findEmail(report, record.student_id)),
      csvCell(record.event_title),
      csvCell(record.event_code),
      csvCell(record.status),
      csvCell(record.scanned_at),
    ].join(',')
  );

  return [header, ...rows].join('\n');
}

function findEmail(report: SystemReport, studentId: string): string {
  return report.students.find((student) => student.studentId === studentId)?.email ?? '';
}

function csvCell(value: string | null | undefined): string {
  const text = value ?? '';
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function buildStudentStats(
  records: AdminAttendanceRecord[],
  roster: any[],
  namesById: Map<string, string>,
  emailsById: Map<string, string | null>
): AdminStudentStat[] {
  const stats = new Map<string, AdminStudentStat>();

  const ensure = (studentId: string, name: string): AdminStudentStat => {
    const existing = stats.get(studentId);
    if (existing) return existing;

    const created: AdminStudentStat = {
      studentId,
      name: name || namesById.get(studentId) || 'Unknown student',
      email: emailsById.get(studentId) ?? null,
      present: 0,
      late: 0,
      absent: 0,
      total: 0,
      rate: 0,
    };
    stats.set(studentId, created);
    return created;
  };

  const scannedByEvent = new Map<string, Set<string>>();
  for (const record of records) {
    const set = scannedByEvent.get(record.event_id) ?? new Set<string>();
    set.add(record.student_id);
    scannedByEvent.set(record.event_id, set);
  }

  for (const record of records) {
    const stat = ensure(record.student_id, record.student_name);
    if (record.status === 'late') stat.late += 1;
    else stat.present += 1;
    stat.total += 1;
  }

  // A roster row with no scan is an absence. Roster rows can point at an
  // account (student_id) or only carry a name, so match on both.
  const nameToId = new Map<string, string>();
  for (const [id, name] of namesById) {
    if (name) nameToId.set(name.trim().toLowerCase(), id);
  }

  for (const row of roster) {
    const scanned = scannedByEvent.get(row.event_id);
    const studentId: string | null =
      row.student_id ?? nameToId.get(String(row.student_name).trim().toLowerCase()) ?? null;
    if (!studentId) continue;
    if (scanned?.has(studentId)) continue;

    const stat = ensure(studentId, namesById.get(studentId) ?? String(row.student_name));
    stat.absent += 1;
    stat.total += 1;
  }

  return Array.from(stats.values())
    .map((stat) => ({
      ...stat,
      rate: stat.total > 0 ? (stat.present + stat.late) / stat.total : 0,
    }))
    .sort((a, b) => b.rate - a.rate || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// AUDIT LOG
// ---------------------------------------------------------------------------

/** Appends an administrator action to the system record. */
export async function logAdminAction(
  action: string,
  targetType: string,
  targetId: string | null,
  details?: string
): Promise<void> {
  try {
    const { data } = await supabase.auth.getUser();
    await supabase.from('admin_audit_log').insert({
      actor_id: data.user?.id ?? null,
      actor_email: data.user?.email ?? null,
      action,
      target_type: targetType,
      target_id: targetId,
      details: details ?? null,
    });
  } catch {
    // The audit trail must never break the action it is recording.
  }
}

export async function listAuditLog(limit = 100): Promise<AuditEntry[]> {
  const { data, error } = await supabase
    .from('admin_audit_log')
    .select('id, actor_email, action, target_type, target_id, details, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return (data as any[]).map((row) => ({
    id: row.id,
    actor_email: row.actor_email ?? null,
    action: row.action,
    target_type: row.target_type ?? null,
    target_id: row.target_id ?? null,
    details: row.details ?? null,
    created_at: row.created_at,
  }));
}

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

async function listAllEventsSafe(): Promise<CloudEvent[]> {
  return listAllEvents();
}

async function listAllRoster(): Promise<any[]> {
  const { data, error } = await supabase.from('event_roster').select('event_id, student_id, student_name');
  if (error || !data) return [];
  return data as any[];
}

async function loadNames(ids: string[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const map = new Map<string, string>();
  if (unique.length === 0) return map;

  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('id', unique);

  for (const row of (data ?? []) as any[]) {
    map.set(row.id, row.full_name ?? row.email ?? 'Unknown student');
  }
  return map;
}

function addToSet(
  map: Map<string, Set<string>>,
  key: string,
  value: string
): void {
  const set = map.get(key) ?? new Set<string>();
  set.add(value);
  map.set(key, set);
}
