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
