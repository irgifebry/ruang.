/**
 * The account calls behind the profile panels: exact paths, methods and
 * bodies. A fake client records them, so these assertions hold without a
 * server, a session or a device.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  cancelAccountDeletion,
  fetchAccountStatus,
  requestAccountDeletion,
  setPassword,
  updateProfile,
} from '../src/api/account.js';

function fakeClient() {
  const calls = [];
  const client = {
    calls,
    async request(path, options = {}) {
      calls.push({ path, ...options });
      return { ok: true };
    },
  };
  return client;
}

test('updateProfile is the single writer for profiles', async () => {
  const client = fakeClient();
  await updateProfile(client, { theme: 'light' });
  assert.deepEqual(client.calls, [
    { path: '/api/ledger', body: { action: 'updateProfile', patch: { theme: 'light' } } },
  ]);
});

test('account status is a GET, not a POST with an empty body', async () => {
  const client = fakeClient();
  await fetchAccountStatus(client);
  assert.deepEqual(client.calls, [{ path: '/api/account', method: 'GET' }]);
});

test('requestDeletion carries the password the server verifies', async () => {
  const client = fakeClient();
  await requestAccountDeletion(client, 'rahasia123');
  assert.deepEqual(client.calls, [
    { path: '/api/account', method: 'PATCH', body: { action: 'requestDeletion', password: 'rahasia123' } },
  ]);
});

test('cancelDeletion sends no password', async () => {
  const client = fakeClient();
  await cancelAccountDeletion(client);
  assert.deepEqual(client.calls, [
    { path: '/api/account', method: 'PATCH', body: { action: 'cancelDeletion' } },
  ]);
});

test('the first password uses POST /api/account, not Better Auth update-password', async () => {
  const client = fakeClient();
  await setPassword(client, 'kata-sandi-baru');
  assert.deepEqual(client.calls, [
    { path: '/api/account', method: 'POST', body: { newPassword: 'kata-sandi-baru' } },
  ]);
});
