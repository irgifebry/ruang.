import { useEffect, useState } from 'react';
import * as Linking from 'expo-linking';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, FormMessage, GhostButton, TextField } from './form.jsx';
import { Panel } from './ui.jsx';
import {
  cancelAccountDeletion,
  fetchAccountStatus,
  requestAccountDeletion,
} from '../api/account.js';
import {
  DELETION_GRACE_DAYS,
  deletionDeadline,
  formatGraceRemaining,
} from '../shared/account-deletion.js';
import { rememberLogoutNotice } from '../state/logout-notice.js';
import { formatDateLong } from '../shared/money.js';
import { tokens } from '../theme/tokens.js';
import { useTheme } from '../theme/useTheme.js';

/**
 * Account deletion on /settings/profile — the native mirror of
 * `src/components/DeleteAccountPanel.jsx`.
 *
 * Nothing is deleted when the button is pressed: the server stamps
 * `profiles.deletion_requested_at`, revokes every session and leaves the data
 * alone for seven days. Signing back in is the restore gesture, so the client
 * signs out on success and deep-links to `/login?deleted=1` to say why.
 *
 * `deletionRequestedAt` arrives from the profile row the screen already read,
 * so the card can state the countdown without opening the sheet.
 */
export function DeleteAccountPanel({
  client,
  deletionRequestedAt = null,
  signOut,
  onCanceled,
  disabled = false,
}) {
  const t = tokens(useTheme().resolved);
  const s = stylesFor(t);

  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(null);
  const [statusError, setStatusError] = useState(null);
  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Fetched on first open, like the password panel beside it. Unlike there, a
  // failed read is not fatal: the worst case is asking for a password someone
  // never set, and the server accepts the request either way.
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

  function handleClose() {
    setOpen(false);
    setPassword('');
    setFieldError(null);
  }

  async function handleRequest() {
    if (disabled) return;
    setFieldError(null);
    setBusy(true);

    try {
      await requestAccountDeletion(client, password);
    } catch (err) {
      setFieldError(err?.message || 'Gagal menjadwalkan penghapusan akun.');
      setBusy(false);
      return;
    }

    // The sessions are already gone server-side, so clearing the local token
    // can only fail if the cookie outlived its session — navigating either way.
    // Record the reason first: the shell redirects every guest now, and its
    // /login must keep the deletion notice even if it navigates before the
    // deep link below is handled.
    rememberLogoutNotice('deleted');
    await Promise.resolve(signOut?.()).catch(() => {});
    await Linking.openURL(Linking.createURL('login?deleted=1')).catch(() => {});
    setBusy(false);
  }

  /**
   * Only reachable when a session outlived the revoke; signing back in is
   * normally the way to undo this. The caller's reload re-reads the profile
   * row, which is where this card's copy comes from.
   */
  async function handleCancel() {
    if (disabled) return;
    setFieldError(null);
    setBusy(true);

    try {
      await cancelAccountDeletion(client);
    } catch (err) {
      setFieldError(err?.message || 'Gagal membatalkan penghapusan akun.');
      setBusy(false);
      return;
    }

    setBusy(false);
    handleClose();
    // Signing in is the documented restore on the web. A session that survived
    // the revoke can cancel here instead, so the caller clears the flag in the
    // profile row it already loaded and quietly re-reads it.
    await Promise.resolve(onCanceled?.()).catch(() => {});
  }

  const hasPassword = status?.hasPassword !== false;
  const deadline = deletionDeadline(deletionRequestedAt);

  return (
    <>
      <Panel>
        <View style={s.cardHead}>
          <View style={s.cardText}>
            <Text style={s.h2}>Hapus akun</Text>
            {/* The grace period is the whole point of this card, so it is in
                the body rather than buried in the sheet. */}
            <Text style={s.bodyCopy}>
              {deletionRequestedAt
                ? `Dijadwalkan dihapus ${DELETION_GRACE_DAYS} hari dari request. Masuk lagi kapan saja untuk membatalkannya.`
                : `Akun dan semua datamu bisa dihapus. Ada masa tunggu ${DELETION_GRACE_DAYS} hari — kalau berubah pikiran, masuk lagi dan semuanya kembali.`}
            </Text>
          </View>
          <Pressable
            style={[
              s.trigger,
              deletionRequestedAt ? null : s.triggerDanger,
              disabled && s.triggerDisabled,
            ]}
            onPress={() => setOpen(true)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityState={{ disabled }}
          >
            <Text style={deletionRequestedAt ? s.triggerText : s.triggerTextDanger}>
              {deletionRequestedAt ? 'Status penghapusan' : 'Hapus akun'}
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
            <Text style={s.eyebrow}>Akun</Text>
            <Pressable onPress={handleClose} accessibilityRole="button" hitSlop={10}>
              <Text style={s.closeText}>Tutup</Text>
            </Pressable>
          </View>

          <Text style={s.sheetTitle}>Hapus akun ini?</Text>
          <Text style={s.sheetCopy}>
            {deletionRequestedAt ? (
              <>
                {`Terjadwal dihapus pada ${formatDateLong(deadline)} — sisa ${formatGraceRemaining(deletionRequestedAt)}. `}
                {'Masuk lagi kapan saja sebelum itu untuk membatalkannya.'}
              </>
            ) : (
              'Kategori, seluruh transaksi, riwayat pemasukan, dan foto profil ikut terhapus. Kamu akan dikeluarkan dari semua perangkat, lalu datanya disimpan 7 hari lagi. Kalau masuk lagi dalam masa itu, akun dikembalikan apa adanya.'
            )}
          </Text>

          {deletionRequestedAt ? (
            <View style={s.form}>
              <FormMessage error={fieldError} />
              <View style={s.actions}>
                <View style={s.action}>
                  <Button onPress={handleCancel} busy={busy} busyLabel="Membatalkan...">
                    Batalkan penghapusan
                  </Button>
                </View>
                <GhostButton onPress={handleClose}>Tutup</GhostButton>
              </View>
            </View>
          ) : (
            <View style={s.form}>
              {!status && !statusError && (
                <Text style={s.pending}>memuat status akun...</Text>
              )}
              {hasPassword && (
                <TextField
                  label="Kata sandi"
                  value={password}
                  onChange={setPassword}
                  placeholder="Masukkan kata sandimu"
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="current-password"
                />
              )}
              <FormMessage error={fieldError ?? statusError} />
              <View style={s.actions}>
                <View style={s.action}>
                  <Button
                    onPress={handleRequest}
                    tone="danger"
                    busy={busy}
                    busyLabel="Menjadwalkan..."
                  >
                    Jadwalkan penghapusan
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
    triggerDanger: { backgroundColor: t.dangerInk },
    triggerText: { fontSize: 13, fontWeight: 'bold', letterSpacing: 0.26, color: t.accentInk },
    triggerTextDanger: { fontSize: 13, fontWeight: 'bold', letterSpacing: 0.26, color: t.dangerFillInk },
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
    pending: { fontFamily: t.font.mono, fontSize: 13, color: t.subtle },
    form: { gap: t.spacing.card },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, alignItems: 'center' },
    action: { flexGrow: 1, flexBasis: 160 },
  });

export default DeleteAccountPanel;
