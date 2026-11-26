/**
 * Pure rules behind the guest screens: deep-link destinations, the captcha
 * gate, the three login notices and the token hand-off to the HTTP client.
 *
 * Run with: cd mobile && node --test tests/auth-flow.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { signInSocial } from '../src/api/auth.js';
import {
  authDestination,
  authErrorMessage,
  authNotices,
  captchaReady,
  firstParam,
  LOGIN_ERROR,
} from '../src/shared/auth-flow.js';
import { clearCaptchaToken, getCaptchaToken, rememberCaptchaToken } from '../src/shared/captcha.js';

test('firstParam follows URLSearchParams.get() for strings, arrays and missing keys', () => {
  assert.equal(firstParam('abc'), 'abc');
  assert.equal(firstParam(['first', 'second']), 'first');
  assert.equal(firstParam([]), '');
  assert.equal(firstParam(undefined), '');
  assert.equal(firstParam({ bad: true }), '');
});

test('authDestination accepts same-origin paths and rejects open redirects', () => {
  assert.equal(authDestination('/transactions?tab=bulan'), '/transactions?tab=bulan');
  assert.equal(authDestination('/settings/profile'), '/settings/profile');
  assert.equal(authDestination('https://evil.test'), '/');
  assert.equal(authDestination('//evil.test'), '/');
  assert.equal(authDestination('/\\evil.test'), '/');
  assert.equal(authDestination(null), '/');
});

test('authDestination does not bounce sign-in back into the auth screens', () => {
  assert.equal(authDestination('/login'), '/');
  assert.equal(authDestination('/register'), '/');
});

test('captchaReady gates every request when a site key is configured', () => {
  assert.equal(captchaReady('', ''), true, 'no site key: the widget does not render');
  assert.equal(captchaReady('site-key', ''), false, 'no token: no auth request may go out');
  assert.equal(captchaReady('site-key', 'token'), true);
});

test('authNotices word the three query flags once, with the shared idle window', () => {
  const notices = authNotices(
    { mode: 'login', error: 'google', deleted: '1', idle: '1' },
    15 * 60 * 1000,
  );
  assert.equal(notices.oauthError, 'Login dengan Google tidak selesai. Silakan coba lagi.');
  assert.equal(notices.deletionScheduled, true);
  assert.equal(notices.idleSignedOut, true);
  assert.equal(notices.idleMinutes, 15);

  const register = authNotices({ mode: 'register', deleted: '1', idle: '1' });
  assert.equal(register.deletionScheduled, false, 'the grace-period notice belongs to login');
  assert.equal(register.idleSignedOut, false);
  assert.equal(register.oauthError, null);
});

test('login errors stay neutral; registration may surface the server message', () => {
  assert.equal(authErrorMessage('login', new Error('user not found')), LOGIN_ERROR);
  assert.equal(authErrorMessage('register', new Error('Email sudah terdaftar')), 'Email sudah terdaftar');
});

test('the captcha token hand-off reads the latest widget value, including resets', async () => {
  clearCaptchaToken();
  assert.equal(await getCaptchaToken(), '');
  rememberCaptchaToken('turnstile-1');
  assert.equal(await getCaptchaToken(), 'turnstile-1');
  rememberCaptchaToken('');
  assert.equal(await getCaptchaToken(), '');
  rememberCaptchaToken('turnstile-2');
  clearCaptchaToken();
  assert.equal(await getCaptchaToken(), '');
});

test('signInSocial posts the native Google payload to the web endpoint and stores the token', async () => {
  const calls = [];
  const client = {
    calls,
    async requestRaw(path, options) {
      calls.push({ path, options });
      return {
        status: 200,
        ok: true,
        headers: { 'Set-Auth-Token': 'tok-social' },
        body: { user: { id: 'u1' } },
      };
    },
    async setToken(token) {
      this.stored = token;
    },
  };
  const payload = {
    provider: 'google',
    idToken: { token: 'id-token', nonce: undefined },
    callbackURL: 'ruang://oauth-return',
  };
  const result = await signInSocial(client, payload);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '/api/auth/sign-in/social');
  assert.equal(calls[0].options.auth, false);
  assert.equal(calls[0].options.captcha, true);
  assert.deepEqual(calls[0].options.body, payload);
  assert.equal(result.token, 'tok-social');
  assert.equal(client.stored, 'tok-social');
});
