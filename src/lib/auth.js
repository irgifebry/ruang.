import { betterAuth } from 'better-auth';
import bcrypt from 'bcrypt';
import { nextCookies } from 'better-auth/next-js';
import { bearer } from 'better-auth/plugins';
import { appAwareCaptcha } from './captcha-plugin.js';

import { Resend } from 'resend';
import { getPool } from './db.js';
import { reconcileOnSignIn } from './account-purge.js';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const emailFrom = process.env.EMAIL_FROM || 'Ruang <onboarding@resend.dev>';

/**
 * The reset URL is built from request-controlled values (origin, token, `next`).
 * Interpolating it raw into an HTML attribute or text node turns a reset email
 * into an injection vector, so every metacharacter is escaped before it goes
 * near the template. The token itself is never printed — only the URL is.
 */
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Google is opt-in through the environment rather than always declared.
 *
 * Better Auth registers a provider as soon as it appears in `socialProviders`,
 * and warns at boot when the credentials are half-present. Building the object
 * conditionally means a developer without OAuth keys still gets a clean start
 * and an app with only one of the two keys fails loudly instead of silently
 * offering a button that 500s on click.
 */
const googleClientId = process.env.AUTH_GOOGLE_ID;
const googleClientSecret = process.env.AUTH_GOOGLE_SECRET;

if (Boolean(googleClientId) !== Boolean(googleClientSecret)) {
  throw new Error(
    'Google OAuth needs both AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET. ' +
      'Set the missing one, or remove both to keep Google sign-in off.',
  );
}

const socialProviders = googleClientId
  ? {
      // A plain config object, not the `google()` factory: `socialProviders[key]`
      // is itself called as a function by better-auth, so handing it an already
      // built provider nests the credentials under `options` where the factory
      // never looks for them ("missing clientId or clientSecret" at boot).
      google: {
        clientId: googleClientId,
        clientSecret: googleClientSecret,
        // Ask for a refresh token so revoking the Google grant from the account
        // side cannot leave a stale, unrefreshable session behind.
        accessType: 'offline',
      },
    }
  : {};

const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const turnstileSecretKey = process.env.TURNSTILE_SECRET_KEY;

if (Boolean(turnstileSiteKey) !== Boolean(turnstileSecretKey)) {
  throw new Error('Set both NEXT_PUBLIC_TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY to enable Turnstile.');
}

/**
 * `bearer()` is what lets the native client in at all: it accepts
 * `Authorization: Bearer <token>` in place of the cookie the browser sends,
 * and returns the token on the `set-auth-token` header so the app can store it.
 * The web app never sends that header, so this changes nothing for it.
 */
const plugins = [bearer(), nextCookies()];
if (turnstileSecretKey) {
  plugins.push(
    appAwareCaptcha({
      provider: 'cloudflare-turnstile',
      secretKey: turnstileSecretKey,
      // The login form already sends `x-captcha-response` on all three flows.
      // Social sign-in creates a session too, so leaving it out would make the
      // captcha a detour around itself. The wrapper skips it for native app
      // requests, which identify themselves with `x-ruang-app: 1`.
      endpoints: ['/sign-in/email', '/sign-up/email', '/sign-in/social'],
    }),
  );
}

/**
 * Shared by the `create` and `update` session hooks. A refresh is a session
 * update in Better Auth, so registering only `create` left a flagged account
 * able to keep using a refreshed cookie without ever clearing the flag.
 *
 * Fail-open on purpose: an error in the sweep query must never lock out every
 * sign-in. The cron is still the backstop that destroys an expired account.
 */
async function reconcileBeforeSession(session) {
  if (!session?.userId) return undefined;
  try {
    const outcome = await reconcileOnSignIn(session.userId);
    if (outcome === 'deleted') {
      console.warn('[auth] Sign-in refused: the account was deleted after its grace period.');
      return false;
    }
    if (outcome === 'restored') {
      console.info('[auth] Sign-in restored an account pending deletion.');
    }
  } catch (error) {
    console.error('[auth] Could not reconcile a pending account deletion:', error);
  }
  return undefined;
}

export const auth = betterAuth({
  database: getPool(),
  emailAndPassword: {
    enabled: true,
    password: {
      hash: async (password) => {
        return await bcrypt.hash(password, 10);
      },
      verify: async ({ hash, password }) => {
        return await bcrypt.compare(password, hash);
      },
    },
    sendResetPassword: async ({ user, url }) => {
      if (!resend) {
        console.error('[Password Reset] RESEND_API_KEY not configured. Email not sent.');
        return;
      }

      const safeUrl = escapeHtml(url);

      try {
        const { error } = await resend.emails.send({
          from: emailFrom,
          to: user.email,
          subject: 'Atur ulang kata sandi akun ruang.',
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
              <h2 style="font-size: 20px; font-weight: 700; margin-bottom: 16px;">Atur Ulang Kata Sandi</h2>
              <p style="font-size: 14px; line-height: 1.6; color: #374151; margin-bottom: 24px;">
                Kami menerima permintaan untuk mereset kata sandi akun Anda di <strong>ruang.</strong>. Klik tombol di bawah ini untuk membuat kata sandi baru:
              </p>
              <div style="margin-bottom: 24px;">
                <a href="${safeUrl}" style="background-color: #111827; color: #ffffff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px; display: inline-block;">
                  Atur Ulang Kata Sandi
                </a>
              </div>
              <p style="font-size: 12px; line-height: 1.5; color: #6b7280; margin-bottom: 8px;">
                Jika tombol di atas tidak berfungsi, salin dan buka tautan ini di browser:
              </p>
              <p style="font-size: 12px; word-break: break-all; color: #2563eb;">
                <a href="${safeUrl}" style="color: #2563eb;">${safeUrl}</a>
              </p>
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
              <p style="font-size: 12px; color: #9ca3af;">
                Jika Anda tidak meminta pengaturan ulang ini, abaikan email ini.
              </p>
            </div>
          `,
        });

        if (error) {
          console.error('[Password Reset] Resend error:', error);
        } else {
          console.info('[Password Reset] Email sent successfully.');
        }
      } catch (err) {
        console.error('[Password Reset] Failed to send email via Resend:', err);
      }
    },
  },
  /**
   * Built-in rate limiting, keyed by client IP (Vercel forwards
   * `x-forwarded-for`, and `advanced.trustedProxyHeaders` is on below).
   *
   * The auth endpoints get tighter rules than the 60/minute default: ten
   * password or social sign-ins, five sign-ups and five reset requests per
   * minute per address. That still leaves room for retries on a slow network,
   * for password managers and for the e2e scripts, while putting a ceiling on
   * credential stuffing and reset-email flooding. Completing a reset gets a
   * little more headroom because a person may be pasting from an email client.
   *
   * Storage is the built-in in-memory one, so the limit is per server instance
   * on serverless. It is a speed bump, not a distributed quota — a durable
   * secondary storage would be needed for a global one.
   */
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    customRules: {
      '/sign-in/email': { window: 60, max: 10 },
      '/sign-in/social': { window: 60, max: 10 },
      '/sign-up/email': { window: 60, max: 5 },
      '/request-password-reset': { window: 60, max: 5 },
      '/reset-password': { window: 60, max: 10 },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // 1 day

    /**
     * Serve the session from a signed cookie instead of querying Postgres for
     * it. A cold dashboard used to look the session up six times — once in
     * `proxy.ts` on every request, four times from the components that each
     * called `getSession()` on mount, and once more inside `/api/ledger`. Every
     * one of those was a round trip to the database to read a row the previous
     * one had just read.
     *
     * `maxAge` is the real trade-off, so it is short on purpose: this is a cache
     * of a revocation decision, and for `maxAge` a session revoked elsewhere —
     * the idle auto-logout in another tab, a purge that ran the grace period
     * out — stays readable for at most that long. Five minutes is invisible to
     * a person and short enough that the window is not a way to keep using a
     * dead session. `signOut` deletes the cookie itself
     * (`deleteSessionCookie`), so the app's own logout never waits it out.
     */
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
      strategy: 'compact',
    },
  },
  baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3000',
  trustedOrigins: [
    process.env.BETTER_AUTH_URL,
    process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
    'http://localhost:3000',
    'https://ruang-cashflow.vercel.app',
    // The native app returns to its own scheme after a Google sign-in, and the
    // scheme is fixed at build time, so it is a literal rather than env-driven.
    'ruang://',
  ].filter(Boolean),
  advanced: {
    trustedProxyHeaders: true,
  },
  secret: process.env.BETTER_AUTH_SECRET,
  socialProviders,
  // A Google account that already has a ruang. login must land in the existing
  // user rather than being rejected as a duplicate email. Linking is limited to
  // Google and only on a provider-verified address, so an attacker cannot claim
  // an unverified email and take over the account.
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ['google'],
      allowDifferentEmails: false,
    },
  },
  plugins,
  /**
   * Signing in is the restore gesture for a pending account deletion.
   *
   * `/settings/profile` flags the account and signs the user out rather than
   * deleting anything, so "masuk lagi" is the only thing that has to bring it
   * back. `create` covers password and Google sign-ins; `update` covers a
   * refreshed session, which otherwise kept a flagged account alive without
   * ever clearing its flag. Both use the same fail-open helper above.
   *
   * Returning `false` aborts the session write, which is what makes an expired
   * account actually gone: `reconcileOnSignIn` has already destroyed its rows at
   * that point, so the sign-in that follows is refused rather than served.
   */
  databaseHooks: {
    session: {
      create: { before: reconcileBeforeSession },
      update: { before: reconcileBeforeSession },
    },
  },
  user: {
    additionalFields: {
      userMetadata: { type: 'json', required: false, input: false },
      appMetadata: { type: 'json', required: false, input: false },
      invitedAt: { type: 'date', required: false, input: false },
      lastSignInAt: { type: 'date', required: false, input: false },
    },
  },
});
