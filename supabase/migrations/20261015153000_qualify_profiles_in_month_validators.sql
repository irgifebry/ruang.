-- Fix `relation "profiles" does not exist` (42P01) on every expense and salary write.
--
-- `20261011012126` hardened these two functions with `set search_path = ''`, which
-- is the right hardening: it stops a caller from steering unqualified name
-- resolution at a schema of their choosing. But the functions reference
-- `profiles` unqualified, and an empty search_path means nothing resolves it.
-- The hardening silently turned both functions into a guaranteed failure.
--
-- These functions were created ad-hoc in the dashboard SQL editor rather than in
-- a migration, which is why no file carried the matching `public.` prefix. This
-- one carries it, and recreates the triggers so a project that never had them
-- ends up with the same coverage as the deployed one.
--
-- No data is touched: the body is unchanged apart from qualifying the table.

create or replace function public.validate_expense_month()
returns trigger
language plpgsql
set search_path to ''
as $fn$
declare
    account_creation_timestamptz timestamptz;
    account_creation_date date;
    expense_month_date date;
begin
    select created_at into account_creation_timestamptz
      from public.profiles where id = NEW.user_id;
    if not found then
        raise exception 'Profile not found for user %', NEW.user_id;
    end if;
    account_creation_date := date_trunc('month', account_creation_timestamptz)::date;
    expense_month_date := date_trunc('month', NEW.spent_on)::date;
    if expense_month_date < account_creation_date then
        raise exception 'Cannot record expense for month % before account creation month %', expense_month_date, account_creation_date;
    end if;
    return NEW;
end;
$fn$;

create or replace function public.validate_salary_month()
returns trigger
language plpgsql
set search_path to ''
as $fn$
declare
    account_creation_timestamptz timestamptz;
    account_creation_date date;
    salary_month_date date;
begin
    select created_at into account_creation_timestamptz
      from public.profiles where id = NEW.user_id;
    if not found then
        raise exception 'Profile not found for user %', NEW.user_id;
    end if;
    account_creation_date := date_trunc('month', account_creation_timestamptz)::date;
    salary_month_date := date_trunc('month', NEW.month)::date;
    if salary_month_date < account_creation_date then
        raise exception 'Cannot set salary for month % before account creation month %', salary_month_date, account_creation_date;
    end if;
    return NEW;
end;
$fn$;

drop trigger if exists validate_expense_month_trigger on public.expenses;
create trigger validate_expense_month_trigger
before insert or update on public.expenses
for each row execute function public.validate_expense_month();

drop trigger if exists validate_salary_month_trigger on public.salary_records;
create trigger validate_salary_month_trigger
before insert or update on public.salary_records
for each row execute function public.validate_salary_month();