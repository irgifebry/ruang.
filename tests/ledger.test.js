/**
 * Tests for the pure money, date and validation helpers.
 *
 * The project has no test runner installed, so this uses `node:test` plus the
 * built-in assertions. Run with: `npm test`.
 *
 * These functions carry the review focus from the original spec — zero and
 * negative input, missing categories, long labels, large IDR values — so they
 * are worth pinning down: every one of them previously sat inline in a page
 * component where a regression would only show up as a wrong number on screen.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  balanceLevel,
  currentMonthKey,
  formatDate,
  formatIDR,
  formatIDRCompact,
  formatMonthLabel,
  getBudgetSummary,
  monthEnd,
  monthKey,
  monthRange,
  monthStart,
  ratioPercent,
  shiftMonth,
  toDate,
  toNumber,
  toPositive,
  todayISO,
} from '../src/lib/money.js';

import {
  buildHistoryRows,
  countExpensesIn,
  validateBudget,
  validateExpense,
} from '../src/lib/ledger.js';

import { AMOUNT_MAX } from '../src/lib/ledger-validation.js';

// ---------------------------------------------------------------------------
// toNumber / toPositive
// ---------------------------------------------------------------------------

test('toNumber coerces numeric strings from Postgres numerics', () => {
  assert.equal(toNumber('12500000'), 12_500_000);
  assert.equal(toNumber(0), 0);
  assert.equal(toNumber('0'), 0);
});

test('toNumber falls back to 0 for junk rather than NaN', () => {
  assert.equal(toNumber(''), 0);
  assert.equal(toNumber(null), 0);
  assert.equal(toNumber(undefined), 0);
  assert.equal(toNumber('abc'), 0);
  assert.equal(toNumber(NaN), 0);
  assert.equal(toNumber(Infinity), 0);
});

test('toPositive clamps negatives to zero', () => {
  assert.equal(toPositive(-5000), 0);
  assert.equal(toPositive('-1'), 0);
  assert.equal(toPositive(100), 100);
});

// ---------------------------------------------------------------------------
// formatIDR
// ---------------------------------------------------------------------------

test('formatIDR renders whole rupiah without decimals', () => {
  const output = formatIDR(12_500_000);
  assert.match(output, /12\.500\.000/);
  assert.doesNotMatch(output, /,/);
  assert.doesNotMatch(output, /[.,]00$/);
});

test('formatIDR handles zero and junk without throwing', () => {
  assert.match(formatIDR(0), /0/);
  assert.match(formatIDR(null), /0/);
  assert.match(formatIDR(undefined), /0/);
  assert.match(formatIDR('abc'), /0/);
});

test('formatIDR keeps very large values readable', () => {
  const output = formatIDR(9_876_543_210);
  assert.match(output, /9\.876\.543\.210/);
});

// ---------------------------------------------------------------------------
// formatIDRCompact
// ---------------------------------------------------------------------------

test('formatIDRCompact shortens into Indonesian units', () => {
  assert.match(formatIDRCompact(12_500_000), /12,5 jt/);
  assert.match(formatIDRCompact(1_500_000), /1,5 jt/);
  assert.match(formatIDRCompact(2_000_000_000), /2 M/);
  assert.match(formatIDRCompact(50_000), /50 rb/);
});

test('formatIDRCompact drops the trailing zero', () => {
  assert.match(formatIDRCompact(3_000_000), /3 jt/);
  assert.doesNotMatch(formatIDRCompact(3_000_000), /3,0 jt/);
});

test('formatIDRCompact preserves the sign', () => {
  assert.match(formatIDRCompact(-1_500_000), /^-/);
});

// ---------------------------------------------------------------------------
// ratioPercent
// ---------------------------------------------------------------------------

test('ratioPercent clamps into 0-100 and survives a zero total', () => {
  assert.equal(ratioPercent(50, 200), 25);
  assert.equal(ratioPercent(300, 200), 100);
  assert.equal(ratioPercent(50, 0), 0);
  assert.equal(ratioPercent(-5, 200), 0);
});

// ---------------------------------------------------------------------------
// balanceLevel
// ---------------------------------------------------------------------------

test('balanceLevel escalates with the amount left', () => {
  assert.equal(balanceLevel(-1, 5_000_000), 'over');
  assert.equal(balanceLevel(0, 5_000_000), 'empty');
  assert.equal(balanceLevel(1_000_000, 5_000_000), 'low');
  assert.equal(balanceLevel(2_000_000, 5_000_000), 'ok');
});

test('balanceLevel calls the last quarter of the inflow low', () => {
  // The threshold is inclusive at the boundary: exactly a quarter left is
  // already "menipis", one rupiah more is not.
  assert.equal(balanceLevel(1_250_000, 5_000_000), 'low');
  assert.equal(balanceLevel(1_250_001, 5_000_000), 'ok');
});

test('balanceLevel keeps an unset inflow out of the amber band', () => {
  // With no money in, there is nothing to have run out of.
  assert.equal(balanceLevel(0, 0), 'empty');
  assert.equal(balanceLevel(500_000, 0), 'low');
});

test('balanceLevel treats junk as zero rather than throwing', () => {
  assert.equal(balanceLevel(undefined, 5_000_000), 'empty');
  assert.equal(balanceLevel('abc', 5_000_000), 'empty');
  assert.equal(balanceLevel('750000', 5_000_000), 'low');
});

// ---------------------------------------------------------------------------
// getBudgetSummary
// ---------------------------------------------------------------------------

const budgets = [
  { id: 'food', name: 'Makan', monthly_limit: 1_000_000, color: 'lime' },
  { id: 'home', name: 'Tempat tinggal', monthly_limit: 2_000_000, color: 'blue' },
];

const expenses = [
  { category_id: 'food', amount: 400_000 },
  { category_id: 'food', amount: 100_000 },
];

test('getBudgetSummary totals allocation, spend and the unspent envelope', () => {
  const summary = getBudgetSummary(budgets, expenses);

  assert.equal(summary.spent, 500_000);
  assert.equal(summary.allocated, 3_000_000);
  assert.equal(summary.unspent, 2_500_000);
  assert.deepEqual(Object.keys(summary).sort(), [
    'allocated', 'categories', 'overBudgetCount', 'spent', 'unspent',
  ]);
});

test('getBudgetSummary attributes spend to the right category', () => {
  const summary = getBudgetSummary(budgets, expenses);
  const food = summary.categories.find((category) => category.id === 'food');
  const home = summary.categories.find((category) => category.id === 'home');

  assert.equal(food.spent, 500_000);
  assert.equal(food.remaining, 500_000);
  assert.equal(food.percent, 50);
  assert.equal(food.over, false);

  assert.equal(home.spent, 0);
  assert.equal(home.percent, 0);
});

test('getBudgetSummary flags an overspent category with a negative remainder', () => {
  const summary = getBudgetSummary(budgets, [
    { category_id: 'food', amount: 1_400_000 },
  ]);
  const food = summary.categories.find((category) => category.id === 'food');

  assert.equal(food.over, true);
  assert.equal(food.remaining, -400_000);
  // percent stays clamped at 100 for the bar width even though the real figure
  // is 140.
  assert.equal(food.percent, 100);
  assert.equal(summary.overBudgetCount, 1);
});

test('getBudgetSummary reports a negative unspent when spending beats allocation', () => {
  const summary = getBudgetSummary(budgets, [
    { category_id: 'home', amount: 5_000_000 },
  ]);

  assert.equal(summary.spent, 5_000_000);
  assert.equal(summary.unspent, -2_000_000);
});

test('getBudgetSummary treats a zero-limit category as not overspent', () => {
  // A limit of 0 with 0 spent must not render as "over budget".
  const summary = getBudgetSummary(
    [{ id: 'misc', name: 'Lainnya', monthly_limit: 0, color: 'pink' }],
    [],
  );

  const category = summary.categories[0];
  assert.equal(category.over, false);
  assert.equal(category.percent, 0);
});

test('getBudgetSummary tolerates empty and invalid inputs', () => {
  const empty = getBudgetSummary([], []);
  assert.deepEqual(
    { spent: empty.spent, allocated: empty.allocated, unspent: empty.unspent },
    { spent: 0, allocated: 0, unspent: 0 },
  );

  const junk = getBudgetSummary([{ id: 'x', monthly_limit: 'y' }], [{ amount: 'z' }]);
  assert.equal(junk.spent, 0);
  assert.equal(junk.allocated, 0);
  assert.equal(junk.unspent, 0);
});

test('getBudgetSummary defaults its array arguments', () => {
  const summary = getBudgetSummary();
  assert.equal(summary.spent, 0);
  assert.deepEqual(summary.categories, []);
});

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

test('toDate reads a bare YYYY-MM-DD in local time', () => {
  // Parsing this as UTC lands on the 6th for anyone west of Greenwich, which
  // silently shifted every transaction date by a day.
  const date = toDate('2026-10-07');
  assert.equal(date.getFullYear(), 2026);
  assert.equal(date.getMonth(), 9);
  assert.equal(date.getDate(), 7);
});

test('toDate returns null for unusable input', () => {
  assert.equal(toDate('not-a-date'), null);
  assert.equal(toDate(''), null);
  assert.equal(toDate(new Date('nope')), null);
});

test('formatDate renders in Indonesian', () => {
  assert.equal(formatDate('2026-10-07'), '7 Okt');
});

test('monthKey, monthStart and monthEnd agree on the month', () => {
  assert.equal(monthKey('2026-10-07'), '2026-10');
  assert.equal(monthStart('2026-10-07'), '2026-10-01');
  assert.equal(monthEnd('2026-10-07'), '2026-10-31');
  assert.equal(monthEnd('2026-02-10'), '2026-02-28');
  // Leap year.
  assert.equal(monthEnd('2024-02-10'), '2024-02-29');
});

test('monthEnd handles a 31-day month and December rollover', () => {
  assert.equal(monthEnd('2026-12-15'), '2026-12-31');
  assert.equal(monthEnd('2026-01-05'), '2026-01-31');
});

test('shiftMonth crosses year boundaries in both directions', () => {
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2026-06', 0), '2026-06');
});

test('formatMonthLabel names the month in Indonesian', () => {
  assert.equal(formatMonthLabel('2026-09'), 'September 2026');
});

test('currentMonthKey and todayISO are well-formed', () => {
  assert.match(currentMonthKey(), /^\d{4}-\d{2}$/);
  assert.match(todayISO(), /^\d{4}-\d{2}-\d{2}$/);
});

test('monthRange spans backwards and forwards around the centre month', () => {
  const keys = monthRange('2026-06', 2, 3);

  assert.deepEqual(keys, ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']);
});

test('monthRange crosses a year boundary in the centre month', () => {
  // The picker offers both directions, so only the trailing window can roll
  // over: December forwards, and January backwards.
  assert.deepEqual(monthRange('2026-12', 1, 1), ['2026-11', '2026-12', '2027-01']);
  assert.deepEqual(monthRange('2026-01', 1, 1), ['2025-12', '2026-01', '2026-02']);
});

test('monthRange includes the centre month exactly once', () => {
  const keys = monthRange('2026-06');

  assert.equal(keys.length, 37);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(keys.filter((key) => key === '2026-06').length, 1);
});

// ---------------------------------------------------------------------------
// validateExpense
// ---------------------------------------------------------------------------

const categoryId = '11111111-1111-1111-1111-111111111111';
const validExpense = {
  description: 'Belanja',
  amount: '50000',
  categoryId,
  spentOn: '2026-10-07',
};
const knownBudgets = [{ id: categoryId, name: 'Makan' }];

test('validateExpense accepts a well-formed entry', () => {
  assert.deepEqual(validateExpense(validExpense, knownBudgets), {});
});

test('validateExpense requires a description', () => {
  const errors = validateExpense({ ...validExpense, description: '   ' }, knownBudgets);
  assert.ok(errors.description);
});

test('validateExpense rejects a description over the column limit', () => {
  const errors = validateExpense({ ...validExpense, description: 'x'.repeat(81) }, knownBudgets);
  assert.ok(errors.description);
});

test('validateExpense rejects a missing or zero amount', () => {
  assert.ok(validateExpense({ ...validExpense, amount: '' }, knownBudgets).amount);
  assert.ok(validateExpense({ ...validExpense, amount: '0' }, knownBudgets).amount);
});

test('validateExpense rejects a negative or non-numeric amount', () => {
  assert.ok(validateExpense({ ...validExpense, amount: '-5000' }, knownBudgets).amount);
  assert.ok(validateExpense({ ...validExpense, amount: '12.500' }, knownBudgets).amount);
  assert.ok(validateExpense({ ...validExpense, amount: 'abc' }, knownBudgets).amount);
});

test('validateExpense accepts AMOUNT_MAX but rejects one rupiah past it', () => {
  assert.deepEqual(validateExpense({ ...validExpense, amount: String(AMOUNT_MAX) }, knownBudgets), {});
  const errors = validateExpense({ ...validExpense, amount: String(AMOUNT_MAX + 1) }, knownBudgets);
  assert.equal(errors.amount, 'Nominal terlalu besar.');
});

test('validateExpense requires a known category', () => {
  assert.ok(validateExpense({ ...validExpense, categoryId: '' }, knownBudgets).categoryId);
  // A category id the user does not own must not pass, or the insert would fail
  // against the RLS policy instead of showing a helpful message.
  assert.ok(validateExpense({ ...validExpense, categoryId: 'other' }, knownBudgets).categoryId);
});

test('validateExpense requires a valid date', () => {
  assert.ok(validateExpense({ ...validExpense, spentOn: '' }, knownBudgets).spentOn);
  assert.ok(validateExpense({ ...validExpense, spentOn: '07/10/2026' }, knownBudgets).spentOn);
});

// ---------------------------------------------------------------------------
// validateBudget
// ---------------------------------------------------------------------------

test('validateBudget accepts a clean category', () => {
  assert.deepEqual(
    validateBudget({ name: 'Kesehatan', monthlyLimit: '300000' }, { budgets: [] }),
    {},
  );
});

test('validateBudget requires a name and a limit', () => {
  const errors = validateBudget({ name: '  ', monthlyLimit: '' }, { budgets: [] });
  assert.ok(errors.name);
  assert.ok(errors.monthlyLimit);
});

test('validateBudget rejects a duplicate name regardless of case', () => {
  const existing = [{ id: 'a', name: 'Makan' }];
  const errors = validateBudget(
    { name: 'makan', monthlyLimit: '1000' },
    { budgets: existing },
  );
  assert.ok(errors.name);
});

test('validateBudget allows saving a category under its own name', () => {
  const existing = [{ id: 'a', name: 'Makan' }];
  const errors = validateBudget(
    { name: 'Makan', monthlyLimit: '1000' },
    { budgets: existing, ignoreId: 'a' },
  );
  assert.equal(errors.name, undefined);
});

test('validateBudget rejects a negative or non-numeric limit', () => {
  const errors = validateBudget({ name: 'X', monthlyLimit: '-1' }, { budgets: [] });
  assert.ok(errors.monthlyLimit);
});

test('validateBudget accepts AMOUNT_MAX but rejects one rupiah past it', () => {
  assert.deepEqual(validateBudget({ name: 'X', monthlyLimit: String(AMOUNT_MAX) }), {});
  const errors = validateBudget({ name: 'X', monthlyLimit: String(AMOUNT_MAX + 1) });
  assert.equal(errors.monthlyLimit, 'Batas terlalu besar.');
});

test('validateBudget has no income-based cap', () => {
  // Any `salary` option the old form used to pass is ignored: envelopes are a
  // user choice, never a share of this month's money in.
  assert.deepEqual(
    validateBudget({ name: 'X', monthlyLimit: String(AMOUNT_MAX) }, { budgets: [], salary: 1 }),
    {},
  );
});

// ---------------------------------------------------------------------------
// countExpensesIn
// ---------------------------------------------------------------------------

test('countExpensesIn counts only the matching category', () => {
  const expenses = [
    { category_id: 'a' },
    { category_id: 'a' },
    { category_id: 'b' },
  ];
  assert.equal(countExpensesIn(expenses, 'a'), 2);
  assert.equal(countExpensesIn(expenses, 'c'), 0);
});

// ---------------------------------------------------------------------------
// buildHistoryRows
//
// A month reaches the history page only when it has money in or money out.
// Nothing is carried forward, and no zero placeholder stands in for a month
// nobody filled in.
// ---------------------------------------------------------------------------

const historyBudgets = [
  { id: 'food', name: 'Makan', monthly_limit: 1_000_000, color: 'lime' },
  { id: 'home', name: 'Tempat tinggal', monthly_limit: 2_000_000, color: 'blue' },
];

// The shape fetchMonthlyBreakdown returns: expense buckets plus an empty
// bucket for a month that only has income.
const breakdownMonths = [
  { key: '2026-08', spent: 0, count: 0, byCategory: {} },
  { key: '2026-09', spent: 900_000, count: 3, byCategory: { food: 900_000 } },
  { key: '2026-10', spent: 1_200_000, count: 4, byCategory: { food: 700_000, home: 500_000 } },
];

const breakdownIncomes = {
  '2026-08': [{ amount: 4_000_000 }],
  '2026-10': [{ amount: 1_000_000 }, { amount: 500_000 }],
};

test('buildHistoryRows measures the balance against that month income only', () => {
  const rows = buildHistoryRows({
    months: breakdownMonths,
    budgets: historyBudgets,
    incomesByMonth: breakdownIncomes,
  });
  const october = rows.find((row) => row.key === '2026-10');

  assert.equal(october.income, 1_500_000);
  assert.equal(october.inflow, 1_500_000);
  assert.equal(october.spent, 1_200_000);
  assert.equal(october.saved, 300_000);
  assert.equal(october.incomeCount, 2);
  assert.equal(october.salary, undefined);
});

test('buildHistoryRows keeps an income-only month with spent = 0', () => {
  const rows = buildHistoryRows({
    months: breakdownMonths,
    budgets: historyBudgets,
    incomesByMonth: breakdownIncomes,
  });
  const august = rows.find((row) => row.key === '2026-08');

  assert.ok(august, 'a month with income and no expenses must appear');
  assert.equal(august.income, 4_000_000);
  assert.equal(august.inflow, 4_000_000);
  assert.equal(august.spent, 0);
  assert.equal(august.saved, 4_000_000);
  assert.equal(august.savedPercent, 100);
  assert.equal(august.incomeCount, 1);
  assert.deepEqual(august.categories, []);
});

test('buildHistoryRows keeps an expense-only month with income = 0', () => {
  const rows = buildHistoryRows({
    months: breakdownMonths,
    budgets: historyBudgets,
    incomesByMonth: breakdownIncomes,
  });
  const september = rows.find((row) => row.key === '2026-09');

  assert.ok(september);
  assert.equal(september.income, 0);
  assert.equal(september.inflow, 0);
  assert.equal(september.spent, 900_000);
  assert.equal(september.saved, -900_000);
  assert.equal(september.savedPercent, 0);
  assert.equal(september.incomeCount, 0);
});

test('buildHistoryRows drops a month with neither income nor expense', () => {
  const rows = buildHistoryRows({
    months: [
      ...breakdownMonths,
      { key: '2026-07', spent: 0, count: 0, byCategory: {} },
    ],
    budgets: historyBudgets,
    incomesByMonth: breakdownIncomes,
  });

  assert.equal(rows.some((row) => row.key === '2026-07'), false);
});

test('buildHistoryRows orders newest month first', () => {
  const rows = buildHistoryRows({
    months: breakdownMonths,
    budgets: historyBudgets,
    incomesByMonth: breakdownIncomes,
  });

  assert.deepEqual(
    rows.map((row) => row.key),
    ['2026-10', '2026-09', '2026-08'],
  );
});

test('buildHistoryRows lists categories by spend, largest first', () => {
  const rows = buildHistoryRows({
    months: breakdownMonths,
    budgets: historyBudgets,
    incomesByMonth: breakdownIncomes,
  });
  const october = rows.find((row) => row.key === '2026-10');

  assert.deepEqual(
    october.categories.map((category) => category.id),
    ['food', 'home'],
  );
  // Categories with no spending in that month are left out of the breakdown.
  assert.equal(october.categories.length, 2);
});

test('buildHistoryRows coerces junk income rows to zero', () => {
  const rows = buildHistoryRows({
    months: [{ key: '2026-10', spent: 100_000, count: 1, byCategory: { food: 100_000 } }],
    budgets: historyBudgets,
    incomesByMonth: { '2026-10': [{ amount: 'abc' }, { amount: '250000' }, null] },
  });

  assert.equal(rows[0].income, 250_000);
  assert.equal(rows[0].saved, 150_000);
  assert.equal(rows[0].incomeCount, 3);
});

test('buildHistoryRows survives no arguments, nulls and a missing breakdown', () => {
  assert.deepEqual(buildHistoryRows(), []);
  assert.deepEqual(buildHistoryRows(null), []);
  assert.deepEqual(buildHistoryRows(undefined), []);
  // Expense-only months still qualify when no income breakdown was supplied;
  // the all-zero 2026-08 bucket does not.
  assert.deepEqual(
    buildHistoryRows({ months: breakdownMonths }).map((row) => row.key),
    ['2026-10', '2026-09'],
  );
  assert.deepEqual(buildHistoryRows({ incomesByMonth: breakdownIncomes }), [
    {
      key: '2026-10',
      income: 1_500_000,
      inflow: 1_500_000,
      spent: 0,
      saved: 1_500_000,
      savedPercent: 100,
      incomeCount: 2,
      categories: [],
    },
    {
      key: '2026-08',
      income: 4_000_000,
      inflow: 4_000_000,
      spent: 0,
      saved: 4_000_000,
      savedPercent: 100,
      incomeCount: 1,
      categories: [],
    },
  ]);
});
