/**
 * Form validation for the ledger, in the same words the web uses.
 *
 * These are the pure tail of the web `src/lib/ledger.js`: they validate a form
 * and return an `{ field: message }` map, with no network call and no session
 * lookup. The web keeps them beside `fetch`/`callLedger`; here they live on
 * their own so the native screens can share the messages without inheriting an
 * HTTP client.
 */

import { toNumber } from './money.js';
import { AMOUNT_MAX } from './ledger-validation.js';

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

/**
 * How many transactions a category still holds. Removing a category archives
 * it, so this is what the confirmation shows before the row disappears from
 * the pickers.
 */
export function countExpensesIn(expenses, categoryId) {
  return expenses.filter((expense) => expense.category_id === categoryId).length;
}
