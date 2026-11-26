import { useCallback, useEffect, useRef, useState } from 'react';

import { createSilentRefresh } from '../api/refresh.js';

/**
 * How long to wait after a write before quietly re-reading the API.
 *
 * The write itself is immediate — delaying it would lose data if the screen
 * closed during the wait. Only the *refresh* is debounced: several saves in
 * a row share one fetch, and the old data stays on screen while it happens.
 */
export const SILENT_REFRESH_DELAY_MS = 2000;

const LEDGER_PATH = '/api/ledger';

/** Stable no-ops for demo: a write is impossible, so there is nothing to do. */
const noop = () => {};

/**
 * Options for the default full-ledger read. `/api/ledger` is a POST that
 * dispatches on `body.action`; a request with no body is rejected with
 * `400 JSON tidak valid.`. Sharing one module-level object keeps the hook's
 * options ref stable and gives every tab screen the exact same request.
 * `fetchMonthlyBreakdown` on /riwayat is the one other action.
 */
export const FETCH_LEDGER_REQUEST = { body: { action: 'fetchLedger' } };

/**
 * Loads a ledger-shaped dataset and keeps it in sync with the session.
 *
 * The first read is one `client.request(path, requestOptions)` — the server
 * already answers 401 for a missing session, which the client surfaces as an
 * `ApiError`, so no pre-flight session check is needed here (see
 * `useLedgerData` on the web app for the same reasoning). `requestOptions` is
 * how a screen asks for a different ledger action, e.g. the history's
 * `{ body: { action: 'fetchMonthlyBreakdown', months: 12 } }`; it is held in a
 * ref so a caller creating the object inline cannot retrigger the load.
 *
 * `reload` mirrors the web version: after a write it refreshes quietly —
 * never flipping `loading`, so the page keeps its content and scroll — and
 * when there is nothing to preserve (no data yet, or the last load failed)
 * it re-runs the full load with the visible loading state so the error
 * screen can go away.
 *
 * `patchData` reflects a successful write in the local data before the
 * silent refresh lands.
 *
 * A third argument switches the hook to demo mode: `demoData` is returned as
 * is with `loading: false`, and both `reload` and `patchData` are no-ops. The
 * guard lives in `load`, the only function that calls `client.request`, so a
 * guest can never reach the API with a token they do not have.
 */
export function useLedgerData(client, requestOptions, demoData = null) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [syncError, setSyncError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  // Refs first: the refresher's callbacks must never observe a stale
  // snapshot of the data or the error, and `reload` reads the latest state
  // while being a stable callback.
  const clientRef = useRef(client);
  clientRef.current = client;
  const optionsRef = useRef(requestOptions);
  optionsRef.current = requestOptions;
  const dataRef = useRef(null);
  const stateRef = useRef({ data: null, error: null });
  stateRef.current = { data, error };
  const refresherRef = useRef(null);
  const activeRef = useRef(true);

  const demoActive = demoData != null;
  // `load` is created once, so it must read the latest argument through a ref.
  const demoRef = useRef(demoData);
  demoRef.current = demoData;

  const load = useCallback(async () => {
    if (demoRef.current != null) return demoRef.current;
    if (!clientRef.current) return null;
    return clientRef.current.request(LEDGER_PATH, optionsRef.current);
  }, []);

  const apply = useCallback((payload) => {
    dataRef.current = payload;
    setData((prev) => (prev === payload ? prev : payload));
  }, []);

  if (!refresherRef.current) {
    refresherRef.current = createSilentRefresh({
      delay: SILENT_REFRESH_DELAY_MS,
      load,
      onSuccess: (payload) => {
        if (!activeRef.current) return;
        apply(payload);
        setSyncError(null);
      },
      onError: () => {
        if (!activeRef.current) return;
        // Keep the data on screen. A failed background sync is not a reason
        // to replace the whole page with an error after a successful write.
        setSyncError('Belum bisa memuat data terbaru. Data lama tetap ada.');
      },
    });
  }

  useEffect(() => {
    // Demo has no session to load and nothing to refresh. The dependency on
    // `demoActive` cancels any pending silent refresh when demo mode toggles.
    if (demoActive) return undefined;
    activeRef.current = true;
    let active = true;

    setLoading(true);
    setError(null);
    setSyncError(null);

    (async () => {
      try {
        const payload = await load();
        if (!active) return;
        apply(payload);
        setLoading(false);
      } catch (err) {
        if (!active) return;
        setError(err?.message || 'Gagal memuat data');
        setLoading(false);
      }
    })();

    return () => {
      active = false;
      activeRef.current = false;
      refresherRef.current?.cancel();
    };
  }, [reloadToken, load, apply, demoActive]);

  const reload = useCallback(() => {
    const current = stateRef.current;
    if (!current.data || current.error) {
      // Nothing to preserve — retry the full load with the visible loading
      // state so the error screen can go away.
      setReloadToken((token) => token + 1);
      return;
    }
    // Silent refresh — `loading` stays false and the page keeps its content.
    refresherRef.current?.schedule();
  }, []);

  const patchData = useCallback(
    (updater) => {
      setData((prev) => {
        if (!prev) return prev;
        const next = typeof updater === 'function' ? updater(prev) : updater;
        dataRef.current = next;
        return next === prev ? prev : next;
      });
    },
    [],
  );

  // After every hook: a screen that enters or leaves demo without a remount
  // must still call the same number of hooks on each render.
  if (demoActive) {
    return {
      data: demoData,
      loading: false,
      error: null,
      syncError: null,
      reload: noop,
      patchData: noop,
    };
  }

  return { data, loading, error, syncError, reload, patchData };
}
