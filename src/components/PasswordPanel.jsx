'use client';

import { useEffect, useRef, useState } from 'react';
import { changePassword } from '@/lib/auth-client';
import { fetchAccountStatus, setPassword } from '@/lib/account';
import { Button, FormMessage, GhostButton, TextField } from './form';
import { Panel } from './ui';

/**
 * The password form, behind a dialog on /settings/profile.
 *
 * The panel used to hold the three password fields inline, which made it the
 * tallest thing on the page for a task almost nobody performs in a sitting. It
 * is now a trigger card, and the form lives in a `<dialog>` — the same pattern
 * the transaction form uses, so it gets focus trapping, Escape-to-close and the
 * shared `.modal-dialog` open/close transition for free.
 *
 * Which form renders depends on whether the account has a password at all, and
 * that is a real distinction rather than a cosmetic one. Someone who arrived
 * through "Continue with Google" has no password ever set, so Better Auth's
 * `/change-password` would reject them with `CREDENTIAL_ACCOUNT_NOT_FOUND` —
 * the "current password" field would ask for something that does not exist and
 * could never be typed. They get the create form instead: no current password,
 * because there is nothing to prove, and `setPassword` instead of
 * `changePassword`.
 *
 * Status is fetched on open rather than on mount, so a page load does not spend
 * a request on a form nobody asked for. A failed fetch is not fatal: it falls
 * back to the change form, and the server rejects the attempt if that guess was
 * wrong.
 */
export function PasswordPanel({ className = '' }) {
  const dialogRef = useRef(null);
  const [open, setOpen] = useState(false);

  const [status, setStatus] = useState(null);
  const [statusError, setStatusError] = useState(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [fieldError, setFieldError] = useState(null);
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  /* Fetch once, on the first open. Later opens reuse it — the only thing that
     changes it is `handleSetPassword` succeeding, which updates it in place. */
  useEffect(() => {
    if (!open || status || statusError) return;
    let active = true;

    fetchAccountStatus()
      .then((data) => {
        if (active) setStatus(data);
      })
      .catch((err) => {
        if (active) setStatusError(err?.message || 'Gagal memuat status akun.');
      });

    return () => {
      active = false;
    };
  }, [open, status, statusError]);

  /** Close and wipe, so a half-typed password never survives a dismissal. */
  function handleClose() {
    setOpen(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmation('');
    setFieldError(null);
    setSuccess('');
  }

  /** Shared by both forms: length, then confirmation, then the request. */
  async function submit(event, request) {
    event.preventDefault();
    setFieldError(null);
    setSuccess('');
    setBusy(true);

    if (newPassword.length < 8) {
      setFieldError('Kata sandi baru minimal 8 karakter.');
      setBusy(false);
      return;
    }
    if (newPassword !== confirmation) {
      setFieldError('Kata sandi dan konfirmasi tidak cocok.');
      setBusy(false);
      return;
    }

    try {
      await request();
      setCurrentPassword('');
      setNewPassword('');
      setConfirmation('');
    } catch (err) {
      setFieldError(err?.message || 'Gagal menyimpan kata sandi.');
      setBusy(false);
      return;
    }

    setBusy(false);
  }

  async function handleChangePassword(event) {
    await submit(event, async () => {
      const { error } = await changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });
      if (error) throw error;
      setSuccess('Kata sandi diperbarui. Semua sesi lain dicabut.');
    });
  }

  /**
   * First password for an SSO-only account. On success the panel swaps to the
   * change form rather than leaving the user staring at a form that has just
   * stopped applying.
   */
  async function handleSetPassword(event) {
    await submit(event, async () => {
      await setPassword(newPassword);
      setStatus((prev) => ({ ...prev, hasPassword: true }));
      setSuccess('Kata sandi dibuat. Sekarang kamu bisa masuk dengan email juga.');
    });
  }

  // `hasPassword` defaults to true: showing "change your password" to someone
  // who cannot is a dead end, while showing "create one" to someone who already
  // has one is a wrong claim that the server would reject anyway.
  const hasPassword = status?.hasPassword !== false;

  return (
    <>
      <Panel className={className}>
        <div className="flex items-start justify-between gap-[16px]">
          <div className="min-w-0">
            <h2 className="text-[17px] font-medium tracking-tight mb-1">Kata sandi</h2>
            {/* Say what the button will actually do, not what the field is. An
                SSO-only account is the case worth naming: they signed up with
                Google and have no password at all, so "masuk dengan email" alone
                reads as a setting rather than something they have yet to turn
                on. */}
            <p className="text-[13px] leading-[1.65] text-ruang-muted">
              {hasPassword
                ? 'Masuk dengan email dan kata sandi.'
                : 'Akun ini belum punya kata sandi — masuk lewat Google saja.'}
            </p>
          </div>

          <Button onClick={() => setOpen(true)} className="flex-none">
            {hasPassword ? 'Ubah kata sandi' : 'Buat kata sandi'}
          </Button>
        </div>
      </Panel>

      <dialog
        ref={dialogRef}
        onClick={(event) => {
          // Only a click on the backdrop itself dismisses; a click inside the
          // panel must not close a form the user is halfway through.
          if (event.target === dialogRef.current) handleClose();
        }}
        onClose={handleClose}
        aria-labelledby="form-kata-sandi-title"
        className="modal-dialog w-[min(100%-32px,440px)] max-h-[90dvh] overflow-y-auto border border-ruang-line bg-ruang-panel text-ruang-ink p-0"
      >
        <Panel className="border-0">
          <div className="flex items-center justify-between mb-[12px]">
            <span className="text-[11px] font-mono tracking-[0.09em] text-ruang-subtle uppercase">
              Keamanan
            </span>
            <button
              type="button"
              onClick={handleClose}
              className="border-0 bg-none p-0 text-ruang-muted text-[12px] hover:text-ruang-accent-text transition-colors cursor-pointer"
            >
              Tutup
            </button>
          </div>

          <h2 id="form-kata-sandi-title" className="text-[20px] tracking-[-0.03em] font-medium mb-[6px]">
            {hasPassword ? 'Ubah kata sandi' : 'Buat kata sandi'}
          </h2>
          <p className="text-[13px] leading-[1.65] text-ruang-muted mb-[22px]">
            {hasPassword
              ? 'Setelah diganti, semua sesi lain ikut keluar — termasuk perangkat dan browser lain. Kamu harus login ulang di sana.'
              : 'Buat kata sandi supaya kamu bisa masuk juga memakai email, selain lewat Google seperti biasa.'}
          </p>

          {!status && !statusError ? (
            <p className="text-[13px] text-ruang-subtle font-mono">memuat status akun...</p>
          ) : hasPassword ? (
        <form onSubmit={handleChangePassword} className="flex flex-col gap-[16px]">
              <TextField
                label="Kata sandi saat ini"
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                placeholder="Masukkan kata sandi lama"
                minLength={8}
                autoComplete="current-password"
                required
              />
              <TextField
                label="Kata sandi baru"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="Minimal 8 karakter"
                minLength={8}
                autoComplete="new-password"
                required
              />
              <TextField
                label="Ulangi kata sandi baru"
                type="password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                placeholder="Ketik ulang kata sandi"
                minLength={8}
                autoComplete="new-password"
                required
              />

              <FormMessage error={fieldError} success={success} />

              <div className="flex flex-wrap gap-[9px] items-center">
                <Button type="submit" busy={busy} busyLabel="Menyimpan..." className="flex-1 basis-[160px]">
                  Simpan kata sandi
                </Button>
                <GhostButton onClick={handleClose} className="flex-none">
                  Batal
                </GhostButton>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSetPassword} className="flex flex-col gap-[16px]">
              <TextField
                label="Kata sandi baru"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="Minimal 8 karakter"
                minLength={8}
                autoComplete="new-password"
                required
              />
              <TextField
                label="Ulangi kata sandi baru"
                type="password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                placeholder="Ketik ulang kata sandi"
                minLength={8}
                autoComplete="new-password"
                required
              />

              <FormMessage error={fieldError ?? statusError} success={success} />

          <div className="flex flex-wrap gap-[9px] items-center">
                <Button type="submit" busy={busy} busyLabel="Menyimpan..." className="flex-1 basis-[160px]">
                  Buat kata sandi
                </Button>
                <GhostButton onClick={handleClose} className="flex-none">
                  Batal
                </GhostButton>
              </div>
            </form>
          )}
        </Panel>
      </dialog>
    </>
  );
}