import { betterAuth } from 'better-auth';
import bcrypt from 'bcrypt';
import { nextCookies } from 'better-auth/next-js';
import { captcha } from 'better-auth/plugins';

import { Resend } from 'resend';
import { getPool } from './db.js';
import { reconcileOnSignIn } from './account-purge.js';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const emailFrom = process.env.EMAIL_FROM || 'Ruang <onboarding@resend.dev>';

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

const plugins = [nextCookies()];
if (turnstileSecretKey) {
  plugins.push(
    captcha({
      provider: 'cloudflare-turnstile',
      secretKey: turnstileSecretKey,
      endpoints: ['/sign-in/email', '/sign-up/email'],
    }),
  );
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
    sendResetPassword: async ({ user, url, token }) => {
      if (!resend) {
        console.error('[Password Reset] RESEND_API_KEY not configured. Email not sent.');
        return;
      }

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
                <a href="${url}" style="background-color: #111827; color: #ffffff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px; display: inline-block;">
                  Atur Ulang Kata Sandi
                </a>
              </div>
              <p style="font-size: 12px; line-height: 1.5; color: #6b7280; margin-bottom: 8px;">
                Jika tombol di atas tidak berfungsi, salin dan buka tautan ini di browser:
              </p>
              <p style="font-size: 12px; word-break: break-all; color: #2563eb;">
                <a href="${url}" style="color: #2563eb;">${url}</a>
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
   * back — and this hook is the one place every sign-in passes through, whether
   * it arrives with a password, through Google, or from a session that was
   * merely refreshed.
   *
   * Returning `false` aborts the session insert, which is what makes an expired
   * account actually gone: `reconcileOnSignIn` has already destroyed its rows at
   * that point, so the sign-in that follows is refused rather than served.
   */
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
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
            // Fails open. Blocking every login because the sweep query failed
            // would be a far worse outcome than letting one flagged account in
            // for the hour before the cron notices — and the cron destroys it
            // regardless of what happens here.
            console.error('[auth] Could not reconcile a pending account deletion:', error);
          }
          return undefined;
        },
      },
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
