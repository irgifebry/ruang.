/**
 * Password recovery in two halves — the native mirror of the web's
 * `/reset-password` page.
 *
 * With no `?token=` the screen asks for an email and sends a reset link whose
 * `redirectTo` is the app's own `ruang://reset-password` deep link. With a token
 * it asks for a new password and a confirmation. A malformed token is never
 * sent to the API and never echoed back: it reads as one generic expired-link
 * message, exactly as on the web.
 *
 * Expo Router resolves `ruang://reset-password?token=…` straight to the route,
 * so the screen only needs the query value handed down by the route.
 */

import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { requestPasswordReset, resetPassword } from '../api/auth.js';
import { Button, FormMessage, TextField } from '../components/form.jsx';
import { Panel } from '../components/ui.jsx';
import { useSession } from '../state/SessionProvider.jsx';
import { firstParam } from '../shared/auth-flow.js';
import { isValidResetToken } from '../shared/reset-token.js';
import { tokens } from '../theme/tokens.js';
import { useTheme } from '../theme/useTheme.js';

const RESET_REDIRECT = 'ruang://reset-password';
const INVALID_LINK = 'Tautan pemulihan tidak valid atau sudah kedaluwarsa.';

export default function ResetPassword({ params = {} }) {
  const session = useSession();
  const router = useRouter();
  const { resolved } = useTheme();
  const t = tokens(resolved);
  const s = stylesFor(t);

  // A repeated query key arrives as an array; only the first value is
  // meaningful (`URLSearchParams.get()` behaviour). The deep link can be
  // delivered while this screen is already mounted, so the mode follows the
  // token rather than being frozen in a useState initializer.
  const token = firstParam(params.token);
  const [mode, setMode] = useState(() => (token ? 'update' : 'request'));
  const [invalidToken, setInvalidToken] = useState(() => Boolean(token) && !isValidResetToken(token));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    // No token: ask for an email. A valid token: ask for a new password. A
    // malformed one: show the generic expired-link message, never the token.
    setMode(token ? 'update' : 'request');
    setInvalidToken(Boolean(token) && !isValidResetToken(token));
    setError(null);
    setSuccess(null);
  }, [token]);

  const handleRequest = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setSuccess(null);

    const cleanEmail = email.trim();
    // The form is `noValidate` on the web too, so native bubbles never appear.
    // Check here rather than surfacing Better Auth's internal field-path error.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError('Isi alamat email dengan benar.');
      setBusy(false);
      return;
    }

    try {
      await requestPasswordReset(session.client, {
        email: cleanEmail,
        redirectTo: RESET_REDIRECT,
      });
      setSuccess(
        'Jika email itu terdaftar, tautan pemulihan sudah dikirim. Cek kotak masuk dan folder spam.',
      );
    } catch (requestError) {
      setError(requestError?.message || 'Gagal mengirim tautan pemulihan.');
    } finally {
      setBusy(false);
    }
  };

  const handleUpdate = async () => {
    if (busy) return;
    setError(null);

    if (!isValidResetToken(token)) {
      setError(INVALID_LINK);
      return;
    }
    if (password.length < 8) {
      setError('Kata sandi baru minimal 8 karakter.');
      return;
    }
    if (password !== confirm) {
      setError('Konfirmasi kata sandi tidak cocok.');
      return;
    }

    setBusy(true);
    try {
      await resetPassword(session.client, { token, newPassword: password });
      setSuccess('Kata sandi berhasil diperbarui. Mengalihkan ke ringkasan...');
      // Same beat as the web page: let the confirmation land, then go home.
      setTimeout(() => router.replace('/'), 1200);
    } catch (updateError) {
      setError(updateError?.message || 'Gagal memperbarui kata sandi.');
      setBusy(false);
    }
  };

  const updating = mode === 'update' && !invalidToken;

  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={s.header}>
        <Text style={s.title}>
          {updating ? 'Kata sandi ' : 'Pulihkan '}
          <Text style={s.accent}>{updating ? 'baru.' : 'aksesmu.'}</Text>
        </Text>
        <Text style={s.lead}>
          {updating
            ? 'Tentukan kata sandi baru buat masuk ke akunmu.'
            : 'Masukin email akunmu. Kami kirim tautan buat bikin kata sandi baru.'}
        </Text>
      </View>

      <Panel>
        {invalidToken ? (
          <Text style={s.invalid} accessibilityRole="alert">
            {INVALID_LINK}
          </Text>
        ) : updating ? (
          <View style={s.fields}>
            <TextField
              label="Kata sandi baru"
              value={password}
              onChange={setPassword}
              placeholder="Minimal 8 karakter"
              secureTextEntry
              textContentType="newPassword"
              maxLength={128}
            />
            <TextField
              label="Ulangi kata sandi baru"
              value={confirm}
              onChange={setConfirm}
              placeholder="Ketik ulang kata sandi"
              secureTextEntry
              textContentType="newPassword"
              maxLength={128}
            />
            <FormMessage error={error} success={success} />
            <Button busy={busy} busyLabel="Menyimpan..." onPress={handleUpdate}>
              Simpan kata sandi
            </Button>
          </View>
        ) : (
          <View style={s.fields}>
            <TextField
              label="Email"
              value={email}
              onChange={setEmail}
              placeholder="nama@email.com"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              maxLength={254}
            />
            <FormMessage error={error} success={success} />
            <Button busy={busy} busyLabel="Mengirim..." onPress={handleRequest}>
              Kirim tautan pemulihan
            </Button>
          </View>
        )}

        <View style={s.footer}>
          <Text style={s.footerText}>
            Ingat kata sandimu?{' '}
            <Text
              style={s.link}
              onPress={() => router.replace('/login')}
              accessibilityRole="link"
            >
              Kembali ke halaman masuk
            </Text>
          </Text>
        </View>
      </Panel>
    </ScrollView>
  );
}

// Named export is what `/reset-password` imports; expo export does not catch a
// missing one, so tests/auth-pages-exports.test.mjs pins the pair.
export { ResetPassword, ResetPassword as ResetPasswordScreen };

const stylesFor = (t) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.bg },
    content: {
      paddingHorizontal: 20,
      paddingTop: t.spacing.section,
      paddingBottom: t.spacing.section,
    },
    header: { marginBottom: t.spacing.section },
    title: {
      fontFamily: t.font.display,
      fontSize: 30,
      lineHeight: 34,
      letterSpacing: -0.06,
      fontWeight: '500',
      color: t.ink,
      marginBottom: 12,
    },
    // The web's accent words are an italic `font-normal` <em>, not just a
    // coloured span of the 500-weight heading.
    accent: { color: t.accentText, fontStyle: 'italic', fontWeight: '400' },
    lead: { fontSize: 14, lineHeight: 23, color: t.muted },
    fields: { gap: t.spacing.card },
    invalid: {
      fontSize: 13,
      lineHeight: 21,
      color: t.dangerInk,
      borderWidth: 1,
      borderColor: t.dangerInk,
      borderRadius: t.radius.sm,
      paddingHorizontal: 13,
      paddingVertical: 11,
    },
    footer: {
      marginTop: t.spacing.card,
      paddingTop: 14,
      borderTopWidth: 1,
      borderTopColor: t.line,
    },
    footerText: { fontSize: 12, lineHeight: 19, color: t.subtle, textAlign: 'center' },
    link: { color: t.accentText },
  });
