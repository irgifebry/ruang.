/**
 * A 401 used to clear the token but leave `status: 'in'`, and the shell used
 * to render children for every status but 'loading' — so guests and expired
 * sessions sat on a ledger error whose retry always 401'd again. The guard is
 * two halves: the client's `onUnauthorized` drops the user and marks the
 * session out, and the shell redirects out to /login. The notice flags the
 * login screen reads must survive that redirect.
 *
 * The pure notice module is driven directly; the React wiring is source-level
 * because these components import `react-native` and cannot load in Node.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  clearLogoutNotice,
  createUnauthorizedHandler,
  loginPathForNotice,
  rememberLogoutNotice,
  takeLogoutNotice,
} from '../src/state/logout-notice.js';

const mobileRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(mobileRoot, path), 'utf8');

test('onUnauthorized clears the user and marks the session out', () => {
  const calls = [];
  const handler = createUnauthorizedHandler({
    setUser: (value) => calls.push(['user', value]),
    setStatus: (value) => calls.push(['status', value]),
    clearNotice: () => calls.push(['notice', null]),
  });
  handler();
  assert.deepEqual(calls, [
    ['notice', null],
    ['user', null],
    ['status', 'out'],
  ]);
});

test('the login path keeps the idle and deletion notices, then forgets them', () => {
  clearLogoutNotice();
  assert.equal(loginPathForNotice(takeLogoutNotice()), '/login');

  rememberLogoutNotice('idle');
  assert.equal(loginPathForNotice(takeLogoutNotice()), '/login?idle=1');
  assert.equal(takeLogoutNotice(), null, 'a notice must never leak into a later exit');

  rememberLogoutNotice('deleted');
  assert.equal(loginPathForNotice(takeLogoutNotice()), '/login?deleted=1');

  rememberLogoutNotice('something-else');
  assert.equal(loginPathForNotice(takeLogoutNotice()), '/login');
});

test('SessionProvider wires the 401 callback into the one API client', () => {
  const provider = read('src/state/SessionProvider.jsx');
  const clientBlock = provider.match(/createApiClient\(\{([\s\S]*?)\}\)/)?.[1];
  assert.ok(clientBlock, 'createApiClient must be called with an options object');
  assert.match(clientBlock, /onUnauthorized/);
  assert.match(provider, /createUnauthorizedHandler\(\{ setUser, setStatus \}\)/);
  assert.match(provider, /\[baseURL, storage, onUnauthorized\]/);
  assert.doesNotMatch(provider, /getCaptchaToken/);
});

test('the shell redirects guests through the flag and keeps the notice', () => {
  const shell = read('src/components/AppShell.jsx');
  assert.match(shell, /session\.status !== 'out'/);
  // A first-time guest sees the carousel; a returning one goes straight to
  // auth. A sign-out reason still wins and is carried to /login.
  assert.match(shell, /hasSeenOnboarding\(secureStorage\)/);
  assert.match(shell, /seen\s*\?\s*'\/login'\s*:\s*'\/onboarding'/);
  assert.match(shell, /loginPathForNotice\(notice\)/);
  assert.match(shell, /takeLogoutNotice\(\)/);
  assert.match(shell, /redirectedRef\.current/);
  // No ledger screen for a guest, loading only until the session resolves.
  // Demo is the exception: it has no session at all and still renders screens.
  assert.match(shell, /if \(!isDemo && session\.status !== 'in'\)/);
  assert.match(shell, /LoadingState/);
});

test('both notice-producing exits record their reason before signing out', () => {
  const idle = read('src/state/IdleLogout.jsx');
  assert.match(idle, /rememberLogoutNotice\('idle'\)/);
  assert.match(idle, /router\.replace\('\/login\?idle=1'\)/);

  const deletion = read('src/components/DeleteAccountPanel.jsx');
  assert.match(deletion, /rememberLogoutNotice\('deleted'\)/);
  assert.match(deletion, /login\?deleted=1/);
});

test('the idle guard is mounted once in the root layout, on bare routes too', () => {
  const root = read('app/_layout.jsx');
  assert.equal(root.match(/<IdleLogout \/>/g)?.length, 1);
  assert.equal(read('src/components/AppShell.jsx').match(/<IdleLogout \/>/g)?.length ?? 0, 0);
});

test('the account menu spells Bantuan correctly in both label and key', () => {
  const menu = read('src/components/AccountMenu.jsx');
  assert.doesNotMatch(menu, /Bantuh/);
  assert.match(menu, /\{ key: 'bantuan', label: 'Bantuan', icon: 'help', path: '\/help' \}/);
});

test('setPassword lives only in account.js, not as a second auth route', () => {
  const authApi = read('src/api/auth.js');
  assert.doesNotMatch(authApi, /update-password/);
  assert.doesNotMatch(authApi, /export async function setPassword/);
  assert.match(read('src/api/account.js'), /export function setPassword\(client, newPassword\)/);
});
