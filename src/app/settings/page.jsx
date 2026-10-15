'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useLedgerData, useMutation } from '@/hooks/useLedgerData';
import { createClient } from '@/lib/client';
import {
  BUDGET_COLORS,
  countExpensesIn,
  createBudget,
  deleteBudget,
  fetchLedger,
  saveSalary,
  updateBudget,
  validateBudget,
  validateSalary,
} from '@/lib/ledger';
import { swatchClass, chipClass } from '@/lib/category-colors';
import {
  currentMonthKey,
  formatIDR,
  formatMonthLabel,
  monthRange,
  shiftMonth,
  monthStart,
} from '@/lib/money';
import { Button, FormMessage, GhostButton, NumberField, TextField } from '@/components/form';
import { useConfirm } from '@/components/confirm-dialog';
import { ArrowLeftIcon, ArrowRightIcon, ArrowRightUpIcon } from '@/components/icons';
import { EmptyState, ErrorState, Eyebrow, LoadingState, Panel } from '@/components/ui';


const BLANK_BUDGET = { name: '', monthlyLimit: '', color: 'lime' };

/** How far back and forward the month stepper travels from the current month. */
const MONTHS_BACK = 24;
const MONTHS_FORWARD = 12;

export default function SettingsPage() {
  const { data, loading, error, reload } = useLedgerData(fetchLedger);

  if (loading) return <LoadingState label="Memuat pengaturan..." />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <ErrorState message="Sesi tidak ditemukan. Silakan masuk kembali." />;

  return <SettingsContent data={data} reload={reload} />;
}

function SettingsContent({ data, reload }) {
  // Which month's salary the form is editing. Defaults to the current month so
  // the common case is unchanged, but every other month is reachable.
  const [salaryMonth, setSalaryMonth] = useState(() => currentMonthKey());
  const [salaryInput, setSalaryInput] = useState(() => String(data.salary ?? 0));
  const [salaryError, setSalaryError] = useState(null);
  const [salarySavedMonth, setSalarySavedMonth] = useState('');

  const [draft, setDraft] = useState(BLANK_BUDGET);
  const [draftErrors, setDraftErrors] = useState({});
  const [editingId, setEditingId] = useState(null);

  const [success, setSuccess] = useState('');

  const [run, busy, mutationError, setMutationError] = useMutation();
  const { confirm, dialog } = useConfirm();
  const supabase = useMemo(() => createClient(), []);

  const { budgets, expenses, salaryRecords } = data;
  const totalAllocated = budgets.reduce((sum, budget) => sum + Number(budget.monthly_limit ?? 0), 0);

  /** Saved amount per 'YYYY-MM', so month lookups do not scan the array. */
  const salaryByMonth = useMemo(
    () => new Map((salaryRecords ?? []).map((record) => [record.key, record.amount])),
    [salaryRecords],
  );

  /** What the form is editing: the stored amount, or 0 for a month never set. */
  const selectedSalary = salaryByMonth.get(salaryMonth) ?? 0;
  const hasSelectedRecord = salaryByMonth.has(salaryMonth);

  // --- Salary ------------------------------------------------------------

  /**
   * Months offered by the picker: a fixed window around today, plus any month
   * that already has a record. Without the second part a salary saved years ago
   * would be invisible and therefore impossible to correct.
   */
  const monthOptions = useMemo(() => {
    const keys = new Set(monthRange(currentMonthKey(), MONTHS_BACK, MONTHS_FORWARD));
    for (const record of salaryRecords ?? []) keys.add(record.key);
    return [...keys].sort((a, b) => b.localeCompare(a));
  }, [salaryRecords]);

  const selectMonth = (key) => {
    setSalaryMonth(key);
    setSalaryInput(String(salaryByMonth.get(key) ?? 0));
    setSalaryError(null);
    setSalarySavedMonth('');
    setSuccess('');
    setMutationError(null);
  };

  const stepMonth = (delta) => {
    const target = shiftMonth(salaryMonth, delta);
    if (monthOptions.includes(target)) selectMonth(target);
  };

  const handleSalarySave = async () => {
    const message = validateSalary(salaryInput);
    setSalaryError(message);
    setSalarySavedMonth('');
    if (message) return;

    // Additional check: salary month must not be before account creation month
    if (data.profile?.created_at) {
      const accountCreationDate = monthStart(new Date(data.profile.created_at));
      const salaryMonthDate = monthStart(new Date(`${salaryMonth}-01`));
      if (salaryMonthDate < accountCreationDate) {
        const accountMonthLabel = formatMonthLabel(accountCreationDate);
        setSalaryError(`Bulan gaji harus berada pada bulan pembuatan akun (${accountMonthLabel}) atau setelahnya.`);
        return;
      }
    }

    // The month is part of the key, so this writes one row and leaves every
    // other month exactly as it was.
    const ok = await run(async () => {
      await saveSalary(`${salaryMonth}-01`, salaryInput);
    });

    if (ok) {
      // A zero saves without ever becoming a history entry, so say so rather
      // than claiming the month was recorded.
      setSalarySavedMonth(salaryMonth);
      setSuccess(
        Number(salaryInput) === 0
          ? `${formatMonthLabel(salaryMonth)} tetap kosong dan belum masuk riwayat.`
          : `Gaji ${formatMonthLabel(salaryMonth)} tersimpan.`,
      );
      reload();
    }
  };

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

    // Get the salary for the currently selected month in the salary picker
    const currentSalary = salaryByMonth.get(salaryMonth) ?? data.salary ?? 0;
    const errors = validateBudget(draft, { budgets, ignoreId: editingId, salary: currentSalary });
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
        await updateBudget(supabase, editingId, draft);
      } else {
        await createBudget(supabase, draft);
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

        const ok = await run(() => deleteBudget(supabase, budget.id));
        if (!ok) return false;

        setSuccess('Kategori dihapus.');
        reload();
        return true;
      },
    });
  };

  return (
    <div className="py-[34px] max-w-[1310px] mx-auto" id="konten">
      <header className="mb-section">
        <h1 className="text-[clamp(36px,4.5vw,58px)] tracking-[-0.065em] leading-[1.12] font-medium">
          Pengaturan
        </h1>
      </header>

      <section className="grid grid-cols-1 lg:grid-cols-[0.85fr_1.15fr] gap-card items-start">
        {/* Salary -------------------------------------------------------- */}
        <Panel>
              <Eyebrow className="mb-[12px]">Gaji</Eyebrow>
          <h2 className="text-[19px] tracking-[-0.04em] font-medium mb-[16px]">Gaji per bulan</h2>

          {/* Month picker. The salary form edits one month at a time, so the
              figure on screen always belongs to the month named here rather
              than to whatever "now" happens to be. */}
          <div className="flex items-center gap-[8px] mb-[16px]">
            <button
              type="button"
              onClick={() => stepMonth(-1)}
              disabled={!monthOptions.includes(shiftMonth(salaryMonth, -1))}
              aria-label="Bulan sebelumnya"
              className="w-[36px] h-[36px] flex-none grid place-items-center border border-ruang-line-2 rounded-[3px] text-ruang-subtle hover:text-ruang-accent-text hover:border-ruang-accent-text transition-colors disabled:opacity-30 hover:text-ruang-subtle hover:border-ruang-line-2 cursor-pointer"
            >
              <ArrowLeftIcon size={13} aria-hidden="true" />
            </button>

            <div className="relative flex-1 min-w-0">
              <label htmlFor="salary-month" className="sr-only">
                Pilih bulan gaji
              </label>
              <select
                id="salary-month"
                value={salaryMonth}
                onChange={(e) => selectMonth(e.target.value)}
                className="w-full h-[36px] bg-ruang-shell border border-ruang-line-2 rounded-[3px] text-ruang-ink px-[10px] text-[13px] outline-none focus:border-ruang-accent-text cursor-pointer"
              >
                {monthOptions.map((key) => (
                  <option key={key} value={key} className="bg-ruang-shell">
                    {formatMonthLabel(key)}
                    {key === currentMonthKey() ? ' — bulan ini' : ''}
                    {salaryByMonth.has(key) ? '' : ' — belum diisi'}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() => stepMonth(1)}
              disabled={!monthOptions.includes(shiftMonth(salaryMonth, 1))}
              aria-label="Bulan berikutnya"
              className="w-[36px] h-[36px] flex-none grid place-items-center border border-ruang-line-2 rounded-[3px] text-ruang-subtle hover:text-ruang-accent-text hover:border-ruang-accent-text transition-colors disabled:opacity-30 hover:text-ruang-subtle hover:border-ruang-line-2 cursor-pointer"
            >
              <ArrowRightIcon size={13} aria-hidden="true" />
            </button>
          </div>

          <NumberField
            id="salary"
            label={`Gaji ${formatMonthLabel(salaryMonth)}`}
            value={salaryInput}
            onChange={(e) => {
              setSalaryInput(e.target.value.replace(/[^\d]/g, ''));
              setSalaryError(null);
              setSalarySavedMonth('');
            }}
            error={salaryError}
            size="lg"
            autoComplete="off"
            hint="Gaji bersih bulan itu. Menyimpan hanya mengubah bulan yang dipilih. Nominal nol berarti bulan itu belum diisi, jadi tidak masuk riwayat."
          />

          <div className="mt-[16px] flex items-center gap-[10px]">
            <Button onClick={handleSalarySave} busy={busy} busyLabel="Menyimpan...">
              Simpan gaji <ArrowRightUpIcon size={15} aria-hidden="true" />
            </Button>
            {hasSelectedRecord && (
              <span className="font-mono text-[11px] tracking-[0.06em] text-ruang-subtle">
                Tersimpan {formatIDR(selectedSalary)}
              </span>
            )}
          </div>

          {salarySavedMonth && (
            <p className="text-ruang-accent-text text-[12px] mt-[10px]" role="status">
              {Number(salaryInput) === 0
                ? `${formatMonthLabel(salarySavedMonth)} tetap kosong dan belum masuk riwayat.`
                : `Gaji ${formatMonthLabel(salarySavedMonth)} tersimpan.`}
            </p>
          )}

          <div className="mt-[20px] pt-[16px] border-t border-ruang-line">
            <div className="flex items-center justify-between gap-[10px]">
              <span className="font-mono text-[11px] tracking-[0.08em] text-ruang-subtle uppercase">
                Anggaran dan gaji {formatMonthLabel(salaryMonth).toUpperCase()}
              </span>
              <strong
                className={`font-mono text-[13px] ${
                  totalAllocated > selectedSalary ? 'text-ruang-danger' : 'text-ruang-ink'
                }`}
              >
                {formatIDR(totalAllocated)}
              </strong>
            </div>
            <div className="flex items-center justify-between gap-[10px] mt-[8px]">
              <span className="text-[12px] text-ruang-subtle">
                {totalAllocated > selectedSalary ? 'Melebihi gaji bulan ini' : 'Sisa belum dialokasikan'}
              </span>
              <strong className="font-mono text-[13px] text-ruang-accent-text">
                {formatIDR(Math.abs(selectedSalary - totalAllocated))}
              </strong>
            </div>
          </div>

          {/* History. Read-only on purpose: it exists so a raise is visible, and
              clicking a row jumps the picker to that month rather than editing
              in place, so there is only ever one editing surface.

              One row per month the user actually saved. Months that were never
              filled in have no row here and no entry on /history, so nothing
              appears that nobody entered. */}
          <div className="mt-[20px] pt-[16px] border-t border-ruang-line">
            <div className="flex items-center justify-between gap-[10px] mb-[10px]">
              <span className="font-mono text-[11px] tracking-[0.08em] text-ruang-subtle uppercase">Riwayat gaji</span>
              <span className="font-mono text-[11px] text-ruang-subtle">
                {(salaryRecords ?? []).length} bulan
              </span>
            </div>

            {(salaryRecords ?? []).length ? (
              <ul className="border-t border-ruang-line">
                {(salaryRecords ?? []).map((record) => (
                  <li key={record.month}>
                    <button
                      type="button"
                      onClick={() => selectMonth(record.key)}
                      aria-current={record.key === salaryMonth ? 'true' : undefined}
                      className={`w-full flex items-center gap-[10px] border-b border-ruang-line py-[11px] px-[8px] rounded-[3px] text-left transition-colors ${
                        record.key === salaryMonth ? 'bg-ruang-hover' : 'hover:bg-ruang-hover'
                      }`}
                    >
                      <span
                        className={`flex-1 min-w-0 text-[13px] font-medium truncate ${
                          record.key === salaryMonth ? 'text-ruang-accent-text' : 'text-ruang-ink'
                        }`}
                        title={formatMonthLabel(record.key)}
                      >
                        {formatMonthLabel(record.key)}
                      </span>
                      {record.key === currentMonthKey() && (
                        <span className="font-mono text-[11px] text-ruang-subtle flex-none">Bulan ini</span>
                      )}
                      <span className="font-mono text-[12px] text-ruang-body whitespace-nowrap flex-none">
                        {formatIDR(record.amount)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState className="!p-[14px]">
                Belum ada gaji tersimpan. Isi nominal di atas, lalu bulan itu baru muncul di riwayat.
              </EmptyState>
            )}
          </div>
        </Panel>

        {/* Categories ---------------------------------------------------- */}
        {/* `scroll-mt-[70px]` clears the fixed mobile bar when this panel is
            targeted by an anchor link from the transactions page. */}
        <Panel id="form-kategori" className="scroll-mt-[70px]">
          <div className="flex items-center justify-between gap-[10px] mb-[17px]">
            <div>
              <Eyebrow>Anggaranmu</Eyebrow>
              <h2 className="text-[20px] tracking-[-0.04em] font-medium m-[5px_0_0]">Anggaran kategori</h2>
            </div>
            <span className="border border-ruang-line-3 px-[7px] py-[3px] text-ruang-muted font-mono text-[11px] tracking-[0.06em] flex-none">
              {budgets.length} kategori
            </span>
          </div>

          {/* Create / edit form. Without this the app is a dead end for a new
              account: the trigger seeds five categories, but deleting one left
              no way to bring a replacement back. */}
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
                      className="w-[28px] h-[28px] grid place-items-center text-ruang-subtle hover:text-ruang-accent-text rounded-[3px] transition-colors"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path d="M4 20h4L20 8l-4-4L4 16v4Z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(budget)}
                      aria-label={`Hapus kategori ${budget.name}`}
                      className="w-[28px] h-[28px] grid place-items-center text-ruang-subtle hover:text-ruang-danger-ink rounded-[3px] transition-colors"
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
