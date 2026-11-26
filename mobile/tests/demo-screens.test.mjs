/**
 * Task 3 gate: the five ledger screens must read demo data ONLY while the demo
 * flag is on, show the read-only banner, and lock every write control.
 *
 * The controller ruling that this file exists to pin: `DemoProvider.data`
 * always exists, so handing it to `useLedgerData` unconditionally makes every
 * signed-in user permanently see the sample ledger. Every screen must pass
 * `isDemo ? demoData : null` — never the bare dataset.
 *
 * These modules import `react-native` / `expo-router`, so Node cannot load
 * them; the wiring is checked at source level, as in the other screen gates.
 *
 * Run with: node --test tests/demo-screens.test.mjs (or: npm test).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(mobileRoot, path), 'utf8');

const SCREENS = ['Dashboard', 'Transactions', 'History', 'Settings', 'Profile'];
const WRITE_SCREENS = ['Transactions', 'History', 'Settings', 'Profile'];
const BANNER = 'Mode demo — perubahan tidak disimpan';

/** Strip comments without touching quotes, so `//` in a string is not a comment. */
function stripComments(source) {
  let out = '';
  let quote = null;
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (quote) {
      if (ch === '\\') {
        out += next === '\n' ? '\n' : ' ';
        i += 2;
        continue;
      }
      if (ch === quote) {
        out += ch;
        quote = null;
      } else {
        out += ch === '\n' ? '\n' : ' ';
      }
      i += 1;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        if (source[i] === '\n') out += '\n';
        i += 1;
      }
      i += 2;
      continue;
    }
    if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i += 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** Split a call's arguments on top-level commas (objects and ternaries stay intact). */
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
  const last = text.slice(start).trim();
  // A trailing comma (the project's style) must not read as a fourth argument.
  if (last) args.push(last);
  return args;
}

/** Every balanced `useLedgerData(...)` call in a file, as argument arrays. */
function ledgerCalls(code) {
  const calls = [];
  for (const match of code.matchAll(/useLedgerData\s*\(/g)) {
    if (/function\s*$/.test(code.slice(Math.max(0, match.index - 40), match.index))) continue;
    const open = match.index + match[0].length - 1;
    let depth = 0;
    for (let i = open; i < code.length; i += 1) {
      if (code[i] === '(') depth += 1;
      else if (code[i] === ')') {
        depth -= 1;
        if (depth === 0) {
          calls.push(callArguments(code.slice(open + 1, i)));
          break;
        }
      }
    }
  }
  return calls;
}

/** A guard must sit at the top of the named handler, not just somewhere in the file. */
function guarded(source, handler, pattern = /if \(isDemo\) return;/, label = handler) {
  const at = source.indexOf(handler);
  assert.ok(at >= 0, `${handler} must exist`);
  assert.match(source.slice(at, at + 300), pattern, `${label} must refuse the write while demo is on`);
}

test('all five screens inject demo data only through the isDemo conditional', () => {
  for (const screen of SCREENS) {
    // The import path lives in a string, which stripComments blanks — check it
    // against the raw source and use the stripped copy only for call parsing.
    const raw = read(`src/screens/${screen}.jsx`);
    const code = stripComments(raw);
    assert.match(
      raw,
      /import\s*\{[^}]*\buseDemo\b[^}]*\}\s*from\s*['"][^'"]*state\/DemoProvider\.jsx['"]/,
      `${screen}.jsx must import useDemo`,
    );
    assert.match(
      code,
      /const \{ isDemo, data: demoData \} = useDemo\(\);/,
      `${screen}.jsx must read the flag and the dataset from useDemo`,
    );

    const calls = ledgerCalls(code);
    assert.equal(calls.length, 1, `${screen}.jsx must call useLedgerData exactly once`);
    assert.equal(calls[0].length, 3, `${screen}.jsx must pass a third demo argument`);
    assert.equal(
      calls[0][2].replace(/\s+/g, ' '),
      'isDemo ? demoData : null',
      `${screen}.jsx must pass isDemo ? demoData : null — a bare demoData makes signed-in users read sample data`,
    );
  }
});

test('all five screens show the demo banner', () => {
  for (const screen of SCREENS) {
    const source = read(`src/screens/${screen}.jsx`);
    assert.ok(source.includes(BANNER), `${screen}.jsx must render "${BANNER}"`);
    assert.match(source, /<DemoBanner>/, `${screen}.jsx must render the shared banner`);
  }
});

test('Transactions guards every write path and disables its controls', () => {
  const source = stripComments(read('src/screens/Transactions.jsx'));
  for (const handler of ['openForm', 'handleEdit', 'handleDelete', 'handleCategoryDelete']) {
    guarded(source, `const ${handler} =`);
  }
  const controls = source.slice(source.indexOf('return ('), source.indexOf('function Stat('));
  assert.match(controls, /disabled=\{isDemo\}/, 'save/delete/edit controls must be disabled in demo');
});

test('Dashboard dims and disables every write CTA in demo', () => {
  const source = stripComments(read('src/screens/Dashboard.jsx'));
  assert.match(source, /\[s\.headerTag, isDemo && s\.disabled\]/, 'the header CTA');
  assert.match(source, /\[s\.inlineLink, isDemo && s\.disabled\]/, 'the inline links');
  assert.match(source, /\[s\.link, isDemo && s\.disabled\]/, 'the budget card link');
  assert.equal(
    (source.match(/disabled=\{isDemo\}/g) ?? []).length,
    6,
    'header, two donut links, balance link, budget link and category link',
  );
  assert.equal((source.match(/accessibilityState=\{\{ disabled: isDemo \}\}/g) ?? []).length, 6);
  assert.match(source, /disabled: \{ opacity: 0\.4 \}/);
});

test('Transactions disables its empty-state write links too', () => {
  const source = stripComments(read('src/screens/Transactions.jsx'));
  assert.equal(
    (source.match(/\[s\.inlineLink, isDemo && s\.disabled\]/g) ?? []).length,
    2,
    'both "Catat pemasukan"/"Catat pengeluaran" links must dim',
  );
  assert.ok(
    (source.match(/disabled=\{isDemo\}/g) ?? []).length >= 4,
    'the two inline links join the header and category controls',
  );
  assert.match(source, /accessibilityState=\{\{ disabled: isDemo \}\}/);
});

test('write primitives refuse demo even when a UI guard is bypassed', () => {
  const transactions = stripComments(read('src/screens/Transactions.jsx'));
  const settings = stripComments(read('src/screens/Settings.jsx'));
  const profile = stripComments(read('src/screens/Profile.jsx'));
  for (const [name, source] of [
    ['Transactions', transactions],
    ['Settings', settings],
  ]) {
    guarded(source, 'const write =', /if \(isDemo\) return null;/, name);
  }
  guarded(profile, 'function handleDeletionCanceled()');
  guarded(profile, 'async function handleSessionsRevoked()');
});

test('AppShell cancels a pending guest redirect and re-checks demo', () => {
  const shell = stripComments(read('src/components/AppShell.jsx'));
  assert.match(shell, /let active = true;/);
  assert.match(shell, /if \(!active \|\| isDemo\) return;/);
  assert.match(shell, /return \(\) => \{\s*active = false;\s*\};/);
  const start = shell.indexOf('useEffect(() => {');
  const end = shell.indexOf('}, [session.status, router, isDemo]);', start);
  assert.ok(start >= 0 && end > start, 'the guest guard effect must exist');
  const effect = shell.slice(start, end);
  assert.ok(
    effect.indexOf('await hasSeenOnboarding') < effect.indexOf('if (!active || isDemo)') &&
      effect.indexOf('if (!active || isDemo)') < effect.indexOf('router.replace('),
    'the demo re-check must follow the flag read and precede navigation',
  );
});

test('PasswordPanel copy does not claim an account the guest does not have', () => {
  const source = read('src/components/PasswordPanel.jsx');
  assert.match(source, /disabled\s*\n\s*\? 'Mode demo — kata sandi/);
  assert.match(source, /'Kata sandi \(demo\)'/);
  assert.match(source, /Mode demo — perubahan kata sandi tidak disimpan/);
});

test('History makes its inline write link inert in demo', () => {
  const source = stripComments(read('src/screens/History.jsx'));
  guarded(source, 'const openTransactions =');
  assert.match(source, /disabled=\{isDemo\}/);
});

test('History adapts the guest ledger to the breakdown envelope', () => {
  // Its demo data is a full-ledger payload, but buildHistoryData reads buckets.
  // Without this adaptation the guest lands on an empty Riwayat screen.
  const source = read('src/screens/History.jsx');
  assert.match(source, /import \{ buildDemoHistoryPayload \} from ['"][^'"]*shared\/demo-data\.js['"]/);
  assert.match(source, /isDemo \? buildDemoHistoryPayload\(demoData\) : null/);
  assert.match(source, /buildHistoryData\(demoHistory \?\? data\)/);
});

test('Settings guards save, edit and archive in demo', () => {
  const source = stripComments(read('src/screens/Settings.jsx'));
  for (const handler of ['handleSubmit', 'startEdit', 'handleDelete']) {
    guarded(source, `const ${handler} =`);
  }
  assert.match(source, /disabled=\{isDemo\}/, 'the category form and row actions must be disabled');
  assert.match(source, /editable=\{!isDemo\}/, 'the category fields must be read-only in demo');
});

test('Profile guards identity, avatar, theme, password and deletion in demo', () => {
  const source = stripComments(read('src/screens/Profile.jsx'));
  for (const handler of [
    'handleSaveProfile',
    'handleAvatarChange',
    'handleRemoveAvatar',
    'persistAppearance',
  ]) {
    guarded(source, `async function ${handler}(`);
  }
  assert.match(source, /editable=\{!isDemo\}/, 'the name field must be read-only in demo');
  // The sample profile carries a theme, but a guest must not persist it onto
  // the device — the theme picker is disabled for exactly that reason.
  assert.match(source, /if \(isDemo\) return;\s*\n\s*const saved = profile\.theme;/);
  assert.match(source, /<PasswordPanel[^>]*disabled=\{isDemo\}/);
  assert.match(source, /<DeleteAccountPanel[^>]*disabled=\{isDemo\}/);
});

test('the demo lock reaches the panels and the theme options', () => {
  const password = stripComments(read('src/components/PasswordPanel.jsx'));
  const deletion = stripComments(read('src/components/DeleteAccountPanel.jsx'));
  for (const [name, source] of [
    ['PasswordPanel', password],
    ['DeleteAccountPanel', deletion],
  ]) {
    assert.match(source, /disabled = false/, `${name} must accept the demo lock`);
    assert.match(source, /if \(disabled\) return;/, `${name} must refuse writes while disabled`);
    assert.match(source, /disabled=\{disabled\}/, `${name} must disable its trigger`);
  }
  const profile = read('src/screens/Profile.jsx');
  assert.match(profile, /function ThemeOption\(\{ item, selected, onSelect, disabled \}\)/);
  assert.match(profile, /disabled=\{disabled\}/);
});

test('the shared buttons show their disabled state, not just ignore taps', () => {
  const form = read('src/components/form.jsx');
  assert.match(form, /buttonDisabled: \{ opacity: 0\.4 \}/);
  assert.match(form, /ghostDisabled: \{ opacity: 0\.4 \}/);
  assert.match(form, /\(busy \|\| rest\.disabled\) && s\.buttonDisabled/);
  assert.match(form, /rest\.disabled && s\.ghostDisabled/);
});

test('the banner introduces no new colour literal', () => {
  const banner = read('src/components/DemoBanner.jsx');
  assert.doesNotMatch(banner, /#[0-9a-fA-F]{3,8}\b/, 'every colour must come from tokens');
  assert.match(banner, /tokens\(useTheme\(\)\.resolved\)/);
});
