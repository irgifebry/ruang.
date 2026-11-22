import AuthForm from '@/components/AuthForm';

export const metadata = {
  title: 'Masuk',
  description: 'Masuk ke akun ruang. untuk membuka rencana keuanganmu.',
  alternates: { canonical: '/login' },
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <div id="konten">
      <AuthForm mode="login" />
    </div>
  );
}
