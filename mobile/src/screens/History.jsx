/**
 * The Riwayat screen — the native mirror of `src/app/history/page.jsx` on the
 * web app. Same four summary cards, month rows, copy and footnote; every
 * colour comes from a token and every figure from a pure helper in
 * `mobile/src/shared`.
 *
 * One request is enough: the API's `fetchMonthlyBreakdown` buckets every month
 * with money in or out, `buildHistoryData` turns that response into the rows
 * `buildHistoryRows` already knows how to read, and no month without a record
 * is ever invented.
 */

import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import DemoBanner from '../components/DemoBanner.jsx';
import { EmptyState, ErrorState, Eyebrow, LoadingState, Panel } from '../components/ui.jsx';
import { useLedgerData } from '../hooks/useLedgerData.js';
import { useDemo } from '../state/DemoProvider.jsx';
import { useSession } from '../state/SessionProvider.jsx';
import { buildDemoHistoryPayload } from '../shared/demo-data.js';
import { buildHistoryData } from '../shared/history.js';
import {
  formatIDR,
  formatIDRCompact,
  formatMonthLabel,
  ratioPercent,
} from '../shared/money.js';
import { tokens } from '../theme/tokens.js';
import { useTheme } from '../theme/useTheme.js';

const MONTHS_WINDOW = 12;
const HISTORY_REQUEST = { body: { action: 'fetchMonthlyBreakdown', months: MONTHS_WINDOW } };

export default function History() {
  const { client } = useSession();
  const { isDemo, data: demoData } = useDemo();
  const { data, loading, error, reload } = useLedgerData(
    client,
    HISTORY_REQUEST,
    isDemo ? demoData : null,
  );
  // All hooks run before the early returns so the hook order stays stable
  // across loading -> loaded transitions. History's request is a different
  // action from the other tabs', so a guest's ledger rows need the same bucket
  // envelope the API would have returned before the shared adapter sees them.
  const demoHistory = useMemo(
    () => (isDemo ? buildDemoHistoryPayload(demoData) : null),
    [isDemo, demoData],
  );
  const rows = useMemo(() => buildHistoryData(demoHistory ?? data), [demoHistory, data]);

  if (loading) return <LoadingState label="Memuat riwayat..." />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <ErrorState message="Sesi tidak ditemukan. Silakan masuk kembali." />;

  return <HistoryContent rows={rows} isDemo={isDemo} />;
}

// The route imports `History`; other callers use `HistoryScreen`. Both names
// point at the same screen, alongside the default export, so a route cannot
// end up with an undefined component.
export { History, History as HistoryScreen };

function HistoryContent({ rows, isDemo }) {
  const t = tokens(useTheme().resolved);
  const s = stylesFor(t);
  const router = useRouter();

  const totalSaved = rows.reduce((sum, row) => sum + row.saved, 0);
  const totalSpent = rows.reduce((sum, row) => sum + row.spent, 0);

  // The only control here is the link into the write screen. A demo guest can
  // still read the ledger; following this link would land on a locked form.
  const openTransactions = () => {
    if (isDemo) return;
    router.push('/transactions');
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Riwayat</Text>
      </View>

      {isDemo ? (
        <DemoBanner>Mode demo — perubahan tidak disimpan</DemoBanner>
      ) : null}

      {rows.length === 0 ? (
        <Panel>
          <EmptyState>
            Belum ada riwayat. Sebuah bulan masuk riwayat begitu ada pemasukan atau pengeluaran yang
            tercatat di dalamnya.{'\n'}
            <Text
              style={[s.inlineLink, isDemo && s.disabled]}
              onPress={openTransactions}
              disabled={isDemo}
              accessibilityRole="link"
              accessibilityState={{ disabled: isDemo }}
            >
              Catat pemasukan pertama
            </Text>
          </EmptyState>
        </Panel>
      ) : (
        <>
          {/* Two across, as on the web's phone grid; the section gutter is the
              same token that separates the header from the content. */}
          <View style={s.summaryGrid}>
            <View style={s.summaryRow}>
              <SummaryCard
                label="Total pengeluaran"
                value={formatIDRCompact(totalSpent)}
                sub={`${rows.length} bulan tercatat`}
              />
              <SummaryCard
                label="Total tersisa"
                value={formatIDRCompact(totalSaved)}
                tone={totalSaved < 0 ? 'danger' : 'default'}
                sub={
                  totalSaved < 0
                    ? 'Pengeluaran melebihi pemasukan'
                    : 'Pemasukan dikurangi pengeluaran'
                }
              />
            </View>
            <View style={s.summaryRow}>
              <SummaryCard
                label="Bulan terbaru"
                value={formatMonthLabel(rows[0].key)}
                sub={`${formatIDRCompact(rows[0].spent)} pengeluaran`}
              />
              <SummaryCard
                label="Rata-rata / bulan"
                value={formatIDRCompact(totalSpent / rows.length)}
                sub="Pengeluaran"
              />
            </View>
          </View>

          <View>
            <Panel>
              <View style={s.panelHead}>
                <View style={s.panelHeadBlock}>
                  <Eyebrow>Perbandingan</Eyebrow>
                  <Text style={s.h2}>Pengeluaran per bulan</Text>
                </View>
                <Text style={s.windowTag}>{MONTHS_WINDOW} bulan terakhir</Text>
              </View>

              <View style={s.rows}>
                {rows.map((row, index) => (
                  <HistoryRow key={row.key} row={row} last={index === rows.length - 1} />
                ))}
              </View>

              <Text style={s.footnote}>
                Bar menunjukkan porsi pemasukan yang terpakai. Bar penuh berarti pengeluaran mencapai
                atau melebihi pemasukan; merah berarti pengeluaran melampaui pemasukan.
              </Text>
            </Panel>
          </View>
        </>
      )}

      {/* The note sits below both branches, as on the web: an empty history
          still explains how a month qualifies for the list. */}
      <View style={s.pageNote}>
        <View style={s.pageNoteDot} />
        <Text style={s.pageNoteText}>
          Riwayat dihitung dari transaksi yang tersimpan di akunmu. Sebuah bulan masuk riwayat begitu
          ada pemasukan atau pengeluaran yang tercatat di dalamnya. Angka di atas adalah selisih antara
          dana yang masuk dan yang keluar pada bulan itu.
        </Text>
      </View>
    </ScrollView>
  );
}

function SummaryCard({ label, value, sub, tone = 'default' }) {
  const s = stylesFor(tokens(useTheme().resolved));
  return (
    <Panel style={s.summaryPanel}>
      <Text style={s.summaryLabel}>{label}</Text>
      <Text style={[s.summaryValue, tone === 'danger' ? s.summaryValueDanger : null]} numberOfLines={1}>
        {value}
      </Text>
      {sub ? <Text style={s.summarySub}>{sub}</Text> : null}
    </Panel>
  );
}

function HistoryRow({ row, last }) {
  const t = tokens(useTheme().resolved);
  const s = stylesFor(t);
  const spentRatio = ratioPercent(row.spent, row.inflow);
  const topCategories = row.categories
    .slice(0, 3)
    .map((category) => `${category.name} ${formatIDR(category.spent)}`)
    .join(' · ');

  return (
    <View style={[s.row, last ? null : s.rowBorder]}>
      <View style={s.rowHead}>
        <Text style={s.monthLabel} numberOfLines={1}>
          {formatMonthLabel(row.key)}
        </Text>
        <Text style={s.savedLabel} numberOfLines={1}>
          {formatIDR(row.saved)} tersisa
        </Text>
      </View>

      <View style={s.barTrack}>
        {/* Red is reserved for spending that beat the inflow, not for a bar
            that merely reached the end. */}
        <View
          style={[
            s.barFill,
            row.saved < 0 ? s.barDanger : s.barAccent,
            { width: `${spentRatio}%` },
          ]}
        />
      </View>

      <View style={s.stats}>
        <View style={s.statCell}>
          <Text style={s.statLabel}>Masuk</Text>
          <Text style={s.statValue} numberOfLines={1}>
            {formatIDR(row.inflow)}
          </Text>
        </View>
        <View style={s.statCell}>
          <Text style={s.statLabel}>Keluar · {Math.round(spentRatio)}% masuk</Text>
          <Text style={s.statValue} numberOfLines={1}>
            {formatIDR(row.spent)}
          </Text>
        </View>
      </View>

      {/* Only months with income rows get this line — the amount itself is
          already in "Masuk" above, so the count is the useful part. */}
      {row.incomeCount > 0 ? (
        <Text style={s.incomeCount}>
          {row.incomeCount} catatan pemasukan ·{' '}
          <Text style={s.incomeAmount}>{formatIDR(row.income)}</Text>
        </Text>
      ) : null}

      <View style={s.rowMeta}>
        {/* The web page renders its count expression followed by the word
            "transaksi", but its data adapter never puts `count` on a row, so
            the rendered result is just the word. Mirror that output: the adapter
            does have a real count, but printing it would show information the
            website does not. */}
        <Text style={s.txCount}>transaksi</Text>
        {row.categories.length > 0 ? (
          <Text style={s.topCategories} numberOfLines={1}>
            Terbesar: {topCategories}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const stylesFor = (t) =>
  StyleSheet.create({
    screen: { backgroundColor: t.bg },
    content: { marginTop: t.spacing.section, paddingBottom: 48 },
    disabled: { opacity: 0.4 },

    // Header
    header: { marginBottom: t.spacing.section },
    headerTitle: {
      fontFamily: t.font.display,
      fontSize: 36,
      lineHeight: 41,
      letterSpacing: -0.065,
      fontWeight: '500',
      color: t.ink,
    },

    // Summary grid: two cards across, the card gutter between them and the
    // section rhythm below the pair.
    summaryGrid: { gap: t.spacing.card, marginBottom: t.spacing.section },
    summaryRow: { flexDirection: 'row', gap: t.spacing.card },
    summaryPanel: { flex: 1, minWidth: 0, paddingVertical: 16, paddingHorizontal: 14 },
    summaryLabel: {
      fontFamily: t.font.mono,
      fontSize: 10,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      color: t.subtle,
      marginBottom: 7,
    },
    summaryValue: {
      fontFamily: t.font.mono,
      fontSize: 18,
      letterSpacing: -0.03,
      fontWeight: '500',
      color: t.ink,
    },
    summaryValueDanger: { color: t.danger },
    summarySub: { fontSize: 12, lineHeight: 17, color: t.subtle, marginTop: 6 },

    panelHead: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 10,
      marginBottom: t.spacing.section,
    },
    panelHeadBlock: { flexShrink: 1 },
    h2: {
      fontFamily: t.font.display,
      fontSize: 20,
      letterSpacing: -0.04,
      fontWeight: '500',
      color: t.ink,
      marginTop: 6,
    },
    windowTag: {
      fontFamily: t.font.mono,
      fontSize: 11,
      letterSpacing: 0.66,
      color: t.subtle,
      flexShrink: 0,
      marginTop: 3,
    },

    // One month statement
    row: { paddingVertical: 12 },
    rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: t.lineSoft },
    rowHead: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 10,
      marginBottom: 7,
    },
    monthLabel: { flexShrink: 1, fontSize: 13, fontWeight: '500', color: t.ink },
    savedLabel: { flexShrink: 0, fontFamily: t.font.mono, fontSize: 12, color: t.ink },
    barTrack: { height: 5, backgroundColor: t.track, borderRadius: t.radius.xs, overflow: 'hidden' },
    barFill: { height: '100%' },
    barAccent: { backgroundColor: t.accent },
    barDanger: { backgroundColor: t.danger },

    stats: { flexDirection: 'row', gap: t.spacing.card, marginTop: 13 },
    statCell: { flex: 1, minWidth: 0 },
    statLabel: {
      fontFamily: t.font.mono,
      fontSize: 10,
      letterSpacing: 0.9,
      textTransform: 'uppercase',
      color: t.subtle,
      marginBottom: 5,
    },
    statValue: { fontSize: 13, letterSpacing: -0.02, fontWeight: '500', color: t.ink },

    incomeCount: { fontSize: 12, lineHeight: 18, color: t.muted, marginTop: 8 },
    incomeAmount: { fontFamily: t.font.mono, color: t.ink },
    rowMeta: { flexDirection: 'row', gap: 10, marginTop: 10 },
    txCount: { fontSize: 12, lineHeight: 18, color: t.subtle, flexShrink: 0 },
    topCategories: { flexShrink: 1, fontSize: 12, lineHeight: 18, color: t.muted },

    footnote: {
      marginTop: 18,
      paddingTop: 14,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: t.line,
      fontSize: 12,
      lineHeight: 20,
      color: t.subtle,
    },

    inlineLink: { color: t.accentText, textDecorationLine: 'underline' },

    // The page-level note, outside the panel in both branches.
    pageNote: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      borderWidth: 1,
      borderColor: t.line,
      padding: t.spacing.card,
      marginTop: t.spacing.section,
    },
    pageNoteDot: { width: 7, height: 7, backgroundColor: t.accent, flexShrink: 0, marginTop: 6 },
    pageNoteText: { flex: 1, fontSize: 13, lineHeight: 21, color: t.muted },
  });
