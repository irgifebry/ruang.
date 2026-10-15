import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DELETION_GRACE_DAYS,
  deletionDeadline,
  formatGraceRemaining,
  graceRemainingMs,
  isDeletionExpired,
} from '../src/lib/account-deletion.js';

/**
 * The grace period is the whole feature: "hapus akun" has to leave the account
 * recoverable for exactly seven days and not one second longer, and a day short
 * is as wrong as a day long.
 */

const NOW = new Date('2026-10-11T09:00:00.000Z');

test('the grace period is seven days', () => {
  assert.equal(DELETION_GRACE_DAYS, 7);
});

test('an account that was never flagged has no deadline', () => {
  assert.equal(deletionDeadline(null), null);
  assert.equal(deletionDeadline(undefined), null);
  assert.equal(deletionDeadline(''), null);
});

test('a junk timestamp reads as "never flagged" rather than throwing', () => {
  // Postgres hands this column back as a string, but a restored backup or a
  // hand-edited row can hold anything, and none of it may crash a sign-in.
  assert.equal(deletionDeadline('not-a-date'), null);
  assert.equal(isDeletionExpired('not-a-date', NOW), false);
});

test('the deadline is seven days after the request', () => {
  const deadline = deletionDeadline('2026-10-11T09:00:00.000Z');
  assert.equal(deadline.toISOString(), '2026-10-18T09:00:00.000Z');
});

test('the last second of the window still counts as restorable', () => {
  assert.equal(isDeletionExpired('2026-10-11T09:00:00.000Z', new Date('2026-10-18T08:59:59.000Z')), false);
});

test('the deadline itself is already too late', () => {
  assert.equal(isDeletionExpired('2026-10-11T09:00:00.000Z', new Date('2026-10-18T09:00:00.000Z')), true);
  assert.equal(isDeletionExpired('2026-10-11T09:00:00.000Z', new Date('2026-10-18T09:00:00.001Z')), true);
});

test('remaining time never goes negative', () => {
  assert.equal(graceRemainingMs('2026-10-11T09:00:00.000Z', new Date('2026-11-01T00:00:00.000Z')), 0);
  assert.equal(graceRemainingMs(null, NOW), 0);
});

test('the countdown floors rather than rounds up', () => {
  // 6 days 23 hours left is still on the "6 hari" side of the line. Rounding up
  // would tell the user they have a day they do not have.
  assert.equal(
    formatGraceRemaining('2026-10-11T09:00:00.000Z', new Date('2026-10-11T10:00:00.000Z')),
    '6 hari 23 jam',
  );
});

test('the countdown drops the hours only when there are none', () => {
  assert.equal(
    formatGraceRemaining('2026-10-11T09:00:00.000Z', new Date('2026-10-15T09:00:00.000Z')),
    '3 hari',
  );
});

test('the countdown has an hours and a minutes step for the last day', () => {
  assert.equal(
    formatGraceRemaining('2026-10-11T09:00:00.000Z', new Date('2026-10-18T02:00:00.000Z')),
    '7 jam',
  );
  assert.equal(
    formatGraceRemaining('2026-10-11T09:00:00.000Z', new Date('2026-10-18T08:30:00.000Z')),
    '30 menit',
  );
});

test('an expired account reads as "sekarang", not as a negative countdown', () => {
  assert.equal(
    formatGraceRemaining('2026-10-01T09:00:00.000Z', NOW),
    'saat ini',
  );
});

test('a Date and an ISO string describe the same deadline', () => {
  const fromString = deletionDeadline('2026-10-11T09:00:00.000Z').getTime();
  const fromDate = deletionDeadline(new Date('2026-10-11T09:00:00.000Z')).getTime();
  assert.equal(fromString, fromDate);
});