import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const screen = readFileSync(join(mobileRoot, 'src/screens/AuthScreen.jsx'), 'utf8');
const handlerStart = screen.indexOf('const handleGoogle');
const handler = screen.slice(handlerStart, screen.indexOf('\n  return (', handlerStart));

test('the Google button checks native-module availability before importing the SDK', () => {
  // The SDK's native module is absent in Expo Go, and its web implementation
  // is sponsor-only. Both cases must be detected WITHOUT importing the SDK.
  assert.match(
    screen,
    /import\s*\{[^}]*\bPlatform\b[^}]*\}\s*from\s*['"]react-native['"]/,
    'AuthScreen must import Platform',
  );
  assert.match(
    screen,
    /import\s*\{[^}]*\bTurboModuleRegistry\b[^}]*\}\s*from\s*['"]react-native['"]/,
    'AuthScreen must import TurboModuleRegistry to probe the native module',
  );
  assert.match(screen, /TurboModuleRegistry\.get\('RNGoogleSignin'\)/);

  const guard = handler.indexOf('if (!googleAvailable)');
  const call = handler.indexOf('await signInWithGoogle()');
  assert.ok(guard > -1, 'handleGoogle must guard on native-module availability');
  assert.ok(call > -1, 'the SDK call must remain for real dev builds');
  assert.ok(guard < call, 'the guard must run before the SDK call');
});

test('unsupported environments get friendly Indonesian copy, with no console error', () => {
  assert.match(handler, /Masuk dengan Google hanya tersedia di aplikasi\./);
  assert.match(handler, /Gunakan development build, bukan Expo Go\./);

  const beforeSdk = handler.slice(0, handler.indexOf('await signInWithGoogle()'));
  assert.doesNotMatch(beforeSdk, /console\.error/);
});

test('genuine auth failures still log and show the generic Google error', () => {
  assert.match(handler, /console\.error\('\[auth\] Google sign-in gagal:'/);
  assert.match(handler, /setFormError\(GOOGLE_ERROR\)/);
});
