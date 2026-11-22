-- Bootstrap schema for the "ruang." personal budgeting app.
--
-- This file targets a NEW project whose accounts are created by Better Auth.
-- Better Auth owns the public."user", "session", "account" and "verification"
-- tables; they are included here so a brand-new database is bootable from this
-- one file instead of depending on a separate CLI migration that arrives later.
-- Ids are `text` everywhere: Better Auth generates string ids and never writes
-- to auth.users.
--
-- `incomes` is the single money-in table — gaji bulanan, THR, bonus, dll.
-- Money in is never split across a monthly-salary table and an "extra" table,
-- and a profile does not mirror a salary amount.
--
-- Apply order: Better Auth tables -> app tables -> indexes -> signup trigger ->
-- RLS -> avatar bucket. An already-provisioned project does NOT run this file;
-- it runs supabase/migrations/, where 20261122_incomes_only.sql folds each old
-- salary row into an income and then drops the old salary table and column.

-------------------------------------------------------------------------------
-- Better Auth tables
-------------------------------------------------------------------------------

-- Column names are camelCase and quoted because that is exactly what Better
-- Auth sends to the Postgres adapter (see @better-auth/core/dist/db/get-tables.mjs
-- in node_modules). They are not a stylistic choice: renaming one to snake_case
-- would make every Better Auth query miss its column.
--
-- The last four columns on "user" are the `user.additionalFields` declared in
-- src/lib/auth.js. Better Auth supplies the ids itself, so no database default
-- is needed on `id`.
create table public."user" (
  id text primary key,
  name text not null,
  email text not null unique,
  "emailVerified" boolean not null default false,
  image text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  "userMetadata" jsonb,
  "appMetadata" jsonb,
  "invitedAt" timestamptz,
  "lastSignInAt" timestamptz
);

create table public."session" (
  id text primary key,
  "userId" text not null references public."user"(id) on delete cascade,
  "expiresAt" timestamptz not null,
  token text not null unique,
  "ipAddress" text,
  "userAgent" text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table public."account" (
  id text primary key,
  "userId" text not null references public."user"(id) on delete cascade,
  "accountId" text not null,
  "providerId" text not null,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  scope text,
  password text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table public."verification" (
  id text primary key,
  identifier text not null,
  value text not null,
  "expiresAt" timestamptz not null,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

comment on table public."user" is
  'Better Auth accounts. Owned by Better Auth; the app only reads it through its API.';
comment on table public."session" is
  'Better Auth sessions. A session row outlives the browser only until expiresAt.';
comment on table public."account" is
  'Better Auth credentials and linked OAuth accounts, one row per provider per user.';
comment on table public."verification" is
  'Better Auth one-time tokens (email verification and password reset).';
comment on column public."user".image is
  'Provider avatar URL. updateProfile() syncs this with the profile name in one transaction; profiles.avatar_path is the user-uploaded avatar instead.';

-------------------------------------------------------------------------------
-- App tables
-------------------------------------------------------------------------------

-- One row per Better Auth user. Identity and appearance only: no salary, no
-- account balance. Money in lives in `incomes`, money out in `expenses`.
create table public.profiles (
  id text primary key references public."user"(id) on delete cascade,
  name text check (name is null or char_length(trim(name)) between 1 and 60),
  avatar_path text check (
    avatar_path is null
    or avatar_path ~ '^[0-9a-fA-F-]{1,64}/avatar-[0-9a-zA-Z-]{8,36}\.(jpg|jpeg|png|webp|gif)$'
  ),
  theme text not null default 'dark' check (theme in ('dark', 'light', 'system')),
  -- Pending deletion, not a tombstone. "Hapus akun" stamps this and revokes
  -- every session; signing in again inside the seven-day grace period clears
  -- it. The sweep in /api/cron/purge-deletions is what eventually reads it.
  -- NULL on every live account.
  deletion_requested_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.profiles is
  'One row per Better Auth user: identity and appearance only. No salary column — every pemasukan is an incomes row.';
comment on column public.profiles.name is
  'Display name. Null means "fall back to the account email".';
comment on column public.profiles.avatar_path is
  'Path within the public avatars storage bucket, not a URL. Null means the initials avatar.';
comment on column public.profiles.theme is
  'Preferred theme. "system" follows the OS setting.';
comment on column public.profiles.deletion_requested_at is
  'Kapan pengguna meminta penghapusan akun. NULL = akun utuh. Diisi = semua sesi dicabut dan akun dihapus permanen setelah 7 hari, kecuali pengguna masuk lagi sebelum itu.';

-- Envelope categories chosen by the user. There is no salary-derived cap:
-- `monthly_limit` is whatever the user decides. Removing a category sets
-- `archived_at` rather than deleting the row: the label still belongs to past
-- expenses, while the category disappears from pickers and totals.
create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public."user"(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 60),
  monthly_limit numeric(14, 2) not null default 0 check (monthly_limit >= 0),
  color text not null default 'lime' check (color in ('lime', 'blue', 'orange', 'violet', 'pink')),
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

comment on table public.budgets is
  'Kategori amplop buatan pengguna. monthly_limit ditentukan pengguna, bukan dibatasi gaji/pemasukan.';

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public."user"(id) on delete cascade,
  category_id uuid not null references public.budgets(id) on delete cascade,
  description text not null check (char_length(trim(description)) between 1 and 80),
  amount numeric(14, 2) not null check (amount > 0),
  spent_on date not null default current_date,
  created_at timestamptz not null default now()
);

comment on table public.expenses is
  'Uang keluar, selalu dicatat di bawah satu kategori budgets.';

-- Every kind of money arriving in the account lives here: monthly salary,
-- THR, bonus, anything else. Deliberately *not* a category: `budgets` carries a
-- monthly limit, a colour and a cascade from `expenses`, none of which means
-- anything for money coming in. The free-text `source` is only a label; the
-- row is identified by `description`.
create table public.incomes (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public."user"(id) on delete cascade,
  description text not null check (char_length(trim(description)) between 1 and 80),
  source text check (source is null or char_length(trim(source)) between 1 and 40),
  amount numeric(14, 2) not null check (amount > 0),
  received_on date not null default current_date,
  created_at timestamptz not null default now()
);

comment on table public.incomes is
  'Semua pemasukan: gaji bulanan, THR, bonus, dll. Satu-satunya tabel uang masuk; source hanya label teks bebas, bukan kategori.';
comment on column public.incomes.source is
  'Label asal dana, opsional. String kosong disimpan NULL oleh API agar tidak ada label kosong.';

-------------------------------------------------------------------------------
-- Indexes
-------------------------------------------------------------------------------

create index session_user_id_idx on public."session"("userId");
create index account_user_id_idx on public."account"("userId");
create index verification_identifier_idx on public."verification"(identifier);

create index budgets_user_id_idx on public.budgets(user_id);
-- Case-insensitive unique name per user, matching the client-side duplicate
-- check. The deployed database only gained this in 20261122_incomes_only.sql.
create unique index budgets_user_active_lower_name_idx on public.budgets(user_id, lower(name)) where archived_at is null;
create index expenses_user_date_idx on public.expenses(user_id, spent_on desc);
-- History aggregates strictly by month, which this serves better than the
-- composite index above.
create index expenses_user_month_idx on public.expenses(user_id, spent_on);
create index incomes_user_date_idx on public.incomes(user_id, received_on desc);
-- Partial on purpose: the purge sweep reads flagged accounts and nothing else,
-- so an account that was never flagged never enters the index.
create index profiles_deletion_requested_at_idx
  on public.profiles (deletion_requested_at)
  where deletion_requested_at is not null;

-------------------------------------------------------------------------------
-- Signup trigger
-------------------------------------------------------------------------------

-- A new Better Auth account gets a profile and nothing else. No starter budget
-- categories: a new account lands on the empty states and names its own.
-- `on conflict (id) do nothing` keeps a duplicate profile from aborting the
-- signup. The name arrives as `new.name`; it is trimmed to NULL because
-- profiles.name rejects an empty string and Better Auth writes one for a
-- password signup with no name.
--
-- The month/date validators on the deployed project include functions that
-- were created ad-hoc in the dashboard and never captured in a migration; they
-- are not part of a fresh bootstrap — /api/ledger validates amounts and dates
-- before it writes a row.
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
  'Better Auth signup trigger: creates the profile only. No starter categories — a new account decides its own budget categories.';

create trigger on_better_user_created
  after insert on public."user"
  for each row execute function public.create_profile_for_better_user();

-------------------------------------------------------------------------------
-- Row level security
-------------------------------------------------------------------------------

-- RLS on with NO policies is deliberate, not an omission. These ids are text
-- Better Auth ids while auth.uid() is a uuid, so an ownership policy comparing
-- them would match nothing — it would look like protection while silently
-- denying every legitimate row. Do not add one.
--
-- With RLS enabled and no policies, anon and authenticated see zero rows over
-- PostgREST with the publishable key. Every app read and write goes through
-- /api/ledger (plus /api/account, /api/avatar and /api/auth/*), all of which use
-- the privileged DATABASE_URL client in src/lib/db.js that bypasses RLS. Better
-- Auth uses that same pool. Keep the service-role password out of NEXT_PUBLIC_*.
alter table public."user" enable row level security;
alter table public."session" enable row level security;
alter table public."account" enable row level security;
alter table public."verification" enable row level security;
alter table public.profiles enable row level security;
alter table public.budgets enable row level security;
alter table public.expenses enable row level security;
alter table public.incomes enable row level security;

-- ─── Avatar storage ──────────────────────────────────────────────────────────

-- Public bucket: an avatar is served straight into an <img>, so it has to be
-- readable without a session. Writes are performed by /api/avatar after it
-- checks the authoritative Better Auth session, and are keyed to the folder
-- name (<user_id>/...) rather than to anything the caller claims.
--
-- No storage.objects policies here for the same reason as table policies: a
-- folder check cannot use auth.uid() with a text Better Auth id, and one that
-- matched nothing would be worse than none. The privileged client used by the
-- API route bypasses RLS on storage.objects as it does on these tables.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;
