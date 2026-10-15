import test from 'node:test';
import assert from 'node:assert/strict';
import { validAmount, validBudget, validDate, validExpense, validId, validIncome, validMonths } from '../src/lib/ledger-validation.js';

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

test('validIncome mirrors validExpense without the category', () => {
  const ok = { description: ' Bonus ', amount: 2_500_000, receivedOn: '2026-10-04' };

  assert.equal(validIncome(ok), true);
  // `source` is the one optional field, so absent, null and blank are all fine…
  assert.equal(validIncome({ ...ok, source: undefined }), true);
  assert.equal(validIncome({ ...ok, source: null }), true);
  assert.equal(validIncome({ ...ok, source: '  ' }), true);
  assert.equal(validIncome({ ...ok, source: 'Bonus' }), true);
  // …and anything the column cannot store is not.
  assert.equal(validIncome({ ...ok, source: 'x'.repeat(41) }), false);
  assert.equal(validIncome({ ...ok, source: 42 }), false);

  // Same field rules as an expense, under income's own date field.
  assert.equal(validIncome({ ...ok, description: '' }), false);
  assert.equal(validIncome({ ...ok, description: 'x'.repeat(81) }), false);
  assert.equal(validIncome({ ...ok, amount: 0 }), false);
  assert.equal(validIncome({ ...ok, amount: 1.5 }), false);
  assert.equal(validIncome({ ...ok, amount: 1_000_000_000_000 }), false);
  assert.equal(validIncome({ ...ok, receivedOn: '2026-02-30' }), false);
  assert.equal(validIncome({ ...ok, receivedOn: undefined }), false);
  // No category: an income row that carries one is still accepted, because the
  // column simply is not read — but a row missing the required fields is not.
  assert.equal(validIncome({ ...ok, categoryId: uuid }), true);
  assert.equal(validIncome(null), false);
  assert.equal(validIncome([]), false);
});
