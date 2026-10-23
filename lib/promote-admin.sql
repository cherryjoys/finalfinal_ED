-- Creates the single administrator account.
--
-- 1. Replace admin@example.com below with the email of an account that has
--    already signed up.
-- 2. Run the WHOLE file in Supabase Dashboard -> SQL Editor.
-- 3. Sign out and back in on that account so the app reloads the new role.
--
-- The app cannot create or promote administrators. This script is the
-- provisioning step: it promotes the chosen account and demotes any other
-- administrator so exactly one admin remains.

begin;

alter table public.profiles
  disable trigger on_profile_privilege_guard;

update public.profiles p
set role = 'student',
    updated_at = now()
where p.role = 'admin'
  and lower(p.email) <> lower('admin@example.com')
  and exists (
    select 1
    from public.profiles target
    where lower(target.email) = lower('admin@example.com')
  );

update public.profiles
set role = 'admin',
    is_active = true,
    disabled_at = null,
    updated_at = now()
where lower(email) = lower('admin@example.com');

alter table public.profiles
  enable trigger on_profile_privilege_guard;

commit;

select id, email, full_name, role, is_active
from public.profiles
where role = 'admin'
order by created_at;
