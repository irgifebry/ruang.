/**
 * Idle auto-logout.
 *
 * Signs the user out after a stretch of no activity, so a session left open on a
 * shared or unattended machine does not outlive the person using it.
 *
 * No React, no Next and no `.ts`, for the same reason `sidebar.js` and
 * `theme-presets.js` have none: `Sidebar.jsx` used to hold this as an inline
 * effect, which put it out of reach of the test suite — anything importing
 * `next/navigation` cannot be loaded by `tests/jsx-hooks.mjs` — and tied it to
 * the app chrome rather than to auth, so it silently stopped running on the
 * bare routes. As a plain module it can be driven against a stubbed DOM, which
 * is where nearly all of the behaviour below actually lives.
 *
 * Four decisions carry the weight, and each is a way the obvious version is
 * wrong:
 *
 * 1. **The deadline is absolute, not a countdown.** Every `setTimeout` here is
 *    scheduled for the *remaining* wall-clock time, and `schedule()` re-checks
 *    against the clock instead of trusting the timer to have fired on cue. A
 *    backgrounded tab has its timers throttled, and a tab that went into the
 *    back/forward cache has them frozen outright — so "the timer has not fired"
 *    is not evidence that the session is still live.
 * 2. **The deadline is persisted, not held in a variable.** The last activity
 *    goes to `localStorage`, so closing the tab buys no extra time: coming back
 *    an hour later starts already expired. `pagehide` flushes the clock but
 *    deliberately does *not* revoke the session — a closed tab is not a
 *    logout, and a request fired during unload is both unreliable and rude.
 * 3. **Returning to a tab is not activity.** `visibilitychange` and `pageshow`
 *    re-evaluate the deadline, they do not push it out. A tab hidden for twenty
 *    minutes has twenty minutes of that showing, and handing it a fresh window
 *    on return would put the timeout permanently one tab-switch away.
 * 4. **Failing to sign out fails open.** If `onTimeout` cannot reach the server,
 *    the session stays alive rather than being destroyed locally. A network
 *    blip must not look like a logout that cannot be undone.
 */

/** Where the last-activity clock is cached between page loads and tabs. */
export const IDLE_KEY = 'ruang-idle-last-active';

/**
 * How long the session survives without activity.
 *
 * Overridable through `NEXT_PUBLIC_IDLE_TIMEOUT_MS`, for one reason: a feature
 * that fires once every fifteen minutes is close to untestable on a deployed
 * environment, where you cannot shorten the clock from a console. Sitting for a
 * quarter of an hour without touching anything is not a test, it is a
 * commitment, and the usual outcome is that nobody runs it and the feature is
 * declared broken by whoever gave up first.
 *
 * Anything below a second is treated as unset rather than honoured — a value
 * that small almost always means a typo, and a guard that fires between two
 * keystrokes is worse than no guard.
 */
function readTimeout() {
  const configured = Number(process.env.NEXT_PUBLIC_IDLE_TIMEOUT_MS);
  return Number.isFinite(configured) && configured >= 1000 ? configured : 15 * 60 * 1000;
}

export const IDLE_TIMEOUT_MS = readTimeout();

/**
 * How long before the deadline the user is warned.
 *
 * The warning is the point of the feature as far as the user is concerned: a
 * logout with no notice is indistinguishable from a bug, so the window has to
 * be long enough to read and click through, and short enough that it is not a
 * second thing to keep track of.
 */
export const IDLE_WARNING_MS = 60 * 1000;

/**
 * Events that count as activity.
 *
 * No `mousemove`: it fires continuously, would arm the timer forever on a
 * desktop where the pointer drifts, and cannot distinguish someone reading the
 * page from a cat walking over the keyboard. The four below are all deliberate
 * acts — a pointer press, a keystroke, a scroll, a touch — and together they
 * cover both pointer and keyboard users.
 */
export const IDLE_ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'scroll', 'touchstart'];

/**
 * The shortest gap between two re-arms.
 *
 * `scroll` fires far faster than a fifteen-minute deadline moves, so arming on
 * every event is churn — a `localStorage` write is synchronous, and repeating it
 * dozens of times a second is real work for no change in the deadline. The first
 * event of any burst always passes this gate, because the previous arm is by
 * then long in the past, so the warning can always be dismissed immediately.
 */
export const IDLE_EXTEND_THROTTLE_MS = 1000;

const noop = () => {};

/** Reads the clock, isolated so a test can supply its own. */
const defaultNow = () => Date.now();

/**
 * Whether the session has outlived the idle window.
 *
 * `>=` rather than `>`, so a timestamp exactly at the boundary is expired. The
 * whole check is a comparison of two numbers, kept here rather than inline so
 * the boundary is defined once and the tests can pin it.
 */
export function isIdleExpired(lastActive, now = defaultNow(), timeout = IDLE_TIMEOUT_MS) {
  if (typeof lastActive !== 'number' || !Number.isFinite(lastActive)) return true;
  return now - lastActive >= timeout;
}

/**
 * Reads the cached last-activity timestamp.
 *
 * Anything unreadable — a private-mode `getItem` that throws, a value written by
 * an older build, a corrupted entry — reads as `null`, which the caller treats as
 * "no clock, start one now". Guessing is safe here in both directions: the
 * alternative, failing closed, would sign out a user whose storage merely
 * misbehaved.
 */
export function readIdleLastActive() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(IDLE_KEY);
    if (raw === null) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Caches the clock. A failure here costs persistence, not the running timer. */
export function storeIdleLastActive(timestamp) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(IDLE_KEY, String(timestamp));
  } catch {
    // Ignored: the timer still runs for this page view.
  }
}

/**
 * Drops the clock entirely.
 *
 * Called when there is no session to guard. Without it a stale timestamp from a
 * previous session would still be sitting in storage when the user signs back
 * in, and a sufficiently old one would expire the fresh session the instant it
 * mounted.
 */
export function clearIdleState() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(IDLE_KEY);
  } catch {
    // Ignored, as above.
  }
}

/**
 * Builds the idle tracker.
 *
 * Returns `start`, `stop` and `extend`; `extend` is exposed because the warning
 * dialog's "keep me signed in" button has to push the deadline out from outside.
 * Everything else about the environment is injectable — `now`, `setTimer`,
 * `clearTimer` — so the timing rules can be tested exactly rather than waited
 * out.
 */
export function createIdleController(options = {}) {
  const {
    timeout = IDLE_TIMEOUT_MS,
    warnBefore = IDLE_WARNING_MS,
    onWarn = noop,
    onExtend = noop,
    onTimeout = noop,
    onSignedOut = noop,
    now = defaultNow,
    setTimer = (fn, ms) => setTimeout(fn, ms),
    clearTimer = (handle) => clearTimeout(handle),
  } = options;

  let lastActive = null;
  let expireTimer = null;
  let warnTimer = null;
  let armedAt = -Infinity;
  let running = false;
  // Latched separately from `running`: a timed-out controller is finished, and
  // stopping it afterwards must not read as "never started".
  let fired = false;
  let warned = false;

  const getWindow = () => (typeof window === 'undefined' ? null : window);
  const getDocument = () => (typeof document === 'undefined' ? null : document);

  /**
   * Latches the controller as finished and releases its timers.
   *
   * Shared by the two endings, because they are the same state reached two ways.
   * A controller that had ended once and then announced a second, different
   * cause for it would report one event twice — and the caller's logs, and any
   * message derived from them, would be describing a logout that happened once
   * for reasons that did not both apply.
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
    // Already past the deadline: this is what a throttled or frozen timer looks
    // like when it finally gets a turn, so log out rather than re-arm.
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
   * Note what this does *not* do, unlike every other expiry check here: it
   * refuses to sign out just because the deadline has already passed. A deadline
   * can be met without the timer firing — a backgrounded tab gets its callbacks
   * throttled — and a click arriving after that is stronger evidence that
   * somebody is at the keyboard than an elapsed reading is. The version this
   * replaces logged the user out on that click, which is precisely the opposite
   * of what the click means. Expiry is therefore decided by `fire`, which only
   * the clock and `check` reach; activity can always reopen a window.
   *
   * Returns whether the deadline actually moved. A caller that dismissed the
   * warning dialog needs to know: the throttle below can decline a re-arm, and
   * closing the dialog on a declined extend would leave an imminent deadline
   * with nothing on screen saying so.
   */
  function extend() {
    if (!running || fired) return false;
    const at = now();
    if (at - armedAt < IDLE_EXTEND_THROTTLE_MS) return false;

    armedAt = at;
    const wasWarning = warned;
    warned = false;
    lastActive = at;
    storeIdleLastActive(at);
    schedule();
    if (wasWarning) onExtend();
    return true;
  }

  /**
   * Re-evaluates the deadline against the clock.
   *
   * Separate from `extend` because returning to a tab is not the same as using
   * it. This is the handler behind `visibilitychange` and `pageshow`, and it is
   * the only thing standing between a frozen timer and an indefinitely extended
   * session.
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
   * Takes another tab's clock as our own.
   *
   * Separate from `extend`, and the separation is the whole point: this must not
   * re-stamp with `now()`. Writing our own fresh timestamp back would give the
   * next tab a newer value, which would come here as a new event, and two tabs
   * would trade an ever-rising timestamp until the browser gave up. The received
   * value is adopted verbatim and written nowhere, so the chain stops after one
   * hop.
   *
   * Only a strictly newer value is taken. An equal or older one means another
   * tab is behind us or heard from late, and rewinding to it would shorten this
   * tab's window on the strength of stale information.
   */
  function adopt(timestamp) {
    if (!running || fired) return;
    if (!(timestamp > lastActive)) return;

    const wasWarning = warned;
    warned = false;
    lastActive = timestamp;
    schedule();
    // A dialog claiming the session is about to end, while another tab is
    // demonstrably still being used, is a dialog that has to go.
    if (wasWarning) onExtend();
  }

  /**
   * Follows another tab's storage writes.
   *
   * The `storage` event is the right primitive here rather than a
   * `BroadcastChannel`: it is already the mechanism `ThemeProvider` uses to keep
   * tabs in step, it fires in every other tab of the origin and *only* there, so
   * a tab never hears its own writes, and it costs nothing to set up.
   *
   * The two cases are not symmetric. A timestamp means somebody did something, so
   * this tab's deadline moves. A removal means another tab signed out — and
   * because Better Auth revokes a session cookie that every tab of the origin
   * shares, this tab's session is dead too. Following it here is the difference
   * between a redirect and a page full of controls that fail on their next
   * request.
   */
  function handleStorage(event) {
    if (!running || fired) return;
    if (event?.key !== IDLE_KEY) return;

    if (event.newValue === null) {
      // Finished, not merely reported: a session another tab has already ended
      // cannot then expire on this one's clock a second later.
      if (finish()) onSignedOut();
      return;
    }

    const timestamp = Number(event.newValue);
    if (Number.isFinite(timestamp)) adopt(timestamp);
  }

  /**
   * Flushes the clock as the page goes away.
   *
   * No network call, and that is the whole point: the session survives a closed
   * tab, and only the countdown stops. Whatever the user does next is measured
   * against the moment they last actually did something, so a tab left open
   * overnight is expired by morning without anything having to be revoked while
   * the browser was tearing itself down.
   */
  function handlePageHide() {
    if (typeof lastActive === 'number') storeIdleLastActive(lastActive);
  }

  function handleVisibilityChange() {
    if (getDocument()?.hidden) return;
    check();
  }

  function handlePageShow(event) {
    // A plain `pageshow` on first load is already covered by `start` reading the
    // stored clock; only a restore from the back/forward cache needs checking,
    // because that is the case where timers were frozen for an unknown duration.
    if (event?.persisted) check();
  }

  function attach() {
    const win = getWindow();
    if (!win) return;

    for (const event of IDLE_ACTIVITY_EVENTS) {
      win.addEventListener(event, extend, { passive: true });
    }
    win.addEventListener('pagehide', handlePageHide);
    win.addEventListener('pageshow', handlePageShow);
    win.addEventListener('storage', handleStorage);
    getDocument()?.addEventListener('visibilitychange', handleVisibilityChange);
  }

  function detach() {
    const win = getWindow();
    if (win) {
      for (const event of IDLE_ACTIVITY_EVENTS) {
        win.removeEventListener(event, extend);
      }
      win.removeEventListener('pagehide', handlePageHide);
      win.removeEventListener('pageshow', handlePageShow);
      win.removeEventListener('storage', handleStorage);
    }
    getDocument()?.removeEventListener('visibilitychange', handleVisibilityChange);
  }

  function start() {
    if (running) return;
    running = true;
    fired = false;
    warned = false;

    // Seed from the stored clock rather than from `now()`. This is what makes a
    // closed tab free: the window runs from the last real activity, not from
    // whenever this page load happened to happen.
    const stored = readIdleLastActive();
    lastActive = typeof stored === 'number' ? stored : now();
    armedAt = -Infinity;

    attach();
    schedule();
  }

  /**
   * Stops tracking.
   *
   * Deliberately leaves the stored clock alone: unmounting is not a sign-out,
   * and clearing here would hand a reload a free full window — the opposite of
   * what the persisted deadline is for. `clearIdleState` is the explicit version.
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
