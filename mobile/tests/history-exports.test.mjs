/**
 * Smoke test for the `/history` route → screen binding.
 *
 * Node cannot import a `.jsx` file that pulls in `react-native` and
 * `expo-router`, so this is a source-level check rather than a render test.
 * It exists because `expo export` bundles an undefined named import without
 * complaining: the tab then renders nothing (or crashes) instead of the screen.
 *
 * Run with: npm test (or: node --test tests/history-exports.test.mjs).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const routeSource = readFileSync(join(mobileRoot, 'app/(app)/history.jsx'), 'utf8');
const screenSource = readFileSync(join(mobileRoot, 'src/screens/History.jsx'), 'utf8');
const adapterSource = readFileSync(join(mobileRoot, 'src/shared/history.js'), 'utf8');

/** Every name the route pulls out of the History module. */
function namedImports(source) {
  const names = [];
  const pattern = /import\s*\{([^}]*)\}\s*from\s*['"][^'"]*History\.jsx['"]/g;
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

test('History.jsx has the named History export the /history route imports', () => {
  const imports = namedImports(routeSource);
  assert.deepEqual(imports, ['History'], 'the route should import { History } from the screen');

  const exports = namedExports(screenSource);
  assert.ok(
    exports.has('History'),
    'src/screens/History.jsx must export History — otherwise <History /> is undefined',
  );
});

test('the history screen keeps its default and HistoryScreen exports too', () => {
  assert.match(screenSource, /export\s+default\s+(?:async\s+)?function\s+History/);
  const exports = namedExports(screenSource);
  assert.ok(exports.has('HistoryScreen'), 'the older HistoryScreen name stays available');
});

test('month rows print the web copy without the count the web never renders', () => {
  // Web `buildHistoryRows` rows have no `count`, so its `{row.count} transaksi`
  // renders only the word. The native adapter still computes `count` for its
  // own data shape; the screen must not surface that extra number.
  assert.match(adapterSource, /count: toPositive\(bucketByKey\.get\(row\.key\)\?\.count\)/);
  assert.doesNotMatch(screenSource, /\{row\.count\}/);
  assert.match(screenSource, /<Text style=\{s\.txCount\}>transaksi<\/Text>/);
});
