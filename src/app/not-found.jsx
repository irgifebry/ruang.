import Link from 'next/link';

export const metadata = {
  title: 'Halaman tidak ditemukan',
};

export default function NotFound() {
  return (
    <div id="konten" className="min-h-[65vh] grid place-items-center py-section px-[22px]">
      <div className="text-center">
        <h1 className="text-[clamp(44px,8vw,90px)] tracking-[-0.07em] leading-[1] font-medium mb-card">
          4<span className="text-ruang-accent-text">0</span>4
        </h1>
        <p className="text-[14px] text-ruang-muted max-w-[420px] mx-auto leading-[1.65] mb-section">
          Halaman tidak ditemukan. Alamat yang kamu buka tidak ada, atau sudah dipindahkan.
        </p>
        <div className="flex flex-wrap justify-center gap-card">
          <Link
            href="/"
            className="h-[42px] px-[18px] flex items-center text-[13px] font-semibold rounded-[4px] bg-ruang-accent text-ruang-accent-ink hover:bg-ruang-accent-hover transition-colors active:scale-95 no-underline"
          >
            Ke ringkasan
          </Link>
          <Link
            href="/transactions"
            className="h-[42px] px-[18px] flex items-center text-[13px] font-semibold rounded-[4px] border border-ruang-line-3 text-ruang-ink hover:border-ruang-accent-text hover:text-ruang-accent-text transition-colors no-underline"
          >
            Lihat transaksi
          </Link>
        </div>
      </div>
    </div>
  );
}
