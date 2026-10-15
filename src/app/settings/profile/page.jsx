'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchLedger, updateProfile } from '@/lib/ledger';
import { useLedgerData, useMutation } from '@/hooks/useLedgerData';
import { useTheme } from '@/lib/theme';
import { THEMES } from '@/lib/theme-presets';
import { refreshProfile } from '@/hooks/useProfile';
import { createClient } from '@/lib/client';
import { getSession } from '@/lib/auth-client';
import { Button, FormMessage, TextField } from '@/components/form';
import { PasswordPanel } from '@/components/PasswordPanel';
import { DeleteAccountPanel } from '@/components/DeleteAccountPanel';
import { ErrorState, LoadingState, Panel } from '@/components/ui';

/**
 * Profile and appearance.
 *
 * Everything here writes through `updateProfile`, which is the only writer for
 * `profiles`. The page used to issue its own `supabase.from('profiles').update()`
 * and throw the returned error away, so a failed save reported success � and it
 * wrote a `name` column that did not exist in the schema at all.
 *
 * The theme is applied optimistically through `useTheme` and then persisted. The
 * provider also caches it in localStorage so the next page load paints the right
 * colours before React hydrates; the database is the source of truth the provider
 * is seeded from.
 */

export default function SettingsProfilePage() {
  const { data, loading, error, reload } = useLedgerData(fetchLedger);

  if (loading) return <LoadingState label="Memuat profil..." />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <ErrorState message="Sesi tidak ditemukan. Silakan masuk kembali." />;

  return <ProfileContent data={data} reload={reload} />;
}

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

function ProfileContent({ data, reload }) {
  const { profile } = data;
  const theme = useTheme();
  const supabase = useMemo(() => createClient(), []);
  const fileInput = useRef(null);

  const [name, setName] = useState(profile?.name ?? '');
  const [email, setEmail] = useState('');
  const [emailLoading, setEmailLoading] = useState(true);
  const [nameError, setNameError] = useState(null);
  const [success, setSuccess] = useState('');
  const [avatarError, setAvatarError] = useState('');
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarVersion, setAvatarVersion] = useState(0);

  const [run, busy, mutationError, setMutationError] = useMutation();

  useEffect(() => {
    getSession()
      .then(({ data }) => setEmail(data?.user?.email ?? ''))
      .catch(() => setEmail(''))
      .finally(() => setEmailLoading(false));
  }, []);

  async function handleSaveProfile(event) {
    event.preventDefault();
    setNameError(null);
    setSuccess('');
    setMutationError(null);

    const trimmed = name.trim();
    if (!trimmed) {
      setNameError('Nama tidak boleh kosong.');
      return;
    }

    const ok = await run(() => updateProfile(supabase, { name: trimmed }));
    if (!ok) return;

    setSuccess('Profil tersimpan.');
    // The sidebar keeps its own cached copy of the profile, so a save here has
    // to tell it to re-read or the new name would only show on a full reload.
    refreshProfile();
    reload();
  }

  async function handleAvatarChange(event) {
    const file = event.target.files?.[0];
    // Reset immediately so picking the same file twice still fires a change.
    event.target.value = '';
    if (!file) return;

    setAvatarError('');

    // Checked here for the message quality rather than for enforcement; the
    // bucket policies are the real boundary.
    if (!file.type.startsWith('image/')) {
      setAvatarError('Pilih file gambar.');
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarError('Ukuran maksimal 2 MB.');
      return;
    }

    setAvatarBusy(true);
    try {
      const form = new FormData();
      form.set('file', file);
      const response = await fetch('/api/avatar', { method: 'POST', body: form });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Gagal mengunggah foto.');
      const newPath = result.path;
      // `?v=` busts the browser cache: the object keeps the same path, so a
      // plain `src` would keep showing the previous image.
      setAvatarVersion((v) => v + 1);
      refreshProfile();
      reload();
    } catch (err) {
      setAvatarError(err?.message || 'Gagal mengunggah foto.');
    } finally {
      setAvatarBusy(false);
    }
  }

  async function handleRemoveAvatar() {
    setAvatarError('');
    setAvatarBusy(true);
    try {
      // Clearing `avatar_path` is not enough on its own: a Google account would
      // fall straight back to the provider photo the next time the profile is
      // read. `"user".image` is the only record of that photo, so removing the
      // picture has to clear both, and the user then has to change it at Google.
      if (profile?.avatar_path) {
        const response = await fetch('/api/avatar', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: profile.avatar_path }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Gagal menghapus foto.');
      }
      await updateProfile(supabase, { provider_image: null });
      setAvatarVersion((v) => v + 1);
      refreshProfile();
      reload();
    } catch (err) {
      setAvatarError(err?.message || 'Gagal menghapus foto.');
    } finally {
      setAvatarBusy(false);
    }
  }

  /** Applies a choice at once and persists it; a failed save is reported only. */
  async function persistAppearance(patch) {
    theme?.update(patch);
    try {
      await updateProfile(supabase, patch);
    } catch {
      setAvatarError('Perampilan gagal disimpan di server.');
    }
  }

  // An upload wins over the provider photo: the user chose it more recently than
  // Google did. `provider_image` is the Google picture, present for anyone who
  // signed in through SSO.
  const avatarSrc = profile?.avatar_path
    ? supabase.storage.from('avatars').getPublicUrl(profile.avatar_path).data.publicUrl +
      (avatarVersion ? `?v=${avatarVersion}` : '')
    : profile?.provider_image || null;
  const usingProviderPhoto = !profile?.avatar_path && Boolean(profile?.provider_image);
  const initial = (name.trim() || email || 'Pengguna').charAt(0).toUpperCase();

  return (
    <div className="py-[34px] max-w-[1310px] mx-auto" id="konten">
      <header className="mb-section">
        <h1 className="text-[clamp(36px,4.5vw,58px)] tracking-[-0.065em] leading-[1.12] font-medium">
          Profil
        </h1>
      </header>

      <div className="grid lg:grid-cols-2 gap-card items-start">
        {/* --- Identity --------------------------------------------------- */}
        <Panel>
          <h2 className="text-[17px] font-medium tracking-tight mb-1">Identitas</h2>
          <p className="text-[13px] leading-[1.65] text-ruang-muted mb-4">
            Nama ini akan terlihat di menu dan aplikasi.
          </p>

          <div className="flex items-center gap-[16px] mb-[20px]">
            <span className="w-[68px] h-[68px] rounded-full flex-none overflow-hidden bg-ruang-hover border border-ruang-line-2 grid place-items-center text-ruang-accent-text text-[24px] font-semibold">
              {avatarSrc ? (
                // eslint-disable-next-line @next/next/no-img-element -- a
                // user-supplied avatar in a public bucket; the Next image
                // optimiser would add a server round trip for no benefit.
                <img src={avatarSrc} alt="" className="w-full h-full object-cover" />
              ) : (
                initial
              )}
            </span>

            <div className="flex flex-col gap-[8px]">
              <input
                ref={fileInput}
                id="avatar-input"
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className="sr-only"
              />
              {/* `flex-wrap` so a nowrap label on a narrow phone drops the second button to
                its own line instead of squeezing the label into two. */}
              <div className="flex flex-wrap gap-[9px]">
                <Button onClick={() => fileInput.current?.click()} busy={avatarBusy} busyLabel="Mengunggah...">
                  {avatarSrc ? 'Ganti foto' : 'Unggah foto'}
                </Button>
                {avatarSrc && (
                  <Button onClick={handleRemoveAvatar} busy={avatarBusy} tone="ghost">
                    Hapus
                  </Button>
                )}
              </div>
              <small className="text-ruang-subtle text-[12px] leading-[1.6]">
                {usingProviderPhoto
                  ? 'Foto ini diambil dari Google. Unggah foto untuk menggantinya, atau ubah di pengaturan Google lalu masuk lagi.'
                  : 'JPG, PNG, WebP, atau GIF, maksimal 2 MB.'}
              </small>
            </div>
          </div>

          {avatarError && (
            <p className="text-[12px] text-ruang-danger-ink mb-[12px]" role="alert">
              {avatarError}
            </p>
          )}

          <form onSubmit={handleSaveProfile} className="flex flex-col gap-[16px]">
            <TextField
              label="Nama tampilan"
              value={name}
              onChange={(event) => setName(event.target.value)}
              error={nameError}
              placeholder="Nama kamu"
              maxLength={60}
              autoComplete="name"
              required
            />

            <div className="flex flex-col gap-[7px]">
              <label htmlFor="profile-email" className="text-ruang-body text-[13px] font-medium">
                Email
              </label>
              <p id="profile-email" className="text-[13px] text-ruang-subtle font-mono">
                {emailLoading ? 'memuat...' : email || '-'}
              </p>
            </div>

            <FormMessage error={mutationError} success={success} />

            <Button type="submit" busy={busy} busyLabel="Menyimpan...">
              Simpan profil
            </Button>
          </form>
        </Panel>

        {/* --- Appearance -------------------------------------------------- */}
        <Panel>
          <h2 className="text-[17px] font-medium tracking-tight mb-1">Tampilan</h2>
          <p className="text-[13px] leading-[1.65] text-ruang-muted mb-4">
            Pilihan tema tersimpan di akunmu dan ikut saat kamu pindah perangkat.
          </p>

          <fieldset>
            <legend className="text-ruang-body text-[13px] font-medium mb-[10px]">Tema</legend>
            <div className="grid grid-cols-3 gap-[10px]">
              {THEMES.map((item) => (
                <ThemeOption
                  key={item.id}
                  item={item}
                  selected={theme?.theme === item.id}
                  onSelect={() => persistAppearance({ theme: item.id })}
                />
              ))}
            </div>
          </fieldset>
        </Panel>

        {/* --- Password ----------------------------------------------------
            Lives here rather than on its own page: the account has two things
            to manage, a name and a password, and one page with three panels is
            shorter than two pages with a header each. The panel is just a
            trigger now — the three password fields open as a dialog, so this
            card stays the same height as the others beside it. */}
        <PasswordPanel className="lg:col-span-2" />

        {/* --- Delete account ------------------------------------------------
            Full width like the password panel above it, and last on the page:
            it is the only irreversible-intent control here, so it should not
            sit next to something a user reaches for by accident. The pending
            flag comes from the profile row this page already loaded, so the
            panel can state the countdown without opening anything. */}
        <DeleteAccountPanel
          className="lg:col-span-2"
          deletionRequestedAt={profile?.deletion_requested_at ?? null}
        />
      </div>
    </div>
  );
}

/** One theme choice, rendered as a labelled swatch. */
function ThemeOption({ item, selected, onSelect }) {
  const dark = item.id !== 'light';

  return (
    <label className="relative cursor-pointer">
      <input
        type="radio"
        name="theme"
        value={item.id}
        checked={selected}
        onChange={onSelect}
        className="sr-only peer"
      />
      <span
        className={`flex flex-col gap-[6px] border p-[8px] transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ruang-accent-text peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-ruang-panel ${
          selected ? 'border-ruang-accent-text' : 'border-ruang-line-2 hover:border-ruang-line-3'
        }`}
      >
        {/* A miniature of the theme rather than a word alone, so the choice is
            visible instead of something the user has to imagine. */}
        <span
          className="flex h-[22px] overflow-hidden border border-ruang-line"
          style={{ background: dark ? '#0b0d0c' : '#f6f7f2' }}
        >
          <span className="w-[22%] h-full" style={{ background: dark ? '#0c0f0d' : '#ffffff' }} />
          <span className="flex-1 h-full flex items-center px-[4px] gap-[3px]">
            <span className="h-[2px] w-[60%] block" style={{ background: dark ? '#a8b0a7' : '#4a5247' }} />
            <span className="h-[5px] w-[16%] block" style={{ background: '#7aa80c' }} />
          </span>
        </span>
        <span className="text-[12px] text-ruang-body leading-tight">{item.label}</span>
      </span>
    </label>
  );
}
