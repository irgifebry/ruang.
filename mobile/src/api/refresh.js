/**
 * The silent refresher behind the dashboard.
 *
 * The page shows its data immediately after a write; this module only
 * debounces the *re-read*: after `delay`, `load` runs once, `onSuccess`
 * receives the loaded data and `onError` receives the failure. Everything is
 * handled inside the refresher, so a rejected `load` never surfaces as an
 * unhandled rejection.
 *
 * Pure over its injected dependencies — `timer` is `{ setTimeout,
 * clearTimeout }` and defaults to the globals — so it runs under plain
 * `node --test` with a fake timer.
 */

export function createSilentRefresh({ delay = 2000, timer, load, onSuccess, onError } = {}) {
  const setTimer = timer?.setTimeout ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = timer?.clearTimeout ?? ((id) => clearTimeout(id));
  const onSuccessCb = onSuccess ?? (() => {});
  const onErrorCb = onError ?? (() => {});
  const loadFn = load ?? (async () => null);

  let handle = null;
  // A load is in flight between the timer firing and `loadFn()` settling.
  // `handle` is already null in that window, so without `running` a second
  // `schedule()` would start a parallel fetch.
  let running = false;
  // Bumped on every cancel(); a run that starts before the bump finds itself
  // stale and skips its callbacks, so `cancel()` also stops a load already in
  // flight rather than only the one that has not started yet.
  let generation = 0;

  async function run() {
    handle = null;
    running = true;
    const myGeneration = generation;
    try {
      const data = await loadFn();
      if (generation === myGeneration) onSuccessCb(data);
      return data;
    } catch (err) {
      // Keep whatever the page already shows. A failed background refresh is
      // not a reason to replace the screen with an error after a successful
      // write.
      if (generation === myGeneration) onErrorCb(err);
      return null;
    } finally {
      running = false;
    }
  }

  /**
   * Coalesces with a pending *or in-flight* refresh: several `schedule()`
   * calls share a single `load`. Only once that load settles can the next
   * `schedule()` start a new cycle.
   */
  function schedule() {
    if (handle !== null || running) return;
    handle = setTimer(run, delay);
  }

  /**
   * Stops a pending refresh and invalidates one already in flight.
   */
  function cancel() {
    generation += 1;
    if (handle !== null) {
      clearTimer(handle);
      handle = null;
    }
  }

  return { schedule, cancel };
}
