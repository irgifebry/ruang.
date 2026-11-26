/**
 * Source-level visual + regression gate for the redesigned auth screen.
 *
 * Node cannot import a `.jsx` module that pulls in `react-native` and
 * `expo-router`, so this parses source text — the same constraint the route
 * binding test works under. `expo export` bundles an undefined identifier
 * silently, and it cannot see a removed handler at all, so every piece of the
 * redesign *and* every piece of auth behaviour that must survive it is pinned
 * here.
 *
 * Run with: node --test tests/auth-visual.test.mjs (or: npm test).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(mobileRoot, rel), 'utf8');
const screen = () => read('src/screens/AuthScreen.jsx');

/** The handlers, gates and notices that a visual pass is not allowed to touch. */
test('the redesign keeps every auth handler and gate intact', () => {
  const source = screen();
  assert.match(source, /const handleSubmit = async \(\) => \{/);
  assert.match(source, /const handleGoogle = async \(\) => \{/);
  assert.match(source, /const destination = authDestination\(firstParam\(params\.next\)\);/);
  assert.match(source, /const notices = authNotices\(\{/);
  assert.match(source, /onPress=\{handleGoogle\}/);
  assert.match(source, /onPress=\{handleSubmit\}/);
  assert.match(source, /if \(!isLogin && password\.length < 8\)/);
  // The native app has no captcha: the widget, its gate and the single-use
  // reset path are gone. The server identifies native requests by header.
  assert.doesNotMatch(source, /TurnstileWidget|captchaReady|TURNSTILE_SITE_KEY|resetCaptcha|captchaRef/);
  assert.doesNotMatch(source, /\bready\b/, 'no captcha gate may remain — it crashes on render');
  assert.match(
    source,
    /\n}\n\n\/\/ The routes import/,
    'the component must be closed before the named exports — expo export fails on a stray JSX block',
  );
});

test('the auth screen has no /welcome link and introduces no hex colour', () => {
  assert.doesNotMatch(screen(), /\/welcome\b/);
  assert.doesNotMatch(screen(), /#[0-9a-fA-F]{3,8}\b/);
});

test('the headline is two lines with the second in italic accent', () => {
  const source = screen();
  assert.match(source, />Catat uangmu,<\/Text>/);
  assert.match(source, />tenang di akhir bulan\.<\/Text>/);
  assert.match(source, /fontStyle:\s*'italic'/);
});

test('a brand lockup and a token-only decorative halo frame the screen', () => {
  const source = screen();
  assert.match(
    source,
    /import\s*\{[^}]*\bFAVICON_GLYPH\b[^}]*\}\s*from\s*['"][^'"]*theme\/favicon\.js['"]/,
    'the brand glyph must come from the pinned favicon constant',
  );
  assert.match(source, /d=\{FAVICON_GLYPH\}/);
  assert.match(source, /ruang<Text/);
  assert.match(source, /withAlpha\(t\.accent, 0\.10\)/, 'the halo must be the accent token at 10%');
  assert.match(source, /pointerEvents="none"/, 'the halo must not swallow presses');
});

test('the form panel is round and the Google button keeps its four-colour mark', () => {
  const source = screen();
  assert.match(source, /panel:\s*\{[^}]*borderRadius: t\.radius\.xl/);
  assert.match(source, /<GoogleMark \/>/);
  assert.match(source, /GOOGLE_COLORS\[name\]/);
  assert.match(source, /googleButton:[\s\S]*?borderWidth: 1,[\s\S]*?borderColor: t\.line3/);
  assert.match(source, /<Text style=\{s\.dividerText\}>atau<\/Text>/);
  assert.match(source, /<TextField[\s\S]*?label="Email"/);
});

test('the CTA is a lime animated button with a right arrow', () => {
  const source = screen();
  assert.match(source, /name="arrow-right"/);
  assert.match(source, /onPressIn=\{/);
  assert.match(source, /onPressOut=\{/);
  assert.match(source, /button:[\s\S]*?backgroundColor: t\.accent/);
  assert.match(source, /buttonText:[\s\S]*?color: t\.accentInk/);
  assert.match(source, /Sedang memproses\.\.\./);
});

test('the mode toggle is joined by Bantuan and Tentang footer links', () => {
  const source = screen();
  for (const [label, href] of [['Bantuan', '/help'], ['Tentang', '/about']]) {
    assert.match(source, new RegExp(`router\\.push\\('${href}'\\)`), `${href} must be reachable`);
    assert.match(source, new RegExp(`>${label}</Text>`));
  }
  assert.ok((source.match(/accessibilityRole="link"/g) ?? []).length >= 4);
});

test('the header fades up once on mount and no animation loops', () => {
  const source = screen();
  assert.match(source, /Animated\.parallel\(/);
  assert.match(source, /translateY/);
  assert.match(source, /useNativeDriver: true/);
  assert.doesNotMatch(source, /Animated\.loop\(/);
});

test('focusing a field lifts its border to the accent token', () => {
  const source = screen();
  assert.match(source, /inputStyle=\{focused === 'email'/);
  assert.match(source, /inputStyle=\{focused === 'password'/);
  assert.match(source, /onFocus=\{\(\) => setFocused\('email'\)\}/);
  assert.match(source, /borderColor: t\.accent/);
  assert.match(read('src/components/form.jsx'), /inputStyle/);
});

test('only the decorative Google mark is hidden from screen readers', () => {
  const source = screen();
  assert.match(source, /<View accessibilityElementsHidden=\{true\}>\s*<GoogleMark \/>\s*<\/View>/);
  assert.doesNotMatch(source, /dividerText[^>]*accessibilityElementsHidden/);
});

test('a focused field in error state keeps the danger border', () => {
  const form = read('src/components/form.jsx');
  assert.match(form, /style=\{\[inputStyles\(t, s, error\), error \? null : inputStyle\]\}/);
  const source = screen();
  assert.match(source, /inputStyle=\{focused === 'email' \? s\.inputFocused : null\}/);
  assert.match(source, /inputStyle=\{focused === 'password' \? s\.inputFocused : null\}/);
});

test('the CTA scale is restored when busy changes mid-press', () => {
  assert.match(
    screen(),
    /useEffect\(\(\) => \{\s*ctaScale\.setValue\(1\);\s*\}, \[busy, ctaScale\]\);/,
  );
});

test('the Task 1 leftovers are cleaned up', () => {
  assert.doesNotMatch(read('src/shared/sample-data.js'), /welcome/i);
  assert.doesNotMatch(read('tests/splash.test.mjs'), /import\s*\{[^}]*\brelative\b[^}]*\}/);
});
