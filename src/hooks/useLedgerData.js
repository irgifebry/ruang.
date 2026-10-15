'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

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
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const [reloadToken, setReloadToken] = useState(0);

  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let active = true;

    const run = async () => {
      try {
        const data = await loadRef.current();
        if (active) setState({ data, loading: false, error: null });
      } catch (err) {
        if (active) {
          setState({ data: null, loading: false, error: err?.message || 'Gagal memuat data' });
        }
      }
    };

    setState((prev) => ({ ...prev, loading: true, error: null }));
    run();

    return () => {
      active = false;
    };
  }, [reloadToken]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  return { ...state, reload };
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
