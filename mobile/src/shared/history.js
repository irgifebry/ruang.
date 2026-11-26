/**
 * One row per month for the history screen.
 *
 * Extracted verbatim from the web `src/lib/ledger.js`, where it sits among the
 * network calls. Only the pure function is ported — no `fetch`, no auth client
 * — so the native history tab and the web page qualify months by the same rules
 * and can never disagree about which month belongs in the list.
 */

import { ratioPercent, toPositive } from './money.js';

/**
 * Turn the `/api/ledger` `fetchMonthlyBreakdown` response into history rows.
 *
 * The API answers `{ budgets, byMonth, incomesByMonth }`: `byMonth` is a map of
 * raw expense rows, while `buildHistoryRows` wants the bucketed `months`
 * array that the web's `fetchMonthlyBreakdown` returns. This is that one
 * missing step, kept pure and next to the function it feeds so a native screen
 * cannot quietly disagree with the web page about which month has what.
 *
 * A payload already carrying `months` (the web-shaped one) is passed through.
 * Otherwise buckets are built from the union of `byMonth` and
 * `incomesByMonth` keys, exactly like the web's `fetchMonthlyBreakdown`: an
 * income-only month gets a zero bucket rather than disappearing from the list.
 */
export function buildHistoryData(payload) {
  const source = payload !== null && typeof payload === 'object' ? payload : {};
  const byMonth =
    source.byMonth !== null && typeof source.byMonth === 'object' && !Array.isArray(source.byMonth)
      ? source.byMonth
      : {};
  const incomesByMonth =
    source.incomesByMonth !== null && typeof source.incomesByMonth === 'object' &&
    !Array.isArray(source.incomesByMonth)
      ? source.incomesByMonth
      : {};

  const months = Array.isArray(source.months)
    ? source.months
    : [...new Set([...Object.keys(byMonth), ...Object.keys(incomesByMonth)])].map((key) => {
        const rows = byMonth[key];
        const expenses = Array.isArray(rows) ? rows : [];
        const byCategory = {};
        let spent = 0;
        for (const expense of expenses) {
          const amount = toPositive(expense?.amount);
          spent += amount;
          const categoryId = expense?.category_id;
          byCategory[categoryId] = (byCategory[categoryId] ?? 0) + amount;
        }
        // An income-only month still gets a zero bucket: it is a complete
        // statement with spent = 0, not a month missing from the list.
        return { key, spent, count: expenses.length, byCategory };
      });

  const rows = buildHistoryRows({ ...source, months, incomesByMonth });

  // `buildHistoryRows` deliberately owns the money figures, not the raw
  // transaction count. The month rows show "{count} transaksi" though, so the
  // count is attached here from the same buckets instead of letting the screen
  // print "undefined transaksi" (which the web page currently does).
  const bucketByKey = new Map(months.map((month) => [month?.key, month]));
  return rows.map((row) => ({
    ...row,
    count: toPositive(bucketByKey.get(row.key)?.count),
  }));
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
