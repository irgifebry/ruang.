'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import Script from 'next/script';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { signIn, signUp } from '@/lib/auth-client';
import { IDLE_TIMEOUT_MS } from '@/lib/idle-logout';
import { Button, FormMessage, TextField } from './form';
import { EyeClosedIcon, EyeIcon, GoogleIcon } from './icons';
import { Toast } from './toast';

const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

/**
 * Login and registration, sharing one form.
 *
 * The previous version lived at `app/auth/[mode]/page.jsx` and was imported
 * *from a page file* by `/login` and `/register`. Importing across route files
 * means two routes compile the same component as a page entry, which is fragile
 * and duplicates the route in the build output. This is now a plain component
 * and `/login` and `/register` are thin wrappers.
 */
export default function AuthForm({ mode }) {
  return (
    <Suspense fallback={null}>
      <AuthFormInner mode={mode} />
    </Suspense>
  );
}

function AuthFormInner({ mode }) {
  const isLogin = mode === 'login';
  const router = useRouter();
  const searchParams = useSearchParams();

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState(false);
  const [formError, setFormError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [captchaToken, setCaptchaToken] = useState('');
  const captchaReady = !turnstileSiteKey || Boolean(captchaToken);

  /** Where to land after a successful sign-in. */
  const next = searchParams.get('next') || '/';

  // Same-origin relative paths only, so `?next=` cannot be used as an open
  // redirect to an attacker-controlled host. Shared by both sign-in paths.
  const destination = next.startsWith('/') && !next.startsWith('//') ? next : '/';

  // A Google flow that ends badly (consent declined, account already linked to
  // somebody else) is bounced back here by `errorCallbackURL` below. Read from
  // the query rather than state so a reload or back-navigation keeps the
  // message, and never surface Better Auth's own error code.
  const oauthError = searchParams.get('error')
    ? 'Login dengan Google tidak selesai. Silakan coba lagi.'
    : null;

  // A deletion request signs the user out, so this is the first thing they read
  // afterwards. Without it the logout looks like the account was erased on the
  // spot, which is exactly the opposite of what the grace period is for.
  const deletionScheduled = isLogin && searchParams.get('deleted') === '1';

  // Idle auto-logout lands here with `?idle=1`. Being signed out without being
  // asked is alarming — it reads as the session being taken away rather than
  // the clock running out — so say which one it was. It floats over the page as
  // a toast rather than sitting in the form: a notice about *why you are here*
  // pushing the email field down permanently changes the one thing the visitor
  // came to use, and nobody needs this message after a few seconds.
  //
  // The window is read from the constant rather than typed into the copy, so
  // changing it in `idle-logout.js` cannot leave this page quoting a duration
  // the app no longer uses.
  const idleSignedOut = isLogin && searchParams.get('idle') === '1';
  const idleMinutes = Math.round(IDLE_TIMEOUT_MS / 60000);

  // Dismissal is local. The query parameter stays put — clearing it would mean a
  // router navigation, and the message is not worth one. Nothing re-reads it, so
  // the toast cannot come back on its own.
  const [idleToastDismissed, setIdleToastDismissed] = useState(false);
  const dismissIdleToast = useCallback(() => setIdleToastDismissed(true), []);

  const handleGoogle = async () => {
    setFormError(null);
    if (turnstileSiteKey && !captchaToken) {
      setFormError('Selesaikan verifikasi keamanan terlebih dahulu.');
      return;
    }

    setSocialLoading(true);
    try {
      // Better Auth returns the Google authorisation URL and, on its own, walks
      // the browser there. That built-in redirect has already proven unreliable
      // in this app, so navigate explicitly instead: a missing URL is a real
      // failure and must not leave the button stuck on its busy label.
      //
      // The client resolves to `{ data, error }` — it does not throw on a 4xx,
      // and `data` is the payload, so the URL lives under `data.url`. Destructuring
      // `url` off the top level always yields `undefined`, which threw
      // "no authorization url" and reported every click as a connection failure
      // even when Google had answered.
      const { data, error } = await signIn.social({
        provider: 'google',
        callbackURL: destination,
        // A relative path, not `${window.location.origin}/login`. Better Auth
        // validates callbacks against trustedOrigins, which on production is
        // just BETTER_AUTH_URL, so an absolute URL built from whatever
        // deployment subdomain the visitor happens to be on is rejected with
        // 403 Invalid errorCallbackURL — before Google is ever reached. A
        // relative path stays same-origin wherever the app is served from.
        errorCallbackURL: '/login?error=google',
        fetchOptions: { headers: { 'x-captcha-response': captchaToken } },
      });

      if (error) throw error;
      if (!data?.url) throw new Error('no authorization url');

      window.location.href = data.url;
    } catch (error) {
      // The visitor gets the friendly copy, but the real reason (an
      // untrusted callback URL, an unregistered provider, a dead network)
      // goes to the console — otherwise every distinct server-side failure
      // collapses into the same one-line message.
      console.error('[auth] Google sign-in gagal:', error?.error || error);
      setFormError('Tidak bisa terhubung ke Google. Coba lagi sebentar.');
      setSocialLoading(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setFormError(null);
    setNotice(null);

    if (turnstileSiteKey && !captchaToken) {
      setFormError('Selesaikan verifikasi keamanan terlebih dahulu.');
      setLoading(false);
      return;
    }

    const form = new FormData(event.target);
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');

    try {
      if (isLogin) {
        const { error: authError } = await signIn.email({ email, password, fetchOptions: { headers: { 'x-captcha-response': captchaToken } } });
        if (authError) throw authError;

        // Only allow same-origin relative paths, so `?next=` cannot be used as
        // an open redirect to an attacker-controlled host.
        router.replace(destination);
        router.refresh();
        return;
      }

      const { error: authError } = await signUp.email({ email, password, name: email.split('@')[0], fetchOptions: { headers: { 'x-captcha-response': captchaToken } } });
      if (authError) throw authError;

      router.replace('/');
      router.refresh();
    } catch (err) {
      // Better Auth returns its own message for invalid credentials; showing it raw
      // would confirm whether an email exists, so use one neutral message.
      setFormError(
        isLogin
          ? 'Email atau kata sandi tidak cocok. Periksa lagi lalu coba masuk.'
          : err?.message || 'Terjadi kesalahan saat mendaftar.',
      );
    } finally {
      window.turnstileReset?.();
      setCaptchaToken('');
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_390px] items-center gap-[50px] max-w-[940px] mx-auto">
      {/* Portalled to `document.body`, so its place here is only about reading
          order — it must come before the form for a screen reader to meet the
          explanation before the fields it explains. */}
      <Toast
        open={idleSignedOut && !idleToastDismissed}
        onDismiss={dismissIdleToast}
        title="Sesi berakhir"
      >
        Tidak ada aktivitas selama {idleMinutes} menit, jadi kamu dikeluarkan dari sesi ini. Semua
        data tetap tersimpan — masuk lagi untuk melanjutkan.
      </Toast>

      <h1 className="text-[clamp(39px,6vw,65px)] tracking-[-0.07em] leading-[1.1] font-medium mb-[16px]">
        {isLogin ? 'Masuk' : 'Buat akun'}
      </h1>

      <form onSubmit={handleSubmit} className="bg-ruang-panel border border-ruang-line p-[24px] w-full">
        {deletionScheduled && (
          <p
            role="status"
            className="text-[13px] leading-[1.65] text-ruang-warn-text border border-ruang-warn/40 bg-ruang-warn/10 rounded-[4px] px-[13px] py-[11px] mb-[18px]"
          >
            Akun kamu dijadwalkan dihapus dalam 7 hari. Kalau berubah pikiran, masuk dengan akun yang
            sama sekarang — semua data kembali seperti semula.
          </p>
        )}

        <div className="flex items-center gap-[8px] font-mono text-[11px] text-ruang-body tracking-[0.05em] uppercase mb-[12px]">
          <span className="w-[6px] h-[6px] bg-ruang-accent rounded-full shadow-[0_0_9px_#c9fb5570]" />
          {isLogin ? 'Masuk' : 'Daftar'}
        </div>
        <h2 className="text-[20px] tracking-[-0.04em] font-medium mb-[20px]">
          {isLogin ? 'Masuk ke Ruang' : 'Buat akun'}
        </h2>

          <div className="flex flex-col gap-[16px]">
          <fieldset disabled={!captchaReady} className="contents">
          <button
            type="button"
            onClick={handleGoogle}
            disabled={!captchaReady || socialLoading || loading}
            aria-busy={socialLoading}
            className="h-[42px] w-full px-[18px] flex items-center justify-center gap-[10px] text-[13px] font-bold tracking-[0.02em] rounded-[4px] border border-ruang-line-3 bg-ruang-shell text-ruang-ink hover:border-ruang-accent-text hover:text-ruang-accent-text transition-colors active:scale-95 disabled:opacity-60 disabled:active:scale-100 disabled:cursor-wait"
          >
            <GoogleIcon size={16} />
            {socialLoading ? 'Menghubungkan ke Google...' : 'Lanjutkan dengan Google'}
          </button>

          <div className="flex items-center gap-[12px]" aria-hidden="true">
            <span className="flex-1 h-px bg-ruang-line-2" />
            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-ruang-ghost">atau</span>
            <span className="flex-1 h-px bg-ruang-line-2" />
          </div>

          <TextField
            id="auth-email"
            label="Email"
            type="email"
            name="email"
            autoComplete="email"
            placeholder="nama@email.com"
            required
          />
          </fieldset>

          {turnstileSiteKey && (
            <TurnstileCaptcha onToken={setCaptchaToken} />
          )}

          <fieldset disabled={!captchaReady} className="contents">
          <div className="flex flex-col gap-[7px]">
            <div className="flex items-center justify-between">
              <label htmlFor="auth-password" className="text-ruang-body text-[13px] font-medium">
                Kata sandi
              </label>
              {isLogin && (
                <Link
                  href="/reset-password"
                  className="text-[12px] text-ruang-muted hover:text-ruang-accent-text transition-colors no-underline"
                >
                  Lupa kata sandi?
                </Link>
              )}
            </div>

            <div className="relative">
              <input
                id="auth-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                placeholder="Minimal 8 karakter"
                minLength={8}
                required
                aria-describedby="auth-password-hint"
                className="w-full h-[40px] bg-ruang-shell border border-ruang-line-2 rounded-[3px] text-ruang-ink px-[12px] pr-[38px] text-[13px] outline-none focus:border-ruang-accent-text placeholder:text-ruang-ghost"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                className="absolute right-0 top-0 w-[38px] h-[40px] grid place-items-center text-ruang-subtle hover:text-ruang-accent-text transition-colors"
              >
                {showPassword ? (
                  <EyeClosedIcon size={16} aria-hidden="true" />
                ) : (
                  <EyeIcon size={16} aria-hidden="true" />
                )}
              </button>
            </div>

            <p id="auth-password-hint" className="text-ruang-subtle text-[12px] leading-[1.6]">
              {isLogin ? 'Kata sandimu tidak pernah ditampilkan.' : 'Pakai minimal 8 karakter.'}
            </p>
          </div>

          <FormMessage error={formError || oauthError} success={notice} />

          <Button type="submit" busy={loading} busyLabel="Sedang memproses...">
            {isLogin ? 'Masuk' : 'Daftar'}
          </Button>

          <p className="text-ruang-subtle text-[12px] leading-[1.6] text-center mt-[4px]">
            {isLogin ? (
              <>
                Belum punya akun?{' '}
                <Link href="/register" className="text-ruang-accent-text hover:underline">
                  Daftar di sini
                </Link>
              </>
            ) : (
              <>
                Sudah punya akun?{' '}
                <Link href="/login" className="text-ruang-accent-text hover:underline">
                  Masuk di sini
                </Link>
              </>
            )}
          </p>
          </fieldset>
        </div>
      </form>
    </div>
  );
}

function TurnstileCaptcha({ onToken }) {
  const container = useRef(null);

  useEffect(() => {
    // `null` means "nothing rendered yet" — the id Turnstile hands back is a
    // string, so the two can never be confused.
    let widgetId = null;

    const render = () => {
      // Guard both directions: a re-run (StrictMode, or the effect firing again
      // before the script loads) must not stack a second widget in the container.
      if (widgetId !== null || !container.current || !window.turnstile) return;
      widgetId = window.turnstile.render(container.current, {
        sitekey: turnstileSiteKey,
        callback: onToken,
        'expired-callback': () => onToken(''),
        'error-callback': () => onToken(''),
      });
      window.turnstileReset = () => {
        onToken('');
        window.turnstile?.reset(widgetId);
      };
    };

    if (window.turnstile) render();
    else window.onTurnstileLoad = render;

    return () => {
      delete window.onTurnstileLoad;
      delete window.turnstileReset;
      // Without this the widget outlives its container: navigating
      // /login -> /register unmounts the div, and Turnstile's polling loop keeps
      // reaching for the missing node, logging "Cannot find Widget" on every
      // interval tick and postMessage-ing to a window that no longer exists.
      if (widgetId !== null) window.turnstile?.remove(widgetId);
      onToken('');
    };
  }, [onToken]);

  return (
    <>
      <div ref={container} className="flex w-full justify-center" />
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onReady={() => window.onTurnstileLoad?.()} />
    </>
  );
}
