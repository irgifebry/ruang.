/**
 * Task 1 gate: the onboarding flag, the three-slide carousel and the guest
 * redirect that chooses between /onboarding and /login.
 *
 * `onboarding.js` is deliberately Expo-free so its flag helpers can be driven
 * directly here with a fake storage adapter; the components import
 * `react-native` / `expo-router` and are checked at source level instead. The
 * source checks also pin the crash class from Tasks 9/11/14 — a named import
 * or a bare call that `expo export` bundles without complaining about.
 *
 * Run with: node --test tests/onboarding.test.mjs (or: npm test).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ONBOARDING_KEY,
  hasSeenOnboarding,
  setSeenOnboarding,
} from '../src/state/onboarding.js';

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFileSync(join(mobileRoot, relative), 'utf8');

/** An in-memory SecureStore-shaped adapter that records every call. */
function fakeStorage(initialValue) {
  const values = new Map();
  if (initialValue !== undefined) values.set(ONBOARDING_KEY, initialValue);
  const calls = [];
  return {
    calls,
    async getItem(key) {
      calls.push(['getItem', key]);
      return values.has(key) ? values.get(key) : null;
    },
    async setItem(key, value) {
      calls.push(['setItem', key, value]);
      values.set(key, value);
    },
  };
}

/** The literal SLIDES entries, split on the leading `  {` of each entry. */
function slideEntries(source) {
  const start = source.indexOf('const SLIDES = [');
  const end = source.indexOf('\n];', start);
  assert.ok(start >= 0 && end > start, 'Onboarding.jsx must declare a SLIDES array');
  return source
    .slice(start, end + 3)
    .split(/\n  \{\s*$/m)
    .slice(1);
}

test('the flag key is the same across installs', () => {
  assert.equal(ONBOARDING_KEY, 'ruang.onboarding.seen');
});

test('hasSeenOnboarding distinguishes an absent flag from a stored one', async () => {
  assert.equal(await hasSeenOnboarding(fakeStorage(null)), false);
  assert.equal(await hasSeenOnboarding(fakeStorage('1')), true);
  // Anything else is not a completed onboarding — never coerce a stray value.
  assert.equal(await hasSeenOnboarding(fakeStorage('true')), false);
  const storage = fakeStorage(null);
  await hasSeenOnboarding(storage);
  assert.deepEqual(storage.calls, [['getItem', ONBOARDING_KEY]]);
});

test('setSeenOnboarding writes the one sentinel value to the adapter', async () => {
  const storage = fakeStorage(null);
  await setSeenOnboarding(storage);
  assert.deepEqual(storage.calls, [['setItem', ONBOARDING_KEY, '1']]);
  assert.equal(await hasSeenOnboarding(storage), true);
});

test('the carousel has exactly three slides with an animation on the active one', () => {
  const source = read('src/screens/Onboarding.jsx');
  const slides = slideEntries(source);
  assert.equal(slides.length, 3, 'the onboarding must explain three things');
  for (const [index, slide] of slides.entries()) {
    assert.match(slide, /eyebrow:/, `slide ${index + 1} needs an eyebrow`);
    assert.match(slide, /title:/, `slide ${index + 1} needs a title`);
    assert.match(slide, /body:/, `slide ${index + 1} needs copy`);
  }

  assert.match(source, /new Animated\.Value\(/, 'entrance animation needs Animated.Value');
  assert.match(source, /Animated\.timing\s*\(/);
  assert.match(source, /useNativeDriver: true/);
  assert.match(source, /pagingEnabled/, 'the slides must be swipable');
  assert.doesNotMatch(source, /Animated\.loop\s*\(/, 'no perpetual animation');
  assert.doesNotMatch(source, /react-native-reanimated|lottie/i, 'no animation library');
  // 0 / 70 / 140 ms: the title, illustration and keyword arrive in sequence.
  assert.match(source, /rise\(active\.title, 0\)/);
  assert.match(source, /rise\(active\.art, 70\)/);
  assert.match(source, /rise\(active\.keyword, 140\)/);
});

test('the last slide offers Masuk, Daftar and Lihat-lihat dulu', () => {
  const source = read('src/screens/Onboarding.jsx');
  assert.equal(slideEntries(source).length, 3);
  // The CTAs live in the JSX branch for the final slide, not in slide data.
  const start = source.indexOf('position === LAST');
  const cta = source.slice(start, source.indexOf(') : null}', start));
  assert.match(cta, /Masuk/);
  assert.match(cta, /Daftar/);
  assert.match(cta, /Lihat-lihat dulu/);
});

test('the flag is written only when onboarding is completed or skipped', () => {
  const source = read('src/screens/Onboarding.jsx');
  assert.equal((source.match(/setSeenOnboarding\([^)]*\)/g) ?? []).length, 1);
  const markSeen = source.slice(source.indexOf('const markSeen'), source.indexOf('const goTo'));
  assert.match(markSeen, /await setSeenOnboarding\(storage\)/);
  // No write on mount: merely opening the screen must not mark it as seen.
  const mountEffect = source.slice(source.indexOf('useEffect(() =>'), source.indexOf('}, [index])'));
  assert.doesNotMatch(mountEffect, /setSeenOnboarding|markSeen/);
  assert.match(source, /await markSeen\(\);/);
});

test('Lihat-lihat dulu navigates home and calls the injected demo hook', () => {
  const source = read('src/screens/Onboarding.jsx');
  assert.match(source, /onLookAround\?\.\(\)/, 'the demo hook must be optional');
  assert.match(source, /router\.replace\('\/'\)/);
  assert.doesNotMatch(
    source,
    /Task 2|wiring point|does not exist yet/,
    'stale integration notes must be gone now that the route passes enterDemo',
  );
});

test('the guest redirect checks the flag, keeps notices and never touches auth state', () => {
  const shell = read('src/components/AppShell.jsx');
  assert.match(shell, /session\.status !== 'out'/);
  assert.match(shell, /hasSeenOnboarding\(secureStorage\)/);
  assert.match(shell, /seen\s*\?\s*'\/login'\s*:\s*'\/onboarding'/);
  assert.match(shell, /loginPathForNotice\(notice\)/);
  assert.match(shell, /redirectedRef\.current/);
  assert.match(shell, /if \(!isDemo && session\.status !== 'in'\)/);
  assert.match(shell, /LoadingState/);
  assert.doesNotMatch(shell, /setStatus\(/, 'routing must not change session.status');
});

test('the /onboarding route imports the named export the screen provides', () => {
  const route = read('app/onboarding.jsx');
  const screen = read('src/screens/Onboarding.jsx');
  assert.match(
    route,
    /import\s*\{[^}]*\bOnboarding\b[^}]*\}\s*from\s*['"][^'"]*src\/screens\/Onboarding\.jsx['"]/,
    'expo export bundles an undefined named import silently',
  );
  assert.match(screen, /export\s+default\s+function\s+Onboarding/);
  assert.match(screen, /export\s*\{\s*Onboarding\s*\}/);
  assert.match(route, /headerShown:\s*false/);
  assert.match(route, /storage=\{secureStorage\}/);
});
