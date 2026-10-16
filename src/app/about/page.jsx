import Link from 'next/link';

export const metadata = {
  title: 'Tentang',
  description: 'ruang. membantu kamu mengatur gaji, anggaran, dan pengeluaran bulanan.',
  alternates: { canonical: '/about' },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Tentang · ruang.',
    description: 'ruang. membantu kamu mengatur gaji, anggaran, dan pengeluaran bulanan.',
    url: '/about',
    type: 'article',
    images: ['/opengraph-image'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Tentang · ruang.',
    description: 'ruang. membantu kamu mengatur gaji, anggaran, dan pengeluaran bulanan.',
    images: ['/opengraph-image'],
  },
};

const PRINCIPLES = [
  {
    title: 'Input manual',
    body: 'Aplikasi tidak terhubung ke rekening bank.',
  },
  {
    title: 'Data per bulan',
    body: 'Perubahan gaji tidak mengubah riwayat bulan sebelumnya.',
  },
  {
    title: 'Privat',
    body: 'Setiap akun hanya dapat mengakses catatannya sendiri.',
  },
];

export default function AboutPage() {
  return (
    <div className="py-[34px] max-w-[780px] mx-auto" id="konten">
      <header className="mb-section">
        <h1 className="text-[clamp(36px,4.5vw,58px)] tracking-[-0.065em] leading-[1.12] font-medium">
          ruang<span className="text-ruang-accent-text">.</span>
        </h1>
      </header>

      <div className="border-t border-ruang-line">
        {PRINCIPLES.map((item, index) => (
          <div key={item.title} className="border-b border-ruang-line py-[20px] flex gap-[18px]">
            <span className="font-mono text-[12px] font-semibold text-ruang-accent-text flex-none pt-[2px]">
              {String(index + 1).padStart(2, '0')}
            </span>
            <div className="min-w-0">
              <h2 className="text-[17px] tracking-[-0.03em] font-medium">{item.title}</h2>
              <p className="mt-[6px] text-[13px] text-ruang-muted leading-[1.65]">{item.body}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-[12px] mt-[28px]">
        <Link
          href="/"
          className="h-[42px] px-[18px] flex items-center text-[13px] font-semibold rounded-[4px] bg-ruang-accent text-ruang-accent-ink hover:bg-ruang-accent-hover transition-colors active:scale-95 no-underline"
        >
          Ke ringkasan
        </Link>
        <Link
          href="/help"
          className="h-[42px] px-[18px] flex items-center text-[13px] font-semibold rounded-[4px] border border-ruang-line-3 text-ruang-ink hover:border-ruang-accent-text hover:text-ruang-accent-text transition-colors active:scale-95 no-underline"
        >
          Bantuan
        </Link>
      </div>
    </div>
  );
}
