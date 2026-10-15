-- Schema for the "ruang." personal budgeting app.
--
-- Apply order matters: the tables first, then the trigger function, then RLS.
-- This file is the source of truth for a fresh database. Incremental changes to
-- an already-provisioned project live in supabase/migrations/.

-------------------------------------------------------------------------------
-- Tables
-------------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  salary numeric(14, 2) not null default 0 check (salary >= 0),
  name text check (name is null or char_length(trim(name)) between 1 and 60),
  avatar_path text check (avatar_path is null or char_length(avatar_path) <= 300),
  theme text not null default 'dark' check (theme in ('dark', 'light', 'system')),
  -- Pending account deletion, not a tombstone. "Hapus akun" only stamps this
  -- and revokes every session; signing in again inside the seven-day window
  -- clears it, and the sweep in /api/cron/purge-deletions is what eventually
  -- reads it. NULL on every live account.
  deletion_requested_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.profiles is
  'One row per user. salary mirrors the current month''s salary_record for convenience.';
comment on column public.profiles.name is
  'Display name. Null means "fall back to the account email".';
comment on column public.profiles.avatar_path is
  'Path within the public avatars storage bucket. Null means the initials avatar.';

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 60),
  monthly_limit numeric(14, 2) not null default 0 check (monthly_limit >= 0),
  color text not null default 'lime' check (color in ('lime', 'blue', 'orange', 'violet', 'pink')),
  created_at timestamptz not null default now()
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references public.budgets(id) on delete cascade,
  description text not null check (char_length(trim(description)) between 1 and 80),
  amount numeric(14, 2) not null check (amount > 0),
  spent_on date not null default current_date,
  created_at timestamptz not null default now()
);

-- Salary is stored per month rather than as a single mutable number, so that
-- raising it next month does not rewrite what past months appear to have been.
-- A month is only a history entry once the user saves a salary for it; a zero
-- amount counts as "not filled in".
create table public.salary_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  month date not null,
  amount numeric(14, 2) not null check (amount >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, month)
);

comment on table public.salary_records is
  'Gaji bulanan yang berlaku pada bulan tersebut (tanggal selalu tanggal 1).';

-- Money that arrives outside the salary: a THR, a bonus, anything else that
-- lands in the account. Not a cashback — that is a rebate on spending, and
-- counting it as inflow would overstate how much went out. Deliberately
-- *not* a category:
-- `budgets` is an envelope table, and a monthly limit, a colour and the cascade
-- from `expenses` mean nothing for money coming in. The free-text `source` is
-- only a label; the row itself is identified by `description`.
--
-- This is the fresh-project shape. The deployed project has `user_id` as text
-- pointing at Better Auth's `public."user"` instead, because Better Auth never
-- writes `auth.users`; see supabase/migrations/20261016_incomes.sql.
create table public.incomes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  description text not null check (char_length(trim(description)) between 1 and 80),
  source text check (source is null or char_length(trim(source)) between 1 and 40),
  amount numeric(14, 2) not null check (amount > 0),
  received_on date not null default current_date,
  created_at timestamptz not null default now()
);

comment on table public.incomes is
  'Uang masuk di luar gaji: THR, bonus, atau pemasukan lain di luar gaji. Gaji tetap dicatat di salary_records.';

-------------------------------------------------------------------------------
-- Indexes
-------------------------------------------------------------------------------

create index budgets_user_id_idx on public.budgets(user_id);
create index expenses_user_date_idx on public.expenses(user_id, spent_on desc);
create index incomes_user_date_idx on public.incomes(user_id, received_on desc);
-- History aggregates strictly by month, which this serves better than the
-- composite index above.
create index expenses_user_month_idx on public.expenses(user_id, spent_on);
-- Partial on purpose: the purge sweep reads flagged accounts and nothing else,
-- so an account that was never flagged never enters the index.
create index profiles_deletion_requested_at_idx
  on public.profiles (deletion_requested_at)
  where deletion_requested_at is not null;

-------------------------------------------------------------------------------
-- Signup trigger
-------------------------------------------------------------------------------

-- New accounts get a profile only; no starter categories are inserted by default.
-- The display name comes from whatever the signup form collected, so the sidebar
-- has something to show before the user visits settings.
--
-- The parallel trigger for Better Auth's own `public."user"` table lives in
-- supabase/migrations/20261014_no_starter_categories_on_signup.sql rather than
-- here, because Better Auth creates that table from its own migrations and it
-- may not exist yet when this file runs. Same rule: profile only.
create function public.create_profile_for_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name)
  values (new.id, nullif(trim(both from coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''))
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.create_profile_for_user();

-------------------------------------------------------------------------------
-- Row level security
-------------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.budgets enable row level security;
alter table public.expenses enable row level security;
alter table public.salary_records enable row level security;
alter table public.incomes enable row level security;

create policy "Users manage own profile" on public.profiles
  for all to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "Users manage own budgets" on public.budgets
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- The category_id guard stops a user from filing an expense under somebody
-- else's budget, which the ownership check on user_id alone would not catch.
create policy "Users manage own expenses" on public.expenses
  for all to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.budgets
      where budgets.id = expenses.category_id
        and budgets.user_id = (select auth.uid())
    )
  )
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.budgets
      where budgets.id = expenses.category_id
        and budgets.user_id = (select auth.uid())
    )
  );

create policy "Users manage own salary records" on public.salary_records
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users manage own incomes" on public.incomes
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ─── Avatar storage ──────────────────────────────────────────────────────────

-- Public bucket: an avatar is served straight into an <img>, so it must be
-- readable without a session. Writes are keyed to the folder name rather than
-- the caller's claim, so nobody can overwrite another user's avatar by posting
-- to their path.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "Users upload own avatar" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

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

create policy "Users delete own avatar" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Avatars are publicly readable" on storage.objects
  for select to public
  using (bucket_id = 'avatars');