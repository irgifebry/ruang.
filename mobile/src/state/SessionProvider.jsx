/**
 * Session provider for the mobile app.
 *
 * Bootstraps from `getSession()` on mount, stores the token that auth
 * functions captured (via `client.setToken()`), and exposes
 * `{ user, status, client, signIn, adoptSession, signOut, refresh }` through context.
 *
 * A failed bootstrap read — including a 401, which the client already
 * turns into a cleared token and an `onUnauthorized` call — leaves the
 * app `out`; the shell reads that to send the user to sign-in. The 401
 * callback also clears the user, so a mid-session expiry cannot leave a
 * stale identity rendered behind an error state.
 *
 * This module is the only place that imports React and `expo-secure-store`
 * (the latter via `../api/storage.js`): `auth.js` and `client.js` stay Expo-free.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { createApiClient } from '../api/client.js';
import { secureStorage } from '../api/storage.js';
import { apiBaseURL } from '../config.js';
import { getSession, signInEmail, signOut as signOutAuth } from '../api/auth.js';
import { createUnauthorizedHandler } from './logout-notice.js';

const SessionContext = createContext(null);

export function SessionProvider({ children, baseURL, storage }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading');

  // Stable across renders: the client is memoised and must not be rebuilt on
  // every user/status change just because the callback identity changed.
  const onUnauthorized = useMemo(
    () => createUnauthorizedHandler({ setUser, setStatus }),
    [],
  );
  const client = useMemo(
    () =>
      createApiClient({
        baseURL: baseURL ?? apiBaseURL(),
        storage: storage ?? secureStorage,
        onUnauthorized,
      }),
    [baseURL, storage, onUnauthorized],
  );

  const readSession = useCallback(async () => {
    const result = await getSession(client);
    if (result?.token) await client.setToken(result.token);
    setUser(result?.user ?? null);
    setStatus(result?.user ? 'in' : 'out');
    return result;
  }, [client]);

  useEffect(() => {
    let cancelled = false;
    readSession().catch(() => {
      if (!cancelled) setStatus('out');
    });
    return () => {
      cancelled = true;
    };
  }, [readSession]);

  const value = useMemo(
    () => ({
      user,
      status,
      // The one HTTP client every screen reads with (Task 9): `request`
      // unwraps the parsed JSON, so `useLedgerData(client)` is a one-liner.
      client,
      async signIn({ email, password }) {
        const result = await signInEmail(client, { email, password });
        setUser(result.user ?? null);
        setStatus(result.user ? 'in' : 'out');
        return result;
      },
      /**
       * Takes a session an auth endpoint already returned — used after
       * sign-up so there is no second sign-in round trip. The token is stored
       * before any read, so a response without a user can still be recovered
       * with `getSession`.
       */
      async adoptSession(result = {}) {
        if (result.token) await client.setToken(result.token);
        if (result.user) {
          setUser(result.user);
          setStatus('in');
          return result;
        }
        return readSession();
      },
      async signOut() {
        await signOutAuth(client);
        setUser(null);
        setStatus('out');
      },
      refresh: readSession,
    }),
    [user, status, client, readSession],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used inside SessionProvider');
  }
  return context;
}
