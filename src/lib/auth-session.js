import { auth } from './auth.js';

/**
 * Authoritative session read for sensitive endpoints.
 *
 * `auth.api.getSession()` normally answers from the signed cookie cache while
 * `session.cookieCache` is on (see `auth.js`). That trade-off is fine for a
 * dashboard read — a five-minute-old revocation decision is invisible to a
 * person — but not for revoking sessions, changing a password, scheduling an
 * account deletion or touching an avatar. A session cancelled in another tab,
 * or by the deletion sweep, must not be able to authorize any of those for the
 * rest of the cache window.
 *
 * `/api/ledger` deliberately keeps the cached read: its worst case is showing
 * stale data for five minutes, and it is reachable on every page load. This
 * helper is for the endpoints where the cost of a fresh database read is
 * dwarfed by the cost of honouring a dead session.
 *
 * Better Auth 1.7.7 declares `query: getSessionQuerySchema` on `/get-session`
 * and reads `ctx.query.disableCookieCache`. Passing the flag as a top-level
 * argument is silently ignored by validation, so it has to live under `query`.
 */
export async function getAuthoritativeSession(headers) {
  return auth.api.getSession({
    headers,
    query: { disableCookieCache: true },
  });
}
