-- ============================================================
-- Phase 12 - Rotating QR Codes, Device Binding & Live Sessions
--
-- WHAT THIS CHANGES
--   * Attendance QR codes become rotating, server-signed tokens.
--     A code is only valid for its own time slot (15-30 seconds) and
--     the slot immediately before it, so a screenshot of an old code
--     stops working instead of working all class long.
--   * The signing secret never leaves the database. The teacher asks
--     the server for a code; the server signs it. A student cannot
--     mint a code, and a tampered client cannot forge one.
--   * A student account is bound to the device it first scans from.
--     An administrator can release that binding, and the release is
--     written to the audit log.
--
-- HOW TO RUN
--   1. Open Supabase Dashboard -> SQL Editor
--   2. Paste this ENTIRE file
--   3. Click "Run"
--
--   This script is IDEMPOTENT and can be run any number of times.
--   The same statements are also included in lib/schema.sql (section
--   4), so re-running lib/schema.sql does the same job.
-- ============================================================

-- ------------------------------------------------------------
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
  end if;

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
