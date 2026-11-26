/**
 * The Profil screen — the native mirror of `src/app/settings/profile/page.jsx`.
 *
 * One screen holds identity, appearance, password and the deletion request,
 * exactly as the web page does. Everything that writes a profile goes through
 * `updateProfile()` (the ledger's one writer), never a direct table call. The
 * theme is applied at once through `useTheme` and then persisted; SecureStore
 * keeps the choice for the next paint, while Postgres is the source of truth.
 *
 * The route owns the session client from `SessionProvider` and the shell owns
 * the guard; this screen only reads data and writes it back.
 */

import { useEffect, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as Linking from 'expo-linking';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { updateProfile } from '../api/account.js';
import { avatarUrl, buildAvatarForm, deleteAvatar, uploadAvatar } from '../api/avatar.js';
import { DeleteAccountPanel } from '../components/DeleteAccountPanel.jsx';
import DemoBanner from '../components/DemoBanner.jsx';
import { Button, FormMessage, GhostButton, TextField } from '../components/form.jsx';
import { PasswordPanel } from '../components/PasswordPanel.jsx';
import { ErrorState, LoadingState, Panel } from '../components/ui.jsx';
import { FETCH_LEDGER_REQUEST, useLedgerData } from '../hooks/useLedgerData.js';
import { useDemo } from '../state/DemoProvider.jsx';
import { useSession } from '../state/SessionProvider.jsx';
import { applyProfileWrite } from '../shared/optimistic-ledger.js';
import { tokens } from '../theme/tokens.js';
import { useTheme } from '../theme/useTheme.js';

/** The same three choices as `THEMES` on the web, with their preview palettes. */
const THEME_OPTIONS = [
  { id: 'dark', label: 'Gelap', preview: 'dark' },
  { id: 'light', label: 'Terang', preview: 'light' },
  { id: 'system', label: 'Ikuti sistem', preview: 'dark' },
];

export function Profile() {
  const { user, client, signOut } = useSession();
  const { isDemo, data: demoData } = useDemo();
  const { data, loading, error, reload, patchData } = useLedgerData(
    client,
    FETCH_LEDGER_REQUEST,
    isDemo ? demoData : null,
  );

  if (loading) return <LoadingState label="Memuat profil..." />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <ErrorState message="Sesi tidak ditemukan. Silakan masuk kembali." />;

  return (
    <ProfileContent
      data={data}
      client={client}
      user={user}
      signOut={signOut}
      reload={reload}
      patchData={patchData}
      isDemo={isDemo}
    />
  );
}

export default Profile;
// The route imports `{ Profile }`; keep the default and the older alias too so
// an export mismatch cannot render an empty screen (see the export smoke test).
export { Profile as ProfileScreen };

function ProfileContent({ data, client, user, signOut, reload, patchData, isDemo }) {
  const { profile = {} } = data;
  const { theme, setTheme } = useTheme();
  const t = tokens(theme.resolved);
  const s = stylesFor(t);

  const [name, setName] = useState(profile.name ?? user?.name ?? '');
  const [nameError, setNameError] = useState(null);
  const [success, setSuccess] = useState('');
  const [mutationError, setMutationError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarVersion, setAvatarVersion] = useState(0);

  // The database wins over the device cache on a fresh load. Only the arrival
  // of a different server value triggers this: a swatch tap calls setTheme and
  // patches the same value into `data`, so there is nothing to revert.
  useEffect(() => {
    // A guest's sample profile is not an account preference: syncing it would
    // overwrite the device's saved theme (and, on web, hit a SecureStore write
    // this SDK does not implement). The demo theme picker is disabled below.
    if (isDemo) return;
    const saved = profile.theme;
    if (['dark', 'light', 'system'].includes(saved) && saved !== theme.theme) setTheme(saved);
    // `theme` and `setTheme` are intentionally not dependencies — including
    // them would re-run the sync after the optimistic update. `theme.theme` is
    // the saved preference; comparing against the context object would never
    // be equal and re-persisted the same value on every load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.theme, isDemo]);

  async function run(fn) {
    setMutationError(null);
    setBusy(true);
    try {
      return await fn();
    } catch (err) {
      setMutationError(err?.message || 'Terjadi kesalahan');
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveProfile() {
    if (isDemo) return;
    setNameError(null);
    setSuccess('');

    const trimmed = name.trim();
    if (!trimmed) {
      setNameError('Nama tidak boleh kosong.');
      return;
    }

    const written = await run(() => updateProfile(client, { name: trimmed }));
    if (!written) return;

    patchData((current) => applyProfileWrite(current, { name: trimmed }));
    setSuccess('Profil tersimpan.');
    reload();
  }

  async function handleAvatarChange() {
    if (isDemo) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      base64: false,
    });
    if (result?.canceled) return;

    setAvatarError('');
    setAvatarBusy(true);
    try {
      // Type and 2 MB are checked before a byte leaves the phone; the server
      // repeats both checks and also inspects the image's magic bytes.
      const form = buildAvatarForm(result?.assets?.[0]);
      const newPath = await uploadAvatar(client, form);
      patchData((current) => applyProfileWrite(current, { avatar_path: newPath }));
      // The object keeps its path, so a plain URI would show the old photo.
      setAvatarVersion((v) => v + 1);
      reload();
    } catch (err) {
      setAvatarError(err?.message || 'Gagal mengunggah foto.');
    } finally {
      setAvatarBusy(false);
    }
  }

  async function handleRemoveAvatar() {
    if (isDemo) return;
    setAvatarError('');
    setAvatarBusy(true);
    try {
      // Clearing `avatar_path` alone is not enough: a Google account would fall
      // back to its provider photo on the next read, so that pointer goes too.
      await deleteAvatar(client, profile.avatar_path);
      await updateProfile(client, { provider_image: null });
      patchData((current) => applyProfileWrite(current, { avatar_path: null, provider_image: null }));
      setAvatarVersion((v) => v + 1);
      reload();
    } catch (err) {
      setAvatarError(err?.message || 'Gagal menghapus foto.');
    } finally {
      setAvatarBusy(false);
    }
  }

  /** Applies a choice at once and persists it; a failed save is reported only. */
  async function persistAppearance(next) {
    if (isDemo) return;
    setTheme(next);
    patchData((current) => applyProfileWrite(current, { theme: next }));
    try {
      await updateProfile(client, { theme: next });
    } catch {
      setAvatarError('Penampilan gagal disimpan di server.');
    }
  }

  function handleDeletionCanceled() {
    if (isDemo) return;
    patchData((current) => applyProfileWrite(current, { deletion_requested_at: null }));
    reload();
  }

  /** Creating a first password revokes the bearer token server-side. */
  async function handleSessionsRevoked() {
    if (isDemo) return;
    await Promise.resolve(signOut?.()).catch(() => {});
    await Linking.openURL(Linking.createURL('login')).catch(() => {});
  }

  // An upload wins over the provider photo: the user chose it more recently
  // than Google did. `provider_image` is the Google picture, present for anyone
  // who signed in through SSO.
  const avatarSrc = avatarUrl(profile.avatar_path, avatarVersion) ?? profile.provider_image ?? null;
  const usingProviderPhoto = !profile.avatar_path && Boolean(profile.provider_image);
  const email = user?.email ?? '';
  const initial = (name.trim() || email || 'Pengguna').charAt(0).toUpperCase();

  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={s.header}>
        <Text style={s.headerTitle}>Profil</Text>
      </View>

      {isDemo ? (
        <DemoBanner>Mode demo — perubahan tidak disimpan</DemoBanner>
      ) : null}

      {/* The card gutter lives here, not on the ScrollView: a `gap` on the
          content container would add 16px below the header as well, making the
          header-to-first-panel rhythm 48px instead of the web's 32px. */}
      <View style={s.cardStack}>
        {/* --- Identity ------------------------------------------------------ */}
        <Panel>
          <Text style={s.h2}>Identitas</Text>
          <Text style={s.bodyCopy}>Nama ini akan terlihat di menu dan aplikasi.</Text>

          <View style={s.avatarRow}>
            <View style={s.avatar} accessibilityLabel="Foto profil" accessibilityRole="image">
              {avatarSrc ? (
                <Image source={{ uri: avatarSrc }} style={s.avatarImage} />
              ) : (
                <Text style={s.avatarInitial}>{initial}</Text>
              )}
            </View>
            <View style={s.avatarActions}>
              <View style={s.buttonRow}>
                <Pressable
                  style={[s.primaryButton, isDemo && s.disabled]}
                  onPress={handleAvatarChange}
                  disabled={avatarBusy || isDemo}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: avatarBusy || isDemo }}
                >
                  <Text style={s.primaryButtonText}>
                    {avatarBusy ? 'Mengunggah...' : avatarSrc ? 'Ganti foto' : 'Unggah foto'}
                  </Text>
                </Pressable>
                {avatarSrc ? (
                  <GhostButton onPress={handleRemoveAvatar} disabled={avatarBusy || isDemo}>
                    {avatarBusy ? 'Menghapus...' : 'Hapus'}
                  </GhostButton>
                ) : null}
              </View>
              <Text style={s.hint}>
                {usingProviderPhoto
                  ? 'Foto ini diambil dari Google. Unggah foto untuk menggantinya, atau ubah di pengaturan Google lalu masuk lagi.'
                  : 'JPG, PNG, WebP, atau GIF, maksimal 2 MB.'}
              </Text>
            </View>
          </View>

          {avatarError ? <Text style={s.error}>{avatarError}</Text> : null}

          <View style={s.form}>
            <TextField
              label="Nama tampilan"
              value={name}
              onChange={setName}
              error={nameError}
              placeholder="Nama kamu"
              maxLength={60}
              autoComplete="name"
              editable={!isDemo}
            />
            <View style={s.readOnlyField}>
              <Text style={s.fieldLabel}>Email</Text>
              <Text style={s.emailValue}>{email || '-'}</Text>
            </View>
            <FormMessage error={mutationError} success={success} />
            <Button
              onPress={handleSaveProfile}
              busy={busy}
              busyLabel="Menyimpan..."
              disabled={isDemo}
            >
              Simpan profil
            </Button>
          </View>
        </Panel>

        {/* --- Appearance ---------------------------------------------------- */}
        <Panel>
          <Text style={s.h2}>Tampilan</Text>
          <Text style={s.bodyCopy}>
            Pilihan tema tersimpan di akunmu dan ikut saat kamu pindah perangkat.
          </Text>
          <Text style={s.fieldLabel}>Tema</Text>
          <View style={s.swatchRow} accessibilityRole="group" accessibilityLabel="Tema">
            {THEME_OPTIONS.map((item) => (
              <ThemeOption
                key={item.id}
                item={item}
                selected={theme.theme === item.id}
                disabled={isDemo}
                onSelect={() => persistAppearance(item.id)}
              />
            ))}
          </View>
        </Panel>

        <PasswordPanel
          client={client}
          onSessionsRevoked={handleSessionsRevoked}
          disabled={isDemo}
        />
        <DeleteAccountPanel
          client={client}
          deletionRequestedAt={profile.deletion_requested_at ?? null}
          signOut={signOut}
          onCanceled={handleDeletionCanceled}
          disabled={isDemo}
        />
      </View>
    </ScrollView>
  );
}

/** One labelled swatch: a miniature of the palette, not just a word. */
function ThemeOption({ item, selected, onSelect, disabled }) {
  const preview = tokens(item.preview);
  const t = tokens(useTheme().resolved);
  const s = stylesFor(t);
  return (
    <Pressable
      style={[s.swatchHit, disabled && s.disabled]}
      onPress={onSelect}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled: !!disabled }}
      accessibilityLabel={`Tema ${item.label}`}
    >
      <View style={[s.swatchCard, selected ? s.swatchSelected : null]}>
        {/* Only one palette is active on the page, so the preview reads its
            colours from `tokens()` rather than from the live theme. */}
        <View style={[s.preview, { backgroundColor: preview.bg }]}>
          <View style={[s.previewRail, { backgroundColor: preview.shell }]} />
          <View style={s.previewBody}>
            <View style={[s.previewLine, { backgroundColor: preview.body }]} />
            <View style={[s.previewAccent, { backgroundColor: preview.accent }]} />
          </View>
        </View>
        <Text style={s.swatchLabel}>{item.label}</Text>
      </View>
    </Pressable>
  );
}

const stylesFor = (t) =>
  StyleSheet.create({
    screen: { backgroundColor: t.bg },
    content: { paddingBottom: 48 },
    cardStack: { gap: t.spacing.card },
    disabled: { opacity: 0.4 },
    header: { marginBottom: t.spacing.section },
    headerTitle: {
      fontFamily: t.font.display,
      fontSize: 36,
      lineHeight: 41,
      letterSpacing: -0.065,
      fontWeight: '500',
      color: t.ink,
    },

    h2: {
      fontFamily: t.font.display,
      fontSize: 17,
      letterSpacing: -0.025,
      fontWeight: '500',
      color: t.ink,
      marginBottom: 6,
    },
    bodyCopy: { fontSize: 13, lineHeight: 21, color: t.muted, marginBottom: t.spacing.card },
    fieldLabel: { fontSize: 13, fontWeight: '500', color: t.body, marginBottom: 8 },
    hint: { fontSize: 12, lineHeight: 19, color: t.subtle },
    error: { fontSize: 12, lineHeight: 18, color: t.dangerInk, marginBottom: 12 },

    avatarRow: { flexDirection: 'row', gap: t.spacing.card, marginBottom: 20 },
    avatar: {
      width: 68,
      height: 68,
      flexShrink: 0,
      borderRadius: t.radius.full,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.hover,
      borderWidth: 1,
      borderColor: t.line2,
    },
    avatarImage: { width: '100%', height: '100%' },
    avatarInitial: {
      fontFamily: t.font.display,
      fontSize: 24,
      fontWeight: '600',
      color: t.accentText,
    },
    avatarActions: { flex: 1, minWidth: 0, gap: 8 },
    buttonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
    primaryButton: {
      height: 44,
      justifyContent: 'center',
      paddingHorizontal: 18,
      borderRadius: t.radius.md,
      backgroundColor: t.accent,
    },
    primaryButtonText: { fontSize: 13, fontWeight: 'bold', letterSpacing: 0.26, color: t.accentInk },

    form: { gap: t.spacing.card },
    readOnlyField: { gap: 7 },
    emailValue: { fontFamily: t.font.mono, fontSize: 13, color: t.subtle },

    swatchRow: { flexDirection: 'row', gap: 10 },
    swatchHit: { flex: 1, minWidth: 0 },
    swatchCard: {
      borderWidth: 1,
      borderColor: t.line2,
      borderRadius: t.radius.sm,
      padding: 8,
      gap: 6,
    },
    swatchSelected: { borderColor: t.accentText },
    preview: {
      height: 22,
      flexDirection: 'row',
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: t.line,
    },
    previewRail: { width: '22%', height: '100%' },
    previewBody: { flex: 1, paddingHorizontal: 4, justifyContent: 'center', gap: 3 },
    previewLine: { height: 2, width: '60%' },
    previewAccent: { height: 5, width: '16%' },
    swatchLabel: { fontSize: 12, lineHeight: 16, color: t.body },
  });
