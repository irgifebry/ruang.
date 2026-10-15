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
import { getSharedSession } from '@/lib/auth-client';
import { useProfile } from '@/hooks/useProfile';
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

  // Who is signed in. Shares the shell's in-flight read rather than asking on
  // its own — this used to be a second `getSession()` for an answer two sibling
  // components were fetching at the same moment.
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    let active = true;

    getSharedSession()
      .then(({ data }) => {
        if (active) setUserId(data?.user?.id ?? null);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  // The cache is only a cache: the saved value lives on `profiles`, so pull it
  // once on mount and let it win. Without this, signing in on a new device would
  // show the other device's stale theme until the user changed it by hand.
  //
  // Read from the shared profile cache the sidebar already fills instead of
  // asking for `fetchProfile` here as well. Both used to fire on every cold
  // load, each paying for the same row — and on the bare routes, where there is
  // no sidebar, this one was paying for it alone.
  const { profile, resolved } = useProfile(userId);

  useEffect(() => {
    if (resolved && profile?.theme) setTheme(profile.theme);
  }, [resolved, profile?.theme]);

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