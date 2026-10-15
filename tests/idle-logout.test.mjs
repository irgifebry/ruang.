/**
 * Drives the idle auto-logout module against a minimal DOM stand-in.
 *
 * `jsdom` is not a dependency here, so the module is handed exactly the
 * globals it reaches for: `window` with `localStorage` and the listener
 * registry, `document` with `hidden`, and an injectable clock and timer queue.
 *
 * Testing the timing rules rather than waiting them out is the point. The
 * interesting failures here are all about a timer that fires late, a tab that
 * was frozen, or a deadline that survived a reload — none of which a real
 * fifteen-minute wait would surface, and all of which are decided by `now` and
 * `check()` rather than by `setTimeout`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  IDLE_ACTIVITY_EVENTS,
  IDLE_KEY,
  IDLE_TIMEOUT_MS,
  IDLE_WARNING_MS,
  clearIdleState,
  createIdleController,
  isIdleExpired,
  readIdleLastActive,
  storeIdleLastActive,
} from '../src/lib/idle-logout.js';

/** A listener registry with the slice of `EventTarget` the module uses. */
function makeTarget() {
  const handlers = new Map();
  return {
    addEventListener(type, fn) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      handlers.get(type)?.delete(fn);
    },
    dispatch(type, event = {}) {
      for (const fn of [...(handlers.get(type) ?? [])]) fn(event);
    },
    listenerCount(type) {
      return handlers.get(type)?.size ?? 0;
    },
    totalListeners() {
      let total = 0;
      for (const set of handlers.values()) total += set.size;
      return total;
    },
  };
}

/** The globals the module reads off the real `window` / `document`. */
function makeEnv({ storage = {}, hidden = false } = {}) {
  const store = { ...storage };
  const writes = [];

  const localStorage = {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => {
      store[key] = String(value);
      writes.push(key);
    },
    removeItem: (key) => {
      delete store[key];
    },
  };

  const win = makeTarget();
  const doc = makeTarget();
  doc.hidden = hidden;

  return {
    store,
    writes,
    window: Object.assign(win, { localStorage }),
    document: doc,
    setHidden: (value) => {
      doc.hidden = value;
    },
  };
}

/**
 * A timer queue the test drives by hand.
 *
 * `fire` empties the queue before running the callbacks, so a callback that
 * re-arms lands in a fresh queue — the same ordering a real event loop gives,
 * and the reason a double sign-out can be observed rather than assumed.
 */
function makeTimers() {
  const pending = new Map();
  let seq = 0;
  return {
    setTimer(fn, ms) {
      const handle = ++seq;
      pending.set(handle, { fn, ms });
      return handle;
    },
    clearTimer(handle) {
      pending.delete(handle);
    },
    size: () => pending.size,
    delays: () => [...pending.values()].map((timer) => timer.ms),
    fire() {
      const items = [...pending.values()];
      pending.clear();
      for (const timer of items) timer.fn();
    },
  };
}

/** Installs the stubs the module reaches for, and restores them afterwards. */
function withEnv(env, run) {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  globalThis.document = env.document;
  globalThis.window = env.window;
  try {
    return run();
  } finally {
    globalThis.document = previousDocument;
    globalThis.window = previousWindow;
  }
}

/**
 * A controller wired to a controllable clock, plus the counters to assert on.
 *
 * Every entry point is wrapped rather than handed over raw. The module resolves
 * `window` at call time, so a bare `controller.start()` outside `withEnv` would
 * find no storage at all and quietly start from a fresh clock — a harness that
 * looks like it is testing the persisted deadline while never reading one.
 */
function harness({ storage = {}, hidden = false, timeout, warnBefore } = {}) {
  const env = makeEnv({ storage, hidden });
  const timers = makeTimers();
  const calls = { warn: 0, extend: 0, timeout: 0, signedOut: 0 };
  let clock = 1_000_000;

  const controller = withEnv(env, () =>
    createIdleController({
      timeout,
      warnBefore,
      now: () => clock,
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
      onWarn: () => {
        calls.warn += 1;
      },
      onExtend: () => {
        calls.extend += 1;
      },
      onTimeout: () => {
        calls.timeout += 1;
      },
      onSignedOut: () => {
        calls.signedOut += 1;
      },
    }),
  );

  const wrap = (fn) => () => withEnv(env, fn);

  return {
    env,
    timers,
    calls,
    start: wrap(controller.start),
    stop: wrap(controller.stop),
    extend: wrap(controller.extend),
    check: wrap(controller.check),
    get now() {
      return clock;
    },
    /** Moves the clock forward. No timer fires on its own — that is the point. */
    advance: (ms) => {
      clock += ms;
    },
    setHidden: (value) => env.setHidden(value),
    /** Dispatches an event on `window`, with the globals installed. */
    fire: (type, event) => withEnv(env, () => env.window.dispatch(type, event)),
    /** Dispatches an event on `document`, with the globals installed. */
    fireOn: (type, event) => withEnv(env, () => env.document.dispatch(type, event)),
  };
}

// ---------------------------------------------------------------------------
// The numbers
// ---------------------------------------------------------------------------

test('the idle window is fifteen minutes', () => {
  // Fifteen, not the thirty the old inline timer used: this is an app for
  // personal finances, and the device it is left open on is more likely to be
  // borrowed than not.
  assert.equal(IDLE_TIMEOUT_MS, 15 * 60 * 1000);
});

test('a broken timeout setting falls back to the default', () => {
  // `NEXT_PUBLIC_IDLE_TIMEOUT_MS` is typed by a human into a dashboard. The
  // failure modes are an empty field, a stray quote, and a value small enough to
  // fire between two keystrokes — and a guard that logs you out mid-word is
  // worse than the guard it replaced.
  const readTimeout = (raw) => {
    const configured = Number(raw);
    return Number.isFinite(configured) && configured >= 1000 ? configured : 15 * 60 * 1000;
  };

  assert.equal(readTimeout(undefined), 900_000);
  assert.equal(readTimeout(''), 900_000);
  assert.equal(readTimeout('not-a-number'), 900_000);
  assert.equal(readTimeout('500'), 900_000);
  assert.equal(readTimeout(0), 900_000);
  assert.equal(readTimeout('20000'), 20_000);
});

test('a session lookup that fails is reported, not swallowed', () => {
  // The guard used to be armed by a bare `.then`, so a rejected lookup ended
  // the chain with nothing running and nothing on screen — indistinguishable
  // from a working guard until the whole window had elapsed.
  const component = read('../src/components/idle-logout.jsx');
  assert.match(component, /\.catch\(/)
  assert.match(component, /auto-logout tidak aktif/);
});

test('arming the guard is visible in the console', () => {
  // One line, so a deployed environment can be checked in seconds instead of by
  // waiting fifteen minutes to find out whether the guard is there at all.
  const component = read('../src/components/idle-logout.jsx');
  assert.match(component, /console\.debug\(\s*`\[idle\] armed/);
  assert.match(component, /IDLE_TIMEOUT_MS \/ 1000/);
});

test('the warning lands a minute before the deadline', () => {
  assert.equal(IDLE_WARNING_MS, 60 * 1000);
  assert.ok(IDLE_WARNING_MS < IDLE_TIMEOUT_MS);
});

test('`pointermove` is not activity', () => {
  // It fires continuously while the pointer drifts and cannot tell a reader
  // from a cursor nudged by a busy desk, which would hold the session open
  // forever on exactly the unattended machines this feature exists for.
  assert.deepEqual([...IDLE_ACTIVITY_EVENTS], ['pointerdown', 'keydown', 'scroll', 'touchstart']);
});

// ---------------------------------------------------------------------------
// `isIdleExpired`
// ---------------------------------------------------------------------------

test('the boundary counts as expired', () => {
  // `>=`, not `>`. A deadline met exactly is a deadline that has been met.
  assert.equal(isIdleExpired(0, IDLE_TIMEOUT_MS), true);
  assert.equal(isIdleExpired(0, IDLE_TIMEOUT_MS - 1), false);
});

test('an unreadable clock is treated as expired', () => {
  // Failing closed here is deliberate and the opposite of the storage guard
  // below: storage that misbehaves must not lock anyone out, but a clock this
  // module cannot read has to be assumed finished.
  assert.equal(isIdleExpired(null, Date.now()), true);
  assert.equal(isIdleExpired(undefined, Date.now()), true);
  assert.equal(isIdleExpired('nonsense', Date.now()), true);
  assert.equal(isIdleExpired(Number.NaN, Date.now()), true);
});

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

test('the clock round-trips through storage', () => {
  const env = makeEnv();
  withEnv(env, () => {
    assert.equal(readIdleLastActive(), null);
    storeIdleLastActive(1234);
    assert.equal(readIdleLastActive(), 1234);
    assert.equal(env.store[IDLE_KEY], '1234');
  });
});

test('a storage that throws costs persistence, not the guard', () => {
  // Private browsing makes these throw outright. Reading must not throw — a
  // crash here would take the whole page down instead of merely forgetting a
  // deadline.
  const previousWindow = globalThis.window;
  globalThis.window = {
    localStorage: {
      getItem() {
        throw new Error('denied');
      },
      setItem() {
        throw new Error('denied');
      },
      removeItem() {
        throw new Error('denied');
      },
    },
  };
  try {
    assert.equal(readIdleLastActive(), null);
    assert.doesNotThrow(() => storeIdleLastActive(1));
    assert.doesNotThrow(() => clearIdleState());
  } finally {
    globalThis.window = previousWindow;
  }
});

test('a corrupted stored value reads as no clock', () => {
  const env = makeEnv({ storage: { [IDLE_KEY]: 'not-a-timestamp' } });
  withEnv(env, () => {
    assert.equal(readIdleLastActive(), null);
  });
});

test('clearing removes the entry', () => {
  const env = makeEnv({ storage: { [IDLE_KEY]: '999' } });
  withEnv(env, () => {
    clearIdleState();
    assert.equal(IDLE_KEY in env.store, false);
  });
});

// ---------------------------------------------------------------------------
// Starting from a persisted clock
// ---------------------------------------------------------------------------

test('a clock older than the window is expired on arrival', () => {
  // The closed-tab case. The tab shut forty minutes ago; reopening the app must
  // not quietly buy another fifteen.
  const h = harness({ storage: { [IDLE_KEY]: String(1_000_000 - 40 * 60 * 1000) } });
  h.start();
  assert.equal(h.calls.timeout, 1);
});

test('a clock inside the window is kept, not rewritten', () => {
  // Otherwise every page load would be a fresh session, which is the bug this
  // persistence exists to prevent.
  const stored = 1_000_000 - 5 * 60 * 1000;
  const h = harness({ storage: { [IDLE_KEY]: String(stored) } });
  h.start();

  assert.equal(h.calls.timeout, 0);
  assert.equal(h.env.writes.length, 0, 'start must not move the clock');

  // Still measured from the stored activity, so the window keeps its original
  // end rather than restarting: another ten minutes takes the remaining five
  // out of it.
  h.advance(10 * 60 * 1000);
  h.check();
  assert.equal(h.calls.timeout, 1);
});

test('no stored clock means the window runs from now', () => {
  const h = harness();
  h.start();
  assert.equal(h.calls.timeout, 0);
  assert.deepEqual(h.timers.delays(), [IDLE_TIMEOUT_MS]);

  h.advance(IDLE_TIMEOUT_MS);
  h.check();
  assert.equal(h.calls.timeout, 1);
});

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

test('activity pushes the deadline out by a full window', () => {
  const h = harness();
  h.start();

  h.advance(10 * 60 * 1000);
  h.fire('keydown');
  assert.deepEqual(h.timers.delays(), [IDLE_TIMEOUT_MS]);
  assert.equal(h.env.store[IDLE_KEY], String(h.now));

  h.advance(IDLE_TIMEOUT_MS - 1);
  h.check();
  assert.equal(h.calls.timeout, 0, 'must not fire a second early');
});

test('every activity event is wired, and every one is unwired on stop', () => {
  const h = harness();
  h.start();
  for (const event of IDLE_ACTIVITY_EVENTS) {
    assert.equal(h.env.window.listenerCount(event), 1, `${event} not attached`);
  }
  assert.equal(h.env.document.listenerCount('visibilitychange'), 1);

  h.stop();
  assert.equal(h.env.window.totalListeners(), 0);
  assert.equal(h.env.document.totalListeners(), 0);
});

test('a burst of activity re-arms once, not once per event', () => {
  // `scroll` fires many times a second and every re-arm is a synchronous
  // `localStorage` write. Throttling it keeps the deadline — which does not
  // move meaningfully in a tenth of a second — and drops the churn.
  const h = harness();
  h.start();

  h.fire('scroll');
  const after = h.env.writes.length;
  assert.equal(after, 1);

  for (let i = 0; i < 20; i += 1) {
    h.advance(20);
    h.fire('scroll');
  }
  assert.equal(h.env.writes.length, after, 'a burst wrote to storage 20 more times');
});

test('the first event of a burst always passes the throttle', () => {
  // The gate compares against the last re-arm, which during a warning is a
  // minute old — so dismissing the dialog is immediate however fast the mouse
  // is moving.
  const h = harness();
  h.start();

  h.advance(IDLE_TIMEOUT_MS - IDLE_WARNING_MS);
  h.check();
  assert.equal(h.calls.warn, 1);

  h.fire('pointerdown');
  assert.equal(h.calls.extend, 1);
  assert.deepEqual(h.timers.delays(), [IDLE_TIMEOUT_MS]);
});

test('a burst does not re-arm from a stopped controller', () => {
  // The listener can outlive the teardown for the length of one event dispatch,
  // and a detached controller that still wrote to storage would resurrect a
  // deadline nothing is going to read.
  const h = harness();
  h.start();
  h.stop();

  h.fire('keydown');
  assert.equal(h.calls.timeout, 0);
});

test('a declined re-arm says so', () => {
  // The warning dialog closes on dismissal, and it must not close on a re-arm
  // that was refused: the deadline would still be a second away, with nothing
  // on screen left to stop it.
  const h = harness();
  h.start();

  assert.equal(h.extend(), true, 'the first re-arm always lands');

  h.advance(200);
  assert.equal(h.extend(), false, 'a burst is refused');

  h.stop();
  assert.equal(h.extend(), false, 'a stopped controller re-arms nothing');
});

// ---------------------------------------------------------------------------
// The warning
// ---------------------------------------------------------------------------

test('the warning opens a minute before the deadline, once', () => {
  const h = harness();
  h.start();

  h.advance(IDLE_TIMEOUT_MS - IDLE_WARNING_MS - 1);
  h.check();
  assert.equal(h.calls.warn, 0);

  h.advance(1);
  h.check();
  assert.equal(h.calls.warn, 1);

  // Anything that re-evaluates inside the window must not stack dialogs.
  h.advance(10_000);
  h.check();
  h.check();
  assert.equal(h.calls.warn, 1);
});

test('the warning is not skipped when the tab wakes inside it', () => {
  // A hidden tab can miss the arm entirely — its timers are throttled — and
  // wake up with only seconds left. Opening the dialog then is too late to be
  // useful, but skipping it entirely is worse: the user gets no warning at all.
  const h = harness({ hidden: true });
  h.start();

  h.advance(IDLE_TIMEOUT_MS - 10_000);
  h.setHidden(false);
  h.check();

  assert.equal(h.calls.warn, 1);
  assert.equal(h.calls.timeout, 0);
});

test('dismissing the warning reports the extension', () => {
  // The dialog closes itself on dismiss, and only `onExtend` says so — without
  // it there is no way for the component to know the deadline moved and the
  // panel would stay up over a session that is no longer ending.
  const h = harness();
  h.start();
  h.advance(IDLE_TIMEOUT_MS - IDLE_WARNING_MS);
  h.check();

  h.fire('pointerdown');
  assert.equal(h.calls.extend, 1);
  assert.deepEqual(h.timers.delays(), [IDLE_TIMEOUT_MS]);
});

test('no warning window means the deadline is the only arm', () => {
  const h = harness({ warnBefore: 0 });
  h.start();
  assert.deepEqual(h.timers.delays(), [IDLE_TIMEOUT_MS]);

  h.advance(IDLE_TIMEOUT_MS);
  h.check();
  assert.equal(h.calls.timeout, 1);
  assert.equal(h.calls.warn, 0);
});

// ---------------------------------------------------------------------------
// Late, frozen and thawed timers
// ---------------------------------------------------------------------------

test('the expiry is latched, so a late timer cannot sign out twice', () => {
  // A backgrounded tab gets its callback long after the deadline. When it
  // finally runs, the visibility handler has usually already fired the same
  // logout — two `signOut` calls and two navigations for one event.
  const h = harness();
  h.start();

  h.advance(IDLE_TIMEOUT_MS);
  h.check();
  assert.equal(h.calls.timeout, 1);

  h.timers.fire();
  h.check();
  h.advance(IDLE_TIMEOUT_MS);
  h.check();
  assert.equal(h.calls.timeout, 1);
});

test('a frozen timer is caught by the next evaluation', () => {
  // The clock is advanced without any timer being allowed to run — what a
  // throttled tab looks like from here — and the session still ends.
  const h = harness();
  h.start();

  h.advance(3 * 60 * 60 * 1000);
  assert.equal(h.calls.timeout, 0, 'nothing fires on its own here');

  h.check();
  assert.equal(h.calls.timeout, 1);
});

test('a click after a stalled deadline is activity, not a lockout', () => {
  // The one case where evidence of presence outranks the clock. A deadline can
  // pass without the timer firing — Chrome throttles background tabs — and the
  // user coming back and clicking is stronger evidence that they are here than
  // an elapsed wall-clock reading is. The version this replaces logged them out
  // on that click, which is the exact opposite of what the click means.
  const h = harness();
  h.start();

  h.advance(IDLE_TIMEOUT_MS + 1);
  h.fire('pointerdown');

  assert.equal(h.calls.timeout, 0);
  assert.deepEqual(h.timers.delays(), [IDLE_TIMEOUT_MS]);
});

test('starting twice does not attach a second set of listeners', () => {
  // React strict mode mounts effects twice in development, and a duplicated
  // registry means duplicated storage writes and two dialogs.
  const h = harness();
  h.start();
  h.start();

  assert.equal(h.env.window.listenerCount('keydown'), 1);
  assert.equal(h.env.document.listenerCount('visibilitychange'), 1);
});

// ---------------------------------------------------------------------------
// Leaving and coming back
// ---------------------------------------------------------------------------

test('closing the tab does not sign out, it only flushes the clock', () => {
  // The chosen semantics: a closed tab is not a logout. Revoking here would mean
  // a `sendBeacon` fired during teardown, which is both unreliable and a
  // surprising thing to do to a user who closed a tab.
  //
  // What it writes is the last time something actually happened, not the moment
  // the page went away. Writing "now" would hand out a fresh fifteen minutes to
  // everyone who ever closed a tab, which is the bug the persistence exists to
  // prevent.
  const h = harness();
  h.start();
  h.advance(60_000);
  h.fire('keydown');
  const lastActivity = h.now;

  h.advance(60_000);
  h.fire('pagehide');

  assert.equal(h.calls.timeout, 0);
  assert.equal(h.env.store[IDLE_KEY], String(lastActivity));
  assert.notEqual(h.env.store[IDLE_KEY], String(h.now));
});

test('returning to a hidden tab re-checks instead of extending', () => {
  // The distinction that makes the feature reachable at all. Resetting the
  // deadline on the way back would mean a tab hidden all afternoon always comes
  // back to a full window, and the user is never logged out no matter how long
  // they were gone.
  const h = harness({ hidden: true });
  h.start();

  h.setHidden(true);
  h.fireOn('visibilitychange');
  assert.equal(h.calls.timeout, 0, 'going hidden must not sign out');

  h.advance(IDLE_TIMEOUT_MS);
  h.setHidden(false);
  h.fireOn('visibilitychange');
  assert.equal(h.calls.timeout, 1);
});

test('a short trip away does not cost the whole window', () => {
  const h = harness({ hidden: true });
  h.start();

  h.advance(2 * 60 * 1000);
  h.setHidden(false);
  h.fireOn('visibilitychange');

  assert.equal(h.calls.timeout, 0);
  assert.deepEqual(h.timers.delays(), [IDLE_TIMEOUT_MS - 2 * 60 * 1000]);
});

test('a page restored from the back/forward cache is re-checked', () => {
  // The one path where timers stop for an unbounded time without any handler
  // running. `pagehide` with `persisted` is the browser telling us the page is
  // about to be frozen, and `pageshow` is the only reliable signal that it
  // thawed again.
  const h = harness();
  h.start();

  h.fire('pagehide', { persisted: true });
  h.advance(4 * 60 * 60 * 1000);
  assert.equal(h.calls.timeout, 0);

  h.fire('pageshow', { persisted: true });
  assert.equal(h.calls.timeout, 1);
});

test('a first load is not mistaken for a cache restore', () => {
  // `pageshow` fires on every load, with `persisted` false. Acting on it would
  // re-check a clock `start` has only just read.
  const h = harness({ storage: { [IDLE_KEY]: String(1_000_000 - 20 * 60 * 1000) } });
  h.start();
  assert.equal(h.calls.timeout, 1, 'the stored clock is already past');

  const fresh = harness();
  fresh.start();
  fresh.fire('pageshow', { persisted: false });
  assert.equal(fresh.calls.timeout, 0);
});

// ---------------------------------------------------------------------------
// Two tabs
// ---------------------------------------------------------------------------

test('a clock from another tab is adopted', () => {
  // The bug this guards: dashboard open in one tab, `/transactions` in another.
  // Both arm on mount, only the one being used re-arms, and the idle one signs
  // out a session its owner is in the middle of using. Working in either tab has
  // to move the other's deadline.
  const h = harness();
  h.start();
  h.advance(14 * 60 * 1000);
  h.check();
  assert.equal(h.calls.warn, 1, 'this tab is about to warn on its own');

  // The other tab records activity at this moment.
  h.fire('storage', { key: IDLE_KEY, newValue: String(h.now) });

  assert.deepEqual(h.timers.delays(), [IDLE_TIMEOUT_MS]);
  assert.equal(h.calls.warn, 1);
  assert.equal(h.calls.timeout, 0);
});

test('adopting does not write, or two tabs trade a rising timestamp forever', () => {
  // If the receiving tab re-stamped with `now()` and wrote it back, the other tab
  // would adopt that, write a newer one, and the pair would ping-pong until the
  // browser stopped caring. One hop, no write.
  const h = harness();
  h.start();
  const before = h.env.writes.length;

  h.fire('storage', { key: IDLE_KEY, newValue: String(h.now + 5_000) });

  assert.equal(h.env.writes.length, before, 'the adopted value was echoed back');
});

test('a clock older than ours is ignored', () => {
  // Another tab can be behind, or can report a value written before ours. Taking
  // it would shorten this tab's window on the strength of stale information.
  const h = harness();
  h.start();
  h.advance(60_000);
  h.fire('keydown');
  const ours = h.now;

  h.fire('storage', { key: IDLE_KEY, newValue: String(ours - 5 * 60 * 1000) });

  assert.deepEqual(h.timers.delays(), [IDLE_TIMEOUT_MS]);
});

test('the same clock twice changes nothing', () => {
  const h = harness();
  h.start();
  h.advance(60_000);
  const before = h.timers.delays();

  h.fire('storage', { key: IDLE_KEY, newValue: String(h.now) });
  h.fire('storage', { key: IDLE_KEY, newValue: String(h.now) });

  assert.deepEqual(h.timers.delays(), before);
});

test("another tab's clock that is already past ends this one too", () => {
  // The mirror image: a tab left open overnight must not sit on a live session
  // just because it never re-evaluated. The other tab's value has to be newer
  // than ours to be adopted at all — a tab reporting from behind must not
  // shorten this one's window — and newer-but-still-stale is the case that
  // actually reaches the deadline.
  const h = harness();
  h.start();
  const loaded = h.now;

  // This tab has been frozen since it loaded. The other tab was last used eight
  // minutes after that, and half an hour has passed since.
  h.advance(30 * 60 * 1000);
  h.fire('storage', { key: IDLE_KEY, newValue: String(loaded + 8 * 60 * 1000) });

  assert.equal(h.calls.timeout, 1);
});

test("another tab's activity dismisses a warning we no longer believe", () => {
  // Otherwise the dialog goes on claiming the session is about to end while
  // somebody is plainly still using it — in the tab next door.
  const h = harness();
  h.start();
  h.advance(IDLE_TIMEOUT_MS - IDLE_WARNING_MS);
  h.check();
  assert.equal(h.calls.warn, 1);

  h.fire('storage', { key: IDLE_KEY, newValue: String(h.now) });
  assert.equal(h.calls.extend, 1);
});

test('the key disappearing means another tab signed out, and this one follows', () => {
  // Better Auth revokes a session cookie every tab of the origin shares, so this
  // session is already dead. Following turns a page of controls that fail on the
  // next request into a redirect.
  const h = harness();
  h.start();
  h.advance(60_000);

  h.fire('storage', { key: IDLE_KEY, newValue: null });

  assert.equal(h.calls.signedOut, 1);
  assert.equal(h.calls.timeout, 0, 'not an idle timeout — a different cause');
});

test("another tab's storage is ignored unless it is ours", () => {
  const h = harness();
  h.start();

  h.fire('storage', { key: 'ruang-theme', newValue: 'light' });
  h.fire('storage', { key: 'unrelated', newValue: null });

  assert.equal(h.calls.signedOut, 0);
  assert.equal(h.calls.timeout, 0);
});

test('a stopped tab follows nobody', () => {
  const h = harness();
  h.start();
  h.stop();
  assert.equal(h.env.window.listenerCount('storage'), 0);

  h.fire('storage', { key: IDLE_KEY, newValue: null });
  assert.equal(h.calls.signedOut, 0);
});

test('a signed-out tab does not also report a timeout', () => {
  // Both latch through the component, but a controller that reports two causes
  // for one event is a controller whose logs will lie.
  const h = harness();
  h.start();

  h.fire('storage', { key: IDLE_KEY, newValue: null });
  h.advance(IDLE_TIMEOUT_MS);
  h.check();

  assert.equal(h.calls.signedOut, 1);
  assert.equal(h.calls.timeout, 0);
});

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

/**
 * The source with its comments stripped.
 *
 * Several of the assertions below are about what the code does *not* contain —
 * no `aria-modal`, no `.focus()`. Those words appear constantly in the comments
 * explaining why they are absent, so a naive text search finds the explanation
 * and fails the very rule it documents.
 */
const code = (path) =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

test('the sidebar no longer owns an idle timer', () => {
  // The inline effect could not be loaded by the render suite — anything
  // importing `next/navigation` is unresolvable there — and it was skipped on
  // every bare route, so a session left open on `/login` was never guarded.
  const sidebar = read('../src/components/Sidebar.jsx');
  assert.equal(/setTimeout\(logout/.test(sidebar), false);
  assert.equal(/30 \* 60 \* 1000/.test(sidebar), false);
  assert.match(sidebar, /clearIdleState/);
});

test('the shell mounts the guard on both branches', () => {
  const shell = read('../src/components/AppShell.jsx');
  assert.equal(shell.match(/<IdleLogout \/>/g)?.length, 2);
});

test('the guard signs out with a full navigation and reads the error', () => {
  // Better Auth resolves to `{ data, error }` rather than throwing, so a
  // `catch`-only guard reads every 4xx as a success — the same trap the Google
  // button documented. And `window.location.assign` gives the server a chance
  // to re-read the cookie it just cleared, which a router navigation does not.
  const component = read('../src/components/idle-logout.jsx');
  assert.match(component, /const \{ error \} = await signOut\(\)/);
  assert.match(component, /idle \? '\/login\?idle=1' : '\/login'/);
  assert.equal(/router\.(replace|push)\(/.test(component), false);
});

test('only a tab that really went idle claims to have gone idle', () => {
  // `?idle=1` is a statement about why. A tab signed out because another one
  // ended the session was not idle, and repeating the claim there is a lie the
  // user reads as "my fifteen minutes ran out" when they were mid-click.
  const component = read('../src/components/idle-logout.jsx');
  assert.match(component, /onTimeout: \(\) => signOutAndLeave\(\{ idle: true \}\)/);
  assert.match(component, /onSignedOut: \(\) => signOutAndLeave\(\)/);
});

test('a sign-out that fails still fails open', () => {
  // The cookie is still valid, so `proxy` bounces the visitor straight back in.
  // Better a no-op than a session destroyed locally with no way back in.
  const component = read('../src/components/idle-logout.jsx');
  assert.match(component, /console\.error\('\[auth\] sign-out gagal:/);
  assert.match(component, /finally\s*\{[\s\S]*?window\.location\.assign/);
});

test('the login page explains an automatic sign-out', () => {
  // Being signed out without being asked reads as the session being taken away.
  const form = read('../src/components/AuthForm.jsx');
  assert.match(form, /searchParams\.get\('idle'\) === '1'/);
  assert.match(form, /<Toast/);
});

test('the login notice floats over the page instead of displacing the form', () => {
  // It used to be a panel inside the `<form>`, which pushed the email field down
  // and left the layout permanently altered by a message nobody needs after a
  // few seconds. The `Toast` reads the flag; nothing renders it inline.
  const form = read('../src/components/AuthForm.jsx');
  assert.equal(/idleSignedOut\s*&&\s*\(\s*<p/.test(form), false, 'the idle notice is back inside the form');
  // The status role moved with the markup, so it has to still be announced.
  const toast = read('../src/components/toast.jsx');
  assert.match(toast, /role="status"/);
  assert.match(toast, /aria-live="polite"/);
});

test('a toast never takes focus away from a field the visitor is using', () => {
  // The whole reason it is a toast and not a dialog: someone may be halfway
  // through typing an email. A focus move, a focus trap, or a document-level
  // Escape listener would each be worse than the message they were not reading.
  // Read the code, not the comments — the comments name all three while
  // explaining why they are absent.
  const toast = code('../src/components/toast.jsx');
  assert.equal(/aria-modal/.test(toast), false);
  assert.equal(/\.focus\(\)/.test(toast), false);
  assert.equal(/addEventListener\(['"]keydown/.test(toast), false);
});

test('the auto-dismiss does not depend on an unstable callback', () => {
  // Callers pass an inline arrow. Depending on it would rebuild the timer on
  // every render of the page behind, and a timer that keeps being replaced by an
  // identical one never reaches its duration — a toast that refuses to close.
  const toast = read('../src/components/toast.jsx');
  assert.match(toast, /dismissRef/);
  assert.match(code('../src/components/toast.jsx'), /\}, \[open, duration\]\)/);
});

test('the login page quotes the window rather than typing it out', () => {
  // Two copies of "15 minutes" is one too many. The copy has to follow the
  // constant, or changing the window leaves the page describing a duration the
  // app no longer enforces.
  const form = read('../src/components/AuthForm.jsx');
  assert.match(form, /import \{ IDLE_TIMEOUT_MS \} from '@\/lib\/idle-logout'/);
  assert.match(form, /\{idleMinutes\} menit/);
  assert.equal(/selama 15 menit/.test(form), false);
});
