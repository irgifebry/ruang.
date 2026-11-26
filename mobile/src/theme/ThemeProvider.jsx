import { Appearance } from 'react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useFonts } from 'expo-font';
import * as SpaceGrotesk from '@expo-google-fonts/space-grotesk';
import * as DMMono from '@expo-google-fonts/dm-mono';
import { ThemeContext } from './useTheme.js';

/** Saved preference lives in SecureStore — it is per-device app state. */
export const THEME_KEY = 'ruang-theme';

export const THEMES = ['dark', 'light', 'system'];

/** The default preference used before SecureStore has answered. */
export const DEFAULT_THEME = 'dark';

/**
 * The families the provider loads — every weight the web app sets — keyed by
 * the exact names the tokens use (`Space Grotesk`, `DM Mono`; the family
 * names come from each package's metadata). Values are the `@expo-google-fonts`
 * TTFs, the same files the web app loads through `next/font`.
 */
const FONTS_TO_LOAD = [
  {
    fontFamily: SpaceGrotesk.__metadata__.family,
    fontDefinitions: [
      { path: SpaceGrotesk.SpaceGrotesk_400Regular, weight: 400 },
      { path: SpaceGrotesk.SpaceGrotesk_500Medium, weight: 500 },
      { path: SpaceGrotesk.SpaceGrotesk_600SemiBold, weight: 600 },
      { path: SpaceGrotesk.SpaceGrotesk_700Bold, weight: 700 },
    ],
  },
  {
    fontFamily: DMMono.__metadata__.family,
    fontDefinitions: [
      { path: DMMono.DMMono_400Regular, weight: 400 },
      { path: DMMono.DMMono_500Medium, weight: 500 },
    ],
  },
];

/**
 * Resolves a preference to the palette it paints with right now. The scheme is
 * passed in rather than read here so a system-theme change while the app is
 * open can re-resolve: a `useMemo` on `[theme]` alone would never repaint.
 */
function resolve(theme, scheme) {
  if (theme === 'light') return 'light';
  if (theme !== 'system') return 'dark';
  return scheme === 'light' ? 'light' : 'dark';
}

/**
 * Holds the theme preference, loads the fonts, and exposes the context
 * `useTheme()` reads. `setTheme` saves to SecureStore as well as setting
 * state, so the choice survives a restart.
 */
export default function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    try {
      // `getItem` is the synchronous reader expo-secure-store actually ships;
      // the nonexistent sync reader threw a TypeError that this catch silently
      // turned into "always start dark" on every launch.
      return SecureStore.getItem(THEME_KEY) || DEFAULT_THEME;
    } catch {
      return DEFAULT_THEME;
    }
  });
  const [scheme, setScheme] = useState(() => Appearance.getColorScheme());
  const [fontsLoaded] = useFonts(FONTS_TO_LOAD);

  // "Ikuti sistem" must follow the OS while the app is open, not only at
  // launch. The listener is installed once and removed on unmount.
  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      setScheme(colorScheme);
    });
    return () => subscription?.remove?.();
  }, []);

  const resolved = useMemo(() => resolve(theme, scheme), [theme, scheme]);

  const setTheme = useCallback((next) => {
    setThemeState(next);
    try {
      SecureStore.setItemAsync(THEME_KEY, next);
    } catch {
      // The theme still applies for this session; persistence is best-effort.
    }
  }, []);

  const value = useMemo(
    () => ({ theme, resolved, setTheme, fontsLoaded }),
    [theme, resolved, setTheme, fontsLoaded],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
