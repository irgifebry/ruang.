/**
 * Executes the sidebar collapse module against a minimal DOM stand-in.
 *
 * The collapse is deliberately not React state — it is one attribute on `<html>`
 * that every rule in `globals.css` reads — so what matters is that the
 * pre-paint script and the toggle agree on that attribute, and that neither
 * leaves a half-written one behind when `localStorage` throws. `jsdom` is not a
 * dependency here, so this stubs only what the module touches.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  PRE_HYDRATION_SIDEBAR_SCRIPT,
  SIDEBAR_KEY,
  applySidebar,
  isCollapsed,
  isRailToggleClick,
  readStoredSidebar,
  storeSidebar,
  toggleSidebar,
} from '../src/lib/sidebar.js';

/** The globals the module reaches for, with settable localStorage. */
function makeEnv(storage = {}) {
  const elements = new Map();
  const html = { dataset: {} };
  elements.set('html', html);

  const localStorage = {
    getItem: (key) => (key in storage ? storage[key] : null),
    setItem: (key, value) => {
      storage[key] = value;
    },
  };

  return { storage, localStorage, html };
}

/** Installs the stubs the module reads off the real globals. */
function withEnv(env, run) {
  // The module reaches for `document` and `window.localStorage` specifically —
  // the same pair a browser hands it — so the stubs go on those names rather
  // than on `globalThis`.
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  globalThis.document = { documentElement: env.html };
  globalThis.window = { localStorage: env.localStorage };
  try {
    return run();
  } finally {
    globalThis.document = previousDocument;
    globalThis.window = previousWindow;
  }
}

/** Runs the pre-paint script and returns the attribute it left behind. */
function runPrePaint(storage) {
  const html = { dataset: {} };
  const localStorage = { getItem: (key) => (key in storage ? storage[key] : null) };
  new Function('localStorage', 'document', PRE_HYDRATION_SIDEBAR_SCRIPT)(
    localStorage,
    { documentElement: html },
  );
  return html.dataset.sidebar;
}

test('the pre-paint script restores a collapsed rail before first paint', () => {
  // Without this the page paints at 238px and narrows once React has hydrated,
  // which reads as a layout bug rather than a preference.
  assert.equal(runPrePaint({ [SIDEBAR_KEY]: '1' }), 'collapsed');
});

test('the pre-paint script leaves the rail open when nothing is stored', () => {
  assert.equal(runPrePaint({}), 'expanded');
  assert.equal(runPrePaint({ [SIDEBAR_KEY]: '0' }), 'expanded');
});

test('a storage read that throws leaves the rail at its default', () => {
  // Private browsing. The script is wrapped in try/catch, so the attribute is
  // never written and CSS's `:root` default — the open rail — stands.
  const html = { dataset: {} };
  const localStorage = {
    getItem() {
      throw new Error('SecurityError: storage is disabled');
    },
  };

  new Function('localStorage', 'document', PRE_HYDRATION_SIDEBAR_SCRIPT)(
    localStorage,
    { documentElement: html },
  );

  assert.equal(html.dataset.sidebar, undefined);
});

test('toggling flips the attribute and caches the result', () => {
  const env = makeEnv();

  withEnv(env, () => {
    assert.equal(toggleSidebar(), true, 'first click should collapse');
    assert.equal(env.html.dataset.sidebar, 'collapsed');
    assert.equal(env.storage[SIDEBAR_KEY], '1');

    assert.equal(toggleSidebar(), false, 'second click should expand');
    assert.equal(env.html.dataset.sidebar, 'expanded');
    assert.equal(env.storage[SIDEBAR_KEY], '0');
  });
});

test('the toggle flips whatever state the pre-paint script left behind', () => {
  // The two run at different times and never talk, so a reload mid-collapse has
  // to still start from what is on the document, not from a hardcoded default.
  const env = makeEnv();
  applySidebar(env.html, true);

  withEnv(env, () => {
    assert.equal(isCollapsed(env.html), true);
    assert.equal(toggleSidebar(), false);
    assert.equal(isCollapsed(env.html), false);
  });
});

test('a cache write that throws does not undo the toggle', () => {
  const env = makeEnv();
  env.localStorage.setItem = () => {
    throw new Error('SecurityError: storage is disabled');
  };

  withEnv(env, () => {
    assert.equal(toggleSidebar(), true);
    assert.equal(env.html.dataset.sidebar, 'collapsed', 'the rail did not collapse');
  });
});

test('the stored preference round-trips', () => {
  const env = makeEnv();

  withEnv(env, () => {
    storeSidebar(true);
    assert.equal(readStoredSidebar(), true);

    storeSidebar(false);
    assert.equal(readStoredSidebar(), false);
  });
});

/**
 * The rail must stay out of the flow.
 *
 * Both `fixed` and `relative` are single-class position utilities, and Tailwind
 * emits `.relative` after `.fixed` — so putting both on the rail silently
 * demotes it to `position: relative`. It then takes its content height instead
 * of the viewport and pushes the whole page down, which looks like a broken
 * layout rather than a stray class. The toggle button does not need `relative`
 * on the rail: `fixed` is already a containing block for it.
 */
test('the desktop rail is fixed, and does not also ask for relative', () => {
  const source = readFileSync(
    new URL('../src/components/Sidebar.jsx', import.meta.url),
    'utf8',
  );
  const aside = source.match(/<aside\b[^>]*className="([^"]+)"/);

  assert.ok(aside, 'the desktop <aside> was not found');
  assert.match(aside[1], /\bfixed\b/, 'the rail lost `fixed`');
  assert.doesNotMatch(aside[1], /\brelative\b/, '`relative` would win over `fixed`');
});

/** A click target that reports `ancestor` for the selector that matches it. */
function clickTarget(ancestor) {
  return { closest: (selector) => (selector.includes(ancestor) ? ancestor : null) };
}

/** Runs a predicate with the document in a given collapse state. */
function withCollapsed(collapsed, run) {
  const env = makeEnv();
  applySidebar(env.html, collapsed);
  return withEnv(env, run);
}

test('a collapsed rail reopens on a click anywhere on its own surface', () => {
  // The collapsed state is a strip of unlabelled icons: the background is the
  // obvious place to click for "put my sidebar back", so it has to work.
  withCollapsed(true, () => {
    assert.equal(isRailToggleClick(clickTarget('')), true);
    assert.equal(isRailToggleClick({}), true, 'no element should still count as the rail');
    assert.equal(isRailToggleClick(null), true);
  });
});

test('an open rail ignores background clicks', () => {
  // The button is the only way down. Clicking the empty space beside a
  // full-size sidebar is aimed at nothing in particular, and shrinking the
  // navigation out from under the user is a worse guess than ignoring it.
  withCollapsed(false, () => {
    assert.equal(isRailToggleClick(clickTarget('')), false);
  });
});

test('a click on a link, a button or the account popover never toggles', () => {
  // Each of these has its own behaviour, and toggling on top of it would either
  // fight the navigation or close the rail from a click meant for the menu's
  // padding — the popover reaches outside the rail, over the page.
  for (const ancestor of ['a', 'button', '.account-menu']) {
    withCollapsed(true, () => {
      assert.equal(isRailToggleClick(clickTarget(ancestor)), false, `${ancestor} toggled the rail`);
    });
  }
});

test('the resize cursor is collapsed-only', () => {
  // The cursor is CSS now, but the affordance and the click are one decision:
  // if this ever says otherwise, the promise and the behaviour part company.
  const css = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');
  const declarations = [...css.matchAll(/cursor:\s*col-resize/g)];

  assert.equal(declarations.length, 1, 'expected exactly one col-resize declaration');

  for (const declaration of declarations) {
    // The selector owning this declaration is the segment before the last
    // opening brace in front of it; the segment after that brace is just the
    // indentation.
    const parts = css.slice(0, declaration.index).split('{');
    const header = parts[parts.length - 2];
    assert.match(
      header,
      /\[data-sidebar='collapsed'\]/,
      `col-resize outside a collapsed rule: ${header.trim()}`,
    );
  }
});

test('the rail does not set the resize cursor from JSX', () => {
  // A `cursor-col-resize` utility cannot be scoped to the collapsed state, so
  // putting it back on the <aside> would show a resize cursor on an open rail
  // whose background ignores clicks.
  const source = readFileSync(new URL('../src/components/Sidebar.jsx', import.meta.url), 'utf8');
  const aside = source.match(/<aside\b[^>]*className="([^"]+)"/);

  assert.ok(aside, 'the desktop <aside> was not found');
  assert.doesNotMatch(aside[1], /cursor-col-resize/);
});