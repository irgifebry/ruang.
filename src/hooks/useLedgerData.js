'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * How long to wait after a successful write before quietly re-reading the API.
 *
 * The write itself is immediate — delaying it would lose data if the tab closed
 * during the wait. Only the *refresh* is debounced: several saves in a row
 * share one fetch, and the old data stays on screen while it happens.
 */
export const SILENT_REFRESH_DELAY_MS = 2000;

/**
 * Loads a ledger-shaped dataset and keeps it in sync with the session.
 *
 * The loader is called directly, with no `getSession()` in front of it. That
 * check used to be a separate round trip that gated the real fetch, so a cold
 * dashboard cost three sequential server calls before the first row appeared:
 * `proxy`, then `/api/auth/get-session`, then `/api/ledger`. It was also
 * redundant — `/api/ledger` already answers `401 'Sesi tidak ditemukan. Silakan
 * masuk kembali.'` for a missing session, and `callLedger` turns that into a
 * `DataError` carrying the same string, so the pages that render
 * `<ErrorState message={error} />` show exactly what they showed before. One
 * request now carries both the data and the session verdict.
 */
export function useLedgerData(load) {
  const [state, setState] = useState({ data: null, loading: true, error: null, syncError: null });
  const [reloadToken, setReloadToken] = useState(0);

  const loadRef = useRef(load);
  loadRef.current = load;
  const stateRef = useRef(state);
  stateRef.current = state;
  const timerRef = useRef(null);
  const activeRef = useRef(true);

  useEffect(() => {
    let active = true;
    activeRef.current = true;

    const run = async () => {
      try {
        const data = await loadRef.current();
        if (active) setState({ data, loading: false, error: null, syncError: null });
      } catch (err) {
        if (active) {
          setState({ data: null, loading: false, error: err?.message || 'Gagal memuat data', syncError: null });
        }
      }
    };

    setState((prev) => ({ ...prev, loading: true, error: null, syncError: null }));
    run();

    return () => {
      active = false;
      activeRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [reloadToken]);

  /**
   * After a write, refresh quietly instead of flipping `loading`. The pages
   * kept their content mounted, so the scroll position does not move and the
   * optimistic row the caller just patched stays visible until real data
   * arrives. If the last load failed there is nothing to preserve — retry with
   * the full loading state so the error screen can go away.
   */
  const reload = useCallback(() => {
    const current = stateRef.current;
    if (!current.data || current.error) {
      setReloadToken((token) => token + 1);
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      timerRef.current = null;
      if (!activeRef.current) return;
      try {
        const data = await loadRef.current();
        if (activeRef.current) setState((prev) => ({ ...prev, data, syncError: null }));
      } catch (err) {
        // Keep the data on screen. A failed background sync is not a reason to
        // replace the whole page with an error after the user's save succeeded.
        if (activeRef.current) {
          setState((prev) => ({ ...prev, syncError: err?.message || 'Gagal menyinkronkan data' }));
        }
      }
    }, SILENT_REFRESH_DELAY_MS);
  }, []);

  /** Reflect a successful write in the local data before the API is re-read. */
  const patchData = useCallback((updater) => {
    setState((prev) => {
      if (!prev.data) return prev;
      const next = typeof updater === 'function' ? updater(prev.data) : updater;
      return next === prev.data ? prev : { ...prev, data: next };
    });
  }, []);

  return { ...state, reload, patchData };
}

/**
 * Wraps a write with busy/error tracking so pages do not each reimplement it.
 * Returns `[run, busy, error, setError]`.
 */
export function useMutation() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const run = useCallback(async (fn) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      return true;
    } catch (err) {
      setError(err?.message || 'Terjadi kesalahan');
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  return [run, busy, error, setError];
}
