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
  const { rows } = await getPool().query(
    'SELECT deletion_requested_at FROM profiles WHERE id = $1',
    [userId]
  );
  const requestedAt = rows[0]?.deletion_requested_at;
  if (!requestedAt) return;

  if (isDeletionExpired(requestedAt)) {
    throw new Error('Masa tenggang penghapusan akun telah berakhir.');
  }

  await getPool().query(
    'UPDATE profiles SET deletion_requested_at = NULL WHERE id = $1',
    [userId]
  );
}

/**
 * Destroys one account: the avatar object, then every database row.
 *
 * The deletes are written out rather than left to a cascade: every `user_id`
 * is a text Better Auth id, but the tables do not all point at the same parent,
 * and a hand-applied profile can still be older than the current schema. An
 * explicit list behaves the same in both cases.
 */
export async function purgeAccount(userId) {
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT id, avatar_path FROM profiles WHERE id = $1',
    [userId]
  );
  const avatars = collectAvatars(rows);
  await destroyRows([userId], { requireDue: true, pool });
  await removeAvatars(avatars);
}

/**
 * Destroys every account whose grace period has run out.
 *
 * Returns the ids it removed, so the caller can log them. `pool` is injectable
 * so the re-check below can be exercised without a live database.
 */
export async function purgeExpiredAccounts({ pool = getPool() } = {}) {
  const due = await pool.query(
    `SELECT id, avatar_path FROM profiles
      WHERE deletion_requested_at IS NOT NULL
        AND deletion_requested_at <= now() - make_interval(days => $1)`,
    [DELETION_GRACE_DAYS]
  );

  const purged = [];
  for (const row of due.rows) {
    try {
      // The select above is a snapshot: a sign-in between it and this call
      // clears the flag. `requireDue` re-checks inside the delete transaction
      // and locks the row, so a restored account is never destroyed.
      await destroyRows([row.id], { requireDue: true, pool });
      await removeAvatars(collectAvatars([row]));
      purged.push(row.id);
    } catch (error) {
      if (error?.code === 'DELETION_CANCELLED') {
        console.info(`Skipped purging account ${row.id}: the deletion was cancelled mid-sweep.`);
        continue;
      }
      console.error(`Failed to purge account ${row.id}:`, error);
    }
  }

  return purged;
}

/**
 * Re-checks that an account is still due, inside the transaction that is about
 * to delete it.
 *
 * `FOR UPDATE` holds the profile row until commit, so a concurrent sign-in
 * cannot clear the flag between this check and the deletes. Both sides of the
 * deadline comparison are evaluated by Postgres `now()`: the sweep's first
 * select and this guard therefore agree even if the app server's clock drifts,
 * and a row whose flag was cleared after the select no longer matches at all.
 *
 * `DELETION_CANCELLED` is a control-flow signal, not a failed sweep — callers
 * skip the account without reporting an error.
 */
export async function assertStillDue(client, id) {
  const { rowCount } = await client.query(
    `SELECT id FROM profiles
      WHERE id = $1
        AND deletion_requested_at IS NOT NULL
        AND deletion_requested_at <= now() - make_interval(days => $2)
      FOR UPDATE`,
    [id, DELETION_GRACE_DAYS]
  );
  if (rowCount !== 1) {
    const error = new Error('Deletion was cancelled before the purge could run.');
    error.code = 'DELETION_CANCELLED';
    throw error;
  }
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
 * Every table that holds this user's data, written out rather than left to a
 * cascade: the rows are keyed by a text Better Auth id and the foreign keys do
 * not all share one parent, so an explicit list is the only shape that behaves
 * the same on an old and a current schema.
 *
 * One transaction for the whole batch — a partially swept table would leave the
 * next run unable to tell which accounts it already handled. `requireDue`
 * re-checks the flag and the deadline for every id before touching a row; the
 * forced purge from the sign-in hook passes it too, so a flag cleared mid-flight
 * cannot turn either path into a wrongful deletion.
 */
async function destroyRows(ids, { requireDue = false, pool = getPool() } = {}) {
  if (ids.length === 0) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const id of ids) {
      if (requireDue) await assertStillDue(client, id);
      await client.query('DELETE FROM expenses WHERE user_id = $1', [id]);
      await client.query('DELETE FROM incomes WHERE user_id = $1', [id]);
      await client.query('DELETE FROM budgets WHERE user_id = $1', [id]);
      await client.query('DELETE FROM profiles WHERE id = $1', [id]);
      await client.query('DELETE FROM "session" WHERE "userId" = $1', [id]);
      await client.query('DELETE FROM "account" WHERE "userId" = $1', [id]);
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

  // No profile row means the account was already purged (purge-race or a
  // partial signup that never completed). Treat as gone-and-clean so the
  // hook does not block the sign-in flow for unrelated users.
  if (rows.length === 0) return 'ok';

  const requestedAt = rows[0]?.deletion_requested_at;
  if (!requestedAt) return 'ok';

  if (isDeletionExpired(requestedAt)) {
    try {
      await purgeAccount(userId);
    } catch (error) {
      // A concurrent sign-in restored the account before the guarded delete
      // ran. Treat it as restored rather than failing open into a session for
      // an account whose flag is already gone.
      if (error?.code === 'DELETION_CANCELLED') return 'restored';
      throw error;
    }
    return 'deleted';
  }

  await cancelDeletion(userId);
  return 'restored';
}