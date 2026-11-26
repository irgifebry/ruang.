/**
 * Source-level smoke test for the boot splash and the removal of /welcome.
 *
 * Node cannot import a `.jsx` module that pulls in `react-native` and
 * `expo-router`, so this parses source text — the same constraint the
 * route/screen binding test works under. The important behaviour is structural:
 * the splash must wait for BOTH the session and its minimum on-screen time,
 * must never navigate, and no `/welcome` link may survive in the app.
 *
 * Run with: node --test tests/splash.test.mjs (or: npm test).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pathOf = (rel) => join(mobileRoot, rel);
const read = (rel) => readFileSync(pathOf(rel), 'utf8');
const exists = (rel) => existsSync(pathOf(rel));

/** Every file under a directory, recursively, as a path relative to mobile/. */
function walk(rel) {
  const found = [];
  for (const entry of readdirSync(pathOf(rel), { withFileTypes: true })) {
    const child = join(rel, entry.name);
    if (entry.isDirectory()) found.push(...walk(child));
    else if (entry.isFile()) found.push(child);
  }
  return found;
}

test('SPLASH_MIN_MS is 1200', () => {
  assert.match(read('src/components/Splash.jsx'), /export\s+const\s+SPLASH_MIN_MS\s*=\s*1200\s*;/);
});

test('the splash waits for the session and never navigates itself', () => {
  const source = read('src/components/Splash.jsx');
  assert.match(source, /status\s*!==\s*['"]loading['"]/);
  assert.doesNotMatch(source, /router\s*\.\s*(?:replace|push)\s*\(/);
  assert.match(source, /onReady\s*\?\.\s*\(\)/, 'the splash must signal readiness via onReady');
});

test('the splash uses the AND gate exactly — an accidental || would open too early', () => {
  const source = read('src/components/Splash.jsx');
  assert.match(source, /status\s*!==\s*['"]loading['"]\s*&&\s*minElapsed/);
  assert.doesNotMatch(source, /status\s*!==\s*['"]loading['"]\s*\|\|/);
});

test('a hung bootstrap cannot hold the splash forever', () => {
  const source = read('src/components/Splash.jsx');
  assert.match(source, /export\s+const\s+SPLASH_MAX_WAIT_MS\s*=\s*8000\s*;/);
  assert.match(source, /setTimeout\(\(\) => \{[\s\S]*?\}, SPLASH_MAX_WAIT_MS\)/);
  assert.match(source, /clearTimeout\(maxTimer\)/);
  // The fallback must still go through onReady — AppShell owns navigation.
  assert.doesNotMatch(source, /router\s*\.\s*(?:replace|push)\s*\(/);
});

test('the splash mark uses a radius token, not a literal', () => {
  const source = read('src/components/Splash.jsx');
  assert.match(source, /borderRadius:\s*t\.radius\.(?:lg|xl)/);
  assert.doesNotMatch(source, /borderRadius:\s*14\s*,/);
});

test('the splash animates once on mount and never loops', () => {
  const source = read('src/components/Splash.jsx');
  assert.match(source, /Animated\.timing\s*\(/);
  assert.doesNotMatch(source, /Animated\.loop\s*\(/);
});

test('the root layout mounts Splash inside both providers', () => {
  const layout = read('app/_layout.jsx');
  assert.match(layout, /import\s+Splash\s+from\s+['"][^'"]*src\/components\/Splash\.jsx['"]/);
  const themeAt = layout.indexOf('<ThemeProvider>');
  const sessionAt = layout.indexOf('<SessionProvider');
  const splashAt = layout.indexOf('<Splash');
  assert.ok(themeAt >= 0, 'ThemeProvider must wrap the tree');
  assert.ok(sessionAt > themeAt, 'SessionProvider must be inside ThemeProvider');
  assert.ok(splashAt > sessionAt, 'Splash must be inside both providers');
  assert.match(layout, /onReady=\{\(\)\s*=>\s*setSplashDone\(true\)\}/);
});

test('the Welcome route, FAQ route and screen no longer exist', () => {
  for (const file of ['app/welcome.jsx', 'app/welcome-help.jsx', 'src/screens/Welcome.jsx']) {
    assert.equal(exists(file), false, `${file} must be deleted`);
  }
});

test('no /welcome link survives in app or src', () => {
  for (const dir of ['app', 'src']) {
    for (const file of walk(dir)) {
      assert.doesNotMatch(read(file), /\/welcome\b/, `${file} must not reference /welcome`);
    }
  }
});
