/**
 * The charts on the summary screen, the native mirror of
 * `src/components/charts.jsx` on the web app.
 *
 * Both are presentational: every figure arrives as a prop and no client is
 * reachable from here — the page does its own filtering and passes the
 * numbers it already had.
 *
 * The donut is `react-native-svg` with `arcPath()` from the shared geometry
 * (`src/shared/charts.js`) — the ring is the one shape flexbox will not
 * draw. The bar charts are plain Views, because bars are rectangles and
 * flexbox renders them at any width without a viewBox to keep in sync; their
 * heights are the pixel form of the web's percentage heights, scaled by the
 * same plot height. Copy and figures are the web's, so the two screens read
 * the same.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { fill } from '../shared/category-colors.js';
import { arcPath, buildDonutSlices, cashflowPeak, niceCeiling } from '../shared/charts.js';
import {
  formatIDR,
  formatIDRCompact,
  formatPercent,
  toNumber,
  toPositive,
} from '../shared/money.js';
import { EmptyState, Eyebrow, Panel } from '../components/ui.jsx';
import { useTheme } from '../theme/useTheme.js';
import { tokens } from '../theme/tokens.js';

// ---------------------------------------------------------------------------
// Donut geometry, in viewBox units. The svg scales to its container; these
// are just proportions, as on the web.
// ---------------------------------------------------------------------------

const VIEW = 200;
const CENTER = VIEW / 2;
const OUTER_RADIUS = 88;
const INNER_RADIUS = 64;
const STROKE = OUTER_RADIUS - INNER_RADIUS;
const DONUT_SIZE = 168;

// ---------------------------------------------------------------------------
// Spend chart geometry
// ---------------------------------------------------------------------------

const SPEND_PLOT_HEIGHT = 132;

/** A rupiah amount with its sign written out, so the sign is readable as text. */
function formatSignedIDR(value) {
  const amount = toNumber(value);
  if (amount === 0) return formatIDR(0);
  return `${amount > 0 ? '+' : '−'}${formatIDR(Math.abs(amount))}`;
}

/** Eyebrow + heading, the opener every panel on the web uses. */
function ChartHeader({ eyebrow, title, style }) {
  const t = tokens(useTheme().resolved);
  const s = stylesFor(t);
  return (
    <View style={[s.chartHeader, style]}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <Text style={s.chartTitle}>{title}</Text>
    </View>
  );
}

const stylesFor = (t) =>
  StyleSheet.create({
    // Donut
    donutRow: {
      flexDirection: 'column',
      alignItems: 'center',
      gap: t.spacing.card,
      marginTop: t.spacing.card,
    },
    donutWrap: { width: DONUT_SIZE, height: DONUT_SIZE },
    donutSvg: { width: DONUT_SIZE, height: DONUT_SIZE },
    donutCenter: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 30,
    },
    centerValue: {
      fontFamily: t.font.display,
      fontSize: 20,
      fontWeight: '500',
      letterSpacing: -0.05,
      color: t.ink,
    },
    centerLabel: {
      marginTop: 6,
      fontFamily: t.font.mono,
      fontSize: 10,
      letterSpacing: 1.2,
      color: t.muted,
    },
    legend: { alignSelf: 'stretch' },
    legendRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 9,
      borderBottomWidth: 1,
      borderColor: t.line,
    },
    legendRowLast: { borderBottomWidth: 0 },
    legendDot: { width: 10, height: 10, borderRadius: 5 },
    legendName: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: '500', color: t.ink },
    legendValue: { fontFamily: t.font.mono, fontSize: 12, color: t.body },
    legendShare: {
      width: 38,
      fontFamily: t.font.mono,
      fontSize: 12,
      textAlign: 'right',
      color: t.subtle,
    },

    // Spend chart
    chartHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
    chartTitle: {
      fontSize: 20,
      letterSpacing: -0.03,
      fontWeight: '500',
      color: t.ink,
      marginTop: 6,
    },
    summaryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      marginTop: t.spacing.card,
      marginBottom: 10,
    },
    summaryText: { fontFamily: t.font.mono, fontSize: 11, letterSpacing: 0.09, color: t.subtle },
    summaryBusy: { fontFamily: t.font.mono, fontSize: 11, color: t.muted },
    plotWrapper: { marginTop: 8, position: 'relative' },
    gridlines: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      flexDirection: 'column',
      justifyContent: 'space-between',
    },
    gridline: { height: StyleSheet.hairlineWidth, backgroundColor: t.line },
    barsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 2, height: SPEND_PLOT_HEIGHT },
    barSlot: { flex: 1, minWidth: 0, justifyContent: 'flex-end' },
    bar: { backgroundColor: t.accent, width: '100%', borderRadius: t.radius.xs },
    barZero: { height: 0, backgroundColor: 'transparent' },
    labels: { flexDirection: 'row', gap: 2, marginTop: 8 },
    label: {
      flex: 1,
      minWidth: 0,
      fontFamily: t.font.mono,
      fontSize: 10,
      textAlign: 'center',
      color: t.ghost,
    },
    note: { marginTop: 12, fontFamily: t.font.mono, fontSize: 11, color: t.ghost },
    empty: { marginTop: t.spacing.card },

    // Spend chart toggle
    toggleGroup: {
      flexDirection: 'row',
      flexShrink: 0,
      borderWidth: 1,
      borderColor: t.line2,
      borderRadius: t.radius.xs,
    },
    toggleOption: {
      paddingHorizontal: 12,
      paddingVertical: 0,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    toggleOptionActive: { backgroundColor: t.accent },
    toggleOptionLabel: { color: t.muted, fontSize: 11, fontFamily: t.font.mono, letterSpacing: 0.08 },
    toggleOptionLabelActive: {
      color: t.accentInk,
      fontSize: 11,
      fontFamily: t.font.mono,
      fontWeight: '600',
      letterSpacing: 0.08,
    },

    // Cashflow chart
    monthsTag: {
      fontFamily: t.font.mono,
      fontSize: 11,
      letterSpacing: 0.06,
      color: t.subtle,
      flexShrink: 0,
      paddingTop: 2,
    },
    cashflowRows: { marginTop: t.spacing.card },
    cashflowRow: {
      flexDirection: 'row',
      alignItems: 'center',
      columnGap: 12,
      paddingVertical: 11,
      borderBottomWidth: 1,
      borderColor: t.line,
    },
    cashflowRowLast: { borderBottomWidth: 0 },
    cashflowRowLabel: { width: 54, fontSize: 12, fontWeight: '500', color: t.muted },
    cashflowBars: { flex: 1, minWidth: 0, flexDirection: 'column', gap: 4 },
    cashflowTrack: {
      height: 7,
      backgroundColor: t.track,
      borderRadius: t.radius.xs,
      overflow: 'hidden',
    },
    cashflowBar: { height: '100%' },
    cashflowBarIn: { backgroundColor: t.accent },
    cashflowBarOut: { backgroundColor: t.muted },
    cashflowNet: {
      fontFamily: t.font.mono,
      fontSize: 12,
      textAlign: 'right',
      fontWeight: '500',
      flexShrink: 0,
    },
    cashflowNetPositive: { color: t.accentText },
    cashflowNetNegative: { color: t.danger },
    cashflowNetZero: { color: t.subtle },
    cashflowFooter: {
      marginTop: 14,
      paddingTop: 13,
      borderTopWidth: 1,
      borderColor: t.line,
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      columnGap: 14,
      rowGap: 4,
    },
    cashflowFooterCell: { flexDirection: 'row', alignItems: 'center' },
    cashflowFooterTotal: { flexBasis: '100%' },
    cashflowDot: { width: 9, height: 9, marginRight: 6 },
    cashflowFooterText: { fontSize: 12, color: t.muted },
    cashflowFooterStrong: { fontSize: 12, color: t.ink, fontWeight: '500', fontFamily: t.font.mono },
  });

/**
 * Category allocation as a ring, with the legend beside it.
 *
 * Slices are sized by `limit`, not by spend: this chart answers "where did
 * the budget go", and the per-category spending bars directly below it
 * answer "how much of each is used".
 */
export function AllocationDonut({ categories = [], total = 0, centerValue, centerLabel, emptyLabel }) {
  const resolved = useTheme().resolved;
  const t = tokens(resolved);
  const s = stylesFor(t);

  const slices = buildDonutSlices(categories);
  const allocated = total || slices.reduce((acc, slice) => acc + slice.value, 0);

  // A ring drawn from nothing would read as a rendering failure rather than
  // an empty month, so it gets the same dashed-border treatment as every
  // other zero state on the site.
  if (!slices.length) {
    return (
      <Panel>
        <ChartHeader eyebrow="ALOKASI KATEGORI" title="Porsi anggaran" />
        <EmptyState style={s.empty}>{emptyLabel ?? 'Belum ada anggaran untuk ditampilkan.'}</EmptyState>
      </Panel>
    );
  }

  return (
    <Panel>
      <ChartHeader eyebrow="ALOKASI KATEGORI" title="Porsi anggaran" />

      <View style={s.donutRow}>
        <View style={s.donutWrap}>
          <Svg viewBox={`0 0 ${VIEW} ${VIEW}`} style={s.donutSvg}>
            {/* Empty track. Also the surface the unallocated remainder reads
                against when the ring is partial. */}
            <Circle
              cx={CENTER}
              cy={CENTER}
              r={(OUTER_RADIUS + INNER_RADIUS) / 2}
              fill="none"
              stroke={t.track}
              strokeWidth={STROKE}
            />

            {slices.map((slice) => (
              <Path
                key={slice.id}
                d={arcPath({
                  cx: CENTER,
                  cy: CENTER,
                  outerRadius: OUTER_RADIUS,
                  innerRadius: INNER_RADIUS,
                  startAngle: slice.startAngle,
                  endAngle: slice.endAngle,
                })}
                fill={fill(slice.color, resolved)}
              />
            ))}
          </Svg>

          <View style={s.donutCenter}>
            <Text style={s.centerValue}>{centerValue ?? formatIDRCompact(allocated)}</Text>
            <Text style={s.centerLabel}>{centerLabel ?? 'TOTAL ALOKASI'}</Text>
          </View>
        </View>

        {/* The legend is also the chart's accessible text equivalent: every
            slice is named, priced and given a share, so nothing here
            depends on telling colours apart. */}
        <View style={s.legend}>
          {slices.map((slice, index) => (
            <View
              key={slice.id}
              style={[s.legendRow, index === slices.length - 1 ? s.legendRowLast : null]}
            >
              <View style={[s.legendDot, { backgroundColor: fill(slice.color, resolved) }]} />
              <Text style={s.legendName} numberOfLines={1}>
                {slice.name}
              </Text>
              <Text style={s.legendValue}>{formatIDRCompact(slice.value)}</Text>
              <Text style={s.legendShare}>{formatPercent(slice.share)}</Text>
            </View>
          ))}
        </View>
      </View>
    </Panel>
  );
}

/**
 * Spend over time as a bar chart, switchable between days and months.
 *
 * `series` is already shaped — an array of `{ label, value }` — so this
 * stays a dumb renderer and the page keeps control of what is in scope.
 * Thirty-one bars is more than fits legibly, so the x-axis shows every Nth
 * label rather than overlapping them into a smear.
 */
export function SpendChart({ series = [], granularity = 'day', onGranularityChange, axisLabel, emptyLabel }) {
  const t = tokens(useTheme().resolved);
  const s = stylesFor(t);

  const points = Array.isArray(series) ? series : [];
  // Coerced here as well as in the series builders: `numeric` columns arrive
  // as strings and would otherwise make every comparison silently wrong.
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

  const isEmpty = !points.length || ceiling <= 0;

  return (
    <Panel>
      <View style={s.chartHeaderRow}>
        <ChartHeader eyebrow="ARUS PENGELUARAN" title="Pengeluaran" />
        <GranularityToggle value={granularity} onChange={onGranularityChange} />
      </View>

      {isEmpty ? (
        <EmptyState style={s.empty}>
          {emptyLabel ?? 'Belum ada pengeluaran pada rentang ini.'}
        </EmptyState>
      ) : (
        <>
          <View style={s.summaryRow}>
            <Text style={s.summaryText}>TOTAL {formatIDR(total)}</Text>
            {amountOf(busiest) > 0 && (
              <Text style={s.summaryBusy} numberOfLines={1}>
                PUNCAK {axisLabel?.(busiest) ?? busiest.label} · {formatIDRCompact(amountOf(busiest))}
              </Text>
            )}
          </View>

          <View style={s.plotWrapper}>
            {/* Gridlines sit behind the bars and carry the scale, so a bar's
                height is readable without hovering it. */}
            <View style={s.gridlines}>
              {[ceiling, ceiling / 2, 0].map((_, i) => (
                <View key={i} style={s.gridline} />
              ))}
            </View>

            <View style={s.barsRow}>
              {points.map((point, index) => {
                const value = amountOf(point);
                // Zero days stay in the chart as empty slots — "nothing spent"
                // is a position you can find rather than a gap you cannot.
                const height =
                  value > 0 ? Math.max(3, Math.round((value / ceiling) * SPEND_PLOT_HEIGHT)) : 0;
                return (
                  <View
                    key={`${point.key ?? point.label}-${index}`}
                    style={s.barSlot}
                    accessible={true}
                    accessibilityLabel={`${axisLabel?.(point) ?? point.label}: ${formatIDR(value)}`}
                  >
                    <View style={[s.bar, height > 0 ? { height } : s.barZero]} />
                  </View>
                );
              })}
            </View>
          </View>

          <View style={s.labels}>
            {points.map((point, index) => (
              <Text key={`label-${index}`} style={s.label} numberOfLines={1}>
                {index % labelEvery === 0 || index === points.length - 1 ? point.label : ''}
              </Text>
            ))}
          </View>

          <Text style={s.note}>
            Skala {formatIDRCompact(ceiling)} — batang terpanjang menyentuh garis atas
          </Text>
        </>
      )}
    </Panel>
  );
}

/** Two-way switch between the daily and monthly view of the same data. */
function GranularityToggle({ value, onChange }) {
  const t = tokens(useTheme().resolved);
  const s = stylesFor(t);
  const options = [
    { value: 'day', label: 'Hari' },
    { value: 'month', label: 'Bulan' },
  ];

  return (
    <View style={s.toggleGroup} role="group" aria-label="Tampilan grafik: per hari atau per bulan">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            style={[s.toggleOption, active ? s.toggleOptionActive : null]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange?.(option.value)}
          >
            <Text style={active ? s.toggleOptionLabelActive : s.toggleOptionLabel}>
              {option.label.toUpperCase()}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Money in against money out, one row per month.
 *
 * A bar chart rather than two more lines, because the question here is "did
 * this month come out ahead", and that is a comparison between the two bars
 * of the same row rather than a trend through time. Both bars share one
 * scale, `cashflowPeak`.
 */
export function CashflowChart({ series = [], months = 6, emptyLabel }) {
  const t = tokens(useTheme().resolved);
  const s = stylesFor(t);

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
      <View style={s.chartHeaderRow}>
        <ChartHeader eyebrow="ARUS KAS" title="Masuk dan keluar" />
        <Text style={s.monthsTag}>{months} BULAN TERAKHIR</Text>
      </View>

      <View style={s.cashflowRows}>
        {rows.map((row, index) => (
          <CashflowRow
            key={row.key ?? index}
            row={row}
            peak={peak}
            style={[s.cashflowRow, index === rows.length - 1 ? s.cashflowRowLast : null]}
          />
        ))}
      </View>

      <View style={s.cashflowFooter}>
        <View style={s.cashflowFooterCell}>
          <View style={[s.cashflowDot, { backgroundColor: t.accent }]} />
          <Text style={s.cashflowFooterText}>
            Masuk <Text style={s.cashflowFooterStrong}>{formatIDR(totalIn)}</Text>
          </Text>
        </View>
        <View style={s.cashflowFooterCell}>
          <View style={[s.cashflowDot, { backgroundColor: t.muted }]} />
          <Text style={s.cashflowFooterText}>
            Keluar <Text style={s.cashflowFooterStrong}>{formatIDR(totalOut)}</Text>
          </Text>
        </View>
        <Text style={[s.cashflowFooterText, s.cashflowFooterTotal]}>
          Selisih <Text style={s.cashflowFooterStrong}>{formatSignedIDR(totalIn - totalOut)}</Text>
        </Text>
      </View>
    </Panel>
  );
}

/** One month: label, the two bars on a shared scale, and the net figure. */
function CashflowRow({ row, peak, style }) {
  const t = tokens(useTheme().resolved);
  const s = stylesFor(t);

  const inflow = toPositive(row.inflow);
  const outflow = toPositive(row.outflow);
  const net = inflow - outflow;

  const netStyle = net > 0 ? s.cashflowNetPositive : net < 0 ? s.cashflowNetNegative : s.cashflowNetZero;

  return (
    <View
      style={style}
      accessible
      accessibilityLabel={`${row.label}: masuk ${formatIDR(inflow)}, keluar ${formatIDR(outflow)}, sisa ${formatIDR(net)}`}
    >
      <Text style={s.cashflowRowLabel} numberOfLines={1}>
        {row.label}
      </Text>

      {/* Both bars share one scale, so the same length means the same rupiah
          in every row; the track is the remainder of the peak. */}
      <View style={s.cashflowBars}>
        <View style={s.cashflowTrack}>
          <View style={[s.cashflowBar, s.cashflowBarIn, { width: `${(inflow / peak) * 100}%` }]} />
        </View>
        <View style={s.cashflowTrack}>
          <View style={[s.cashflowBar, s.cashflowBarOut, { width: `${(outflow / peak) * 100}%` }]} />
        </View>
      </View>

      <Text style={[s.cashflowNet, netStyle]} numberOfLines={1}>
        {formatSignedIDR(net)}
      </Text>
    </View>
  );
}
