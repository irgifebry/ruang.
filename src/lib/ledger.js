/**
 * Every read and write against Postgres goes through this module.
 * Centralising here keeps validation and consistent formatting clean.
 */

import { ratioPercent, toNumber, toPositive } from './money.js';
import { AMOUNT_MAX } from './ledger-validation.js';
import { getSharedSession } from './auth-client.js';

/** Thrown for anything the user should see a message about, not a stack trace. */
export class DataError extends Error {}

async function callLedger(action, payload = {}) {
  const res = await fetch('/api/ledger', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new DataError(data.error || 'Terjadi kesalahan.');
  }
  return data;
}

/** Resolves the signed-in user id, or throws if there is no session. */
export async function requireUserId() {
  const { data } = await getSharedSession();
  if (!data?.user) {
    throw new DataError('Sesi tidak ditemukan. Silakan masuk kembali.');
  }
  return data.user.id;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function fetchLedger() {
  return callLedger('fetchLedger');
}

/**
 * One row per month for the history page.
 *
 * A month qualifies once it has money in *or* money out — an untouched month
 * must not fill the list with zero rows. There is no second funding source to
 * carry forward: the whole inflow for a month is the sum of its income rows,
 * so an income-only month is a complete statement with `spent = 0`.
 *
 * `months` is the breakdown from `fetchMonthlyBreakdown`; its keys are already
 * the union of income and expense months. `incomesByMonth` is read as well so a
 * caller that hands over only expense buckets still gets the income months.
 */
export function buildHistoryRows(data) {
  const source = data !== null && typeof data === 'object' ? data : {};
  const months = Array.isArray(source.months) ? source.months : [];
  const budgets = Array.isArray(source.budgets) ? source.budgets : [];
  const incomesByMonth =
    source.incomesByMonth !== null && typeof source.incomesByMonth === 'object' &&
    !Array.isArray(source.incomesByMonth)
      ? source.incomesByMonth
      : {};

  const incomeRowsByMonth = new Map(
    Object.entries(incomesByMonth).map(([key, rows]) => [
      key,
      Array.isArray(rows) ? rows : [],
    ]),
  );
  const incomeByMonth = new Map(
    [...incomeRowsByMonth].map(([key, rows]) => [
      key,
      rows.reduce((sum, row) => sum + toPositive(row?.amount), 0),
    ]),
  );

  const monthByKey = new Map(months.map((month) => [month?.key, month]));
  const keys = new Set([...monthByKey.keys(), ...incomeByMonth.keys()]);

  const rows = [];
  for (const key of keys) {
    const month = monthByKey.get(key) ?? { key, spent: 0, count: 0, byCategory: {} };
    const spent = toPositive(month?.spent);
    const income = incomeByMonth.get(key) ?? 0;
    // An empty bucket with no money either way is a month nobody touched.
    if (income <= 0 && spent <= 0) continue;

    const monthIncomes = incomeRowsByMonth.get(key) ?? [];
    const byCategory = month?.byCategory !== null && typeof month?.byCategory === 'object'
      ? month.byCategory
      : {};

    rows.push({
      key,
      income,
      inflow: income,
      spent,
      saved: income - spent,
      savedPercent: ratioPercent(income - spent, income),
      incomeCount: monthIncomes.length,
      categories: budgets
        .map((budget) => ({ ...budget, spent: toPositive(byCategory[budget?.id]) }))
        .filter((category) => category.spent > 0)
        .sort((a, b) => b.spent - a.spent),
    });
  }

  return rows.sort((a, b) => b.key.localeCompare(a.key));
}

/**
 * Budgets, monthly spending and monthly income over the last `months` months.
 *
 * `months` contains a bucket for every month that has an expense *or* an
 * income. An income-only month still gets `{ spent: 0, count: 0, byCategory:
 * {} }`, so `buildHistoryRows` can show it as a full statement instead of
 * silently dropping it. `incomesByMonth` is also returned raw, because the
 * history needs the individual entries for the count and the breakdown.
 */
export async function fetchMonthlyBreakdown(supabaseOrMonths, maybeMonths = 12) {
  const months = typeof supabaseOrMonths === 'number' ? supabaseOrMonths : maybeMonths;
  const { budgets = [], byMonth = {}, incomesByMonth = {} } = await callLedger('fetchMonthlyBreakdown', {
    months,
  });

  const buckets = {};
  const keys = new Set([...Object.keys(byMonth ?? {}), ...Object.keys(incomesByMonth ?? {})]);
  for (const key of keys) {
    const expenses = Array.isArray(byMonth?.[key]) ? byMonth[key] : [];
    buckets[key] = { key, spent: 0, count: 0, byCategory: {} };
    for (const exp of expenses) {
      const amount = toPositive(exp.amount);
      buckets[key].spent += amount;
      buckets[key].count += 1;
      buckets[key].byCategory[exp.category_id] =
        (buckets[key].byCategory[exp.category_id] ?? 0) + amount;
    }
  }

  return {
    budgets,
    months: Object.values(buckets).sort((a, b) => b.key.localeCompare(a.key)),
    incomesByMonth,
  };
}

// ---------------------------------------------------------------------------
// Writes: expenses
// ---------------------------------------------------------------------------

export function validateExpense({ description, amount, categoryId, spentOn }, budgets = []) {
  const errors = {};
  const name = String(description ?? '').trim();

  if (!name) {
    errors.description = 'Isi nama pengeluaran.';
  } else if (name.length > 80) {
    errors.description = 'Maksimal 80 karakter.';
  }

  const raw = String(amount ?? '').trim();
  if (!raw) {
    errors.amount = 'Isi nominal pengeluaran.';
  } else if (!/^\d+$/.test(raw)) {
    errors.amount = 'Nominal harus angka bulat tanpa tanda baca.';
  } else if (toNumber(raw) <= 0) {
    errors.amount = 'Nominal harus lebih besar dari nol.';
  } else if (toNumber(raw) > AMOUNT_MAX) {
    errors.amount = 'Nominal terlalu besar.';
  }

  if (!categoryId) {
    errors.categoryId = 'Pilih kategori.';
  } else if (!budgets.some((budget) => budget.id === categoryId)) {
    errors.categoryId = 'Kategori tidak ditemukan.';
  }

  if (!spentOn) {
    errors.spentOn = 'Pilih tanggal.';
  } else if (
    !/^\d{4}-\d{2}-\d{2}$/.test(spentOn) ||
    Number.isNaN(new Date(spentOn).getTime()) ||
    new Date(spentOn).toISOString().slice(0, 10) !== spentOn
  ) {
    errors.spentOn = 'Tanggal tidak valid.';
  }

  return errors;
}

export async function createExpense(arg1, arg2) {
  const input = arg2 !== undefined ? arg2 : arg1;
  return callLedger('createExpense', { input });
}

export async function updateExpense(arg1, arg2, arg3) {
  const id = arg3 !== undefined ? arg2 : arg1;
  const input = arg3 !== undefined ? arg3 : arg2;
  return callLedger('updateExpense', { id, input });
}

export async function deleteExpense(arg1, arg2) {
  const id = arg2 !== undefined ? arg2 : arg1;
  return callLedger('deleteExpense', { id });
}

// ---------------------------------------------------------------------------
// Writes: incomes
//
// Income has no category — `budgets` is an envelope table and a monthly limit
// means nothing for money arriving — so these three carry a `source` instead of
// a `categoryId` and the amount is never checked against any cap.
// ---------------------------------------------------------------------------

/**
 * Validates an income form.
 *
 * `source` is optional, and an all-whitespace one is treated as absent rather
 * than as an error: the label is optional by design, and a user who typed a
 * space and then thought better should not be told they did something wrong.
 */
export function validateIncome({ description, amount, source, receivedOn }) {
  const errors = {};
  const name = String(description ?? '').trim();

  if (!name) {
    errors.description = 'Isi nama pemasukan.';
  } else if (name.length > 80) {
    errors.description = 'Maksimal 80 karakter.';
  }

  const raw = String(amount ?? '').trim();
  if (!raw) {
    errors.amount = 'Isi nominal pemasukan.';
  } else if (!/^\d+$/.test(raw)) {
    errors.amount = 'Nominal harus angka bulat tanpa tanda baca.';
  } else if (toNumber(raw) <= 0) {
    errors.amount = 'Nominal harus lebih besar dari nol.';
  } else if (toNumber(raw) > AMOUNT_MAX) {
    errors.amount = 'Nominal terlalu besar.';
  }

  const cleanSource = String(source ?? '').trim();
  if (cleanSource.length > 40) {
    errors.source = 'Maksimal 40 karakter.';
  }

  if (!receivedOn) {
    errors.receivedOn = 'Pilih tanggal.';
  } else if (
    !/^\d{4}-\d{2}-\d{2}$/.test(receivedOn) ||
    Number.isNaN(new Date(receivedOn).getTime()) ||
    new Date(receivedOn).toISOString().slice(0, 10) !== receivedOn
  ) {
    errors.receivedOn = 'Tanggal tidak valid.';
  }

  return errors;
}

export async function createIncome(arg1, arg2) {
  const input = arg2 !== undefined ? arg2 : arg1;
  return callLedger('createIncome', { input });
}

export async function updateIncome(arg1, arg2, arg3) {
  const id = arg3 !== undefined ? arg2 : arg1;
  const input = arg3 !== undefined ? arg3 : arg2;
  return callLedger('updateIncome', { id, input });
}

export async function deleteIncome(arg1, arg2) {
  const id = arg2 !== undefined ? arg2 : arg1;
  return callLedger('deleteIncome', { id });
}

// ---------------------------------------------------------------------------
// Writes: budgets
// ---------------------------------------------------------------------------

export const BUDGET_COLORS = ['lime', 'blue', 'orange', 'violet', 'pink'];

export function validateBudget({ name, monthlyLimit }, { budgets = [], ignoreId = null } = {}) {
  const errors = {};
  const clean = String(name ?? '').trim();

  if (!clean) {
    errors.name = 'Isi nama kategori.';
  } else if (clean.length > 60) {
    errors.name = 'Maksimal 60 karakter.';
  } else {
    const clash = budgets.some(
      (budget) => budget.id !== ignoreId && budget.name.trim().toLowerCase() === clean.toLowerCase(),
    );
    if (clash) errors.name = 'Kategori dengan nama itu sudah ada.';
  }

  const raw = String(monthlyLimit ?? '').trim();
  if (raw === '') {
    errors.monthlyLimit = 'Isi batas bulanan.';
  } else if (!/^\d+$/.test(raw)) {
    errors.monthlyLimit = 'Batas harus angka bulat tanpa tanda baca.';
  } else if (toNumber(raw) > AMOUNT_MAX) {
    errors.monthlyLimit = 'Batas terlalu besar.';
  }

  return errors;
}

export async function createBudget(arg1, arg2) {
  const input = arg2 !== undefined ? arg2 : arg1;
  return callLedger('createBudget', { input });
}

export async function updateBudget(arg1, arg2, arg3) {
  const id = arg3 !== undefined ? arg2 : arg1;
  const input = arg3 !== undefined ? arg3 : arg2;
  return callLedger('updateBudget', { id, input });
}

export async function deleteBudget(arg1, arg2) {
  const id = arg2 !== undefined ? arg2 : arg1;
  return callLedger('deleteBudget', { id });
}

export function countExpensesIn(expenses, categoryId) {
  return expenses.filter((expense) => expense.category_id === categoryId).length;
}

// ---------------------------------------------------------------------------
// Writes: profile
// ---------------------------------------------------------------------------

export async function updateProfile(arg1, arg2) {
  const patch = arg2 !== undefined ? arg2 : arg1;
  return callLedger('updateProfile', { patch });
}
