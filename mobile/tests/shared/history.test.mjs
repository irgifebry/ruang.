import test from 'node:test';
import assert from 'node:assert/strict';

import { buildHistoryData } from '../../src/shared/history.js';

const budgets = [
  { id: 'food', name: 'Makan', monthly_limit: 1_000_000, color: 'lime' },
  { id: 'home', name: 'Rumah', monthly_limit: 2_000_000, color: 'blue' },
];

// Exactly what `/api/ledger` answers for `fetchMonthlyBreakdown`: expense rows
// bucketed by month (only the income-only month gets an empty bucket), plus the
// income rows and the active categories.
const breakdown = {
  budgets,
  byMonth: {
    '2026-09': [
      { category_id: 'food', amount: 400_000 },
      { category_id: 'food', amount: 300_000 },
      { category_id: 'home', amount: 500_000 },
    ],
    '2026-10': [], // income-only month, the API inserts this empty bucket
  },
  incomesByMonth: {
    '2026-10': [{ amount: 1_500_000 }, { amount: 500_000 }],
  },
};

test('buildHistoryData buckets the API expense rows into month statements', () => {
  const rows = buildHistoryData(breakdown);
  assert.deepEqual(rows.map((row) => row.key), ['2026-10', '2026-09']);

  const september = rows.find((row) => row.key === '2026-09');
  assert.equal(september.income, 0);
  assert.equal(september.spent, 1_200_000);
  assert.equal(september.saved, -1_200_000);
  assert.equal(september.count, 3);
  assert.deepEqual(
    september.categories.map((category) => [category.id, category.spent]),
    [['food', 700_000], ['home', 500_000]],
  );
});

test('buildHistoryData keeps an income-only month with no expenses', () => {
  const october = buildHistoryData(breakdown).find((row) => row.key === '2026-10');
  assert.equal(october.income, 2_000_000);
  assert.equal(october.inflow, 2_000_000);
  assert.equal(october.incomeCount, 2);
  assert.equal(october.spent, 0);
  assert.equal(october.count, 0);
  assert.deepEqual(october.categories, []);
});

test('buildHistoryData builds a bucket for an income-only month with no byMonth key', () => {
  // A partial API response can omit the empty expense bucket. Mirroring the
  // web's fetchMonthlyBreakdown, the month keys come from the union of both
  // maps, so the income month still becomes a complete statement.
  const rows = buildHistoryData({
    budgets,
    byMonth: { '2026-09': [{ category_id: 'food', amount: 400_000 }] },
    incomesByMonth: { '2026-10': [{ amount: 1_500_000 }] },
  });

  assert.deepEqual(rows.map((row) => row.key), ['2026-10', '2026-09']);
  const october = rows.find((row) => row.key === '2026-10');
  assert.equal(october.income, 1_500_000);
  assert.equal(october.spent, 0);
  assert.equal(october.count, 0);
  assert.equal(october.incomeCount, 1);
  assert.deepEqual(october.categories, []);
});

test('buildHistoryData drops a month with neither income nor expense', () => {
  const rows = buildHistoryData({
    ...breakdown,
    byMonth: { ...breakdown.byMonth, '2026-08': [] },
  });
  assert.equal(rows.some((row) => row.key === '2026-08'), false);
});

test('buildHistoryData coerces junk amounts instead of poisoning a total', () => {
  const rows = buildHistoryData({
    budgets,
    byMonth: {
      '2026-10': [
        { category_id: 'food', amount: 'abc' },
        { category_id: 'food', amount: 250_000 },
        null,
      ],
    },
    incomesByMonth: {},
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].spent, 250_000);
  assert.equal(rows[0].count, 3);
  assert.equal(rows[0].categories[0].spent, 250_000);
});

test('buildHistoryData passes through an already bucketed months array', () => {
  const rows = buildHistoryData({
    budgets,
    months: [{ key: '2026-10', spent: 900_000, count: 2, byCategory: { food: 900_000 } }],
    incomesByMonth: { '2026-10': [{ amount: 1_000_000 }] },
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].spent, 900_000);
  assert.equal(rows[0].income, 1_000_000);
});

test('buildHistoryData survives a missing or malformed payload', () => {
  assert.deepEqual(buildHistoryData(), []);
  assert.deepEqual(buildHistoryData(null), []);
  assert.deepEqual(buildHistoryData({ byMonth: null, incomesByMonth: [] }), []);
});
