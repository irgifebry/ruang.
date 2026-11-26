import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, FormMessage, GhostButton, TextField } from './form.jsx';
import { Panel } from './ui.jsx';
import { fetchAccountStatus, setPassword } from '../api/account.js';
import { changePassword } from '../api/auth.js';
import { tokens } from '../theme/tokens.js';
import { useTheme } from '../theme/useTheme.js';

/**
 * The password panel on /settings/profile — the native mirror of
 * `src/components/PasswordPanel.jsx`.
 *
 * The card is a trigger; the three fields live in a sheet so a rare task does
 * not make the page the tallest thing on a phone. Which form renders depends
 * on whether the account actually has a password: a Google-only account gets
 * the create form, because Better Auth's `/change-password` would ask it for a
 * "current password" that does not exist.
 *
 * Status is fetched on the first open, not on mount — a page load should not
 * spend a request on a form nobody asked for. A failed status read falls back
 * to the change form; the server rejects the attempt if that guess was wrong.
 */
export function PasswordPanel({ client, onSessionsRevoked, disabled = false }) {
  const t = tokens(useTheme().resolved);
  const s = stylesFor(t);

  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(null);
  const [statusError, setStatusError] = useState(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [fieldError, setFieldError] = useState(null);
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  // Creating the first password revokes every session on the server, including
  // this device's bearer token. Say so, and offer a way back in, rather than
  // letting the next silent refresh fail as if the app had broken.
  const [needsReauth, setNeedsReauth] = useState(false);

  useEffect(() => {
    if (!open || status || statusError) return;
    let active = true;
    fetchAccountStatus(client)
      .then((data) => {
        if (active) setStatus(data);
      })
      .catch((err) => {
        if (active) setStatusError(err?.message || 'Gagal memuat status akun.');
      });
    return () => {
      active = false;
    };
  }, [open, status, statusError, client]);

  /** Close and wipe, so a half-typed password never survives a dismissal. */
  function handleClose() {
    setOpen(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmation('');
    setFieldError(null);
    setSuccess('');
    setNeedsReauth(false);
  }

  /** Shared by both forms: length, then confirmation, then the request. */
  async function submit(request) {
    if (disabled) return;
    setFieldError(null);
    setSuccess('');
    setBusy(true);

    // React Native's TextInput ignores the `minLength` props below — they
    // mirror the web markup only. The real 8-character enforcement is here.
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

  async function handleChange() {
    await submit(async () => {
      await changePassword(client, {
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });
      setSuccess('Kata sandi diperbarui. Semua sesi lain dicabut.');
    });
  }

  /** On success the panel swaps to the change form, as on the web. */
  async function handleSet() {
    await submit(async () => {
      await setPassword(client, newPassword);
      setStatus((prev) => ({ ...prev, hasPassword: true }));
      setSuccess('Kata sandi dibuat. Sekarang kamu bisa masuk dengan email juga.');
      setNeedsReauth(true);
    });
  }

  // Showing "change your password" to someone who cannot is a dead end;
  // showing "create one" to someone who already has one is a wrong claim the
  // server would reject anyway.
  const hasPassword = status?.hasPassword !== false;

  return (
    <>
      <Panel>
        <View style={s.cardHead}>
          <View style={s.cardText}>
            <Text style={s.h2}>Kata sandi</Text>
            {/* A guest has no account at all — the ordinary copy would claim
                one. Say what the locked control is while demo is on. */}
            <Text style={s.bodyCopy}>
              {disabled
                ? 'Mode demo — kata sandi tidak bisa diubah di sini.'
                : hasPassword
                  ? 'Masuk dengan email dan kata sandi.'
                  : 'Akun ini belum punya kata sandi — masuk lewat Google saja.'}
            </Text>
          </View>
          <Pressable
            style={[s.trigger, disabled && s.triggerDisabled]}
            onPress={() => setOpen(true)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityState={{ disabled }}
          >
            <Text style={s.triggerText}>
              {disabled
                ? 'Kata sandi (demo)'
                : hasPassword ? 'Ubah kata sandi' : 'Buat kata sandi'}
            </Text>
          </Pressable>
        </View>
      </Panel>

      <Modal
        visible={open}
        onRequestClose={handleClose}
        presentationStyle="pageSheet"
        animationType="slide"
        accessibilityViewIsModal
      >
        <ScrollView
          style={s.sheet}
          contentContainerStyle={s.sheetContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={s.sheetHead}>
            <Text style={s.eyebrow}>Keamanan</Text>
            <Pressable onPress={handleClose} accessibilityRole="button" hitSlop={10}>
              <Text style={s.closeText}>Tutup</Text>
            </Pressable>
          </View>

          <Text style={s.sheetTitle}>
            {hasPassword ? 'Ubah kata sandi' : 'Buat kata sandi'}
          </Text>
          <Text style={s.sheetCopy}>
            {disabled
              ? 'Mode demo — perubahan kata sandi tidak disimpan.'
              : hasPassword
                ? 'Setelah diganti, semua sesi lain ikut keluar — termasuk perangkat dan browser lain. Kamu harus login ulang di sana.'
                : 'Buat kata sandi supaya kamu bisa masuk juga memakai email, selain lewat Google seperti biasa.'}
          </Text>

          {needsReauth ? (
            <View style={s.reauth}>
              <Text style={s.reauthCopy}>
                Sesi di perangkat ini sudah berakhir. Masuk lagi dengan email dan kata sandi baru kamu.
              </Text>
              <Button onPress={onSessionsRevoked}>Masuk lagi</Button>
            </View>
          ) : null}

          {!status && !statusError ? (
            <Text style={s.pending}>memuat status akun...</Text>
          ) : hasPassword ? (
            <View style={s.form}>
              <TextField
                label="Kata sandi saat ini"
                value={currentPassword}
                onChange={setCurrentPassword}
                placeholder="Masukkan kata sandi lama"
                secureTextEntry
                minLength={8}
                autoCapitalize="none"
                autoComplete="current-password"
              />
              <TextField
                label="Kata sandi baru"
                value={newPassword}
                onChange={setNewPassword}
                placeholder="Minimal 8 karakter"
                secureTextEntry
                minLength={8}
                autoCapitalize="none"
                autoComplete="new-password"
              />
              <TextField
                label="Ulangi kata sandi baru"
                value={confirmation}
                onChange={setConfirmation}
                placeholder="Ketik ulang kata sandi"
                secureTextEntry
                minLength={8}
                autoCapitalize="none"
                autoComplete="new-password"
              />
              <FormMessage error={fieldError} success={success} />
              <View style={s.actions}>
                <View style={s.action}>
                  <Button onPress={handleChange} busy={busy} busyLabel="Menyimpan...">
                    Simpan kata sandi
                  </Button>
                </View>
                <GhostButton onPress={handleClose}>Batal</GhostButton>
              </View>
            </View>
          ) : (
            <View style={s.form}>
              <TextField
                label="Kata sandi baru"
                value={newPassword}
                onChange={setNewPassword}
                placeholder="Minimal 8 karakter"
                secureTextEntry
                minLength={8}
                autoCapitalize="none"
                autoComplete="new-password"
              />
              <TextField
                label="Ulangi kata sandi baru"
                value={confirmation}
                onChange={setConfirmation}
                placeholder="Ketik ulang kata sandi"
                secureTextEntry
                minLength={8}
                autoCapitalize="none"
                autoComplete="new-password"
              />
              <FormMessage error={fieldError ?? statusError} success={success} />
              <View style={s.actions}>
                <View style={s.action}>
                  <Button onPress={handleSet} busy={busy} busyLabel="Menyimpan...">
                    Buat kata sandi
                  </Button>
                </View>
                <GhostButton onPress={handleClose}>Batal</GhostButton>
              </View>
            </View>
          )}
        </ScrollView>
      </Modal>
    </>
  );
}

const stylesFor = (t) =>
  StyleSheet.create({
    cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: t.spacing.card },
    cardText: { flex: 1, minWidth: 0 },
    h2: {
      fontFamily: t.font.display,
      fontSize: 17,
      letterSpacing: -0.025,
      fontWeight: '500',
      color: t.ink,
      marginBottom: 6,
    },
    bodyCopy: { fontSize: 13, lineHeight: 21, color: t.muted },
    trigger: {
      flexShrink: 0,
      height: 44,
      justifyContent: 'center',
      paddingHorizontal: 18,
      borderRadius: t.radius.md,
      backgroundColor: t.accent,
    },
    triggerText: { fontSize: 13, fontWeight: 'bold', letterSpacing: 0.26, color: t.accentInk },
    triggerDisabled: { opacity: 0.4 },

    sheet: { backgroundColor: t.panel },
    sheetContent: { padding: 24, paddingBottom: 40 },
    sheetHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 12,
    },
    eyebrow: {
      fontFamily: t.font.mono,
      fontSize: 11,
      letterSpacing: 1.1,
      color: t.subtle,
      textTransform: 'uppercase',
    },
    closeText: { fontSize: 12, color: t.muted },
    sheetTitle: {
      fontFamily: t.font.display,
      fontSize: 20,
      letterSpacing: -0.03,
      fontWeight: '500',
      color: t.ink,
      marginBottom: 6,
    },
    sheetCopy: { fontSize: 13, lineHeight: 21, color: t.muted, marginBottom: 22 },
    reauth: {
      gap: 10,
      borderWidth: 1,
      borderColor: t.line3,
      borderRadius: t.radius.md,
      padding: 12,
      marginBottom: 22,
    },
    reauthCopy: { fontSize: 12, lineHeight: 19, color: t.body },
    pending: { fontFamily: t.font.mono, fontSize: 13, color: t.subtle },
    form: { gap: t.spacing.card },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, alignItems: 'center' },
    action: { flexGrow: 1, flexBasis: 160 },
  });

export default PasswordPanel;
