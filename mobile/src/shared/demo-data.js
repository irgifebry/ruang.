/**
 * The guest demo ledger — the shape `/api/ledger` returns, built entirely from
 * the local sample figures. No account, no token, no request: everything here
 * is pure so `tests/demo-data.test.mjs` can drive it under `node --test`.
 *
 * The sample rows are fixed to October 2026 (they are pinned against the web
 * copy). Left alone, a visitor in any other month would see empty Ringkasan
 * and Riwayat screens, so the day of month is kept but the month is always the
 * one being viewed. The source arrays are never mutated — a second call for a
 * different month builds fresh objects.
 */

import { monthKey, toDate, todayISO } from './money.js';
import { initialBudgets, initialExpenses, initialIncomes } from './sample-data.js';

const DEMO_USER_ID = 'demo';

/** Keeps the sample's day of month, capped at the reference date's own day. */
function remapDate(value, month, maxDay) {
  const day = Math.min(Math.max(Number(String(value).slice(-2)) || 1, 1), maxDay);
  return `${month}-${String(day).padStart(2, '0')}`;
}

/**
 * Builds `{ profile, budgets, expenses, incomes }` for one month.
 *
 * `now` is injectable so the remapping is testable without waiting for a real
 * month change. An invalid date falls back to today (`todayISO()` parsed as a
 * local date, not as UTC midnight) rather than producing `NaN` keys.
 */
export function buildDemoData(now = new Date()) {
  const reference = Number.isNaN(now?.getTime?.()) ? toDate(todayISO()) : now;
  const month = monthKey(reference);
  const stamp = `${month}-01T00:00:00.000Z`;
  const maxDay = reference.getDate();

  const budgets = initialBudgets.map((budget) => ({
    ...budget,
    monthly_limit: Number(budget.monthly_limit),
    user_id: DEMO_USER_ID,
    created_at: stamp,
  }));
  const byId = new Map(budgets.map((budget) => [budget.id, budget]));

  // The ledger API joins `budgets` onto each expense as
  // `{ id, name, color }`; several screens read that nested object directly.
  const expenses = initialExpenses.map((expense) => {
    const budget = byId.get(expense.category_id);
    return {
      ...expense,
      amount: Number(expense.amount),
      spent_on: remapDate(expense.spent_on, month, maxDay),
      user_id: DEMO_USER_ID,
      created_at: stamp,
      budgets: budget ? { id: budget.id, name: budget.name, color: budget.color } : null,
    };
  });

  const incomes = initialIncomes.map((income) => ({
    ...income,
    source: income.source || null,
    amount: Number(income.amount),
    received_on: remapDate(income.received_on, month, maxDay),
    user_id: DEMO_USER_ID,
    created_at: stamp,
  }));

  // The profile carries the same keys the Profile screen reads from the real
  // ledger response; nulls mean "no upload / no pending deletion".
  const profile = {
    id: DEMO_USER_ID,
    user_id: DEMO_USER_ID,
    name: 'Tamu demo',
    theme: 'system',
    avatar_path: null,
    provider_image: null,
    deletion_requested_at: null,
  };

  return { profile, budgets, expenses, incomes };
}

/**
 * History asks `/api/ledger` for `fetchMonthlyBreakdown`, which answers
 * `{ budgets, byMonth, incomesByMonth }` — not the full-ledger shape the other
 * tabs get. The guest never makes that request, so the same sample rows are
 * bucketed here by the shared `monthKey`, exactly as the API would. Nothing is
 * re-valued or re-dated: this only changes the envelope around the rows.
 */
export function buildDemoHistoryPayload({ budgets = [], expenses = [], incomes = [] } = {}) {
  const byMonth = {};
  const incomesByMonth = {};
  for (const expense of expenses) {
    const key = monthKey(expense.spent_on);
    if (!key) continue;
    if (!byMonth[key]) byMonth[key] = [];
    byMonth[key].push(expense);
  }
  for (const income of incomes) {
    const key = monthKey(income.received_on);
    if (!key) continue;
    if (!incomesByMonth[key]) incomesByMonth[key] = [];
    incomesByMonth[key].push(income);
  }
  return { budgets, byMonth, incomesByMonth };
}
