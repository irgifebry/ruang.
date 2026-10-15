/**
 * Money and date helpers.
 *
 * Everything here is pure and defensive: Supabase returns `numeric` columns as
 * strings, and user input can be `''`, `NaN`, or negative. Each function
 * normalises first so a bad value degrades to `0` instead of poisoning a total.
 */

/** Coerces anything Supabase or a form might hand us into a finite number. */
export function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Clamps to a non-negative number, for amounts that cannot go below zero. */
export function toPositive(value) {
  return Math.max(0, toNumber(value));
}

export const formatIDR = (value) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(toNumber(value));

/**
 * Compact form for headline figures. IDR has no useful short scale, so instead
 * of "12,5 jt" we drop to millions: "Rp 12,5 jt". Keeps the big dashboard
 * numbers from overflowing their box on a phone.
 */
export function formatIDRCompact(value) {
  const amount = toNumber(value);
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);

  if (abs >= 1_000_000_000) return `${sign}Rp ${trimZero((abs / 1_000_000_000).toFixed(1))} M`;
  if (abs >= 1_000_000) return `${sign}Rp ${trimZero((abs / 1_000_000).toFixed(1))} jt`;
  if (abs >= 1_000) return `${sign}Rp ${trimZero((abs / 1_000).toFixed(0))} rb`;
  return formatIDR(amount);
}

function trimZero(value) {
  return value.replace(/[.,]0$/, '').replace('.', ',');
}

/** `12.5` -> `12,5`, matching how the numbers are written in Indonesian. */
export function formatPercent(value) {
  const n = toNumber(value);
  return `${Math.round(n)}%`;
}

/**
 * `'1250000'` -> `'1.250.000'`, for an amount field the user is typing into.
 *
 * A rupiah amount is long enough that a miscounted digit is invisible: typing
 * `1250000` and `1500000` produce fields that look identical in width and
 * differ by a factor of 1.2. Grouping the digits as they are typed is what lets
 * the person check the number against the receipt they are holding.
 *
 * Separators are only ever *display*. The value that reaches validation and the
 * database stays a plain digit string, because `validAmount` and the database
 * `numeric` column both want one — this must not become a parse step.
 *
 * Non-digits are dropped rather than rejected, so a pasted "Rp 12.500" or a
 * stray space lands as something the validator can judge instead of as text no
 * rule can match.
 */
export function formatDigits(value) {
  const digits = String(value ?? '').replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Percentage of `value` against `total`, clamped to 0–100 for progress bars.
 * Returns 0 when the total is 0 so an empty budget never renders as full.
 */
export function ratioPercent(value, total) {
  const t = toNumber(total);
  if (t <= 0) return 0;
  return Math.max(0, Math.min(100, (toNumber(value) / t) * 100));
}

/**
 * How much of the salary has to be left for the balance to still read as
 * comfortable. A quarter, not a half: at 50% remaining the person has already
 * spent half the month on nothing measurable yet, and colouring that amber
 * would cry wolf for the rest of the month.
 */
export const LOW_BALANCE_PERCENT = 25;

/**
 * Severity of a month's balance, in the order the UI escalates:
 *
 *   `over`  — spending beat the salary. Red; the number is negative.
 *   `empty` — the salary is gone but nothing overspent. Amber.
 *   `low`   — under `LOW_BALANCE_PERCENT` of the salary left. Amber.
 *   `ok`    — comfortable. The accent.
 *
 * Split out of the page because four elements colour themselves from it — the
 * figure, the meter fill, the note icon and the note text — and they have to
 * agree. The caller still words each case, so the colour is never the only
 * signal; see the note branches on the dashboard.
 */
export function balanceLevel(remaining, salary) {
  const rest = toNumber(remaining);
  if (rest < 0) return 'over';
  if (rest <= 0) return 'empty';
  if (ratioPercent(rest, salary) <= LOW_BALANCE_PERCENT) return 'low';
  return 'ok';
}

/**
 * The single place the app turns raw rows into the totals the UI renders.
 *
 * `budgets`  — `{ id, name, monthly_limit, color }`
 * `expenses` — `{ category_id, amount, spent_on }`
 *
 * Each category comes back with `spent`, `remaining` (may be negative, which is
 * how the UI detects an overspend) and `percent` (clamped, for the bar).
 *
 * `remaining` here is against the salary alone, and it stays that way on
 * purpose: the per-category limits are capped by `validateBudget` against the
 * salary, so a month that also had a bonus can be over its allocation while
 * still having money left over. Mixing the two here would report a category as
 * overspent because of money that never belonged in its envelope. Use
 * `getCashflowSummary` for the "sisa uang" figure, which is about the account
 * rather than about the budget.
 */
export function getBudgetSummary(salary, budgets = [], expenses = []) {
  const safeSalary = toPositive(salary);
  // `Array.isArray` rather than the parameter default: a default only covers
  // `undefined`, and a page that reads these straight off an API response can
  // hand over a `null` for a key the server omitted. Everything in this module
  // degrades to zero rather than throwing.
  const safeBudgets = (Array.isArray(budgets) ? budgets : []).map((budget) => ({
    ...budget,
    limit: toPositive(budget.monthly_limit ?? budget.limit),
  }));
  const safeExpenses = (Array.isArray(expenses) ? expenses : []).map((expense) => ({
    ...expense,
    amount: toPositive(expense.amount),
  }));

  const spent = safeExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const allocated = safeBudgets.reduce((sum, budget) => sum + budget.limit, 0);

  const categories = safeBudgets.map((budget) => {
    const categorySpent = safeExpenses
      .filter((expense) => expense.category_id === budget.id)
      .reduce((sum, expense) => sum + expense.amount, 0);

    return {
      ...budget,
      spent: categorySpent,
      remaining: budget.limit - categorySpent,
      percent: ratioPercent(categorySpent, budget.limit),
      over: budget.limit > 0 && categorySpent > budget.limit,
    };
  });

  return {
    salary: safeSalary,
    spent,
    remaining: safeSalary - spent,
    allocated,
    unallocated: safeSalary - allocated,
    categories,
    overBudgetCount: categories.filter((category) => category.over).length,
  };
}

/**
 * One month of money: what came in, what went out, what is left.
 *
 * `salary` is the budget base and stays that way. `incomes` is everything else
 * that arrived — a THR, a bonus — and it is added here rather
 * than anywhere else, because this is the only figure that means "money the
 * account actually has". The per-category limits in `getBudgetSummary` are
 * deliberately left measured against the salary alone: they are envelopes
 * funded out of the salary, so a bonus that arrives mid-month does not make an
 * over-budget category suddenly within budget.
 *
 * `salary`, `allocated` and `categories` are passed straight through from
 * `getBudgetSummary` so a caller that needs both reads one object. Only
 * `remaining` is redefined, because "remaining" here means inflow minus spend
 * and there it meant salary minus spend.
 *
 * `incomes` is optional and defaults to empty, so an account created before
 * this feature existed produces the same numbers it always did.
 */
export function getCashflowSummary(salary, incomes = [], budgets = [], expenses = []) {
  const base = getBudgetSummary(salary, budgets, expenses);
  const income = (Array.isArray(incomes) ? incomes : [])
    .reduce((sum, incomeRow) => sum + toPositive(incomeRow?.amount), 0);
  const inflow = base.salary + income;

  return {
    ...base,
    salary: base.salary,
    income,
    inflow,
    remaining: inflow - base.spent,
    savedPercent: ratioPercent(inflow - base.spent, inflow),
  };
}

// ---------------------------------------------------------------------------
// Dates
//
// `spent_on` is a `date` column and arrives as 'YYYY-MM-DD'. Passing that to
// `new Date()` is safe, but any other format is not, so every date goes through
// `toDate` first and is rendered in local time.
// ---------------------------------------------------------------------------

export function toDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string') {
    // Bare 'YYYY-MM-DD' parses as UTC midnight, which lands on the previous day
    // for anyone west of Greenwich. Split it and build a local date instead.
    const bare = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (bare) {
      return new Date(Number(bare[1]), Number(bare[2]) - 1, Number(bare[3]));
    }
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** 'YYYY-MM-DD' for the month containing `date`. Used as the history key. */
export function monthKey(date) {
  const d = toDate(date) ?? new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** The first of the month containing `date`, as 'YYYY-MM-DD'. */
export function monthStart(date) {
  const d = toDate(date) ?? new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/** 'YYYY-MM-DD' for the last day of the month containing `date`. */
export function monthEnd(date) {
  const d = toDate(date) ?? new Date();
  // Built from local parts and formatted by hand. `new Date(y, m + 1, 0)` is
  // local midnight on the last day, and calling `toISOString()` on it shifts to
  // UTC — which rolls back to the previous day for anyone east of Greenwich and
  // would silently exclude the final day of the month from every history query.
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, '0')}-${String(
    lastDay.getDate(),
  ).padStart(2, '0')}`;
}

export function formatDate(value) {
  const d = toDate(value);
  if (!d) return '—';
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(d);
}

export function formatDateLong(value) {
  const d = toDate(value);
  if (!d) return '—';
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
}

/** '2026-09' -> 'September 2026'. */
export function formatMonthLabel(key) {
  const [year, month] = String(key).split('-');
  const d = new Date(Number(year), Number(month) - 1, 1);
  if (Number.isNaN(d.getTime())) return key;
  return new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(d);
}

/**
 * '2026-09' -> 'Sep'. Short enough to sit under a bar in a six-month chart,
 * where the full label would collide with its neighbours.
 */
export function shortMonthLabel(key) {
  const [year, month] = String(key).split('-');
  const d = new Date(Number(year), Number(month) - 1, 1);
  if (Number.isNaN(d.getTime())) return key;
  return new Intl.DateTimeFormat('id-ID', { month: 'short' }).format(d);
}

/** Moves a 'YYYY-MM' key by `delta` months. */
export function shiftMonth(key, delta) {
  const [year, month] = String(key).split('-').map(Number);
  const d = new Date(year, month - 1 + delta, 1);
  return monthKey(d);
}

export function currentMonthKey() {
  return monthKey(new Date());
}

/**
 * A bounded window of 'YYYY-MM' keys around `centerKey`, oldest first.
 *
 * Month pickers need a list to render, and neither "every month ever" nor a
 * free-typing text field is acceptable: one would grow without limit and the
 * other would accept a month that does not exist. Twenty-four months back and
 * twelve forward covers a raise or a resignation either side of the present.
 */
export function monthRange(centerKey, back = 24, forward = 12) {
  const keys = [];
  for (let offset = -back; offset <= forward; offset += 1) {
    keys.push(shiftMonth(centerKey, offset));
  }
  return keys;
}

/** Today as 'YYYY-MM-DD', for date inputs. Avoids `toISOString()` timezone drift. */
export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
