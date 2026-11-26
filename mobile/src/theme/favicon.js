/**
 * The brand glyph — a verbatim copy of `FAVICON_GLYPH` from the web app's
 * `src/lib/theme-presets.js`. Metro cannot import from outside `mobile/`, so a
 * test in `tests/auth-pages-exports.test.mjs` pins this string against the web
 * constant; the tab icon and the in-app brand mark cannot drift apart.
 */
export const FAVICON_GLYPH =
  'M6.6 24.6V8.4h5a7 7 0 0 1 7 7h-5a2 2 0 0 0-2-2v11.2zM18.1 21a3.6 3.6 0 1 0 7.2 0 3.6 3.6 0 1 0-7.2 0z';
