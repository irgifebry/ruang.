-- Database security hardening:
-- 1. Add SECURITY DEFINER and SET search_path = public to month validator functions,
--    and revoke EXECUTE from public, anon, and authenticated.
-- 2. Add check constraint on salary_records ensuring month is start of month.
-- 3. Add check constraint on profiles.avatar_path restricting format.
-- 4. Add Better Auth additional metadata and activity columns on "user".
-- 5. Revoke dangerous permissions on profiles from anon and authenticated.

-- ─── 1. Month validator functions hardening ─────────────────────────────────

do $$
begin
  if to_regprocedure('public.validate_expense_spent_on()') is not null then
    alter function public.validate_expense_spent_on() security definer set search_path = public;
    revoke execute on function public.validate_expense_spent_on() from public, anon, authenticated;
  end if;

  if to_regprocedure('public.validate_income_received_on()') is not null then
    alter function public.validate_income_received_on() security definer set search_path = public;
    revoke execute on function public.validate_income_received_on() from public, anon, authenticated;
  end if;

  if to_regprocedure('public.validate_salary_month()') is not null then
    alter function public.validate_salary_month() security definer set search_path = public;
    revoke execute on function public.validate_salary_month() from public, anon, authenticated;
  end if;

  if to_regprocedure('public.validate_expense_month()') is not null then
    alter function public.validate_expense_month() security definer set search_path = public;
    revoke execute on function public.validate_expense_month() from public, anon, authenticated;
  end if;
end;
$$;

-- ─── 2. Ensure salary month is start of month ────────────────────────────────

alter table salary_records drop constraint if exists salary_records_month_start_check;
alter table salary_records add constraint salary_records_month_start_check check (month = date_trunc('month', month)::date);

-- ─── 3. Restrict avatar_path format ──────────────────────────────────────────

alter table profiles drop constraint if exists profiles_avatar_path_format_check;
alter table profiles add constraint profiles_avatar_path_format_check check (avatar_path is null or avatar_path ~ '^[0-9a-fA-F-]{1,64}/avatar-[0-9a-zA-Z-]{8,36}\.(jpg|jpeg|png|webp|gif)$');

-- ─── 4. Better Auth additional columns on "user" ─────────────────────────────

alter table if exists "user" add column if not exists "userMetadata" jsonb;
alter table if exists "user" add column if not exists "appMetadata" jsonb;
alter table if exists "user" add column if not exists "invitedAt" timestamptz;
alter table if exists "user" add column if not exists "lastSignInAt" timestamptz;

-- ─── 5. Restrict direct DELETE & TRUNCATE on profiles ────────────────────────

revoke all on profiles from anon;
revoke delete, truncate on profiles from authenticated;
