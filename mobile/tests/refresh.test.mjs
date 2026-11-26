/**
 * Tests for the silent refresher behind the dashboard.
 *
 * The contract under test: after `delay` (default 2000ms) a scheduled
 * refresh loads once, `onSuccess` receives the loaded data, a failed load
 * calls `onError` without surfacing as an unhandled rejection, and
 * `cancel()` stops a pending load.
 *
 * The timer is injected, so nothing here waits real time.
 *
 * Run with: npm test (or: node --test tests/refresh.test.mjs).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSilentRefresh } from '../src/api/refresh.js';

/**
 * A fake timer: records every `setTimeout` call (callback + ms) so the test
 * can assert the delay and fire callbacks by hand. `clearTimeout` marks the
 * entry, mirroring the real API so `firePending` can skip it.
 */
function fakeTimer() {
  const timers = [];
  return {
    timers,
    setTimeout(fn, ms) {
      const entry = { fn, ms, fired: false, cleared: false };
      timers.push(entry);
      return entry;
    },
    clearTimeout(entry) {
      entry.cleared = true;
    },
    /** Returns the promise of the first pending callback, or null. */
    firePending() {
      const entry = timers.find((t) => !t.fired && !t.cleared);
      if (!entry) return null;
      entry.fired = true;
      return entry.fn();
    },
  };
}

test('schedule() loads after exactly the default 2000ms', () => {
  const timer = fakeTimer();
  const refresher = createSilentRefresh({ timer, load: async () => ({}) });
  refresher.schedule();
  assert.equal(timer.timers.length, 1);
  assert.equal(timer.timers[0].ms, 2000);
});

test('two schedule() calls in a row trigger only one load', async () => {
  const timer = fakeTimer();
  let loads = 0;
  const refresher = createSilentRefresh({
    timer,
    load: async () => {
      loads += 1;
      return { loads };
    },
  });
  refresher.schedule();
  refresher.schedule();
  assert.equal(timer.timers.length, 1, 'the second schedule must coalesce into the pending one');
  const data = await timer.firePending();
  assert.equal(loads, 1);
  assert.equal(data.loads, 1);
});

test('onSuccess receives the data from load()', async () => {
  const timer = fakeTimer();
  const received = [];
  createSilentRefresh({
    timer,
    load: async () => ({ hello: 'world' }),
    onSuccess: (data) => received.push(data),
  }).schedule();
  await timer.firePending();
  assert.equal(received.length, 1);
  assert.deepEqual(received[0], { hello: 'world' });
});

test('a failed load calls onError and never rejects out of the timer', async () => {
  const timer = fakeTimer();
  const errors = [];
  const refresher = createSilentRefresh({
    timer,
    load: async () => {
      throw new Error('Gagal memuat');
    },
    onError: (err) => errors.push(err),
  });
  refresher.schedule();
  await timer.firePending();
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /Gagal memuat/);

  // A later schedule still works after a failure.
  refresher.schedule();
  assert.ok(timer.timers.length >= 2);
});

test('cancel() prevents the scheduled load', async () => {
  const timer = fakeTimer();
  let loads = 0;
  const refresher = createSilentRefresh({
    timer,
    load: async () => {
      loads += 1;
      return null;
    },
  });
  refresher.schedule();
  refresher.cancel();
  assert.equal(timer.timers[0].cleared, true);
  await timer.firePending();
  assert.equal(loads, 0, 'cancel() must stop the load');
});

/** A promise whose resolution the test controls, to hold a load in flight. */
function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test('schedule() during an in-flight load coalesces instead of starting a second load', async () => {
  const timer = fakeTimer();
  const gate = deferred();
  let loads = 0;
  const refresher = createSilentRefresh({
    timer,
    load: async () => {
      loads += 1;
      await gate.promise;
      return { loads };
    },
  });

  refresher.schedule();
  const first = timer.firePending();
  assert.equal(loads, 1, 'the first load has started');

  refresher.schedule();
  assert.equal(
    timer.timers.length,
    1,
    'a schedule while the load is still running must not queue a parallel fetch',
  );

  gate.resolve();
  await first;
  assert.equal(loads, 1);

  // Once the load settles, the next write may start a fresh cycle.
  refresher.schedule();
  assert.equal(timer.timers.length, 2, 'a schedule after the load settles starts a new timer');
});

test('cancel() during an in-flight load suppresses its callbacks', async () => {
  const timer = fakeTimer();
  const gate = deferred();
  const successes = [];
  const errors = [];
  const refresher = createSilentRefresh({
    timer,
    load: async () => {
      await gate.promise;
      return { stale: true };
    },
    onSuccess: (data) => successes.push(data),
    onError: (err) => errors.push(err),
  });

  refresher.schedule();
  const inFlight = timer.firePending();
  refresher.cancel();
  gate.resolve();
  await inFlight;

  assert.equal(successes.length, 0, 'a cancelled load must not replace the data on screen');
  assert.equal(errors.length, 0, 'a cancelled load must not report an error either');
});
