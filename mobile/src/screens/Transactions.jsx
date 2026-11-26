/**
 * The Transaksi screen — the native mirror of `src/app/transactions/page.jsx`
 * on the web app. Same tabs, copy, summary, filters, totals, rows and empty
 * states; every colour comes from a token and every figure from a shared
 * helper in `mobile/src/shared`.
 *
 * The list's tab and the form's kind are deliberately separate pieces of state:
 * "what is on screen" is not "what is being recorded". The header button opens
 * the form on an expense, and the form's own toggle can switch to income without
 * first moving the list.
 *
 * Writes go straight to `/api/ledger` through the session's HTTP client. A
 * successful write is patched into local data first (so the row appears and the
 * scroll offset does not move) and only then followed by `reload()`, which the
 * hook debounces into a silent 2-second re-read.
 */

import { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { useConfirm } from '../components/ConfirmDialog.jsx';
import DemoBanner from '../components/DemoBanner.jsx';
import { FormMessage, SelectField } from '../components/form.jsx';
import { SolarIcon } from '../components/icons.jsx';
import { EmptyState, ErrorState, Eyebrow, LoadingState, Panel } from '../components/ui.jsx';
import TransactionForm from '../components/TransactionForm.jsx';
import { FETCH_LEDGER_REQUEST, useLedgerData } from '../hooks/useLedgerData.js';
import { useDemo } from '../state/DemoProvider.jsx';
import { useSession } from '../state/SessionProvider.jsx';
import { chipColor } from '../shared/category-colors.js';
import { countExpensesIn } from '../shared/ledger.js';
import {
  applyExpenseWrite,
  applyIncomeWrite,
  removeBudget,
  removeLedgerRow,
} from '../shared/optimistic-ledger.js';
import {
  currentMonthKey,
  formatDateLong,
  formatIDR,
  formatIDRCompact,
  formatMonthLabel,
  getCashflowSummary,
  monthKey,
} from '../shared/money.js';
import { tokens } from '../theme/tokens.js';
import { useTheme } from '../theme/useTheme.js';

const KINDS = [
  { kind: 'expense', label: 'Pengeluaran' },
  { kind: 'income', label: 'Pemasukan' },
];

export default function Transactions() {
  const session = useSession();
  const { isDemo, data: demoData } = useDemo();
  const { data, loading, error, syncError, reload, patchData } = useLedgerData(
    session.client,
    FETCH_LEDGER_REQUEST,
    isDemo ? demoData : null,
  );

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <ErrorState message="Sesi tidak ditemukan. Silakan masuk kembali." />;

  return (
    <TransactionsContent
      data={data}
      client={session.client}
      reload={reload}
      patchData={patchData}
      syncError={syncError}
      isDemo={isDemo}
    />
  );
}

// The route imports this name. Keep the default export as well so either import
// style resolves to the same screen.
export { Transactions as TransactionsScreen };

function TransactionsContent({ data, client, reload, patchData, syncError, isDemo }) {
  const resolved = useTheme().resolved;
  const t = tokens(resolved);
  const s = stylesFor(t);
  const router = useRouter();
  const { confirm, dialog } = useConfirm();

  /* Which list is on screen. Affects only the filters, the totals and the
     rows — never the form. */
  const [kind, setKind] = useState('expense');
  const [formVisible, setFormVisible] = useState(false);
  const [formKind, setFormKind] = useState('expense');
  const [editing, setEditing] = useState(null);
  const [mutationError, setMutationError] = useState(null);

  const [categoryFilter, setCategoryFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState(currentMonthKey());
  const [search, setSearch] = useState('');

  const { budgets, expenses, incomes = [] } = data;
  const isIncome = kind === 'income';
  const hasBudgets = budgets.length > 0;
  const month = currentMonthKey();

  const run = useCallback(async (fn) => {
    setMutationError(null);
    try {
      return await fn();
    } catch (err) {
      setMutationError(err?.message || 'Terjadi kesalahan');
      return null;
    }
  }, []);

  /**
   * The one write path: `client.request` returns the parsed payload. The guard
   * here is defence in depth — the UI handlers above already refuse demo taps,
   * but no caller can reach the API through this primitive either.
   */
  const write = useCallback(
    (payload) => {
      if (isDemo) return null;
      return client.request('/api/ledger', { body: payload });
    },
    [client, isDemo],
  );

  /**
   * Every month with at least one row of the *active* kind, newest first.
   * Scoped to the kind: a month with an expense but no income should not appear
   * in the income picker.
   */
  const monthsWithData = useMemo(() => {
    const dates = isIncome
      ? incomes.map((row) => row.received_on)
      : expenses.map((row) => row.spent_on);
    const keys = new Set(dates.map(monthKey).filter(Boolean));
    keys.add(currentMonthKey());
    return [...keys].sort((a, b) => b.localeCompare(a));
  }, [expenses, incomes, isIncome]);

  /** Search, month and category together. Income rows have no category. */
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = isIncome ? incomes : expenses;
    const dateOf = (row) => (isIncome ? row.received_on : row.spent_on);

    return rows.filter((row) => {
      if (monthFilter && monthKey(dateOf(row)) !== monthFilter) return false;
      if (!isIncome && categoryFilter && row.category_id !== categoryFilter) return false;
      if (term && !row.description.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [expenses, incomes, isIncome, monthFilter, categoryFilter, search]);

  /** Total of the rows currently visible, not of the whole month. */
  const visibleTotal = filtered.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);

  /* The summary always answers a question about the current month, so it does
     not follow the active tab: "Sisa" must mean the same figure on both. */
  const monthExpenses = expenses.filter((expense) => monthKey(expense.spent_on) === month);
  const monthIncomes = incomes.filter((income) => monthKey(income.received_on) === month);
  const summary = getCashflowSummary(monthIncomes, budgets, monthExpenses);

  const openForm = (which = 'expense') => {
    if (isDemo) return;
    setMutationError(null);
    setEditing(null);
    setFormKind(which);
    setFormVisible(true);
  };

  const closeForm = () => {
    setFormVisible(false);
    setEditing(null);
  };

  const handleEdit = (row) => {
    if (isDemo) return;
    setMutationError(null);
    setEditing(row);
    // The dialog follows the row, not the tab; its toggle is hidden while
    // editing, so this can never turn an expense into an income by accident.
    setFormKind(row.received_on !== undefined ? 'income' : 'expense');
    setFormVisible(true);
  };

  const handleSaved = ({ formIsIncome, input, editing: editedRow, written, keepOpen }) => {
    patchData((current) =>
      formIsIncome
        ? applyIncomeWrite(current, {
            id: written?.id,
            input,
            editingId: editedRow?.id,
          })
        : applyExpenseWrite(current, {
            id: written?.id,
            input,
            editingId: editedRow?.id,
          }),
    );
    // Silent, debounced: the patched row stays on screen and scroll does not
    // jump. The write itself has already finished before this runs.
    reload();
    if (!keepOpen) setMutationError(null);
  };

  const handleDelete = (row) => {
    if (isDemo) return;
    return confirm({
      title: 'Hapus transaksi ini?',
      description: `"${row.description}" sebesar ${formatIDR(row.amount)} akan dihapus permanen.\n\nTindakan ini tidak bisa dibatalkan.`,
      confirmLabel: 'Hapus transaksi',
      onConfirm: async () => {
        // Read the endpoint off the row, not the active tab.
        const isIncomeRow = row.received_on !== undefined;
        const ok = await run(() =>
          write({
            action: isIncomeRow ? 'deleteIncome' : 'deleteExpense',
            id: row.id,
          }),
        );
        if (!ok) return false;
        patchData((current) => removeLedgerRow(current, row.id));
        reload();
        return true;
      },
    });
  };

  /** Removing a category archives it; its transactions keep the name. */
  const handleCategoryDelete = (budget) => {
    if (isDemo) return;
    const count = countExpensesIn(expenses, budget.id);
    return confirm({
      title: `Hapus kategori "${budget.name}"?`,
      description: count
        ? `${count} transaksi tetap tersimpan dengan nama kategori "${budget.name}". Kategori ini hanya hilang dari daftar dan tidak bisa dipakai untuk transaksi baru.`
        : 'Kategori ini belum punya transaksi. Ia akan hilang dari daftar, dan nama yang sama bisa dipakai lagi.',
      confirmLabel: 'Hapus kategori',
      onConfirm: async () => {
        const ok = await run(() => write({ action: 'deleteBudget', id: budget.id }));
        if (!ok) return false;
        patchData((current) => removeBudget(current, budget.id));
        reload();
        return true;
      },
    });
  };

  const emptyLabel = (isIncome ? incomes : expenses).length
    ? 'Tidak ada transaksi yang cocok dengan filter ini.'
    : isIncome ? (
        <>
          Belum ada pemasukan.{' '}
          <Text
            style={[s.inlineLink, isDemo && s.disabled]}
            onPress={() => openForm('income')}
            disabled={isDemo}
            accessibilityState={{ disabled: isDemo }}
          >
            Catat pemasukan
          </Text>{' '}
          untuk menambah dana bulan ini.
        </>
      ) : !hasBudgets ? (
        <>
          Buat kategori anggaran dulu sebelum mencatat pengeluaran.{' '}
          <Text style={s.inlineLink} onPress={() => router.push('/settings')}>
            Buat kategori
          </Text>
          .
        </>
      ) : (
        <>
          Belum ada transaksi.{' '}
          <Text
            style={[s.inlineLink, isDemo && s.disabled]}
            onPress={() => openForm('expense')}
            disabled={isDemo}
            accessibilityState={{ disabled: isDemo }}
          >
            Catat pengeluaran
          </Text>{' '}
          pertama.
        </>
      );

  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={s.header}>
        <Text style={s.headerTitle}>Transaksi</Text>
        <Pressable
          style={[s.headerButton, isDemo && s.disabled]}
          onPress={() => openForm('expense')}
          disabled={isDemo}
          accessibilityRole="button"
          accessibilityState={{ disabled: isDemo }}
        >
          <Text style={s.headerButtonText}>Catat transaksi</Text>
          <SolarIcon name="arrow-right-up" size={15} color={t.accentInk} />
        </Pressable>
      </View>

      {isDemo ? (
        <DemoBanner>Mode demo — perubahan tidak disimpan</DemoBanner>
      ) : null}

      {/* Ringkasan — current month only, four figures and the category bars. */}
      <Panel style={s.summaryPanel}>
        <View style={s.cardHead}>
          <View>
            <Eyebrow>Bulan ini</Eyebrow>
            <Text style={s.h2}>Ringkasan</Text>
          </View>
          <Text style={s.monthTag}>{formatMonthLabel(month).toUpperCase()}</Text>
        </View>

        <View style={s.statGrid}>
          <Stat
            label="Pemasukan"
            value={formatIDR(summary.inflow)}
            tone={summary.inflow > 0 ? 'accent' : null}
          />
          <Stat label="Pengeluaran" value={formatIDR(summary.spent)} />
          <Stat
            label="Sisa"
            value={formatIDR(summary.remaining)}
            tone={summary.remaining < 0 ? 'danger' : null}
          />
          <Stat label="Alokasi anggaran" value={formatIDR(summary.allocated)} />
        </View>

        {hasBudgets && (
          <View style={s.categoryBlock}>
            <Text style={s.categoryHead}>Kategori bulan ini</Text>
            {summary.categories.map((category) => (
              <View style={s.categoryRow} key={category.id}>
                <Text style={s.categoryName} numberOfLines={1}>
                  {category.name}
                </Text>
                <Text style={s.categoryAmount} numberOfLines={1}>
                  {formatIDR(category.spent)}
                </Text>
                <Text style={[s.categoryPercent, category.over && s.percentDanger]}>
                  {Math.round(category.percent)}%
                </Text>
                <Pressable
                  style={[s.deleteCategory, isDemo && s.disabled]}
                  onPress={() => handleCategoryDelete(category)}
                  disabled={isDemo}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: isDemo }}
                  accessibilityLabel={`Hapus kategori ${category.name}`}
                  hitSlop={10}
                >
                  <SolarIcon name="trash-bin-minimalistic" size={12} color={t.subtle} />
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </Panel>

      {/* The list. */}
      <Panel style={s.listPanel}>
        <View style={s.listHead}>
          <View style={s.listHeadText}>
            <Eyebrow>Daftar {isIncome ? 'pemasukan' : 'pengeluaran'}</Eyebrow>
            <Text style={s.h2}>
              {monthFilter === month
                ? 'Transaksi bulan ini'
                : `Transaksi ${formatMonthLabel(monthFilter)}`}
            </Text>
          </View>
          <View style={s.countBadge}>
            <Text style={s.countText}>
              {filtered.length} {isIncome ? 'PEMASUKAN' : 'PENGELUARAN'}
            </Text>
          </View>
        </View>

        <View style={s.segment} accessibilityRole="group" accessibilityLabel="Jenis transaksi">
          {KINDS.map((tab) => {
            const active = tab.kind === kind;
            return (
              <Pressable
                key={tab.kind}
                style={[s.segmentButton, active && s.segmentButtonActive]}
                onPress={() => setKind(tab.kind)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[s.segmentText, active && s.segmentTextActive]}>{tab.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={s.filters}>
          <View style={s.searchBox}>
            <SolarIcon
              name="magnifier"
              size={14}
              color={t.subtle}
              style={s.searchIcon}
              pointerEvents="none"
            />
            <TextInput
              style={s.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Cari nama..."
              placeholderTextColor={t.ghost}
              accessibilityLabel="Cari transaksi"
              autoCorrect={false}
            />
          </View>

          <SelectField
            label=""
            accessibilityLabel="Filter bulan"
            value={monthFilter}
            onChange={setMonthFilter}
            options={monthsWithData.map((key) => ({ value: key, label: formatMonthLabel(key) }))}
            placeholder="Filter bulan"
          />

          {!isIncome && (
            <SelectField
              label=""
              accessibilityLabel="Filter kategori"
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={[
                { value: '', label: 'Semua kategori' },
                ...budgets.map((budget) => ({ value: budget.id, label: budget.name })),
              ]}
              placeholder="Semua kategori"
            />
          )}
        </View>

        <View style={s.totalRow}>
          <View style={s.totalLabel}>
            <SolarIcon name="filter" size={13} color={t.accentText} />
            <Text style={s.totalLabelText}>
              Total {isIncome ? 'pemasukan' : 'pengeluaran'}
            </Text>
          </View>
          <Text style={s.totalValue}>{formatIDR(visibleTotal)}</Text>
        </View>

        {filtered.length ? (
          <View style={s.rows}>
            {filtered.map((row) => (
              <TransactionRow
                key={row.id}
                row={row}
                isIncome={isIncome}
                budgets={budgets}
                resolved={resolved}
                disabled={isDemo}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
          </View>
        ) : (
          <EmptyState style={s.empty}>{emptyLabel}</EmptyState>
        )}

        <FormMessage error={mutationError || syncError} />
      </Panel>

      <TransactionForm
        visible={formVisible}
        onClose={closeForm}
        budgets={budgets}
        profile={data.profile}
        editing={editing}
        initialKind={formKind}
        onSave={write}
        onSaved={handleSaved}
        onOpenSettings={() => router.push('/settings')}
      />
      {dialog}
    </ScrollView>
  );
}

function Stat({ label, value, tone }) {
  const t = tokens(useTheme().resolved);
  const s = stylesFor(t);
  return (
    <View style={s.stat}>
      <Text style={s.statLabel}>{label}</Text>
      <Text
        style={[
          s.statValue,
          tone === 'danger' ? s.toneDanger : tone === 'accent' ? s.toneAccent : null,
        ]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

/**
 * One transaction row. On a phone there is no room for the name, the full IDR
 * figure and the two actions on one line, so the amount sits beside the name
 * (in compact form) and the actions beside the category/date — the same
 * two-line arrangement the web uses below `sm`.
 */
function TransactionRow({ row, isIncome, budgets, resolved, disabled, onEdit, onDelete }) {
  const t = tokens(resolved);
  const s = stylesFor(t);
  const budget = row.budgets ?? budgets.find((item) => item.id === row.category_id);
  const color = isIncome ? 'lime' : budget?.color ?? 'lime';
  const chip = chipColor(color, resolved);
  const name = isIncome ? row.source || 'Pemasukan' : budget?.name ?? 'Tanpa kategori';
  const dateValue = isIncome ? row.received_on : row.spent_on;
  const initial = isIncome ? '+' : row.description?.slice(0, 1).toUpperCase() ?? '?';

  return (
    <View style={s.row}>
      <View style={[s.chip, { backgroundColor: chip.bg }]}>
        <Text style={[s.chipText, { color: chip.text }]}>{initial}</Text>
      </View>
      <View style={s.rowBody}>
        <View style={s.rowTop}>
          <Text style={s.rowName} numberOfLines={1}>
            {row.description}
          </Text>
          <Text style={[s.rowAmount, isIncome && s.amountIncome]} numberOfLines={1}>
            {isIncome ? '+' : '−'}
            {formatIDRCompact(row.amount)}
          </Text>
        </View>
        <View style={s.rowBottom}>
          <Text style={s.rowMeta} numberOfLines={1}>
            {name}
            <Text style={s.metaDot}> · </Text>
            {formatDateLong(dateValue)}
          </Text>
          <View style={s.rowActions}>
            <Pressable
              style={[s.rowAction, disabled && s.disabled]}
              onPress={() => onEdit(row)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityState={{ disabled: !!disabled }}
              accessibilityLabel={`Ubah transaksi ${row.description}`}
              hitSlop={10}
            >
              <SolarIcon name="pen" size={13} color={t.subtle} />
            </Pressable>
            <Pressable
              style={[s.rowAction, disabled && s.disabled]}
              onPress={() => onDelete(row)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityState={{ disabled: !!disabled }}
              accessibilityLabel={`Hapus transaksi ${row.description}`}
              hitSlop={10}
            >
              <SolarIcon name="trash-bin-minimalistic" size={13} color={t.subtle} />
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const stylesFor = (t) =>
  StyleSheet.create({
    screen: { backgroundColor: t.bg },
    content: { marginTop: t.spacing.section, paddingBottom: 48 },
    // A read-only demo still shows where the write controls live; dimming them
    // says "disabled" without moving the layout the guest is looking at.
    disabled: { opacity: 0.4 },

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
    headerButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      height: 42,
      paddingHorizontal: 18,
      borderRadius: t.radius.md,
      backgroundColor: t.accent,
    },
    headerButtonText: { fontSize: 13, fontWeight: 'bold', letterSpacing: 0.26, color: t.accentInk },

    summaryPanel: { marginBottom: t.spacing.card },
    listPanel: { marginBottom: t.spacing.card },
    cardHead: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 10,
      marginBottom: t.spacing.card,
    },
    h2: {
      fontFamily: t.font.display,
      fontSize: 20,
      letterSpacing: -0.03,
      fontWeight: '500',
      color: t.ink,
      marginTop: 6,
    },
    monthTag: {
      fontFamily: t.font.mono,
      fontSize: 11,
      letterSpacing: 0.44,
      color: t.muted,
    },

    statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.card },
    stat: { width: '47%', minWidth: 0 },
    statLabel: {
      fontFamily: t.font.mono,
      fontSize: 11,
      letterSpacing: 0.44,
      color: t.subtle,
      marginBottom: 6,
      minHeight: 34,
    },
    statValue: {
      fontFamily: t.font.mono,
      fontSize: 15,
      fontWeight: '500',
      color: t.ink,
    },
    toneDanger: { color: t.danger },
    toneAccent: { color: t.accentText },

    categoryBlock: {
      marginTop: t.spacing.card,
      paddingTop: 15,
      borderTopWidth: 1,
      borderColor: t.line,
    },
    categoryHead: {
      fontFamily: t.font.mono,
      fontSize: 11,
      letterSpacing: 0.44,
      color: t.subtle,
      marginBottom: 10,
    },
    categoryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 6,
    },
    categoryName: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: '500', color: t.ink },
    categoryAmount: { fontFamily: t.font.mono, fontSize: 12, color: t.muted },
    categoryPercent: { width: 38, textAlign: 'right', fontFamily: t.font.mono, fontSize: 12, color: t.subtle },
    percentDanger: { color: t.danger },
    deleteCategory: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },

    listHead: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 10,
      marginBottom: t.spacing.card,
    },
    listHeadText: { flexShrink: 1 },
    countBadge: {
      borderWidth: 1,
      borderColor: t.line3,
      paddingHorizontal: 7,
      paddingVertical: 3,
      flexShrink: 0,
    },
    countText: {
      fontFamily: t.font.mono,
      fontSize: 11,
      letterSpacing: 0.66,
      color: t.muted,
    },

    segment: {
      flexDirection: 'row',
      borderWidth: 1,
      borderColor: t.line2,
      borderRadius: t.radius.sm,
      marginBottom: t.spacing.card,
      overflow: 'hidden',
    },
    segmentButton: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    segmentButtonActive: { backgroundColor: t.accent },
    segmentText: { fontSize: 12, fontWeight: '500', color: t.muted },
    segmentTextActive: { fontWeight: 'bold', color: t.accentInk },

    filters: { gap: 9, marginBottom: t.spacing.card },
    searchBox: {
      height: 44,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: t.shell,
      borderWidth: 1,
      borderColor: t.line2,
      borderRadius: t.radius.sm,
      paddingHorizontal: 10,
    },
    searchIcon: { marginRight: 8 },
    searchInput: { flex: 1, fontSize: 13, color: t.ink, padding: 0 },

    totalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      paddingVertical: 11,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: t.line,
      marginBottom: t.spacing.card,
    },
    totalLabel: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    totalLabelText: {
      fontFamily: t.font.mono,
      fontSize: 11,
      letterSpacing: 0.44,
      color: t.muted,
    },
    totalValue: { fontFamily: t.font.mono, fontSize: 13, color: t.ink },

    rows: { borderTopWidth: 0 },
    row: { flexDirection: 'row', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderColor: t.line },
    chip: {
      width: 30,
      height: 30,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: t.radius.xs,
    },
    chipText: { fontFamily: t.font.mono, fontSize: 12, fontWeight: 'bold' },
    rowBody: { flex: 1, minWidth: 0 },
    rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    rowName: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: '500', color: t.ink },
    rowAmount: { fontFamily: t.font.mono, fontSize: 13, color: t.ink, flexShrink: 0 },
    amountIncome: { color: t.accentText },
    rowBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 4 },
    rowMeta: { flex: 1, minWidth: 0, fontSize: 12, color: t.muted },
    metaDot: { color: t.ghost },
    rowActions: { flexDirection: 'row', flexShrink: 0 },
    rowAction: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    empty: { marginTop: 0 },
    inlineLink: { fontSize: 13, color: t.accentText, textDecorationLine: 'underline' },
  });
