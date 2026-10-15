import test from 'node:test';
import assert from 'node:assert/strict';
import { validAmount, validBudget, validDate, validExpense, validId, validMonths } from '../src/lib/ledger-validation.js';

const uuid = '123e4567-e89b-12d3-a456-426614174000';

test('ledger validation rejects malformed and out-of-range inputs', () => {
  assert.equal(validId(uuid), true);
  assert.equal(validId('not-an-id'), false);
  assert.equal(validAmount(0), false);
  assert.equal(validAmount(0, true), true);
  assert.equal(validAmount(1_000_000_000_000), false);
  assert.equal(validDate('2026-02-29'), false);
  assert.equal(validDate('2026-10-01', true), true);
  assert.equal(validDate('2026-10-02', true), false);
  assert.equal(validExpense({ categoryId: uuid, description: ' makan ', amount: 12000, spentOn: '2026-10-11' }), true);
  assert.equal(validExpense({ categoryId: uuid, description: 'x', amount: 1.5, spentOn: '2026-10-11' }), false);
  assert.equal(validBudget({ name: 'Makan', monthlyLimit: 500000, color: 'lime' }), true);
  assert.equal(validBudget({ name: 'Makan', monthlyLimit: 500000, color: 'red' }), false);
  assert.equal(validMonths(120), true);
  assert.equal(validMonths(121), false);
});
