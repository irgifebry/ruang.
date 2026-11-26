/**
 * Login and registration, one screen for both modes.
 *
 * The two routes (`/login`, `/register`) are thin wrappers that pass `mode`
 * and the deep-link query. The composition is native-first — brand lockup,
 * two-line headline, form panel, footer — and every colour comes from
 * `tokens(resolved)` (the halo is `withAlpha(t.accent, 0.10)`), so dark and
 * light need no second palette.
 *
 * There is no captcha in the app. The HTTP client tags every request with
 * `x-ruang-app: 1`; the server keeps Turnstile for browsers and skips it for
 * those tagged requests. Rate limiting still applies to auth endpoints.
 *
 * Success goes through `SessionProvider` so the shell sees the new user, then
 * navigates to the tab group via a `safePath`-checked `?next=`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TurboModuleRegistry,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';

import { signInSocial, signUpEmail } from '../api/auth.js';
import { buildSocialPayload, signInWithGoogle } from '../auth/google.js';
import { FormMessage, TextField } from '../components/form.jsx';
import { SolarIcon } from '../components/icons.jsx';
import { Panel } from '../components/ui.jsx';
import { useSession } from '../state/SessionProvider.jsx';
import {
  authDestination,
  authErrorMessage,
  authNotices,
  firstParam,
  GOOGLE_ERROR,
} from '../shared/auth-flow.js';
import { FAVICON_GLYPH } from '../theme/favicon.js';
import { GOOGLE_COLORS, GOOGLE_PATHS, tokens, withAlpha } from '../theme/tokens.js';
import { useTheme } from '../theme/useTheme.js';

/** The four-colour Google mark — the same drawing the web button uses. */
function GoogleMark() {
  // Colours come from tokens.js, never from a literal in this component.
  const colors = ['blue', 'green', 'yellow', 'red'];
  return (
    <Svg width={16} height={16} viewBox="0 0 48 48">
      {colors.map((name, index) => (
        <Path
          key={name}
          d={GOOGLE_PATHS[index]}
          fill={GOOGLE_COLORS[name]}
        />
      ))}
    </Svg>
  );
}

export default function AuthScreen({ mode = 'login', params = {} }) {
  const isLogin = mode !== 'register';
  const session = useSession();
  const router = useRouter();
  const { resolved } = useTheme();
  const t = tokens(resolved);
  const s = stylesFor(t);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [socialBusy, setSocialBusy] = useState(false);
  const [formError, setFormError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [idleDismissed, setIdleDismissed] = useState(false);
  const [focused, setFocused] = useState(null);

  // Two one-shot animations: the header eases up on mount, the CTA only reacts
  // to a press. Neither loops — a constant animation would drain the battery.
  const headerOpacity = useRef(new Animated.Value(0)).current;
  const headerTranslate = useRef(new Animated.Value(14)).current;
  const ctaScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerOpacity, {
        toValue: 1,
        duration: 420,
        useNativeDriver: true,
      }),
      Animated.timing(headerTranslate, {
        toValue: 0,
        duration: 420,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const animateCta = (toValue, duration) =>
    Animated.timing(ctaScale, { toValue, duration, useNativeDriver: true }).start();

  // `onPressOut` is not guaranteed once `busy` disables the button, so a press
  // could otherwise leave the CTA stuck at its pressed scale.
  useEffect(() => {
    ctaScale.setValue(1);
  }, [busy, ctaScale]);

  const destination = authDestination(firstParam(params.next));
  const notices = authNotices({
    mode: isLogin ? 'login' : 'register',
    error: params.error,
    deleted: params.deleted,
    idle: params.idle,
  });

  /**
   * The Google SDK cannot be imported safely on every surface: web has no
   * free implementation, and Expo Go does not ship the native module. Probe
   * the module WITHOUT importing the package — `get()` returns null instead
   * of throwing the way `getEnforcing()` does — and keep the SDK out of the
   * bundle path entirely when it cannot work.
   */
  const googleAvailable =
    Platform.OS !== 'web' && Boolean(TurboModuleRegistry.get('RNGoogleSignin'));

  const goToTabs = useCallback(() => {
    router.replace(destination);
  }, [router, destination]);

  const handleSubmit = async () => {
    if (busy || socialBusy) return;
    setFormError(null);
    setNotice(null);

    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setFormError(
        isLogin
          ? 'Email atau kata sandi tidak cocok. Periksa lagi lalu coba masuk.'
          : 'Isi email dan kata sandi dengan benar.',
      );
      return;
    }
    if (!isLogin && password.length < 8) {
      setFormError('Kata sandi minimal 8 karakter.');
      return;
    }

    setBusy(true);
    try {
      if (isLogin) {
        await session.signIn({ email: cleanEmail, password });
      } else {
        // Sign-up returns the session and the bearer. Seed the provider from
        // that result instead of doing a second `signIn` round trip.
        const result = await signUpEmail(session.client, {
          email: cleanEmail,
          password,
          name: cleanEmail.split('@')[0],
        });
        await session.adoptSession(result);
      }
      goToTabs();
    } catch (error) {
      setFormError(authErrorMessage(isLogin ? 'login' : 'register', error));
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    if (socialBusy || busy) return;
    setFormError(null);

    // Keep the button visible for the native-first design, but never import
    // the SDK on a surface that cannot load it — the import itself throws an
    // uncaught TurboModule error and leaves no recoverable auth result.
    if (!googleAvailable) {
      setFormError(
        Platform.OS === 'web'
          ? 'Masuk dengan Google hanya tersedia di aplikasi.'
          : 'Google masuk belum tersedia di Expo Go. Gunakan development build, bukan Expo Go.',
      );
      return;
    }

    setSocialBusy(true);
    try {
      const { idToken, nonce } = await signInWithGoogle();
      const payload = buildSocialPayload({ idToken, nonce });
      await signInSocial(session.client, payload);
      await session.refresh();
      goToTabs();
    } catch (error) {
      // Real cause to the console; the visitor only gets friendly copy, never
      // a Better Auth code or an untrusted-callback detail.
      console.error('[auth] Google sign-in gagal:', error?.message || error);
      setFormError(GOOGLE_ERROR);
    } finally {
      setSocialBusy(false);
    }
  };

  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* Decorative only: it sits behind the content and never takes a tap. */}
      <View style={s.halo} pointerEvents="none" />

      <Animated.View
        style={[
          s.header,
          { opacity: headerOpacity, transform: [{ translateY: headerTranslate }] },
        ]}
      >
        <View style={s.brand}>
          <View style={s.brandMark}>
            <Svg width={18} height={18} viewBox="0 0 32 32">
              <Path d={FAVICON_GLYPH} fill={t.accentInk} />
            </Svg>
          </View>
          <Text style={s.brandWord}>
            ruang<Text style={s.brandDot}>.</Text>
          </Text>
        </View>
        <Text style={s.headline}>Catat uangmu,</Text>
        <Text style={[s.headline, s.headlineAccent]}>tenang di akhir bulan.</Text>
      </Animated.View>

      <Panel style={s.panel}>
        {notices.deletionScheduled ? (
          <View style={s.notice} accessibilityRole="status">
            <Text style={s.noticeText}>
              Akun kamu dijadwalkan dihapus dalam 7 hari. Kalau berubah pikiran, masuk dengan akun
              yang sama sekarang — semua data kembali seperti semula.
            </Text>
          </View>
        ) : null}

        {notices.idleSignedOut && !idleDismissed ? (
          <View style={s.notice} accessibilityRole="status">
            <Text style={s.noticeText}>
              Tidak ada aktivitas selama {notices.idleMinutes} menit, jadi kamu dikeluarkan dari sesi
              ini. Semua data tetap tersimpan — masuk lagi untuk melanjutkan.
            </Text>
            <Pressable onPress={() => setIdleDismissed(true)} accessibilityRole="button" hitSlop={8}>
              <Text style={s.dismiss}>Tutup</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={s.kicker}>
          <View style={s.dot} />
          <Text style={s.kickerText}>{isLogin ? 'Masuk' : 'Daftar'}</Text>
        </View>
        <Text style={s.cardTitle}>{isLogin ? 'Masuk ke Ruang' : 'Buat akun'}</Text>

        <View style={s.fields}>
          <Pressable
            style={[s.googleButton, (busy || socialBusy) && s.googleDisabled]}
            onPress={handleGoogle}
            disabled={busy || socialBusy}
            accessibilityRole="button"
            accessibilityState={{ busy: socialBusy, disabled: busy || socialBusy }}
          >
            {/* Only the mark is decorative: the button label still reads. */}
            <View accessibilityElementsHidden={true}>
              <GoogleMark />
            </View>
            <Text style={s.googleText}>
              {socialBusy ? 'Menghubungkan ke Google...' : 'Lanjutkan dengan Google'}
            </Text>
          </Pressable>

          <View style={s.divider}>
            <View style={s.dividerLine} />
            <Text style={s.dividerText}>atau</Text>
            <View style={s.dividerLine} />
          </View>

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
            inputStyle={focused === 'email' ? s.inputFocused : null}
            onFocus={() => setFocused('email')}
            onBlur={() => setFocused(null)}
          />

          {isLogin ? (
            <Pressable
              style={s.forgot}
              onPress={() => router.push('/reset-password')}
              accessibilityRole="link"
              hitSlop={8}
            >
              <Text style={s.forgotText}>Lupa kata sandi?</Text>
            </Pressable>
          ) : null}

          <View style={s.passwordWrap}>
            <TextField
              label="Kata sandi"
              value={password}
              onChange={setPassword}
              placeholder="Minimal 8 karakter"
              secureTextEntry={!showPassword}
              textContentType={isLogin ? 'password' : 'newPassword'}
              maxLength={128}
              inputStyle={focused === 'password' ? s.inputFocused : null}
              onFocus={() => setFocused('password')}
              onBlur={() => setFocused(null)}
            />
            <Pressable
              style={s.eye}
              onPress={() => setShowPassword((value) => !value)}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
              hitSlop={10}
            >
              <SolarIcon
                name={showPassword ? 'eye-closed' : 'eye'}
                size={18}
                color={t.subtle}
              />
            </Pressable>
          </View>
          <Text style={s.hint}>
            {isLogin ? 'Kata sandimu tidak pernah ditampilkan.' : 'Pakai minimal 8 karakter.'}
          </Text>

          <FormMessage error={formError || notices.oauthError} success={notice} />

          <Animated.View style={{ transform: [{ scale: ctaScale }] }}>
            <Pressable
              style={s.button}
              onPress={handleSubmit}
              onPressIn={() => animateCta(0.97, 90)}
              onPressOut={() => animateCta(1, 140)}
              disabled={busy}
              accessibilityRole="button"
              accessibilityState={{ busy: !!busy, disabled: !!busy }}
            >
              <Text style={s.buttonText}>
                {busy ? 'Sedang memproses...' : isLogin ? 'Masuk' : 'Daftar'}
              </Text>
              {busy ? null : <SolarIcon name="arrow-right" size={17} color={t.accentInk} />}
            </Pressable>
          </Animated.View>

          <Pressable
            style={s.switchMode}
            onPress={() => router.replace(isLogin ? '/register' : '/login')}
            accessibilityRole="link"
          >
            <Text style={s.switchText}>
              {isLogin ? 'Belum punya akun? Daftar di sini' : 'Sudah punya akun? Masuk di sini'}
            </Text>
          </Pressable>
        </View>
      </Panel>

      <View style={s.footer}>
        <Pressable onPress={() => router.push('/help')} accessibilityRole="link" hitSlop={8}>
          <Text style={s.footerLink}>Bantuan</Text>
        </Pressable>
        <Text style={s.footerSep}>·</Text>
        <Pressable onPress={() => router.push('/about')} accessibilityRole="link" hitSlop={8}>
          <Text style={s.footerLink}>Tentang</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

// The routes import `{ AuthScreen }`; keep the default and an older alias too.
// `expo export` bundles an undefined named import silently, so
// tests/auth-pages-exports.test.mjs pins every pair at source level.
export { AuthScreen, AuthScreen as AuthForm };

const stylesFor = (t) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.bg },
    content: {
      paddingHorizontal: 20,
      paddingTop: t.spacing.section + 8,
      paddingBottom: t.spacing.section + 8,
    },
    // A soft accent bloom in the top-right corner. It is a token at 10% alpha,
    // never a new hex, and pointerEvents="none" keeps it out of the hit tree.
    halo: {
      position: 'absolute',
      top: -96,
      right: -96,
      width: 240,
      height: 240,
      borderRadius: t.radius.full,
      backgroundColor: withAlpha(t.accent, 0.10),
    },
    header: { marginBottom: t.spacing.section },
    brand: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 30 },
    brandMark: {
      width: 30,
      height: 30,
      borderRadius: t.radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.accent,
    },
    brandWord: {
      fontFamily: t.font.display,
      fontSize: 15,
      fontWeight: 'bold',
      letterSpacing: -0.04,
      color: t.ink,
    },
    brandDot: { color: t.accentText },
    headline: {
      fontFamily: t.font.display,
      fontSize: 38,
      lineHeight: 43,
      letterSpacing: -0.07,
      fontWeight: '500',
      color: t.ink,
    },
    headlineAccent: { color: t.accentText, fontStyle: 'italic' },
    // The form is the one large surface on the screen: xl radius rather than
    // the small radius of the controls inside it, with room to breathe.
    panel: {
      borderRadius: t.radius.xl,
      paddingVertical: 26,
      paddingHorizontal: 20,
      gap: 0,
    },
    // Exactly the web notice: `border-ruang-warn/40 bg-ruang-warn/10`,
    // `rounded-[4px]`, text in `ruang-warn-text`. The alpha is applied to the
    // warn token over the panel (not a new opaque fill), so both themes read
    // the same as the CSS version.
    notice: {
      borderWidth: 1,
      borderColor: withAlpha(t.warn, 0.4),
      backgroundColor: withAlpha(t.warn, 0.1),
      borderRadius: t.radius.md,
      paddingHorizontal: 13,
      paddingVertical: 11,
      marginBottom: t.spacing.card,
      gap: 6,
    },
    noticeText: { fontSize: 13, lineHeight: 21, color: t.warnText },
    dismiss: { fontSize: 12, fontWeight: 'bold', color: t.warnText, alignSelf: 'flex-start' },
    kicker: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 12,
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: t.radius.full,
      backgroundColor: t.accent,
    },
    kickerText: {
      fontFamily: t.font.mono,
      fontSize: 11,
      letterSpacing: 0.55,
      color: t.body,
      textTransform: 'uppercase',
    },
    cardTitle: {
      fontFamily: t.font.display,
      fontSize: 22,
      letterSpacing: -0.04,
      fontWeight: '500',
      color: t.ink,
      marginBottom: 22,
    },
    fields: { gap: 16 },
    googleButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      height: 46,
      paddingHorizontal: 18,
      borderWidth: 1,
      borderColor: t.line3,
      borderRadius: t.radius.md,
      backgroundColor: t.shell,
    },
    googleDisabled: { opacity: 0.6 },
    googleText: {
      fontFamily: t.font.display,
      fontSize: 13,
      fontWeight: 'bold',
      letterSpacing: 0.26,
      color: t.ink,
    },
    divider: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    dividerLine: { flex: 1, height: 1, backgroundColor: t.line2 },
    dividerText: {
      fontFamily: t.font.mono,
      fontSize: 11,
      letterSpacing: 0.88,
      color: t.ghost,
      textTransform: 'uppercase',
    },
    // Applied on top of the field's base border, so only the colour changes.
    inputFocused: { borderColor: t.accent },
    forgot: { alignSelf: 'flex-end', marginTop: -6 },
    forgotText: { fontSize: 12, color: t.muted },
    passwordWrap: { position: 'relative' },
    eye: {
      position: 'absolute',
      right: 4,
      top: 30,
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    hint: { fontSize: 12, lineHeight: 19, color: t.subtle, marginTop: -10 },
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      height: 48,
      paddingHorizontal: 18,
      borderRadius: t.radius.md,
      backgroundColor: t.accent,
    },
    buttonText: { color: t.accentInk, fontWeight: 'bold', fontSize: 14 },
    switchMode: { alignSelf: 'center', paddingVertical: 6 },
    switchText: { fontSize: 12, lineHeight: 19, color: t.subtle, textAlign: 'center' },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      marginTop: t.spacing.section,
    },
    footerLink: { fontSize: 12, color: t.muted, textDecorationLine: 'underline' },
    footerSep: { fontSize: 12, color: t.ghost },
  });
