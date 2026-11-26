/**
 * The one Turnstile site key and the token hand-off between the widget and the
 * HTTP client.
 *
 * The web form sends `x-captcha-response` on every auth request. On native the
 * widget lives in `TurnstileWidget.jsx` (a WebView — the only WebView in the
 * app), while the header is attached by `createApiClient()` from a
 * `getCaptchaToken` callback. Neither can import the other without dragging
 * React Native into the pure client, so the token passes through this module:
 * the widget calls `rememberCaptchaToken()` and the root layout hands
 * `getCaptchaToken` to `SessionProvider`.
 *
 * The value is a string, not state: a token that expired or errored arrives as
 * `''` and must read as absent on the very next request.
 */

/** Expo replaces `EXPO_PUBLIC_*` at build time — same key the widget reads. */
export const TURNSTILE_SITE_KEY = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY || '';

let currentToken = '';

/** Called by `TurnstileWidget`'s `onToken`, including its `''` reset signal. */
export function rememberCaptchaToken(token) {
  currentToken = typeof token === 'string' ? token : '';
  return currentToken;
}

/** Passed to `createApiClient`; resolves the token the widget last reported. */
export async function getCaptchaToken() {
  return currentToken;
}

/** Drops the token after a failed submit so a stale value cannot be reused. */
export function clearCaptchaToken() {
  currentToken = '';
}
