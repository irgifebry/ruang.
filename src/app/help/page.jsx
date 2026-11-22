import Link from 'next/link';
import { FaqItem } from '@/components/faq-item';

export const metadata = {
  title: 'Bantuan',
  description: 'Pertanyaan umum seputar ruang.: pemasukan, anggaran, riwayat, dan keamanan akun.',
  alternates: { canonical: '/help' },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Bantuan · ruang.',
    description: 'Pertanyaan umum seputar ruang.: pemasukan, anggaran, riwayat, dan keamanan akun.',
    url: '/help',
    type: 'article',
    images: ['/opengraph-image'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Bantuan · ruang.',
    description: 'Pertanyaan umum seputar ruang.: pemasukan, anggaran, riwayat, dan keamanan akun.',
    images: ['/opengraph-image'],
  },
};

const FAQ_GROUPS = [
  {
    title: 'Mulai pakai ruang.',
    items: [
      {
        q: 'Apa yang perlu diatur dulu?',
        a: 'Buka Transaksi untuk mencatat pemasukan, lalu Pengaturan untuk membuat kategori beserta batas anggarannya. Setelah itu, catat pengeluaran di halaman yang sama.',
      },
      {
        q: 'Bagaimana cara mencatat pengeluaran?',
        a: 'Buka Pengeluaran, isi nama, jumlah, kategori, dan tanggal, lalu simpan. Jumlah harus berupa angka bulat tanpa pemisah desimal.',
      },
    ],
  },
  {
    title: 'Pemasukan dan riwayat',
    items: [
      {
        q: 'Kenapa riwayatku kosong?',
        a: 'Sebuah bulan muncul di riwayat setelah ada pemasukan atau pengeluaran yang tercatat di dalamnya. Akun baru belum punya catatan, jadi riwayatnya masih kosong.',
      },
      {
        q: 'Bagaimana cara mengubah pemasukan bulan lalu?',
        a: 'Buka Transaksi, pilih bulan yang ingin dilihat, lalu ubah atau hapus catatan pemasukannya. Perubahan hanya berlaku untuk catatan itu.',
      },
      {
        q: 'Apakah pemasukan bulan ini mengubah bulan sebelumnya?',
        a: 'Tidak. Setiap catatan pemasukan punya tanggal sendiri, jadi mengubah bulan ini tidak memengaruhi catatan bulan lain.',
      },
    ],
  },
  {
    title: 'Kategori dan transaksi',
    items: [
      {
        q: 'Apa yang terjadi kalau kategori dihapus?',
        a: 'Semua transaksi dalam kategori itu ikut terhapus. Sebelum menghapus, ruang. menampilkan jumlah transaksi yang terdampak agar kamu bisa memastikan pilihan.',
      },
      {
        q: 'Bisa menghubungkan rekening bank?',
        a: 'Belum. Semua angka dicatat manual; ruang. tidak mengambil data dari rekening bank.',
      },
    ],
  },
  {
    title: 'Akun dan privasi',
    items: [
      {
        q: 'Bagaimana kalau lupa kata sandi?',
        a: 'Di halaman Masuk, pilih “Lupa kata sandi?” untuk menerima tautan pengaturan ulang melalui email.',
      },
      {
        q: 'Siapa yang bisa melihat dataku?',
        a: 'Data akun bersifat pribadi. Setiap akun hanya dapat melihat dan mengubah catatannya sendiri.',
      },
    ],
  },
];

export default async function HelpPage() {
  return (
    <div className="py-section max-w-[900px] mx-auto" id="konten">
      <header className="mb-section">
        <h1 className="text-[clamp(36px,4.5vw,58px)] tracking-[-0.065em] leading-[1.12] font-medium">Bantuan</h1>
        <p className="max-w-[540px] text-[14px] text-ruang-muted leading-[1.7]">
          Panduan singkat untuk mencatat pemasukan, mengatur anggaran, dan menjaga akunmu.
        </p>
      </header>

      <div className="columns-1 md:columns-2 gap-section">
        {FAQ_GROUPS.map((group, index) => (
          <section
            key={group.title}
            id={`topik-${index}`}
            aria-labelledby={`judul-topik-${index}`}
            className="break-inside-avoid mb-section last:mb-0"
          >
            <h2 id={`judul-topik-${index}`} className="mb-card text-[18px] tracking-[-0.035em] font-medium">{group.title}</h2>
            <div className="border-t border-ruang-line">
              {group.items.map((item) => (
                <FaqItem key={item.q} question={item.q} answer={item.a} />
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="flex flex-wrap gap-[12px] mt-section pt-card border-t border-ruang-line">
        <Link
          href="/settings"
          className="h-[42px] px-[18px] flex items-center text-[13px] font-semibold rounded-[4px] bg-ruang-accent text-ruang-accent-ink hover:bg-ruang-accent-hover transition-colors active:scale-95 no-underline"
        >
          Buka pengaturan
        </Link>
        <Link
          href="/about"
          className="h-[42px] px-[18px] flex items-center text-[13px] font-semibold rounded-[4px] border border-ruang-line-3 text-ruang-ink hover:border-ruang-accent-text hover:text-ruang-accent-text transition-colors active:scale-95 no-underline"
        >
          Tentang ruang.
        </Link>
      </div>
    </div>
  );
}
