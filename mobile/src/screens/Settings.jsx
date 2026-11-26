/**
 * The Pengaturan screen — the native mirror of `src/app/settings/page.jsx`.
 *
 * Money in has one home: the Transaksi tab, where an income row is just a
 * description, an optional source, an amount and a date. The first panel is
 * the way in from here, not a second editor with its own rules. The second
 * panel owns categories: create, edit, cancel and archive, with the same copy
 * and the same five colours as the web.
 *
 * Writes go straight to `/api/ledger` through the session's HTTP client. A
 * successful write is patched into local data first (so the row changes and
 * the scroll offset does not move) and only then followed by `reload()`, which
 * the hook debounces into a silent 2-second re-read. Removing a category is an
 * archive: the row stays behind as the category name on past transactions.
 */

import { useCallback, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { useConfirm } from '../components/ConfirmDialog.jsx';
import DemoBanner from '../components/DemoBanner.jsx';
import { Button, FormMessage, GhostButton, NumberField, TextField } from '../components/form.jsx';
import { SolarIcon } from '../components/icons.jsx';
import { EmptyState, ErrorState, Eyebrow, LoadingState, Panel } from '../components/ui.jsx';
import { FETCH_LEDGER_REQUEST, useLedgerData } from '../hooks/useLedgerData.js';
import { useDemo } from '../state/DemoProvider.jsx';
import { useSession } from '../state/SessionProvider.jsx';
import { barColor, chipColor } from '../shared/category-colors.js';
import { BUDGET_COLORS, countExpensesIn, validateBudget } from '../shared/ledger.js';
import { applyBudgetWrite, removeBudget } from '../shared/optimistic-ledger.js';
import { formatIDR } from '../shared/money.js';
import { tokens } from '../theme/tokens.js';
import { useTheme } from '../theme/useTheme.js';

const BLANK_BUDGET = { name: '', monthlyLimit: '', color: 'lime' };

/** The three account links the web keeps in its sidebar menu. */
const ACCOUNT_LINKS = [
  { label: 'Profil', icon: 'user', path: '/settings/profile' },
  { label: 'Bantuan', icon: 'help', path: '/help' },
  { label: 'Tentang', icon: 'info-circle', path: '/about' },
];

export default function Settings() {
  const session = useSession();
  const { isDemo, data: demoData } = useDemo();
  const { data, loading, error, syncError, reload, patchData } = useLedgerData(
    session.client,
    FETCH_LEDGER_REQUEST,
    isDemo ? demoData : null,
  );

  if (loading) return <LoadingState label="Memuat pengaturan..." />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <ErrorState message="Sesi tidak ditemukan. Silakan masuk kembali." />;

  return (
    <SettingsContent
      data={data}
      client={session.client}
      reload={reload}
      patchData={patchData}
      syncError={syncError}
      isDemo={isDemo}
    />
  );
}

// The route imports `{ Settings }`; keep the default and the older alias too so
// every import style resolves to the same component. `expo export` bundles an
// undefined named import without complaint, so tests/settings-exports.test.mjs
// pins this binding at source level.
export { Settings, Settings as SettingsScreen };

function SettingsContent({ data, client, reload, patchData, syncError, isDemo }) {
  const resolved = useTheme().resolved;
  const t = tokens(resolved);
  const s = stylesFor(t);
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const scrollRef = useRef(null);

  const [draft, setDraft] = useState(BLANK_BUDGET);
  const [draftErrors, setDraftErrors] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [success, setSuccess] = useState('');
  const [mutationError, setMutationError] = useState(null);
  const [busy, setBusy] = useState(false);

  const { budgets = [], expenses = [] } = data;

  const setDraftField = (key, value) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setDraftErrors((prev) => ({ ...prev, [key]: undefined }));
    setSuccess('');
    setMutationError(null);
  };

  const run = useCallback(async (fn) => {
    setMutationError(null);
    setBusy(true);
    try {
      return await fn();
    } catch (err) {
      setMutationError(err?.message || 'Terjadi kesalahan');
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  /**
   * The one write path: `client.request` returns the parsed payload. The guard
   * is defence in depth behind the disabled form and the handler checks.
   */
  const write = useCallback(
    (payload) => {
      if (isDemo) return null;
      return client.request('/api/ledger', { body: payload });
    },
    [client, isDemo],
  );

  const handleSubmit = async () => {
    if (isDemo) return;
    const errors = validateBudget(draft, { budgets, ignoreId: editingId });
    setDraftErrors(errors);
    setSuccess('');
    setMutationError(null);

    if (Object.keys(errors).length) return;

    const written = editingId
      ? await run(() => write({ action: 'updateBudget', id: editingId, input: draft }))
      : await run(() => write({ action: 'createBudget', input: draft }));
    if (!written) return;

    patchData((current) =>
      applyBudgetWrite(current, { id: written?.id, input: draft, editingId }),
    );
    setSuccess(editingId ? 'Kategori diperbarui.' : 'Kategori ditambahkan.');
    setDraft(BLANK_BUDGET);
    setDraftErrors({});
    setEditingId(null);
    reload();
  };

  const startEdit = (budget) => {
    if (isDemo) return;
    setEditingId(budget.id);
    setDraft({
      name: budget.name,
      monthlyLimit: String(budget.monthly_limit),
      color: budget.color,
    });
    setDraftErrors({});
    setSuccess('');
    setMutationError(null);
    // The form sits above the list; bring it back into view before editing.
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(BLANK_BUDGET);
    setDraftErrors({});
  };

  const handleDelete = (budget) => {
    if (isDemo) return;
    const count = countExpensesIn(expenses, budget.id);

    return confirm({
      title: `Hapus kategori "${budget.name}"?`,
      description: count
        ? `${count} transaksi tetap tersimpan dengan nama kategori "${budget.name}". Kategori ini hanya hilang dari daftar dan tidak bisa dipakai untuk transaksi baru.`
        : 'Kategori ini belum punya transaksi. Ia akan hilang dari daftar, dan nama yang sama bisa dipakai lagi.',
      confirmLabel: 'Hapus kategori',
      onConfirm: async () => {
        if (editingId === budget.id) cancelEdit();

        const ok = await run(() => write({ action: 'deleteBudget', id: budget.id }));
        if (!ok) return false;

        patchData((current) => removeBudget(current, budget.id));
        setSuccess('Kategori dihapus dari daftar. Transaksinya tetap tersimpan.');
        reload();
        return true;
      },
    });
  };

  return (
    <ScrollView
      ref={scrollRef}
      style={s.screen}
      contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={s.header}>
        <Text style={s.headerTitle}>Pengaturan</Text>
      </View>

      {isDemo ? (
        <DemoBanner>Mode demo — perubahan tidak disimpan</DemoBanner>
      ) : null}

      {/* The card gutter lives here rather than on the ScrollView: applying a
          `gap` to the content container also pushes the first card 16px below
          the header, so the section rhythm became 48px instead of 32px. */}
      <View style={s.cardStack}>
        {/* Money in has one home, /transactions. This is the way in from here. */}
        <Panel>
          <Eyebrow style={s.eyebrowGap}>Pemasukan</Eyebrow>
          <Text style={[s.h2, s.h2Lead]}>Catat uang masuk</Text>
          <Text style={s.bodyCopy}>
            Semua pemasukan dicatat lewat halaman Transaksi, bersama pengeluaran. Di sini kamu hanya
            mengatur kategori dan batas anggaran untuk uang yang keluar.
          </Text>
          <Pressable
            style={s.linkButton}
            onPress={() => router.push('/transactions')}
            accessibilityRole="button"
          >
            <Text style={s.linkButtonText}>Buka transaksi</Text>
            <SolarIcon name="arrow-right-up" size={15} color={t.accentInk} />
          </Pressable>
        </Panel>

        {/* A new account starts with no categories, so this form is the only way
            to make an expense possible. */}
        <Panel>
          <View style={s.cardHead}>
            <View style={s.cardHeadText}>
              <Eyebrow>Anggaranmu</Eyebrow>
              <Text style={[s.h2, s.h2InHead]}>Anggaran kategori</Text>
            </View>
            <View style={s.countBadge}>
              <Text style={s.countText}>{budgets.length} kategori</Text>
            </View>
          </View>

          <View style={s.form}>
            <View style={s.formHead}>
              <Text style={s.formKicker}>{editingId ? 'Ubah kategori' : 'Kategori baru'}</Text>
              {editingId ? (
                <Pressable onPress={cancelEdit} accessibilityRole="button">
                  <Text style={s.cancelText}>Batal</Text>
                </Pressable>
              ) : null}
            </View>

            <View style={s.fields}>
              <TextField
                label="Nama kategori"
                value={draft.name}
                onChange={(value) => setDraftField('name', value)}
                error={draftErrors.name}
                placeholder="Contoh: Kesehatan"
                maxLength={60}
                autoCorrect={false}
                editable={!isDemo}
              />
              <NumberField
                label="Batas bulanan"
                value={draft.monthlyLimit}
                onChange={(value) => setDraftField('monthlyLimit', value.replace(/[^\d]/g, ''))}
                error={draftErrors.monthlyLimit}
                align="right"
                editable={!isDemo}
              />
            </View>

            <View style={s.colorBlock}>
              <Text style={s.colorLabel}>Warna</Text>
              <View style={s.swatchRow} accessibilityRole="group" accessibilityLabel="Warna kategori">
                {BUDGET_COLORS.map((color) => {
                  const selected = draft.color === color;
                  return (
                    // The web labels each radio with the bare colour token
                    // (`title={color}` and an sr-only span); the group above
                    // supplies the "Warna kategori" context.
                    <Pressable
                      key={color}
                      style={[s.swatchHit, isDemo && s.disabled]}
                      onPress={() => setDraftField('color', color)}
                      disabled={isDemo}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected, disabled: isDemo }}
                      accessibilityLabel={color}
                    >
                      <View
                        style={[
                          s.swatch,
                          { backgroundColor: barColor(color, resolved) },
                          selected && s.swatchSelected,
                        ]}
                      />
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <FormMessage error={mutationError || syncError} success={success} />

            <View style={s.formActions}>
              <View style={s.submitWrap}>
                <Button
                  onPress={handleSubmit}
                  busy={busy}
                  busyLabel="Menyimpan..."
                  disabled={isDemo}
                >
                  {editingId ? 'Simpan perubahan' : 'Tambah kategori'}
                </Button>
              </View>
              {editingId ? (
                <GhostButton onPress={cancelEdit}>Batal</GhostButton>
              ) : null}
            </View>
          </View>

          {budgets.length ? (
            <View style={s.rows}>
              {budgets.map((budget) => {
                const chip = chipColor(budget.color, resolved);
                return (
                  <View style={s.row} key={budget.id}>
                    <View style={[s.chip, { backgroundColor: chip.bg }]}>
                      <Text style={[s.chipText, { color: chip.text }]}>
                        {budget.name.slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={s.rowName} numberOfLines={1}>
                      {budget.name}
                    </Text>
                    <Text style={s.rowLimit} numberOfLines={1}>
                      {formatIDR(budget.monthly_limit)}
                    </Text>
                    <View style={s.rowActions}>
                      <Pressable
                        style={[s.rowAction, isDemo && s.disabled]}
                        onPress={() => startEdit(budget)}
                        disabled={isDemo}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: isDemo }}
                        accessibilityLabel={`Ubah kategori ${budget.name}`}
                        hitSlop={10}
                      >
                        <SolarIcon name="pen" size={14} color={t.subtle} />
                      </Pressable>
                      <Pressable
                        style={[s.rowAction, isDemo && s.disabled]}
                        onPress={() => handleDelete(budget)}
                        disabled={isDemo}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: isDemo }}
                        accessibilityLabel={`Hapus kategori ${budget.name}`}
                        hitSlop={10}
                      >
                        <SolarIcon name="trash-bin-minimalistic" size={14} color={t.subtle} />
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <EmptyState>
              Belum ada kategori. Tambahkan minimal satu agar transaksi bisa dicatat.
            </EmptyState>
          )}
        </Panel>

        {/* The web puts these in the sidebar's account popover; on a phone the
            Settings tab is where a person looks for them. */}
        <Panel>
          <Eyebrow style={s.eyebrowGap}>Lainnya</Eyebrow>
          {ACCOUNT_LINKS.map((link) => (
            <Pressable
              key={link.path}
              style={s.linkRow}
              onPress={() => router.push(link.path)}
              accessibilityRole="link"
            >
              <SolarIcon name={link.icon} size={17} color={t.body} />
              <Text style={s.linkRowText}>{link.label}</Text>
              <SolarIcon name="alt-arrow-right" size={14} color={t.subtle} />
            </Pressable>
          ))}
        </Panel>
      </View>

      {dialog}
    </ScrollView>
  );
}

const stylesFor = (t) =>
  StyleSheet.create({
    screen: { backgroundColor: t.bg },
    content: { marginTop: t.spacing.section, paddingBottom: 48 },
    cardStack: { gap: t.spacing.card },
    disabled: { opacity: 0.4 },

    header: { marginBottom: t.spacing.section },
    headerTitle: {
      fontFamily: t.font.display,
      fontSize: 36,
      lineHeight: 41,
      letterSpacing: -0.065,
      fontWeight: '500',
      color: t.ink,
    },

    eyebrowGap: { marginBottom: t.spacing.card },
    h2: {
      fontFamily: t.font.display,
      fontSize: 20,
      letterSpacing: -0.04,
      fontWeight: '500',
      color: t.ink,
      marginTop: 6,
      marginBottom: t.spacing.card,
    },
    // The web sets the income card's heading at 19px; the category card's is 20px.
    h2Lead: { fontSize: 19 },
    // The category card's header owns its own bottom gutter, as on the web.
    h2InHead: { marginBottom: 0 },
    bodyCopy: {
      fontSize: 13,
      lineHeight: 21,
      color: t.muted,
      marginBottom: t.spacing.card,
    },
    linkButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      height: 42,
      paddingHorizontal: 18,
      borderRadius: t.radius.md,
      backgroundColor: t.accent,
      alignSelf: 'flex-start',
    },
    linkButtonText: { fontSize: 13, fontWeight: 'bold', letterSpacing: 0.26, color: t.accentInk },

    cardHead: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 10,
      marginBottom: 17,
    },
    cardHeadText: { flexShrink: 1 },
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

    form: {
      borderWidth: 1,
      borderColor: t.line,
      padding: 18,
      marginBottom: 20,
      backgroundColor: t.sunken,
      gap: 15,
    },
    formHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    formKicker: {
      fontFamily: t.font.mono,
      fontSize: 11,
      letterSpacing: 1.1,
      color: t.muted,
      textTransform: 'uppercase',
    },
    cancelText: { fontSize: 12, color: t.muted },
    fields: { gap: 12 },
    colorBlock: { gap: 9 },
    colorLabel: { fontSize: 12, fontWeight: '500', color: t.body },
    swatchRow: { flexDirection: 'row', gap: 8 },
    swatchHit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    swatch: {
      width: 28,
      height: 28,
      borderRadius: t.radius.xs,
      borderWidth: 2,
      borderColor: t.sunken,
    },
    swatchSelected: {
      borderColor: t.accentText,
      transform: [{ scale: 1.1 }],
    },
    formActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, alignItems: 'center' },
    submitWrap: { flexGrow: 1, flexBasis: 160 },

    rows: { borderTopWidth: 1, borderColor: t.line },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderColor: t.line,
    },
    chip: {
      width: 28,
      height: 28,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: t.radius.xs,
    },
    chipText: { fontFamily: t.font.mono, fontSize: 12, fontWeight: '500' },
    rowName: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: '500', color: t.ink },
    rowLimit: { fontFamily: t.font.mono, fontSize: 12, color: t.body, flexShrink: 0 },
    rowActions: { flexDirection: 'row', flexShrink: 0 },
    rowAction: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },

    linkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 12,
      borderTopWidth: 1,
      borderColor: t.line,
    },
    linkRowText: { flex: 1, minWidth: 0, fontSize: 13, color: t.ink },
  });
