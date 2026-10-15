'use client';

import { useState } from 'react';
import { arcPath, buildDonutSlices, cashflowPeak, niceCeiling } from '@/lib/charts';
import { fill } from '@/lib/category-colors';
import { formatIDR, formatIDRCompact, formatPercent, toNumber, toPositive } from '@/lib/money';
import { EmptyState, Eyebrow, Panel } from './ui';

/**
 * The two charts on the summary page.
 *
 * Both are presentational: every figure arrives as a prop and no Supabase client
 * is reachable from here, which is what keeps them loadable by the render tests.
 * The pages do their own filtering and pass the numbers they already had.
 *
 * The donut is SVG because a ring is the one shape CSS will not draw for us.
 * The bar chart is plain divs — bars are rectangles, so flexbox renders them at
 * any width without a viewBox to keep in sync, and they can use the ordinary
 * theme tokens instead of hardcoded fills.
 */

// Donut geometry, in viewBox units. The svg scales to its container; these are
// just proportions.
const VIEW = 200;
const CENTER = VIEW / 2;
const OUTER_RADIUS = 88;
const INNER_RADIUS = 64;
const STROKE = OUTER_RADIUS - INNER_RADIUS;

/**
 * Category allocation as a ring, with the legend beside it.
 *
 * Slices are sized by `limit`, not by spend: this chart answers "where did the
 * budget go", and the per-category spending bars directly below it answer "how
 * much of each is used". Hovering a slice or a legend row lights up the other,
 * because matching a 6-degree wedge to a row of text by eye is otherwise fiddly.
 */
export function AllocationDonut({ categories = [], total = 0, centerValue, centerLabel, emptyLabel }) {
  const [activeId, setActiveId] = useState(null);

  const slices = buildDonutSlices(categories);
  const allocated = total || slices.reduce((acc, slice) => acc + slice.value, 0);

  // A ring drawn from nothing would read as a rendering failure rather than an
  // empty month, so it gets the same dashed-border treatment as every other
  // zero state on the site.
  if (!slices.length) {
    return (
      <Panel>
        <ChartHeader eyebrow="ALOKASI KATEGORI" title="Porsi anggaran" />
        <EmptyState>{emptyLabel ?? 'Belum ada anggaran untuk ditampilkan.'}</EmptyState>
      </Panel>
    );
  }

  const highlighted = activeId !== null;

  return (
    <Panel>
      <ChartHeader eyebrow="ALOKASI KATEGORI" title="Porsi anggaran" />

      <div className="flex flex-col items-center sm:flex-row gap-[22px] mt-[20px]">
        <div className="relative w-[168px] h-[168px] flex-none">
          <svg
            viewBox={`0 0 ${VIEW} ${VIEW}`}
            className="chart-donut w-full h-full"
            role="img"
            aria-label={`Alokasi anggaran per kategori, total ${formatIDR(allocated)}.`}
          >
            {/* Empty track. Also the surface the unallocated remainder reads
                against when the ring is partial. */}
            <circle
              cx={CENTER}
              cy={CENTER}
              r={(OUTER_RADIUS + INNER_RADIUS) / 2}
              fill="none"
              stroke="rgb(var(--c-track))"
              strokeWidth={STROKE}
            />

            {slices.map((slice) => (
              <path
                key={slice.id}
                d={arcPath({
                  cx: CENTER,
                  cy: CENTER,
                  outerRadius: OUTER_RADIUS,
                  innerRadius: INNER_RADIUS,
                  startAngle: slice.startAngle,
                  endAngle: slice.endAngle,
                })}
                fill={fill(slice.color)}
                className="transition-opacity duration-150"
                opacity={highlighted && activeId !== slice.id ? 0.28 : 1}
                onMouseEnter={() => setActiveId(slice.id)}
                onMouseLeave={() => setActiveId(null)}
              >
                <title>{`${slice.name}: ${formatIDR(slice.value)} (${formatPercent(slice.share)})`}</title>
              </path>
            ))}
          </svg>

          <div className="absolute inset-0 grid place-items-center pointer-events-none text-center px-[30px]">
            <div>
              <strong className="block font-medium text-[20px] tracking-[-0.05em] leading-none">
                {centerValue ?? formatIDRCompact(allocated)}
              </strong>
              <span className="block font-mono text-[10px] tracking-[0.12em] uppercase text-ruang-muted mt-[6px]">
                {centerLabel ?? 'TOTAL ALOKASI'}
              </span>
            </div>
          </div>
        </div>

        {/* The legend is also the chart's accessible text equivalent: every
            slice is named, priced and given a share, so nothing here depends on
            telling colours apart. */}
        <ul className="flex-1 min-w-0 w-full flex flex-col">
          {slices.map((slice) => (
            <li
              key={slice.id}
              className="flex items-center gap-[10px] py-[9px] border-b border-ruang-line last:border-0 transition-opacity duration-150 cursor-default"
              style={{ opacity: highlighted && activeId !== slice.id ? 0.4 : 1 }}
              onMouseEnter={() => setActiveId(slice.id)}
              onMouseLeave={() => setActiveId(null)}
            >
              <span
                className="w-[10px] h-[10px] rounded-full flex-none"
                style={{ background: fill(slice.color) }}
                aria-hidden="true"
              />
              <span className="flex-1 min-w-0 text-[13px] font-medium truncate text-ruang-ink" title={slice.name}>
                {slice.name}
              </span>
              <span className="font-mono text-[12px] text-ruang-body whitespace-nowrap flex-none">
                {formatIDRCompact(slice.value)}
              </span>
              <span className="font-mono text-[12px] text-ruang-subtle w-[38px] text-right flex-none">
                {formatPercent(slice.share)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}

/**
 * Spend over time as a bar chart, switchable between days and months.
 *
 * `series` is already shaped — an array of `{ label, value }` — so this stays a
 * dumb renderer and the page keeps control of what is in scope. Thirty-one bars
 * is more than fits legibly, so the x-axis shows every Nth label rather than
 * overlapping them into a grey smear.
 */
export function SpendChart({
  series = [],
  granularity = 'day',
  onGranularityChange,
  axisLabel,
  emptyLabel,
}) {
  const points = Array.isArray(series) ? series : [];
  // Coerced here as well as in the series builders: this component takes
  // injected props, and a `numeric` column arriving as a string would otherwise
  // make every comparison below silently wrong.
  const amountOf = (point) => toPositive(point?.value);

  const peak = points.reduce((acc, point) => Math.max(acc, amountOf(point)), 0);
  const ceiling = niceCeiling(peak);

  const total = points.reduce((acc, point) => acc + amountOf(point), 0);
  const busiest = points.reduce(
    (best, point) => (amountOf(point) > amountOf(best) ? point : best),
    null,
  );

  // One label per ~10 stops keeps 31 days readable; six months need all of them.
  const labelEvery = Math.max(1, Math.ceil(points.length / 10));
  const setGranularity = (value) => onGranularityChange?.(value);

  return (
    <Panel>
      <div className="flex items-start justify-between gap-[12px]">
        <ChartHeader eyebrow="ARUS PENGELUARAN" title="Pengeluaran" />
        <GranularityToggle value={granularity} onChange={setGranularity} />
      </div>

      {!points.length || ceiling <= 0 ? (
        <EmptyState className="mt-[20px]">
          {emptyLabel ?? 'Belum ada pengeluaran pada rentang ini.'}
        </EmptyState>
      ) : (
        <>
          <div className="flex items-end justify-between gap-[10px] mt-[20px] mb-[10px]">
            <span className="font-mono text-[11px] tracking-[0.09em] text-ruang-subtle">
              TOTAL {formatIDR(total)}
            </span>
            {amountOf(busiest) > 0 && (
              <span className="font-mono text-[11px] text-ruang-muted truncate">
                PUNCAK {axisLabel?.(busiest) ?? busiest.label} · {formatIDRCompact(amountOf(busiest))}
              </span>
            )}
          </div>

          <div className="relative">
            {/* Gridlines sit behind the bars and carry the scale, so a bar's
                height is readable without hovering it. */}
            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none" aria-hidden="true">
              {[ceiling, ceiling / 2, 0].map((tick) => (
                <span key={tick} className="block h-px bg-ruang-line" />
              ))}
            </div>

            <ul className="relative flex items-end gap-[2px] h-[132px]">
              {points.map((point, index) => {
                const value = amountOf(point);
                // A zero day still gets its hover band, so "nothing spent" is a
                // position you can find rather than a gap you cannot.
                const height = value > 0 ? Math.max(2, (value / ceiling) * 100) : 0;

                return (
                  <li
                    key={`${point.key ?? point.label}-${index}`}
                    className="group relative flex-1 min-w-0 h-full flex items-end"
                    title={`${axisLabel?.(point) ?? point.label}: ${formatIDR(value)}`}
                  >
                    <span
                      className="absolute inset-0 bg-ruang-hover opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-hidden="true"
                    />
                    <span
                      className={`chart-bar relative w-full ${value > 0 ? 'bg-ruang-accent' : 'bg-transparent'}`}
                      style={{ height: `${height}%`, '--i': Math.min(index, 20) }}
                    />
                    {/* Screen readers get the number; sighted users get the
                        hover band and the native tooltip. */}
                    <span className="sr-only">
                      {axisLabel?.(point) ?? point.label}: {formatIDR(value)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="flex gap-[2px] mt-[8px]" aria-hidden="true">
            {points.map((point, index) => (
              <span
                key={`label-${index}`}
                className="flex-1 min-w-0 text-center font-mono text-[10px] text-ruang-ghost truncate"
              >
                {index % labelEvery === 0 || index === points.length - 1 ? point.label : ''}
              </span>
            ))}
          </div>

          <p className="mt-[12px] text-[11px] text-ruang-ghost font-mono">
            Skala {formatIDRCompact(ceiling)} — batang terpanjang menyentuh garis atas
          </p>
        </>
      )}
    </Panel>
  );
}

/**
 * Money in against money out, one row per month.
 *
 * A bar chart rather than two more lines on the spend chart, because the
 * question here is "did this month come out ahead", and that is a comparison
 * between two bars of the same row rather than a trend through time. Each row is
 * therefore a month label, the two bars stacked, and the net figure — the net is
 * the number people actually came for, and it is the only part coloured by
 * whether it is positive.
 *
 * Both bars share one scale, `cashflowPeak`, so a bar of the same length means
 * the same rupiah in every row and the "in" and "out" bars are directly
 * comparable within a month. The zero row still renders: a month with nothing
 * recorded is a fact about the month, not an absence of one.
 */
export function CashflowChart({ series = [], months = 6, emptyLabel }) {
  const rows = Array.isArray(series) ? series : [];
  const peak = cashflowPeak(rows);

  if (!rows.length || peak <= 0) {
    return (
      <Panel>
        <ChartHeader eyebrow="ARUS KAS" title="Masuk dan keluar" />
        <EmptyState>{emptyLabel ?? 'Belum ada transaksi pada rentang ini.'}</EmptyState>
      </Panel>
    );
  }

  const totalIn = rows.reduce((sum, row) => sum + toPositive(row.inflow), 0);
  const totalOut = rows.reduce((sum, row) => sum + toPositive(row.outflow), 0);

  return (
    <Panel>
      <div className="flex items-start justify-between gap-[12px]">
        <ChartHeader eyebrow="ARUS KAS" title="Masuk dan keluar" />
        <span className="font-mono text-[11px] tracking-[0.06em] text-ruang-subtle flex-none pt-[2px]">
          {months} BULAN TERAKHIR
        </span>
      </div>

      {/* The legend is also the chart's text equivalent: every bar is named and
          priced in the row itself, and the two fills are told apart by position
          (in above out) as well as by hue, so the chart does not rely on colour
          to say which is which. */}
      <ul className="mt-[18px] flex flex-col">
        {rows.map((row, index) => (
          <CashflowRow key={row.key ?? index} row={row} peak={peak} index={index} />
        ))}
      </ul>

      <div className="mt-[14px] pt-[13px] border-t border-ruang-line flex flex-wrap items-baseline justify-between gap-x-[14px] gap-y-[4px] text-[12px] leading-[1.6]">
        <span className="text-ruang-muted">
          <span className="w-[9px] h-[9px] bg-ruang-accent inline-block mr-[6px] align-middle" aria-hidden="true" />
          Masuk <strong className="text-ruang-ink font-medium font-mono ml-[4px]">{formatIDR(totalIn)}</strong>
        </span>
        <span className="text-ruang-muted">
          <span className="w-[9px] h-[9px] bg-ruang-muted inline-block mr-[6px] align-middle" aria-hidden="true" />
          Keluar <strong className="text-ruang-ink font-medium font-mono ml-[4px]">{formatIDR(totalOut)}</strong>
        </span>
        <span className="text-ruang-muted basis-full sm:basis-auto">
          Selisih <strong className="text-ruang-ink font-medium font-mono ml-[4px]">{formatSignedIDR(totalIn - totalOut)}</strong>
        </span>
      </div>
    </Panel>
  );
}

/** One month: label, the two bars on a shared scale, and the net figure. */
function CashflowRow({ row, peak, index }) {
  const inflow = toPositive(row.inflow);
  const outflow = toPositive(row.outflow);
  const net = inflow - outflow;

  return (
    <li
      className="row-stagger grid grid-cols-[54px_minmax(0,1fr)_auto] items-center gap-x-[12px] gap-y-[6px] py-[11px] border-b border-ruang-line last:border-b-0"
      style={{ '--i': index }}
    >
      <span className="text-[12px] font-medium text-ruang-muted truncate" title={row.key}>
        {row.label}
      </span>

      <div className="flex flex-col gap-[4px] min-w-0">
        <div className="h-[7px] bg-ruang-track rounded-[2px] overflow-hidden" title={`Masuk ${formatIDR(inflow)}`}>
          <span className="bar-grow block h-full bg-ruang-accent" style={{ width: `${(inflow / peak) * 100}%` }} />
        </div>
        <div className="h-[7px] bg-ruang-track rounded-[2px] overflow-hidden" title={`Keluar ${formatIDR(outflow)}`}>
          <span className="bar-grow block h-full bg-ruang-muted" style={{ width: `${(outflow / peak) * 100}%` }} />
        </div>
        <span className="sr-only">
          {row.label}: masuk {formatIDR(inflow)}, keluar {formatIDR(outflow)}, sisa {formatIDR(net)}
        </span>
      </div>

      {/* The figure carries its own sign, so the colour is a second signal and
          never the only one — and an exact zero stays neutral rather than being
          coloured as either a surplus or a shortfall. */}
      <strong
        className={`font-mono text-[12px] whitespace-nowrap flex-none text-right ${
          net > 0 ? 'text-ruang-accent-text' : net < 0 ? 'text-ruang-danger' : 'text-ruang-subtle'
        }`}
        title={formatIDR(net)}
      >
        {formatSignedIDR(net)}
      </strong>
    </li>
  );
}

/** A rupiah amount with its sign written out, so the sign is readable as text. */
function formatSignedIDR(value) {
  const amount = toNumber(value);
  if (amount === 0) return formatIDR(0);
  return `${amount > 0 ? '+' : '−'}${formatIDR(Math.abs(amount))}`;
}

/** Two-way switch between the daily and monthly view of the same data. */
function GranularityToggle({ value, onChange }) {
  const options = [
    { value: 'day', label: 'Hari' },
    { value: 'month', label: 'Bulan' },
  ];

  return (
    <div className="flex border border-ruang-line-2 flex-none" role="group" aria-label="Grafik per">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={`h-[28px] px-[12px] text-[11px] font-mono tracking-[0.08em] transition-colors cursor-pointer ${
              active
                ? 'bg-ruang-accent text-ruang-accent-ink font-semibold'
                : 'text-ruang-muted hover:text-ruang-ink'
            }`}
          >
            {option.label.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}

/** Eyebrow + heading, the opener every panel on the site uses. */
function ChartHeader({ eyebrow, title }) {
  return (
    <div>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="text-[20px] tracking-[-0.03em] font-medium mt-[6px] mb-[2px]">{title}</h2>
    </div>
  );
}
