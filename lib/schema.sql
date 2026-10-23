-- ============================================================
-- Phase 3 — Supabase PostgreSQL Schema for QR-ATT
--
-- This file replaces the local SQLite schema with a cloud schema.
-- It mirrors the original `events` and `attendance` tables but
-- integrates with Supabase Auth (auth.users) and adds Row Level
-- Security so each user can only see their own data.
--
-- It also adds the `event_roster` table plus a `status` column on
-- `attendance`, which together make Present / Late / Absent real:
-- see section 2B for how the three states are derived.
--
-- Phase 4 — Administrator support:
--   * `profiles.role` may now be 'admin' (section 2A)
--   * `profiles.is_active` lets an admin deactivate an account
--   * `public.is_admin()` gates every administrator policy (section 3B)
--   * `admin_audit_log` records every administrator action
--
-- HOW TO RUN:
--   1. Open Supabase Dashboard -> SQL Editor
--   2. Paste the ENTIRE file
--   3. Click "Run"
--   4. Verify the tables appear under Table Editor
--
-- This script is IDEMPOTENT: it can be run multiple times safely.
--
-- IMPORTANT: All tables are created BEFORE any policy. PostgreSQL
-- validates RLS policy expressions when the policy is created, so a
-- policy referencing a table that does not exist yet fails with
-- "ERROR: 42P01: relation ... does not exist".
-- ============================================================

-- ------------------------------------------------------------
-- 1. TABLES
-- ------------------------------------------------------------

-- PROFILES
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'student' check (role in ('student', 'teacher', 'admin')),
  -- Accounts can be deactivated by an administrator. Deactivated accounts keep
  -- their data but cannot sign in or record attendance.
  is_active boolean not null default true,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- EVENTS
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  event_code text not null unique,
  title text not null,
  start_time timestamptz,
  end_time timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  -- A scan counts as LATE once it lands more than this many minutes after
  -- start_time. 0 means "late from the very first second of the event".
  late_after_minutes integer not null default 10
);

-- Event details added by the dashboard. Kept in ALTER statements so an
-- existing database picks them up when this script is re-run.
alter table public.events add column if not exists venue text;
alter table public.events add column if not exists description text;
alter table public.events add column if not exists status text not null default 'open';

alter table public.events drop constraint if exists events_status_check;
alter table public.events
  add constraint events_status_check check (status in ('open', 'closed'));

-- ATTENDANCE
create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  scanned_at timestamptz not null default now(),
  -- Derived by the on_attendance_insert trigger below, never by the client.
  -- 'absent' is intentionally NOT storable: absence is the absence of a row,
  -- computed by joining event_roster against this table.
  status text not null default 'present' check (status in ('present', 'late')),
  unique (student_id, event_id)
);

-- EVENT ROSTER
-- The students a teacher expects to see for an event. Any roster row with no
-- matching attendance row is what the app renders as ABSENT, which is what
-- makes the Present / Late / Absent trio real rather than cosmetic.
create table if not exists public.event_roster (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  -- Resolved from the teacher roster when the name matches a known profile.
  -- Null for names that do not match an account yet; those still count as
  -- expected attendees and can be matched later by name.
  student_id uuid references auth.users (id) on delete cascade,
  student_name text not null,
  created_at timestamptz not null default now(),
  unique (event_id, student_name)
);

-- ADMIN AUDIT LOG
-- Every administrator action is appended here so the system keeps a record of
-- who changed what and when. This is what the "System records" report reads.
create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users (id) on delete set null,
  actor_email text,
  action text not null,
  target_type text,
  target_id text,
  details text,
  created_at timestamptz not null default now()
);

-- Enable Row Level Security on all tables
alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.attendance enable row level security;
alter table public.event_roster enable row level security;
alter table public.admin_audit_log enable row level security;

-- ------------------------------------------------------------
-- 2. AUTOMATIC PROFILE CREATION
-- ------------------------------------------------------------
-- Automatically create a profile after a user signs up.
--
-- The requested role comes from the signup metadata, which the client
-- controls, so it is CLAMPED here to 'student' or 'teacher'. The single
-- administrator account is provisioned separately and can never be created
-- by signing up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    case
      when coalesce(new.raw_user_meta_data ->> 'role', '') = 'teacher' then 'teacher'
      else 'student'
    end
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name),
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ------------------------------------------------------------
-- 2A. ADMINISTRATOR SUPPORT
-- ------------------------------------------------------------
-- These ALTERs bring an existing database up to date; they are no-ops on a
-- fresh install because the columns above are already part of CREATE TABLE.

alter table public.profiles
  add column if not exists is_active boolean not null default true;
alter table public.profiles
  add column if not exists disabled_at timestamptz;

-- The original constraint only allowed 'student' and 'teacher'.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('student', 'teacher', 'admin'));

-- Single source of truth for "is this caller an administrator".
-- SECURITY DEFINER so it can read `profiles` without tripping its own RLS.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.is_active
  );
$$;

-- Stops a user from promoting themselves. Without this, the "Users can update
-- their own profile" policy would let anyone set their own role to 'admin'.
create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Only administrators can change account roles.'
      using errcode = '42501';
  end if;

  if (new.is_active is distinct from old.is_active
      or new.disabled_at is distinct from old.disabled_at)
     and not public.is_admin() then
    raise exception 'Only administrators can enable or disable accounts.'
      using errcode = '42501';
  end if;

  -- Keep the two flags consistent no matter which one the admin wrote.
  if new.is_active is false then
    new.disabled_at := coalesce(new.disabled_at, now());
  else
    new.disabled_at := null;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists on_profile_privilege_guard on public.profiles;
create trigger on_profile_privilege_guard
  before update on public.profiles
  for each row execute procedure public.guard_profile_privileges();

-- Only one administrator account may exist. It is provisioned ahead of time
-- with lib/promote-admin.sql; the app never promotes another user to admin.
create or replace function public.guard_single_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role <> 'admin' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.role = 'admin' then
    return new;
  end if;

  if exists (
    select 1
    from public.profiles p
    where p.role = 'admin'
      and p.id <> new.id
  ) then
    raise exception 'Only one administrator account is allowed.'
      using errcode = '23505';
  end if;

  return new;
end;
$$;

drop trigger if exists on_profile_single_admin on public.profiles;
create trigger on_profile_single_admin
  before insert or update of role on public.profiles
  for each row execute procedure public.guard_single_admin();


-- ------------------------------------------------------------
-- 2B. ATTENDANCE STATE (present / late / absent)
-- ------------------------------------------------------------
-- The three attendance states are derived, never hand-written:
--
--   present  scanned_at <= start_time + late_after_minutes
--   late     scanned_at  > start_time + late_after_minutes
--   absent   a row in event_roster with no matching attendance row
--
-- present/late are resolved by a trigger so the database stays the single
-- source of truth — a client that lies about `status` still gets the right
-- value. absent is never stored, because an absent student has no row at all.
--
-- These ALTERs bring an existing database up to date; they are no-ops on a
-- fresh install because the columns above are already part of CREATE TABLE.

alter table public.events
  add column if not exists late_after_minutes integer not null default 10;

alter table public.attendance
  add column if not exists status text not null default 'present';

alter table public.attendance
  drop constraint if exists attendance_status_check;
alter table public.attendance
  add constraint attendance_status_check check (status in ('present', 'late'));

create or replace function public.resolve_attendance_status()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  event_start timestamptz;
  grace_minutes integer;
begin
  select e.start_time, coalesce(e.late_after_minutes, 10)
    into event_start, grace_minutes
    from public.events e
   where e.id = new.event_id;

  -- No start time to compare against, so the scan is simply on time.
  if event_start is null
     or new.scanned_at <= event_start + make_interval(mins => grace_minutes) then
    new.status := 'present';
  else
    new.status := 'late';
  end if;

  return new;
end;
$$;

drop trigger if exists on_attendance_insert on public.attendance;
create trigger on_attendance_insert
  before insert on public.attendance
  for each row execute procedure public.resolve_attendance_status();

-- Backfill rows that predate the trigger. Re-running is safe: it recomputes
-- the same value every time.
update public.attendance a
   set status = case
     when e.start_time is null
       or a.scanned_at <= e.start_time + make_interval(mins => coalesce(e.late_after_minutes, 10))
       then 'present'
     else 'late'
   end
  from public.events e
 where e.id = a.event_id;

-- ------------------------------------------------------------
-- 3. POLICIES
-- ------------------------------------------------------------

-- Profiles policies
drop policy if exists "Profiles are viewable by owner" on public.profiles;
create policy "Profiles are viewable by owner"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Events policies
-- Any signed-in user can read event details (needed to validate QR codes)
drop policy if exists "Events are readable by any authenticated user" on public.events;
create policy "Events are readable by any authenticated user"
  on public.events for select
  using (auth.role() = 'authenticated');

-- Only the creator can insert / update their events
drop policy if exists "Users can insert events" on public.events;
create policy "Users can insert events"
  on public.events for insert
  with check (auth.role() = 'authenticated');

-- Only the creator can insert / update their events.
-- A teacher may ALSO adopt an unclaimed (orphan) event row — one that was
-- auto-created during a scan before the teacher saved the event — so the
-- upsert (onConflict: event_code) can set created_by on that same row.
drop policy if exists "Users can update their own events" on public.events;
create policy "Users can update their own events"
  on public.events for update
  using (auth.uid() = created_by or created_by is null)
  with check (auth.uid() = created_by or created_by is null);

-- Attendance policies
-- Students can only view / insert their own attendance
drop policy if exists "Students can view their own attendance" on public.attendance;
create policy "Students can view their own attendance"
  on public.attendance for select
  using (auth.uid() = student_id);

drop policy if exists "Students can insert their own attendance" on public.attendance;
create policy "Students can insert their own attendance"
  on public.attendance for insert
  with check (auth.uid() = student_id);

-- Teachers can view attendance for events they created, plus any event
-- row that shares the same event_code (covers QRs whose events were
-- auto-created during a scan before the teacher saved the event).
drop policy if exists "Teachers can view attendance for their events" on public.attendance;
create policy "Teachers can view attendance for their events"
  on public.attendance for select
  using (
    exists (
      select 1 from public.events e
      where e.id = attendance.event_id
        and exists (
          select 1 from public.events own
          where own.event_code = e.event_code
            and own.created_by = auth.uid()
        )
    )
  );

-- Teachers can read the profiles of students who attended their events
-- (needed to show attendee names in the teacher's History view).
-- Mirrors the attendance policy: matches any event row sharing the teacher's
-- event_code, so students of auto-created (orphan) event rows also show.
drop policy if exists "Teachers can view profiles of their attendees" on public.profiles;
create policy "Teachers can view profiles of their attendees"
  on public.profiles for select
  using (
    exists (
      select 1
      from public.attendance a
      join public.events e on e.id = a.event_id
      where a.student_id = profiles.id
        and exists (
          select 1 from public.events own
          where own.event_code = e.event_code
            and own.created_by = auth.uid()
        )
    )
    or exists (
      -- A student on a roster the teacher built for one of their own events,
      -- so their name can be resolved to an id when the roster is saved.
      select 1
      from public.event_roster r
      join public.events e on e.id = r.event_id
      where r.student_id = profiles.id
        and exists (
          select 1 from public.events own
          where own.event_code = e.event_code
            and own.created_by = auth.uid()
        )
    )
  );

-- Event roster policies
-- Only the teacher who owns the event may write its roster. Lookups go through
-- event_code so orphan event rows auto-created by an early scan are covered.
drop policy if exists "Teachers can view the roster for their events" on public.event_roster;
create policy "Teachers can view the roster for their events"
  on public.event_roster for select
  using (
    exists (
      select 1 from public.events e
      where e.id = event_roster.event_id
        and exists (
          select 1 from public.events own
          where own.event_code = e.event_code
            and own.created_by = auth.uid()
        )
    )
  );

drop policy if exists "Students can view their own roster entry" on public.event_roster;
create policy "Students can view their own roster entry"
  on public.event_roster for select
  using (auth.uid() = student_id);

drop policy if exists "Teachers can insert roster entries for their events" on public.event_roster;
create policy "Teachers can insert roster entries for their events"
  on public.event_roster for insert
  with check (
    exists (
      select 1 from public.events e
      where e.id = event_roster.event_id
        and exists (
          select 1 from public.events own
          where own.event_code = e.event_code
            and own.created_by = auth.uid()
        )
    )
  );

drop policy if exists "Teachers can update roster entries for their events" on public.event_roster;
create policy "Teachers can update roster entries for their events"
  on public.event_roster for update
  using (
    exists (
      select 1 from public.events e
      where e.id = event_roster.event_id
        and exists (
          select 1 from public.events own
          where own.event_code = e.event_code
            and own.created_by = auth.uid()
        )
    )
  )
  with check (
    exists (
      select 1 from public.events e
      where e.id = event_roster.event_id
        and exists (
          select 1 from public.events own
          where own.event_code = e.event_code
            and own.created_by = auth.uid()
        )
    )
  );

drop policy if exists "Teachers can delete roster entries for their events" on public.event_roster;
create policy "Teachers can delete roster entries for their events"
  on public.event_roster for delete
  using (
    exists (
      select 1 from public.events e
      where e.id = event_roster.event_id
        and exists (
          select 1 from public.events own
          where own.event_code = e.event_code
            and own.created_by = auth.uid()
        )
    )
  );

-- ------------------------------------------------------------
-- 3B. ADMINISTRATOR POLICIES
-- ------------------------------------------------------------
-- Every policy below is gated on public.is_admin(), so the administrator
-- dashboard can read and correct the whole system while everyone else stays
-- inside their own lane.

-- Profiles: read every account, and promote / demote / deactivate them.
drop policy if exists "Admins can view all profiles" on public.profiles;
create policy "Admins can view all profiles"
  on public.profiles for select
  using (public.is_admin());

drop policy if exists "Admins can update any profile" on public.profiles;
create policy "Admins can update any profile"
  on public.profiles for update
  using (public.is_admin())
  with check (public.is_admin());

-- Events: manage events created by any teacher.
drop policy if exists "Admins can update any event" on public.events;
create policy "Admins can update any event"
  on public.events for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins can delete any event" on public.events;
create policy "Admins can delete any event"
  on public.events for delete
  using (public.is_admin());

-- Attendance: read every check-in, correct a status, remove a record, or add
-- one on behalf of a student who was missed.
drop policy if exists "Admins can view all attendance" on public.attendance;
create policy "Admins can view all attendance"
  on public.attendance for select
  using (public.is_admin());

drop policy if exists "Admins can correct attendance" on public.attendance;
create policy "Admins can correct attendance"
  on public.attendance for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins can delete attendance" on public.attendance;
create policy "Admins can delete attendance"
  on public.attendance for delete
  using (public.is_admin());

drop policy if exists "Admins can add attendance on behalf of a student" on public.attendance;
create policy "Admins can add attendance on behalf of a student"
  on public.attendance for insert
  with check (public.is_admin());

-- Rosters: read every roster and repair the expected-student list.
drop policy if exists "Admins can view all rosters" on public.event_roster;
create policy "Admins can view all rosters"
  on public.event_roster for select
  using (public.is_admin());

drop policy if exists "Admins can insert roster entries" on public.event_roster;
create policy "Admins can insert roster entries"
  on public.event_roster for insert
  with check (public.is_admin());

drop policy if exists "Admins can update roster entries" on public.event_roster;
create policy "Admins can update roster entries"
  on public.event_roster for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins can delete roster entries" on public.event_roster;
create policy "Admins can delete roster entries"
  on public.event_roster for delete
  using (public.is_admin());

-- Audit log: administrators write it and read it, nobody else sees it.
drop policy if exists "Admins can read the audit log" on public.admin_audit_log;
create policy "Admins can read the audit log"
  on public.admin_audit_log for select
  using (public.is_admin());

drop policy if exists "Admins can write the audit log" on public.admin_audit_log;
create policy "Admins can write the audit log"
  on public.admin_audit_log for insert
  with check (public.is_admin());

------------------------------------------------------------
-- ------------------------------------------------------------
-- 4. ROTATING QR CODES, DEVICE BINDING & LIVE SESSIONS
-- ------------------------------------------------------------
--
-- Phase 12 - attendance codes rotate every 15-30 seconds and are
-- signed by the database, so a screenshot of an old code stops
-- working. An account is bound to the device it first scans from
-- and an administrator can release that binding.
--
-- The statements below are identical to lib/migrations/12-rotating-qr.sql.
-- 1A. TABLES
-- ------------------------------------------------------------

-- QR SESSIONS
-- One row per live attendance session. The `secret` signs the codes
-- for this session and is never sent to a student. `rotation_seconds`
-- is how long one code stays valid.
create table if not exists public.qr_sessions (
  id uuid primary key default gen_random_uuid(),
  event_code text not null,
  event_id uuid references public.events (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  secret text not null,
  rotation_seconds integer not null default 20,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists qr_sessions_event_code_idx
  on public.qr_sessions (event_code);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'qr_sessions_rotation_seconds_check'
  ) then
    alter table public.qr_sessions
      add constraint qr_sessions_rotation_seconds_check
      check (rotation_seconds between 15 and 30);
  end if;
end $$;

-- TOKEN USES
-- The replay ledger. One row per (session, slot, student) means a
-- code can only be spent once, by one person.
create table if not exists public.qr_token_uses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.qr_sessions (id) on delete cascade,
  token_slot integer not null,
  student_id uuid not null references auth.users (id) on delete cascade,
  used_at timestamptz not null default now(),
  unique (session_id, token_slot, student_id)
);

-- STUDENT DEVICES
-- The device an account is bound to. The first scan binds it, later
-- scans must come from the same device, and an administrator can
-- release the binding (which revokes the row rather than deleting it,
-- so the history survives).
create table if not exists public.student_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  device_id text not null,
  device_label text,
  bound_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  reset_by uuid references auth.users (id) on delete set null,
  reset_at timestamptz,
  reset_reason text,
  unique (user_id, device_id)
);

-- One live binding per account.
create unique index if not exists student_devices_active_user_key
  on public.student_devices (user_id)
  where revoked_at is null;

create index if not exists student_devices_user_idx
  on public.student_devices (user_id);

-- ATTENDANCE TRACE
-- Which live session and which slot produced a check-in. Nullable so
-- check-ins recorded before this phase (or by an administrator) still
-- work.
alter table public.attendance
  add column if not exists qr_session_id uuid references public.qr_sessions (id) on delete set null;
alter table public.attendance
  add column if not exists qr_token_slot integer;

-- APPEARANCE PREFERENCES
-- The language and theme a person picked. The app also keeps them in
-- local storage so a change applies instantly and works offline.
alter table public.profiles
  add column if not exists preferred_language text not null default 'en';
alter table public.profiles
  add column if not exists preferred_theme text not null default 'system';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_preferred_theme_check'
  ) then
    alter table public.profiles
      add constraint profiles_preferred_theme_check
      check (preferred_theme in ('light', 'dark', 'system'));
  end if;
end $$;

alter table public.profiles enable row level security;
alter table public.qr_sessions enable row level security;
alter table public.qr_token_uses enable row level security;
alter table public.student_devices enable row level security;

-- ------------------------------------------------------------
-- 2C. ROTATING QR FUNCTIONS
-- ------------------------------------------------------------

-- A fresh signing secret. Uses only core Postgres functions so it
-- works whether or not pgcrypto is installed.
create or replace function public.qr_new_secret()
returns text
language sql
volatile
as $$
  select encode(
    sha256(convert_to(
      random()::text || '|' || clock_timestamp()::text || '|' || gen_random_uuid()::text,
      'utf8'
    )),
    'hex'
  );
$$;

-- Signs a token body with the session secret. Uses HMAC-SHA256 when
-- pgcrypto is available and a keyed SHA-256 digest otherwise; both
-- produce a signature that cannot be produced without the secret.
create or replace function public.qr_sign(p_secret text, p_body text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_digest bytea;
begin
  if to_regprocedure('extensions.hmac(bytea,text,text)') is not null then
    select extensions.hmac(convert_to(p_body, 'utf8'), p_secret, 'sha256')
      into v_digest;
  else
    v_digest := sha256(convert_to(p_secret || p_body, 'utf8'));
  end if;

  return encode(v_digest, 'hex');
end;
$$;

-- Compares two strings without leaking where they differ.
create or replace function public.qr_safe_equal(p_left text, p_right text)
returns boolean
language sql
immutable
as $$
  select case
    when p_left is null or p_right is null then false
    when length(p_left) <> length(p_right) then false
    when length(p_left) = 0 then true
    else (
      select bool_and(substring(p_left from i for 1) = substring(p_right from i for 1))
      from generate_series(1, length(p_left)) as g(i)
    )
  end;
$$;

-- The time slot a code belongs to. Every code inside the same slot
-- is identical, which is what makes the QR refresh on a timer.
create or replace function public.qr_slot(p_at timestamptz, p_rotation_seconds integer)
returns integer
language sql
immutable
as $$
  select floor(extract(epoch from p_at) / greatest(1, p_rotation_seconds))::integer;
$$;

-- The signed part of a code: QR2.<session id>.<slot>
create or replace function public.qr_token_body(p_session_id uuid, p_slot integer)
returns text
language sql
immutable
as $$
  select 'QR2.' || p_session_id::text || '.' || p_slot::text;
$$;

-- Mints a fresh code for a teacher's event. Only the teacher who
-- owns the event (or an administrator) may call this.
create or replace function public.qr_issue_token(
  p_event_code text,
  p_rotation_seconds integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rotation integer := least(30, greatest(15, coalesce(p_rotation_seconds, 20)));
  v_event public.events%rowtype;
  v_session public.qr_sessions%rowtype;
  v_now timestamptz := now();
  v_slot integer;
  v_body text;
  v_token text;
  v_expires timestamptz;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to start a live QR.';
  end if;

  if p_event_code is null or trim(p_event_code) = '' then
    raise exception 'An event code is required.';
  end if;

  select * into v_event from public.events where event_code = trim(p_event_code);
  if not found then
    raise exception 'Event % does not exist.', p_event_code;
  end if;

  -- The teacher who owns the event starts the session. An event row
  -- that was auto-created by an early scan (an orphan) may be
  -- adopted, which is the same rule the events policies use.
  if v_event.created_by is distinct from auth.uid() then
    if v_event.created_by is not null and not public.is_admin() then
      raise exception 'Only the teacher who owns this event can start its live QR.';
    end if;
    update public.events set created_by = auth.uid() where id = v_event.id;
    v_event.created_by := auth.uid();
  end if;

  select * into v_session
    from public.qr_sessions
   where event_code = v_event.event_code
     and created_by = auth.uid()
     and is_active
   order by created_at desc
   limit 1;

  if not found then
    insert into public.qr_sessions (
      event_code, event_id, created_by, secret, rotation_seconds
    ) values (
      v_event.event_code, v_event.id, auth.uid(), public.qr_new_secret(), v_rotation
    )
    returning * into v_session;
  elsif v_session.rotation_seconds <> v_rotation then
    update public.qr_sessions
       set rotation_seconds = v_rotation, updated_at = now()
     where id = v_session.id
    returning * into v_session;
  end if;

  v_now := now();
  v_slot := public.qr_slot(v_now, v_session.rotation_seconds);
  v_body := public.qr_token_body(v_session.id, v_slot);
  v_token := v_body || '.' || public.qr_sign(v_session.secret, v_body);
  v_expires := to_timestamp((v_slot + 1) * v_session.rotation_seconds);

  return jsonb_build_object(
    'session_id', v_session.id,
    'token', v_token,
    'slot', v_slot,
    'event_code', v_event.event_code,
    'event_title', v_event.title,
    'rotation_seconds', v_session.rotation_seconds,
    'issued_at', v_now,
    'expires_at', v_expires,
    'refresh_in_seconds', greatest(
      1,
      floor(extract(epoch from (v_expires - v_now)))
    )::integer
  );
end;
$$;

-- Checks a code without recording anything. Returns the reason it
-- was rejected so the app can show the right message.
create or replace function public.qr_verify_token(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_parts text[];
  v_session_id uuid;
  v_slot integer;
  v_signature text;
  v_session public.qr_sessions%rowtype;
  v_now timestamptz := now();
  v_current integer;
  v_grace integer := 1;
begin
  if p_token is null or trim(p_token) = '' then
    return jsonb_build_object('valid', false, 'code', 'invalid');
  end if;

  v_parts := string_to_array(trim(p_token), '.');
  if array_length(v_parts, 1) <> 4 or v_parts[1] <> 'QR2' then
    return jsonb_build_object('valid', false, 'code', 'invalid');
  end if;

  begin
    v_session_id := v_parts[2]::uuid;
    v_slot := v_parts[3]::integer;
  exception when others then
    return jsonb_build_object('valid', false, 'code', 'invalid');
  end;

  v_signature := v_parts[4];

  select * into v_session from public.qr_sessions where id = v_session_id;
  if not found then
    return jsonb_build_object('valid', false, 'code', 'unknown_session');
  end if;

  if not public.qr_safe_equal(
    v_signature,
    public.qr_sign(v_session.secret, public.qr_token_body(v_session_id, v_slot))
  ) then
    return jsonb_build_object('valid', false, 'code', 'invalid');
  end if;

  if not v_session.is_active then
    return jsonb_build_object('valid', false, 'code', 'session_closed');
  end if;

  v_current := public.qr_slot(v_now, v_session.rotation_seconds);

  -- The slot in front of us does not exist yet, and anything older
  -- than the previous slot has expired.
  if v_slot > v_current or v_slot < v_current - v_grace then
    return jsonb_build_object(
      'valid', false,
      'code', 'expired',
      'slot', v_slot,
      'current_slot', v_current
    );
  end if;

  return jsonb_build_object(
    'valid', true,
    'code', 'ok',
    'session_id', v_session_id,
    'event_code', v_session.event_code,
    'slot', v_slot,
    'current_slot', v_current,
    'rotation_seconds', v_session.rotation_seconds,
    'expires_at', to_timestamp((v_current + 1) * v_session.rotation_seconds)
  );
end;
$$;

-- Records a check-in from a rotating code. This is the only write
-- path for attendance now, and it does every check in one go:
-- signature, session, event window, account, device binding, replay
-- and duplicate.
create or replace function public.record_attendance(
  p_token text,
  p_device_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_verify jsonb;
  v_valid boolean;
  v_code text;
  v_session public.qr_sessions%rowtype;
  v_event public.events%rowtype;
  v_device text := nullif(trim(coalesce(p_device_id, '')), '');
  v_bound public.student_devices%rowtype;
  v_role text;
  v_slot integer;
  v_status text;
  v_scanned_at timestamptz;
  v_now timestamptz := now();
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to record attendance.';
  end if;

  if v_device is null then
    return jsonb_build_object('ok', false, 'code', 'device_unknown');
  end if;

  select role into v_role from public.profiles where id = auth.uid();
  if v_role is distinct from 'student' then
    return jsonb_build_object('ok', false, 'code', 'not_a_student');
  end if;

  v_verify := public.qr_verify_token(p_token);
  v_valid := coalesce((v_verify ->> 'valid')::boolean, false);
  v_code := v_verify ->> 'code';

  if not v_valid then
    return jsonb_build_object('ok', false, 'code', v_code);
  end if;

  v_slot := (v_verify ->> 'slot')::integer;

  select * into v_session
    from public.qr_sessions
   where id = (v_verify ->> 'session_id')::uuid;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'unknown_session');
  end if;

  select * into v_event from public.events where id = v_session.event_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'unknown_event');
  end if;

  if v_event.start_time is not null and v_now < v_event.start_time then
    return jsonb_build_object(
      'ok', false, 'code', 'event_not_started', 'event_title', v_event.title
    );
  end if;

  if v_event.end_time is not null and v_now > v_event.end_time then
    return jsonb_build_object(
      'ok', false, 'code', 'event_ended', 'event_title', v_event.title
    );
  end if;

  if not exists (
    select 1 from public.profiles where id = auth.uid() and is_active
  ) then
    return jsonb_build_object('ok', false, 'code', 'account_deactivated');
  end if;

  -- Device binding. The first scan binds this device to the account;
  -- every later scan has to come from the same device.
  select * into v_bound
    from public.student_devices
   where user_id = auth.uid()
     and revoked_at is null
   limit 1;

  if found then
    if v_bound.device_id <> v_device then
      return jsonb_build_object(
        'ok', false, 'code', 'device_mismatch', 'event_title', v_event.title
      );
    end if;
    update public.student_devices set last_seen_at = now() where id = v_bound.id;
  else
    -- First scan from this account, or the binding was released by an
    -- administrator. Re-binding the same device revives the old row so
    -- the history of the binding is not lost.
    begin
      insert into public.student_devices (user_id, device_id)
      values (auth.uid(), v_device)
      on conflict (user_id, device_id)
      do update
        set last_seen_at = now(),
            revoked_at = null,
            reset_by = null,
            reset_at = now(),
            reset_reason = null;
    exception when unique_violation then
      -- Another device claimed the binding first.
      return jsonb_build_object(
        'ok', false, 'code', 'device_mismatch', 'event_title', v_event.title
      );
    end;
  end if;

  -- Already checked in for this event? Say so, and note the code as
  -- spent so the same code cannot be handed to somebody else.
  if exists (
    select 1 from public.attendance
     where student_id = auth.uid() and event_id = v_event.id
  ) then
    begin
      insert into public.qr_token_uses (session_id, token_slot, student_id)
      values (v_session.id, v_slot, auth.uid());
    exception when unique_violation then
      null;
    end;
    return jsonb_build_object(
      'ok', false, 'code', 'already_registered', 'event_title', v_event.title
    );
  end if;

  -- Replay guard: this exact code can only be spent once.
  begin
    insert into public.qr_token_uses (session_id, token_slot, student_id)
    values (v_session.id, v_slot, auth.uid());
  exception when unique_violation then
    return jsonb_build_object(
      'ok', false, 'code', 'already_scanned', 'event_title', v_event.title
    );
  end;

  begin
    insert into public.attendance (
      student_id, event_id, qr_session_id, qr_token_slot
    ) values (
      auth.uid(), v_event.id, v_session.id, v_slot
    )
    returning status, scanned_at into v_status, v_scanned_at;
  exception when unique_violation then
    return jsonb_build_object(
      'ok', false, 'code', 'already_registered', 'event_title', v_event.title
    );
  end;

  return jsonb_build_object(
    'ok', true,
    'code', 'ok',
    'event_title', v_event.title,
    'event_code', v_event.event_code,
    'status', coalesce(v_status, 'present'),
    'scanned_at', v_scanned_at,
    'slot', v_slot
  );
end;
$$;

-- Releases the device binding of an account. Administrators only.
-- The release is written to the audit log so it can be traced.
create or replace function public.reset_student_device(
  p_user_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_note text;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can reset a device binding.';
  end if;

  if p_user_id is null then
    raise exception 'An account is required.';
  end if;

  update public.student_devices
     set revoked_at = now(),
         reset_by = auth.uid(),
         reset_at = now(),
         reset_reason = nullif(trim(coalesce(p_reason, '')), '')
   where user_id = p_user_id
     and revoked_at is null;

  get diagnostics v_count = row_count;

  v_note := coalesce(
    nullif(trim(coalesce(p_reason, '')), ''),
    'Device binding reset by an administrator.'
  );

  insert into public.admin_audit_log (
    actor_id, actor_email, action, target_type, target_id, details
  ) values (
    auth.uid(),
    (select email from public.profiles where id = auth.uid()),
    'device_binding_reset',
    'profile',
    p_user_id::text,
    v_note || ' (' || v_count || ' binding(s) released)'
  );

  return jsonb_build_object('ok', true, 'code', 'reset', 'revoked', v_count);
end;
$$;

-- The device bindings of an account, for the admin screen.
create or replace function public.list_student_devices(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_admin() and auth.uid() is distinct from p_user_id then
    raise exception 'Only administrators can view device bindings.';
  end if;

  select coalesce(jsonb_agg(row_to_json(d) order by d.bound_at desc), '[]'::jsonb)
    into v_result
    from (
      select
        id,
        device_id,
        device_label,
        bound_at,
        last_seen_at,
        revoked_at,
        reset_at,
        reset_reason
      from public.student_devices
      where user_id = p_user_id
    ) d;

  return v_result;
end;
$$;

-- ------------------------------------------------------------
-- 3C. POLICIES
-- ------------------------------------------------------------

-- QR sessions: the teacher who owns the live session can read it,
-- administrators can read all of them. Students never need to.
drop policy if exists "Teachers can view their own QR sessions" on public.qr_sessions;
create policy "Teachers can view their own QR sessions"
  on public.qr_sessions for select
  using (auth.uid() = created_by);

drop policy if exists "Admins can view all QR sessions" on public.qr_sessions;
create policy "Admins can view all QR sessions"
  on public.qr_sessions for select
  using (public.is_admin());

-- Token uses: a student can see their own, administrators can see all.
drop policy if exists "Students can view their own token uses" on public.qr_token_uses;
create policy "Students can view their own token uses"
  on public.qr_token_uses for select
  using (auth.uid() = student_id);

drop policy if exists "Admins can view all token uses" on public.qr_token_uses;
create policy "Admins can view all token uses"
  on public.qr_token_uses for select
  using (public.is_admin());

-- Device bindings: a student can see their own, administrators can
-- see everyone's. Every write goes through the functions above, so
-- there are no insert/update/delete policies on purpose.
drop policy if exists "Students can view their own device binding" on public.student_devices;
create policy "Students can view their own device binding"
  on public.student_devices for select
  using (auth.uid() = user_id);

drop policy if exists "Admins can view all device bindings" on public.student_devices;
create policy "Admins can view all device bindings"
  on public.student_devices for select
  using (public.is_admin());

-- ------------------------------------------------------------
-- END OF PHASE 12
-- ------------------------------------------------------------

-- END OF SCHEMA
------------------------------------------------------------
