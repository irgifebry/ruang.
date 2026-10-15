import { createClient } from '@supabase/supabase-js';
import { getPool } from './db.js';
import { DELETION_GRACE_DAYS, isDeletionExpired } from './account-deletion.js';

/**
 * Server-side half of account deletion. See `account-deletion.js` for the model.
 *
 * Nothing here is reachable from the browser: the callers are `/api/account`
 * (session-scoped, one account) and `/api/cron/purge-deletions` (cron secret).
 */

function storageAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Storage is not configured.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * Flags the account and returns the moment it will be destroyed.
 *
 * The write is idempotent: a second request keeps the original timestamp rather
 * than restarting the seven days, so repeatedly asking to delete cannot be used
 * to postpone the purge indefinitely.
 */
export async function requestDeletion(userId) {
  const { rows } = await getPool().query(
    `UPDATE profiles
        SET deletion_requested_at = COALESCE(deletion_requested_at, now())
      WHERE id = $1
      RETURNING deletion_requested_at`,
    [userId]
  );
  return rows[0]?.deletion_requested_at ?? null;
}

/** Clears the flag. A no-op once the row is gone, which is the point. */
export async function cancelDeletion(userId) {
  await getPool().query(
    'UPDATE profiles SET deletion_requested_at = NULL WHERE id = $1 AND deletion_requested_at IS NOT NULL',
    [userId]
  );
}

/**
 * Destroys one account: the avatar object, then every database row.
 *
 * The deletes are written out rather than left to the foreign keys. `schema.sql`
 * points `user_id` at `auth.users` while the deployed project points it at
 * Better Auth's `public."user"`, and a hand-applied profile can be either — an
 * explicit list behaves the same on all three.
 */
export async function purgeAccount(userId) {
  const { rows } = await getPool().query(
    'SELECT id, avatar_path FROM profiles WHERE id = $1',
    [userId]
  );
  const avatars = collectAvatars(rows);
  await destroyRows([userId]);
  await removeAvatars(avatars);
}

/**
 * Destroys every account whose grace period has run out.
 *
 * Returns the ids it removed, so the caller can log them.
 */
export async function purgeExpiredAccounts() {
  const due = await getPool().query(
    `SELECT id, avatar_path FROM profiles
      WHERE deletion_requested_at IS NOT NULL
        AND deletion_requested_at <= now() - make_interval(days => $1)`,
    [DELETION_GRACE_DAYS]
  );

  const ids = due.rows.map((row) => row.id);
  const avatars = collectAvatars(due.rows);

  await destroyRows(ids);
  await removeAvatars(avatars);

  return ids;
}

/**
 * The avatar paths worth removing, in one Storage API call.
 *
 * Filtered on the `<user_id>/` prefix the upload route writes. The path is read
 * from the database rather than rebuilt from the id, so a row pointing at
 * somebody else's folder — a hand-edited profile, a restored backup — cannot
 * turn a purge into a way to delete another user's photo.
 */
function collectAvatars(rows) {
  return rows
    .map((row) => row.avatar_path)
    .filter((path, index) => typeof path === 'string' && path.startsWith(`${rows[index].id}/`));
}

/**
 * Every table that holds this user's data, written out rather than left to the
 * foreign keys: `schema.sql` points `user_id` at `auth.users` while the deployed
 * project points it at Better Auth's `public."user"`, and a hand-applied profile
 * can be either. An explicit list behaves the same on all three.
 *
 * One transaction for the whole batch — a partially swept table would leave the
 * next run unable to tell which accounts it already handled.
 */
async function destroyRows(ids) {
  if (ids.length === 0) return;

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    for (const id of ids) {
      await client.query('DELETE FROM expenses WHERE user_id = $1', [id]);
      await client.query('DELETE FROM incomes WHERE user_id = $1', [id]);
      await client.query('DELETE FROM budgets WHERE user_id = $1', [id]);
      await client.query('DELETE FROM salary_records WHERE user_id = $1', [id]);
      await client.query('DELETE FROM profiles WHERE id = $1', [id]);
      await client.query('DELETE FROM "user" WHERE id = $1', [id]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Removes the objects through the Storage API, which is the only way Supabase
 * will actually delete the file — a SQL `DELETE` on `storage.objects` is
 * blocked for exactly that reason.
 *
 * A failure here leaves a photo behind but not a live account, so it is logged
 * rather than thrown: the sweep has already done the part the user asked for.
 */
async function removeAvatars(paths) {
  if (paths.length === 0) return;
  try {
    const { error } = await storageAdmin().storage.from('avatars').remove(paths);
    if (error) console.error('Avatar cleanup failed for purged accounts:', error);
  } catch (error) {
    console.error('Avatar cleanup failed for purged accounts:', error);
  }
}

/**
 * The restore path, called on every sign-in.
 *
 * `'ok'` when nothing was flagged — the overwhelmingly common case, and the one
 * that must not cost a query beyond the one it already makes. `'restored'` when
 * the stamp was cleared. `'deleted'` when the window had already run out: the
 * account is destroyed here and the caller refuses to sign in, rather than
 * handing back a session for an account the user was told had been erased.
 */
export async function reconcileOnSignIn(userId) {
  const { rows } = await getPool().query(
    'SELECT deletion_requested_at FROM profiles WHERE id = $1',
    [userId]
  );
  const requestedAt = rows[0]?.deletion_requested_at;
  if (!requestedAt) return 'ok';

  if (isDeletionExpired(requestedAt)) {
    await purgeAccount(userId);
    return 'deleted';
  }

  await cancelDeletion(userId);
  return 'restored';
}