import { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { EmptyState, Eyebrow } from './ui.jsx';
import { FormMessage, SelectField, TextField } from './form.jsx';
import { SolarIcon } from './icons.jsx';
import { useTheme } from '../theme/useTheme.js';
import { tokens } from '../theme/tokens.js';
import { formatDigits, formatMonthLabel, monthStart, todayISO } from '../shared/money.js';
import { validateExpense, validateIncome } from '../shared/ledger.js';

/**
 * The transaction form sheet — the native mirror of the `<dialog>` in
 * `src/app/transactions/page.jsx` on the web app. Same copy, same field order,
 * same two save buttons, same validation messages.
 *
 * The form owns its own kind (`formKind`). The list's tab is a separate piece
 * of state on the screen: watching the income list is not the same question as
 * choosing what to record, so the header's "Catat transaksi" opens on the
 * expense form without first switching the whole page over.
 *
 * Writes go out through the injected `onSave`, which owns the HTTP client; the
 * caller's `onSaved` applies the optimistic patch and starts the silent
 * refresh. Keeping the network out of this component makes it usable from a
 * render test and keeps the screen's write path in one place.
 */

const BLANK_EXPENSE = { description: '', amount: '', categoryId: '', spentOn: todayISO() };
const BLANK_INCOME = { description: '', amount: '', source: '', receivedOn: todayISO() };

const KINDS = [
  { kind: 'expense', label: 'Pengeluaran' },
  { kind: 'income', label: 'Pemasukan' },
];

export default function TransactionForm({
  visible,
  onClose,
  budgets = [],
  profile,
  editing = null,
  initialKind = 'expense',
  onSave,
  onSaved,
  onOpenSettings,
}) {
  const t = tokens(useTheme().resolved);
  const s = stylesFor(t);

  const [formKind, setFormKind] = useState(initialKind);
  const [form, setForm] = useState(BLANK_EXPENSE);
  const [incomeForm, setIncomeForm] = useState(BLANK_INCOME);
  const [fieldErrors, setFieldErrors] = useState({});
  const [mutationError, setMutationError] = useState(null);
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  // Open on the row being edited, or on a blank form of the requested kind.
  // Both shapes stay in state: switching the toggle mid-entry loses nothing.
  useEffect(() => {
    if (!visible) return;
    const editingIncome = editing?.received_on !== undefined;
    setFormKind(editing ? (editingIncome ? 'income' : 'expense') : initialKind);
    setForm(
      editing && !editingIncome
        ? {
            description: editing.description,
            amount: String(editing.amount),
            categoryId: editing.category_id,
            spentOn: editing.spent_on,
          }
        : BLANK_EXPENSE,
    );
    setIncomeForm(
      editing && editingIncome
        ? {
            description: editing.description,
            amount: String(editing.amount),
            source: editing.source ?? '',
            receivedOn: editing.received_on,
          }
        : BLANK_INCOME,
    );
    setFieldErrors({});
    setMutationError(null);
    setSuccess('');
    setBusy(false);
  }, [visible, editing, initialKind]);

  const formIsIncome = formKind === 'income';
  const formValue = formIsIncome ? incomeForm : form;
  const setFormValue = formIsIncome ? setIncomeForm : setForm;
  const dateKey = formIsIncome ? 'receivedOn' : 'spentOn';
  const hasBudgets = budgets.length > 0;

  const setField = (name, value) => {
    setFormValue((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
    setMutationError(null);
    setSuccess('');
  };

  const handleKindChange = (next) => {
    if (next === formKind || editing || busy) return;
    setFormKind(next);
    // "Kategori belum dipilih" belongs to the form just left; it must not
    // greet the visitor on the other side of the toggle.
    setFieldErrors({});
    setMutationError(null);
    setSuccess('');
  };

  const handleSubmit = async ({ keepOpen = false } = {}) => {
    if (busy) return;
    const errors = formIsIncome ? validateIncome(incomeForm) : validateExpense(form, budgets);
    const today = todayISO();
    if (!errors[dateKey] && formValue[dateKey] > today) {
      errors[dateKey] = 'Tanggal tidak boleh di masa depan.';
    }
    setFieldErrors(errors);
    setMutationError(null);
    setSuccess('');
    if (Object.keys(errors).length) return;

    // The profile comes from the ledger API, not a second session lookup.
    if (!profile?.created_at) {
      setMutationError('Gagal memvalidasi bulan akun. Silakan coba lagi.');
      return;
    }
    const accountMonth = monthStart(profile.created_at);
    if (monthStart(formValue[dateKey]) < accountMonth) {
      setFieldErrors((prev) => ({
        ...prev,
        [dateKey]: `Tanggal harus berada pada bulan pembuatan akun (${formatMonthLabel(accountMonth)}) atau setelahnya.`,
      }));
      return;
    }

    setBusy(true);
    let written = null;
    try {
      written = await onSave({
        action: formIsIncome
          ? editing
            ? 'updateIncome'
            : 'createIncome'
          : editing
            ? 'updateExpense'
            : 'createExpense',
        input: formValue,
        ...(editing ? { id: editing.id } : {}),
      });
    } catch (err) {
      setMutationError(err?.message || 'Terjadi kesalahan');
      setBusy(false);
      return;
    }
    setBusy(false);

    onSaved?.({ formIsIncome, input: formValue, editing, written, keepOpen });

    if (keepOpen && !editing) {
      // Several rows in a row are the normal case. Clear what differs per row
      // and keep what usually does not: category on an expense, date on both.
      const blank = formIsIncome ? BLANK_INCOME : BLANK_EXPENSE;
      const kept = formIsIncome
        ? { receivedOn: incomeForm.receivedOn }
        : { categoryId: form.categoryId, spentOn: form.spentOn };
      setFormValue({ ...blank, ...kept });
      setFieldErrors({});
      setSuccess('Tersimpan. Isi catatan berikutnya di form ini.');
      return;
    }
    onClose?.();
  };

  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <ScrollView
        style={s.sheet}
        contentContainerStyle={s.sheetContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.head}>
          <Eyebrow>{editing ? 'Ubah catatan' : 'Catatan baru'}</Eyebrow>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Tutup">
            <Text style={s.close}>Tutup</Text>
          </Pressable>
        </View>
        <Text style={s.title}>
          {editing
            ? formIsIncome
              ? 'Ubah pemasukan'
              : 'Ubah pengeluaran'
            : formIsIncome
              ? 'Catat pemasukan'
              : 'Catat pengeluaran'}
        </Text>

        {/* Hidden while editing: the row being edited already has a kind, and
            flipping a switch would turn a delete-and-create into one control. */}
        {!editing && (
          <View style={s.segment} accessibilityRole="group" accessibilityLabel="Jenis transaksi">
            {KINDS.map((option) => {
              const active = option.kind === formKind;
              return (
                <Pressable
                  key={option.kind}
                  style={[s.segmentButton, active && s.segmentButtonActive]}
                  onPress={() => handleKindChange(option.kind)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[s.segmentText, active && s.segmentTextActive]}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {!formIsIncome && !hasBudgets ? (
          /* An expense row needs a category, so a new account with none is a
             dead end here. Point straight at the settings screen. */
          <View>
            <EmptyState>Buat kategori anggaran dulu sebelum mencatat pengeluaran.</EmptyState>
            <ActionButton
              label="Buat kategori"
              icon="arrow-right-up"
              onPress={onOpenSettings}
              style={s.fullButton}
            />
          </View>
        ) : (
          <View style={s.fields}>
            <TextField
              label={formIsIncome ? 'Nama pemasukan' : 'Nama pengeluaran'}
              value={formValue.description}
              onChange={(text) => setField('description', text)}
              error={fieldErrors.description}
              placeholder={formIsIncome ? 'Contoh: THR' : 'Contoh: Belanja mingguan'}
              maxLength={80}
              autoCorrect={false}
            />

            {/* Digits are what validation and Postgres want; the separators are
                display only, so the user can check a long rupiah against a
                receipt without miscounting a zero. */}
            <TextField
              label="Nominal"
              value={formatDigits(formValue.amount)}
              onChange={(text) => setField('amount', text.replace(/\D/g, ''))}
              error={fieldErrors.amount}
              placeholder="0"
              keyboardType="numeric"
            />

            {formIsIncome ? (
              <TextField
                label="Sumber (opsional)"
                value={incomeForm.source}
                onChange={(text) => setField('source', text)}
                error={fieldErrors.source}
                placeholder="Contoh: THR"
                maxLength={40}
                autoCorrect={false}
              />
            ) : (
              <SelectField
                label="Kategori"
                value={form.categoryId}
                onChange={(value) => setField('categoryId', value)}
                error={fieldErrors.categoryId}
                options={budgets.map((budget) => ({ value: budget.id, label: budget.name }))}
                placeholder="Pilih kategori"
              />
            )}

            <View>
              <TextField
                label="Tanggal"
                value={formValue[dateKey]}
                onChange={(text) => setField(dateKey, text)}
                error={fieldErrors[dateKey]}
                placeholder="YYYY-MM-DD"
                keyboardType="numbers-and-punctuation"
                autoCorrect={false}
                autoCapitalize="none"
                maxLength={10}
              />
              <Pressable
                style={s.todayButton}
                onPress={() => setField(dateKey, todayISO())}
                accessibilityRole="button"
              >
                <Text style={s.todayText}>Hari ini</Text>
              </Pressable>
            </View>

            <FormMessage error={mutationError} success={success} />

            {/* Both save buttons carry equal weight. The first finishes and
                closes; the second keeps the sheet open for the next row, with
                the category/date already filled in. */}
            <View style={s.actions}>
              <ActionButton
                label={editing ? 'Simpan perubahan' : 'Simpan & selesai'}
                busyLabel="Menyimpan..."
                busy={busy}
                onPress={() => handleSubmit()}
                icon="arrow-right-up"
              />
              {editing ? (
                <GhostAction label="Batal" onPress={onClose} disabled={busy} />
              ) : (
                <GhostAction
                  label="Simpan & catat lagi"
                  onPress={() => handleSubmit({ keepOpen: true })}
                  disabled={busy}
                />
              )}
            </View>

            <Text style={s.footer}>
              {formIsIncome
                ? 'Pemasukan ini menambah dana bulan yang sama.'
                : 'Catatan tersimpan di akunmu dan bisa diubah kapan saja.'}
            </Text>
          </View>
        )}
      </ScrollView>
    </Modal>
  );
}

/** Local action button: the shared Button renders a string, not a glyph. */
function ActionButton({ label, busyLabel, busy, onPress, icon, style }) {
  const t = tokens(useTheme().resolved);
  const s = stylesFor(t);
  return (
    <Pressable
      style={[s.button, style]}
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityState={{ busy: !!busy, disabled: !!busy }}
    >
      <Text style={s.buttonText}>{busy ? busyLabel : label}</Text>
      {icon ? <SolarIcon name={icon} size={15} color={t.accentInk} /> : null}
    </Pressable>
  );
}

function GhostAction({ label, onPress, disabled }) {
  const t = tokens(useTheme().resolved);
  const s = stylesFor(t);
  return (
    <Pressable
      style={s.ghost}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
    >
      <Text style={s.ghostText}>{label}</Text>
    </Pressable>
  );
}

const stylesFor = (t) =>
  StyleSheet.create({
    sheet: { backgroundColor: t.panel },
    sheetContent: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40 },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    close: { fontSize: 12, color: t.muted },
    title: {
      fontFamily: t.font.display,
      fontSize: 20,
      letterSpacing: -0.03,
      fontWeight: '500',
      color: t.ink,
      marginBottom: 16,
    },
    segment: {
      flexDirection: 'row',
      borderWidth: 1,
      borderColor: t.line2,
      borderRadius: t.radius.sm,
      marginBottom: 16,
      overflow: 'hidden',
    },
    segmentButton: { flex: 1, height: 38, alignItems: 'center', justifyContent: 'center' },
    segmentButtonActive: { backgroundColor: t.accent },
    segmentText: { fontSize: 13, fontWeight: '500', color: t.muted },
    segmentTextActive: { fontWeight: 'bold', color: t.accentInk },
    fields: { gap: 15 },
    todayButton: { alignSelf: 'flex-end', marginTop: 6 },
    todayText: { fontSize: 12, color: t.accentText, textDecorationLine: 'underline' },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, alignItems: 'center' },
    button: {
      flex: 1,
      minWidth: 160,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      height: 44,
      paddingHorizontal: 18,
      borderRadius: t.radius.md,
      backgroundColor: t.accent,
    },
    buttonText: { color: t.accentInk, fontWeight: 'bold', fontSize: 13 },
    ghost: {
      flex: 1,
      minWidth: 160,
      alignItems: 'center',
      justifyContent: 'center',
      height: 44,
      paddingHorizontal: 18,
      borderRadius: t.radius.md,
      borderWidth: 1,
      borderColor: t.line3,
    },
    ghostText: { color: t.ink, fontWeight: 'bold', fontSize: 13 },
    fullButton: { width: '100%', marginTop: 12 },
    footer: { fontSize: 12, lineHeight: 19, color: t.subtle, textAlign: 'center' },
  });
