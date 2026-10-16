/**
 * Executes the sidebar wheel guard against a minimal DOM stand-in.
 *
 * The rule is about a mouse wheel over chrome that is not a scroll surface, so
 * the stand-in only has to record a listener: what matters is that
 * `preventDefault` is reachable (a passive listener cannot stop a scroll, and
 * React attaches wheel listeners passively), that browser zoom is left alone,
 * and that the guard is wired to the fixed panes rather than to something
 * harmless. `jsdom` is not a dependency here, so this stubs only what the
 * module touches — the same approach as `sidebar-collapse.test.mjs`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { blockWheelScroll } from '../src/lib/sidebar.js';

/** A stand-in for a guarded element; it only has to remember its listeners. */
function makeElement() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(type, handler, options) {
      listeners.set(type, { handler, options });
    },
    removeEventListener(type, handler) {
      if (listeners.get(type)?.handler === handler) listeners.delete(type);
    },
  };
}

/** A wheel event stand-in. `preventDefault` is the only thing under test. */
function wheelEvent({ ctrlKey = false } = {}) {
  const event = {
    ctrlKey,
    prevented: false,
    preventDefault: () => {
      event.prevented = true;
    },
  };
  return event;
}

test('a wheel over a guarded pane does not scroll anything behind it', () => {
  // The rail is fixed over the page and has nothing of its own to scroll, so
  // without this the page moves from a wheel aimed at the sidebar.
  const element = makeElement();
  blockWheelScroll(element);

  const listener = element.listeners.get('wheel');
  assert.ok(listener, 'no wheel listener was attached');
  assert.equal(
    listener.options.passive,
    false,
    'a passive listener cannot preventDefault',
  );

  const event = wheelEvent();
  listener.handler(event);
  assert.equal(event.prevented, true, 'the wheel was allowed through');
});

test('ctrl + wheel stays with the browser', () => {
  // Ctrl + wheel is browser zoom, not scrolling, and a sidebar is not worth
  // losing zoom over — so the guard must let it through untouched.
  const element = makeElement();
  blockWheelScroll(element);

  const event = wheelEvent({ ctrlKey: true });
  element.listeners.get('wheel').handler(event);
  assert.equal(event.prevented, false, 'browser zoom was cancelled');
});

test('the guard detaches with its pane', () => {
  const element = makeElement();
  const detach = blockWheelScroll(element);

  detach();
  assert.equal(element.listeners.size, 0, 'the listener outlived its pane');
});

/**
 * The guard has to sit on the panes that float over the page. Attached to the
 * drawer or to nothing at all it would still pass its own tests and change
 * nothing on screen.
 */
test('the guard is wired to the rail and the mobile bar', () => {
  const source = readFileSync(
    new URL('../src/components/Sidebar.jsx', import.meta.url),
    'utf8',
  );

  const header = source.match(/<header\b[^>]*>/);
  const aside = source.match(/<aside\b[^>]*>/);

  assert.ok(header, 'the mobile bar was not found');
  assert.ok(aside, 'the desktop <aside> was not found');
  assert.match(header[0], /ref=\{barRef\}/, 'the mobile bar is not guarded');
  assert.match(aside[0], /ref=\{railRef\}/, 'the rail is not guarded');
  assert.match(source, /blockWheelScroll/, 'nothing attaches the guard');
});
