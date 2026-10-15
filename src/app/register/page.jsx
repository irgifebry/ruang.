import AuthForm from '@/components/AuthForm';

export const metadata = {
  title: 'Daftar',
  description: 'Buat akun ruang. dan mulai atur gaji serta anggaranmu.',
};

export default function RegisterPage() {
  return <AuthForm mode="register" />;
}
