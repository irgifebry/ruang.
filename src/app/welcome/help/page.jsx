import Link from 'next/link';
import { FaqItem } from '@/components/faq-item';

export const metadata = {
  title: 'Bantuan',
  description: 'Jawaban singkat tentang penggunaan ruang.',
};

const FAQ = [
  {
    q: 'Apa itu ruang.?',
    a: 'ruang. membantu kamu mengatur gaji bulanan, membuat anggaran kategori, dan mencatat pengeluaran.',
  },
  {
    q: 'Bagaimana cara mulai?',
    a: 'Buat akun, simpan gaji bulanan, lalu tambahkan kategori dan batas anggaran. Setelah itu, catat pengeluaranmu.',
  },
  {
    q: 'Apakah ruang. terhubung ke rekening bank?',
    a: 'Tidak. Semua angka dicatat manual dan ruang. tidak mengambil data dari rekening bank.',
  },
  {
    q: 'Apakah data saya pribadi?',
    a: 'Ya. Setiap akun hanya dapat melihat dan mengubah catatannya sendiri.',
  },
  {
    q: 'Lupa kata sandi?',
    a: 'Di halaman Masuk, pilih “Lupa kata sandi?” untuk menerima tautan pengaturan ulang lewat email.',
  },
];

export default function WelcomeHelpPage() {
  return (
    <div className="mx-auto max-w-[760px] py-[28px]" id="konten" aria-label="Bantuan">
      <header className="mb-section flex items-center justify-between gap-[16px]">
        <Link href="/welcome" className="text-[13px] text-ruang-muted no-underline hover:text-ruang-accent-text">
          ← Kembali
        </Link>
        <nav aria-label="Akun" className="flex items-center gap-[14px] text-[13px]">
          <Link href="/login" className="text-ruang-muted no-underline hover:text-ruang-accent-text">Masuk</Link>
          <Link href="/register" className="text-ruang-accent-text no-underline hover:underline">Daftar</Link>
        </nav>
      </header>
      {FAQ.map((item) => (
        <FaqItem
          key={item.q}
          question={item.q}
          answer={item.a}
          className="border-b-0 border-t py-[17px] last:border-b"
        />
      ))}
    </div>
  );
}
