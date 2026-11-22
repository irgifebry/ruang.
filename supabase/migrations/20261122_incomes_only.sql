-- 2026-11-22 — incomes only: fold salary history into `incomes`, then remove
-- the salary table, column and validator.
--
-- This project's ids are `text` and point at Better Auth's public."user"(id).
-- RLS is enabled with no policies on every table, so all app traffic goes
-- through /api/ledger (and the other /api routes) with a privileged database
-- client. This migration deliberately introduces neither auth.uid() nor
-- auth.users — neither can compare to a Better Auth id.
--
-- DESTRUCTIVE, BY DESIGN. After it runs there is no `salary_records` table and
-- no `profiles.salary` column to fall back to. Nothing of value is lost: every
-- salary row with amount > 0 becomes an ordinary income row below. Rows with
-- amount = 0 were placeholders for "not filled in" and carried no information,
-- so they are not converted. Take a backup before running this on production.
--
-- The whole file is one transaction: either the conversion and the drops all
-- land, or none of them do.

begin;

-- 1. Convert the old salary history into income rows. `salary_records.month`
--    is always the first of the month (salary_records_month_start_check), so it
--    is a valid `received_on`. `updated_at` is the closest thing to a time the
--    salary was actually recorded; COALESCE is defensive because the column is
--    NOT NULL with a default already.
--    Each row gets a fresh uuid. `incomes` has no natural key and no unique
--    constraint, so there is nothing to collide with and no ON CONFLICT clause
--    is needed: two "Gaji" rows for one user are perfectly legal.
insert into public.incomes
  (id, user_id, description, source, amount, received_on, created_at)
select gen_random_uuid(), user_id, 'Gaji', 'Gaji', amount, month,
       coalesce(updated_at, now())
from public.salary_records
where amount > 0;

-- 2. `incomes` is no longer "money in outside salary" — it is the one table for
--    every kind of pemasukan, the monthly salary included. The old wording
--    ("uang masuk di luar gaji ... Gaji tetap dicatat di salary_records") is
--    now a lie, so replace it.
comment on table public.incomes is
  'Semua pemasukan: gaji bulanan, THR, bonus, dll. source hanya label teks bebas, bukan kategori.';

-- 3. Drop the salary month validator before its table goes away. Order matters:
--    a trigger outliving its function would break every remaining write to the
--    table for the rest of this transaction.
drop trigger if exists validate_salary_month_trigger on public.salary_records;
drop function if exists public.validate_salary_month();

-- 4. The table itself. Its non-zero rows survive as incomes from step 1; the
--    zero and negative rows were placeholders and incomes requires amount > 0,
--    so dropping the table is the last word on them.
drop table if exists public.salary_records;

-- 5. profiles.salary only mirrored the current month's salary_record. With the
--    table gone there is nothing left for the mirror to mirror.
alter table public.profiles drop column if exists salary;

-- 6. Restore the case-insensitive per-user budget-name uniqueness that existed
--    only in schema.sql. Deployed data can currently contain two categories
--    with the same name; if that has actually happened, this index fails and
--    rolls the whole migration back. That is intentional — the duplicates need
--    a decision from a human, not a silent swallow.
create unique index if not exists budgets_user_lower_name_idx
  on public.budgets (user_id, lower(name));

-- 7. Undo the search_path regression from 20261017_backend_security_fixes.sql.
--    That migration set the validator functions to `search_path = public`;
--    20261011012126 and 20261015153000 had deliberately hardened them to ''.
--    With `public` writable by the authenticated role, a caller can shadow a
--    built-in used inside a SECURITY DEFINER trigger function.
--
--    validate_expense_month() is the only remaining validator whose body is
--    in this repo (20261015153000). It is recreated below with the exact same
--    logic, `public.profiles` fully qualified, `security definer` (added by
--    20261017) and `set search_path = ''`. The trigger that fires it is left
--    untouched, so no rewrite of expenses is needed.
create or replace function public.validate_expense_month()
returns trigger
language plpgsql
security definer
set search_path = ''
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

-- 20261017 revoked these from public/anon/authenticated. `create or replace`
-- does not change existing grants, but re-apply it so the end state is the
-- same even on a project where that revoke was never run.
revoke execute on function public.validate_expense_month() from public, anon, authenticated;

-- validate_salary_month() needs no action here: step 3 dropped it.
--
-- validate_expense_spent_on() and validate_income_received_on() were created
-- ad-hoc in the dashboard and their bodies were never committed to this repo.
-- Blindly setting their search_path to '' is what broke the month validators
-- in 20261011 (42P01: an unqualified `profiles` does not resolve with an empty
-- path), so do not repeat that gamble. pg_catalog is always searched, even
-- with an empty path, so a body that only touches NEW.* and built-ins like
-- date_trunc() is safe to harden; one that reads a relation is not. Harden the
-- former, leave the latter alone with a NOTICE so it can be captured in a
-- migration once its body has been read from the deployed database.
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature, p.prosrc as body
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('validate_expense_spent_on', 'validate_income_received_on')
  loop
    if fn.body !~* '\y(from|join|update|insert|delete|into)\y' then
      execute format($cmd$alter function %s set search_path = ''$cmd$, fn.signature);
      raise notice 'hardened search_path for %', fn.signature;
    else
      raise notice 'left search_path unchanged for %: body references a relation; capture it in a migration first', fn.signature;
    end if;
  end loop;
end
$$;

commit;
