import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(mobileRoot, rel), 'utf8');

test('the root Stack does not add a router header above the themed screens', () => {
  const source = read('app/_layout.jsx');
  assert.match(source, /headerShown:\s*false/);
});

test('the tab bar follows the theme instead of the white default', () => {
  const source = read('app/(app)/_layout.jsx');
  assert.match(source, /headerShown:\s*false/);
  assert.match(source, /tabBarStyle:/);
  assert.match(source, /tabBarActiveTintColor:/);
  assert.match(source, /tabBarInactiveTintColor:/);
  assert.match(source, /tabBarLabelStyle:/);
  // Every colour must come from the token palette, never a literal.
  assert.match(source, /useTheme\(\)/);
  assert.match(source, /tokens\(/);
  assert.doesNotMatch(source, /#[0-9a-fA-F]{3,8}/);
});
