'use client';

import { useEffect, useRef, useState } from 'react';
import { signOut } from '@/lib/auth-client';
import { cancelAccountDeletion, fetchAccountStatus, requestAccountDeletion } from '@/lib/account';
import {
  DELETION_GRACE_DAYS,
  deletionDeadline,
  formatGraceRemaining,
} from '@/lib/account-deletion';
import { formatDateLong } from '@/lib/money';
import { Button, FormMessage, GhostButton, TextField } from './form';
import { Panel } from './ui';

/**
 * Account deletion, behind a dialog on /settings/profile.
 *
 * Nothing is deleted when this button is pressed. The server stamps
 * `profiles.deletion_requested_at`, revokes every session, and leaves the data
 * alone for seven days — so this is a reversible act wearing a destructive
 * label, and the copy says so rather than letting the button imply otherwise.
 *
 * The account is signed out on success because that is what makes signing back
 * in the restore gesture. The server has already revoked the sessions; the
 * client-side `signOut` only clears the cookie it is still holding.
 *
 * `deletionRequestedAt` arrives as a prop because the profile page already read
 * the row, and the card has to state the countdown before anything is opened.
 * The password question is a separate fetch on open, like the panel beside it:
 * a page load should not spend a request on a form nobody asked for. Unlike that
 * panel, a failure here does not replace the form — see the branch below.
 */
export function DeleteAccountPanel({ deletionRequestedAt = null, className = '' }) {
  const dialogRef = useRef(null);
  const [open, setOpen] = useState(false);

  const [status, setStatus] = useState(null);
  const [statusError, setStatusError] = useState(null);

  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

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

  function handleClose() {
    setOpen(false);
    setPassword('');
    setFieldError(null);
  }

  async function handleRequest(event) {
    event.preventDefault();
    setFieldError(null);
    setBusy(true);

    try {
      await requestAccountDeletion(password);
    } catch (err) {
      setFieldError(err?.message || 'Gagal menjadwalkan penghapusan akun.');
      setBusy(false);
      return;
    }

    // The sessions are already gone server-side, so a failure here only means the
    // cookie outlived its session — navigating either way is what clears it.
    // A full document navigation rather than the router, for the same reason
    // `handleGoogle` in AuthForm assigns `window.location.href`: the server has
    // to re-read a cookie that no longer resolves to a session.
    await signOut().catch(() => {});
    window.location.assign('/login?deleted=1');
  }

  /**
   * Only reachable when a session outlived the revoke, so signing back in is
   * normally the way to undo this. Reloading rather than patching local state
   * because the card's copy is read from the profile row, not from this state.
   */
  async function handleCancel() {
    setFieldError(null);
    setBusy(true);

    try {
      await cancelAccountDeletion();
    } catch (err) {
      setFieldError(err?.message || 'Gagal membatalkan penghapusan akun.');
      setBusy(false);
      return;
    }

    window.location.reload();
  }

  // `hasPassword` defaults to true for the same reason the password panel
  // defaults to true: asking for a password someone never set is a dead end, and
  // the server rejects the attempt anyway if the guess was wrong.
  const hasPassword = status?.hasPassword !== false;
  const requestedAt = deletionRequestedAt;
  const deadline = deletionDeadline(requestedAt);

  return (
    <>
      <Panel className={className}>
        <div className="flex items-start justify-between gap-[16px]">
          <div className="min-w-0">
            <h2 className="text-[17px] font-medium tracking-tight mb-1">Hapus akun</h2>
            {/* The grace period is the whole point of this panel, so it is in the
                panel body rather than buried in the dialog. */}
            <p className="text-[13px] leading-[1.65] text-ruang-muted">
              {requestedAt
                ? `Dijadwalkan dihapus ${DELETION_GRACE_DAYS} hari dari request. Masuk lagi kapan saja untuk membatalkannya.`
                : `Akun dan semua datamu bisa dihapus. Ada masa tunggu ${DELETION_GRACE_DAYS} hari — kalau berubah pikiran, masuk lagi dan semuanya kembali.`}
            </p>
          </div>

          <Button
            onClick={() => setOpen(true)}
            tone={requestedAt ? 'lime' : 'danger'}
            className="flex-none"
          >
            {requestedAt ? 'Status penghapusan' : 'Hapus akun'}
          </Button>
        </div>

        {/* The card above answers from the profile row, so a user who has already
            asked to delete still sees the countdown here. The dialog is only about
            acting on it, which is why it may open before anything is loaded. */}
      </Panel>

      <dialog
        ref={dialogRef}
        onClick={(event) => {
          if (event.target === dialogRef.current) handleClose();
        }}
        onClose={handleClose}
        aria-labelledby="hapus-akun-title"
        className="modal-dialog w-[min(100%-32px,440px)] max-h-[90dvh] overflow-y-auto border border-ruang-line bg-ruang-panel text-ruang-ink p-0"
      >
        <Panel className="border-0">
          <div className="flex items-center justify-between mb-[12px]">
            <span className="text-[11px] font-mono tracking-[0.09em] text-ruang-subtle uppercase">
              Akun
            </span>
            <button
              type="button"
              onClick={handleClose}
              className="border-0 bg-none p-0 text-ruang-muted text-[12px] hover:text-ruang-accent-text transition-colors cursor-pointer"
            >
              Tutup
            </button>
          </div>

          <h2 id="hapus-akun-title" className="text-[20px] tracking-[-0.03em] font-medium mb-[6px]">
            Hapus akun ini?
          </h2>
          <p className="text-[13px] leading-[1.65] text-ruang-muted mb-[22px]">
            {requestedAt ? (
              <>
                Terjadwal dihapus pada {formatDateLong(deadline)} — sisa {formatGraceRemaining(requestedAt)}.
                {' '}Masuk lagi kapan saja sebelum itu untuk membatalkannya.
              </>
            ) : (
              <>
                Kategori, seluruh transaksi, riwayat gaji, dan foto profil ikut terhapus. Kamu akan
                dikeluarkan dari semua perangkat, lalu datanya disimpan {DELETION_GRACE_DAYS} hari
                lagi. Kalau masuk lagi dalam masa itu, akun dikembalikan apa adanya.
              </>
            )}
          </p>

          {/* A failed status read is not fatal here the way it would be on the password
            panel. The worst case of not knowing `hasPassword` is a password
            field shown to someone who has none — the server accepts the request
            either way — so the form stays usable and says what went wrong
            rather than replacing itself with an error. */}
          {requestedAt ? (
            <>
              <FormMessage error={fieldError} />

              <div className="flex flex-wrap gap-[9px] items-center">
                <Button
                  onClick={handleCancel}
                  busy={busy}
                  busyLabel="Membatalkan..."
                  className="flex-1 basis-[160px]"
                >
                  Batalkan penghapusan
                </Button>
                <GhostButton onClick={handleClose} className="flex-none">
                  Tutup
                </GhostButton>
              </div>
            </>
          ) : (
            <form onSubmit={handleRequest} className="flex flex-col gap-[16px]">
              {!status && !statusError && (
                <p className="text-[13px] text-ruang-subtle font-mono">memuat status akun...</p>
              )}

              {hasPassword && (
                <TextField
                  label="Kata sandi"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Masukkan kata sandimu"
                  minLength={8}
                  autoComplete="current-password"
                  required
                />
              )}

              <FormMessage error={fieldError ?? statusError} />

              <div className="flex flex-wrap gap-[9px] items-center">
                <Button
                  type="submit"
                  tone="danger"
                  busy={busy}
                  busyLabel="Menjadwalkan..."
                  className="flex-1 basis-[160px]"
                >
                  Jadwalkan penghapusan
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