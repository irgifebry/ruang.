/**
 * Pure rules shared by the guest screens — the native mirror of the small
 * decisions in the web's `AuthForm`, reset-password page and consent screen.
 *
 * Kept free of React, Expo and `react-native` so `node --test` can drive the
 * rules a screen acts on: where `?next=` is allowed to land, when a form may
 * send an auth request, which notices a deep link asks for, and how Google's
 * error is worded to the visitor.
 */

import { safePath } from './safe-redirect.js';
import { IDLE_TIMEOUT_MS } from './idle-logout.js';

/**
 * `useLocalSearchParams` hands back a string, an array (repeated keys) or
 * `undefined`. A repeated `?next=` must not turn into an object later on —
 * only the first value is meaningful, matching `URLSearchParams.get()`.
 */
export function firstParam(value) {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : '';
  return typeof value === 'string' ? value : '';
}

/**
 * Where a successful sign-in lands. `safePath` rejects absolute,
 * protocol-relative and slash-backslash targets; on top of that, a `?next=`
 * pointing back at the auth screen itself would strand the visitor in a loop,
 * so it falls back to the tabs.
 */
export function authDestination(next, fallback = '/') {
  const path = safePath(next, fallback);
  return path === '/login' || path === '/register' ? fallback : path;
}

/**
 * The one gate in front of every auth request. With no site key configured
 * Turnstile renders nothing and the web form treats the captcha as ready;
 * with one configured, a missing token means no request goes out at all —
 * not the email submit, not the Google button.
 */
export function captchaReady(siteKey, captchaToken) {
  return !siteKey || Boolean(captchaToken);
}

/**
 * The three notices the web login form reads from its query string. All are
 * derived rather than stored in state, so a reload or back-navigation keeps
 * them. `error` is deliberately rendered as a fixed sentence: Better Auth's
 * own code is never shown to the visitor.
 */
export function authNotices({ mode = 'login', error, deleted, idle } = {}, timeout = IDLE_TIMEOUT_MS) {
  const isLogin = mode === 'login';
  return {
    oauthError: firstParam(error)
      ? 'Login dengan Google tidak selesai. Silakan coba lagi.'
      : null,
    deletionScheduled: isLogin && firstParam(deleted) === '1',
    idleSignedOut: isLogin && firstParam(idle) === '1',
    idleMinutes: Math.round(timeout / 60000),
  };
}

/** Login never echoes a server message — it would reveal whether an email exists. */
export const LOGIN_ERROR = 'Email atau kata sandi tidak cocok. Periksa lagi lalu coba masuk.';
export const CAPTCHA_ERROR = 'Selesaikan verifikasi keamanan terlebih dahulu.';
export const GOOGLE_ERROR = 'Tidak bisa terhubung ke Google. Coba lagi sebentar.';
export const SIGNUP_ERROR = 'Terjadi kesalahan saat mendaftar.';

/** The neutral login copy; registration may surface the server's message. */
export function authErrorMessage(mode, error) {
  if (mode === 'login') return LOGIN_ERROR;
  return error?.message || SIGNUP_ERROR;
}
