-- Account deletion with a seven-day grace period.
--
-- "Hapus akun" on /settings/profile does not delete anything. It stamps
-- `profiles.deletion_requested_at`, revokes every session, and leaves the rows
-- exactly where they are. Signing in again inside the window clears the stamp,
-- which is the whole restore path — there is nothing to rebuild because nothing
-- was ever removed.
--
-- The purge itself is `DELETE FROM public."user"`, which the app runs from
-- /api/cron/purge-deletions rather than from SQL. That is not a stylistic
-- choice: Supabase blocks `DELETE` on `storage.objects` from SQL precisely
-- because it leaves the file behind in the bucket, so an avatar can only be
-- removed through the Storage API. A database-only purge would strand every
-- deleted user's photo in a public bucket forever.

alter table public.profiles
  add column if not exists deletion_requested_at timestamptz;

comment on column public.profiles.deletion_requested_at is
  'Kapan pengguna meminta penghapusan akun. NULL = akun utuh. Diisi = semua sesi dicabut dan akun dihapus permanen setelah 7 hari, kecuali pengguna masuk lagi sebelum itu.';

-- The purge sweep reads exactly these rows and nothing else, so the index is
-- partial: an account that was never flagged never enters it.
create index if not exists profiles_deletion_requested_at_idx
  on public.profiles (deletion_requested_at)
  where deletion_requested_at is not null;

-- `security definer` is deliberately absent. Nothing here needs elevated rights,
-- and the routine deletes other people's rows — it runs as the caller, which is
-- the service role, and an anonymous PostgREST call cannot reach it because the
-- column is only ever written through /api/account.