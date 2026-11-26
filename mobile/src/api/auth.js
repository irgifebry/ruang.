/**
 * The auth functions for the mobile app — thin wrappers over the HTTP client.
 *
 * Most calls go through `client.requestRaw(path, { auth: false, captcha: true })`
 * because auth endpoints must not need a session; `getSession` and
 * `changePassword` authenticate with the stored bearer, since both operate on
 * the session they are reading or renewing. `signOut` reads nothing back and
 * clears the local token either way.
 *
 * Token capture: `auth.js` owns reading the `set-auth-token` response header —
 * case-insensitively — and storing it via `client.setToken()`, for every auth
 * response that carries one.
 *
 * This module is pure: no Expo imports. `expo-secure-store` lives in
 * `src/api/storage.js` and React lives in `src/state/SessionProvider.jsx`.
 */

const SET_AUTH_TOKEN_HEADER = 'set-auth-token';

const AUTH_PATHS = {
  signInEmail: '/api/auth/sign-in/email',
  signUpEmail: '/api/auth/sign-up/email',
  signInSocial: '/api/auth/sign-in/social',
  signOut: '/api/auth/sign-out',
  getSession: '/api/auth/get-session',
  requestPasswordReset: '/api/auth/request-password-reset',
  resetPassword: '/api/auth/reset-password',
  changePassword: '/api/auth/change-password',
};

function readSetAuthToken(response) {
  const headers = response?.headers;
  if (!headers || typeof headers !== 'object') return null;
  // A real fetch `Headers` instance: `get()` is the spec-safe reader and is
  // case-insensitive.
  if (typeof headers.get === 'function') return headers.get(SET_AUTH_TOKEN_HEADER) ?? null;
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === SET_AUTH_TOKEN_HEADER) return headers[key] ?? null;
  }
  return null;
}

/** Stores the header token on the client when the response carries one. */
async function captureToken(client, response) {
  const token = readSetAuthToken(response);
  if (token) await client.setToken(token);
  return token;
}

function responseUser(response) {
  return response?.body?.user ?? null;
}

export async function signInEmail(client, { email, password, captcha = true }) {
  const response = await client.requestRaw(AUTH_PATHS.signInEmail, {
    auth: false,
    captcha,
    body: { email, password },
  });
  const token = await captureToken(client, response);
  return { user: responseUser(response), token };
}

export async function signUpEmail(client, { email, password, name, captcha = true }) {
  const response = await client.requestRaw(AUTH_PATHS.signUpEmail, {
    auth: false,
    captcha,
    body: { email, password, ...(name ? { name } : {}) },
  });
  const token = await captureToken(client, response);
  return { user: responseUser(response), token };
}

/**
 * Native Google sign-in. `payload` comes from `buildSocialPayload()` — the
 * provider, the idToken (+ optional nonce) and `ruang://oauth-return` — so this
 * is the same Better Auth endpoint the web's `signIn.social` posts to, with no
 * new callback or client semantics. The `set-auth-token` header is captured
 * exactly as it is for email sign-in.
 */
export async function signInSocial(client, payload) {
  const response = await client.requestRaw(AUTH_PATHS.signInSocial, {
    auth: false,
    captcha: true,
    body: payload,
  });
  const token = await captureToken(client, response);
  return { user: responseUser(response), token };
}

export async function signOut(client) {
  await client.requestRaw(AUTH_PATHS.signOut, { auth: false, captcha: true });
  await client.clearToken();
}

export async function getSession(client) {
  const response = await client.requestRaw(AUTH_PATHS.getSession, { auth: true });
  const captured = await captureToken(client, response);
  return { user: responseUser(response), token: captured ?? (await client.getToken()) };
}

export async function requestPasswordReset(client, { email, redirectTo, captcha = true }) {
  const response = await client.requestRaw(AUTH_PATHS.requestPasswordReset, {
    auth: false,
    captcha,
    body: { email, redirectTo },
  });
  const token = await captureToken(client, response);
  return { user: null, token };
}

export async function resetPassword(client, { token, newPassword }) {
  const response = await client.requestRaw(AUTH_PATHS.resetPassword, {
    auth: false,
    captcha: true,
    // Better Auth's /reset-password schema is `{ token, newPassword }` — the
    // web client sends `newPassword` too. `password` is silently ignored by
    // the server, which then rejects the request as a missing field.
    body: { token, newPassword },
  });
  const captured = await captureToken(client, response);
  return { user: responseUser(response), token: captured };
}

/**
 * Changes a password the account already has.
 *
 * `revokeOtherSessions` is on for parity with the web panel. Better Auth then
 * deletes every session and mints a new one for this device, so the response's
 * `set-auth-token` has to be stored — keeping the old bearer would sign the
 * user out on their very next request. The create-first-password flow is a
 * different endpoint (`POST /api/account` in `account.js`).
 */
export async function changePassword(client, { currentPassword, newPassword, revokeOtherSessions = true }) {
  const response = await client.requestRaw(AUTH_PATHS.changePassword, {
    body: { currentPassword, newPassword, revokeOtherSessions },
  });
  const token = await captureToken(client, response);
  return { user: responseUser(response), token, body: response?.body ?? null };
}
