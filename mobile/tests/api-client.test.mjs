import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ApiError, TOKEN_KEY, createApiClient } from '../src/api/client.js';

/**
 * `createApiClient` is the one HTTP client every mobile screen will call.
 * Everything outside is injected — `fetchImpl` and the storage adapter — so
 * this suite runs under plain `node --test` with no Expo runtime.
 */

function fakeFetch({ status = 200, body = {} } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return { status, ok: status >= 200 && status < 300, json: async () => body };
  };
  return { calls, fetchImpl };
}

function fakeStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    map,
    getItem: async (key) => map.get(key) ?? null,
    setItem: async (key, value) => {
      map.set(key, value);
    },
    removeItem: async (key) => {
      map.delete(key);
    },
  };
}

test('request sends Origin of the base URL origin and Content-Type application/json', async () => {
  const { calls, fetchImpl } = fakeFetch();
  const client = createApiClient({
    baseURL: 'https://api.test/v1',
    fetchImpl,
    storage: fakeStorage(),
  });
  await client.request('/ledger/me');
  const { headers } = calls[0].init;
  assert.equal(headers.Origin, 'https://api.test');
  assert.equal(headers['Content-Type'], 'application/json');
  // The server keeps captcha for browsers and skips it for the native client.
  assert.equal(headers['x-ruang-app'], '1');
});

test('a stored token is sent as Bearer in Authorization', async () => {
  const { calls, fetchImpl } = fakeFetch();
  const client = createApiClient({
    baseURL: 'https://api.test',
    fetchImpl,
    storage: fakeStorage({ [TOKEN_KEY]: 'tok-1' }),
  });
  await client.request('/me');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer tok-1');
});

test('a 401 clears the token, calls onUnauthorized once and still throws ApiError', async () => {
  const storage = fakeStorage({ [TOKEN_KEY]: 'stale' });
  let unauthorized = 0;
  const client = createApiClient({
    baseURL: 'https://api.test',
    fetchImpl: async () => ({ status: 401, ok: false, json: async () => ({}) }),
    storage,
    onUnauthorized: () => {
      unauthorized += 1;
    },
  });
  await assert.rejects(client.request('/me'), ApiError);
  assert.equal(storage.map.has(TOKEN_KEY), false, 'the stale token must be cleared');
  assert.equal(unauthorized, 1, 'onUnauthorized must fire exactly once');
});

test('an error response surfaces the body error as ApiError.message', async () => {
  const { fetchImpl } = fakeFetch({ status: 400, body: { error: 'Pesan' } });
  const client = createApiClient({
    baseURL: 'https://api.test',
    fetchImpl,
    storage: fakeStorage(),
  });
  await assert.rejects(client.request('/me'), (err) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 400);
    assert.equal(err.message, 'Pesan');
    return true;
  });
});

test('captcha: true adds x-captcha-response; without it the header is absent', async () => {
  const { calls, fetchImpl } = fakeFetch();
  const client = createApiClient({
    baseURL: 'https://api.test',
    fetchImpl,
    storage: fakeStorage(),
    getCaptchaToken: async () => 'captcha-1',
  });
  await client.request('/login', { auth: false, captcha: true });
  assert.equal(calls[0].init.headers['x-captcha-response'], 'captcha-1');

  await client.request('/logout', { auth: false });
  assert.ok(!('x-captcha-response' in calls[1].init.headers), 'no captcha, no header');
  assert.ok(!('Authorization' in calls[1].init.headers), 'auth: false, no header');
});

test('an empty baseURL falls back to the production default', async () => {
  const { calls, fetchImpl } = fakeFetch();
  const client = createApiClient({
    baseURL: '',
    fetchImpl,
    storage: fakeStorage(),
  });
  await client.request('/me');
  assert.equal(calls[0].url, 'https://ruang-cashflow.vercel.app/me');
  assert.equal(calls[0].init.headers.Origin, 'https://ruang-cashflow.vercel.app');
});

test('a relative base URL is rejected', async () => {
  const client = createApiClient({
    baseURL: '/api',
    fetchImpl: async () => ({}),
    storage: fakeStorage(),
  });
  await assert.rejects(client.request('/me'), TypeError);
});

test('request returns the parsed payload for a successful JSON response', async () => {
  const { fetchImpl } = fakeFetch({ status: 200, body: { user: { id: 'u1' }, token: 'tok' } });
  const client = createApiClient({
    baseURL: 'https://api.test',
    fetchImpl,
    storage: fakeStorage(),
  });
  const payload = await client.request('/me');
  assert.deepEqual(payload, { user: { id: 'u1' }, token: 'tok' });
});

test('requestRaw returns status/ok/headers/body, headers readable via Headers.get', async () => {
  const fetchImpl = async () => ({
    status: 200,
    ok: true,
    headers: new Headers({ 'Set-Auth-Token': 'tok-raw' }),
    json: async () => ({ user: { id: 'u1' } }),
  });
  const client = createApiClient({
    baseURL: 'https://api.test',
    fetchImpl,
    storage: fakeStorage(),
  });
  const raw = await client.requestRaw('/me');
  assert.equal(raw.status, 200);
  assert.equal(raw.ok, true);
  assert.equal(raw.headers.get('set-auth-token'), 'tok-raw');
  assert.deepEqual(raw.body, { user: { id: 'u1' } });
});

test('a multipart body reaches fetch untouched, with no JSON Content-Type', async () => {
  const { calls, fetchImpl } = fakeFetch();
  const client = createApiClient({ baseURL: 'https://api.test', fetchImpl, storage: fakeStorage() });
  const form = { append() {} }; // duck-typed: the platform supplies FormData
  await client.request('/api/avatar', { method: 'POST', body: form });
  assert.equal(calls[0].init.body, form, 'FormData must not be JSON-stringified');
  assert.ok(!('Content-Type' in calls[0].init.headers), 'fetch owns the multipart boundary');
  assert.equal(calls[0].init.headers.Origin, 'https://api.test');
});

test('a JSON body still gets the application/json header', async () => {
  const { calls, fetchImpl } = fakeFetch();
  const client = createApiClient({ baseURL: 'https://api.test', fetchImpl, storage: fakeStorage() });
  await client.request('/api/account', { method: 'PATCH', body: { action: 'cancelDeletion' } });
  assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
  assert.equal(calls[0].init.body, JSON.stringify({ action: 'cancelDeletion' }));
});
