import AuthForm from '@/components/AuthForm';

export const metadata = {
  title: 'Daftar',
  description: 'Buat akun ruang. dan mulai catat pemasukan, pengeluaran, serta anggaranmu.',
  alternates: { canonical: '/register' },
  robots: { index: false, follow: false },
};

export default function RegisterPage() {
  return (
    <div id="konten">
      <AuthForm mode="register" />
    </div>
  );
}
