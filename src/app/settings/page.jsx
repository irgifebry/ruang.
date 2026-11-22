'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLedgerData, useMutation } from '@/hooks/useLedgerData';
import {
  BUDGET_COLORS,
  countExpensesIn,
  createBudget,
  deleteBudget,
  fetchLedger,
  updateBudget,
  validateBudget,
} from '@/lib/ledger';
import { swatchClass, chipClass } from '@/lib/category-colors';
import { formatIDR } from '@/lib/money';
import { Button, FormMessage, GhostButton, NumberField, TextField } from '@/components/form';
import { useConfirm } from '@/components/confirm-dialog';
import { ArrowRightUpIcon } from '@/components/icons';
import { EmptyState, ErrorState, Eyebrow, LoadingState, Panel } from '@/components/ui';


const BLANK_BUDGET = { name: '', monthlyLimit: '', color: 'lime' };

export default function SettingsPage() {
  const { data, loading, error, reload } = useLedgerData(fetchLedger);

  if (loading) return <LoadingState label="Memuat pengaturan..." />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <ErrorState message="Sesi tidak ditemukan. Silakan masuk kembali." />;

  return <SettingsContent data={data} reload={reload} />;
}

function SettingsContent({ data, reload }) {
  const [draft, setDraft] = useState(BLANK_BUDGET);
  const [draftErrors, setDraftErrors] = useState({});
  const [editingId, setEditingId] = useState(null);

  const [success, setSuccess] = useState('');

  const [run, busy, mutationError, setMutationError] = useMutation();
  const { confirm, dialog } = useConfirm();

  const { budgets, expenses } = data;

  // --- Category create / update -----------------------------------------

  const setDraftField = (name, value) => {
    setDraft((prev) => ({ ...prev, [name]: value }));
    setDraftErrors((prev) => ({ ...prev, [name]: undefined }));
    setSuccess('');
    setMutationError(null);
  };

  /** Validates and saves the budget form, creating or updating as appropriate. */
  const handleBudgetSubmit = async (event) => {
    event.preventDefault();

    const errors = validateBudget(draft, { budgets, ignoreId: editingId });
    setDraftErrors(errors);
    setSuccess('');
    setMutationError(null);

    if (Object.keys(errors).length) {
      const first = ['name', 'monthlyLimit'].find((key) => errors[key]);
      document.getElementById(`budget-${first}`)?.focus();
      return;
    }

    const ok = await run(async () => {
      if (editingId) {
        await updateBudget(editingId, draft);
      } else {
        await createBudget(draft);
      }
    });

    if (ok) {
      setSuccess(editingId ? 'Kategori diperbarui.' : 'Kategori ditambahkan.');
      setDraft(BLANK_BUDGET);
      setDraftErrors({});
      setEditingId(null);
      reload();
    }
  };

  const startEdit = (budget) => {
    setEditingId(budget.id);
    setDraft({ name: budget.name, monthlyLimit: String(budget.monthly_limit), color: budget.color });
    setDraftErrors({});
    setSuccess('');
    document.getElementById('form-kategori')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(BLANK_BUDGET);
    setDraftErrors({});
  };

  const handleDelete = (budget) => {
    const count = countExpensesIn(expenses, budget.id);

    return confirm({
      title: `Hapus kategori "${budget.name}"?`,
      description: count
        ? `${count} transaksi akan ikut terhapus permanen. Riwayat bulan ini ikut berubah dan tidak bisa dikembalikan.`
        : 'Kategori ini belum punya transaksi, jadi tidak ada data yang hilang.',
      confirmLabel: 'Hapus kategori',
      onConfirm: async () => {
        if (editingId === budget.id) cancelEdit();

        const ok = await run(() => deleteBudget(budget.id));
        if (!ok) return false;

        setSuccess('Kategori dihapus.');
        reload();
        return true;
      },
    });
  };

  return (
    <div className="py-section max-w-[1310px] mx-auto" id="konten">
      <header className="mb-section">
        <h1 className="text-[clamp(36px,4.5vw,58px)] tracking-[-0.065em] leading-[1.12] font-medium">
          Pengaturan
        </h1>
      </header>

      <section className="grid grid-cols-1 lg:grid-cols-[0.85fr_1.15fr] gap-card items-start">
        {/* Pemasukan ---------------------------------------------------- */}
        {/* Money in has one home: /transactions, where an income row is just a
            description, an optional source, an amount and a date. This panel is
            the way in from here, not a second editor with its own rules. */}
        <Panel>
          <Eyebrow className="mb-card">Pemasukan</Eyebrow>
          <h2 className="text-[19px] tracking-[-0.04em] font-medium mb-card">Catat uang masuk</h2>
          <p className="text-[13px] leading-[1.65] text-ruang-muted mb-card">
            Semua pemasukan dicatat lewat halaman Transaksi, bersama pengeluaran. Di sini kamu hanya
            mengatur kategori dan batas anggaran untuk uang yang keluar.
          </p>
          <Link
            href="/transactions"
            className="h-[42px] px-[18px] inline-flex items-center gap-[10px] text-[13px] font-bold tracking-[0.02em] rounded-[4px] bg-ruang-accent text-ruang-accent-ink hover:bg-ruang-accent-hover transition-colors active:scale-95 no-underline"
          >
            Buka transaksi <ArrowRightUpIcon size={15} aria-hidden="true" />
          </Link>
        </Panel>

        {/* Categories ---------------------------------------------------- */}
        {/* The scroll token clears the fixed mobile bar when this panel is
            targeted by an anchor link from the transactions page. */}
        <Panel id="form-kategori" className="scroll-mt-mobile-bar-scroll">
          <div className="flex items-center justify-between gap-[10px] mb-[17px]">
            <div>
              <Eyebrow>Anggaranmu</Eyebrow>
              <h2 className="text-[20px] tracking-[-0.04em] font-medium m-[5px_0_0]">Anggaran kategori</h2>
            </div>
            <span className="border border-ruang-line-3 px-[7px] py-[3px] text-ruang-muted font-mono text-[11px] tracking-[0.06em] flex-none">
              {budgets.length} kategori
            </span>
          </div>

          {/* Create / edit form. A new account starts with no categories at all,
              so without this there would be no way to record an expense. */}
          <form
            onSubmit={handleBudgetSubmit}
            className="border border-ruang-line p-[18px] mb-[20px] bg-ruang-sunken"
            noValidate
          >
            <div className="flex items-center justify-between gap-[10px] mb-[14px]">
              <span className="font-mono text-[11px] tracking-[0.1em] text-ruang-muted uppercase">
                {editingId ? 'Ubah kategori' : 'Kategori baru'}
              </span>
              {editingId && (
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="border-0 bg-none p-0 text-ruang-muted text-[12px] hover:text-ruang-accent-text transition-colors cursor-pointer"
                >
                  Batal
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[1.4fr_1fr] gap-[12px]">
              <TextField
                id="budget-name"
                label="Nama kategori"
                value={draft.name}
                onChange={(e) => setDraftField('name', e.target.value)}
                error={draftErrors.name}
                placeholder="Contoh: Kesehatan"
                maxLength={60}
                autoComplete="off"
              />
              <NumberField
                id="budget-monthlyLimit"
                label="Batas bulanan"
                value={draft.monthlyLimit}
                onChange={(e) => setDraftField('monthlyLimit', e.target.value.replace(/[^\d]/g, ''))}
                error={draftErrors.monthlyLimit}
                placeholder="0"
                align="right"
              />
            </div>

            <fieldset className="mt-[15px]">
              <legend className="text-ruang-body text-[12px] font-medium mb-[9px]">Warna</legend>
              <div className="flex gap-[8px]">
                {BUDGET_COLORS.map((color) => {
                  const selected = draft.color === color;
                  return (
                    <label key={color} className="cursor-pointer relative">
                      <input
                        type="radio"
                        name="budget-color"
                        value={color}
                        checked={selected}
                        onChange={() => setDraftField('color', color)}
                        className="sr-only peer"
                      />
                      <span
                        className={`block w-[28px] h-[28px] rounded-[3px] ${swatchClass(color)} transition-all peer-focus-visible:ring-2 peer-focus-visible:ring-ruang-accent-text peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-ruang-sunken ${
                          selected ? 'scale-110 ring-1 ring-ruang-sunken ring-offset-1 ring-offset-ruang-accent' : ''
                        }`}
                        title={color}
                      />
                      <span className="sr-only">{color}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <FormMessage error={mutationError} success={success} />

            {/* `flex-wrap` so a nowrap label on a narrow phone drops the cancel button to
              its own line instead of squeezing the label into two. */}
            <div className="flex flex-wrap gap-[9px] mt-[15px] items-center">
              <Button type="submit" busy={busy} busyLabel="Menyimpan..." className="flex-1 basis-[160px]">
                {editingId ? 'Simpan perubahan' : 'Tambah kategori'}
              </Button>
              {editingId && (
                <GhostButton onClick={cancelEdit} className="flex-none">
                  Batal
                </GhostButton>
              )}
            </div>
          </form>

          {budgets.length ? (
            <ul className="border-t border-ruang-line">
              {budgets.map((budget) => (
                <li
                  key={budget.id}
                  className="flex items-center gap-[10px] border-b border-ruang-line py-[12px]"
                >
                  <span
                    className={`w-[28px] h-[28px] rounded-[4px] flex-none grid place-items-center font-mono text-[12px] ${chipClass(budget.color)}`}
                    aria-hidden="true"
                  >
                    {budget.name.slice(0, 1).toUpperCase()}
                  </span>

                  <span className="flex-1 min-w-0 text-ruang-ink text-[13px] font-medium truncate" title={budget.name}>
                    {budget.name}
                  </span>

                  <span className="font-mono text-[12px] text-ruang-body whitespace-nowrap flex-none">
                    {formatIDR(budget.monthly_limit)}
                  </span>

                  <div className="flex items-center gap-[2px] flex-none">
                    <button
                      type="button"
                      onClick={() => startEdit(budget)}
                      aria-label={`Ubah kategori ${budget.name}`}
                      className="w-[44px] h-[44px] grid place-items-center text-ruang-subtle hover:text-ruang-accent-text rounded-[3px] transition-colors cursor-pointer"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path d="M4 20h4L20 8l-4-4L4 16v4Z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(budget)}
                      aria-label={`Hapus kategori ${budget.name}`}
                      className="w-[44px] h-[44px] grid place-items-center text-ruang-subtle hover:text-ruang-danger-ink rounded-[3px] transition-colors cursor-pointer"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
                      </svg>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>
              Belum ada kategori. Tambahkan minimal satu agar transaksi bisa dicatat.
            </EmptyState>
          )}
        </Panel>
      </section>

      {/* Profile & appearance ---------------------------------------------
          This used to hold its own copies of the avatar, theme and name forms.
          They are on `/settings/profile` now, which is where the upload goes to
          the `avatars` storage bucket and where the theme is applied live rather
          than only saved. Two editors for one setting is how they drift, so this
          is just a way in. */}
      {dialog}
    </div>
  );
}
