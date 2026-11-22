import test from 'node:test';
import assert from 'node:assert/strict';

import { formatDigits, getBudgetSummary, getCashflowSummary } from '../src/lib/money.js';
import { cashflowByMonth, cashflowPeak } from '../src/lib/charts.js';
import { buildHistoryRows, validateIncome } from '../src/lib/ledger.js';
import { AMOUNT_MAX, validAmount } from '../src/lib/ledger-validation.js';

const budgets = [
  { id: 'food', name: 'Makan', monthly_limit: 1_000_000, color: 'lime' },
  { id: 'home', name: 'Rumah', monthly_limit: 2_000_000, color: 'blue' },
];

// ---------------------------------------------------------------------------
// getCashflowSummary
// ---------------------------------------------------------------------------

test('getCashflowSummary takes incomes first and reports a negative balance when empty', () => {
  const expenses = [{ category_id: 'food', amount: 400_000 }];
  const base = getBudgetSummary(budgets, expenses);
  const flow = getCashflowSummary([], budgets, expenses);

  assert.equal(flow.income, 0);
  assert.equal(flow.inflow, 0);
  assert.equal(flow.remaining, -400_000);
  assert.equal(flow.spent, 400_000);
  assert.equal(flow.allocated, base.allocated);
  assert.deepEqual(
    flow.categories.map((category) => category.spent),
    base.categories.map((category) => category.spent),
  );
});

test('getCashflowSummary remaining = income − expenses', () => {
  const expenses = [{ category_id: 'food', amount: 400_000 }];
  const incomes = [{ amount: 1_500_000 }, { amount: 500_000 }];
  const flow = getCashflowSummary(incomes, budgets, expenses);

  assert.equal(flow.income, 2_000_000);
  assert.equal(flow.inflow, 2_000_000);
  // 2.000.000 in, 400.000 out.
  assert.equal(flow.remaining, 1_600_000);
  assert.equal(flow.spent, 400_000);
  assert.equal(flow.savedPercent, 80);
  assert.equal('salary' in flow, false);
});

test('getCashflowSummary has no salary argument and keeps budget envelopes independent', () => {
  // The reason the two summaries are separate: a big income must not make an
  // over-budget category look compliant. Only the account-level balance moves.
  const expenses = [{ category_id: 'food', amount: 1_400_000 }];
  const flow = getCashflowSummary([{ amount: 5_000_000 }], budgets, expenses);

  assert.equal(flow.income, 5_000_000);
  assert.equal(flow.inflow, 5_000_000);
  assert.equal(flow.allocated, 3_000_000);
  assert.equal(flow.overBudgetCount, 1);
  assert.equal(flow.categories.find((category) => category.id === 'food').over, true);
  assert.equal(flow.remaining, 3_600_000);
});

test('getCashflowSummary reports a negative balance when spending beats income', () => {
  const flow = getCashflowSummary([{ amount: 500_000 }], budgets, [
    { category_id: 'food', amount: 2_000_000 },
  ]);

  assert.equal(flow.inflow, 500_000);
  assert.equal(flow.remaining, -1_500_000);
  assert.equal(flow.savedPercent, 0);
});

test('getCashflowSummary produces exactly the agreed interface', () => {
  const flow = getCashflowSummary();

  assert.deepEqual(Object.keys(flow).sort(), [
    'allocated', 'categories', 'income', 'inflow', 'overBudgetCount',
    'remaining', 'savedPercent', 'spent',
  ]);
});

test('getCashflowSummary survives junk in every argument', () => {
  const flow = getCashflowSummary('not-an-array', null, undefined);

  assert.equal(flow.income, 0);
  assert.equal(flow.inflow, 0);
  assert.equal(flow.spent, 0);
  assert.equal(flow.remaining, 0);
  assert.equal(flow.savedPercent, 0);
  assert.deepEqual(flow.categories, []);

  // A numeric column arriving as a string is normal, not junk.
  assert.equal(getCashflowSummary([{ amount: '250000' }]).income, 250_000);
  // A negative or malformed income row must not reduce the balance below zero.
  assert.equal(getCashflowSummary([{ amount: -5 }, { amount: 'x' }]).income, 0);
});

test('getCashflowSummary defaults its income array', () => {
  const flow = getCashflowSummary();

  assert.equal(flow.income, 0);
  assert.equal(flow.inflow, 0);
  assert.equal(flow.remaining, 0);
});

// ---------------------------------------------------------------------------
// validateIncome
// ---------------------------------------------------------------------------

test('validateIncome requires a name, an amount and a date', () => {
  assert.deepEqual(validateIncome({ description: 'Bonus', amount: '500000', receivedOn: '2026-10-02' }), {});

  const errors = validateIncome({ description: '   ', amount: '', source: '', receivedOn: '' });
  assert.equal(errors.description, 'Isi nama pemasukan.');
  assert.equal(errors.amount, 'Isi nominal pemasukan.');
  assert.equal(errors.receivedOn, 'Pilih tanggal.');
});

test('validateIncome rejects a name, an amount or a date it cannot store', () => {
  assert.equal(
    validateIncome({ description: 'x'.repeat(81), amount: '1', receivedOn: '2026-10-02' }).description,
    'Maksimal 80 karakter.',
  );
  assert.equal(
    validateIncome({ description: 'Bonus', amount: '1.5', receivedOn: '2026-10-02' }).amount,
    'Nominal harus angka bulat tanpa tanda baca.',
  );
  assert.equal(
    validateIncome({ description: 'Bonus', amount: '1', receivedOn: '2026-13-01' }).receivedOn,
    'Tanggal tidak valid.',
  );
});

test('validateIncome leaves an overlong source as the only error', () => {
  const errors = validateIncome({
    description: 'Bonus',
    amount: '500000',
    source: 'x'.repeat(41),
    receivedOn: '2026-10-02',
  });

  assert.deepEqual(errors, { source: 'Maksimal 40 karakter.' });
});

test('validateIncome treats a missing or blank source as no source at all', () => {
  const base = { description: 'Bonus', amount: '500000', receivedOn: '2026-10-02' };

  assert.deepEqual(validateIncome(base), {});
  assert.deepEqual(validateIncome({ ...base, source: undefined }), {});
  assert.deepEqual(validateIncome({ ...base, source: null }), {});
  assert.deepEqual(validateIncome({ ...base, source: '   ' }), {});
  // 40 characters exactly is the limit, not one past it.
  assert.deepEqual(validateIncome({ ...base, source: 'x'.repeat(40) }), {});
});

test('validateIncome accepts AMOUNT_MAX but rejects one rupiah past it', () => {
  const base = { description: 'Bonus', receivedOn: '2026-10-02' };

  assert.deepEqual(validateIncome({ ...base, amount: String(AMOUNT_MAX) }), {});
  const errors = validateIncome({ ...base, amount: String(AMOUNT_MAX + 1) });
  assert.equal(errors.amount, 'Nominal terlalu besar.');
});

test('validateIncome does not ask for a category', () => {
  // The category is absent from every call and produces no error, which is the
  // whole reason income is not filed under a budget.
  assert.deepEqual(validateIncome({ description: 'Bonus', amount: '1', receivedOn: '2026-10-02' }), {});
});

// ---------------------------------------------------------------------------
// formatDigits
//
// Display-only grouping for the amount field. Every assertion here is about
// what the person sees; the value that reaches validation stays a digit string,
// which is what makes this safe to use in an input.
// ---------------------------------------------------------------------------

test('formatDigits groups thousands the way rupiah is written', () => {
  assert.equal(formatDigits('1250000'), '1.250.000');
  assert.equal(formatDigits('1000'), '1.000');
  assert.equal(formatDigits('100'), '100');
  assert.equal(formatDigits('1'), '1');
  assert.equal(formatDigits('999999999999999'), '999.999.999.999.999');
  assert.equal(formatDigits(''), '');
  assert.equal(formatDigits(null), '');
  assert.equal(formatDigits(undefined), '');
});

test('formatDigits strips what is not a digit instead of rejecting it', () => {
  // A paste of "Rp 12.500", a pasted number with spaces, or a lone separator
  // must land as something the validator can judge — not as text no amount
  // rule can match.
  assert.equal(formatDigits('Rp 12.500'), '12.500');
  assert.equal(formatDigits('1 250 000'), '1.250.000');
  assert.equal(formatDigits('12.500'), '12.500');
  assert.equal(formatDigits('12,500'), '12.500');
  assert.equal(formatDigits('-5000'), '5.000');
  assert.equal(formatDigits('abc'), '');
});

test('formatDigits drops a leading zero but keeps a single one', () => {
  // "007" is 7; "0" alone has to survive, since the amount is not filled in yet
  // and rendering an empty field for a digit the user typed is worse.
  assert.equal(formatDigits('007'), '7');
  assert.equal(formatDigits('0'), '0');
  assert.equal(formatDigits('0001250000'), '1.250.000');
});

test('formatDigits exposes nothing the amount validator would reject', () => {
  // The property that matters: grouping is cosmetic. Strip the separators back
  // off and the result is what would have been typed, so `validAmount` and the
  // database both still receive a plain digit string.
  const typed = '1250000';
  const shown = formatDigits(typed);

  assert.equal(shown, '1.250.000');
  assert.equal(shown.replace(/\./g, ''), typed);
  assert.equal(validAmount(shown.replace(/\./g, '')), true);
});

// ---------------------------------------------------------------------------
// cashflowByMonth
// ---------------------------------------------------------------------------

const expense = (spent_on, amount) => ({ spent_on, amount });
const income = (received_on, amount) => ({ received_on, amount });

test('cashflowByMonth counts income rows as the only inflow', () => {
  const series = cashflowByMonth(
    [income('2026-08-15', 1_000_000), income('2026-08-20', 500_000)],
    [expense('2026-08-03', 2_000_000)],
    '2026-08',
    1,
  );

  assert.equal(series.length, 1);
  assert.equal(series[0].inflow, 1_500_000);
  assert.equal(series[0].outflow, 2_000_000);
  assert.equal(series[0].net, -500_000);
  assert.equal('salary' in series[0], false);
  assert.equal('extra' in series[0], false);
});

test('cashflowByMonth returns a fixed oldest-first window ending at the month', () => {
  const series = cashflowByMonth([], [], '2026-10', 6);

  assert.deepEqual(
    series.map((row) => row.key),
    ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'],
  );
  // A quiet month is a zero row, not a missing one.
  assert.equal(series.length, 6);
  assert.equal(series[0].inflow, 0);
  assert.equal(series[5].net, 0);
});

test('cashflowByMonth keeps rows outside the window out', () => {
  const series = cashflowByMonth(
    [income('2026-01-10', 9_000_000)],
    [expense('2026-04-10', 9_000_000)],
    '2026-10',
    3,
  );

  // The window is Aug–Oct, so the January rows are dropped rather than
  // collapsing the scale.
  assert.deepEqual(series.map((row) => row.key), ['2026-08', '2026-09', '2026-10']);
  assert.equal(series.every((row) => row.inflow === 0 && row.outflow === 0), true);
});

test('cashflowByMonth ignores rows with an unusable date', () => {
  const series = cashflowByMonth(
    [income('bukan tanggal', 1_000_000), income(null, 1_000_000)],
    [expense(undefined, 1_000_000)],
    '2026-10',
    1,
  );

  assert.equal(series[0].inflow, 0);
  assert.equal(series[0].outflow, 0);
});

test('cashflowByMonth survives no arguments and bad ones', () => {
  assert.deepEqual(cashflowByMonth(), []);
  assert.deepEqual(cashflowByMonth([], [], '', 6), []);
  assert.deepEqual(cashflowByMonth([], [], '2026-10', 0), []);
  assert.equal(cashflowByMonth('x', 'y', '2026-10', 3).length, 3);
  assert.equal(cashflowByMonth(null, null, '2026-10', -3).length, 0);
});

// ---------------------------------------------------------------------------
// cashflowPeak
// ---------------------------------------------------------------------------

test('cashflowPeak is the largest bar in either series', () => {
  const series = [
    { inflow: 1_000_000, outflow: 500_000 },
    { inflow: 2_000_000, outflow: 7_000_000 },
    { inflow: 0, outflow: 300_000 },
  ];

  assert.equal(cashflowPeak(series), 7_000_000);
});

test('cashflowPeak is 0 for an empty or all-zero series', () => {
  assert.equal(cashflowPeak(), 0);
  assert.equal(cashflowPeak([]), 0);
  assert.equal(cashflowPeak('not-an-array'), 0);
  assert.equal(cashflowPeak([{ inflow: 0, outflow: 0 }]), 0);
});

test('cashflowPeak coerces string amounts and ignores negatives', () => {
  assert.equal(cashflowPeak([{ inflow: '4.500.000' }]), 0);
  assert.equal(cashflowPeak([{ inflow: '4500000' }]), 4_500_000);
  assert.equal(cashflowPeak([{ inflow: -9_000_000, outflow: -1 }]), 0);
});

// ---------------------------------------------------------------------------
// buildHistoryRows with income
// ---------------------------------------------------------------------------

const spentMonth = (key, spent, byCategory = {}) => ({
  key,
  spent,
  count: spent > 0 ? 1 : 0,
  byCategory,
});

test('buildHistoryRows measures the balance against that month income', () => {
  const rows = buildHistoryRows({
    months: [spentMonth('2026-10', 2_000_000, { food: 2_000_000 })],
    budgets,
    incomesByMonth: { '2026-10': [{ amount: 1_500_000 }, { amount: 500_000 }] },
  });

  assert.equal(rows[0].income, 2_000_000);
  assert.equal(rows[0].inflow, 2_000_000);
  assert.equal(rows[0].spent, 2_000_000);
  assert.equal(rows[0].saved, 0);
  assert.equal(rows[0].incomeCount, 2);
  assert.equal(rows[0].salary, undefined);
});

test('buildHistoryRows keeps a month with income but zero expenses', () => {
  const rows = buildHistoryRows({
    months: [{ key: '2026-10', spent: 0, count: 0, byCategory: {} }],
    budgets,
    incomesByMonth: { '2026-10': [{ amount: 3_000_000 }] },
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].income, 3_000_000);
  assert.equal(rows[0].inflow, 3_000_000);
  assert.equal(rows[0].spent, 0);
  assert.equal(rows[0].saved, 3_000_000);
  assert.equal(rows[0].savedPercent, 100);
});

test('buildHistoryRows keeps a negative month negative', () => {
  const rows = buildHistoryRows({
    months: [spentMonth('2026-10', 2_000_000, { food: 2_000_000 })],
    budgets,
    incomesByMonth: { '2026-10': [{ amount: 250_000 }] },
  });

  assert.equal(rows[0].inflow, 250_000);
  assert.equal(rows[0].saved, -1_750_000);
  assert.equal(rows[0].savedPercent, 0);
});

test('buildHistoryRows ignores an income list for a month with no activity', () => {
  // An income row of zero is junk, and a bucket with no spend and no income
  // must not be carried into the history as a placeholder.
  const rows = buildHistoryRows({
    months: [{ key: '2026-09', spent: 0, count: 0, byCategory: {} }],
    budgets,
    incomesByMonth: { '2026-09': [{ amount: 0 }] },
  });

  assert.deepEqual(rows, []);
});

test('buildHistoryRows coerces junk income rows to zero', () => {
  const rows = buildHistoryRows({
    months: [spentMonth('2026-10', 100_000)],
    budgets,
    incomesByMonth: { '2026-10': [{ amount: 'abc' }, { amount: '250000' }, null] },
  });

  assert.equal(rows[0].income, 250_000);
  assert.equal(rows[0].saved, 150_000);
});
