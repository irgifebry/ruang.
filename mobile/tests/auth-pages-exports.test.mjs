/**
 * Source-level binding smoke test for every route/screen pair added by Task 14.
 *
 * Node cannot import a `.jsx` module that pulls in `react-native` and
 * `expo-router`, so this parses source text. It exists because `expo export`
 * bundles an undefined named import without complaining — Tasks 9 and 11
 * shipped screens whose routes rendered nothing. Six pairs are checked by
 * name, and *every* relative named import in the new routes and screens is
 * resolved against its target's exports, so an accidental mismatch anywhere
 * in this batch fails `npm test` instead of a device run.
 *
 * Run with: npm test (or: node --test tests/auth-pages-exports.test.mjs).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  initialBudgets as webBudgets,
  initialExpenses as webExpenses,
  initialIncomes as webIncomes,
} from '../../src/lib/data.js';
import { FAVICON_GLYPH as WEB_FAVICON_GLYPH } from '../../src/lib/theme-presets.js';
import {
  initialBudgets,
  initialExpenses,
  initialIncomes,
} from '../src/shared/sample-data.js';
import { FAVICON_GLYPH } from '../src/theme/favicon.js';

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFileSync(join(mobileRoot, relative), 'utf8');

/** route → screen → the name the route must import from it. */
const PAIRS = [
  ['app/login.jsx', 'src/screens/AuthScreen.jsx', 'AuthScreen'],
  ['app/register.jsx', 'src/screens/AuthScreen.jsx', 'AuthScreen'],
  ['app/reset-password.jsx', 'src/screens/ResetPassword.jsx', 'ResetPassword'],
  ['app/help.jsx', 'src/screens/StaticInfo.jsx', 'StaticInfo'],
  ['app/about.jsx', 'src/screens/StaticInfo.jsx', 'StaticInfo'],
  ['app/oauth-consent.jsx', 'src/screens/OAuthConsent.jsx', 'OAuthConsent'],
  ['app/onboarding.jsx', 'src/screens/Onboarding.jsx', 'Onboarding'],
];

const NEW_FILES = [
  ...PAIRS.map(([route]) => route),
  'app/_layout.jsx',
  'app/oauth-return.jsx',
  'src/screens/AuthScreen.jsx',
  'src/screens/ResetPassword.jsx',
  'src/screens/StaticInfo.jsx',
  'src/screens/OAuthConsent.jsx',
  'src/shared/auth-flow.js',
  'src/shared/captcha.js',
  'src/state/onboarding.js',
  'src/state/DemoProvider.jsx',
  'src/shared/demo-data.js',
];

// Files touched by the round-1 fixes that also need the bare-call check.
const SCAN_FILES = [
  ...NEW_FILES,
  'src/components/TurnstileWidget.jsx',
  'src/state/SessionProvider.jsx',
  'src/api/auth.js',
  'src/components/AppShell.jsx',
  'app/_layout.jsx',
  'src/state/DemoProvider.jsx',
  'src/shared/demo-data.js',
];

/** Every `{ … }` import from a relative module, with its resolved file. */
function relativeNamedImports(source, fromFile) {
  const found = [];
  const pattern = /import\s*\{([^}]*)\}\s*from\s*['"](\.[^'"]+)['"]/g;
  for (const match of source.matchAll(pattern)) {
    for (const part of match[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0].trim();
      if (!name) continue;
      found.push({ name, target: resolve(dirname(join(mobileRoot, fromFile)), match[2]) });
    }
  }
  return found;
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

function resolveTarget(target) {
  for (const suffix of ['', '.js', '.jsx', '.mjs']) {
    try {
      return readFileSync(target + suffix, 'utf8');
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

/**
 * Removes comments and blanks string contents while keeping the quotes, so
 * `//` inside `ruang://reset-password` is not read as a comment and a sentence
 * like `'Identitas dasar akunmu (email...)'` is not read as a function call.
 */
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

/** Every name brought in by an import, including default and namespace forms. */
function importedNames(source) {
  const names = new Set();
  for (const match of source.matchAll(/import\s+([\w$]+)\s+from\s+['"][^'"]+['"]/g)) {
    names.add(match[1]);
  }
  for (const match of source.matchAll(/import\s*\*\s+as\s+([\w$]+)\s+from/g)) {
    names.add(match[1]);
  }
  for (const match of source.matchAll(/import\s*\{([\s\S]*?)\}\s*from\s+['"][^'"]+['"]/g)) {
    for (const part of match[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (name) names.add(name);
    }
  }
  // `import React, { useState } from 'react'` — default plus named in one line.
  for (const match of source.matchAll(/import\s+[\w$]+\s*,\s*\{([\s\S]*?)\}\s*from/g)) {
    for (const part of match[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (name) names.add(name);
    }
  }
  return names;
}

/** Names a file declares itself: bindings, functions, classes and parameters. */
function declaredNames(source) {
  const names = new Set();
  for (const match of source.matchAll(/\b(?:const|let|var)\s+([\w$]+)\s*=/g)) names.add(match[1]);
  for (const match of source.matchAll(/\b(?:const|let|var)\s*\{([^}]*)\}\s*=/g)) {
    for (const part of match[1].split(',')) {
      const name = part.trim().split(/[:=]/)[0].trim();
      if (name) names.add(name);
    }
  }
  for (const match of source.matchAll(/\b(?:const|let|var)\s*\[([^\]]*)\]\s*=/g)) {
    for (const part of match[1].split(',')) {
      const name = part.trim().replace(/^\.\.\./, '').split(/[:=]/)[0].trim();
      if (name) names.add(name);
    }
  }
  for (const match of source.matchAll(/\bfunction\s+([\w$]+)\s*\(/g)) names.add(match[1]);
  for (const match of source.matchAll(/\bclass\s+([\w$]+)/g)) names.add(match[1]);
  // Shorthand object/class methods, e.g. the ref's `reset() { … }`.
  for (const match of source.matchAll(/\b([\w$]+)\s*\([^)]*\)\s*\{/g)) names.add(match[1]);

  const collectParams = (params) => {
    for (const part of params.split(',')) {
      const name = part
        .trim()
        .replace(/^\.\.\./, '')
        .split(/[:=]/)[0]
        .trim()
        .replace(/^[{\[]/, '')
        .replace(/[}\]]$/, '')
        .trim();
      if (/^[\w$]+$/.test(name)) names.add(name);
    }
  };
  for (const match of source.matchAll(/\bfunction\s+[\w$]*\s*\(([^)]*)\)/g)) {
    collectParams(match[1]);
  }
  for (const match of source.matchAll(/\(([^)]*)\)\s*=>/g)) collectParams(match[1]);
  return names;
}

// Built-ins and language words that are legitimately called without an import.
const BUILTINS = new Set([
  'Array', 'BigInt', 'Boolean', 'Date', 'Error', 'FormData', 'Headers', 'Intl',
  'JSON', 'Map', 'Math', 'Number', 'Object', 'Promise', 'Proxy', 'Reflect',
  'RegExp', 'Request', 'Response', 'Set', 'String', 'Symbol', 'TypeError',
  'URL', 'URLSearchParams', 'WeakMap', 'WeakSet', 'AbortController',
  'clearInterval', 'clearTimeout', 'console', 'decodeURI', 'decodeURIComponent',
  'encodeURI', 'encodeURIComponent', 'fetch', 'globalThis', 'isFinite', 'isNaN',
  'module', 'parseFloat', 'parseInt', 'process', 'queueMicrotask', 'require',
  'setInterval', 'setTimeout', 'structuredClone', 'window', 'document',
  'if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'typeof',
  'new', 'await', 'yield', 'delete', 'void', 'instanceof', 'in', 'of', 'do',
  'else', 'try', 'finally', 'throw', 'case', 'async', 'super', 'this',
]);

/** Bare function calls — `foo(...)`, never `obj.foo(...)`. */
function calledIdentifiers(source) {
  const found = new Set();
  for (const match of source.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)\s*\(/g)) {
    found.add(match[1]);
  }
  return found;
}

test('all route/screen pairs import the named export their screen provides', () => {
  for (const [routePath, screenPath, expected] of PAIRS) {
    const routeSource = read(routePath);
    const imports = relativeNamedImports(routeSource, routePath)
      .filter((item) => item.target === resolve(join(mobileRoot, screenPath)))
      .map((item) => item.name);
    assert.deepEqual(
      imports,
      [expected],
      `${routePath} must import exactly { ${expected} } from ${screenPath}`,
    );

    const exports = namedExports(read(screenPath));
    assert.ok(
      exports.has(expected),
      `${screenPath} must export ${expected} — otherwise <${expected} /> is undefined`,
    );
  }
});

test('every relative named import in the new files resolves to a real export', () => {
  for (const file of NEW_FILES) {
    const source = read(file);
    for (const { name, target } of relativeNamedImports(source, file)) {
      const targetSource = resolveTarget(target);
      assert.ok(targetSource, `${file} imports ${name} from a missing module: ${target}`);
      assert.ok(
        namedExports(targetSource).has(name),
        `${file} imports { ${name} } but its module does not export it`,
      );
    }
  }
});

test('every bare call in the new files is imported or declared', () => {
  // The named-import test above cannot see a call to a name that was never
  // imported at all — that is how signInWithGoogle() shipped as a bare
  // ReferenceError. Check the call sites too, ignoring property calls and
  // comments (which may legitimately mention functions the file does not use).
  for (const file of SCAN_FILES) {
    const code = stripComments(read(file));
    const known = new Set([...importedNames(code), ...declaredNames(code)]);
    for (const name of calledIdentifiers(code)) {
      assert.ok(
        known.has(name) || BUILTINS.has(name),
        `${file} calls ${name}() without importing or declaring it`,
      );
    }
  }
});

test('each new screen keeps a default export alongside its named aliases', () => {
  for (const screen of new Set(PAIRS.map(([, screen]) => screen))) {
    assert.match(
      read(screen),
      /export\s+default\s+(?:async\s+)?function\s+\w+/,
      `${screen} should keep a default export for other import styles`,
    );
  }
});

test('no screen or route pulls in a WebView — only TurnstileWidget does', () => {
  for (const file of NEW_FILES) {
    assert.doesNotMatch(
      read(file),
      /from\s+['"]react-native-webview['"]/,
      `${file} must not render a WebView`,
    );
  }
  assert.match(read('src/components/TurnstileWidget.jsx'), /from ['"]react-native-webview['"]/);
});

test('the boot splash keeps the default export its layout imports', () => {
  assert.match(
    read('src/components/Splash.jsx'),
    /export\s+default\s+function\s+Splash/,
    'app/_layout.jsx imports Splash as a default; expo export bundles undefined silently',
  );
});

test('app.json registers the ruang scheme and the three deep-link screens', () => {
  const config = JSON.parse(read('app.json')).expo;
  assert.equal(config.scheme, 'ruang');
  assert.ok(config.linking.prefixes.includes('ruang://'));
  const screens = config.linking.config.screens;
  for (const route of ['reset-password', 'oauth-return', 'oauth-consent']) {
    assert.ok(screens[route], `linking must register ${route}`);
    assert.ok(
      route === 'oauth-return' || screens[route] === route,
      `${route} must map to the matching route file`,
    );
  }
});

test('every registered deep-link path exists as a route file', () => {
  for (const route of ['reset-password', 'oauth-return', 'oauth-consent']) {
    assert.doesNotThrow(() => read(`app/${route}.jsx`), `app/${route}.jsx must exist`);
  }
});

test('idle logout emits the idle=1 notice the login screen renders', () => {
  assert.match(read('src/state/IdleLogout.jsx'), /router\.replace\('\/login\?idle=1'\)/);
  assert.match(read('src/screens/AuthScreen.jsx'), /authNotices\(/);
});

test('Metro-safe copies of the web sample data and brand glyph cannot drift', () => {
  // Metro refuses modules outside mobile/, so these copies live locally and
  // are pinned here so they cannot drift from the web source.
  assert.deepEqual(initialIncomes, webIncomes);
  assert.deepEqual(initialBudgets, webBudgets);
  assert.deepEqual(initialExpenses, webExpenses);
  assert.equal(FAVICON_GLYPH, WEB_FAVICON_GLYPH);
});

// ---------------------------------------------------------------------------
// Round-1 review regressions — runtime defects expo export could not catch.
// ---------------------------------------------------------------------------

test('the Google button calls an imported signInWithGoogle', () => {
  const screen = read('src/screens/AuthScreen.jsx');
  assert.match(
    screen,
    /import\s*\{[^}]*\bsignInWithGoogle\b[^}]*\}\s*from\s*['"][^'"]*auth\/google\.js['"]/,
    'the native Google SDK call must be in scope on the screen',
  );
  assert.match(screen, /await\s+signInWithGoogle\(\)/);
});

test('FAQ rows are Pressable, not a View with an ignored onPress', () => {
  const source = read('src/screens/StaticInfo.jsx');
  const start = source.indexOf('function FaqRow');
  const end = source.indexOf('export default function StaticInfo');
  const row = source.slice(start, end);
  assert.match(row, /<Pressable[\s\S]*?<\/Pressable>/);
  assert.match(row, /accessibilityState=\{\{ expanded: open \}\}/);
  assert.doesNotMatch(row, /<View[^>]*onPress=/);
});

test('reset-password sends the { token, newPassword } field Better Auth expects', () => {
  const api = read('src/api/auth.js');
  assert.match(api, /export async function resetPassword\(client, \{ token, newPassword \}\)/);
  assert.match(api, /body:\s*\{ token, newPassword \}/);
  assert.match(
    read('src/screens/ResetPassword.jsx'),
    /resetPassword\(session\.client, \{ token, newPassword: password \}\)/,
  );
  assert.match(read('tests/auth-api.test.mjs'), /newPassword: 'pw'/);
});

test('the reset-password mode follows a deep link delivered while mounted', () => {
  assert.match(
    read('src/screens/ResetPassword.jsx'),
    /useEffect\(\(\) => \{[\s\S]*?setMode\(token \? 'update' : 'request'\)[\s\S]*?\}, \[token\]\);/,
  );
});

test('register rejects a short password before sending any request', () => {
  assert.match(
    read('src/screens/AuthScreen.jsx'),
    /if \(!isLogin && password\.length < 8\) \{\s*setFormError\('Kata sandi minimal 8 karakter\.'\);\s*return;\s*\}/,
  );
});

test('the native app carries no captcha widget or token plumbing', () => {
  const screen = read('src/screens/AuthScreen.jsx');
  assert.doesNotMatch(screen, /TurnstileWidget|TURNSTILE_SITE_KEY|captchaRef|resetCaptcha|captchaReady/);
  // Sign-up still seeds the provider from its own response — no second sign-in.
  assert.match(screen, /session\.adoptSession\(result\)/);
  assert.equal((screen.match(/await session\.signIn\(/g) ?? []).length, 1);

  const provider = read('src/state/SessionProvider.jsx');
  assert.match(provider, /async adoptSession\(result = \{\}\)/);
  assert.match(provider, /if \(result\.token\) await client\.setToken\(result\.token\)/);
  assert.doesNotMatch(provider, /getCaptchaToken/);

  const layout = read('app/_layout.jsx');
  assert.doesNotMatch(layout, /captcha\.js|getCaptchaToken/);

  const client = read('src/api/client.js');
  assert.match(client, /'x-ruang-app': '1'/);
});

test('the five demo screens bind useDemo and DemoBanner to real exports', () => {
  // `expo export` bundles an undefined named/default import without warning;
  // the new demo wiring must not reintroduce that class of blank screen.
  for (const screen of ['Dashboard', 'Transactions', 'History', 'Settings', 'Profile']) {
    const file = `src/screens/${screen}.jsx`;
    const source = read(file);
    const named = relativeNamedImports(source, file).filter(({ name }) => name === 'useDemo');
    assert.equal(named.length, 1, `${file} must import { useDemo } once`);
    assert.ok(
      namedExports(resolveTarget(named[0].target)).has('useDemo'),
      `${file}: DemoProvider must export useDemo`,
    );
    assert.match(
      source,
      /import DemoBanner from ['"][^'"]*components\/DemoBanner\.jsx['"]/,
      `${file} must import the banner default`,
    );
    assert.match(
      read('src/components/DemoBanner.jsx'),
      /export default DemoBanner/,
      'DemoBanner.jsx must keep its default export',
    );
  }
});

test('the notice uses the web warn/10 surface and warn/40 border, not a solid fill', () => {
  const screen = read('src/screens/AuthScreen.jsx');
  assert.match(screen, /borderColor: withAlpha\(t\.warn, 0\.4\)/);
  assert.match(screen, /backgroundColor: withAlpha\(t\.warn, 0\.1\)/);
  assert.match(screen, /borderRadius: t\.radius\.md/);
  assert.match(screen, /color: t\.warnText/);
  assert.doesNotMatch(screen, /backgroundColor: t\.warn,/);
});
