-- Profile identity and appearance preferences.
--
-- Written defensively with IF NOT EXISTS / IF EXISTS because a project may have
-- already picked up parts of this by hand: `profiles.theme` existed on some
-- databases before the app had any code that used it. Every statement below is a
-- no-op where the change is already in place, so re-running is safe.

-- ─── 1. profiles: identity ───────────────────────────────────────────────────

-- The profile page has been writing `profiles.name` since it was added, but the
-- column was never created — so the update matched zero rows and the page then
-- rendered "no editable name field" because it guards on the column existing.
-- It also discarded the returned error, so a failed save reported success.
alter table public.profiles
  add column if not exists name text
    check (name is null or char_length(trim(name)) between 1 and 60);

comment on column public.profiles.name is
  'Display name. Null means "fall back to the account email".';

-- An earlier hand-applied attempt used `avatar_url`. `avatar_path` is the
-- accurate name: the column holds a storage object path, and the public URL is
-- derived from it. Renamed rather than added so no stale column is left behind.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'avatar_url'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'avatar_path'
  ) then
    alter table public.profiles rename column avatar_url to avatar_path;
  end if;
end
$$;

alter table public.profiles
  add column if not exists avatar_path text
    check (avatar_path is null or char_length(avatar_path) <= 300);

comment on column public.profiles.avatar_path is
  'Path within the public avatars storage bucket. Null means the initials avatar.';

-- Backfill from the name given at signup, so existing accounts are not left
-- nameless. `full_name` is the key the signup form writes; anything without one
-- keeps null and falls back to the email as before.
update public.profiles p
set name = nullif(trim(both from coalesce(u.raw_user_meta_data ->> 'full_name', '')), '')
from auth.users u
where u.id = p.id and p.name is null;

-- ─── 2. profiles: appearance ─────────────────────────────────────────────────

-- Stored per account rather than only in localStorage so the preference follows
-- the user to another device. localStorage still holds a copy, purely so the
-- page can paint the right colours before React hydrates.
alter table public.profiles drop constraint if exists profiles_theme_check;
alter table public.profiles
  add constraint profiles_theme_check
  check (theme in ('dark', 'light', 'system'));

comment on column public.profiles.theme is
  'Preferred theme. "system" follows the OS setting.';

-- Give a new account its display name up front, so the sidebar has something to
-- show before the user visits settings.
--
-- Only the profile insert changes. The starter-category rows this trigger also
-- creates on databases where 20261009 has not run are kept exactly as deployed:
-- whether they belong is that migration's decision, not this one's.
create or replace function public.create_profile_for_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name)
  values (new.id, nullif(trim(both from coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''));

  insert into public.budgets (user_id, name, monthly_limit, color)
  values
    (new.id, 'Makan & minum',       2400000, 'lime'),
    (new.id, 'Tempat tinggal',      3000000, 'blue'),
    (new.id, 'Transportasi',        1200000, 'orange'),
    (new.id, 'Tagihan',              950000, 'violet'),
    (new.id, 'Hiburan & gaya hidup', 1400000, 'pink');

  return new;
end;
$$;

-- ─── 3. Avatar storage ───────────────────────────────────────────────────────

-- Public bucket: an avatar is served straight into an <img>, so it has to be
-- readable without a session. Writes are keyed to the folder name rather than
-- the caller's claim, so nobody can overwrite another user's avatar by posting
-- to their path.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and policyname = 'Users upload own avatar'
  ) then
    create policy "Users upload own avatar" on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = (select auth.uid())::text
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and policyname = 'Users update own avatar'
  ) then
    create policy "Users update own avatar" on storage.objects
      for update to authenticated
      using (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = (select auth.uid())::text
      )
      with check (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = (select auth.uid())::text
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and policyname = 'Users delete own avatar'
  ) then
    create policy "Users delete own avatar" on storage.objects
      for delete to authenticated
      using (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = (select auth.uid())::text
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and policyname = 'Avatars are publicly readable'
  ) then
    -- Reads are public, matching the bucket. Scoped to it so a future private
    -- bucket is not accidentally exposed by this policy.
    create policy "Avatars are publicly readable" on storage.objects
      for select to public
      using (bucket_id = 'avatars');
  end if;
end
$$;