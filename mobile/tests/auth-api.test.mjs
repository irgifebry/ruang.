/**
 * The auth functions in `src/api/auth.js` run over the injected fake client:
 * which endpoint they hit, the bodies they send, the `auth` / `captcha`
 * options, and the `set-auth-token` capture from the response headers.
 *
 * Run with: cd mobile && node --test tests/auth-api.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  changePassword,
  getSession,
  requestPasswordReset,
  resetPassword,
  signInEmail,
  signOut,
  signUpEmail,
} from '../src/api/auth.js';

/**
 * A fake client that records each call as `{ path, method, body, headers, auth,
 * captcha }` and mirrors the real `createApiClient` contract:
 * - `requestRaw` resolves the response object — `{ status, ok, headers, body }`
 *   — and is the one that records;
 * - `request` unwraps `.body`, matching the restored Task 5 contract
 *   (parsed payload for `request`, response for `requestRaw`);
 * - `x-captcha-response` appears only when `captcha` is on and the fake has a
 *   token, `Authorization: Bearer` only when `auth` is on and a token is stored.
 */
function fakeClient({ responses = {}, captchaToken = null } = {}) {
  const calls = [];
  const state = { stored: null };
  const client = {
    calls,
    async requestRaw(path, options = {}) {
      const { method = 'POST', body, auth = true, captcha = false } = options;
      const headers = {};
      if (!auth && captcha && captchaToken) headers['x-captcha-response'] = captchaToken;
      if (auth && state.stored) headers.Authorization = `Bearer ${state.stored}`;
      calls.push({ path, method, body, headers, auth, captcha });
      return responses[path] ?? { status: 200, ok: true, headers: {}, body: {} };
    },
    async request(path, options = {}) {
      const response = await client.requestRaw(path, options);
      return response?.body ?? {};
    },
    async setToken(token) {
      state.stored = token;
    },
    async getToken() {
      return state.stored;
    },
    async clearToken() {
      state.stored = null;
    },
  };
  return client;
}

test('signInEmail posts to /api/auth/sign-in/email with the captcha header and auth:false', async () => {
  const client = fakeClient({ captchaToken: 'turnstile-1' });
  await signInEmail(client, { email: 'user@example.test', password: 'pw' });
  assert.equal(client.calls.length, 1);
  const call = client.calls[0];
  assert.equal(call.path, '/api/auth/sign-in/email');
  assert.equal(call.auth, false);
  assert.equal(call.captcha, true);
  assert.equal(call.headers['x-captcha-response'], 'turnstile-1');
  assert.deepEqual(call.body, { email: 'user@example.test', password: 'pw' });
});

test('signInEmail takes the token from the set-auth-token response header and returns it', async () => {
  const client = fakeClient({
    responses: {
      '/api/auth/sign-in/email': {
        status: 200,
        ok: true,
        // Mixed case on purpose: the header name is read case-insensitively.
        headers: { 'Set-Auth-Token': 'tok-1' },
        body: { user: { id: 'u1', email: 'user@example.test' } },
      },
    },
  });
  const result = await signInEmail(client, { email: 'user@example.test', password: 'pw' });
  assert.equal(result.token, 'tok-1');
  assert.equal(await client.getToken(), 'tok-1');
  assert.deepEqual(result.user, { id: 'u1', email: 'user@example.test' });
});

test('signUpEmail posts to /api/auth/sign-up/email with auth:false', async () => {
  const client = fakeClient();
  await signUpEmail(client, { email: 'user@example.test', password: 'pw', name: 'Rini' });
  assert.equal(client.calls[0].path, '/api/auth/sign-up/email');
  assert.equal(client.calls[0].auth, false);
  assert.deepEqual(client.calls[0].body, {
    email: 'user@example.test',
    password: 'pw',
    name: 'Rini',
  });
});

test('signOut calls /api/auth/sign-out and clears the local token', async () => {
  const client = fakeClient();
  await client.setToken('tok-1');
  await signOut(client);
  assert.equal(client.calls[0].path, '/api/auth/sign-out');
  assert.equal(await client.getToken(), null);
});

test('getSession reads /api/auth/get-session with the stored bearer and returns the session user', async () => {
  const client = fakeClient({
    responses: {
      '/api/auth/get-session': {
        status: 200,
        ok: true,
        headers: { 'Set-Auth-Token': 'tok-sess' },
        body: { user: { id: 'u2' }, session: { token: 'tok-sess' } },
      },
    },
  });
  await client.setToken('tok-1');
  const result = await getSession(client);
  assert.equal(client.calls[0].path, '/api/auth/get-session');
  assert.equal(client.calls[0].headers.Authorization, 'Bearer tok-1');
  assert.deepEqual(result.user, { id: 'u2' });
  assert.equal(result.token, 'tok-sess');
  assert.equal(await client.getToken(), 'tok-sess');
});

test('requestPasswordReset sends the redirectTo value verbatim', async () => {
  const client = fakeClient();
  const redirectTo = 'ruang://callback?next=%2Fsettings';
  await requestPasswordReset(client, { email: 'user@example.test', redirectTo });
  assert.equal(client.calls[0].path, '/api/auth/request-password-reset');
  assert.deepEqual(client.calls[0].body, { email: 'user@example.test', redirectTo });
});

test('resetPassword posts { token, newPassword } to /api/auth/reset-password', async () => {
  const client = fakeClient();
  await resetPassword(client, { token: 'rst-1', newPassword: 'pw' });
  assert.equal(client.calls[0].path, '/api/auth/reset-password');
  assert.deepEqual(client.calls[0].body, { token: 'rst-1', newPassword: 'pw' });
});

test('changePassword uses the bearer and stores the rotated set-auth-token', async () => {
  const client = fakeClient({
    responses: {
      '/api/auth/change-password': {
        status: 200,
        ok: true,
        headers: { 'Set-Auth-Token': 'tok-rotated' },
        body: { token: 'tok-rotated', user: { id: 'u3' } },
      },
    },
  });
  await client.setToken('tok-old');
  const result = await changePassword(client, {
    currentPassword: 'lama1234',
    newPassword: 'baru1234',
  });
  assert.equal(client.calls[0].path, '/api/auth/change-password');
  assert.equal(client.calls[0].auth, true);
  assert.equal(client.calls[0].headers.Authorization, 'Bearer tok-old');
  assert.deepEqual(client.calls[0].body, {
    currentPassword: 'lama1234',
    newPassword: 'baru1234',
    revokeOtherSessions: true,
  });
  assert.equal(result.token, 'tok-rotated');
  assert.equal(await client.getToken(), 'tok-rotated');
});
