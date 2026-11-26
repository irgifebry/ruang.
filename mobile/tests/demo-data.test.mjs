/**
 * Task 2 gate for the guest demo dataset.
 *
 * `demo-data.js` is pure — it only reads the Metro-safe copy of the sample
 * figures and the shared date helpers — so it can be driven directly here.
 * The binding that matters is the one the screens rely on: every dated row
 * must land in the month the visitor is looking at (the sample rows are fixed
 * to October 2026), every expense must carry the joined category the ledger
 * API returns, and nothing may look like a credential or a live account row.
 *
 * Run with: node --test tests/demo-data.test.mjs (or: npm test).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildDemoData, buildDemoHistoryPayload } from '../src/shared/demo-data.js';
import { buildHistoryData } from '../src/shared/history.js';
import { initialExpenses } from '../src/shared/sample-data.js';

const NOW = new Date('2026-11-15T00:00:00');
const data = buildDemoData(NOW);

test('buildDemoData returns the five budgets, six expenses and two incomes', () => {
  assert.equal(data.budgets.length, 5);
  assert.equal(data.expenses.length, 6);
  assert.equal(data.incomes.length, 2);
  assert.ok(data.profile, 'the ledger response always carries a profile key');
});

test('every dated row is remapped to the requested month', () => {
  for (const expense of data.expenses) {
    assert.match(expense.spent_on, /^2026-11-\d{2}$/, `expense ${expense.id} is stale`);
  }
  for (const income of data.incomes) {
    assert.match(income.received_on, /^2026-11-\d{2}$/, `income ${income.id} is stale`);
  }
  // The sample days are kept, not collapsed into a single date, so the daily
  // chart and the history view have something to draw.
  assert.ok(new Set(data.expenses.map((expense) => expense.spent_on)).size >= 4);
});

test('each expense carries the budget join the /api/ledger response has', () => {
  for (const expense of data.expenses) {
    const budget = data.budgets.find((item) => item.id === expense.category_id);
    assert.ok(budget, `expense ${expense.id} points at an unknown category`);
    assert.deepEqual(
      expense.budgets,
      { id: budget.id, name: budget.name, color: budget.color },
      `expense ${expense.id} has the wrong category join`,
    );
  }
});

test('every row is owned by demo and carries no credential', () => {
  const rows = [...data.budgets, ...data.expenses, ...data.incomes, data.profile];
  for (const row of rows) {
    assert.equal(row.user_id, 'demo');
  }
  assert.equal(data.profile.id, 'demo');
  assert.doesNotMatch(JSON.stringify(data), /"password"|"token"|service_role/i);
});

test('the history envelope buckets the same demo rows by the viewed month', () => {
  const payload = buildDemoHistoryPayload(data);
  assert.deepEqual(Object.keys(payload.byMonth), ['2026-11']);
  assert.deepEqual(Object.keys(payload.incomesByMonth), ['2026-11']);
  assert.equal(payload.byMonth['2026-11'].length, data.expenses.length);
  assert.equal(payload.incomesByMonth['2026-11'].length, data.incomes.length);
  assert.equal(payload.budgets, data.budgets);

  const rows = buildHistoryData(payload);
  assert.equal(rows.length, 1, 'the demo guest must not see an empty Riwayat');
  assert.equal(rows[0].key, '2026-11');
  assert.equal(rows[0].income, data.incomes.reduce((sum, row) => sum + row.amount, 0));
  assert.ok(rows[0].spent > 0);
  assert.ok(rows[0].categories.length > 0);

  // The source arrays are untouched by the adaptation.
  assert.equal(data.expenses.length, 6);
  assert.equal(data.incomes.length, 2);
});

test('the sample source is not mutated and a second month remaps independently', () => {
  const december = buildDemoData(new Date('2026-12-15T00:00:00'));
  assert.match(december.incomes[0].received_on, /^2026-12-/);
  assert.match(data.incomes[0].received_on, /^2026-11-/);
  assert.equal(initialExpenses[0].spent_on, '2026-10-07', 'sample-data stays the pinned copy');
  assert.equal(data.incomes[0].amount, 12_500_000, 'the sample figures remain unchanged');
});
