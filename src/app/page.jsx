'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useLedgerData } from '@/hooks/useLedgerData';
import { fetchLedger } from '@/lib/ledger';
import { spendByDay, spendByMonth } from '@/lib/charts';
import {
  balanceLevel,
  currentMonthKey,
  formatIDR,
  formatMonthLabel,
  getBudgetSummary,
  monthKey,
  ratioPercent,
} from '@/lib/money';
import { AllocationDonut, SpendChart } from '@/components/charts';
import { CategoryRow, ExpenseList } from '@/components/expense-row';
import { ArrowRightUpIcon, CheckIcon, CircleDotIcon, DangerCircleIcon } from '@/components/icons';
import { EmptyState, ErrorState, Eyebrow, LoadingState, Panel } from '@/components/ui';

export default function Dashboard() {
  const { data, loading, error, reload } = useLedgerData(fetchLedger);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <ErrorState message="Sesi tidak ditemukan. Silakan masuk kembali." />;

  return <DashboardContent data={data} />;
}

/** Split out so the header and cards only re-render when data actually changes. */
function DashboardContent({ data }) {
  const { salary, budgets, expenses } = data;
  const month = currentMonthKey();
  const [granularity, setGranularity] = useState('day');

  // Everything on this screen is scoped to the current month. Previously the
  // page summed every expense the user had ever entered, so an entry from
  // March still moved the "sisa uang bulan ini" figure in October.
  const monthExpenses = expenses.filter((expense) => monthKey(expense.spent_on) === month);
  const summary = getBudgetSummary(salary, budgets, monthExpenses);

  const recent = [...monthExpenses].slice(0, 6);
  const remainingPercent = ratioPercent(summary.remaining, summary.salary);
  const isOver = summary.remaining < 0;
  const unallocated = summary.unallocated;

  // One severity for the whole balance card, so the figure, the meter fill, the
  // note icon and the note text can never disagree about how the month is going.
  const level = balanceLevel(summary.remaining, summary.salary);
  const isLow = level === 'low' || level === 'empty';

  // An unset salary is an empty state, not a verdict — it stays neutral rather
  // than borrowing the amber that means "you are nearly out of money".
  const figureTone = summary.salary === 0 ? '' : level === 'over' ? 'text-ruang-danger' : isLow ? 'text-ruang-warn-text' : '';
  const meterTone = level === 'over' ? 'bg-ruang-danger' : isLow ? 'bg-ruang-warn' : 'bg-ruang-accent';

  // The donut shows the *plan* — each category's monthly limit — because the
  // category list underneath already shows how much of it is spent. Splitting
  // the same numbers across both would make the two sections answer one question
  // twice. Zero-limit categories drop out on their own inside buildDonutSlices.
  const allocation = summary.categories.map((category) => ({
    id: category.id,
    name: category.name,
    value: category.limit,
    color: category.color,
  }));

  // The daily view covers the month being displayed; the monthly view reaches
  // back over the whole expense history, because a single month has nothing to
  // compare itself against. Not memoised: both are a handful of numbers, and a
  // `monthExpenses` filter creates a new array every render, so the memo would
  // miss on every pass anyway.
  const spendSeries =
    granularity === 'day' ? spendByDay(monthExpenses, month) : spendByMonth(expenses, month, 6);

  const spendAxisLabel =
    granularity === 'day'
      ? (point) => `Tanggal ${point.label}`
      : (point) => (point.key ? formatMonthLabel(point.key) : point.label);

  return (
    <div className="py-[34px] max-w-[1310px] mx-auto" id="konten">
      <header className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-[16px] mb-section">
        <h1 className="text-[clamp(36px,4.5vw,58px)] tracking-[-0.05em] leading-[1.12] font-medium">
          Ringkasan
        </h1>
        <Link
          href="/transactions"
          className="h-[42px] px-[18px] flex items-center gap-[10px] text-[13px] font-bold tracking-[0.02em] rounded-[4px] bg-ruang-accent text-ruang-accent-ink hover:bg-ruang-accent-hover transition-colors active:scale-95 no-underline flex-none"
        >
          <span aria-hidden="true">＋</span> Catat pengeluaran
        </Link>
      </header>

      <section className="grid grid-cols-1 lg:grid-cols-[1.14fr_0.86fr] gap-card">
        {/* Headline balance. When spending exceeds salary the number turns red
            and states so in words, so the sign is never the only signal.

            These two cards are a pair, so their meters belong on the same line.
            `justify-between` only pinned the note to the bottom edge, and
            bottom-anchoring the meter block left it offset by however much the
            two headline blocks differed in height — a 44px balance figure on the
            left against a two-column stat pair on the right. Both headline blocks
            therefore share the `lg:min-h-[140px]` floor that the taller one needs
            — the left at 119px, plus room for a wrapped "dari gaji" line —
            which pins the bar, its label row, the rule and the note to identical
            baselines in each card. Deliberately not `flex-1`: growing would let
            the taller note on the right push its own headline up and undo it. */}
        <Panel tone="raised" className="flex flex-col">
          {/* The `mb` exists only below `lg`: stacked there the two cards are one
              after another and need no shared baseline, so the floor above does
              not apply and the headline would otherwise butt against the meter.
              From `lg` up the floor does the spacing and `mb-0` keeps it. */}
          <div className="flex flex-col mb-[22px] lg:mb-0 lg:min-h-[140px]">
            <div className="flex items-center justify-between gap-[10px]">
              <div>
              <Eyebrow>{formatMonthLabel(month)}</Eyebrow>
                <h2 className="text-[20px] tracking-[-0.03em] font-medium mt-[8px]">Sisa uang</h2>
              </div>
            </div>

            {/* The salary figure qualifies the balance, so from `sm` up it sits
                beside it rather than under it. Below `sm` it drops to its own line
                — either forced by `basis-full` or by the row wrapping when the
                amount is long — which is why the shared floor below is tall enough
                to absorb that second line. */}
            <div className="mt-[28px] flex flex-wrap items-baseline gap-x-[10px] gap-y-[6px]">
              <div
                className={`text-[clamp(30px,3.8vw,44px)] font-medium tracking-[-0.07em] leading-none break-words ${
                  figureTone || 'text-ruang-ink'
                }`}
              >
                {formatIDR(summary.remaining)}
              </div>
              {/* Below `sm` this takes a full row instead of sitting beside the
                  figure: at balance sizes it still fits, and `items-baseline`
                  then drops it onto the bottom edge of the number, where it reads
                  as part of the figure and crowds the meter below. */}
              <div className="basis-full sm:basis-auto text-[13px] leading-[1.6] text-ruang-muted">
                dari gaji <strong className="text-ruang-ink font-medium ml-[4px]">{formatIDR(summary.salary)}</strong>
              </div>
            </div>
          </div>

          <div>
            <div
              className="h-[5px] bg-ruang-track rounded-[4px] overflow-hidden"
              role="progressbar"
              aria-valuenow={Math.round(remainingPercent)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Persentase sisa uang"
            >
              <span
                className={`bar-grow block h-full ${meterTone}`}
                style={{ width: `${remainingPercent}%` }}
              />
            </div>

            <div className="mt-[20px] flex justify-between items-center text-[12px] leading-[1.5] text-ruang-muted gap-[12px]">
              <span>{Math.round(remainingPercent)}% tersisa</span>
              <span>{formatIDR(summary.spent)} terpakai</span>
            </div>

            <div className="h-[1px] bg-ruang-line mt-[16px] mb-[16px]" />

            {/* Every branch names its state in words as well as colour: `level`
                drives the amber, the sentence is what carries the meaning if the
                hue is missed or read wrong. */}
            <div className="flex items-start gap-[10px] text-ruang-body text-[12px] leading-[1.6]">
              {isOver ? (
                <>
                  <DangerCircleIcon size={16} className="flex-none text-ruang-danger mt-[2px]" aria-hidden="true" />
                  <p className="text-ruang-danger">
                    Melebihi gaji {formatIDR(Math.abs(summary.remaining))}.
                  </p>
                </>
              ) : summary.salary === 0 ? (
                <>
                  <CircleDotIcon size={16} className="flex-none text-ruang-muted mt-[2px]" aria-hidden="true" />
                  <p>Gaji belum diatur. Atur gaji di menu Pengaturan.</p>
                </>
              ) : summary.remaining === 0 ? (
                <>
                  <CircleDotIcon size={16} className="flex-none text-ruang-warn-text mt-[2px]" aria-hidden="true" />
                  <p className="text-ruang-warn-text">Seluruh gaji sudah terpakai bulan ini.</p>
                </>
              ) : level === 'low' ? (
                <>
                  <CircleDotIcon size={16} className="flex-none text-ruang-warn-text mt-[2px]" aria-hidden="true" />
                  <p className="text-ruang-warn-text">
                    Tinggal {formatIDR(summary.remaining)} dari {formatIDR(summary.salary)}.
                  </p>
                </>
              ) : (
                <>
                  <CheckIcon size={16} className="flex-none text-ruang-accent-text mt-[2px]" aria-hidden="true" />
                  <p>Sisa dana tersedia.</p>
                </>
              )}
            </div>
          </div>
        </Panel>

        <Panel className="flex flex-col">
          {/* Matches the left card: clearance from the meter below `lg` only,
              where the shared floor is not in play. */}
          <div className="flex flex-col mb-[22px] lg:mb-0 lg:min-h-[140px]">
            <div className="flex items-center justify-between gap-[10px]">
              <div>
                <Eyebrow>Anggaran</Eyebrow>
                <h2 className="text-[20px] tracking-[-0.03em] font-medium mt-[8px]">Arus kas</h2>
              </div>
              <Link
                href="/settings"
                className="inline-flex items-center gap-[4px] text-ruang-body text-[12px] hover:text-ruang-accent-text transition-colors no-underline flex-none"
              >
                Atur anggaran <ArrowRightUpIcon size={12} aria-hidden="true" />
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-x-[18px] mt-[28px]">
              <div>
                <small className="block font-mono text-[11px] text-ruang-subtle tracking-[0.09em] mb-[9px]">SUDAH DIPAKAI</small>
                <strong className="block text-[18px] leading-[1.3] font-medium tracking-[-0.04em]">{formatIDR(summary.spent)}</strong>
              </div>
              <div>
                <small className="block font-mono text-[11px] text-ruang-subtle tracking-[0.09em] mb-[9px]">Batas anggaran</small>
                <strong className="block text-[18px] leading-[1.3] font-medium tracking-[-0.04em]">{formatIDR(summary.allocated)}</strong>
              </div>
            </div>
          </div>

          <div>
            <div
              className="h-[5px] bg-ruang-track rounded-[4px] overflow-hidden"
              role="progressbar"
              aria-valuenow={Math.round(summary.allocated ? (summary.spent / summary.allocated) * 100 : 0)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Anggaran bulanan terpakai"
            >
              <span
                className={`bar-grow block h-full ${
                  summary.allocated > 0 && summary.spent > summary.allocated ? 'bg-ruang-danger' : 'bg-ruang-accent'
                }`}
                style={{ width: `${ratioPercent(summary.spent, summary.allocated)}%` }}
              />
            </div>

            <div className="mt-[20px] flex justify-between items-center text-[12px] leading-[1.5] text-ruang-muted gap-[12px]">
              <span>{Math.round(ratioPercent(summary.spent, summary.allocated))}% anggaran terpakai</span>
              <span>
                {summary.allocated - summary.spent >= 0
                  ? `${formatIDR(summary.allocated - summary.spent)} tersisa`
                  : `lebih ${formatIDR(summary.spent - summary.allocated)}`}
              </span>
            </div>

            <div className="h-[1px] bg-ruang-line mt-[16px] mb-[16px]" />

            <div className="flex items-start gap-[10px] text-ruang-body text-[12px] leading-[1.6]">
              <ArrowRightUpIcon size={16} className="flex-none text-ruang-accent-text mt-[2px]" aria-hidden="true" />
              <p>
                {isOver
                  ? 'Pengeluaran melebihi gaji. Cek anggaranmu.'
                  : unallocated > 0
                    ? `${formatIDR(unallocated)} gaji belum dialokasikan ke kategori mana pun.`
                    : unallocated < 0
                      ? `Alokasi melebihi gaji sebesar ${formatIDR(Math.abs(unallocated))}.`
                      : 'Seluruh gaji sudah dialokasikan. Ritme pengeluaranmu dalam kendali.'}
              </p>
            </div>
          </div>
        </Panel>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-[0.88fr_1.12fr] gap-card mt-section">
        <AllocationDonut
          categories={allocation}
          emptyLabel={
            budgets.length
              ? 'Belum ada anggaran bulanan yang bisa dihitung.'
              : 'Belum ada kategori. Buat anggaran di pengaturan untuk melihat porsinya.'
          }
        />

        <SpendChart
          series={spendSeries}
          granularity={granularity}
          onGranularityChange={setGranularity}
          axisLabel={spendAxisLabel}
          emptyLabel={`Belum ada pengeluaran yang tercatat bulan ${formatMonthLabel(month)}.`}
        />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-[1.08fr_0.92fr] gap-card mt-section">
        <div className="min-w-0">
          <div className="flex items-center justify-between mb-[17px]">
            <div>
              <Eyebrow>Anggaran</Eyebrow>
              <h2 className="text-[20px] tracking-[-0.03em] font-medium mt-[6px] mb-[2px]">Anggaran kategori</h2>
            </div>
            {summary.overBudgetCount > 0 && (
              <span className="border border-ruang-danger text-ruang-danger px-[7px] py-[3px] font-mono text-[11px] tracking-[0.06em] flex-none">
                {summary.overBudgetCount} lewat batas
              </span>
            )}
          </div>

          {budgets.length ? (
            <div className="border-t border-ruang-line">
              {summary.categories.map((category, index) => (
                <CategoryRow key={category.id} category={category} index={index} />
              ))}
            </div>
          ) : (
            <EmptyState>
              Belum ada kategori.{' '}
              <Link href="/settings" className="text-ruang-accent-text underline underline-offset-2">
                Buat anggaran
              </Link>{' '}
              untuk mulai melacak pengeluaran.
            </EmptyState>
          )}
        </div>

        <div className="min-w-0">
          <div className="flex items-center justify-between mb-[17px]">
            <div>
              <Eyebrow>Terbaru</Eyebrow>
              <h2 className="text-[20px] tracking-[-0.03em] font-medium mt-[6px] mb-[2px]">Transaksi</h2>
            </div>
            <Link
              href="/transactions"
              className="inline-flex items-center gap-[4px] text-ruang-body text-[12px] hover:text-ruang-accent-text transition-colors no-underline flex-none"
            >
              Semua <ArrowRightUpIcon size={12} aria-hidden="true" />
            </Link>
          </div>

          <ExpenseList
            expenses={recent}
            budgets={budgets}
            dense
            emptyLabel={`Belum ada transaksi bulan ${formatMonthLabel(month)}. Catat pengeluaran pertama.`}
          />
        </div>
      </section>

    </div>
  );
}
