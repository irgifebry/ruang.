/**
 * The Ringkasan screen — the native mirror of `src/app/page.jsx` on the web
 * app. Same layout, copy and figures; every value is a token or a shared
 * helper (`mobile/src/shared/`), never a literal.
 *
 * Everything is scoped to the current month, as on the web: filtering, the
 * cashflow window, the recent list. A change of focus is applied through
 * `useLedgerData(...).patchData` where a screen writes.
 */

import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { AllocationDonut, CashflowChart, SpendChart } from '../components/charts.jsx';
import DemoBanner from '../components/DemoBanner.jsx';
import { SolarIcon } from '../components/icons.jsx';
import { EmptyState, ErrorState, Eyebrow, LoadingState, Panel } from '../components/ui.jsx';
import { FETCH_LEDGER_REQUEST, useLedgerData } from '../hooks/useLedgerData.js';
import { useDemo } from '../state/DemoProvider.jsx';
import { useSession } from '../state/SessionProvider.jsx';
import {
  balanceLevel,
  currentMonthKey,
  formatDateLong,
  formatIDR,
  formatIDRCompact,
  formatMonthLabel,
  getCashflowSummary,
  monthKey,
  ratioPercent,
} from '../shared/money.js';
import { cashflowByMonth, spendByDay, spendByMonth } from '../shared/charts.js';
import { chipColor, fill } from '../shared/category-colors.js';
import { tokens } from '../theme/tokens.js';
import { useTheme } from '../theme/useTheme.js';

export default function Ringkasan() {
  const session = useSession();
  // Demo data is only for a guest who chose "Lihat-lihat dulu". `data` always
  // exists in DemoProvider, so passing it unconditionally would pin every
  // signed-in user to the sample ledger forever.
  const { isDemo, data: demoData } = useDemo();
  const { data, loading, error, reload } = useLedgerData(
    session.client,
    FETCH_LEDGER_REQUEST,
    isDemo ? demoData : null,
  );

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <ErrorState message="Sesi tidak ditemukan. Silakan masuk kembali." />;

  return <DashboardContent data={data} isDemo={isDemo} />;
}

// The `/` route imports this name. Keep the default export as well so either
// import style resolves to the same screen.
export { Ringkasan as Dashboard };

/** Split out so the header and cards only re-render when data actually changes. */
function DashboardContent({ data, isDemo }) {
  const s = stylesFor(tokens(useTheme().resolved));
  const router = useRouter();
  const { budgets, expenses, incomes = [] } = data;
  const month = currentMonthKey();
  const [granularity, setGranularity] = useState('day');

  // Everything on this screen is scoped to the current month. Previously the
  // page summed every expense the user had ever entered, so an entry from
  // March still moved the "sisa uang bulan ini" figure in October.
  const monthExpenses = expenses.filter((expense) => monthKey(expense.spent_on) === month);
  const monthIncomes = incomes.filter((income) => monthKey(income.received_on) === month);
  const summary = getCashflowSummary(monthIncomes, budgets, monthExpenses);

  // "Terbaru" mixes both sides of the ledger, newest first. Each row carries
  // its own `direction`, so a bonus is signed, coloured and labelled as
  // income wherever it lands, and showing it next to the spending it paid
  // for is more use than a list of expenses that silently ignores the money
  // that arrived.
  const recent = useMemo(
    () =>
      [
        ...monthExpenses.map((expense) => ({ ...expense, direction: 'expense' })),
        ...monthIncomes.map((income) => ({ ...income, direction: 'income' })),
      ]
        .sort((a, b) =>
          (b.received_on ?? b.spent_on ?? '').localeCompare(a.received_on ?? a.spent_on ?? ''),
        )
        .slice(0, 6),
    [monthExpenses, monthIncomes],
  );

  const isOver = summary.remaining < 0;
  const hasInflow = summary.inflow > 0;

  // One severity for the whole balance card, so the figure, the meter fill,
  // the note icon and the note text can never disagree about how the month
  // is going. Measured against the month's whole inflow: an income that has
  // not been spent yet is not a shortage.
  const level = balanceLevel(summary.remaining, summary.inflow);
  const isLow = level === 'low' || level === 'empty';

  // An empty month is an empty state, not a verdict — it stays neutral
  // rather than borrowing the amber that means "you are nearly out of money".
  const figureTone = !hasInflow ? null : level === 'over' ? s.toneDanger : isLow ? s.toneLow : null;
  const meterTone = level === 'over' ? s.meterDanger : isLow ? s.meterLow : s.meterBase;

  // The donut shows the *plan* — each category's monthly limit — because the
  // category list underneath already shows how much of it is spent. Splitting
  // the same numbers across both would make the two sections answer one
  // question twice. Zero-limit categories drop out on their own inside
  // buildDonutSlices.
  const allocation = summary.categories.map((category) => ({
    id: category.id,
    name: category.name,
    value: category.limit ?? category.monthly_limit,
    color: category.color,
  }));

  // The daily view covers the month being displayed; the monthly view
  // reaches back over the whole expense history, because a single month has
  // nothing to compare itself against.
  const spendSeries =
    granularity === 'day' ? spendByDay(monthExpenses, month) : spendByMonth(expenses, month, 6);

  const spendAxisLabel =
    granularity === 'day'
      ? (point) => `Tanggal ${point.label}`
      : (point) => (point.key ? formatMonthLabel(point.key) : point.label);

  // The cashflow chart reaches back over the whole history rather than the
  // current month: a single month has nothing to compare its inflow
  // against. Every month with a recorded income or expense gets a row.
  const cashflowSeries = useMemo(
    () => cashflowByMonth(incomes, expenses, month, 6),
    [incomes, expenses, month],
  );

  return (
    // Like the web dashboard, this page grows past a phone viewport: without
    // a ScrollView the chart, category and recent panels below the fold are
    // unreachable. The other data screens already scroll; this one was a View.
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Ringkasan</Text>
        <Pressable
          style={[s.headerTag, isDemo && s.disabled]}
          onPress={() => router.push('/transactions')}
          disabled={isDemo}
          accessibilityRole="button"
          accessibilityState={{ disabled: isDemo }}
        >
          <Text style={s.headerTagText}>＋ Catat pengeluaran</Text>
        </Pressable>
      </View>

      {isDemo ? (
        <DemoBanner>Mode demo — perubahan tidak disimpan</DemoBanner>
      ) : null}

      <View style={s.cardRow}>
        <BalanceCard
          summary={summary}
          month={month}
          level={level}
          figureTone={figureTone}
          meterTone={meterTone}
          isDemo={isDemo}
        />
        <BudgetCard summary={summary} isOver={isOver} isDemo={isDemo} />
      </View>

      <View style={s.group}>
        <AllocationDonut
          categories={allocation}
          emptyLabel={
            budgets.length ? (
              <>
                Belum ada anggaran bulanan yang bisa dihitung.{' '}
                <Text
                  style={[s.inlineLink, isDemo && s.disabled]}
                  onPress={() => router.push('/settings')}
                  disabled={isDemo}
                  accessibilityState={{ disabled: isDemo }}
                >
                  Atur anggaran
                </Text>{' '}
                untuk melihat porsinya.
              </>
            ) : (
              <>
                Belum ada kategori.{' '}
                <Text
                  style={[s.inlineLink, isDemo && s.disabled]}
                  onPress={() => router.push('/settings')}
                  disabled={isDemo}
                  accessibilityState={{ disabled: isDemo }}
                >
                  Buat anggaran
                </Text>{' '}
                di pengaturan untuk melihat porsinya.
              </>
            )
          }
        />
        <SpendChart
          series={spendSeries}
          granularity={granularity}
          onGranularityChange={setGranularity}
          axisLabel={spendAxisLabel}
          emptyLabel={`Belum ada pengeluaran yang tercatat bulan ${formatMonthLabel(month)}.`}
        />
      </View>

      <View style={s.group}>
        <CashflowChart
          series={cashflowSeries}
          months={6}
          emptyLabel="Belum ada pemasukan atau transaksi yang tercatat dalam 6 bulan terakhir."
        />
      </View>

      <View style={s.group}>
        <CategoriesSection
          budgets={budgets}
          categories={summary.categories}
          overBudgetCount={summary.overBudgetCount}
          isDemo={isDemo}
        />
        <RecentSection recent={recent} budgets={budgets} month={month} />
      </View>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Balance card
// ---------------------------------------------------------------------------

function BalanceCard({ summary, month, level, figureTone, meterTone, isDemo }) {
  const t = tokens(useTheme().resolved);
  const s = stylesFor(t);
  const router = useRouter();

  const remainingPercent = ratioPercent(summary.remaining, summary.inflow);
  const isOver = summary.remaining < 0;
  const hasInflow = summary.inflow > 0;

  return (
    <Panel tone="raised">
      <Eyebrow>{formatMonthLabel(month)}</Eyebrow>
      <Text style={s.cardTitle}>Sisa uang</Text>

      <View style={s.figureRow}>
        <Text style={[s.figure, figureTone]}>{formatIDR(summary.remaining)}</Text>
        <Text style={s.figureSub}>
          dari pemasukan{' '}
          <Text style={s.figureSubStrong}>{formatIDR(summary.inflow)}</Text>
        </Text>
      </View>

      <View style={s.meterTrack}>
        <View style={[s.meterFill, meterTone, { width: `${remainingPercent}%` }]} />
      </View>

      <View style={s.metaRow}>
        <Text style={s.metaText}>{Math.round(remainingPercent)}% tersisa</Text>
        <Text style={s.metaText}>{formatIDR(summary.spent)} terpakai</Text>
      </View>

      <View style={s.rule} />

      {/* Every branch names its state in words as well as colour: `level`
          drives the amber, the sentence is what carries the meaning if the
          hue is missed or read wrong. */}
      <View style={s.noteRow}>
        {isOver ? (
          <>
            <SolarIcon name="danger-circle" size={16} color={t.danger} style={s.noteIcon} />
            <Text style={s.noteTextDanger}>Melebihi pemasukan {formatIDR(Math.abs(summary.remaining))}.</Text>
          </>
        ) : !hasInflow ? (
          <>
            <SolarIcon name="circle-dot" size={16} color={t.muted} style={s.noteIcon} />
            <Text style={s.noteText}>
              Belum ada pemasukan bulan ini.{' '}
              <Text
                style={[s.inlineLink, isDemo && s.disabled]}
                onPress={() => router.push('/transactions')}
                disabled={isDemo}
                accessibilityState={{ disabled: isDemo }}
              >
                Catat pemasukan
              </Text>{' '}
              di halaman Transaksi.
            </Text>
          </>
        ) : summary.remaining === 0 ? (
          <>
            <SolarIcon name="circle-dot" size={16} color={t.warnText} style={s.noteIcon} />
            <Text style={s.noteTextWarn}>Seluruh pemasukan sudah terpakai bulan ini.</Text>
          </>
        ) : level === 'low' ? (
          <>
            <SolarIcon name="circle-dot" size={16} color={t.warnText} style={s.noteIcon} />
            <Text style={s.noteTextWarn}>
              Tinggal {formatIDR(summary.remaining)} dari {formatIDR(summary.inflow)}.
            </Text>
          </>
        ) : (
          <>
            <SolarIcon name="check" size={16} color={t.accentText} style={s.noteIcon} />
            <Text style={s.noteText}>Sisa dana tersedia.</Text>
          </>
        )}
      </View>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Budget card
// ---------------------------------------------------------------------------

function BudgetCard({ summary, isOver, isDemo }) {
  const t = tokens(useTheme().resolved);
  const s = stylesFor(t);
  const router = useRouter();
  const allocatedRatio = ratioPercent(summary.spent, summary.allocated);
  const isMeterOver = summary.allocated > 0 && summary.spent > summary.allocated;

  return (
    <Panel>
      <View style={s.cardHead}>
        <View>
          <Eyebrow>Anggaran</Eyebrow>
          <Text style={s.cardTitle}>Alokasi</Text>
        </View>
        <Pressable
          style={[s.link, isDemo && s.disabled]}
          onPress={() => router.push('/settings')}
          disabled={isDemo}
          accessibilityRole="button"
          accessibilityState={{ disabled: isDemo }}
        >
          <Text style={s.linkText}>Atur anggaran</Text>
          <SolarIcon name="arrow-right-up" size={12} color={t.body} />
        </Pressable>
      </View>

      <View style={s.statsRow}>
        <View>
          <Text style={s.statLabel}>SUDAH DIPAKAI</Text>
          <Text style={s.statValue}>{formatIDR(summary.spent)}</Text>
        </View>
        <View>
          <Text style={s.statLabel}>Batas anggaran</Text>
          <Text style={s.statValue}>{formatIDR(summary.allocated)}</Text>
        </View>
      </View>

      <View style={s.meterTrack}>
        <View style={[s.meterFill, isMeterOver ? s.meterDanger : s.meterBase, { width: `${allocatedRatio}%` }]} />
      </View>

      <View style={s.metaRow}>
        <Text style={s.metaText}>{Math.round(allocatedRatio)}% anggaran terpakai</Text>
        <Text style={s.metaText}>
          {summary.allocated - summary.spent >= 0
            ? `${formatIDR(summary.allocated - summary.spent)} tersisa`
            : `lebih ${formatIDR(summary.spent - summary.allocated)}`}
        </Text>
      </View>

      <View style={s.rule} />

      <View style={s.noteRow}>
        <SolarIcon name="arrow-right-up" size={16} color={t.accentText} style={s.noteIcon} />
        <Text style={s.noteText}>{budgetNote(summary, isOver)}</Text>
      </View>
    </Panel>
  );
}

/** The budget card's note, the web branches verbatim. */
function budgetNote(summary, isOver) {
  if (isOver) {
    return `Pengeluaran melebihi pemasukan. Cek anggaranmu.`;
  }
  if (summary.allocated === 0) {
    return 'Belum ada batas anggaran. Atur di menu Pengaturan.';
  }
  if (summary.spent > summary.allocated) {
    return `Alokasi terlampaui sebesar ${formatIDR(summary.spent - summary.allocated)}.`;
  }
  if (summary.allocated > summary.spent) {
    return `${formatIDR(summary.allocated - summary.spent)} alokasi belum terpakai.`;
  }
  return 'Seluruh anggaran sudah terpakai. Ritme pengeluaranmu dalam kendali.';
}

// ---------------------------------------------------------------------------
// Category spending list ("Anggaran kategori")
// ---------------------------------------------------------------------------

function CategoriesSection({ budgets, categories, overBudgetCount = 0, isDemo }) {
  const t = tokens(useTheme().resolved);
  const s = stylesFor(t);
  const router = useRouter();

  return (
    <View style={s.group}>
      <View style={s.sectionHead}>
        <View style={s.sectionHeadBlock}>
          <Eyebrow>Anggaran</Eyebrow>
          <Text style={s.h2}>Anggaran kategori</Text>
        </View>
        {overBudgetCount > 0 ? (
          <Text style={s.overBudgetBadge}>{overBudgetCount} lewat batas</Text>
        ) : null}
      </View>

      {budgets.length ? (
        <View style={s.rows}>
          {categories.map((category, index) => (
            <CategoryRow key={category.id} category={category} index={index} />
          ))}
        </View>
      ) : (
        <EmptyState style={s.empty}>
          Belum ada kategori.{' '}
          <Text
            style={[s.inlineLink, isDemo && s.disabled]}
            onPress={() => router.push('/settings')}
            disabled={isDemo}
            accessibilityState={{ disabled: isDemo }}
          >
            Buat anggaran
          </Text>{' '}
          untuk mulai melacak pengeluaran.
        </EmptyState>
      )}
    </View>
  );
}

function CategoryRow({ category, index }) {
  const resolved = useTheme().resolved;
  const t = tokens(resolved);
  const s = stylesFor(t);
  const percent = Math.round(category.percent ?? 0);
  const chip = chipColor(category.color, resolved);

  return (
    <View style={s.categoryRow}>
      <View style={[s.chip, { backgroundColor: chip.bg }]}>
        <Text style={[s.chipText, { color: chip.text }]}>{String(index + 1).padStart(2, '0')}</Text>
      </View>

      <View style={s.categoryBody}>
        <Text style={s.categoryName} numberOfLines={1}>
          {category.name}
        </Text>
        <View style={s.categoryMeta}>
          <Text style={s.categoryAmount} numberOfLines={1}>
            {formatIDRCompact(category.spent)}
            {' '}
            <Text style={s.ghostSlash}>/</Text> {' '}
            {formatIDRCompact(category.limit)}
          </Text>
        </View>

        <View style={s.categoryBar}>
          <View
            style={[
              s.categoryBarFill,
              {
                backgroundColor: category.over ? t.danger : fill(category.color, resolved),
                width: `${Math.min(100, percent)}%`,
              },
            ]}
          />
        </View>

        {category.over && (
          <Text style={s.overNote}>
            Lebih <Text style={s.overNoteValue}>{formatIDR(Math.abs(category.remaining))}</Text>
          </Text>
        )}
      </View>

      <Text style={[s.percentText, category.over ? s.percentTextDanger : null]}>{percent}%</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Recent list ("Terbaru")
// ---------------------------------------------------------------------------

function RecentSection({ recent, budgets, month }) {
  const t = tokens(useTheme().resolved);
  const s = stylesFor(t);
  const router = useRouter();

  return (
    <View style={s.group}>
      <View style={s.sectionHead}>
        <View style={s.sectionHeadBlock}>
          <Eyebrow>Terbaru</Eyebrow>
          <Text style={s.h2}>Transaksi</Text>
        </View>
        <Pressable
          style={s.link}
          onPress={() => router.push('/transactions')}
          accessibilityRole="button"
        >
          <Text style={s.linkText}>Semua</Text>
          <SolarIcon name="arrow-right-up" size={12} color={t.body} />
        </Pressable>
      </View>

      {recent.length ? (
        <View style={s.rows}>
          {recent.map((expense, index) => (
            <RecentRow
              key={`${expense.direction}-${expense.id ?? index}`}
              expense={expense}
              budgets={budgets}
              index={index}
            />
          ))}
        </View>
      ) : (
        <EmptyState style={s.empty}>
          Belum ada transaksi bulan {formatMonthLabel(month)}. Catat pengeluaran atau pemasukan pertama.
        </EmptyState>
      )}
    </View>
  );
}

/** One "Terbaru" row — a mixed list, so the row declares its own direction. */
function RecentRow({ expense, budgets, index }) {
  const resolved = useTheme().resolved;
  const t = tokens(resolved);
  const s = stylesFor(t);

  const isIncome = expense?.direction === 'income';
  const budget = budgets.find((b) => b.id === expense.category_id);
  const color = isIncome ? 'lime' : budget?.color ?? 'lime';
  const chip = chipColor(color, resolved);
  const name = isIncome ? expense.source || 'Pemasukan' : budget?.name ?? 'Tanpa kategori';
  const dateValue = isIncome ? expense.received_on : expense.spent_on;
  const amountTone = isIncome ? s.amountIncome : null;

  return (
    <View style={s.recentRow}>
      <View style={[s.recentChip, { backgroundColor: chip.bg }]}>
        <Text style={[s.recentChipText, { color: chip.text }]}>
          {isIncome ? '+' : expense.description?.slice(0, 1).toUpperCase() ?? '?'}
        </Text>
      </View>

      <View style={s.recentBody}>
        <Text style={s.recentName} numberOfLines={1}>
          {expense.description}
        </Text>
        <Text style={s.recentMeta} numberOfLines={1}>
          {name}
          <Text style={s.metaDot}> · </Text>
          {formatDateLong(dateValue)}
        </Text>
      </View>

      <Text style={[s.recentAmount, amountTone]} numberOfLines={1}>
        {isIncome ? '+' : '−'}
        {formatIDRCompact(expense.amount)}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const stylesFor = (t) =>
  StyleSheet.create({
    screen: { backgroundColor: t.bg },
    content: { marginTop: t.spacing.section, paddingBottom: 48 },
    group: { marginTop: t.spacing.section },
    // A demo guest can still see where the write CTAs live, but they must read
    // as inactive — the same dimming the other tabs use.
    disabled: { opacity: 0.4 },

    // Header
    header: {
      flexDirection: 'column',
      alignItems: 'flex-start',
      gap: t.spacing.card,
      marginBottom: t.spacing.section,
    },
    headerTitle: {
      fontFamily: t.font.display,
      fontSize: 36,
      lineHeight: 41,
      letterSpacing: -0.05,
      fontWeight: '500',
      color: t.ink,
    },
    headerTag: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      height: 42,
      paddingHorizontal: 18,
      borderRadius: t.radius.md,
      backgroundColor: t.accent,
    },
    headerTagText: { fontSize: 13, fontWeight: 'bold', letterSpacing: 0.26, color: t.accentInk },

    // Card layout. The web splits into two columns only at `lg`; a phone (and
    // the native app is always one) stacks the pair with the `card` gutter.
    cardRow: { flexDirection: 'column', gap: t.spacing.card },
    cardTitle: {
      fontFamily: t.font.display,
      fontSize: 20,
      letterSpacing: -0.03,
      fontWeight: '500',
      color: t.ink,
      marginTop: 8,
    },
    cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },

    // Balance card figure
    figureRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'baseline',
      columnGap: 10,
      rowGap: 6,
      marginTop: 28,
    },
    figure: {
      fontFamily: t.font.display,
      fontSize: 30,
      fontWeight: '500',
      letterSpacing: -0.07,
      color: t.ink,
    },
    figureSub: { fontSize: 13, color: t.muted },
    figureSubStrong: { fontWeight: '500', color: t.ink },
    toneDanger: { color: t.danger },
    toneLow: { color: t.warnText },
    meterTrack: {
      height: 5,
      backgroundColor: t.track,
      borderRadius: t.radius.xs,
      overflow: 'hidden',
      marginTop: t.spacing.card,
    },
    meterFill: { height: '100%' },
    meterBase: { backgroundColor: t.accent },
    meterDanger: { backgroundColor: t.danger },
    meterLow: { backgroundColor: t.warn },
    metaRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
      marginTop: 20,
    },
    metaText: { fontSize: 12, color: t.muted },
    rule: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: t.line,
      marginTop: 16,
      marginBottom: 16,
    },

    // Note row (balance card and budget card share the rhythm)
    noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    noteIcon: { marginTop: 2, flexShrink: 0 },
    noteText: { flex: 1, fontSize: 12, lineHeight: 20, color: t.body },
    noteTextDanger: { flex: 1, fontSize: 12, lineHeight: 20, color: t.danger },
    noteTextWarn: { flex: 1, fontSize: 12, lineHeight: 20, color: t.warnText },

    // Budget card stat row
    statsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 18, marginTop: 28 },
    statLabel: { fontFamily: t.font.mono, fontSize: 11, color: t.subtle, marginBottom: 9 },
    statValue: {
      fontFamily: t.font.display,
      fontSize: 18,
      lineHeight: 25,
      letterSpacing: -0.04,
      fontWeight: '500',
      color: t.ink,
    },

    // Links
    link: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 },
    linkText: { fontSize: 12, color: t.body },
    inlineLink: { fontSize: 12, color: t.accentText, textDecorationLine: 'underline' },

    // Category rows ("Anggaran kategori")
    sectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      marginBottom: t.spacing.card,
    },
    sectionHeadBlock: { flexShrink: 1 },
    h2: {
      fontFamily: t.font.display,
      fontSize: 20,
      letterSpacing: -0.03,
      fontWeight: '500',
      color: t.ink,
      marginTop: 6,
      marginBottom: 2,
    },
    overBudgetBadge: {
      borderWidth: 1,
      borderColor: t.danger,
      color: t.danger,
      paddingHorizontal: 7,
      paddingVertical: 3,
      fontFamily: t.font.mono,
      fontSize: 11,
      letterSpacing: 0.66,
      flexShrink: 0,
    },
    rows: { borderTopWidth: 1, borderColor: t.line },
    categoryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderColor: t.line,
    },
    chip: { width: 28, height: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
    chipText: { fontFamily: t.font.mono, fontSize: 11 },
    categoryBody: { flex: 1, minWidth: 0 },
    categoryName: { fontSize: 13, fontWeight: '500', color: t.ink },
    categoryMeta: { marginTop: 4 },
    categoryAmount: { fontSize: 12, fontFamily: t.font.mono, color: t.body },
    ghostSlash: { color: t.ghost, fontStyle: 'normal' },
    categoryBar: { height: 3, backgroundColor: t.track, borderRadius: t.radius.xs, marginTop: 10 },
    categoryBarFill: { height: '100%' },
    overNote: { fontSize: 11, color: t.danger, marginTop: 8 },
    overNoteValue: { fontFamily: t.font.mono },
    percentText: {
      width: 52,
      fontSize: 12,
      fontFamily: t.font.mono,
      textAlign: 'right',
      color: t.muted,
      flexShrink: 0,
    },
    percentTextDanger: { color: t.danger },

    // "Terbaru" rows
    recentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderColor: t.line,
    },
    recentChip: { width: 28, height: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
    recentChipText: { fontFamily: t.font.mono, fontSize: 11 },
    recentBody: { flex: 1, minWidth: 0 },
    recentName: { fontSize: 13, fontWeight: '500', color: t.ink },
    recentMeta: { fontSize: 12, color: t.muted, marginTop: 2 },
    metaDot: { color: t.ghost },
    recentAmount: { fontFamily: t.font.mono, fontSize: 12, color: t.ink },
    amountIncome: { color: t.accentText },

    empty: { marginTop: 16 },
  });
