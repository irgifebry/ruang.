/**
 * Tests for the theme data layer.
 *
 * There is no accent choice any more — only light / dark / system — so what is
 * left to assert is the wiring between the module and the browser: that the
 * pre-paint script and `applyTheme` agree on the theme classes, that both pick
 * the same favicon colours, and that the default is the one the schema declares.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  DEFAULT_THEME,
  FAVICON_GLYPH,
  PRE_HYDRATION_THEME_SCRIPT,
  THEMES,
  THEME_KEY,
  faviconHref,
  faviconSvg,
  resolvesToLight,
} from '../src/lib/theme-presets.js';

// ---------------------------------------------------------------------------
// Themes
// ---------------------------------------------------------------------------

test('the only choices are light, dark and follow-system', () => {
  // The settings screen renders `THEMES` verbatim, so this list is the whole
  // feature — there is no fourth option hiding behind a default.
  assert.deepEqual(
    THEMES.map((item) => item.id),
    ['dark', 'light', 'system'],
  );
  for (const item of THEMES) assert.ok(item.label, `${item.id} has no label`);
});

test('the default theme matches the database default', () => {
  // `schema.sql` declares `theme text not null default 'dark'`. If these drift,
  // a brand-new account repaints on its first load.
  const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');

  assert.ok(schema.includes(`default '${DEFAULT_THEME}'`), 'schema default drifted');
  assert.ok(schema.includes("theme in ('dark', 'light', 'system')"), 'theme check drifted');
});

test('the pre-paint script reads the same storage key the provider writes', () => {
  assert.ok(PRE_HYDRATION_THEME_SCRIPT.includes(THEME_KEY));
});

test('the pre-paint script sets the theme class and nothing per-accent', () => {
  assert.ok(PRE_HYDRATION_THEME_SCRIPT.includes('theme-light'));
  assert.ok(PRE_HYDRATION_THEME_SCRIPT.includes('classList.add'));

  // The palette now lives entirely in `globals.css`, driven by that one class.
  // A stray inline `--c-accent` write would fight the stylesheet.
  assert.ok(!PRE_HYDRATION_THEME_SCRIPT.includes('--c-accent'), 'still writes an accent variable');
});

// ---------------------------------------------------------------------------
// Favicon
// ---------------------------------------------------------------------------

test('faviconSvg paints the glyph on a filled rounded square', () => {
  const svg = faviconSvg(false);

  assert.equal((svg.match(/<rect/g) ?? []).length, 1);
  assert.ok(/<rect [^>]*fill="#[0-9a-f]{6}"/i.test(svg), 'no filled rect');
  assert.ok(svg.includes('rx="8"'), 'corner radius lost');
});

test('faviconSvg follows the light theme, not just the dark one', () => {
  // The lime that reads on a near-black tab is unreadable on a light one, so
  // this has to differ per theme or the icon vanishes in a light browser.
  assert.notEqual(faviconSvg(false), faviconSvg(true));

  for (const isLight of [true, false]) {
    const svg = faviconSvg(isLight);
    const fills = [...svg.matchAll(/fill="(#[0-9a-f]{6})"/gi)].map((match) => match[1]);
    assert.equal(fills.length, 2, 'rect fill and glyph ink');
    assert.notEqual(fills[0], fills[1], 'glyph is invisible on its own fill');
  }
});

test('faviconHref percent-encodes the hex, or the URI truncates', () => {
  // A raw '#c9fb55' inside a data URI ends the colour at the URI boundary and
  // the browser falls back to no icon at all.
  const href = faviconHref(false);
  const payload = href.slice('data:image/svg+xml,'.length);

  assert.ok(href.startsWith('data:image/svg+xml,'));
  assert.ok(!payload.includes('#'), 'raw # in the payload');
  assert.equal(decodeURIComponent(payload), faviconSvg(false));
});

test('the pre-paint script themes the favicon before first paint', () => {
  assert.ok(PRE_HYDRATION_THEME_SCRIPT.includes('link[rel~="icon"]'));
  assert.ok(PRE_HYDRATION_THEME_SCRIPT.includes('image/svg+xml'));
});

test('the pre-paint favicon matches the one React paints', () => {
  // Two code paths build the same icon; a drift means the tab shows the wrong
  // markup until hydration, then silently corrects itself.
  //
  // The script cannot inline the resolved colours — it picks between them at
  // runtime — so the SVG is cut at its fills and every literal chunk in
  // between has to appear verbatim in the script: the root tag and rect
  // geometry, the glyph path, and the closing tags.
  for (const isLight of [true, false]) {
    for (const chunk of faviconSvg(isLight).split(/#[0-9a-f]{6}/i)) {
      assert.ok(PRE_HYDRATION_THEME_SCRIPT.includes(chunk), `svg markup drifted: ${chunk}`);
    }
  }
});

test('the generated favicon glyph matches the static icon.svg', () => {
  // icon.svg is the unthemed fallback and cannot be interpolated, so the glyph
  // is duplicated. If the logo is ever redrawn, only one copy should change.
  const staticIcon = readFileSync(new URL('../src/app/icon.svg', import.meta.url), 'utf8');

  for (const isLight of [true, false]) {
    const glyph = faviconSvg(isLight).match(/<path d="([^"]+)"/)[1];
    assert.ok(staticIcon.includes(glyph), `glyph drifted for isLight=${isLight}`);
  }
});

test('the in-app brand mark is the favicon glyph', () => {
  // The sidebar and welcome chips used to hold a text "R", which meant the app
  // and its own tab icon were two unrelated drawings. One mark, one source.
  const mark = readFileSync(new URL('../src/components/BrandMark.jsx', import.meta.url), 'utf8');

  assert.ok(mark.includes('FAVICON_GLYPH'), 'the mark does not read the shared glyph');
  assert.ok(
    mark.includes('currentColor'),
    'the mark hardcodes a colour, which cannot follow the theme',
  );
});

test('apple-icon.png exists at the size iOS asks for', () => {
  // Safari cannot read an SVG favicon; without this file the home screen gets a
  // screenshot of the page. The size is read from the PNG header rather than
  // trusted, so a regeneration that changes it is caught.
  const png = readFileSync(new URL('../src/app/apple-icon.png', import.meta.url));

  assert.equal(png.subarray(1, 4).toString('ascii'), 'PNG', 'not a PNG');
  assert.equal(png.readUInt32BE(16), 180, 'width');
  assert.equal(png.readUInt32BE(20), 180, 'height');
});

test('gen-icons.mjs rasterises the shipped glyph, not a copy of it', () => {
  // The script parses `FAVICON_GLYPH` directly, so the PNG cannot drift from
  // the tab icon. What it must not do is re-describe the shape separately: that
  // is the drift this design removed.
  const script = readFileSync(new URL('../scripts/gen-icons.mjs', import.meta.url), 'utf8');

  assert.ok(script.includes('FAVICON_GLYPH'), 'the script ignores the shared glyph');
  assert.ok(
    script.includes('flattenPath(FAVICON_GLYPH)'),
    'the script builds the path from its own description',
  );
  assert.ok(!script.includes('MARK'), 'a second description of the mark crept back in');

  // Every command the glyph uses has to be understood, or the script throws at
  // runtime instead of drawing the mark.
  const used = new Set(FAVICON_GLYPH.match(/[A-Za-z]/g));
  const supported = new Set('MLHVACZmlhvacz');
  for (const command of used) {
    assert.ok(supported.has(command), `glyph uses an unsupported command: ${command}`);
  }
});

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

test('resolvesToLight treats system as a live OS read, not a stored value', () => {
  const withScheme = (matches) => {
    globalThis.window = { matchMedia: () => ({ matches }) };
    try {
      return resolvesToLight('system');
    } finally {
      delete globalThis.window;
    }
  };

  assert.equal(withScheme(true), false, 'dark OS resolved to light');
  assert.equal(withScheme(false), true, 'light OS resolved to dark');
  assert.equal(resolvesToLight('system'), false, 'no matchMedia at all');

  assert.equal(resolvesToLight('light'), true);
  assert.equal(resolvesToLight('dark'), false);
  assert.equal(resolvesToLight('chartreuse'), false, 'unknown id should not read as light');
});