-- Store salary per month and seed starter categories on signup.
--
-- Before this, `profiles.salary` was the single source of truth, so raising
-- your salary rewrote what every previous month appeared to have been. Salary
-- now lives in `salary_records`, keyed by the first of the month.

--------------------------------------------------------------------------------
-- Per-month salary
--------------------------------------------------------------------------------

create table if not exists public.salary_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  month date not null,
  amount numeric(14, 2) not null check (amount >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, month)
);

comment on table public.salary_records is
  'Gaji bulanan yang berlaku pada bulan tersebut (tanggal selalu tanggal 1).';

-- History aggregates strictly by month, which this serves better than the
-- existing (user_id, spent_on desc) composite index.
create index if not exists expenses_user_month_idx
  on public.expenses (user_id, spent_on);

alter table public.salary_records enable row level security;

drop policy if exists "Users manage own salary records" on public.salary_records;
create policy "Users manage own salary records" on public.salary_records
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

--------------------------------------------------------------------------------
-- Starter categories on signup
--------------------------------------------------------------------------------

-- Accounts created before this change were left with zero categories and no
-- way to add one from the UI, which dead-ended the whole onboarding flow.
create or replace function public.create_profile_for_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id);

  insert into public.budgets (user_id, name, monthly_limit, color)
  values
    (new.id, 'Makan & minum',        2400000, 'lime'),
    (new.id, 'Tempat tinggal',       3000000, 'blue'),
    (new.id, 'Transportasi',         1200000, 'orange'),
    (new.id, 'Tagihan',               950000, 'violet'),
    (new.id, 'Hiburan & gaya hidup', 1400000, 'pink');

  insert into public.salary_records (user_id, month, amount)
  values (new.id, date_trunc('month', current_date)::date, 0);

  return new;
end;
$$;

--------------------------------------------------------------------------------
-- Backfill for pre-existing accounts
--------------------------------------------------------------------------------

insert into public.salary_records (user_id, month, amount)
select p.id, date_trunc('month', current_date)::date, p.salary
from public.profiles p
on conflict (user_id, month) do nothing;

-- Only give the starter categories to accounts that have none at all; anyone
-- who already deleted a category on purpose keeps their list as it is.
insert into public.budgets (user_id, name, monthly_limit, color)
select p.id, v.name, v.monthly_limit, v.color
from public.profiles p
cross join (values
  ('Makan & minum',        2400000::numeric, 'lime'),
  ('Tempat tinggal',       3000000::numeric, 'blue'),
  ('Transportasi',         1200000::numeric, 'orange'),
  ('Tagihan',               950000::numeric, 'violet'),
  ('Hiburan & gaya hidup', 1400000::numeric, 'pink')
) as v(name, monthly_limit, color)
where not exists (
  select 1 from public.budgets b where b.user_id = p.id
);
