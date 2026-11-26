/**
 * Idle auto-logout — the native port of the web app's `src/lib/idle-logout.js`.
 *
 * The timing rules are identical to the web version: the deadline is absolute
 * and persisted, returning to the app re-checks it without extending it,
 * activity pushes it out, and expiry latches so a late timer cannot sign out
 * twice. The differences are native flavour:
 *
 * 1. **Storage** is SecureStore (the sync `getItem`/`setItem` exports), so
 *    the free functions stay synchronous like the web ones. `require` is used
 *    lazily because this module is loaded by `node --test` before Metro is.
 * 2. **Events** come from `AppState`, not `window`/`document` — there is no
 *    cross-tab sync on native, so the `storage`-event half of the web module
 *    simply does not exist here.
 *
 * Everything the timing depends on — `now`, `setTimer`, `clearTimer` — is
 * injectable, so a test drives it with a hand-moved clock rather than waiting
 * an hour out.
 */

export const IDLE_KEY = 'ruang-idle-last-active';

/**
 * How long the session survives without activity.
 *
 * Overridable through `EXPO_PUBLIC_IDLE_TIMEOUT_MS` (Expo's convention) or the
 * web `NEXT_PUBLIC_IDLE_TIMEOUT_MS`; anything below a second is treated as
 * unset — a guard that fires between two keystrokes is worse than none.
 */
function readTimeout() {
  const raw = (typeof process !== 'undefined' && process.env) || {};
  const configured = Number(raw.EXPO_PUBLIC_IDLE_TIMEOUT_MS ?? raw.NEXT_PUBLIC_IDLE_TIMEOUT_MS);
  return Number.isFinite(configured) && configured >= 1000 ? configured : 60 * 60 * 1000;
}

export const IDLE_TIMEOUT_MS = readTimeout();

/**
 * How long before the deadline the user is warned.
 *
 * The warning is the point of the feature as far as the user is concerned: a
 * logout with no notice is indistinguishable from a bug, so the window has to
 * be long enough to read and act, and short enough not to be a second thing to
 * keep track of.
 */
export const IDLE_WARNING_MS = 60 * 1000;

/**
 * Native activity arrives as an AppState change back to `active`/`foreground`.
 * Kept exported for parity with the web module; the native module does not
 * wire these as listeners — see `attach()`.
 */
export const IDLE_ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'scroll', 'touchstart'];

/**
 * The shortest gap between two re-arms.
 *
 * `scroll` fires far faster than the deadline moves, so the throttle keeps a
 * storage write a second from happening in a burst. The first event always
 * passes, because the previous arm is long in the past then.
 */
export const IDLE_EXTEND_THROTTLE_MS = 1000;

const noop = () => {};

/** Reads the clock, isolated so a test can supply its own. */
const defaultNow = () => Date.now();

/**
 * Whether the session has outlived the idle window.
 *
 * `>=` rather than `>`, so a timestamp exactly at the boundary is expired.
 */
export function isIdleExpired(lastActive, now = defaultNow(), timeout = IDLE_TIMEOUT_MS) {
  if (typeof lastActive !== 'number' || !Number.isFinite(lastActive)) return true;
  return now - lastActive >= timeout;
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

/** The storage the free functions and the controller read and write. */
let storageOverride = null;

/**
 * Swaps the storage — how the test harness injects its stub, and how the app
 * can hand the controller an async or pre-acquired adapter if it ever needs
 * one. `null` returns to the default (SecureStore, or nothing where the
 * module is loaded by a test).
 */
export function setIdleStorage(next) {
  storageOverride = next;
}

function loadSecureStore() {
  try {
    // Metro transforms ESM files to CommonJS, so `require` is in scope even in
    // modules written with `import` syntax; plain node has no such global,
    // which is why this is guarded rather than imported statically.
    if (typeof require !== 'function') return null;
    const mod = require('expo-secure-store');
    return mod && typeof mod.getItem === 'function' ? mod : null;
  } catch {
    return null;
  }
}

let secureStore = null;
let secureStoreTried = false;

function getSecureStorage() {
  if (!secureStoreTried) {
    secureStoreTried = true;
    secureStore = loadSecureStore();
  }
  if (!secureStore) return null;
  return {
    getItem: (key) => {
      try {
        const value = secureStore.getItem(key);
        return value === undefined ? null : value;
      } catch {
        return null;
      }
    },
    setItem: (key, value) => {
      try {
        secureStore.setItem(key, value);
      } catch {
        // Ignored: the timer still runs for this session.
      }
    },
    removeItem: (key) => {
      try {
        // This package's API surface: `deleteItemAsync` is the only delete.
        // Fire-and-forget — the next `readIdleLastActive()` sees the removal
        // whenever the native side completes it.
        if (typeof secureStore.deleteItem === 'function') secureStore.deleteItem(key);
        else if (typeof secureStore.deleteItemAsync === 'function') {
          secureStore.deleteItemAsync(key).catch(() => {});
        }
      } catch {
        // Ignored, as above.
      }
    },
  };
}

function getStorage() {
  return storageOverride ?? getSecureStorage();
}

/**
 * Reads the cached last-activity timestamp.
 *
 * Anything unreadable — a SecureStore that throws, a value written by an older
 * build, a corrupted entry — reads as `null`, which the caller treats as "no
 * clock, start one now". Guessing is safe in both directions here: the
 * alternative, failing closed, would sign out a user whose storage merely
 * misbehaved.
 */
export function readIdleLastActive(storage) {
  const store = storage ?? getStorage();
  if (!store) return null;
  try {
    const raw = store.getItem(IDLE_KEY);
    if (raw === null || raw === undefined) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Caches the clock. A failure here costs persistence, not the running timer.
 */
export function storeIdleLastActive(timestamp, storage) {
  const store = storage ?? getStorage();
  if (!store) return;
  try {
    store.setItem(IDLE_KEY, String(timestamp));
  } catch {
    // Ignored: the timer still runs for this page view.
  }
}

/**
 * Drops the clock entirely.
 *
 * Called when there is no session to guard. Without it a stale timestamp from
 * a previous session would still be sitting in storage when the user signs
 * back in, and a sufficiently old one would expire the fresh session the
 * instant it mounted.
 */
export function clearIdleState() {
  const store = getStorage();
  if (!store) return;
  try {
    store.removeItem(IDLE_KEY);
  } catch {
    // Ignored, as above.
  }
}

// ---------------------------------------------------------------------------
// AppState
// ---------------------------------------------------------------------------

function getAppState() {
  if (typeof globalThis !== 'undefined' && globalThis.AppState) return globalThis.AppState;
  try {
    if (typeof require !== 'function') return null;
    return require('react-native')?.AppState ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// The controller
// ---------------------------------------------------------------------------

/**
 * Builds the idle tracker. Returns `start`, `stop` and `extend`.
 *
 * Everything is injectable — `now`, `setTimer`, `clearTimer`, `storage`,
 * `appState` — so the timing rules can be tested exactly rather than waited
 * out.
 */
export function createIdleController(options = {}) {
  const {
    timeout = IDLE_TIMEOUT_MS,
    warnBefore = IDLE_WARNING_MS,
    onWarn = noop,
    onExtend = noop,
    onTimeout = noop,
    now = defaultNow,
    setTimer = (fn, ms) => setTimeout(fn, ms),
    clearTimer = (handle) => clearTimeout(handle),
    storage,
    appState,
  } = options;

  const getStore = () => storage ?? getStorage();
  const getState = () => appState ?? getAppState();

  let lastActive = null;
  let expireTimer = null;
  let warnTimer = null;
  let armedAt = -Infinity;
  let running = false;
  // Latched separately from `running`: a timed-out controller is finished, and
  // stopping it afterwards must not read as "never started".
  let fired = false;
  let warned = false;

  /**
   * Latches the controller as finished and releases its timers. Shared by the
   * two endings — a second, different cause would report one event twice.
   */
  function finish() {
    if (fired) return false;
    fired = true;
    clearTimer(expireTimer);
    clearTimer(warnTimer);
    expireTimer = null;
    warnTimer = null;
    return true;
  }

  /** Ends the session because the clock ran out. */
  function fire() {
    if (!finish()) return;
    onTimeout();
  }

  /** Re-arms both timers for whatever wall-clock time is left. */
  function schedule() {
    clearTimer(expireTimer);
    clearTimer(warnTimer);
    expireTimer = null;
    warnTimer = null;
    if (!running || fired) return;

    const remaining = timeout - (now() - lastActive);
    // Already past the deadline: this is what a throttled timer looks like
    // when it finally gets a turn, so log out rather than re-arm.
    if (remaining <= 0) {
      fire();
      return;
    }

    if (remaining <= warnBefore) {
      if (!warned) {
        warned = true;
        onWarn();
      }
      warnTimer = setTimer(fire, remaining);
    } else {
      expireTimer = setTimer(fire, remaining);
    }
  }

  /**
   * Records activity and pushes the deadline out to a full window.
   *
   * Unlike `check`, it refuses to sign out just because the deadline has
   * already passed — activity is presence, an elapsed clock is not. Expiry is
   * therefore decided by `fire`, which only the clock and `check` reach;
   * activity can always reopen a window.
   *
   * Returns whether the deadline actually moved. A caller that dismissed the
   * warning dialog needs to know: a declined extend would leave an imminent
   * deadline with nothing on screen saying so.
   */
  function extend() {
    if (!running || fired) return false;
    const at = now();
    if (at - armedAt < IDLE_EXTEND_THROTTLE_MS) return false;

    armedAt = at;
    const wasWarning = warned;
    warned = false;
    lastActive = at;
    storeIdleLastActive(at, getStore());
    schedule();
    if (wasWarning) onExtend();
    return true;
  }

  /**
   * Re-evaluates the deadline against the clock.
   *
   * Separate from `extend`: returning to the app is not the same as using it.
   * This is the only thing standing between a frozen timer and an
   * indefinitely extended session.
   */
  function check() {
    if (!running || fired) return;
    if (isIdleExpired(lastActive, now(), timeout)) {
      fire();
      return;
    }
    schedule();
  }

  /**
   * Handles an AppState change.
   *
   * On the way back to `active`/`foreground` the deadline is re-evaluated
   * rather than extended — returning to the app is not evidence of activity.
   * Going to `background`/`inactive` flushes the last-activity clock, the
   * native `pagehide` analog.
   */
  function handleAppStateChange(event) {
    const state = event?.state;
    if (state === 'active' || state === 'foreground') {
      check();
      return;
    }
    flushClock();
  }

  /** Writes the clock without re-stamping it: the last *activity* goes out. */
  function flushClock() {
    if (typeof lastActive === 'number') storeIdleLastActive(lastActive);
  }

  function attach() {
    const state = getState();
    if (state) {
      state.addEventListener('change', handleAppStateChange);
    }
  }

  function detach() {
    const state = getState();
    if (state) {
      state.removeEventListener('change', handleAppStateChange);
    }
  }

  function start() {
    if (running) return;
    running = true;
    fired = false;
    warned = false;

    // Seed from the stored clock rather than from `now()`. This is what makes
    // a closed app free: the window runs from the last real activity, not from
    // whenever this start happened.
    const stored = readIdleLastActive(getStore());
    lastActive = typeof stored === 'number' ? stored : now();
    armedAt = -Infinity;

    attach();
    schedule();
  }

  /**
   * Stops tracking.
   *
   * Deliberately leaves the stored clock alone: unmounting is not a sign-out,
   * and clearing here would hand a reload a free full window. `clearIdleState`
   * is the explicit version.
   */
  function stop() {
    running = false;
    detach();
    clearTimer(expireTimer);
    clearTimer(warnTimer);
    expireTimer = null;
    warnTimer = null;
  }

  return { start, stop, extend, check };
}
