/**
 * Tests for the chart geometry and series shaping.
 *
 * These are the parts of the summary page that can be silently wrong without
 * looking broken: a ring whose wedges do not close, an axis whose gridlines sit
 * above the tallest bar, or a day that drops out of the series and rescales every
 * other bar to compensate. None of that throws, so it is pinned down here.
 *
 * Run with: npm run test:logic (or npm test for everything).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TAU,
  arcPath,
  buildDonutSlices,
  niceCeiling,
  polarToCartesian,
  spendByDay,
  spendByMonth,
} from '../src/lib/charts.js';

// ---------------------------------------------------------------------------
// Arc geometry
// ---------------------------------------------------------------------------

test('polarToCartesian starts at 3 o\'clock and grows clockwise on screen', () => {
  // Angle 0 points right. Positive angles move to larger y, which SVG renders
  // downwards, so the sweep reads clockwise — the direction a ring should fill.
  assert.deepEqual(polarToCartesian(100, 100, 50, 0), { x: 150, y: 100 });
  const quarter = polarToCartesian(100, 100, 50, Math.PI / 2);
  assert.ok(Math.abs(quarter.x - 100) < 1e-9);
  assert.ok(Math.abs(quarter.y - 150) < 1e-9);
});

test('arcPath returns nothing for a zero sweep instead of a stray dot', () => {
  const path = arcPath({
    cx: 100,
    cy: 100,
    outerRadius: 88,
    innerRadius: 60,
    startAngle: 0,
    endAngle: 0,
  });

  // A zero-length arc renders as a visible speck in some browsers, and
  // `M ...` with no draw command is exactly that risk.
  assert.equal(path, '');
});

test('arcPath draws a full circle as two half-turns, not one', () => {
  const path = arcPath({
    cx: 100,
    cy: 100,
    outerRadius: 88,
    innerRadius: 60,
    startAngle: 0,
    endAngle: TAU,
  });

  // A single arc from a point back to itself is a no-op in SVG, so a ring of one
  // slice needs both halves present.
  assert.equal((path.match(/A /g) ?? []).length, 4);
  assert.ok(path.includes('0 1 1'), 'outer ring must sweep clockwise');
  assert.ok(path.includes('0 1 0'), 'inner ring must sweep back, leaving a hole');
});

test('arcPath picks the large-arc flag once a slice passes half a turn', () => {
  const base = { cx: 100, cy: 100, outerRadius: 88, innerRadius: 60 };
  // `A rx ry rotation large-arc sweep x y` — the rotation is 0 here, so the
  // third number in the command is always the flag we care about.
  const largeArcFlag = (path) => /A [\d.]+ [\d.]+ 0 (\d) 1/.exec(path)?.[1];

  const quarter = arcPath({ ...base, startAngle: 0, endAngle: Math.PI / 2 });
  const threeQuarters = arcPath({ ...base, startAngle: 0, endAngle: (3 * Math.PI) / 2 });

  assert.equal(largeArcFlag(quarter), '0');
  assert.equal(largeArcFlag(threeQuarters), '1');
});

// ---------------------------------------------------------------------------
// Donut slices
// ---------------------------------------------------------------------------

test('buildDonutSlices closes into exactly one turn', () => {
  const slices = buildDonutSlices([
    { id: 'a', value: 1 },
    { id: 'b', value: 2 },
    { id: 'c', value: 1 },
  ]);

  const covered = slices.reduce((acc, slice) => acc + (slice.endAngle - slice.startAngle), 0);
  const gaps = slices.length * 0.05;

  // Gaps come out of the sweep rather than sitting between slices, so a full
  // ring is full whether there are two categories or ten.
  assert.ok(Math.abs(covered - (TAU - gaps)) < 1e-9);
});

test('buildDonutSlices starts the ring at 12 o\'clock', () => {
  const [first] = buildDonutSlices([{ id: 'a', value: 1 }]);

  // -PI / 2 is straight up; anything else puts the seam somewhere arbitrary.
  assert.ok(first.startAngle >= -Math.PI / 2);
  assert.ok(first.startAngle < 0);
});

test('buildDonutSlices sorts largest first and never leaves a gap between neighbours', () => {
  const slices = buildDonutSlices([
    { id: 'small', value: 100 },
    { id: 'large', value: 900 },
    { id: 'mid', value: 400 },
  ]);

  assert.deepEqual(
    slices.map((slice) => slice.id),
    ['large', 'mid', 'small'],
  );
  for (let i = 1; i < slices.length; i += 1) {
    assert.ok(slices[i].startAngle > slices[i - 1].endAngle, 'slice i must follow slice i-1');
  }
});

test('buildDonutSlices drops zero and negative values', () => {
  const slices = buildDonutSlices([
    { id: 'real', value: 500 },
    { id: 'empty', value: 0 },
    { id: 'negative', value: -200 },
  ]);

  // A zero wedge is invisible geometry, and a negative one would sweep
  // anticlockwise and eat into its neighbour.
  assert.deepEqual(
    slices.map((slice) => slice.id),
    ['real'],
  );
});

test('buildDonutSlices returns nothing for an empty or all-zero month', () => {
  assert.deepEqual(buildDonutSlices([]), []);
  assert.deepEqual(buildDonutSlices([{ id: 'a', value: 0 }]), []);
  assert.deepEqual(buildDonutSlices(undefined), []);
});

test('buildDonutSlices handles a single category without degenerate geometry', () => {
  const [only] = buildDonutSlices([{ id: 'solo', value: 750 }]);

  // With one slice the gap cap has to keep the wedge from collapsing to a line.
  assert.ok(only.endAngle - only.startAngle > Math.PI);
  assert.equal(only.share, 100);
});

test('a single category at 100% closes the ring, with no seam', () => {
  const [only] = buildDonutSlices([{ id: 'solo', value: 1_500_000 }]);

  // A lone slice has no neighbour to be spaced from. Charging it a gap made a
  // fully-allocated ring render with a notch at 12 o'clock, reading as ~98%.
  assert.ok(
    Math.abs(only.endAngle - only.startAngle - TAU) < 1e-9,
    'a lone slice must sweep exactly one turn',
  );

  // And a full turn is only drawn correctly through the two-half-turn path —
  // a single arc from a point back to itself is a no-op.
  assert.ok(arcPath({
    cx: 100,
    cy: 100,
    outerRadius: 88,
    innerRadius: 64,
    startAngle: only.startAngle,
    endAngle: only.endAngle,
  }).includes('A 88 88 0 1 1'));
});

test('two categories keep their separating gap', () => {
  // The exemption is for a lone slice only; a real boundary is still spaced.
  const slices = buildDonutSlices([{ id: 'a', value: 1 }, { id: 'b', value: 1 }]);

  assert.ok(slices[0].endAngle < slices[1].startAngle, 'siblings must stay separated');
  assert.ok(slices[1].endAngle - slices[1].startAngle < TAU);
});

test('buildDonutSlices measures share against the ring total, not the sum', () => {
  // Allocating 8 of a 10 salary leaves a visible quarter of empty track, and the
  // shares have to be read against the salary for that to make sense.
  const slices = buildDonutSlices([{ id: 'a', value: 8 }], { total: 10 });

  assert.equal(slices[0].share, 80);
  assert.ok(slices[0].endAngle - slices[0].startAngle < TAU, 'ring must not be full');
});

test('buildDonutSlices falls back to the sum when no total is given', () => {
  const slices = buildDonutSlices([
    { id: 'a', value: 300 },
    { id: 'b', value: 100 },
  ]);

  assert.equal(slices[0].share, 75);
  assert.equal(slices[1].share, 25);
});

// ---------------------------------------------------------------------------
// Axis scale
// ---------------------------------------------------------------------------

test('niceCeiling rounds up to a step a person can read', () => {
  // 3.7M is precise and unreadable; 4M gives 0 / 2 jt / 4 jt gridlines.
  assert.equal(niceCeiling(3_700_000), 4_000_000);
  assert.equal(niceCeiling(2_400_000), 2_500_000);
  assert.equal(niceCeiling(900_000), 1_000_000);
  assert.equal(niceCeiling(250_000), 250_000);
});

test('niceCeiling keeps the tallest bar filling most of the plot', () => {
  // The reason the ladder is dense. With a 1/2/5/10 ladder this peak rounds to
  // 2M and the tallest bar reaches barely half the chart height.
  assert.equal(niceCeiling(1_100_000), 1_500_000);
  assert.ok(1_100_000 / 1_500_000 > 0.7);
});

test('niceCeiling is zero for nothing to scale', () => {
  // An empty chart has no axis, and the component uses this to pick the empty
  // state over a gridline floating above invisible bars.
  assert.equal(niceCeiling(0), 0);
  assert.equal(niceCeiling(-500), 0);
  assert.equal(niceCeiling(NaN), 0);
});

// ---------------------------------------------------------------------------
// Series shaping
// ---------------------------------------------------------------------------

test('spendByDay returns every day of the month, including the quiet ones', () => {
  const series = spendByDay([{ spent_on: '2026-10-07', amount: 100_000 }], '2026-10');

  // October has 31 days. The zeros are the point: dropping them would stretch
  // the other bars to fill the gap and make a quiet month look busy.
  assert.equal(series.length, 31);
  assert.equal(series[6].value, 100_000);
  assert.equal(series[0].value, 0);
  assert.equal(series.reduce((acc, point) => acc + point.value, 0), 100_000);
});

test('spendByDay sums several expenses on the same day', () => {
  const series = spendByDay(
    [
      { spent_on: '2026-10-03', amount: 50_000 },
      { spent_on: '2026-10-03', amount: 25_000 },
      { spent_on: '2026-10-04', amount: 10_000 },
    ],
    '2026-10',
  );

  assert.equal(series[2].value, 75_000);
  assert.equal(series[3].value, 10_000);
});

test('spendByDay ignores expenses from other months', () => {
  const series = spendByDay(
    [
      { spent_on: '2026-09-30', amount: 999_000 },
      { spent_on: '2026-11-01', amount: 888_000 },
      { spent_on: '2026-10-15', amount: 1000 },
    ],
    '2026-10',
  );

  assert.equal(series.reduce((acc, point) => acc + point.value, 0), 1000);
});

test('spendByDay keeps a date on its own local day, not the UTC one', () => {
  // '2026-10-01' parsed as UTC is still the 30th west of Greenwich, which would
  // silently shift the whole series by one bar.
  const series = spendByDay([{ spent_on: '2026-10-01', amount: 5000 }], '2026-10');

  assert.equal(series[0].value, 5000);
  assert.equal(series[30].value, 0);
});

test('spendByDay handles February in a leap year and a long month', () => {
  assert.equal(spendByDay([], '2024-02').length, 29);
  assert.equal(spendByDay([], '2026-02').length, 28);
  assert.equal(spendByDay([], '2026-01').length, 31);
});

test('spendByDay rejects a malformed month key rather than throwing', () => {
  assert.deepEqual(spendByDay([{ spent_on: '2026-10-01', amount: 1 }], 'nonsense'), []);
});

test('spendByMonth walks backwards from the given month, oldest first', () => {
  const series = spendByMonth(
    [
      { spent_on: '2026-10-05', amount: 30_000 },
      { spent_on: '2026-08-05', amount: 70_000 },
      { spent_on: '2026-10-20', amount: 20_000 },
    ],
    '2026-10',
    3,
  );

  assert.deepEqual(
    series.map((point) => point.key),
    ['2026-08', '2026-09', '2026-10'],
  );
  assert.deepEqual(
    series.map((point) => point.value),
    [70_000, 0, 50_000],
  );
});

test('spendByMonth crosses a year boundary', () => {
  const series = spendByMonth([{ spent_on: '2025-12-20', amount: 5_000 }], '2026-01', 2);

  assert.deepEqual(
    series.map((point) => point.key),
    ['2025-12', '2026-01'],
  );
  assert.equal(series[0].value, 5_000);
});

test('spendByMonth drops months older than the window', () => {
  const series = spendByMonth([{ spent_on: '2020-01-05', amount: 9_999_999 }], '2026-10', 6);

  // The window is fixed so the bars keep a stable width; old months fall off
  // rather than stretching the axis.
  assert.equal(series.length, 6);
  assert.equal(series.reduce((acc, point) => acc + point.value, 0), 0);
});

test('spendByMonth survives no arguments at all', () => {
  assert.deepEqual(spendByMonth(), []);
  assert.deepEqual(spendByMonth([], '', 6), []);
});
