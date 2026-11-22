import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidResetToken } from '../src/lib/reset-token.js';

test('reset token accepts an opaque URL-safe id', () => {
  assert.equal(isValidResetToken('aB3xY9_kQ2lmN0pR7sTuV4wX'), true);
  assert.equal(isValidResetToken('123e4567-e89b-12d3-a456-426614174000'), true);
});

test('reset token rejects blanks, junk and anything that cannot be a token', () => {
  for (const value of ['', '   ', 'short', 'has space', 'a\nnewline', '<script>', null, undefined, 42, 'x'.repeat(513)]) {
    assert.equal(isValidResetToken(value), false, String(value));
  }
});
