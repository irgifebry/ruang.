/**
 * Source-level smoke test for the `/settings/profile` route and its panels.
 *
 * Node cannot import a `.jsx` module that pulls in `react-native` and
 * `expo-router`, so this checks the source text. It exists because `expo export`
 * bundles an undefined named import without complaining: Tasks 9 and 11 both
 * shipped a screen whose route rendered nothing. This route is at the app root
 * (outside the `(app)` tab group), so the relative path is pinned too.
 *
 * Run with: npm test (or: node --test tests/profile-exports.test.mjs).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFileSync(join(mobileRoot, relative), 'utf8');
const routeSource = read('app/settings/profile.jsx');
const screenSource = read('src/screens/Profile.jsx');
const passwordSource = read('src/components/PasswordPanel.jsx');
const deleteSource = read('src/components/DeleteAccountPanel.jsx');

/** Every name a file pulls out of a given module. */
function namedImports(source, moduleName) {
  const names = [];
  const pattern = new RegExp(
    `import\\s*\\{([^}]*)\\}\\s*from\\s*['"][^'"]*${moduleName}['"]`,
    'g',
  );
  for (const match of source.matchAll(pattern)) {
    for (const part of match[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0].trim();
      if (name) names.push(name);
    }
  }
  return names;
}

/** Names a module makes available to importers. */
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

test('the /settings/profile route imports { Profile } from the screen', () => {
  assert.deepEqual(namedImports(routeSource, 'Profile.jsx'), ['Profile']);
  assert.ok(namedExports(screenSource).has('Profile'), 'Profile.jsx must export Profile');
});

test('the route is at the app root and points two levels up to the screen', () => {
  assert.match(routeSource, /from\s+['"]\.\.\/\.\.\/src\/screens\/Profile\.jsx['"]/);
  assert.match(routeSource, /from\s+['"]\.\.\/\.\.\/src\/components\/AppShell\.jsx['"]/);
});

test('the screen keeps its default and ProfileScreen exports too', () => {
  assert.match(
    screenSource,
    /export\s+default\s+(?:(?:async\s+)?function\s+Profile|Profile\s*;)/,
    'the default export must resolve to the same Profile component',
  );
  assert.ok(namedExports(screenSource).has('ProfileScreen'));
});

test('the screen reads the ledger with the shared fetchLedger request', () => {
  // The third argument is the demo guard: passing `demoData` bare would pin a
  // signed-in user to the sample ledger, because the provider always has data.
  assert.match(
    screenSource,
    /useLedgerData\(\s*client,\s*FETCH_LEDGER_REQUEST,\s*isDemo \? demoData : null,?\s*\)/,
  );
  assert.match(
    screenSource,
    /import\s*\{[^}]*\bFETCH_LEDGER_REQUEST\b[^}]*\}\s*from\s*['"][^'"]*hooks\/useLedgerData\.js['"]/,
  );
});

test('the screen imports both panels by the names they export', () => {
  for (const moduleName of ['PasswordPanel.jsx', 'DeleteAccountPanel.jsx']) {
    const names = namedImports(screenSource, moduleName);
    assert.deepEqual(names, [moduleName.replace('.jsx', '')]);
    assert.ok(namedExports(moduleName.startsWith('Password') ? passwordSource : deleteSource).has(names[0]));
  }
});

test('panel headings keep the web two-size split: 17 collapsed, 20 in the sheet', () => {
  for (const source of [passwordSource, deleteSource]) {
    // Web: collapsed `text-[17px] tracking-tight`, expanded form
    // `text-[20px] tracking-[-0.03em]`. The two states must not share a style.
    assert.match(source, /h2: \{[\s\S]*?fontSize: 17,[\s\S]*?letterSpacing: -0\.025,/);
    assert.match(source, /sheetTitle: \{[\s\S]*?fontSize: 20,[\s\S]*?letterSpacing: -0\.03,/);
    assert.match(source, /<Text style=\{s\.h2\}>/);
    assert.match(source, /<Text style=\{s\.sheetTitle\}>/);
  }
});
