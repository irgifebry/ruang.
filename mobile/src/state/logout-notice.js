/**
 * Why the current session ended, carried from the sign-out site to the guest
 * redirect. Pure and React-free so `node --test` can drive it.
 *
 * The login screen reads its "Sesi berakhir" and "Akun dijadwalkan dihapus"
 * notices from `?idle=1` / `?deleted=1` (`AuthScreen` → `authNotices`). Once
 * the shell starts redirecting every guest to `/login`, a bare redirect would
 * erase those flags: idle auto-logout and account deletion both sign out
 * before navigating. Remembering the reason at the sign-out site and letting
 * the shell build the path keeps the notice intact whichever navigation wins
 * the race. A 401 has no notice and deliberately remembers nothing.
 */

const NOTICES = ['idle', 'deleted'];
let pending = null;

/** Records why this sign-out happened; unrelated reasons are ignored. */
export function rememberLogoutNotice(reason) {
  pending = NOTICES.includes(reason) ? reason : null;
}

/** Reads and consumes the pending reason, so it cannot leak into a later exit. */
export function takeLogoutNotice() {
  const notice = pending;
  pending = null;
  return notice;
}

export function clearLogoutNotice() {
  pending = null;
}

/** The path a guest lands on, with the notice flag the login screen expects. */
export function loginPathForNotice(notice) {
  if (notice === 'idle') return '/login?idle=1';
  if (notice === 'deleted') return '/login?deleted=1';
  return '/login';
}

/**
 * The client's `onUnauthorized` callback: a 401 clears the stored token
 * before this fires, so the only remaining work is to drop the user and mark
 * the session out. The shell then redirects the guest.
 */
export function createUnauthorizedHandler({
  setUser,
  setStatus,
  clearNotice = clearLogoutNotice,
}) {
  return () => {
    clearNotice();
    setUser(null);
    setStatus('out');
  };
}
