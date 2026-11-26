/**
 * `category-colors.js` is the one shared module with no web test to copy: the
 * web version resolves Tailwind class names, which do not exist in React
 * Native. The native version returns hex instead, so the values are pinned here
 * against the web palette — a drifted swatch is otherwise invisible until a
 * category chip renders in the wrong colour.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { barColor, chipColor, fill } from '../../src/shared/category-colors.js';
import { tokens } from '../../src/theme/tokens.js';

test('barColor and fill pin the web category hexes', () => {
  for (const color of ['blue', 'orange', 'violet', 'pink']) {
    assert.equal(barColor(color, 'dark'), barColor(color, 'light'));
    assert.equal(fill(color, 'dark'), barColor(color, 'dark'));
  }

  assert.equal(barColor('blue', 'dark'), '#70c8ff');
  assert.equal(barColor('orange', 'dark'), '#ffad6b');
  assert.equal(barColor('violet', 'dark'), '#c1a0ff');
  assert.equal(barColor('pink', 'dark'), '#ff92bd');
});

test('lime resolves to the theme accent token, not a fixed hex', () => {
  assert.equal(barColor('lime', 'dark'), tokens('dark').accent);
  assert.equal(barColor('lime', 'light'), tokens('light').accent);
  assert.equal(fill('lime', 'light'), tokens('light').accent);
  assert.notEqual(barColor('lime', 'dark'), barColor('lime', 'light'));
});

test('chipColor carries the exact web tint and label colour', () => {
  assert.deepEqual(chipColor('blue', 'dark'), { bg: '#70c8ff18', text: '#77caff' });
  assert.deepEqual(chipColor('orange', 'dark'), { bg: '#ffad6b18', text: '#ffb77a' });
  assert.deepEqual(chipColor('violet', 'dark'), { bg: '#c1a0ff18', text: '#c1a0ff' });
  assert.deepEqual(chipColor('pink', 'dark'), { bg: '#ff92bd18', text: '#ff92bd' });
});

test('the lime chip follows the theme for its label', () => {
  assert.deepEqual(chipColor('lime', 'dark'), {
    bg: '#c9fb5514',
    text: tokens('dark').accentText,
  });
  assert.deepEqual(chipColor('lime', 'light'), {
    bg: '#c9fb5514',
    text: tokens('light').accentText,
  });
});

test('an unknown colour falls back to lime instead of blanking a row', () => {
  assert.equal(barColor('chartreuse', 'light'), tokens('light').accent);
  assert.equal(fill('chartreuse', 'light'), tokens('light').accent);
  assert.deepEqual(chipColor('chartreuse', 'light'), chipColor('lime', 'light'));
});
