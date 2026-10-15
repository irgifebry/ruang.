export const AMOUNT_MAX = 999_999_999_999;
export const BUDGET_COLORS = new Set(['lime', 'blue', 'orange', 'violet', 'pink']);

export function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function validId(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function validAmount(value, allowZero = false) {
  return (typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value))) &&
    Number.isSafeInteger(Number(value)) &&
    (allowZero ? Number(value) >= 0 : Number(value) > 0) && Number(value) <= AMOUNT_MAX;
}

export function validDate(value, firstOfMonth = false) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value &&
    (!firstOfMonth || value.endsWith('-01'));
}

export function validExpense(input) {
  return isRecord(input) && validId(input.categoryId) &&
    typeof input.description === 'string' && input.description.trim().length > 0 &&
    input.description.trim().length <= 80 && validAmount(input.amount) && validDate(input.spentOn);
}

/**
 * An income row. No category, because `budgets` is an envelope table and
 * nothing about a monthly limit applies to money coming in.
 *
 * `source` is the one optional field in the whole ledger, so it is the one that
 * has to be checked in both directions: `undefined` means "the form never
 * offered it", but a number, an object or a 41-character string is the client
 * sending something the row cannot store.
 */
export function validIncome(input) {
  if (!isRecord(input)) return false;
  const sourceOk = input.source === undefined || input.source === null ||
    (typeof input.source === 'string' && input.source.trim().length <= 40);
  return sourceOk && typeof input.description === 'string' && input.description.trim().length > 0 &&
    input.description.trim().length <= 80 && validAmount(input.amount) && validDate(input.receivedOn);
}

export function validBudget(input) {
  return isRecord(input) && typeof input.name === 'string' &&
    input.name.trim().length > 0 && input.name.trim().length <= 60 &&
    validAmount(input.monthlyLimit, true) && BUDGET_COLORS.has(input.color);
}

export function validMonths(value) {
  return Number.isInteger(value) && value >= 1 && value <= 120;
}
