'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSession } from '@/lib/auth-client';

/**
 * Loads a ledger-shaped dataset and keeps it in sync with the session.
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
        const { data: sessionData } = await getSession();

        if (!sessionData?.session) {
          if (active) setState({ data: null, loading: false, error: null });
          return;
        }

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
