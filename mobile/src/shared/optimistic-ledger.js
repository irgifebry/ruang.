/**
 * Pure helpers that mirror a successful `/api/ledger` write in the local cache.
 *
 * They build the same row shape the API returns, so the silent refresh that
 * lands a couple of seconds later replaces them without a visible flicker.
 * Nothing here talks to the network or to React — the pages call these with
 * the data they already have, then let `useLedgerData` re-fetch quietly.
 */

const nowISO = () => new Date().toISOString();

function categoryFor(budgets, categoryId) {
  const budget = (Array.isArray(budgets) ? budgets : []).find((b) => b.id === categoryId);
  return budget ? { id: budget.id, name: budget.name, color: budget.color } : null;
}

/** Insert or replace an expense row using the values just accepted by the API. */
export function applyExpenseWrite(data, { id, input, editingId = null }) {
  if (!data) return data;
  const row = {
    id: id ?? editingId,
    user_id: data.profile?.id,
    category_id: input.categoryId,
    description: String(input.description ?? '').trim(),
    amount: Number(input.amount),
    spent_on: input.spentOn,
    created_at: nowISO(),
    budgets: categoryFor(data.budgets, input.categoryId),
  };

  const expenses = editingId
    ? (data.expenses ?? []).map((expense) =>
        expense.id === editingId
          ? { ...expense, ...row, user_id: expense.user_id, created_at: expense.created_at }
          : expense,
      )
    : [row, ...(data.expenses ?? [])];

  return { ...data, expenses };
}

/** Insert or replace an income row. Income has no category, only an optional source. */
export function applyIncomeWrite(data, { id, input, editingId = null }) {
  if (!data) return data;
  const row = {
    id: id ?? editingId,
    user_id: data.profile?.id,
    description: String(input.description ?? '').trim(),
    source: String(input.source ?? '').trim() || null,
    amount: Number(input.amount),
    received_on: input.receivedOn,
    created_at: nowISO(),
  };

  const incomes = editingId
    ? (data.incomes ?? []).map((income) =>
        income.id === editingId
          ? { ...income, ...row, user_id: income.user_id, created_at: income.created_at }
          : income,
      )
    : [row, ...(data.incomes ?? [])];

  return { ...data, incomes };
}

/** A deletion can be aimed at either table; remove from both by id. */
export function removeLedgerRow(data, id) {
  if (!data) return data;
  return {
    ...data,
    expenses: (data.expenses ?? []).filter((row) => row.id !== id),
    incomes: (data.incomes ?? []).filter((row) => row.id !== id),
  };
}

export function applyBudgetWrite(data, { id, input, editingId = null }) {
  if (!data) return data;
  const row = {
    id: id ?? editingId,
    user_id: data.profile?.id,
    name: String(input.name ?? '').trim(),
    monthly_limit: Number(input.monthlyLimit),
    color: input.color,
    created_at: nowISO(),
  };

  const budgets = editingId
    ? (data.budgets ?? []).map((budget) =>
        budget.id === editingId
          ? { ...budget, ...row, user_id: budget.user_id, created_at: budget.created_at }
          : budget,
      )
    : [...(data.budgets ?? []), row];

  return { ...data, budgets };
}

export function removeBudget(data, id) {
  if (!data) return data;
  return { ...data, budgets: (data.budgets ?? []).filter((budget) => budget.id !== id) };
}

export function applyProfileWrite(data, patch) {
  if (!data) return data;
  return { ...data, profile: { ...(data.profile ?? {}), ...patch } };
}
