/**
 * Chart geometry and series shaping.
 *
 * The app has no charting dependency and does not need one: the summary page
 * needs a ring of category slices and a row of bars, both of which are shapes we
 * can compute here and hand to plain SVG or plain divs. Doing the maths in a
 * pure module rather than inside a component means the awkward cases — an empty
 * month, a single category, a zero total — are testable without rendering
 * anything.
 *
 * Nothing here imports a component or touches React.
 */

import { monthKey, shiftMonth, shortMonthLabel, toDate, toNumber, toPositive } from './money.js';

/** One full turn, in radians. */
export const TAU = Math.PI * 2;

/** Path data is floats with long tails; two decimals is well under a pixel. */
const round2 = (value) => Math.round(value * 100) / 100;

/** Axis steps, smallest to largest, as multiples of a power of ten. */
const STEPS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

/**
 * A point on a circle.
 *
 * Angle 0 points right and angles grow clockwise on screen, because SVG's y
 * axis points down. Callers offset by `-PI / 2` to start a ring at 12 o'clock.
 */
export function polarToCartesian(cx, cy, radius, angle) {
  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle),
  };
}

/**
 * The `d` for one annular sector — a single donut slice, between two radii.
 *
 * Two cases need special handling that the general arc commands cannot express:
 *
 * - A zero sweep has no geometry at all, so it returns an empty string rather
 *   than a path that renders as a stray dot.
 * - A full circle cannot be drawn as one SVG arc, because an arc from a point
 *   back to that same point is a no-op. It is emitted as two half-turns instead,
 *   with the inner ring wound the opposite way so the hole stays a hole.
 */
export function arcPath({ cx, cy, outerRadius, innerRadius, startAngle, endAngle }) {
  const sweep = endAngle - startAngle;
  if (!Number.isFinite(sweep) || sweep <= 0) return '';

  if (sweep >= TAU - 1e-6) {
    const outer = round2(outerRadius);
    const inner = round2(innerRadius);
    return [
      `M ${round2(cx)} ${round2(cy - outerRadius)}`,
      `A ${outer} ${outer} 0 1 1 ${round2(cx)} ${round2(cy + outerRadius)}`,
      `A ${outer} ${outer} 0 1 1 ${round2(cx)} ${round2(cy - outerRadius)}`,
      `M ${round2(cx)} ${round2(cy - innerRadius)}`,
      `A ${inner} ${inner} 0 1 0 ${round2(cx)} ${round2(cy + innerRadius)}`,
      `A ${inner} ${inner} 0 1 0 ${round2(cx)} ${round2(cy - innerRadius)}`,
      'Z',
    ].join(' ');
  }

  const outerStart = polarToCartesian(cx, cy, outerRadius, startAngle);
  const outerEnd = polarToCartesian(cx, cy, outerRadius, endAngle);
  const innerEnd = polarToCartesian(cx, cy, innerRadius, endAngle);
  const innerStart = polarToCartesian(cx, cy, innerRadius, startAngle);
  const largeArc = sweep > Math.PI ? 1 : 0;

  return [
    `M ${round2(outerStart.x)} ${round2(outerStart.y)}`,
    `A ${round2(outerRadius)} ${round2(outerRadius)} 0 ${largeArc} 1 ${round2(outerEnd.x)} ${round2(outerEnd.y)}`,
    `L ${round2(innerEnd.x)} ${round2(innerEnd.y)}`,
    `A ${round2(innerRadius)} ${round2(innerRadius)} 0 ${largeArc} 0 ${round2(innerStart.x)} ${round2(innerStart.y)}`,
    'Z',
  ].join(' ');
}

/**
 * Turns `{ id, name, value, color }` items into donut slices with angles.
 *
 * `total` is the ring's full circle. It defaults to the sum of the values, which
 * gives a closed ring; passing something larger (a monthly salary, say) draws a
 * partial ring so the unspent remainder reads as empty track.
 *
 * Slices are sorted largest-first so the eye lands on the dominant category and
 * the legend can be rendered in the same order as the ring.
 */
export function buildDonutSlices(items = [], options = {}) {
  const { total = 0, gapAngle = 0.05 } = options;

  const slices = (Array.isArray(items) ? items : [])
    .filter(Boolean)
    .map((item) => ({ ...item, value: toPositive(item.value) }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value);

  const sum = slices.reduce((acc, slice) => acc + slice.value, 0);
  const reference = toPositive(total) || sum;

  // Nothing to draw. An all-zero month must render the empty state, not a ring
  // with a single zero-length arc.
  if (!slices.length || reference <= 0) return [];

  // The gap is taken *out of* the sweep rather than added between slices, so a
  // ring of many thin slices still closes into exactly one turn. The cap stops
  // a four-slice ring from having its quadrants eaten by the spacing.
  //
  // A lone slice is exempt: it has no neighbour to be separated from, and
  // charging it a gap makes a fully-allocated single category render as a ring
  // with a notch out of 12 o'clock — a 100% budget that looks like 98%.
  const gap = slices.length > 1 ? Math.max(0, Math.min(gapAngle, (TAU / slices.length) * 0.4)) : 0;
  const sweepPerUnit = (TAU - gap * slices.length) / reference;

  let cursor = -Math.PI / 2; // 12 o'clock
  return slices.map((slice) => {
    const sweep = Math.max(0, slice.value * sweepPerUnit);
    const startAngle = cursor + gap / 2;
    cursor += sweep + gap;

    return {
      ...slice,
      share: (slice.value / reference) * 100,
      startAngle,
      endAngle: startAngle + sweep,
    };
  });
}

/**
 * Rounds a chart maximum up to a step people can name, so gridlines land on
 * numbers that read at a glance (0 / 2 jt / 4 jt rather than 0 / 1,85 jt / 3,7 jt).
 *
 * The ladder is denser than the usual 1/2/5/10 on purpose. It has two gridlines,
 * so a coarse ladder wastes real height: with 1/2/5/10 a 1.1 million peak rounds
 * to 2 million and the tallest bar reaches barely half the chart. Filling the
 * plot matters more than the steps landing on powers of ten.
 *
 * Zero in, zero out — an empty chart has no axis to scale.
 */
export function niceCeiling(value) {
  const amount = toNumber(value);
  if (amount <= 0) return 0;

  const magnitude = 10 ** Math.floor(Math.log10(amount));
  const normalised = amount / magnitude;
  const step = STEPS.find((candidate) => normalised <= candidate) ?? 10;

  return step * magnitude;
}

/**
 * Spend totals for every day of `month`, including the days with nothing on
 * them.
 *
 * The zero days matter: a gap in the series is a day the user did not spend,
 * and omitting it would silently rescale the bars so a quiet month looks as
 * busy as a heavy one. Days outside the month are ignored, so the caller can
 * pass the whole expense list.
 */
export function spendByDay(expenses = [], month) {
  const [year, monthNumber] = String(month).split('-').map(Number);
  if (!year || !monthNumber) return [];

  const dayCount = new Date(year, monthNumber, 0).getDate();
  const series = Array.from({ length: dayCount }, (_, index) => ({
    label: String(index + 1),
    value: 0,
  }));

  for (const expense of Array.isArray(expenses) ? expenses : []) {
    const date = toDate(expense?.spent_on);
    if (!date) continue;
    // Compare via the shared key so no timezone conversion can move a
    // transaction into the neighbouring month.
    if (monthKey(date) !== String(month)) continue;
    series[date.getDate() - 1].value += toPositive(expense.amount);
  }

  return series;
}

/**
 * Spend totals for the `count` months ending at `month`, oldest first.
 *
 * `count` is fixed rather than "every month with data" so the bars keep a
 * stable width and the axis does not rescale when an old month is deleted.
 */
export function spendByMonth(expenses = [], month, count = 6) {
  const total = Math.max(0, Math.trunc(toNumber(count)));
  if (!total || !month) return [];

  const keys = [];
  for (let offset = total - 1; offset >= 0; offset -= 1) keys.push(shiftMonth(month, -offset));

  const totals = new Map(keys.map((key) => [key, 0]));
  for (const expense of Array.isArray(expenses) ? expenses : []) {
    const date = toDate(expense?.spent_on);
    if (!date) continue;
    const key = monthKey(date);
    if (totals.has(key)) totals.set(key, totals.get(key) + toPositive(expense.amount));
  }

  return keys.map((key) => ({ key, label: shortMonthLabel(key), value: totals.get(key) }));
}

/**
 * Money in and money out per month, oldest first — the cashflow chart's series.
 *
 * `inflow` is the salary for the month plus every income row dated in it. The
 * salary is part of the same series on purpose: it is income, it is what the
 * month was funded by, and a chart whose "Masuk" row read Rp 0 for every month
 * except the ones the user happened to record a THR in would be answering a
 * question nobody asked. `salary` and `extra` are also returned separately, so
 * a caller can label which part of a month's inflow was not the salary.
 *
 * The window is fixed at `count` months ending at `month`, for the same reason
 * `spendByMonth` fixes it: a bar row that loses a column when an old month is
 * deleted rescales everything around it.
 *
 * Months with no activity are kept as zeroes rather than dropped. An absent
 * month and a month with nothing in it look identical on a bar chart, and only
 * one of them means "the user did nothing".
 */
export function cashflowByMonth(incomes = [], expenses = [], salaryRecords = [], month, count = 6) {
  const total = Math.max(0, Math.trunc(toNumber(count)));
  if (!total || !month) return [];

  const keys = [];
  for (let offset = total - 1; offset >= 0; offset -= 1) keys.push(shiftMonth(month, -offset));

  const inWindow = new Set(keys);
  const extraByMonth = new Map(keys.map((key) => [key, 0]));
  const spendByMonthKey = new Map(keys.map((key) => [key, 0]));

  // `salaryRecords` arrives either as the ledger's `{ key, amount }` rows or as
  // the raw `{ month, salary }` rows the history page has. Both shapes are read
  // here so the caller never has to reshape before charting.
  const salaryByMonth = new Map();
  for (const record of Array.isArray(salaryRecords) ? salaryRecords : []) {
    const key = typeof record?.key === 'string' ? record.key : monthKey(record?.month);
    if (!key) continue;
    salaryByMonth.set(key, toPositive(record?.amount ?? record?.salary));
  }

  for (const income of Array.isArray(incomes) ? incomes : []) {
    const date = toDate(income?.received_on);
    if (!date) continue;
    const key = monthKey(date);
    if (inWindow.has(key)) extraByMonth.set(key, extraByMonth.get(key) + toPositive(income.amount));
  }

  for (const expense of Array.isArray(expenses) ? expenses : []) {
    const date = toDate(expense?.spent_on);
    if (!date) continue;
    const key = monthKey(date);
    if (inWindow.has(key)) spendByMonthKey.set(key, spendByMonthKey.get(key) + toPositive(expense.amount));
  }

  return keys.map((key) => {
    const salary = salaryByMonth.get(key) ?? 0;
    const extra = extraByMonth.get(key);
    const outflow = spendByMonthKey.get(key);
    const inflow = salary + extra;

    return {
      key,
      label: shortMonthLabel(key),
      salary,
      extra,
      inflow,
      outflow,
      net: inflow - outflow,
    };
  });
}

/**
 * The largest single bar in a cashflow series, which is what both rows in a
 * month are scaled against.
 *
 * Income and spending share one scale rather than each having their own. Two
 * independent scales would make a month where spending doubled look identical
 * to one where nothing changed — the comparison the chart exists to support is
 * between the two bars of the same month, and that only reads if a bar of the
 * same length means the same rupiah everywhere.
 *
 * Returns 0 for an empty or all-zero series, which the chart reads as "nothing
 * to draw" rather than as a division by zero.
 */
export function cashflowPeak(series = []) {
  const rows = Array.isArray(series) ? series : [];
  return rows.reduce(
    (peak, row) => Math.max(peak, toPositive(row?.inflow), toPositive(row?.outflow)),
    0,
  );
}
