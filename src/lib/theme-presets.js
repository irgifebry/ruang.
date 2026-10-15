/**
 * Theme data and the DOM writes that apply it.
 *
 * Deliberately has no `'use client'` and no React: `layout.jsx` imports
 * `PRE_HYDRATION_THEME_SCRIPT` to build the inline pre-paint script, and a
 * client component cannot be rendered from a server component's inline script.
 * Keeping the two halves separate means there is exactly one implementation of
 * "what does this theme look like", used by both.
 *
 * The accent colour is no longer a user choice — it is the brand lime, fixed in
 * `globals.css`. Only the light/dark/system switch remains, so nothing here
 * needs an accent id any more: the four `--c-accent*` variables are resolved by
 * CSS from the `theme-light` class, and this module only has to flip that class
 * and repaint the favicon to match.
 */

export const THEME_KEY = 'ruang-theme';

export const THEMES = [
  { id: 'dark', label: 'Gelap', hint: 'Default. Low light, high contrast.' },
  { id: 'light', label: 'Terang', hint: 'Paper-like, easier in daylight.' },
  { id: 'system', label: 'Ikuti sistem', hint: 'Mengikuti pengaturan sistem operasi.' },
];

/** The default preference, used before the profile (or localStorage) has been read. */
export const DEFAULT_THEME = 'dark';

/**
 * The favicon's two colour pairs.
 *
 * One per theme, because the brand lime that reads on a near-black tab is
 * unreadable on a light one. These mirror `--c-accent` / `--c-accent-ink` in
 * `globals.css`; the favicon is SVG markup rather than CSS, so it cannot read
 * the variable and has to name the colour itself.
 */
export const FAVICON_FILL = { dark: '#c9fb55', light: '#7aa80c' };
export const FAVICON_INK = { dark: '#11150b', light: '#fafcf4' };

/** Whether the given theme id resolves to the light palette right now. */
export function resolvesToLight(theme) {
  if (theme === 'light') return true;
  if (theme !== 'system') return false;
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? !window.matchMedia('(prefers-color-scheme: dark)').matches
    : false;
}

/**
 * The favicon glyph: `r.` — the wordmark, reduced to its first letter and its
 * period.
 *
 * This is the identity mark, so it is drawn rather than borrowed. A lowercase
 * `r` is the one letter of "ruang" with no enclosed counter, which is what
 * makes it survive 16px: the cap "R" this replaced had a bowl whose white
 * middle closed into a blob at tab size. The period is carried over because it
 * is the most recognisable part of the wordmark, where it is the accent colour.
 *
 * Drawn as two subpaths in one `d`: the stem-plus-shoulder, then the disc.
 *
 * Duplicated from `src/app/icon.svg` because that file is a static asset the
 * browser fetches as-is, with no way to interpolate the theme into it. It is
 * asserted against that file's markup in `tests/theme.test.jsx` so the two
 * cannot drift. `scripts/gen-icons.mjs` rasterises this exact string, so the
 * home-screen icon cannot disagree with the tab either.
 */
export const FAVICON_GLYPH =
  'M6.6 24.6V8.4h5a7 7 0 0 1 7 7h-5a2 2 0 0 0-2-2v11.2zM18.1 21a3.6 3.6 0 1 0 7.2 0 3.6 3.6 0 1 0-7.2 0z';

/** The favicon SVG for one theme. */
export function faviconSvg(isLight) {
  const tone = isLight ? 'light' : 'dark';
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
    `<rect width="32" height="32" rx="8" fill="${FAVICON_FILL[tone]}"/>` +
    `<path d="${FAVICON_GLYPH}" fill="${FAVICON_INK[tone]}"/>` +
    '</svg>'
  );
}

/**
 * The favicon as a data URI.
 *
 * A route or a static file cannot serve this: the resolved theme lives in
 * localStorage and Postgres, so only the browser knows which colour to draw.
 * `#` has to be percent-encoded or the URI truncates at the first hex digit.
 */
export function faviconHref(isLight) {
  return `data:image/svg+xml,${encodeURIComponent(faviconSvg(isLight))}`;
}

/**
 * Points the page's icon link at the themed favicon.
 *
 * The link `<link rel="icon">` that `src/app/icon.svg` makes is reused rather
 * than duplicated — two competing icon links resolve unpredictably across
 * browsers, and one of them would always be the unthemed static file.
 */
export function applyFavicon(isLight) {
  if (typeof document === 'undefined') return;
  const href = faviconHref(isLight);

  let link = document.querySelector('link[rel~="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/svg+xml';
    document.head.appendChild(link);
  }
  if (link.getAttribute('href') !== href) link.setAttribute('href', href);
}

/**
 * Applies a theme to the document element.
 *
 * Also updates the `theme-color` meta tag and the favicon, which drive mobile
 * browser chrome and the tab icon; without them they keep the previous theme's
 * colours. The palette itself needs nothing here — `globals.css` re-resolves
 * every `--c-*` variable off the `theme-light` class.
 */
export function applyTheme(element, theme) {
  if (typeof document === 'undefined') return;
  const isLight = resolvesToLight(theme);

  element.classList.toggle('theme-light', isLight);
  element.classList.toggle('dark', !isLight);
  applyFavicon(isLight);

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', isLight ? '#f6f7f2' : '#0b0d0c');
}

/**
 * Reads the cached preference.
 *
 * `localStorage` is only a cache of the database value — signing in on a new
 * device replaces it once the profile loads. It exists so the theme can be
 * applied before first paint; see the inline script in `layout.jsx`.
 *
 * Access can throw outright in private browsing rather than returning null, so
 * every read is guarded.
 */
export function readStoredTheme() {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  try {
    return window.localStorage.getItem(THEME_KEY) || DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

/** Caches the preference. Failure here only costs the pre-paint cache. */
export function storeTheme(theme) {
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Ignored: the theme still applies for this page view.
  }
}

/**
 * The pre-paint theme script.
 *
 * The saved theme lives in Postgres, so neither the server render nor the first
 * client render knows it — the page would paint dark and then jump to light.
 * `layout.jsx` inlines this in `<head>` so it runs before any markup is painted,
 * reading the same localStorage cache the provider writes.
 *
 * `applyTheme` is a module function and cannot be serialised into an inline
 * script, so its few lines are reproduced here deliberately: this is the
 * pre-paint approximation, and `applyTheme` is what runs for real once React
 * takes over. The two favicon colour pairs are interpolated from the constants
 * above rather than typed out, so the pre-paint icon and the React-painted one
 * cannot drift; `tests/theme.test.jsx` asserts that.
 *
 * The favicon is set here too. Waiting for React would show the unthemed static
 * `icon.svg` in the tab for as long as hydration takes.
 */
export const PRE_HYDRATION_THEME_SCRIPT = `(function(){try{
var t=localStorage.getItem(${JSON.stringify(THEME_KEY)})||${JSON.stringify(DEFAULT_THEME)},
d=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches,
l=t==='light'||(t==='system'&&!d),
F=${JSON.stringify(FAVICON_FILL)},I=${JSON.stringify(FAVICON_INK)},
p=l?'light':'dark',
e=document.documentElement;
e.classList.add(l?'theme-light':'dark');
var k=document.querySelector('link[rel~="icon"]');
if(!k){k=document.createElement('link');k.rel='icon';k.type='image/svg+xml';document.head.appendChild(k)}
k.setAttribute('href','data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="'+F[p]+'"/><path d="${FAVICON_GLYPH}" fill="'+I[p]+'"/></svg>'));
}catch(e){}})();`;