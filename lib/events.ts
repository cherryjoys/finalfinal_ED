import { supabase } from './supabase';

/** Minutes after start_time before a scan counts as late. */
export const DEFAULT_LATE_AFTER_MINUTES = 10;

const MAX_ROSTER_SIZE = 100;

export type Event = {
  eventId: string; // public event code from the UI (e.g. EVT-2026-0002)
  title: string;
  start: string;
  end: string;
  /** Late window in minutes. Defaults to DEFAULT_LATE_AFTER_MINUTES. */
  lateAfterMinutes?: number;
  /** Expected students. Roster rows without a scan become ABSENT. */
  expectedStudents?: string | string[];
};

export type CloudEvent = {
  id: string;
  event_code: string;
  title: string;
  start_time: string | null;
  end_time: string | null;
  late_after_minutes: number;
  created_by: string | null;
  created_at: string;
};

export type EventPhase = 'upcoming' | 'ongoing' | 'ended' | 'unscheduled';

/** Coerces free input into a clean, de-duplicated, ordered list of names. */
export function normalizeRoster(raw: string | string[] | undefined): string[] {
  const parts = Array.isArray(raw) ? raw : (raw ?? '').split(/[,\n]/);
  const byLowercase = new Map<string, string>();

  for (const part of parts) {
    const name = part.trim().replace(/\s+/g, ' ');
    if (!name) continue;
    const key = name.toLowerCase();
    if (!byLowercase.has(key)) byLowercase.set(key, name);
    if (byLowercase.size >= MAX_ROSTER_SIZE) break;
  }

  return Array.from(byLowercase.values());
}

/** Clamps the late window to a sane 0–240 minute range. */
export function normalizeLateAfterMinutes(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_LATE_AFTER_MINUTES;
  }
  return Math.min(240, Math.max(0, Math.round(value)));
}

export async function createEvent(
  event: Event
): Promise<{ error: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('events')
    .upsert(
      {
        event_code: event.eventId,
        title: event.title,
        start_time: event.start || null,
        end_time: event.end || null,
        late_after_minutes: normalizeLateAfterMinutes(event.lateAfterMinutes),
        created_by: user?.id ?? null,
      },
      { onConflict: 'event_code' }
    )
    .select('id');

  if (error) {
    return { error: error.message ?? null };
  }

  const rowId = (data?.[0] as { id?: string } | undefined)?.id;
  const names = normalizeRoster(event.expectedStudents);
  if (!rowId || names.length === 0) {
    return { error: null };
  }

  return { error: await syncEventRoster(rowId, names) };
}

/**
 * Makes `names` the authoritative roster for an event: stale entries are
 * removed, the remaining ones are upserted, and each is linked to a real
 * account when a profile carries exactly that name.
 */
async function syncEventRoster(
  eventId: string,
  names: string[]
): Promise<string | null> {
  const { data: existing, error: readError } = await supabase
    .from('event_roster')
    .select('id, student_name')
    .eq('event_id', eventId);

  if (readError) {
    return readError.message ?? null;
  }

  const keep = new Set(names.map((name) => name.toLowerCase()));
  const staleIds = (existing ?? [])
    .filter((row: any) => !keep.has(String(row.student_name).toLowerCase()))
    .map((row: any) => row.id as string);

  if (staleIds.length > 0) {
    const { error: deleteError } = await supabase
      .from('event_roster')
      .delete()
      .in('id', staleIds);

    if (deleteError) {
      return deleteError.message ?? null;
    }
  }

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('full_name', names);

  const idByName = new Map<string, string>();
  for (const profile of (profiles ?? []) as any[]) {
    if (profile.full_name && profile.id) {
      idByName.set(profile.full_name as string, profile.id as string);
    }
  }

  const { error: upsertError } = await supabase.from('event_roster').upsert(
    names.map((studentName) => ({
      event_id: eventId,
      student_name: studentName,
      student_id: idByName.get(studentName) ?? null,
    })),
    { onConflict: 'event_id,student_name' }
  );

  return upsertError?.message ?? null;
}

export async function getEventsByTeacher(
  teacherId: string
): Promise<CloudEvent[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('created_by', teacherId)
    .order('created_at', { ascending: false });

  if (error || !data) {
    return [];
  }

  return data as CloudEvent[];
}

export async function getEventByCode(
  code: string
): Promise<CloudEvent | null> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('event_code', code)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as CloudEvent;
}

export async function getEventById(id: string): Promise<CloudEvent | null> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as CloudEvent;
}

/**
 * Every event on the system, soonest first. Used by the student "Events"
 * screen so a student can see what is coming up before scanning.
 */
export async function getAvailableEvents(): Promise<CloudEvent[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .order('start_time', { ascending: true, nullsFirst: false });

  if (error || !data) {
    return [];
  }

  return (data as CloudEvent[]).sort(sortBySchedule);
}

/** Everything on the system regardless of owner. Administrators only. */
export async function listAllEvents(): Promise<CloudEvent[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .order('created_at', { ascending: false });

  if (error || !data) {
    return [];
  }

  return data as CloudEvent[];
}

/**
 * Removes an event. Attendance rows and roster rows for that event cascade
 * away with it. Administrators only.
 */
export async function deleteEvent(eventId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('events').delete().eq('id', eventId);
  return { error: error?.message ?? null };
}

/**
 * Upcoming and running events first (soonest first), then finished ones
 * (most recent first).
 */
export function sortBySchedule(a: CloudEvent, b: CloudEvent, now = Date.now()): number {
  const rank: Record<EventPhase, number> = {
    ongoing: 0,
    upcoming: 1,
    unscheduled: 2,
    ended: 3,
  };

  const aRank = rank[getEventPhase(a, now)];
  const bRank = rank[getEventPhase(b, now)];
  if (aRank !== bRank) return aRank - bRank;

  const aStart = a.start_time ? new Date(a.start_time).getTime() : 0;
  const bStart = b.start_time ? new Date(b.start_time).getTime() : 0;

  // Running and upcoming read best soonest-first; finished events read best
  // most-recent-first.
  return aRank === 3 ? bStart - aStart : aStart - bStart;
}

/**
 * Where an event sits in its life: not started yet, running right now, over,
 * or never scheduled.
 */
export function getEventPhase(
  event: { start_time: string | null; end_time: string | null },
  now = Date.now()
): EventPhase {
  const start = event.start_time ? new Date(event.start_time).getTime() : null;
  const end = event.end_time ? new Date(event.end_time).getTime() : null;

  const validStart = start !== null && Number.isFinite(start);
  const validEnd = end !== null && Number.isFinite(end);

  if (validStart && start! > now) return 'upcoming';
  if (validEnd && end! < now) return 'ended';
  if (validStart) return 'ongoing';
  return 'unscheduled';
}

export async function updateEvent(
  eventId: string,
  updates: {
    title?: string;
    start_time?: string | null;
    end_time?: string | null;
    late_after_minutes?: number;
  }
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('events')
    .update(updates)
    .eq('id', eventId);

  return { error: error?.message ?? null };
}

export async function closeEvent(eventId: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('events')
    .update({ end_time: new Date().toISOString() })
    .eq('id', eventId);

  return { error: error?.message ?? null };
}
