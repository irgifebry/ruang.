/**
 * Smoke test for the `/` route → dashboard binding.
 *
 * Node cannot import a `.jsx` file that pulls in `react-native` and
 * `expo-router`, so this is a source-level check rather than a render test.
 * It exists because `expo export` bundles an undefined import without
 * complaining: a named import with no matching named export leaves
 * `<Dashboard />` undefined and the screen renders nothing.
 *
 * Run with: npm test (or: node --test tests/dashboard-exports.test.mjs).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const routeSource = readFileSync(join(mobileRoot, 'app/(app)/index.jsx'), 'utf8');
const screenSource = readFileSync(join(mobileRoot, 'src/screens/Dashboard.jsx'), 'utf8');

/** Every name the route pulls out of the Dashboard module. */
function namedImports(source) {
  const names = [];
  const pattern = /import\s*\{([^}]*)\}\s*from\s*['"][^'"]*Dashboard\.jsx['"]/g;
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

test('Dashboard.jsx has the named Dashboard export the / route imports', () => {
  const imports = namedImports(routeSource);
  assert.deepEqual(imports, ['Dashboard'], 'the route should import { Dashboard } from the screen');

  const exports = namedExports(screenSource);
  assert.ok(
    exports.has('Dashboard'),
    'src/screens/Dashboard.jsx must export Dashboard — otherwise <Dashboard /> is undefined',
  );
});

test('the dashboard screen keeps its default export too', () => {
  assert.match(screenSource, /export\s+default\s+(?:async\s+)?function\s+Ringkasan/);
});
