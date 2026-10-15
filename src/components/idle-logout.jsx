'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSession, signOut } from '@/lib/auth-client';
import { IDLE_TIMEOUT_MS, IDLE_WARNING_MS, clearIdleState, createIdleController } from '@/lib/idle-logout';
import { ConfirmDialog } from './confirm-dialog';

const WARNING_SECONDS = Math.round(IDLE_WARNING_MS / 1000);
const IDLE_MINUTES = Math.round(IDLE_TIMEOUT_MS / 60000);

/**
 * Counts the warning down, and only while the warning is up.
 *
 * An interval running for fifteen minutes on every page of the app would be a
 * wakeup nobody asked for, so this is tied to `active` rather than mounted
 * alongside the component. It also resets whenever the dialog opens, which is
 * what keeps a second warning from inheriting the first one's `0`.
 */
function useIdleCountdown(active) {
  const [seconds, setSeconds] = useState(WARNING_SECONDS);

  useEffect(() => {
    if (!active) return undefined;

    setSeconds(WARNING_SECONDS);
    const timer = window.setInterval(() => {
      setSeconds((value) => (value <= 1 ? 0 : value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [active]);

  return seconds;
}

/**
 * Idle auto-logout, mounted once by `AppShell`.
 *
 * The timing itself lives in `@/lib/idle-logout`; this is only the part that
 * needs React — resolving whether there is a session to guard, and turning a
 * timeout into a dialog and a sign-out.
 *
 * Three deliberate choices:
 *
 * - **It lives in the shell, not the sidebar.** `AppShell` also renders the bare
 *   routes, so the guard survives a navigation and does not depend on the app
 *   chrome existing. Auto-logout is an auth behaviour; the rail is furniture.
 * - **It navigates with `window.location.assign`, not the router.** Same
 *   reasoning as `DeleteAccountPanel`: after a sign-out the server has to re-read
 *   a cookie that no longer resolves to a session, and a client-side route
 *   change never gives it that chance.
 * - **The idle window is not a preference.** There is no setting for it and no
 *   per-user column behind it. `IDLE_TIMEOUT_MS` is the single number, and a
 *   second place to change it is a second place to forget it.
 * - **It follows the other tabs.** Two tabs each hold their own deadline, and
 *   without syncing them the idle one signs out a session the other is actively
 *   using. `@/lib/idle-logout` listens for the `storage` event, so working in
 *   either tab resets both and a sign-out in either one lands in both.
 */
export default function IdleLogout() {
  const [warning, setWarning] = useState(false);
  const countdown = useIdleCountdown(warning);
  const controllerRef = useRef(null);
  // A latch rather than state: `signOut` is async, and two paths into it — the
  // countdown running out and the button being pressed — must not both fire.
  const signingOutRef = useRef(false);

  const signOutAndLeave = useCallback(async ({ idle = false } = {}) => {
    if (signingOutRef.current) return;
    signingOutRef.current = true;
    clearIdleState();

    try {
      // Better Auth resolves to `{ data, error }` and does not throw on a 4xx,
      // so the error has to be read rather than caught — the same trap as
      // `signIn.social` in `AuthForm`.
      const { error } = await signOut();
      if (error) throw error;
    } catch (error) {
      // Fails open, and says so. The session cookie is still valid, so `proxy`
      // will bounce the visitor straight back in: a network blip must not look
      // like a logout nobody can undo. The real reason goes to the console and
      // the visitor gets the ordinary login page.
      console.error('[auth] sign-out gagal:', error?.error || error);
    } finally {
      // `?idle=1` is a claim about *why* the session ended, and only this tab's
      // own clock can support it. A tab signed out because another one ended the
      // session was not idle, so it lands on the plain login page instead of
      // repeating a story that is not true of it.
      window.location.assign(idle ? '/login?idle=1' : '/login');
    }
  }, []);

  useEffect(() => {
    let active = true;

    const controller = createIdleController({
      onWarn: () => setWarning(true),
      onExtend: () => setWarning(false),
      onTimeout: () => signOutAndLeave({ idle: true }),
      // Another tab ended the session. This one follows rather than sitting on a
      // page whose every request is about to fail.
      onSignedOut: () => signOutAndLeave(),
    });
    controllerRef.current = controller;

    getSession()
      .then(({ data }) => {
        if (!active) return;
        // Nothing to guard without a session — and any clock left behind by a
        // previous one has to go, or signing back in could mount already expired.
        if (!data?.session) {
          clearIdleState();
          return;
        }
        controller.start();
        // One line, and the only way to tell an armed guard from an absent one
        // without waiting out the whole window. "Nothing happened" and "the
        // guard is not there" look identical from the outside, and that is
        // exactly how a broken deployment reads as working.
        console.debug(
          `[idle] armed — signs out after ${Math.round(IDLE_TIMEOUT_MS / 1000)}s of no activity`,
        );
      })
      .catch((error) => {
        // Without this the guard is simply missing when the lookup fails, and a
        // missing guard is indistinguishable from a working one until the
        // window elapses. A thrown rejection here used to end the chain with
        // nothing on screen and nothing in the console.
        console.error('[idle] gagal memuat sesi, auto-logout tidak aktif:', error?.error || error);
      });

    return () => {
      active = false;
      controller.stop();
      controllerRef.current = null;
    };
  }, [signOutAndLeave]);

  const stay = useCallback(() => {
    // Only close the dialog if the deadline actually moved. `extend` declines
    // while the throttle gate is shut, and dismissing anyway would leave an
    // imminent deadline with no warning on screen and no way to stop it.
    if (controllerRef.current?.extend() !== true) return;
    setWarning(false);
  }, []);

  const label = countdown === 1 ? '1 detik' : `${countdown} detik`;

  return (
    <ConfirmDialog
      open={warning}
      tone="danger"
      // Not "KONFIRMASI". That label introduces the dialog as asking permission
      // to do something, and here the buttons *are* the two possible endings —
      // there is no pending action to confirm.
      eyebrow="SESI"
      title="Masih ada di situ?"
      description={`Tidak ada aktivitas selama ${IDLE_MINUTES} menit, jadi sesi kamu akan berakhir dalam ${label}. Semua data kamu tetap aman.`}
      confirmLabel="Keluar sekarang"
      cancelLabel="Lanjut dipakai"
      onConfirm={() => signOutAndLeave({ idle: true })}
      onCancel={stay}
    />
  );
}
