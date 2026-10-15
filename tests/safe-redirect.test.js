/**
 * The consent screen redirects to values supplied by the query string, so the
 * rejection cases matter more than the accepting ones: every hostile shape
 * must collapse to the fallback instead of leaving the origin.
 *
 * Run with: npm test
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { safePath, safeRedirectUri } from '../src/lib/safe-redirect.js';

test('safePath keeps a same-origin path', () => {
  assert.equal(safePath('/settings?tab=gaji'), '/settings?tab=gaji');
  assert.equal(safePath('/'), '/');
});

test('safePath rejects absolute, protocol-relative and backslash targets', () => {
  assert.equal(safePath('https://evil.test'), '/');
  assert.equal(safePath('//evil.test'), '/');
  assert.equal(safePath('/\\evil.test'), '/');
  assert.equal(safePath('javascript:alert(1)'), '/');
  assert.equal(safePath(''), '/');
  assert.equal(safePath(null), '/');
  assert.equal(safePath(undefined, '/fallback'), '/fallback');
});

test('safeRedirectUri keeps a relative path', () => {
  assert.equal(safeRedirectUri('/history', 'https://ruang.test'), '/history');
  assert.equal(safeRedirectUri('//evil.test', 'https://ruang.test', '/safe'), '/safe');
});

test('safeRedirectUri keeps an absolute URL only on the same origin', () => {
  assert.equal(
    safeRedirectUri('https://ruang.test/callback?code=abc', 'https://ruang.test'),
    '/callback?code=abc',
  );
  assert.equal(safeRedirectUri('https://evil.test/callback', 'https://ruang.test', '/safe'), '/safe');
  assert.equal(safeRedirectUri('not a url', 'https://ruang.test', '/safe'), '/safe');
  assert.equal(safeRedirectUri('', 'https://ruang.test', '/safe'), '/safe');
});
