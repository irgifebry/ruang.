/**
 * Account-level calls that Better Auth's HTTP surface does not expose.
 *
 * The web app has the same routes (`/api/account`, `/api/ledger`) behind its
 * own fetch helpers. Here they go through the one mobile HTTP client: bearer
 * token on every call, `Origin` of the API, and the same parsed-payload
 * contract `useLedgerData` already uses. Nothing in this module imports React
 * or Expo, so it runs under plain `node --test` with a fake client.
 *
 * The server owns the important decisions — whether a password exists, which
 * sessions get revoked, and the seven-day deletion flag. This module only
 * names the requests and carries the error messages back to the panels.
 */

const ACCOUNT_PATH = '/api/account';
const LEDGER_PATH = '/api/ledger';

/** The one writer for `profiles`, shared by identity and appearance. */
export function updateProfile(client, patch) {
  return client.request(LEDGER_PATH, { body: { action: 'updateProfile', patch } });
}

/** `{ hasPassword, providers }` for the signed-in user. */
export function fetchAccountStatus(client) {
  return client.request(ACCOUNT_PATH, { method: 'GET' });
}

/**
 * Schedules deletion; the server stamps the row and revokes every session.
 * The caller signs out afterwards, so the only way back in is signing in —
 * which is what clears the flag inside the grace period.
 */
export function requestAccountDeletion(client, password) {
  return client.request(ACCOUNT_PATH, {
    method: 'PATCH',
    body: { action: 'requestDeletion', password },
  });
}

/** Withdraws a pending deletion, for a session that survived the revoke. */
export function cancelAccountDeletion(client) {
  return client.request(ACCOUNT_PATH, {
    method: 'PATCH',
    body: { action: 'cancelDeletion' },
  });
}

/** The *first* password on an SSO-only account; the server refuses a second. */
export function setPassword(client, newPassword) {
  return client.request(ACCOUNT_PATH, { method: 'POST', body: { newPassword } });
}
