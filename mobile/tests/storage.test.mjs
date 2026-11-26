import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(mobileRoot, 'src/api/storage.js'), 'utf8');

test('storage falls back to localStorage on web', () => {
  // expo-secure-store has no web implementation; without a fallback the app
  // cannot persist the session token or the onboarding flag in browser tests.
  assert.match(source, /import\s*\{[^}]*\bPlatform\b[^}]*\}\s*from\s*['"]react-native['"]/);
  assert.match(source, /Platform\.OS === 'web'/);
  assert.match(source, /localStorage/);
  assert.match(source, /typeof window !== 'undefined'/);
});
