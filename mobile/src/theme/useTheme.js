import { createContext, useContext } from 'react';

/**
 * Theme state for the native app.
 *
 * `theme` is the user's preference — `dark`, `light` or `system` — while
 * `resolved` is the palette the app paints with right now: `system` is read
 * through `Appearance.getColorScheme()` and comes back as `dark` or `light`.
 * Every screen asks `useTheme()` and passes `resolved` to `tokens()`.
 */
export const ThemeContext = createContext(null);

/**
 * The current theme preference and setter. `setTheme` persists the choice;
 * it never throws if SecureStore is unavailable — the theme still applies
 * for the current session.
 */
export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
