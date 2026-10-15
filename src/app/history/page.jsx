'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useLedgerData } from '@/hooks/useLedgerData';
import { buildHistoryRows, fetchMonthlyBreakdown, fetchSalaryHistory } from '@/lib/ledger';
import {
  formatIDR,
  formatIDRCompact,
  formatMonthLabel,
  ratioPercent,
} from '@/lib/money';
import { EmptyState, ErrorState, Eyebrow, LoadingState, Panel } from '@/components/ui';

const MONTHS_WINDOW = 12;

/** Salary per month and spending grouped by month, fetched together. */
const loadHistory = async (supabase) => {
  const [salaryRows, breakdown] = await Promise.all([
    fetchSalaryHistory(supabase, MONTHS_WINDOW),
    fetchMonthlyBreakdown(supabase, MONTHS_WINDOW),
  ]);
  // `breakdown` carries `incomesByMonth` through untouched; it is spread here
  // so `buildHistoryRows` receives the same key it reads on a full fetch.
  return { salaryRows, ...breakdown };
};

export default function HistoryPage() {
  const { data, loading, error, reload } = useLedgerData(loadHistory);
  // All hooks run before any early return, so the hook order stays stable
  // across loading -> loaded transitions.
  const rows = useMemo(() => buildHistoryRows(data), [data]);

  if (loading) return <LoadingState label="Memuat riwayat..." />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <ErrorState message="Sesi tidak ditemukan. Silakan masuk kembali." />;

  const totalSaved = rows.reduce((sum, row) => sum + row.saved, 0);
  const totalSpent = rows.reduce((sum, row) => sum + row.spent, 0);

  return (
    <div className="py-[34px] max-w-[1310px] mx-auto" id="konten">
      <header className="mb-section">
        <h1 className="text-[clamp(36px,4.5vw,58px)] tracking-[-0.065em] leading-[1.12] font-medium">
          Riwayat
        </h1>
      </header>

      {rows.length === 0 ? (
        <Panel>
          <EmptyState>
            Belum ada riwayat. Simpan gaji dan catat pengeluaran supaya bulan itu muncul di sini.
            <br />
            <Link href="/settings" className="text-ruang-accent-text underline underline-offset-2">
              Simpan gaji bulan ini
            </Link>
          </EmptyState>
        </Panel>
      ) : (
        <>
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-card mb-section">
            <SummaryCard
              index={0}
              label="Total pengeluaran"
              value={formatIDRCompact(totalSpent)}
              sub={`${rows.length} bulan tercatat`}
            />
            <SummaryCard
              index={1}
              label="Total tersisa"
              value={formatIDRCompact(totalSaved)}
              tone={totalSaved < 0 ? 'danger' : 'default'}
              sub={totalSaved < 0 ? 'Pengeluaran melebihi pemasukan' : 'Pemasukan dikurangi pengeluaran'}
            />
            <SummaryCard
              index={2}
              label="Bulan terbaru"
              value={formatMonthLabel(rows[0].key)}
              sub={`${formatIDRCompact(rows[0].spent)} pengeluaran`}
            />
            <SummaryCard
              index={3}
              label="Rata-rata / bulan"
              value={formatIDRCompact(totalSpent / rows.length)}
              sub="Pengeluaran"
            />
          </section>

          <section>
            <Panel>
              <div className="flex items-center justify-between mb-[18px]">
                <div>
                  <Eyebrow>Perbandingan</Eyebrow>
                  <h2 className="text-[20px] tracking-[-0.04em] font-medium m-[6px_0_0]">Pengeluaran per bulan</h2>
                </div>
                <span className="font-mono text-[11px] tracking-[0.06em] text-ruang-subtle flex-none">
                  {MONTHS_WINDOW} bulan terakhir
                </span>
              </div>

              <ul className="flex flex-col gap-[3px]">
                {rows.map((row) => (
                  <li key={row.key}>
                    <div className="px-[12px] py-[12px] border-b border-ruang-line-soft last:border-0">
                      <div className="flex items-baseline justify-between gap-[10px] mb-[7px]">
                        <span className="text-[13px] font-medium truncate text-ruang-ink">
                          {formatMonthLabel(row.key)}
                        </span>
                        <span className="font-mono text-[12px] text-ruang-ink whitespace-nowrap flex-none">
                          {formatIDR(row.saved)} tersisa
                        </span>
                      </div>
                      <div className="h-[5px] bg-ruang-track rounded-[2px] overflow-hidden">
                        <span
                          className={`bar-grow block h-full ${row.saved < 0 ? 'bg-ruang-danger' : 'bg-ruang-accent'}`}
                          style={{ width: `${ratioPercent(row.spent, row.inflow)}%` }}
                        />
                      </div>
                      {/* Four facts, two lines. They were three spans in one `flex-wrap` plus a
                          paragraph, so on a phone each landed on its own line
                          and one month took four rows of height for two
                          numbers. The salary pair is a two-column grid with the
                          label above the amount — the same stat-pair shape the
                          dashboard cards use — and the share of salary moved
                          into the label, where it costs no extra line. The
                          transaction count and the top category share the row
                          underneath, which is wide enough for both. */}
                      <div className="mt-[13px] grid grid-cols-2 gap-x-[16px]">
                        <div className="min-w-0">
                          <small className="block font-mono text-[10px] uppercase tracking-[0.09em] text-ruang-subtle mb-[5px]">
                            {/* "Masuk" rather than "Gaji": the figure is the
                                month's whole inflow, so a month with a bonus in
                                it shows more than the salary. The breakdown
                                underneath says so rather than leaving the label
                                to be read literally. */}
                            Masuk
                          </small>
                          <strong className="block text-[13px] font-medium tracking-[-0.02em] text-ruang-ink truncate">
                            {formatIDR(row.inflow)}
                          </strong>
                        </div>
                        <div className="min-w-0">
                          <small className="block font-mono text-[10px] uppercase tracking-[0.09em] text-ruang-subtle mb-[5px]">
                            Keluar · {Math.round((row.spent / row.inflow) * 100)}% masuk
                          </small>
                          <strong className="block text-[13px] font-medium tracking-[-0.02em] text-ruang-ink truncate">
                            {formatIDR(row.spent)}
                          </strong>
                        </div>
                      </div>

                      {/* Only the months that actually have income rows, so a
                          normal month does not gain a line saying there was
                          none. */}
                      {row.income > 0 && (
                        <div className="mt-[8px] text-[12px] text-ruang-muted leading-[1.5]">
                          Termasuk pemasukan lain{' '}
                          <span className="font-mono text-ruang-ink">{formatIDR(row.income)}</span>
                          <span className="text-ruang-subtle">
                            {' '}
                            dari {row.incomeCount} catatan
                          </span>
                        </div>
                      )}

                      <div className="mt-[10px] flex items-baseline gap-x-[10px] text-[12px] leading-[1.5]">
                        <span className="text-ruang-subtle flex-none">{row.count} transaksi</span>
                        {row.categories.length > 0 && (
                          <span
                            className="min-w-0 truncate text-ruang-muted"
                            title={`Terbesar: ${row.categories
                              .slice(0, 3)
                              .map((category) => `${category.name} ${formatIDR(category.spent)}`)
                              .join(' · ')}`}
                          >
                            Terbesar: {row.categories.slice(0, 3).map((category) => `${category.name} ${formatIDR(category.spent)}`).join(' · ')}
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              <p className="mt-[18px] pt-[14px] border-t border-ruang-line text-ruang-subtle text-[12px] leading-[1.65]">
                Bar menunjukkan porsi pemasukan yang terpakai. Bar penuh berarti pengeluaran mencapai atau
                melebihi pemasukan; merah berarti pengeluaran melampaui pemasukan.
              </p>
            </Panel>
          </section>
        </>
      )}

      <div className="border border-ruang-line p-[16px_18px] mt-section flex items-start gap-[12px]">
        <span className="w-[7px] h-[7px] bg-ruang-accent flex-none mt-[6px]" />
        <p className="text-[13px] text-ruang-muted leading-[1.65]">
          Riwayat dihitung dari transaksi yang tersimpan di akunmu. Sebuah bulan masuk riwayat setelah kamu
          menyimpan gaji untuk bulan itu, jadi menaikkan gaji bulan ini tidak mengubah angka bulan-bulan
          sebelumnya. Pemasukan di luar gaji ikut dihitung sebagai bagian dari dana yang masuk pada bulan itu.
        </p>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, sub, tone = 'default', index = 0 }) {
  // Two cards across on a phone leaves ~117px of content once the page gutter,
  // the grid gap and the panel padding are taken off — not enough for a mono
  // uppercase label at 11px with 0.09em tracking. "Rata-rata / bulan" measured
  // ~124px and lost its last word. Below `sm` the label drops a point and
  // tightens, the padding gives back 12px, and nothing truncates: the sub line
  // wraps to two lines instead of losing its tail.
  return (
    <Panel className="!p-[16px_14px] sm:!p-[18px_20px] row-stagger" style={{ '--i': index }}>
      <small className="block font-mono text-[10px] sm:text-[11px] text-ruang-subtle tracking-[0.05em] uppercase mb-[7px] leading-[1.5]">
        {label}
      </small>
      <strong
        className={`block font-mono text-[18px] font-medium tracking-[-0.03em] truncate ${
          tone === 'danger' ? 'text-ruang-danger' : 'text-ruang-ink'
        }`}
        title={value}
      >
        {value}
      </strong>
      {sub && <small className="block mt-[6px] text-[12px] text-ruang-subtle leading-[1.45]">{sub}</small>}
    </Panel>
  );
}
