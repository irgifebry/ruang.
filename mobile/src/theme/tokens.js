/**
 * Design tokens for the native app.
 *
 * Mirrored from the web app's `src/app/globals.css`: the `:root` block is the
 * dark palette, `:root.theme-light` the light one. Values are hex strings —
 * native code has no CSS variables, so the palette is plain data. `spacing`
 * mirrors the card/section rhythm used across both apps; `mobileBar` matches
 * the web's `--mobile-bar-h`.
 */

const DARK = {
  bg: '#0b0d0c',
  shell: '#0c0f0d',
  panel: '#111412',
  panel2: '#151916',
  raised: '#151a15',
  sunken: '#0e120f',
  hover: '#171c18',
  overlay: '#040605',
  line: '#252a27',
  lineSoft: '#29312a',
  line2: '#303730',
  line3: '#333b33',
  ink: '#f0f1eb',
  body: '#a8b0a7',
  muted: '#8c948c',
  subtle: '#7d857c',
  ghost: '#5c665c',
  track: '#2b312b',
  accent: '#c9fb55',
  accentHover: '#d8ff83',
  accentInk: '#11150b',
  accentText: '#c9fb55',
  danger: '#ff8c76',
  dangerHover: '#ffb3a8',
  dangerInk: '#ff9a8e',
  dangerFillInk: '#23120e',
  dangerSurface: '#2a1512',
  warn: '#ffc45c',
  warnText: '#ffc45c',
};

const LIGHT = {
  bg: '#f6f7f2',
  shell: '#ffffff',
  panel: '#ffffff',
  panel2: '#fafaf6',
  raised: '#f3f4ee',
  sunken: '#f6f7f0',
  hover: '#ebede5',
  overlay: '#181a17',
  line: '#dbded2',
  lineSoft: '#e4e6dc',
  line2: '#cdd2c4',
  line3: '#c1c7b7',
  ink: '#131611',
  body: '#4a5247',
  muted: '#687064',
  subtle: '#7f877a',
  ghost: '#98a092',
  track: '#e1e4d8',
  accent: '#7aa80c',
  accentHover: '#689208',
  accentInk: '#fafcf4',
  accentText: '#618b08',
  danger: '#be3a26',
  dangerHover: '#a3301e',
  dangerInk: '#bf3e2a',
  dangerFillInk: '#fff7f6',
  dangerSurface: '#fdebe7',
  warn: '#be8214',
  warnText: '#926008',
};

/**
 * Google's four brand quadrants, kept here rather than in a component: they
 * are literal hex values, and every hex in this app lives in a token module.
 * The web button draws the same mark; a monochrome "G" reads as a broken button.
 */
export const GOOGLE_COLORS = {
  blue: '#4285F4',
  green: '#34A853',
  yellow: '#FBBC05',
  red: '#EA4335',
};

/** The four paths of the 48×48 Google mark, in the same order as the colours. */
export const GOOGLE_PATHS = [
  'M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z',
  'M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z',
  'M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z',
  'M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z',
];

const SPACING = { card: 16, section: 32, mobileBar: 56 };
const RADIUS = { xs: 2, sm: 3, md: 4, lg: 8, xl: 10, full: 999 };
const FONT = { display: 'Space Grotesk', mono: 'DM Mono' };

/**
 * The token object for one theme.
 *
 * `theme` ∈ `dark` | `light`; anything else resolves to the dark palette,
 * which is the provider default while the profile (or `system`) is unknown.
 */
export function tokens(theme = 'dark') {
  const palette = theme === 'light' ? LIGHT : DARK;
  return { ...palette, spacing: SPACING, radius: RADIUS, font: FONT };
}

/**
 * A token colour at a CSS-style alpha, e.g. `bg-ruang-warn/10` on the web.
 *
 * The web writes those surfaces as `rgb(var(--c-warn) / 0.1)` so the panel
 * underneath shows through. React Native has no CSS `rgb()` alpha syntax, but
 * it accepts `rgba()` strings, so returning one keeps the same compositing
 * instead of inventing a second, opaque "tinted" hex per theme.
 */
export function withAlpha(hex, alpha) {
  const value = String(hex).replace('#', '');
  const channels = [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16));
  if (channels.some((channel) => !Number.isFinite(channel))) return hex;
  return `rgba(${channels.join(', ')}, ${alpha})`;
}
