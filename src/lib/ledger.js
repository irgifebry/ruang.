/**
 * Every read and write against Postgres goes through this module.
 * Centralising here keeps validation and consistent formatting clean.
 */

import {
  currentMonthKey,
  monthEnd,
  monthKey,
  monthStart,
  ratioPercent,
  shiftMonth,
  toNumber,
  toPositive,
  todayISO,
} from './money.js';
import { getSession } from './auth-client.js';

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
  const { data } = await getSession();
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
 * A month qualifies once its salary has been *saved* — that has always been the
 * rule, and it is what keeps an untouched month from filling the list with rows
 * the user never entered anything into. Income recorded without a salary does
 * not promote a month into the history for the same reason: the history is a
 * per-month statement, and without a salary the row has no funding to report.
 *
 * `saved` is now measured against the month's whole inflow (salary plus every
 * income row dated in it) rather than the salary alone. `salary` and `income`
 * are both returned so the page can show the breakdown.
 */
export function buildHistoryRows(data) {
  const { salaryRows = [], months = [], budgets = [], incomesByMonth = {} } = data ?? {};
  const salaryByMonth = new Map(
    salaryRows
      .map((row) => [row.month, toPositive(row.salary)])
      .filter(([, salary]) => salary > 0),
  );

  return months
    .filter((month) => salaryByMonth.has(`${month.key}-01`))
    .map((month) => {
      const salary = salaryByMonth.get(`${month.key}-01`);
      const spent = month.spent;
      const monthIncomes = incomesByMonth[month.key] ?? [];
      const income = monthIncomes.reduce((sum, row) => sum + toPositive(row?.amount), 0);
      const inflow = salary + income;

      return {
        ...month,
        salary,
        income,
        inflow,
        spent,
        incomeCount: monthIncomes.length,
        saved: inflow - spent,
        savedPercent: ratioPercent(inflow - spent, inflow),
        categories: budgets
          .map((budget) => ({ ...budget, spent: month.byCategory[budget.id] ?? 0 }))
          .filter((category) => category.spent > 0)
          .sort((a, b) => b.spent - a.spent),
      };
    })
    .sort((a, b) => b.key.localeCompare(a.key));
}

export async function fetchSalaryHistory(supabaseOrMonths, maybeMonths = 12) {
  const months = typeof supabaseOrMonths === 'number' ? supabaseOrMonths : maybeMonths;
  const data = await callLedger('fetchSalaryHistory', { months });
  return (data ?? []).map((row) => ({
    key: row.key,
    month: row.month,
    salary: toPositive(row.amount),
  }));
}

/**
 * Budgets, monthly spending and monthly income over the last `months` months.
 *
 * `months` only ever contains buckets built from spending, which is what the
 * history list is made of. A month with income in it and no expenses at all
 * therefore has no bucket, and `buildHistoryRows` drops it for the same reason
 * it drops a month with no saved salary: nothing to compare the inflow against.
 * `incomesByMonth` is returned raw for exactly that reason — the bucket shape is
 * about spending, and a bucket-per-month for income would be a second, emptier
 * shape for the same key.
 */
export async function fetchMonthlyBreakdown(supabaseOrMonths, maybeMonths = 12) {
  const months = typeof supabaseOrMonths === 'number' ? supabaseOrMonths : maybeMonths;
  const { budgets = [], byMonth = {}, incomesByMonth = {} } = await callLedger('fetchMonthlyBreakdown', {
    months,
  });

  const buckets = {};
  for (const [key, expenses] of Object.entries(byMonth)) {
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

export async function fetchSalaryRecords() {
  const data = await callLedger('fetchSalaryHistory', { months: 100 });
  return (data ?? [])
    .map((row) => ({
      key: row.key,
      month: row.month,
      amount: toPositive(row.amount),
      updatedAt: row.updatedAt ?? null,
    }))
    .filter((row) => row.amount > 0);
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
  } else if (toNumber(raw) > 1_000_000_000_000) {
    errors.amount = 'Nominal terlalu besar.';
  }

  if (!categoryId) {
    errors.categoryId = 'Pilih kategori.';
  } else if (!budgets.some((budget) => budget.id === categoryId)) {
    errors.categoryId = 'Kategori tidak ditemukan.';
  }

  if (!spentOn) {
    errors.spentOn = 'Pilih tanggal.';
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(spentOn) || Number.isNaN(new Date(spentOn).getTime())) {
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
  } else if (toNumber(raw) > 1_000_000_000_000) {
    errors.amount = 'Nominal terlalu besar.';
  }

  const cleanSource = String(source ?? '').trim();
  if (cleanSource.length > 40) {
    errors.source = 'Maksimal 40 karakter.';
  }

  if (!receivedOn) {
    errors.receivedOn = 'Pilih tanggal.';
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(receivedOn) || Number.isNaN(new Date(receivedOn).getTime())) {
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

export function validateBudget({ name, monthlyLimit }, { budgets = [], ignoreId = null, salary = 0 } = {}) {
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
  } else if (toNumber(raw) > 1_000_000_000_000) {
    errors.monthlyLimit = 'Batas terlalu besar.';
  }

  if (salary > 0 && toNumber(raw) > 0) {
    const otherBudgetsTotal = budgets
      .filter((b) => b.id !== ignoreId)
      .reduce((sum, b) => sum + toNumber(b.monthly_limit ?? b.limit ?? 0), 0);
    const newTotal = otherBudgetsTotal + toNumber(raw);
    if (newTotal > salary) {
      errors.monthlyLimit = `Total anggaran (${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(newTotal)}) melebihi gaji (${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(salary)}). Kurangi batas atau tambah gaji di tab Pemasukan.`;
    }
  }

  return errors;
}

export function validateSalary(value) {
  const raw = String(value ?? '').trim();
  if (raw === '') return 'Isi gaji dengan angka nol atau lebih.';
  if (!/^\d+$/.test(raw)) return 'Gaji harus angka bulat tanpa tanda baca.';
  if (toNumber(raw) > 1_000_000_000_000) return 'Gaji terlalu besar.';
  return null;
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
// Writes: salary
// ---------------------------------------------------------------------------

export async function saveSalary(arg1, arg2, arg3) {
  const month = arg3 !== undefined ? arg2 : arg1;
  const amount = arg3 !== undefined ? arg3 : arg2;
  return callLedger('saveSalary', { month: monthStart(month), amount: toPositive(amount) });
}

// ---------------------------------------------------------------------------
// Writes: profile
// ---------------------------------------------------------------------------

export async function updateProfile(arg1, arg2) {
  const patch = arg2 !== undefined ? arg2 : arg1;
  return callLedger('updateProfile', { patch });
}
