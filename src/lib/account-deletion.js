/**
 * Account deletion: request, restore, purge.
 *
 * "Hapus akun" on /settings/profile does not delete anything. It stamps
 * `profiles.deletion_requested_at`, signs the user out everywhere, and leaves
 * every row in place. Signing in again inside the grace period clears the stamp
 * and the account is whole again — there is nothing to rebuild, because nothing
 * was ever removed.
 *
 * Past the window a sweep deletes the Better Auth user row, and the cascade
 * takes `profiles`, `budgets`, `expenses`, `salary_records`, `session` and
 * `account` with it. The avatar is the one thing a cascade cannot reach: Supabase
 * blocks `DELETE` on `storage.objects` from SQL precisely because it orphans the
 * file, so that removal goes through the Storage API.
 *
 * The sweep runs from `/api/cron/purge-deletions` rather than from `pg_cron`,
 * which would have been a single line in the migration but could only ever
 * delete the database rows.
 */

/** How long a flagged account survives before it is destroyed. */
export const DELETION_GRACE_DAYS = 7;

const MS_PER_DAY = 86_400_000;

/**
 * When a flagged account is destroyed, or `null` when it was never flagged.
 *
 * The window is measured from the request, not from a scheduled purge, so
 * "7 hari" in the dialog is the same number the sweep compares against.
 */
export function deletionDeadline(requestedAt) {
  const date = toInstant(requestedAt);
  return date ? new Date(date.getTime() + DELETION_GRACE_DAYS * MS_PER_DAY) : null;
}

/** True once the deadline has passed — the sweep is free to destroy it. */
export function isDeletionExpired(requestedAt, now = new Date()) {
  const deadline = deletionDeadline(requestedAt);
  if (!deadline) return false;
  return (toInstant(now) ?? new Date()).getTime() >= deadline.getTime();
}

/** Milliseconds left before the purge, floored at zero. */
export function graceRemainingMs(requestedAt, now = new Date()) {
  const deadline = deletionDeadline(requestedAt);
  if (!deadline) return 0;
  return Math.max(0, deadline.getTime() - (toInstant(now) ?? new Date()).getTime());
}

/**
 * The countdown the profile panel shows, in words.
 *
 * Rounded *down* to whole days on purpose. A user with 6 days and 23 hours left
 * reading "7 hari" is being told the truth about which side of the deadline they
 * are on; rounding up would claim a day that has not happened yet.
 */
export function formatGraceRemaining(requestedAt, now = new Date()) {
  const ms = graceRemainingMs(requestedAt, now);
  if (ms <= 0) return 'saat ini';

  const days = Math.floor(ms / MS_PER_DAY);
  const hours = Math.floor((ms % MS_PER_DAY) / 3_600_000);
  const minutes = Math.max(1, Math.floor((ms % 3_600_000) / 60_000));

  if (days >= 1) return hours > 0 ? `${days} hari ${hours} jam` : `${days} hari`;
  if (hours >= 1) return `${hours} jam`;
  return `${minutes} menit`;
}

/**
 * Postgres hands back a `timestamptz` as an ISO string with an offset, which
 * `new Date()` reads correctly. Anything else — a null, an empty string, junk —
 * is "no request on record" rather than an exception, because every caller here
 * runs on a code path that must not break an account over a bad column value.
 */
function toInstant(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}