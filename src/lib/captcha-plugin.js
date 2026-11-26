/**
 * Turnstile for browsers, nothing extra for the native app.
 *
 * The web login/register form renders a Cloudflare widget and sends its token
 * on `x-captcha-response`. The native app has no captcha UI — asking a person
 * to solve a challenge inside an installed app would only punish them for
 * using the app — so its requests carry `x-ruang-app: 1` instead. A browser
 * always sends `sec-fetch-site` on a same-origin POST; React Native's fetch
 * does not. Requiring both signals keeps the browser path on captcha.
 *
 * Rate limiting in `auth.js` still applies to every sign-in, sign-up and
 * reset request. Captcha is a speed bump against automated web abuse, not the
 * only control, so this exemption does not leave the endpoints unguarded.
 */

import { captcha } from 'better-auth/plugins';

export function appAwareCaptcha(options) {
  const base = captcha(options);
  return {
    ...base,
    onRequest: async (request, ctx) => {
      const isNative =
        request.headers.get('x-ruang-app') === '1' &&
        !request.headers.has('sec-fetch-site');
      if (isNative) return undefined;
      return base.onRequest(request, ctx);
    },
  };
}
