/**
 * `buildSocialPayload` in `src/auth/google.js` — the pure Google payload the
 * native sign-in hands to the HTTP client: the exact shape, the empty-token
 * guard, and the `nonce` passthrough when the SDK returns none.
 *
 * Run with: cd mobile && node --test tests/google.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSocialPayload } from '../src/auth/google.js';

test('buildSocialPayload returns the exact social payload shape', () => {
  const payload = buildSocialPayload({ idToken: 'token-abc', nonce: 'nonce-123' });

  assert.deepEqual(payload, {
    provider: 'google',
    idToken: { token: 'token-abc', nonce: 'nonce-123' },
    callbackURL: 'ruang://oauth-return',
  });
});

test('buildSocialPayload throws when the idToken is empty', () => {
  assert.throws(() => buildSocialPayload({ idToken: '' }), /idToken/);
  assert.throws(() => buildSocialPayload({ idToken: '   ' }), /idToken/);
  assert.throws(() => buildSocialPayload({}), /idToken/);
});

test('buildSocialPayload keeps a missing nonce as undefined (does not drop the key)', () => {
  const payload = buildSocialPayload({ idToken: 'token-abc' });

  assert.equal(payload.idToken.token, 'token-abc');
  assert.ok('nonce' in payload.idToken);
  assert.equal(payload.idToken.nonce, undefined);
});
