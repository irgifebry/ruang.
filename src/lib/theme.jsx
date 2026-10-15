/**
 * Theme provider.
 *
 * Applies the user's saved theme to `<html>` and shares it with the settings
 * screen. Two details make this more than a `useState`:
 *
 * 1. **Flash of the wrong theme.** The preference lives in Postgres, so neither
 *    SSR nor the first client render knows it. Without help the page would paint
 *    dark and then jump to light. The inline script in `layout.jsx` runs before
 *    first paint off the same localStorage cache, so the correct theme is on
 *    screen before React hydrates and this provider's effect is just a
 *    reconciliation rather than a visible change.
 * 2. **system mode is a subscription.** 'system' has to follow the OS while it
 *    is selected, which means a `matchMedia` listener, not a one-time read.
 *
 * The database value is the source of truth; localStorage is only its cache. A
 * user signing in on a new device gets the saved theme once the profile loads.
 */

'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getSession } from '@/lib/auth-client';
import { THEME_KEY, applyTheme, readStoredTheme, storeTheme } from '@/lib/theme-presets';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  // Seeded from the localStorage cache rather than a hardcoded default. The
  // inline script in `layout.jsx` has already painted this value on <html>; if
  // the state started at 'dark' the first effect below would immediately undo
  // that and the user would see the page flash to dark and back.
  const [theme, setTheme] = useState(readStoredTheme);

  // Repaint whenever it changes. Idempotent, so running it again on mount after
  // the pre-paint script is harmless.
  useEffect(() => {
    applyTheme(document.documentElement, theme);
    storeTheme(theme);
  }, [theme]);

  // The cache is only a cache: the saved value lives on `profiles`, so pull it
  // once on mount and let it win. Without this, signing in on a new device would
  // show the other device's stale theme until the user changed it by hand.
  useEffect(() => {
    let active = true;

    getSession()
      .then(async ({ data }) => {
        if (!data?.session) return;

        const res = await fetch('/api/ledger', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'fetchProfile' }),
        });
        const profile = await res.json();
        if (active && profile?.theme) setTheme(profile.theme);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  // 'system' tracks the OS live: the user can flip their desktop to light while
  // the tab is open.
  useEffect(() => {
    if (theme !== 'system' || typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme(document.documentElement, theme);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [theme]);

  // Two tabs share localStorage, so a theme change in one has to reach the other
  // or they drift apart on the next navigation.
  useEffect(() => {
    const onStorage = (event) => {
      if (event.key === THEME_KEY && event.newValue) setTheme(event.newValue);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  /** Applies a value, so callers persist it themselves. */
  const update = useCallback((next) => {
    if (next.theme) setTheme(next.theme);
  }, []);

  const value = useMemo(() => ({ theme, update }), [theme, update]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Reads the current theme. Returns null outside a provider so callers can guard. */
export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) return null;
  return context;
}