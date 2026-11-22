/**
 * Review-focus pins for the incomes-only model.
 *
 * Three cases matter most in the audit and are easy to regress without any
 * test going red elsewhere: the exact amount boundary on both client and
 * server, a month with income but no expenses, and the balance being income
 * minus expenses with no second funding source.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { getCashflowSummary } from '../src/lib/money.js';
import {
  buildHistoryRows,
  validateBudget,
  validateExpense,
  validateIncome,
} from '../src/lib/ledger.js';
import * as ledger from '../src/lib/ledger.js';
import { AMOUNT_MAX, validAmount } from '../src/lib/ledger-validation.js';

const categoryId = '11111111-1111-1111-1111-111111111111';

// ---------------------------------------------------------------------------
// 1. The exact amount boundary, client and server
// ---------------------------------------------------------------------------

test('AMOUNT_MAX is accepted and AMOUNT_MAX + 1 rejected everywhere', () => {
  assert.equal(AMOUNT_MAX, 999_999_999_999);

  const expense = {
    description: 'Belanja',
    amount: String(AMOUNT_MAX),
    categoryId,
    spentOn: '2026-10-07',
  };
  const income = {
    description: 'Pemasukan',
    amount: String(AMOUNT_MAX),
    receivedOn: '2026-10-07',
  };

  // Client-side form validators…
  assert.deepEqual(validateExpense(expense, [{ id: categoryId, name: 'Makan' }]), {});
  assert.deepEqual(validateIncome(income), {});
  assert.deepEqual(validateBudget({ name: 'Makan', monthlyLimit: String(AMOUNT_MAX) }), {});

  assert.ok(validateExpense({ ...expense, amount: '1000000000000' }, [{ id: categoryId }]).amount);
  assert.ok(validateIncome({ ...income, amount: '1000000000000' }).amount);
  assert.ok(validateBudget({ name: 'Makan', monthlyLimit: '1000000000000' }).monthlyLimit);

  // …and the server-side validator used by every write action.
  assert.equal(validAmount(999_999_999_999), true);
  assert.equal(validAmount(1_000_000_000_000), false);
});

// ---------------------------------------------------------------------------
// 2. An income month with no expenses is a real history row
// ---------------------------------------------------------------------------

test('an income-only month appears in history with spent = 0', () => {
  // This is exactly the bucket `fetchMonthlyBreakdown` builds for a month that
  // shows up in incomesByMonth but not in the expense aggregates.
  const breakdown = {
    budgets: [{ id: 'food', name: 'Makan', monthly_limit: 1_000_000, color: 'lime' }],
    months: [
      { key: '2026-09', spent: 0, count: 0, byCategory: {} },
      { key: '2026-10', spent: 750_000, count: 2, byCategory: { food: 750_000 } },
    ],
    incomesByMonth: {
      '2026-09': [{ amount: 4_000_000 }],
    },
  };

  const rows = buildHistoryRows(breakdown);
  const september = rows.find((row) => row.key === '2026-09');

  assert.ok(september, 'income without expenses must still reach the history');
  assert.equal(september.income, 4_000_000);
  assert.equal(september.inflow, 4_000_000);
  assert.equal(september.spent, 0);
  assert.equal(september.saved, 4_000_000);
  assert.equal(september.incomeCount, 1);
  assert.deepEqual(september.categories, []);
});

// ---------------------------------------------------------------------------
// 3. Remaining is income minus expenses, with no salary argument
// ---------------------------------------------------------------------------

test('getCashflowSummary remaining = income − expenses', () => {
  const expenses = [
    { category_id: 'food', amount: 1_000_000 },
    { category_id: 'home', amount: 500_000 },
  ];
  const flow = getCashflowSummary([{ amount: 5_000_000 }], [], expenses);

  assert.equal(flow.income, 5_000_000);
  assert.equal(flow.inflow, 5_000_000);
  assert.equal(flow.spent, 1_500_000);
  assert.equal(flow.remaining, 3_500_000);
  assert.equal('salary' in flow, false);
});

// ---------------------------------------------------------------------------
// Removed surface
//
// The API needs a live session and a database, so its side of the contract is
// pinned statically: no salary action or response field may creep back in.
// ---------------------------------------------------------------------------

test('the ledger module no longer exports salary helpers', () => {
  for (const name of ['fetchSalaryHistory', 'fetchSalaryRecords', 'saveSalary', 'validateSalary']) {
    assert.equal(name in ledger, false, `${name} must be gone`);
  }
});

test('the ledger API has no salary actions or response fields', async () => {
  const source = await readFile(new URL('../src/app/api/ledger/route.js', import.meta.url), 'utf8');

  for (const removed of ['fetchSalaryHistory', 'saveSalary', 'salary_records', 'melebihi gaji']) {
    assert.equal(source.includes(removed), false, `${removed} must be gone from the route`);
  }
  assert.match(source, /sec-fetch-site/);
  assert.match(source, /'same-origin'/);
});
