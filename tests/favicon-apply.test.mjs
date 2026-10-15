/**
 * Executes the pre-paint script against a minimal DOM stand-in.
 *
 * The other theme tests assert on strings. That is enough to prove the script is
 * wired up, but it says nothing about whether the browser ends up with a themed
 * favicon — the thing the user actually sees. `jsdom` is not a dependency here,
 * so this stubs only the handful of DOM calls the script makes:
 * `document.documentElement.classList/style`, `document.head`, and
 * `querySelector('link[rel~="icon"]')`.
 *
 * The stub deliberately models Next.js's real output: one existing
 * `<link rel="icon">` pointing at the static `/icon.svg`, which is what the
 * `icon.svg` file convention emits. That is the link the script has to find and
 * repoint, and if it instead appended a second one the page would have two
 * competing icon links with no defined winner.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { PRE_HYDRATION_THEME_SCRIPT } from '../src/lib/theme-presets.js';

/** A link element recording the attributes the script touches. */
function makeLink(href) {
  return { rel: 'icon', href, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
}

/**
 * Runs the script with `storage` as localStorage and `links` as the icon links
 * already in the document. Returns the store so the caller can assert on what
 * the script left behind.
 */
function runScript({ storage, links = [makeLink('/icon.svg?hash.svg')], prefersDark = true } = {}) {
  const localStorage = {
    getItem: (key) => (key in (storage ?? {}) ? storage[key] : null),
  };
  const classes = new Set();
  const props = {};
  const head = { children: [], appendChild(node) { this.children.push(node); } };

  const document = {
    documentElement: {
      classList: {
        add: (c) => classes.add(c),
        toggle: () => {},
      },
      style: { setProperty: (k, v) => { props[k] = v; } },
    },
    head,
    createElement: () => makeLink(null),
    // Only the selector the script actually uses needs to resolve.
    querySelector: (selector) =>
      selector === 'link[rel~="icon"]' ? links[0] ?? null : null,
  };

  const window = {
    matchMedia: (query) => ({ matches: query.includes('dark') ? prefersDark : false }),
  };

  const fn = new Function('localStorage', 'document', 'window', PRE_HYDRATION_THEME_SCRIPT);
  fn(localStorage, document, window);

  return { classes, props, head, links };
}

/**
 * The same harness, but with a localStorage whose reads throw.
 *
 * Needs its own copy rather than a flag on `runScript`, because a throwing stub
 * has to be the `localStorage` binding itself — a getter that threw would be
 * caught by the `try` before the script ever saw it, which is a different test.
 */
function runScriptThrowing() {
  const link = makeLink('/icon.svg');
  const classes = new Set();
  const props = {};
  const head = { children: [], appendChild(node) { this.children.push(node); } };

  const document = {
    documentElement: {
      classList: { add: (c) => classes.add(c), toggle: () => {} },
      style: { setProperty: (k, v) => { props[k] = v; } },
    },
    head,
    createElement: () => makeLink(null),
    querySelector: (selector) => (selector === 'link[rel~="icon"]' ? link : null),
  };

  const window = { matchMedia: () => ({ matches: true }) };
  const localStorage = {
    getItem() {
      throw new Error('SecurityError: storage is disabled');
    },
  };

  new Function('localStorage', 'document', 'window', PRE_HYDRATION_THEME_SCRIPT)(
    localStorage,
    document,
    window,
  );

  return { classes, props, head, links: [link] };
}

test('the pre-paint script repoints the existing icon link, not a new one', () => {
  const link = makeLink('/icon.svg?hash.svg');
  const { head } = runScript({ links: [link] });

  assert.equal(head.children.length, 0, 'appended a second icon link');
  assert.ok(link.attrs.href.startsWith('data:image/svg+xml,'), 'did not overwrite the href');
});

test('the pre-paint script follows the stored light theme', () => {
  const darkLink = makeLink('/icon.svg');
  const lightLink = makeLink('/icon.svg');

  runScript({ storage: { 'ruang-theme': 'dark' }, links: [darkLink] });
  runScript({ storage: { 'ruang-theme': 'light' }, links: [lightLink] });

  const dark = decodeURIComponent(darkLink.attrs.href.split(',')[1]);
  const light = decodeURIComponent(lightLink.attrs.href.split(',')[1]);

  assert.ok(dark.includes('fill="#c9fb55"'), `dark lime missing: ${dark}`);
  assert.ok(light.includes('fill="#7aa80c"'), `light lime missing: ${light}`);
});

test('the pre-paint script writes only the theme class', () => {
  // The palette is CSS's job now. A variable written inline here would win over
  // the stylesheet and survive a theme change with the wrong values.
  const { props } = runScript({ storage: { 'ruang-theme': 'light' } });

  assert.deepEqual(props, {}, 'the script still writes CSS variables');
});

test('system theme picks the favicon from the OS preference', () => {
  const darkOs = makeLink('/icon.svg');
  const lightOs = makeLink('/icon.svg');

  runScript({ storage: { 'ruang-theme': 'system' }, links: [darkOs], prefersDark: true });
  runScript({ storage: { 'ruang-theme': 'system' }, links: [lightOs], prefersDark: false });

  assert.ok(decodeURIComponent(darkOs.attrs.href.split(',')[1]).includes('fill="#c9fb55"'));
  assert.ok(decodeURIComponent(lightOs.attrs.href.split(',')[1]).includes('fill="#7aa80c"'));
});

test('a document with no icon link gets one appended', () => {
  // Nothing to repoint, so the script has to create it rather than silently
  // doing nothing and leaving the tab with no icon.
  const { head } = runScript({ links: [] });

  assert.equal(head.children.length, 1);
  assert.ok(head.children[0].attrs.href.startsWith('data:image/svg+xml,'));
});

test('a storage read that throws does not leave a half-written icon', () => {
  // Private browsing makes localStorage.getItem throw outright. The script is
  // wrapped in try/catch, so it aborts before touching the icon — the static
  // /icon.svg stays and the tab keeps an icon instead of going blank. What
  // matters is that nothing partial was written on the way out.
  const link = makeLink('/icon.svg');
  const { head } = runScriptThrowing();

  assert.equal(head.children.length, 0, 'appended a link from an aborted script');
  assert.equal(link.attrs.href, undefined, 'wrote a partial href');
  assert.equal(link.href, '/icon.svg', 'static icon was clobbered');
});