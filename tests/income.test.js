import test from 'node:test';
import assert from 'node:assert/strict';

import { formatDigits, getBudgetSummary, getCashflowSummary } from '../src/lib/money.js';
import { cashflowByMonth, cashflowPeak } from '../src/lib/charts.js';
import { buildHistoryRows, validateIncome } from '../src/lib/ledger.js';
import { validAmount } from '../src/lib/ledger-validation.js';

const budgets = [
  { id: 'food', name: 'Makan', monthly_limit: 1_000_000, color: 'lime' },
  { id: 'home', name: 'Rumah', monthly_limit: 2_000_000, color: 'blue' },
];

// ---------------------------------------------------------------------------
// getCashflowSummary
// ---------------------------------------------------------------------------

test('getCashflowSummary matches getBudgetSummary when nothing came in', () => {
  const expenses = [{ category_id: 'food', amount: 400_000 }];
  const base = getBudgetSummary(5_000_000, budgets, expenses);
  const flow = getCashflowSummary(5_000_000, [], budgets, expenses);

  assert.equal(flow.remaining, base.remaining);
  assert.equal(flow.inflow, 5_000_000);
  assert.equal(flow.income, 0);
  assert.deepEqual(
    flow.categories.map((category) => category.spent),
    base.categories.map((category) => category.spent),
  );
});

test('getCashflowSummary counts extra income into the balance', () => {
  const expenses = [{ category_id: 'food', amount: 400_000 }];
  const incomes = [{ amount: 1_500_000 }, { amount: 500_000 }];
  const flow = getCashflowSummary(5_000_000, incomes, budgets, expenses);

  assert.equal(flow.income, 2_000_000);
  assert.equal(flow.inflow, 7_000_000);
  // 7.000.000 in, 400.000 out.
  assert.equal(flow.remaining, 6_600_000);
  assert.equal(flow.spent, 400_000);
});

test('getCashflowSummary keeps the budget base on the salary alone', () => {
  // The reason the two functions are separate: a bonus must not make an
  // over-budget category look compliant, and it must not become spendable
  // budget. Only the account-level balance moves.
  const expenses = [{ category_id: 'food', amount: 1_400_000 }];
  const flow = getCashflowSummary(2_000_000, [{ amount: 5_000_000 }], budgets, expenses);

  assert.equal(flow.salary, 2_000_000);
  assert.equal(flow.allocated, 3_000_000);
  assert.equal(flow.overBudgetCount, 1);
  assert.equal(flow.categories.find((category) => category.id === 'food').over, true);
  // …while the balance is positive, because the extra money really is there.
  assert.equal(flow.remaining, 5_600_000);
});

test('getCashflowSummary reports a negative balance when spending beats all inflow', () => {
  const flow = getCashflowSummary(1_000_000, [{ amount: 500_000 }], budgets, [
    { category_id: 'food', amount: 2_000_000 },
  ]);

  assert.equal(flow.inflow, 1_500_000);
  assert.equal(flow.remaining, -500_000);
});

test('getCashflowSummary survives junk in every argument', () => {
  const flow = getCashflowSummary('abc', 'not-an-array', null, undefined);

  assert.equal(flow.salary, 0);
  assert.equal(flow.income, 0);
  assert.equal(flow.inflow, 0);
  assert.equal(flow.remaining, 0);
  assert.equal(flow.savedPercent, 0);
  assert.deepEqual(flow.categories, []);

  // A numeric column arriving as a string is normal, not junk.
  assert.equal(getCashflowSummary('1000000', [{ amount: '250000' }]).income, 250_000);
  // A negative or malformed income row must not reduce the balance below zero.
  assert.equal(getCashflowSummary(1_000_000, [{ amount: -5 }, { amount: 'x' }]).income, 0);
});

test('getCashflowSummary defaults its income array', () => {
  const flow = getCashflowSummary(1_000_000);

  assert.equal(flow.income, 0);
  assert.equal(flow.inflow, 1_000_000);
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

test('validateIncome does not ask for a category', () => {
  // The category is absent from every call and produces no error, which is the
  // whole reason income is not filed under a budget.
  assert.deepEqual(validateIncome({ description: 'Bonus', amount: '1', receivedOn: '2026-10-02' }), {});
});

// ---------------------------------------------------------------------------
// cashflowByMonth
// ---------------------------------------------------------------------------

const expense = (spent_on, amount) => ({ spent_on, amount });
const income = (received_on, amount) => ({ received_on, amount });

test('cashflowByMonth counts salary as part of the inflow', () => {
  const series = cashflowByMonth([], [], [{ key: '2026-08', amount: 5_000_000 }], '2026-08', 1);

  assert.equal(series.length, 1);
  assert.equal(series[0].inflow, 5_000_000);
  assert.equal(series[0].outflow, 0);
  assert.equal(series[0].net, 5_000_000);
  assert.equal(series[0].salary, 5_000_000);
  assert.equal(series[0].extra, 0);
});

test('cashflowByMonth adds income rows on top of the salary', () => {
  const series = cashflowByMonth(
    [income('2026-08-15', 1_000_000), income('2026-08-20', 500_000)],
    [expense('2026-08-03', 2_000_000)],
    [{ key: '2026-08', amount: 5_000_000 }],
    '2026-08',
    1,
  );

  assert.equal(series[0].extra, 1_500_000);
  assert.equal(series[0].inflow, 6_500_000);
  assert.equal(series[0].outflow, 2_000_000);
  assert.equal(series[0].net, 4_500_000);
});

test('cashflowByMonth reads the history page row shape too', () => {
  const series = cashflowByMonth(
    [],
    [],
    [{ month: '2026-08-01', salary: 4_000_000 }],
    '2026-08',
    1,
  );

  assert.equal(series[0].salary, 4_000_000);
  assert.equal(series[0].inflow, 4_000_000);
});

test('cashflowByMonth returns a fixed oldest-first window ending at the month', () => {
  const series = cashflowByMonth([], [], [], '2026-10', 6);

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
    [{ key: '2026-01', amount: 9_000_000 }],
    '2026-10',
    3,
  );

  // The window is Aug–Oct, so the January rows are dropped rather than
  // collapsing the scale.
  assert.deepEqual(series.map((row) => row.key), ['2026-08', '2026-09', '2026-10']);
  assert.equal(series.every((row) => row.inflow === 0 && row.outflow === 0), true);
});

test('cashflowByMonth puts each row in the month its date belongs to', () => {
  const series = cashflowByMonth(
    [income('2026-09-30', 300_000)],
    [expense('2026-10-01', 100_000)],
    [],
    '2026-10',
    2,
  );

  assert.equal(series[0].key, '2026-09');
  assert.equal(series[0].extra, 300_000);
  assert.equal(series[0].outflow, 0);
  assert.equal(series[1].key, '2026-10');
  assert.equal(series[1].outflow, 100_000);
  assert.equal(series[1].extra, 0);
});

test('cashflowByMonth ignores rows with an unusable date', () => {
  const series = cashflowByMonth(
    [income('bukan tanggal', 1_000_000), income(null, 1_000_000)],
    [expense(undefined, 1_000_000)],
    [{ key: '', amount: 5_000_000 }],
    '2026-10',
    1,
  );

  assert.equal(series[0].inflow, 0);
  assert.equal(series[0].outflow, 0);
});

test('cashflowByMonth survives no arguments and bad ones', () => {
  assert.deepEqual(cashflowByMonth(), []);
  assert.deepEqual(cashflowByMonth([], [], [], '', 6), []);
  assert.deepEqual(cashflowByMonth([], [], [], '2026-10', 0), []);
  assert.equal(cashflowByMonth('x', 'y', 'z', '2026-10', 3).length, 3);
  assert.equal(cashflowByMonth(null, null, null, '2026-10', -3).length, 0);
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

  // The outflow bar, not the inflow maximum, so the two rows share one scale.
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
  count: 1,
  byCategory,
});

test('buildHistoryRows measures the balance against salary plus income', () => {
  const rows = buildHistoryRows({
    salaryRows: [{ month: '2026-10-01', salary: 5_000_000 }],
    months: [spentMonth('2026-10', 2_000_000, { food: 2_000_000 })],
    budgets,
    incomesByMonth: { '2026-10': [{ amount: 1_500_000 }, { amount: 500_000 }] },
  });

  assert.equal(rows[0].salary, 5_000_000);
  assert.equal(rows[0].income, 2_000_000);
  assert.equal(rows[0].inflow, 7_000_000);
  assert.equal(rows[0].saved, 5_000_000);
  assert.equal(rows[0].incomeCount, 2);
});

test('buildHistoryRows still produces the old numbers without an income key', () => {
  const rows = buildHistoryRows({
    salaryRows: [{ month: '2026-10-01', salary: 5_000_000 }],
    months: [spentMonth('2026-10', 2_000_000, { food: 2_000_000 })],
    budgets,
  });

  assert.equal(rows[0].income, 0);
  assert.equal(rows[0].inflow, 5_000_000);
  assert.equal(rows[0].saved, 3_000_000);
});

test('buildHistoryRows keeps a negative month negative', () => {
  const rows = buildHistoryRows({
    salaryRows: [{ month: '2026-10-01', salary: 1_000_000 }],
    months: [spentMonth('2026-10', 2_000_000, { food: 2_000_000 })],
    budgets,
    incomesByMonth: { '2026-10': [{ amount: 250_000 }] },
  });

  assert.equal(rows[0].inflow, 1_250_000);
  assert.equal(rows[0].saved, -750_000);
  assert.equal(rows[0].savedPercent, 0);
});

test('buildHistoryRows does not let income pull a month in without a salary', () => {
  // A month qualifies on its saved salary, not on having any activity at all.
  const rows = buildHistoryRows({
    salaryRows: [{ month: '2026-10-01', salary: 5_000_000 }],
    months: [spentMonth('2026-09', 100_000), spentMonth('2026-10', 200_000)],
    budgets,
    incomesByMonth: { '2026-09': [{ amount: 900_000 }] },
  });

  assert.deepEqual(rows.map((row) => row.key), ['2026-10']);
});

test('buildHistoryRows ignores an income list for a month that was not spent', () => {
  // The bucket is built from spending, so a month with income and no expenses
  // has no row to attach the income to.
  const rows = buildHistoryRows({
    salaryRows: [{ month: '2026-10-01', salary: 5_000_000 }],
    months: [spentMonth('2026-10', 200_000)],
    budgets,
    incomesByMonth: { '2026-09': [{ amount: 900_000 }], '2026-10': [{ amount: 100_000 }] },
  });

  assert.equal(rows[0].income, 100_000);
  assert.equal(rows[0].inflow, 5_100_000);
});

test('buildHistoryRows coerces junk income rows to zero', () => {
  const rows = buildHistoryRows({
    salaryRows: [{ month: '2026-10-01', salary: 1_000_000 }],
    months: [spentMonth('2026-10', 100_000)],
    budgets,
    incomesByMonth: { '2026-10': [{ amount: 'abc' }, { amount: '250000' }, null] },
  });

  assert.equal(rows[0].income, 250_000);
});