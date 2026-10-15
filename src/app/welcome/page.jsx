import Link from 'next/link';
import { initialBudgets, initialExpenses, initialSalary } from '@/lib/data';
import { barClass, chipClass } from '@/lib/category-colors';
import { formatIDR, formatMonthLabel, getBudgetSummary, ratioPercent } from '@/lib/money';
import { ArrowRightUpIcon } from '@/components/icons';
import BrandMark from '@/components/BrandMark';
import { Eyebrow } from '@/components/ui';

export const metadata = {
  title: 'Atur uang bulananmu',
  description: 'Atur gaji, buat anggaran, catat pengeluaran, dan cek sisa uang tiap bulan.',
};

/**
 * Marketing page for signed-out visitors.
 *
 * The figures below are a fixed illustration built from `lib/data.js`, not the
 * visitor's own data — there is no account yet at this point. They are labelled
 * as such on the page so the numbers cannot be mistaken for real ones.
 */

export default function WelcomePage() {
  const summary = getBudgetSummary(initialSalary, initialBudgets, initialExpenses);
  const recentExpenses = initialExpenses.slice(0, 5);

  return (
    <div className="py-[34px] max-w-[1310px] mx-auto" id="konten">
      <header className="flex items-center justify-between gap-[18px]">
        <Brand />
        <div className="flex items-center gap-[10px]">
          <Link href="/login" className={SECONDARY_BUTTON}>
            Masuk
          </Link>
          <Link href="/register" className={PRIMARY_BUTTON}>
            Daftar gratis
          </Link>
        </div>
      </header>

      <section className="pt-[62px] pb-[54px] grid grid-cols-1 lg:grid-cols-[1.06fr_0.94fr] gap-section items-end">
        <div>
          <h1 className="text-[clamp(38px,5.4vw,66px)] tracking-[-0.065em] leading-[1.1] font-medium mb-[18px]">
            Atur gaji,
            <br />
            pantau <em className="font-normal italic text-ruang-accent-text">pengeluaran.</em>
          </h1>
          <p className="text-[14px] text-ruang-muted leading-[1.7] max-w-[460px]">
            Buat anggaran bulanan dan catat pengeluaran.
          </p>
        </div>

        <SampleCard summary={summary} />
      </section>

      <section className="border-t border-ruang-line pt-[34px]">
        <div className="flex flex-wrap items-end justify-between gap-[14px] mb-[26px]">
          <div>
            <Eyebrow>Fitur</Eyebrow>
            <h2 className="text-[26px] tracking-[-0.05em] font-medium m-[6px_0_0]">Ringkasan keuangan bulanan</h2>
          </div>
          <p className="text-[13px] text-ruang-subtle max-w-[340px] leading-[1.65]">
            Catatan dimasukkan manual. Tidak ada koneksi bank.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-[1px] bg-ruang-line border border-ruang-line rounded-[10px] overflow-hidden">
          {[
            ['Gaji bulanan', 'Simpan gaji tiap bulan.'],
            ['Anggaran kategori', 'Tetapkan batas untuk tiap kategori.'],
            ['Riwayat transaksi', 'Lihat pengeluaran per bulan.'],
          ].map(([title, body], i) => (
            <article key={title} className="bg-ruang-panel p-[22px] min-h-[130px]">
              <span className="font-mono text-[11px] text-ruang-accent-text">0{i + 1}</span>
              <h3 className="text-[16px] font-medium mt-[18px] mb-[5px]">{title}</h3>
              <p className="text-[13px] text-ruang-muted">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-[1.08fr_0.92fr] gap-section mt-section">
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-[10px] mb-[17px]">
            <div>
              <Eyebrow>Contoh pembagian</Eyebrow>
              <h2 className="text-[20px] tracking-[-0.04em] font-medium m-[5px_0_0]">Anggaran kategori</h2>
            </div>
            <span className="border border-ruang-line-3 px-[7px] py-[3px] text-ruang-muted font-mono text-[11px] tracking-[0.06em] flex-none">
              {summary.categories.length} KATEGORI
            </span>
          </div>

          <div className="border-t border-ruang-line">
            {summary.categories.map((category, index) => (
              <div key={category.id} className="flex items-center gap-[12px] py-[13px] border-b border-ruang-line">
                <div
                  className={`w-[28px] h-[28px] rounded-[4px] flex-none grid place-items-center font-mono text-[11px] ${chipClass(category.color)}`}
                  aria-hidden="true"
                >
                  {String(index + 1).padStart(2, '0')}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-[8px] mb-[8px]">
                    <strong className="text-[13px] font-medium truncate">{category.name}</strong>
                    <span className="text-ruang-body font-mono text-[12px] whitespace-nowrap flex-none">
                      {formatIDR(category.spent)} <i className="text-ruang-ghost font-style-normal mx-[3px]">/</i>{' '}
                      {formatIDR(category.limit)}
                    </span>
                  </div>
                  <div
                    className="h-[4px] bg-ruang-track rounded-[2px] overflow-hidden"
                    role="progressbar"
                    aria-valuenow={Math.round(category.percent)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${category.name}: ${Math.round(category.percent)}% terpakai`}
                  >
                    <span
                      className={`bar-grow block h-full ${barClass(category.color)}`}
                      style={{ width: `${category.percent}%` }}
                    />
                  </div>
                </div>
                <div className="w-[36px] text-right font-mono text-[12px] text-ruang-muted flex-none">
                  {Math.round(category.percent)}%
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex items-center justify-between gap-[10px] mb-[17px]">
            <div>
              <Eyebrow>Contoh transaksi</Eyebrow>
              <h2 className="text-[20px] tracking-[-0.04em] font-medium m-[5px_0_0]">Aktivitas terbaru</h2>
            </div>
            <span className="border border-ruang-line-3 px-[7px] py-[3px] text-ruang-muted font-mono text-[11px] tracking-[0.06em] flex-none">
              {recentExpenses.length} catatan
            </span>
          </div>

          <div className="border-t border-ruang-line">
            {recentExpenses.map((expense) => {
              const budget = initialBudgets.find((item) => item.id === expense.categoryId);
              return (
                <div key={expense.id} className="flex items-center gap-[12px] py-[13px] border-b border-ruang-line">
                  <span
                    className={`w-[28px] h-[28px] rounded-[4px] flex-none grid place-items-center text-[12px] font-medium ${chipClass(budget?.color)}`}
                    aria-hidden="true"
                  >
                    {(budget?.name || 'L').slice(0, 1).toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <strong className="block text-[13px] font-medium truncate">{expense.description}</strong>
                    <small className="block mt-[4px] text-ruang-muted text-[12px] truncate">
                      {budget?.name} <span className="text-ruang-ghost px-[3px]">·</span>{' '}
                      {formatMonthLabel(expense.date.slice(0, 7))}
                    </small>
                  </div>
                  <strong className="font-mono text-[12px] text-ruang-ink whitespace-nowrap flex-none">
                    &minus;{formatIDR(expense.amount)}
                  </strong>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <footer className="border-t border-ruang-line mt-[34px] py-[20px] flex items-center justify-between gap-[16px]">
        <Link href="/welcome/help" className="text-[13px] text-ruang-muted hover:text-ruang-accent-text no-underline">Bantuan</Link>
      </footer>
    </div>
  );
}

function SampleCard({ summary }) {
  return (
    <div className="border border-ruang-line-soft bg-ruang-raised p-[24px_26px] relative overflow-hidden">
      <div className="flex justify-between items-center font-mono text-[11px] tracking-[0.1em] text-ruang-muted uppercase">
        <span>SISA UANG BULAN INI</span>
        <span className="flex items-center gap-[7px] text-ruang-body">
          <span className="w-[6px] h-[6px] bg-ruang-accent rounded-full shadow-[0_0_9px_#c9fb5570]" /> Contoh data
        </span>
      </div>

      <div className="text-[clamp(32px,4.6vw,52px)] font-medium tracking-[-0.07em] my-[26px_0_6px] break-words">
        {formatIDR(summary.remaining)}
      </div>

      <div className="text-[13px] leading-[1.6] text-ruang-muted">
        dari gaji bulanan{' '}
        <strong className="text-ruang-ink font-medium ml-[5px]">{formatIDR(summary.salary)}</strong>
      </div>

      <div className="mt-[22px] h-[5px] bg-ruang-track rounded-[2px] overflow-hidden">
        <span
          className="bar-grow block h-full bg-ruang-accent"
          style={{ width: `${ratioPercent(summary.remaining, summary.salary)}%` }}
        />
      </div>

      <div className="mt-[10px] flex justify-between items-center font-mono text-[11px] tracking-[0.1em] text-ruang-muted uppercase">
        <span>SISA TERSEDIA</span>
        <span className="text-ruang-accent-text">
          {Math.round(ratioPercent(summary.remaining, summary.salary))}%
        </span>
      </div>
    </div>
  );
}

function Brand() {
  return (
    <Link href="/welcome" className="flex items-center gap-[11px] text-[22px] font-bold tracking-[-1.3px] text-ruang-ink no-underline">
      <span className="w-[30px] h-[30px] bg-ruang-accent text-ruang-accent-ink grid place-items-center rounded-[8px]">
        <BrandMark size={19} />
      </span>
      <span>
        ruang<span className="text-ruang-accent-text">.</span>
      </span>
    </Link>
  );
}

const PRIMARY_BUTTON =
  'h-[38px] px-[16px] flex items-center text-[13px] font-semibold rounded-[4px] bg-ruang-accent text-ruang-accent-ink hover:bg-ruang-accent-hover transition-colors active:scale-95 no-underline';

const SECONDARY_BUTTON =
  'h-[38px] px-[16px] flex items-center text-[13px] font-semibold rounded-[4px] border border-ruang-line-3 text-ruang-ink hover:border-ruang-accent-text hover:text-ruang-accent-text transition-colors no-underline';
