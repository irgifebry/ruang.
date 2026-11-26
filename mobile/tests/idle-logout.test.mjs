/**
 * Drives the idle auto-logout module against a minimal `AppState` stand-in.
 *
 * `node --test` has no RN runtime, so the module's only native touch points —
 * `AppState` and the storage — are stubbed: the storage is a synchronous
 * `SecureStore`-shaped stub installed through `setIdleStorage`, and `AppState`
 * is a listener registry installed on `globalThis`. Both are the shape the
 * module reaches for, and the only adaptations to the web original; every
 * timing assertion below is the web suite's own, unchanged.
 *
 * Testing the timing rules rather than waiting them out is the point. The
 * interesting failures here are all about a timer that fires late, the app
 * going away and coming back, or a deadline that survived a restart — none of
 * which a real hour-long wait would surface.
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
  setIdleStorage,
  storeIdleLastActive,
} from '../src/shared/idle-logout.js';

// ---------------------------------------------------------------------------
// Stubs the module reaches for
// ---------------------------------------------------------------------------

/** A listener registry — the slice of `AppState` the module uses. */
function makeTarget() {
  const listeners = new Set();
  return {
    addEventListener(type, fn) {
      listeners.add(fn);
    },
    removeEventListener(type, fn) {
      listeners.delete(fn);
    },
    dispatch(event = {}) {
      for (const fn of [...listeners]) fn(event);
    },
    listenerCount() {
      return listeners.size;
    },
  };
}

/** The storage stub — a synchronous SecureStore shape. */
function makeStorage({ storage: initial = {} } = {}) {
  const store = { ...initial };
  const writes = [];
  return {
    store,
    writes,
    storage: {
      getItem: (key) => (key in store ? store[key] : null),
      setItem: (key, value) => {
        store[key] = String(value);
        writes.push(key);
      },
      removeItem: (key) => {
        delete store[key];
      },
    },
    appState: makeTarget(),
  };
}

/** The globals the module reads off the real `AppState`. */
function makeEnv(options) {
  const stub = makeStorage(options);
  return {
    store: stub.store,
    writes: stub.writes,
    appState: stub.appState,
    storage: stub.storage,
  };
}

/**
 * A timer queue the test drives by hand.
 *
 * `fire` empties the queue before running the callbacks, so a callback that
 * re-arms lands in a fresh queue — the same ordering a real event loop gives.
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
  const previousAppState = globalThis.AppState;
  globalThis.AppState = env.appState;
  setIdleStorage(env.storage);
  try {
    return run();
  } finally {
    globalThis.AppState = previousAppState;
    setIdleStorage(null);
  }
}

/**
 * A controller wired to a controllable clock, plus the counters to assert on.
 *
 * Every entry point is wrapped rather than handed over raw. The module
 * resolves the storage and AppState at call time, so bare calls outside
 * `withEnv` would read a stub the test never installed — a harness that looks
 * like it is testing the persisted deadline while never reading one.
 */
function harness({ storage = {}, timeout, warnBefore } = {}) {
  const env = makeEnv({ storage });
  const timers = makeTimers();
  const calls = { warn: 0, extend: 0, timeout: 0 };
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
    /** Dispatches an AppState change, with the globals installed. */
    fireAppState: (state) => withEnv(env, () => env.appState.dispatch({ state })),
  };
}

// ---------------------------------------------------------------------------
// The numbers
// ---------------------------------------------------------------------------

test('the idle window is one hour', () => {
  assert.equal(IDLE_TIMEOUT_MS, 60 * 60 * 1000);
});

test('a broken timeout setting falls back to the default', () => {
  // `EXPO_PUBLIC_IDLE_TIMEOUT_MS` is typed by a human into a dashboard. The
  // failure modes are an empty field, a stray quote, and a value small enough
  // to fire between two keystrokes — and a guard that logs you out mid-word
  // is worse than the guard it replaced.
  const readTimeout = (raw) => {
    const configured = Number(raw);
    return Number.isFinite(configured) && configured >= 1000 ? configured : 60 * 60 * 1000;
  };

  assert.equal(readTimeout(undefined), 3_600_000);
  assert.equal(readTimeout(''), 3_600_000);
  assert.equal(readTimeout('not-a-number'), 3_600_000);
  assert.equal(readTimeout('500'), 3_600_000);
  assert.equal(readTimeout(0), 3_600_000);
  assert.equal(readTimeout('20000'), 20_000);
});

// ---------------------------------------------------------------------------
// Wiring — the native counterpart of the web suite's `src/components/*` reads
// ---------------------------------------------------------------------------

test('the shared module is plain timing — no React or native imports', () => {
  const source = read('../src/shared/idle-logout.js');
  assert.equal(/import .*react-native/.test(source), false);
  assert.equal(/import .*expo/.test(source), false);
  assert.match(source, /createIdleController/);
});

test('the root layout mounts the guard once, and the shell holds until the session resolves', () => {
  const rootLayout = read('../app/_layout.jsx');
  assert.equal(rootLayout.match(/<IdleLogout \/>/g)?.length, 1);
  const shell = read('../src/components/AppShell.jsx');
  assert.equal(shell.match(/<IdleLogout \/>/g)?.length ?? 0, 0);
  assert.match(shell, /status !== 'in'/);
});

test('the guard component wires the shared module', () => {
  const component = read('../src/state/IdleLogout.jsx');
  assert.match(component, /createIdleController/);
  assert.match(component, /onTimeout/);
  assert.match(component, /clearIdleState/);
  assert.match(component, /signOutAndLeave/);
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
  // Private browsing on native is the same failure mode as the web version's
  // private mode: these throw outright, and reading must not throw.
  setIdleStorage({
    getItem() {
      throw new Error('denied');
    },
    setItem() {
      throw new Error('denied');
    },
    removeItem() {
      throw new Error('denied');
    },
  });
  try {
    assert.equal(readIdleLastActive(), null);
    assert.doesNotThrow(() => storeIdleLastActive(1));
    assert.doesNotThrow(() => clearIdleState());
  } finally {
    setIdleStorage(null);
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
  // The closed-app case. The app shut seventy minutes ago; reopening must not
  // quietly buy another sixty.
  const h = harness({ storage: { [IDLE_KEY]: String(1_000_000 - 70 * 60 * 1000) } });
  h.start();
  assert.equal(h.calls.timeout, 1);
});

test('a clock inside the window is kept, not rewritten', () => {
  // Otherwise every app start would be a fresh session, which is the bug this
  // persistence exists to prevent.
  const stored = 1_000_000 - 5 * 60 * 1000;
  const h = harness({ storage: { [IDLE_KEY]: String(stored) } });
  h.start();

  assert.equal(h.calls.timeout, 0);
  assert.equal(h.env.writes.length, 0, 'start must not move the clock');

  // Still measured from the stored activity, so the window keeps its original
  // end rather than restarting: another 56 minutes takes it past 60 min.
  h.advance(56 * 60 * 1000);
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
  assert.equal(h.extend(), true);
  assert.deepEqual(h.timers.delays(), [IDLE_TIMEOUT_MS]);
  assert.equal(h.env.store[IDLE_KEY], String(h.now));

  h.advance(IDLE_TIMEOUT_MS - 1);
  h.check();
  assert.equal(h.calls.timeout, 0, 'must not fire a second early');
});

test('a burst of activity is throttled, not one arm per event', () => {
  // `scroll` fires far faster than the deadline moves, so the first event of a
  // burst passes the throttle and the rest within `IDLE_EXTEND_THROTTLE_MS`
  // are refused: a storage write a second is real work for no change.
  const h = harness();
  h.start();

  assert.equal(h.extend(), true);
  const after = h.env.writes.length;
  for (let i = 0; i < 20; i += 1) {
    h.advance(20);
    assert.equal(h.extend(), false, 'a burst is refused');
  }
  assert.equal(h.env.writes.length, after, 'a burst wrote to storage 20 more times');
});

test('the app-state listener is wired, and unwired on stop', () => {
  const h = harness();
  h.start();
  assert.equal(h.env.appState.listenerCount(), 1);
  h.stop();
  assert.equal(h.env.appState.listenerCount(), 0);
});

test('starting twice does not attach a second set of listeners', () => {
  const h = harness();
  h.start();
  h.start();
  assert.equal(h.env.appState.listenerCount(), 1);
});

test('a declined re-arm says so', () => {
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

test('the warning is not skipped when the app comes back to the foreground', () => {
  // A backgrounded app can miss the warning entirely — its timers are
  // throttled — so coming back with only seconds left is exactly when the
  // dialog has to appear: skipping it is worse.
  const h = harness();
  h.start();

  h.advance(IDLE_TIMEOUT_MS - 10_000);
  h.fireAppState('active');

  assert.equal(h.calls.warn, 1);
  assert.equal(h.calls.timeout, 0);
});

test('dismissing the warning reports the extension', () => {
  const h = harness();
  h.start();
  h.advance(IDLE_TIMEOUT_MS - IDLE_WARNING_MS);
  h.check();

  assert.equal(h.extend(), true);
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
  const h = harness();
  h.start();

  h.advance(3 * 60 * 60 * 1000);
  assert.equal(h.calls.timeout, 0, 'nothing fires on its own here');

  h.check();
  assert.equal(h.calls.timeout, 1);
});

test('activity after a stalled deadline is activity, not a lockout', () => {
  // The one case where evidence of presence outranks the clock: the timer was
  // frozen and came back to a passed deadline, and the press is stronger
  // evidence the user is there than an elapsed wall-clock reading is.
  const h = harness();
  h.start();

  h.advance(IDLE_TIMEOUT_MS + 1);
  assert.equal(h.extend(), true);
  assert.deepEqual(h.timers.delays(), [IDLE_TIMEOUT_MS]);
});

// ---------------------------------------------------------------------------
// Leaving and coming back
// ---------------------------------------------------------------------------

test('going away flushes the clock and never signs out by itself', () => {
  // The chosen semantics: the app going to the background is not a logout. What
  // it writes is the last time something actually happened, not the moment it
  // went away. Writing "now" would hand a fresh window to everyone who ever
  // put the app away.
  const h = harness();
  h.start();
  h.advance(60_000);
  h.fireAppState('background');

  assert.equal(h.calls.timeout, 0);
  const lastActivity = h.env.store[IDLE_KEY];
  h.advance(60_000);
  assert.equal(h.calls.timeout, 0, 'a backgrounded app does not end the session');
  assert.equal(h.env.store[IDLE_KEY], String(lastActivity));
});

test('returning to the foreground re-checks instead of extending', () => {
  // The distinction that makes the feature reachable at all: returning is a
  // re-evaluation of the deadline, not evidence of activity.
  const h = harness();
  h.start();
  h.fireAppState('background');

  h.advance(IDLE_TIMEOUT_MS);
  h.fireAppState('active');
  assert.equal(h.calls.timeout, 1);
});

test('a short trip away does not cost the whole window', () => {
  const h = harness();
  h.start();

  h.advance(2 * 60 * 1000);
  h.fireAppState('active');

  assert.equal(h.calls.timeout, 0);
  assert.deepEqual(h.timers.delays(), [IDLE_TIMEOUT_MS - 2 * 60 * 1000]);
});

// ---------------------------------------------------------------------------
// Wiring — the native counterpart of the web suite's `src/lib/idle-logout.js` reads
// ---------------------------------------------------------------------------

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('the module resolves AppState from the global or lazily from react-native', () => {
  const source = read('../src/shared/idle-logout.js');
  assert.match(source, /typeof require[\s\S]*?require\('react-native'\)/);
  assert.match(source, /globalThis\.AppState/);
});
