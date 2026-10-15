'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLedgerData, useMutation } from '@/hooks/useLedgerData';
import { createClient } from '@/lib/client';
import {
  countExpensesIn,
  createExpense,
  deleteBudget,
  deleteExpense,
  fetchLedger,
  updateExpense,
  validateExpense,
} from '@/lib/ledger';
import {
  currentMonthKey,
  formatIDR,
  formatMonthLabel,
  getBudgetSummary,
  monthKey,
  monthStart,
  todayISO,
} from '@/lib/money';
import { Button, FormMessage, GhostButton, NumberField, SelectField, TextField } from '@/components/form';
import { useConfirm } from '@/components/confirm-dialog';
import { ExpenseList } from '@/components/expense-row';
import { ArrowRightUpIcon, FilterIcon, MagnifierIcon } from '@/components/icons';
import { EmptyState, ErrorState, Eyebrow, LoadingState, Panel } from '@/components/ui';

const BLANK = { description: '', amount: '', categoryId: '', spentOn: todayISO() };

export default function TransactionsPage() {
  const { data, loading, error, reload } = useLedgerData(fetchLedger);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <ErrorState message="Sesi tidak ditemukan. Silakan masuk kembali." />;

  return <TransactionsContent data={data} reload={reload} />;
}

function TransactionsContent({ data, reload }) {
  const [form, setForm] = useState(BLANK);
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

  const { budgets, expenses, salary } = data;

  /** Every month that has at least one expense, newest first, for the filter. */
  const monthsWithData = useMemo(() => {
    const keys = new Set(expenses.map((expense) => monthKey(expense.spent_on)).filter(Boolean));
    keys.add(currentMonthKey());
    return [...keys].sort((a, b) => b.localeCompare(a));
  }, [expenses]);

  /** Apply the search box, category and month filters together. */
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return expenses.filter((expense) => {
      if (monthFilter && monthKey(expense.spent_on) !== monthFilter) return false;
      if (categoryFilter && expense.category_id !== categoryFilter) return false;
      if (term && !expense.description.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [expenses, monthFilter, categoryFilter, search]);

  /** Totals for the rows currently visible, not the whole month. */
  const visibleTotal = filtered.reduce((sum, expense) => sum + Number(expense.amount ?? 0), 0);
  const monthExpenses = expenses.filter((expense) => monthKey(expense.spent_on) === monthFilter);
  const monthSummary = getBudgetSummary(salary, budgets, monthExpenses);

  const setField = (name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
    setSuccess('');
    setMutationError(null);
  };

  const resetForm = () => {
    setForm(BLANK);
    setFieldErrors({});
    setEditing(null);
    setSuccess('');
    setFormOpen(false);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const errors = validateExpense(form, budgets);
    setFieldErrors(errors);
    setSuccess('');
    setMutationError(null);

    // Stop on the first invalid field and move focus to it, so the user is not
    // left guessing which of four inputs the message refers to.
    if (Object.keys(errors).length) {
      const first = ['description', 'amount', 'categoryId', 'spentOn'].find((key) => errors[key]);
      document.getElementById(`field-${first}`)?.focus();
      return;
    }

    // Profile comes from the Better Auth-backed ledger API, not Supabase Auth.
    if (!data.profile?.created_at) {
      setMutationError('Gagal memvalidasi bulan akun. Silakan coba lagi.');
      return;
    }
    const accountCreationDate = monthStart(data.profile.created_at);
    const expenseMonthDate = monthStart(form.spentOn);
    if (expenseMonthDate < accountCreationDate) {
      const accountMonthLabel = formatMonthLabel(accountCreationDate);
      setFieldErrors((prev) => ({
        ...prev,
        spentOn: `Tanggal harus berada pada bulan pembuatan akun (${accountMonthLabel}) atau setelahnya.`,
      }));
      document.getElementById('field-spentOn')?.focus();
      return;
    }

    const ok = await run(async () => {
      if (editing) {
        await updateExpense(supabase, editing.id, form);
      } else {
        await createExpense(supabase, form);
      }
    });

    if (ok) {
      setSuccess(editing ? 'Transaksi diperbarui.' : 'Transaksi tersimpan.');
      resetForm();
      reload();
    }
  };

  const handleEdit = (expense) => {
    setEditing(expense);
    setSuccess('');
    setMutationError(null);
    setFieldErrors({});
    setForm({
      description: expense.description,
      amount: String(expense.amount),
      categoryId: expense.category_id,
      spentOn: expense.spent_on,
    });
    setFormOpen(true);
  };

  const handleDelete = (expense) =>
    confirm({
      title: 'Hapus transaksi ini?',
      description: `"${expense.description}" sebesar ${formatIDR(expense.amount)} akan dihapus permanen.\n\nTindakan ini tidak bisa dibatalkan.`,
      confirmLabel: 'Hapus transaksi',
      onConfirm: async () => {
        const done = await run(() => deleteExpense(supabase, expense.id));
        if (!done) return false;

        if (editing?.id === expense.id) resetForm();
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
        <Button onClick={() => { resetForm(); setFormOpen(true); }} className="flex-none mb-[4px]">
          Catat pengeluaran
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

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-card">
          <Stat label="Gaji" value={formatIDR(salary)} />
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
          <h2 id="form-transaksi-title" className="text-[20px] tracking-[-0.03em] font-medium mb-[22px]">
            {editing ? 'Ubah pengeluaran' : 'Catat pengeluaran'}
          </h2>

          {!hasBudgets ? (
            /* An expense row needs a category, so a new account with none is a
               dead end here. Link straight to the category form rather than
               leaving the user to find it in settings on their own. */
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
            <form onSubmit={handleSubmit} className="flex flex-col gap-[15px]" noValidate>
              <TextField
                id="field-description"
                label="Nama pengeluaran"
                value={form.description}
                onChange={(e) => setField('description', e.target.value)}
                error={fieldErrors.description}
                placeholder="Contoh: Belanja mingguan"
                maxLength={80}
                autoComplete="off"
              />

              <NumberField
                id="field-amount"
                label="Nominal"
                value={form.amount}
                onChange={(e) => setField('amount', e.target.value.replace(/[^\d]/g, ''))}
                error={fieldErrors.amount}
                placeholder="0"
              />

              <SelectField
                id="field-categoryId"
                label="Kategori"
                value={form.categoryId}
                onChange={(e) => setField('categoryId', e.target.value)}
                error={fieldErrors.categoryId}
                placeholder="Pilih kategori"
                options={budgets.map((budget) => ({ value: budget.id, label: budget.name }))}
              />

              <TextField
                id="field-spentOn"
                label="Tanggal"
                type="date"
                value={form.spentOn}
                onChange={(e) => setField('spentOn', e.target.value)}
                error={fieldErrors.spentOn}
                max={todayISO()}
              />

              <FormMessage error={mutationError} success={success} />

              {/* `flex-wrap` so a nowrap label on a narrow phone drops the cancel button to
                its own line instead of squeezing the label into two. */}
              <div className="flex flex-wrap gap-[9px] items-center">
                <Button type="submit" busy={busy} busyLabel="Menyimpan..." className="flex-1 basis-[160px]">
                  {editing ? 'Simpan perubahan' : 'Simpan transaksi'}
                  <ArrowRightUpIcon size={15} aria-hidden="true" />
                </Button>
                {editing && (
                  <GhostButton onClick={resetForm} className="flex-none">
                    Batal
                  </GhostButton>
                )}
              </div>

              <small className="text-ruang-subtle text-[12px] leading-[1.6] text-center">
                  Catatan tersimpan di akunmu dan bisa diubah kapan saja.
              </small>
            </form>
          )}
        </Panel>
        </dialog>

        <div className="min-w-0">
          <Panel>
            <div className="flex items-start justify-between gap-[10px] mb-[16px]">
              <div className="min-w-0">
                <Eyebrow>Daftar pengeluaran</Eyebrow>
                <h2 className="text-[20px] tracking-[-0.03em] font-medium mt-[6px] mb-[2px]">
                  {monthFilter === currentMonthKey() ? 'Transaksi bulan ini' : `Transaksi ${formatMonthLabel(monthFilter)}`}
                </h2>
              </div>
              <span className="border border-ruang-line-3 px-[7px] py-[3px] text-ruang-muted font-mono text-[11px] tracking-[0.06em] flex-none">
                {filtered.length} PENGELUARAN
              </span>
            </div>

            {/* Filters. The category list also carries a delete control, which
                is the only place in the app a category can be removed. */}
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-[9px] mb-[14px]">
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

              <div>
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
                Total pengeluaran
              </span>
              <strong className="font-mono text-[13px] text-ruang-ink">{formatIDR(visibleTotal)}</strong>
            </div>

            <ExpenseList
              expenses={filtered}
              budgets={budgets}
              onEdit={handleEdit}
              onDelete={handleDelete}
              emptyLabel={
                expenses.length
                  ? 'Tidak ada transaksi yang cocok dengan filter ini.'
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

function Stat({ label, value, tone = 'default' }) {
  return (
    <div className="min-w-0">
      <small className="block font-mono text-[11px] text-ruang-subtle tracking-[0.09em] mb-[6px]">{label}</small>
      <strong
        className={`block font-mono text-[15px] font-medium truncate ${
          tone === 'danger' ? 'text-ruang-danger' : 'text-ruang-ink'
        }`}
        title={value}
      >
        {value}
      </strong>
    </div>
  );
}
