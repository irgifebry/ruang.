-- New accounts start with a profile and nothing else.
--
-- 20261009 removed the starter categories, then 20261011 put them back. The
-- function 20261011 rewrote — to add `profiles.name` — also carried the five
-- `budgets` rows its comment described as "kept exactly as deployed", and
-- whichever migration touched the function last won. On this project the rows
-- came back.
--
-- A second trigger seeds the same five rows: `on_better_user_created` on
-- Better Auth's `public."user"` table, created in the dashboard rather than in
-- a migration, which is why 20261009 did not stop the password or Google
-- signups either. It is written down here now so it stops being folklore.
--
-- Only the two functions change. Existing accounts keep whatever categories
-- they already have; this is about future signups.

-- ─── auth.users ──────────────────────────────────────────────────────────────

-- `on conflict do nothing` is new here. A duplicate profile previously aborted
-- the whole user insert; now the signup still succeeds and the existing profile
-- stands, which is what the Better Auth trigger below already did.
create or replace function public.create_profile_for_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name)
  values (new.id, nullif(trim(both from coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''))
  on conflict (id) do nothing;

  return new;
end;
$$;

comment on function public.create_profile_for_user() is
  'Signup trigger: creates the profile only. No starter categories — a new account decides its own budget categories.';

-- ─── Better Auth's "user" table ──────────────────────────────────────────────

-- The display name arrives as `new.name`, so an account created through Better
-- Auth still gets one. It is trimmed to null because `profiles.name` rejects an
-- empty string, and Better Auth writes one for a password signup with no name.
create or replace function public.create_profile_for_better_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name)
  values (new.id, nullif(trim(both from coalesce(new.name, '')), ''))
  on conflict (id) do nothing;

  return new;
end;
$$;

comment on function public.create_profile_for_better_user() is
  'Better Auth signup trigger: creates the profile only. No starter categories.';

-- Better Auth owns `public."user"` and creates it from its own migrations, so on
-- a database where that has not run yet there is nothing to attach a trigger
-- to. Guarded rather than assumed, which also makes this safe to re-run.
do $$
begin
  if to_regclass('public."user"') is not null and not exists (
    select 1 from pg_trigger where tgname = 'on_better_user_created'
  ) then
    create trigger on_better_user_created
      after insert on public."user"
      for each row execute function public.create_profile_for_better_user();
  end if;
end
$$;
