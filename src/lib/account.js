/**
 * Account-level calls that Better Auth's client does not expose.
 *
 * `authClient` knows how to change a password; it has no way to ask whether one
 * exists, and `setPassword` is a server-only endpoint with no HTTP path. Both
 * live behind `/api/account` instead.
 */

/** `{ hasPassword, providers, deletionRequestedAt }` for the signed-in user. */
export async function fetchAccountStatus() {
  const res = await fetch('/api/account');
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(data.error || 'Gagal memuat status akun.');
  }
  return data;
}

/**
 * Schedules the account for deletion and returns when it will be destroyed.
 *
 * The server revokes every session as part of this, so the caller signs the
 * browser out afterwards; nothing here waits for that.
 */
export async function requestAccountDeletion(password) {
  const res = await fetch('/api/account', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'requestDeletion', password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(data.error || 'Gagal menjadwalkan penghapusan akun.');
  }
  return data;
}

/**
 * Withdraws a pending deletion.
 *
 * Unreachable through the UI on purpose — the account is signed out the moment
 * it is requested, so signing back in is the restore. This exists for the case
 * where a session survived the revoke, such as one opened after the request.
 */
export async function cancelAccountDeletion() {
  const res = await fetch('/api/account', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'cancelDeletion' }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(data.error || 'Gagal membatalkan penghapusan akun.');
  }
  return data;
}

/**
 * Creates the first password on an account that has none.
 *
 * The server rejects this once a password exists, so a stale page cannot use it
 * to overwrite one.
 */
export async function setPassword(newPassword) {
  const res = await fetch('/api/account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newPassword }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(data.error || 'Gagal membuat kata sandi.');
  }
  return data;
}