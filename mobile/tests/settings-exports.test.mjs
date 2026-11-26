/**
 * Smoke test for the `/settings` route → screen binding.
 *
 * Node cannot import a `.jsx` file that pulls in `react-native` and
 * `expo-router`, so this is a source-level check rather than a render test.
 * It exists because `expo export` bundles an undefined named import without
 * complaining: the tab then renders nothing (or crashes) instead of the
 * screen. This route is nested one level deeper than the other tabs, so the
 * relative path is pinned as well as the export name.
 *
 * Run with: npm test (or: node --test tests/settings-exports.test.mjs).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const routeSource = readFileSync(join(mobileRoot, 'app/(app)/settings/index.jsx'), 'utf8');
const screenSource = readFileSync(join(mobileRoot, 'src/screens/Settings.jsx'), 'utf8');

/** Every name the route pulls out of the Settings module. */
function namedImports(source) {
  const names = [];
  const pattern = /import\s*\{([^}]*)\}\s*from\s*['"][^'"]*Settings\.jsx['"]/g;
  for (const match of source.matchAll(pattern)) {
    for (const part of match[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0].trim();
      if (name) names.push(name);
    }
  }
  return names;
}

/** Names the screen module makes available to importers. */
function namedExports(source) {
  const names = new Set();
  for (const match of source.matchAll(/export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([\w$]+)/g)) {
    names.add(match[1]);
  }
  for (const match of source.matchAll(/export\s*\{([^}]*)\}\s*;?/g)) {
    for (const part of match[1].split(',')) {
      const segments = part.trim().split(/\s+as\s+/);
      const name = (segments[1] ?? segments[0]).trim();
      if (name) names.add(name);
    }
  }
  return names;
}

test('Settings.jsx has the named Settings export the /settings route imports', () => {
  const imports = namedImports(routeSource);
  assert.deepEqual(imports, ['Settings'], 'the route should import { Settings } from the screen');

  const exports = namedExports(screenSource);
  assert.ok(
    exports.has('Settings'),
    'src/screens/Settings.jsx must export Settings — otherwise <Settings /> is undefined',
  );
});

test('the route points three levels up to the screen, not at a sibling file', () => {
  assert.match(
    routeSource,
    /from\s+['"]\.\.\/\.\.\/\.\.\/src\/screens\/Settings\.jsx['"]/,
    'the settings route lives one directory deeper than the other tabs',
  );
});

test('the settings screen keeps its default and SettingsScreen exports too', () => {
  assert.match(screenSource, /export\s+default\s+(?:async\s+)?function\s+Settings/);
  const exports = namedExports(screenSource);
  assert.ok(exports.has('SettingsScreen'), 'the older SettingsScreen name stays available');
});
