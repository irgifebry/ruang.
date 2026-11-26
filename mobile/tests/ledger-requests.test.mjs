/**
 * Every `useLedgerData(...)` call site must pass request options with an
 * `action` in the body. `/api/ledger` is a POST that dispatches on that field,
 * so a bare `client.request('/api/ledger', undefined)` gets `400 JSON tidak
 * valid.` — three primary tabs shipped with that bug and the export/render
 * tests could not see it. This is a source-level check for the same reason:
 * the screens import `react-native` and cannot be loaded under `node --test`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcRoot = join(mobileRoot, 'src');
const read = (path) => readFileSync(join(mobileRoot, path), 'utf8');

function sourceFiles(dir = srcRoot, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, files);
    else if (/\.(js|jsx)$/.test(entry.name)) files.push(full);
  }
  return files;
}

const allSources = sourceFiles().map((path) => ({ path, source: readFileSync(path, 'utf8') }));

/** Doc comments mention `useLedgerData(...)`; those are not call sites. */
function withoutComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** Splits a call's arguments on top-level commas (objects stay intact). */
function callArguments(text) {
  const args = [];
  let level = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '(' || char === '[' || char === '{') level += 1;
    else if (char === ')' || char === ']' || char === '}') level -= 1;
    else if (char === ',' && level === 0) {
      args.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  args.push(text.slice(start).trim());
  return args;
}

/** Reads a balanced `(...)` starting at `open` (the index of the `(`). */
function balancedCall(source, open) {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '(') depth += 1;
    else if (source[i] === ')') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return null;
}

function callsIn(source) {
  const clean = withoutComments(source);
  const calls = [];
  for (const match of clean.matchAll(/useLedgerData\s*\(/g)) {
    // Skip the hook's own declaration, e.g. `function useLedgerData(...)`.
    if (/function\s*$/.test(clean.slice(Math.max(0, match.index - 40), match.index))) continue;
    const args = balancedCall(clean, match.index + match[0].length - 1);
    if (args !== null) calls.push(callArguments(args));
  }
  return calls;
}

/** The object literal behind an options identifier, local or imported. */
function optionsDeclaration(identifier) {
  for (const { source } of allSources) {
    const match = source.match(
      new RegExp(`(?:export\\s+)?const\\s+${identifier}\\s*=\\s*([\\s\\S]*?);`),
    );
    if (match) return match[1];
  }
  return null;
}

test('the hook exports one shared fetchLedger request for the ledger tabs', () => {
  const hook = read('src/hooks/useLedgerData.js');
  assert.match(
    hook,
    /export const FETCH_LEDGER_REQUEST\s*=\s*\{\s*body:\s*\{\s*action:\s*'fetchLedger'\s*\}\s*\}/,
  );
});

test('every useLedgerData call site passes options with a body.action', () => {
  const sites = allSources.flatMap(({ path, source }) =>
    callsIn(source).map((args) => ({ path: path.slice(srcRoot.length + 1), args })),
  );

  // Five screens are known to call the hook: the three ledger tabs, /riwayat
  // and /profil. A vacuous pass would be worse than the bug being pinned.
  assert.ok(sites.length >= 5, `expected at least five call sites, found ${sites.length}`);

  for (const { path, args } of sites) {
    assert.ok(args.length >= 2, `${path}: useLedgerData needs request options as its 2nd argument`);
    const options = args[1];
    const identifier = options.match(/^[A-Za-z_$][\w$]*$/)?.[0];
    const declaration = identifier ? optionsDeclaration(identifier) : options;
    assert.ok(declaration, `${path}: cannot resolve request options ${options}`);
    assert.match(declaration, /body\s*:/, `${path}: request options must carry a body`);
    assert.match(declaration, /action\s*:/, `${path}: the body must carry an action`);
  }
});

test('the three ledger tabs use the shared fetchLedger request', () => {
  for (const screen of ['Dashboard', 'Transactions', 'Settings']) {
    const source = read(`src/screens/${screen}.jsx`);
    assert.match(
      source,
      new RegExp(
        `useLedgerData\\([\\s\\S]*?,\\s*FETCH_LEDGER_REQUEST` +
          `(?:,\\s*isDemo \\? demoData : null)?,?\\s*\\)`,
      ),
      `${screen}.jsx must pass FETCH_LEDGER_REQUEST (with a demo guard as its third argument)`,
    );
  }
  // /riwayat is the one screen that deliberately asks for a different action.
  assert.match(
    read('src/screens/History.jsx'),
    /HISTORY_REQUEST\s*=\s*\{\s*body:\s*\{\s*action:\s*'fetchMonthlyBreakdown'/,
  );
});
