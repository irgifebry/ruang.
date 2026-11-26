/**
 * Two launch/runtime defects `expo export` cannot see: expo-secure-store@58
 * has no `getItemSync` (the caught TypeError made every launch dark), and a
 * `useMemo` keyed on `[theme]` alone never repaints when the OS theme changes
 * under "Ikuti sistem". Both are source-level checks because ThemeProvider
 * imports React Native and expo-font, which Node cannot load.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(mobileRoot, path), 'utf8');
const provider = read('src/theme/ThemeProvider.jsx');

test('the saved theme is read with the synchronous API expo-secure-store ships', () => {
  assert.match(provider, /SecureStore\.getItem\(THEME_KEY\)/);
  assert.doesNotMatch(provider, /getItemSync/);
  // Persistence on write still uses the async API; only the read was wrong.
  assert.match(provider, /SecureStore\.setItemAsync\(THEME_KEY, next\)/);
});

test('system theme follows live OS changes and the listener is cleaned up', () => {
  assert.match(provider, /Appearance\.addChangeListener\(\(\{ colorScheme \}\)\s*=>/);
  assert.match(provider, /setScheme\(colorScheme\)/);
  assert.match(provider, /useState\(\(\) => Appearance\.getColorScheme\(\)\)/);
  assert.match(provider, /const resolved = useMemo\(\(\) => resolve\(theme, scheme\), \[theme, scheme\]\)/);
  assert.match(provider, /return \(\) => subscription\?\.remove\?\.\(\)/);
  assert.match(provider, /return scheme === 'light' \? 'light' : 'dark'/);
  // Explicit choices stay explicit; only the system branch reads the scheme.
  assert.match(provider, /if \(theme === 'light'\) return 'light'/);
  assert.match(provider, /if \(theme !== 'system'\) return 'dark'/);
});
