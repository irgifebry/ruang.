import AuthForm from '@/components/AuthForm';

export const metadata = {
  title: 'Daftar',
  description: 'Buat akun ruang. dan mulai atur gaji serta anggaranmu.',
  alternates: { canonical: '/register' },
  robots: { index: false, follow: false },
};

export default function RegisterPage() {
  return <AuthForm mode="register" />;
}
