'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { requestPasswordReset, resetPassword } from '@/lib/auth-client';
import { Button, FormMessage, TextField } from '@/components/form';
import { Panel } from '@/components/ui';

/**
 * Password recovery, in two halves.
 *
 * With no `?token=` the form asks for an email and sends a reset link. With a
 * `?token=` it asks for a new password and completes the update.
 */
export default function ResetPasswordPage() {
  const [mode, setMode] = useState('request');
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const token = searchParams.get('token');

    if (token) {
      setMode('update');
    }
    setReady(true);
  }, [searchParams]);

  const handleRequest = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    const form = new FormData(event.target);
    const email = String(form.get('email') ?? '').trim();

    try {
      const { error: resetError } = await requestPasswordReset({
        email,
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (resetError) throw resetError;

      setSuccess(
        'Jika email itu terdaftar, tautan pemulihan sudah dikirim. Cek kotak masuk dan folder spam.',
      );
    } catch (err) {
      setError(err?.message || 'Gagal mengirim tautan pemulihan.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const form = new FormData(event.target);
    const password = String(form.get('password') ?? '');
    const confirm = String(form.get('confirm') ?? '');
    const token = searchParams.get('token');

    if (!token) {
      setError('Tautan pemulihan tidak valid atau sudah kedaluwarsa.');
      setLoading(false);
      return;
    }

    if (password.length < 8) {
      setError('Kata sandi baru minimal 8 karakter.');
      setLoading(false);
      return;
    }

    if (password !== confirm) {
      setError('Konfirmasi kata sandi tidak cocok.');
      setLoading(false);
      return;
    }

    try {
      const { error: updateError } = await resetPassword({
        newPassword: password,
        token,
      });
      if (updateError) throw updateError;

      setSuccess('Kata sandi berhasil diperbarui. Mengalihkan ke ringkasan...');
      setTimeout(() => {
        router.replace('/');
        router.refresh();
      }, 1200);
    } catch (err) {
      setError(err?.message || 'Gagal memperbarui kata sandi.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[65vh] grid place-items-center py-[34px]">
      <div className="w-full max-w-[420px]">
        <div className="mb-[20px]">
          <h1 className="text-[clamp(30px,5vw,46px)] tracking-[-0.06em] leading-[1.12] font-medium mb-[12px]">
            {mode === 'update' ? (
              <>
                Kata sandi <em className="font-normal italic text-ruang-accent-text">baru.</em>
              </>
            ) : (
              <>
                Pulihkan <em className="font-normal italic text-ruang-accent-text">aksesmu.</em>
              </>
            )}
          </h1>
          <p className="text-[14px] text-ruang-muted leading-[1.65]">
            {mode === 'update'
              ? 'Tentukan kata sandi baru buat masuk ke akunmu.'
              : 'Masukin email akunmu. Kami kirim tautan buat bikin kata sandi baru.'}
          </p>
        </div>

        <Panel>
          {!ready ? (
            <p className="text-[13px] text-ruang-muted">Memeriksa tautan...</p>
          ) : mode === 'update' ? (
            <form onSubmit={handleUpdate} className="flex flex-col gap-[16px]" noValidate>
              <TextField
                id="new-password"
                label="Kata sandi baru"
                type="password"
                name="password"
                autoComplete="new-password"
                minLength={8}
                required
                placeholder="Minimal 8 karakter"
              />
              <TextField
                id="confirm-password"
                label="Ulangi kata sandi baru"
                type="password"
                name="confirm"
                autoComplete="new-password"
                minLength={8}
                required
                placeholder="Ketik ulang kata sandi"
              />

              <FormMessage error={error} success={success} />

              <Button type="submit" busy={loading} busyLabel="Menyimpan...">
                Simpan kata sandi
              </Button>
            </form>
          ) : (
            <form onSubmit={handleRequest} className="flex flex-col gap-[16px]" noValidate>
              <TextField
                id="reset-email"
                label="Email"
                type="email"
                name="email"
                autoComplete="email"
                required
                placeholder="nama@email.com"
              />

              <FormMessage error={error} success={success} />

              <Button type="submit" busy={loading} busyLabel="Mengirim...">
                Kirim tautan pemulihan
              </Button>
            </form>
          )}

          <p className="text-ruang-subtle text-[12px] leading-[1.6] text-center mt-[16px] pt-[14px] border-t border-ruang-line">
            Ingat kata sandimu?{' '}
            <Link href="/login" className="text-ruang-accent-text hover:underline">
              Kembali ke halaman masuk
            </Link>
          </p>
        </Panel>
      </div>
    </div>
  );
}