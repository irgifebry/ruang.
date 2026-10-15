import { createAuthClient } from 'better-auth/react';

/**
 * No `baseURL` on purpose.
 *
 * `getBaseURL` returns the configured URL verbatim and never checks it against
 * the current origin, so pinning it to `NEXT_PUBLIC_BETTER_AUTH_URL` makes the
 * client call an absolute URL. On localhost that coincidentally still answers
 * 200, but the redirect plugin only navigates when `context.data.url` survives
 * — and a cross-origin response has none. The button then hangs on its busy
 * label forever. Omitting it falls back to `window.location.origin`, which is
 * same-origin in every environment and needs no per-deploy configuration.
 */
export const authClient = createAuthClient({});

export const { signIn, signUp, signOut, useSession, getSession, changePassword, requestPasswordReset, resetPassword } = authClient;

let sessionFlight = null;

/**
 * `getSession()`, but concurrent callers share one request.
 *
 * Four things mount on every authenticated page and each wanted the same answer:
 * `ThemeProvider`, `SidebarWithSession`, `IdleLogout` and (until it stopped
 * checking) `useLedgerData`. They all asked in their own effect, which React
 * flushes in a single pass, so they fired together and got four identical
 * `/api/auth/get-session` round trips — four copies of one question.
 *
 * This is a de-duplicator, not a cache. The in-flight promise is dropped the
 * moment it settles, so a caller that arrives a second later still gets a fresh
 * read and nothing is ever served stale. What changes is only that callers
 * arriving *while a read is running* wait on it instead of starting another.
 *
 * A rejection is passed through rather than thrown, and the flight is cleared on
 * the failure too: one caller cannot wedge the other three, and a later caller
 * is free to retry.
 */
export function getSharedSession() {
  if (!sessionFlight) {
    sessionFlight = getSession()
      .catch((error) => ({ data: null, error }))
      .finally(() => {
        sessionFlight = null;
      });
  }
  return sessionFlight;
}
