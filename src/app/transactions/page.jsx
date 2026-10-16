'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLedgerData, useMutation } from '@/hooks/useLedgerData';
import { useScrollLock } from '@/hooks/useScrollLock';
import { createClient } from '@/lib/client';
import {
  countExpensesIn,
  createExpense,
  createIncome,
  deleteBudget,
  deleteExpense,
  deleteIncome,
  fetchLedger,
  updateExpense,
  updateIncome,
  validateExpense,
  validateIncome,
} from '@/lib/ledger';
import {
  currentMonthKey,
  formatIDR,
  formatMonthLabel,
  getCashflowSummary,
  monthKey,
  monthStart,
  todayISO,
} from '@/lib/money';
import { Button, FormMessage, GhostButton, NumberField, SelectField, TextField } from '@/components/form';
import { useConfirm } from '@/components/confirm-dialog';
import { ExpenseList } from '@/components/expense-row';
import { ArrowRightUpIcon, FilterIcon, MagnifierIcon } from '@/components/icons';
import { EmptyState, ErrorState, Eyebrow, LoadingState, Panel } from '@/components/ui';

const BLANK_EXPENSE = { description: '', amount: '', categoryId: '', spentOn: todayISO() };
const BLANK_INCOME = { description: '', amount: '', source: '', receivedOn: todayISO() };

/**
 * The two sides of the ledger.
 *
 * `label` is what the list tabs say; the form's own toggle reuses it, so the
 * two never drift into calling the same thing by different names.
 */
const KINDS = [
  { kind: 'expense', label: 'Pengeluaran' },
  { kind: 'income', label: 'Pemasukan' },
];

export default function TransactionsPage() {
  const { data, loading, error, reload } = useLedgerData(fetchLedger);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <ErrorState message="Sesi tidak ditemukan. Silakan masuk kembali." />;

  return <TransactionsContent data={data} reload={reload} />;
}

function TransactionsContent({ data, reload }) {
  /* Which list is on screen. Affects only the filters, the totals and the rows —
     never the form. */
  const [kind, setKind] = useState('expense');

  /* Which side the open dialog is writing. Separate from `kind` on purpose: the
     "Catat" button sits in the page header, so tying it to a list tab would make
     recording a bonus require first switching the whole page over. */
  const [formKind, setFormKind] = useState('expense');
  const [form, setForm] = useState(BLANK_EXPENSE);
  const [incomeForm, setIncomeForm] = useState(BLANK_INCOME);
  const [fieldErrors, setFieldErrors] = useState({});
  const [editing, setEditing] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const formDialog = useRef(null);
  const [success, setSuccess] = useState('');

  const [categoryFilter, setCategoryFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState(currentMonthKey());
  const [search, setSearch] = useState('');

  const [run, busy, mutationError, setMutationError] = useMutation();
  const { confirm, dialog } = useConfirm();
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    const dialog = formDialog.current;
    if (!dialog) return;
    if (formOpen && !dialog.open) dialog.showModal();
    if (!formOpen && dialog.open) dialog.close();
  }, [formOpen]);

  /**
   * `showModal()` makes the page inert to input but does not stop it scrolling,
   * so the background kept moving under the backdrop on a trackpad. The lock
   * waits for the element itself rather than for `formOpen`: this dialog fades
   * out over 200ms, and releasing the lock the instant `close()` runs lets the
   * page scroll while the panel is still visibly sitting on top of it.
   *
   * The native `close` event fires after the exit transition has finished, which
   * is exactly the moment the overlay stops being visible.
   */
  const [dialogVisible, setDialogVisible] = useState(false);
  useScrollLock(dialogVisible);

  useEffect(() => {
    const dialog = formDialog.current;
    if (!dialog) return undefined;

    if (formOpen) {
      setDialogVisible(true);
      return undefined;
    }

    // Already fully closed — nothing was on screen, so nothing to wait for.
    if (!dialog.open) {
      setDialogVisible(false);
      return undefined;
    }

    const onClose = () => setDialogVisible(false);
    dialog.addEventListener('close', onClose);
    return () => dialog.removeEventListener('close', onClose);
  }, [formOpen]);

  /**
   * Put the cursor in the first field when the dialog opens.
   *
   * A `<dialog>` shows modal and traps focus, but it does not choose *where*
   * focus lands — the browser puts it on the dialog itself, so the first thing
   * an entering user does is click a field. Since the overwhelmingly common
   * flow is "type a name, type an amount, submit", the dialog opens on the name
   * field and the whole entry can be done from the keyboard.
   *
   * Deferred by one frame because `showModal()` is synchronous and the field is
   * mounted in the same commit as the class that positions it.
   */
  useEffect(() => {
    if (!formOpen) return;
    const id = requestAnimationFrame(() => {
      formDialog.current?.querySelector('input:not([type="hidden"])')?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [formOpen]);

  /**
   * Enter saves from any field.
   *
   * The form already submits on Enter — that is native behaviour, and it works
   * — but the date input is a `<input type="date">`, where Enter opens the
   * calendar picker in some browsers and only submits if the picker was already
   * dismissed. So this closes that hole explicitly rather than relying on the
   * browser to guess.
   */
  const formKeyDown = (event) => {
    if (event.key === 'Enter' && busy) {
      // A save already in flight must not be submitted twice; the Button
      // disables itself visually, but Enter would still reach the form.
      event.preventDefault();
    }
  };

  const { budgets, expenses, incomes = [], salary } = data;
  const isIncome = kind === 'income';

  /* The form's own kind. Everything below that writes or validates a row reads
     this one; everything that renders the list reads `isIncome` above. */
  const formIsIncome = formKind === 'income';
  const formValue = formIsIncome ? incomeForm : form;

  /**
   * Every month that has at least one row of the *active* kind, newest first.
   *
   * Scoped to the kind on purpose: switching to "Pemasukan" and finding a month
   * in the picker because an expense happened in it would put the user on a
   * month whose income list is empty for a reason that has nothing to do with
   * the month.
   */
  const monthsWithData = useMemo(() => {
    const dates = isIncome ? incomes.map((row) => row.received_on) : expenses.map((row) => row.spent_on);
    const keys = new Set(dates.map(monthKey).filter(Boolean));
    keys.add(currentMonthKey());
    return [...keys].sort((a, b) => b.localeCompare(a));
  }, [expenses, incomes, isIncome]);

  /**
   * Apply the search box, category and month filters together.
   *
   * Income rows carry no category, so the category filter is skipped for them
   * rather than matching nothing — leaving the control visible but inert would
   * look like a broken filter rather than an inapplicable one.
   */
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

  /** Totals for the rows currently visible, not the whole month. */
  const visibleTotal = filtered.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);

  /**
   * The summary card above the list, always scoped to the *current* month.
   *
   * It does not follow the active tab, because it answers a question about the
   * month rather than about the list — switching tabs would otherwise change
   * "Sisa" to mean a different number each time, which is the one thing a
   * headline figure must never do.
   */
  const monthExpenses = expenses.filter((expense) => monthKey(expense.spent_on) === currentMonthKey());
  const monthIncomes = incomes.filter((income) => monthKey(income.received_on) === currentMonthKey());
  const monthSummary = getCashflowSummary(salary, monthIncomes, budgets, monthExpenses);

  /* Writes to the form for whichever kind the dialog is currently showing, so the
     toggle inside the dialog needs no special handling at the call sites. */
  const setFormValue = formIsIncome ? setIncomeForm : setForm;

  const setField = (name, value) => {
    setFormValue((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
    setSuccess('');
    setMutationError(null);
  };

  const resetForm = () => {
    setForm(BLANK_EXPENSE);
    setIncomeForm(BLANK_INCOME);
    setFieldErrors({});
    setEditing(null);
    setSuccess('');
    setFormOpen(false);
  };

  /**
   * Switching the list tab touches nothing about the form.
   *
   * The two live apart now that the form carries its own kind: what is on screen
   * and what is being typed are separate questions, and a page-level toggle
   * used to decide both — which meant recording a bonus required first switching
   * the whole page over to the income tab.
   */
  const handleKindChange = (next) => {
    if (next === kind) return;
    setKind(next);
  };

  /**
   * The toggle inside the dialog.
   *
   * Both shapes are kept in state, so switching mid-form loses nothing: whatever
   * was half-typed on the other side is still there when you switch back. The
   * errors are dropped, because "Kategori belum dipilih" belongs to the form you
   * just left and would otherwise greet you on the other side.
   *
   * Hidden while editing: the row being edited is already one specific kind, and
   * offering to convert an expense into an income by flipping a switch would be
   * a delete and a create wearing one control's clothes.
   */
  const handleFormKindChange = (next) => {
    if (next === formKind || editing) return;
    setFormKind(next);
    setFieldErrors({});
    setMutationError(null);
    setSuccess('');
  };

  const handleSubmit = async (event, { keepOpen = false } = {}) => {
    event?.preventDefault();

    const errors = formIsIncome ? validateIncome(incomeForm) : validateExpense(form, budgets);
    setFieldErrors(errors);
    setSuccess('');
    setMutationError(null);

    // Stop on the first invalid field and move focus to it, so the user is not
    // left guessing which of four inputs the message refers to.
    if (Object.keys(errors).length) {
      const first = (formIsIncome
        ? ['description', 'amount', 'source', 'receivedOn']
        : ['description', 'amount', 'categoryId', 'spentOn']
      ).find((key) => errors[key]);
      document.getElementById(`field-${first}`)?.focus();
      return;
    }

    // Profile comes from the Better Auth-backed ledger API, not Supabase Auth.
    if (!data.profile?.created_at) {
      setMutationError('Gagal memvalidasi bulan akun. Silakan coba lagi.');
      return;
    }
    const accountCreationDate = monthStart(data.profile.created_at);
    const dateKey = formIsIncome ? 'receivedOn' : 'spentOn';
    const rowMonthDate = monthStart(formValue[dateKey]);
    if (rowMonthDate < accountCreationDate) {
      const accountMonthLabel = formatMonthLabel(accountCreationDate);
      setFieldErrors((prev) => ({
        ...prev,
        [dateKey]: `Tanggal harus berada pada bulan pembuatan akun (${accountMonthLabel}) atau setelahnya.`,
      }));
      document.getElementById(`field-${dateKey}`)?.focus();
      return;
    }

    const ok = await run(async () => {
      if (formIsIncome) {
        if (editing) {
          await updateIncome(supabase, editing.id, incomeForm);
        } else {
          await createIncome(supabase, incomeForm);
        }
      } else if (editing) {
        await updateExpense(supabase, editing.id, form);
      } else {
        await createExpense(supabase, form);
      }
    });

    if (ok) {
      reload();

      if (keepOpen && !editing) {
        /* Entering several transactions in a row is the normal case — a shopping
           trip produces three or four lines, not one — so this clears only the
           fields that differ per row and keeps the one that does not. The
           category is the field worth keeping: three of four entries at a
           supermarket are the same envelope, and re-picking it four times is the
           part of this form that gets old. */
        const blank = formIsIncome ? BLANK_INCOME : BLANK_EXPENSE;
        const kept = formIsIncome
          ? { receivedOn: incomeForm.receivedOn }
          : { categoryId: form.categoryId, spentOn: form.spentOn };

        setFormValue({ ...blank, ...kept });
        setFieldErrors({});
        setSuccess('Tersimpan. Lanjut catat yang berikutnya.');
        return;
      }

      setSuccess(editing ? 'Transaksi diperbarui.' : 'Transaksi tersimpan.');
      resetForm();
    }
  };

  /** Opens the dialog on the given kind. `resetForm` first, so a new entry never
      inherits the last one's values. */
  const openForm = (which) => {
    resetForm();
    setFormKind(which);
    setFormOpen(true);
  };

  const handleEdit = (row) => {
    setEditing(row);
    setSuccess('');
    setMutationError(null);
    setFieldErrors({});

    /* The dialog follows the row, not the tab. Editing an income while the
       "Pengeluaran" tab happens to be selected is not a state anyone should be
       able to reach by accident, and the toggle is hidden while editing anyway. */
    const editingIncome = row.received_on !== undefined;
    setFormKind(editingIncome ? 'income' : 'expense');

    if (editingIncome) {
      setIncomeForm({
        description: row.description,
        amount: String(row.amount),
        source: row.source ?? '',
        receivedOn: row.received_on,
      });
    } else {
      setForm({
        description: row.description,
        amount: String(row.amount),
        categoryId: row.category_id,
        spentOn: row.spent_on,
      });
    }
    setFormOpen(true);
  };

  const handleDelete = (row) =>
    confirm({
      title: 'Hapus transaksi ini?',
      description: `"${row.description}" sebesar ${formatIDR(row.amount)} akan dihapus permanen.\n\nTindakan ini tidak bisa dibatalkan.`,
      confirmLabel: 'Hapus transaksi',
      onConfirm: async () => {
        /* Read off the row, not the active tab. A delete button lives in the list, so
           the list's tab is right today — but asking the row which table it came
           from means a tab change can never send this at the wrong endpoint. */
        const done = await run(() =>
          row.received_on !== undefined ? deleteIncome(supabase, row.id) : deleteExpense(supabase, row.id),
        );
        if (!done) return false;

        if (editing?.id === row.id) resetForm();
        setSuccess('Transaksi dihapus.');
        reload();
        return true;
      },
    });

  /** Warn before a category delete, because its expenses cascade away with it. */
  const handleCategoryDelete = (budget) => {
    const count = countExpensesIn(expenses, budget.id);

    return confirm({
      title: `Hapus kategori "${budget.name}"?`,
      description: count
        ? `${count} transaksi ikut terhapus permanen dan tidak bisa dikembalikan.`
        : 'Kategori ini belum punya transaksi, jadi tidak ada data yang hilang.',
      confirmLabel: 'Hapus kategori',
      onConfirm: async () => {
        const done = await run(() => deleteBudget(supabase, budget.id));
        if (!done) return false;
        reload();
        return true;
      },
    });
  };

  const hasBudgets = budgets.length > 0;

  return (
    <div className="py-[34px] max-w-[1310px] mx-auto" id="konten">
      <header className="mb-section flex flex-col sm:flex-row items-start sm:items-end justify-between gap-[16px]">
        <h1 className="text-[clamp(36px,4.5vw,58px)] tracking-[-0.05em] leading-[1.12] font-medium">
          Transaksi
        </h1>
        {/* One button, not two. Which kind is being recorded is a question about
            the transaction, not about what the list below happens to be showing,
            so it is answered inside the dialog where the rest of the form is. */}
        <Button onClick={() => openForm('expense')} className="flex-none mb-[4px]">
          Catat transaksi
          <ArrowRightUpIcon size={15} aria-hidden="true" />
        </Button>
      </header>

      <Panel className="mb-card">
        <div className="flex items-center justify-between mb-[14px]">
          <div>
            <Eyebrow>Bulan ini</Eyebrow>
            <h2 className="text-[20px] tracking-[-0.03em] font-medium mt-[6px] mb-[2px]">Ringkasan</h2>
          </div>
          <span className="font-mono text-[11px] text-ruang-muted">
            {formatMonthLabel(currentMonthKey()).toUpperCase()}
          </span>
        </div>

        {/* Four figures rather than three: "Gaji" alone stopped being the whole
            inflow the moment income could be recorded, so it is joined by " lain"
            and the two add up to the number "Sisa" is measured against. */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-card">
          <Stat label="Gaji" value={formatIDR(monthSummary.salary)} />
          <Stat
            label="Masuk lain"
            note="(di luar gaji)"
            value={formatIDR(monthSummary.income)}
            tone={monthSummary.income > 0 ? 'accent' : 'default'}
          />
          <Stat label="Terpakai" value={formatIDR(monthSummary.spent)} />
          <Stat
            label="Sisa"
            value={formatIDR(monthSummary.remaining)}
            tone={monthSummary.remaining < 0 ? 'danger' : 'default'}
          />
        </div>

        {budgets.length > 0 && (
          <div className="mt-[18px] pt-[15px] border-t border-ruang-line">
            <h3 className="font-mono text-[11px] tracking-[0.09em] text-ruang-subtle mb-[10px]">
              Kategori bulan ini
            </h3>
            <ul className="flex flex-col gap-[8px]">
              {monthSummary.categories.map((category) => (
                <li key={category.id} className="flex items-center gap-[10px]">
                  <span className="text-[13px] font-medium truncate flex-1 min-w-0 text-ruang-ink" title={category.name}>
                    {category.name}
                  </span>
                  <span className="font-mono text-[12px] text-ruang-muted whitespace-nowrap flex-none">
                    {formatIDR(category.spent)}
                  </span>
                  <span
                    className={`font-mono text-[12px] w-[38px] text-right flex-none ${
                      category.over ? 'text-ruang-danger' : 'text-ruang-subtle'
                    }`}
                  >
                    {Math.round(category.percent)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCategoryDelete(category)}
                    aria-label={`Hapus kategori ${category.name}`}
                    className="w-[24px] h-[24px] grid place-items-center text-ruang-subtle hover:text-ruang-danger-ink transition-colors flex-none"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Panel>

      <section>
        <dialog
          ref={formDialog}
          onClick={(event) => { if (event.target === formDialog.current) resetForm(); }}
          onClose={() => setFormOpen(false)}
          aria-labelledby="form-transaksi-title"
          className="modal-dialog w-[min(100%-32px,440px)] max-h-[90dvh] overflow-y-auto border border-ruang-line bg-ruang-panel text-ruang-ink p-0"
        >
        <Panel id="form-transaksi" className="border-0">
          <div className="flex items-center justify-between mb-[12px]">
            <Eyebrow>{editing ? 'Ubah catatan' : 'Catatan baru'}</Eyebrow>
            <button
              type="button"
              onClick={resetForm}
              className="border-0 bg-none p-0 text-ruang-muted text-[12px] hover:text-ruang-accent-text transition-colors cursor-pointer"
            >
              Tutup
            </button>
          </div>
          <h2 id="form-transaksi-title" className="text-[20px] tracking-[-0.03em] font-medium mb-[18px]">
            {editing
              ? formIsIncome ? 'Ubah pemasukan' : 'Ubah pengeluaran'
              : formIsIncome ? 'Catat pemasukan' : 'Catat pengeluaran'}
          </h2>

          {/* The kind lives here, at the top, before any field. It is the first
              thing that differs between the two forms — a category dropdown
              versus a free-text source — so deciding it up front means the rest
              of the dialog never changes shape underneath the user mid-entry. */}
          {!editing && (
            <div
              className="flex border border-ruang-line-2 rounded-[3px] mb-[18px]"
              role="group"
              aria-label="Jenis transaksi"
            >
              {KINDS.map((option) => {
                const active = option.kind === formKind;
                return (
                  <button
                    key={option.kind}
                    type="button"
                    onClick={() => handleFormKindChange(option.kind)}
                    aria-pressed={active}
                    className={`h-[38px] flex-1 text-[13px] font-medium transition-colors cursor-pointer ${
                      active
                        ? 'bg-ruang-accent text-ruang-accent-ink font-semibold'
                        : 'text-ruang-muted hover:text-ruang-ink'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          )}

          {!formIsIncome && !hasBudgets ? (
            /* An expense row needs a category, so a new account with none is a
               dead end here. Link straight to the category form rather than
               leaving the user to find it in settings on their own. The income
               form has no category and is therefore never blocked by this. */
            <div className="mb-[16px]">
              <EmptyState>
                Buat kategori anggaran dulu sebelum mencatat pengeluaran.
              </EmptyState>
              <Link
                href="/settings#form-kategori"
                className="mt-[12px] h-[42px] px-[18px] w-full flex items-center justify-center gap-[10px] text-[13px] font-bold tracking-[0.02em] rounded-[4px] bg-ruang-accent text-ruang-accent-ink hover:bg-ruang-accent-hover transition-colors active:scale-95 no-underline"
              >
                Buat kategori
                <ArrowRightUpIcon size={15} aria-hidden="true" />
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} onKeyDown={formKeyDown} className="flex flex-col gap-[15px]" noValidate>
              {/* `autoFocus` is what actually puts the cursor here — a
                  programmatic `.focus()` after `showModal()` is a hint the
                  browser may decline, whereas autofocus on the mounted input is
                  the behaviour the dialog's own focus trap then picks up. */}
              <TextField
                id="field-description"
                label={formIsIncome ? 'Nama pemasukan' : 'Nama pengeluaran'}
                value={formValue.description}
                onChange={(e) => setField('description', e.target.value)}
                error={fieldErrors.description}
                placeholder={formIsIncome ? 'Contoh: THR' : 'Contoh: Belanja mingguan'}
                maxLength={80}
                autoComplete="off"
                autoFocus
              />

              <NumberField
                id="field-amount"
                label="Nominal"
                value={formValue.amount}
                onChange={(e) => setField('amount', e.target.value.replace(/[^\d]/g, ''))}
                error={fieldErrors.amount}
                placeholder="0"
                grouped
              />

              {formIsIncome ? (
                /* Optional, and the only optional field in the ledger. An empty
                   one is stored as NULL so the row falls back to a generic
                   label rather than rendering a blank. */
                <TextField
                  id="field-source"
                  label="Sumber (opsional)"
                  value={formValue.source}
                  onChange={(e) => setField('source', e.target.value)}
                  error={fieldErrors.source}
                  placeholder="Contoh: THR"
                  maxLength={40}
                  autoComplete="off"
                />
              ) : (
                <SelectField
                  id="field-categoryId"
                  label="Kategori"
                  value={formValue.categoryId}
                  onChange={(e) => setField('categoryId', e.target.value)}
                  error={fieldErrors.categoryId}
                  placeholder="Pilih kategori"
                  options={budgets.map((budget) => ({ value: budget.id, label: budget.name }))}
                />
              )}

              <TextField
                id={formIsIncome ? 'field-receivedOn' : 'field-spentOn'}
                label="Tanggal"
                type="date"
                value={formValue[formIsIncome ? 'receivedOn' : 'spentOn']}
                onChange={(e) => setField(formIsIncome ? 'receivedOn' : 'spentOn', e.target.value)}
                error={fieldErrors[formIsIncome ? 'receivedOn' : 'spentOn']}
                max={todayISO()}
              />

              <FormMessage error={mutationError} success={success} />

              {/* `flex-wrap` so a nowrap label on a narrow phone drops the cancel button to
                its own line instead of squeezing the label into two.

                Both buttons carry the same `flex-1 basis-[160px]`, which is what makes
                the row read as one pair. The labels here are long enough that the two
                never fit side by side on a phone — "Simpan transaksi" plus an icon
                needs ~173px and "Simpan, lanjut" ~134px, against ~293px of panel width
                — so the secondary used to wrap and then, being `flex-none`, sit on its
                own line hugging its own width under a full-width primary. Growing like
                the primary means a wrapped row is two equal full-width buttons, and an
                unwrapped one is two equal halves. */}
              <div className="flex flex-wrap gap-[9px] items-center">
                <Button type="submit" busy={busy} busyLabel="Menyimpan..." className="flex-1 basis-[160px]">
                  {editing ? 'Simpan perubahan' : 'Simpan transaksi'}
                  <ArrowRightUpIcon size={15} aria-hidden="true" />
                </Button>
                {/* The secondary save. Not shown while editing, where "keep
                    adding" has no meaning, and not while busy, where it would be
                    a second way to double-submit. */}
                {!editing && (
                  <GhostButton
                    onClick={(event) => handleSubmit(event, { keepOpen: true })}
                    disabled={busy}
                    className="flex-1 basis-[160px]"
                  >
                    Simpan, lanjut
                  </GhostButton>
                )}
                {editing && (
                  <GhostButton onClick={resetForm} className="flex-1 basis-[160px]">
                    Batal
                  </GhostButton>
                )}
              </div>

              <small className="text-ruang-subtle text-[12px] leading-[1.6] text-center">
                  {formIsIncome
                    ? 'Pemasukan ini menambah dana bulan yang sama, di luar gaji.'
                    : 'Catatan tersimpan di akunmu dan bisa diubah kapan saja.'}
              </small>
            </form>
          )}
        </Panel>
        </dialog>

        <div className="min-w-0">
          <Panel>
            <div className="flex items-start justify-between gap-[10px] mb-[16px]">
              <div className="min-w-0">
                <Eyebrow>Daftar {isIncome ? 'pemasukan' : 'pengeluaran'}</Eyebrow>
                <h2 className="text-[20px] tracking-[-0.03em] font-medium mt-[6px] mb-[2px]">
                  {monthFilter === currentMonthKey() ? 'Transaksi bulan ini' : `Transaksi ${formatMonthLabel(monthFilter)}`}
                </h2>
              </div>
              <span className="border border-ruang-line-3 px-[7px] py-[3px] text-ruang-muted font-mono text-[11px] tracking-[0.06em] flex-none">
                {filtered.length} {isIncome ? 'PEMASUKAN' : 'PENGELUARAN'}
              </span>
            </div>

            {/* Which list is on screen — filters, total, rows. Deliberately separate from
                the dialog's own toggle: watching the list is not choosing what to
                record, and nothing here affects the form. */}
            <div
              className="flex border border-ruang-line-2 mb-[14px] w-full sm:w-auto sm:self-start"
              role="tablist"
              aria-label="Jenis transaksi"
            >
              {KINDS.map((tab) => {
                const activeTab = tab.kind === kind;
                return (
                  <button
                    key={tab.kind}
                    type="button"
                    role="tab"
                    aria-selected={activeTab}
                    onClick={() => handleKindChange(tab.kind)}
                    className={`h-[34px] flex-1 sm:flex-none px-[16px] text-[12px] font-medium transition-colors cursor-pointer ${
                      activeTab
                        ? 'bg-ruang-accent text-ruang-accent-ink font-semibold'
                        : 'text-ruang-muted hover:text-ruang-ink'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Filters. The category list also carries a delete control, which
                is the only place in the app a category can be removed. Income
                rows have no category, so that column is dropped rather than left
                visible and matching nothing. */}
            <div
              className={`grid grid-cols-1 gap-[9px] mb-[14px] ${
                isIncome ? 'sm:grid-cols-[1fr_1fr]' : 'sm:grid-cols-[1fr_1fr_auto]'
              }`}
            >
              <div className="relative">
                <label htmlFor="filter-search" className="sr-only">
                  Cari transaksi
                </label>
                <MagnifierIcon
                  size={14}
                  className="absolute left-[11px] top-1/2 -translate-y-1/2 text-ruang-subtle pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  id="filter-search"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari nama..."
                  className="w-full h-[38px] bg-ruang-shell border border-ruang-line-2 rounded-[3px] text-ruang-ink pl-[32px] pr-[10px] text-[13px] outline-none focus:border-ruang-accent-text placeholder:text-ruang-ghost"
                />
              </div>

              <div>
                <label htmlFor="filter-month" className="sr-only">
                  Filter bulan
                </label>
                <select
                  id="filter-month"
                  value={monthFilter}
                  onChange={(e) => setMonthFilter(e.target.value)}
                  className="w-full h-[38px] bg-ruang-shell border border-ruang-line-2 rounded-[3px] text-ruang-ink px-[10px] text-[13px] outline-none focus:border-ruang-accent-text cursor-pointer"
                >
                  {monthsWithData.map((key) => (
                    <option key={key} value={key} className="bg-ruang-shell">
                      {formatMonthLabel(key)}
                    </option>
                  ))}
                </select>
              </div>

              <div className={isIncome ? 'hidden' : ''}>
                <label htmlFor="filter-category" className="sr-only">
                  Filter kategori
                </label>
                <select
                  id="filter-category"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="w-full h-[38px] bg-ruang-shell border border-ruang-line-2 rounded-[3px] text-ruang-ink px-[10px] text-[13px] outline-none focus:border-ruang-accent-text cursor-pointer"
                >
                  <option value="" className="bg-ruang-shell">
                    Semua kategori
                  </option>
                  {budgets.map((budget) => (
                    <option key={budget.id} value={budget.id} className="bg-ruang-shell">
                      {budget.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-[10px] mb-[14px] py-[11px] border-y border-ruang-line">
              <span className="inline-flex items-center gap-[7px] font-mono text-[11px] tracking-[0.08em] text-ruang-muted">
                <FilterIcon size={13} className="text-ruang-accent-text" aria-hidden="true" />
                Total {isIncome ? 'pemasukan' : 'pengeluaran'}
              </span>
              <strong className="font-mono text-[13px] text-ruang-ink">{formatIDR(visibleTotal)}</strong>
            </div>

            <ExpenseList
              expenses={filtered}
              budgets={budgets}
              kind={kind}
              onEdit={handleEdit}
              onDelete={handleDelete}
              emptyLabel={
                (isIncome ? incomes : expenses).length
                  ? 'Tidak ada transaksi yang cocok dengan filter ini.'
                  : isIncome
                    ? 'Belum ada pemasukan di luar gaji. Catat THR atau pemasukan lain di sini.'
                    : 'Belum ada transaksi. Catat pengeluaran pertama.'
              }
            />
          </Panel>

        </div>
      </section>

      {dialog}
    </div>
  );
}

/**
 * One figure in the month summary: a label over a number, and nothing else.
 *
 * Every stat is exactly these two lines, so the four columns keep one rhythm and
 * their numbers share a baseline. `note` is the qualifier a label needs to be
 * unambiguous — "Masuk lain (di luar gaji)" — and it rides on the label rather
 * than under the number: a third line under one figure made that column taller
 * than its three neighbours, which is the thing this layout must not do.
 *
 * Below `sm` the grid is two columns, and "Masuk lain (di luar gaji)" is wider
 * than one of them, so it wraps. The label therefore reserves two lines for
 * every stat at that width, which keeps the wrapped column's number level with
 * the number beside it; from `sm` up the label fits on one line and the
 * reservation is dropped.
 *
 * `accent` marks the "Masuk lain" stat so a non-zero extra inflow reads as a
 * positive figure rather than as another neutral number.
 */
function Stat({ label, note, value, tone = 'default' }) {
  return (
    <div className="min-w-0">
      <small className="block font-mono text-[11px] text-ruang-subtle tracking-[0.09em] mb-[6px] min-h-[2lh] sm:min-h-0 sm:whitespace-nowrap">
        {label}
        {note && (
          <>
            {' '}
            <span className="normal-case tracking-normal">{note}</span>
          </>
        )}
      </small>
      <strong
        className={`block font-mono text-[15px] font-medium truncate ${
          tone === 'danger' ? 'text-ruang-danger' : tone === 'accent' ? 'text-ruang-accent-text' : 'text-ruang-ink'
        }`}
        title={value}
      >
        {value}
      </strong>
    </div>
  );
}
