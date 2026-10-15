-- Income records: money that arrives outside the monthly salary.
--
-- Until now the only inflow the app knew about was `salary_records`, so "sisa
-- uang" was really "gaji minus pengeluaran". A THR, a
-- bonus or anything else that landed in the account used to have nowhere to go, which quietly made
-- the headline balance wrong for anyone whose income was not one fixed number
-- at the start of the month.
--
-- `incomes` is deliberately *not* a category. `budgets` is an envelope table:
-- it carries a monthly limit, a colour and a cascade from `expenses`, and none
-- of that means anything for money coming in. So income rows carry a free-text
-- `source` ("THR", "Bonus") that is only ever a label, and the
-- salary stays where it was — as the budget base, capped by `validateBudget`.
--
-- `user_id` is `text` here and points at `public."user"`, not `uuid` /
-- `auth.users` as `schema.sql` still says. That is not a mistake: this project's
-- users are created by Better Auth, which never writes `auth.users`, so a
-- foreign key to that table would reject every row the app tries to insert.
-- The columns on `budgets`, `expenses`, `profiles` and `salary_records` are
-- already `text` here for the same reason; this table follows them. A fresh
-- project should apply `schema.sql` instead, which keeps the uuid/auth.users
-- shape and the ownership policies.

create table if not exists public.incomes (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public."user"(id) on delete cascade,
  description text not null check (char_length(trim(description)) between 1 and 80),
  -- Free text and optional. The row is identified by `description`; this only
  -- says where the money came from, so an empty string is stored as NULL by
  -- the API rather than being kept as a blank label.
  source text check (source is null or char_length(trim(source)) between 1 and 40),
  amount numeric(14, 2) not null check (amount > 0),
  received_on date not null default current_date,
  created_at timestamptz not null default now()
);

comment on table public.incomes is
  'Uang masuk di luar gaji: THR, bonus, atau pemasukan lain di luar gaji. Gaji tetap dicatat di salary_records.';

-- Mirrors `expenses_user_date_idx`: the list screen and every monthly aggregate
-- read this table newest-first inside a month window, never the whole history
-- in one unordered scan.
create index if not exists incomes_user_date_idx
  on public.incomes (user_id, received_on desc);

-- Enabled with no policies, which is the state every other table on this
-- project is actually in (`pg_policies` returns nothing): RLS on with no
-- policy denies every row to `anon` and `authenticated`, so the table is
-- unreachable over PostgREST with the publishable key, while the service role
-- used by /api/ledger bypasses RLS as it does for every other table.
--
-- The ownership policies for a fresh project live in `schema.sql`. Adding one
-- here would be a change in kind, not just in shape: `auth.uid()` is a uuid
-- while `user_id` is a text Better Auth id, so a policy comparing them would
-- match nothing rather than protect anything.

alter table public.incomes enable row level security;