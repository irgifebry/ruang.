/**
 * OAuth authorization consent screen — a direct port of the web's
 * `/oauth/consent` page, including its redirect rules.
 *
 * The app registers no OAuth clients of its own: `client_id`, `scope`, `state`,
 * `next` and `redirect_uri` all come from the deep link and are shown verbatim
 * (with friendly labels for the three known scopes). Allow keeps the web's
 * `safePath` / `safeRedirectUri` gate and appends `state` if the target does
 * not carry it; Deny goes back to `next`. Nothing here mints a client or
 * changes what an allowed redirect means.
 *
 * Guests are sent to `/login?next=<this screen>` first, so sign-in can carry
 * the whole authorization request back. `window.location.origin` on the web
 * becomes the configured API origin here — the origin the same rules are
 * checked against.
 */

import { useEffect, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';

import { Button, GhostButton } from '../components/form.jsx';
import { LoadingState, Panel } from '../components/ui.jsx';
import { useSession } from '../state/SessionProvider.jsx';
import { apiBaseURL } from '../config.js';
import { firstParam } from '../shared/auth-flow.js';
import { safePath, safeRedirectUri } from '../shared/safe-redirect.js';
import { tokens } from '../theme/tokens.js';
import { useTheme } from '../theme/useTheme.js';

const SCOPE_LABELS = {
  openid: 'Identitas dasar akunmu',
  email: 'Alamat email akunmu',
  profile: 'Nama dan foto profil',
};

const FALLBACK_SCOPES = ['Identitas dasar akunmu (email dan nama profil)'];

export default function OAuthConsent({ params = {} }) {
  const { status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const { resolved } = useTheme();
  const t = tokens(resolved);
  const s = stylesFor(t);

  const clientId = firstParam(params.client_id) || 'Aplikasi pihak ketiga';
  const nextPath = safePath(firstParam(params.next));
  const state = firstParam(params.state);
  const redirectUri = firstParam(params.redirect_uri);
  const rawScopes = firstParam(params.scope).split(' ').filter(Boolean);
  const scopes = rawScopes.length
    ? rawScopes.map((scope) => SCOPE_LABELS[scope] || `Izin "${scope}"`)
    : FALLBACK_SCOPES;

  const backTo = useMemo(() => {
    const query = Object.entries(params)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(firstParam(value))}`)
      .join('&');
    return query ? `${pathname}?${query}` : pathname;
  }, [params, pathname]);

  useEffect(() => {
    if (status === 'loading') return undefined;
    if (status !== 'in') {
      router.replace(`/login?next=${encodeURIComponent(backTo)}`);
    }
    return undefined;
  }, [status, router, backTo]);

  const handleAllow = () => {
    const origin = new URL(apiBaseURL()).origin;
    const target = redirectUri
      ? safeRedirectUri(redirectUri, origin, nextPath)
      : nextPath;
    // `target` is already same-origin and relative at this point. Keeping the
    // state round-trip here is the web rule; it is not a new OAuth client.
    const hashAt = target.indexOf('#');
    const beforeHash = hashAt >= 0 ? target.slice(0, hashAt) : target;
    const hash = hashAt >= 0 ? target.slice(hashAt) : '';
    const [path, query = ''] = beforeHash.split('?');
    const targetParams = new URLSearchParams(query);
    if (state && !targetParams.has('state')) targetParams.set('state', state);
    const withState = targetParams.toString()
      ? `${path}?${targetParams.toString()}${hash}`
      : `${path}${hash}`;
    router.replace(withState || '/');
  };

  const handleDeny = () => {
    router.replace(nextPath);
  };

  if (status !== 'in') {
    return <LoadingState label="Memuat permintaan akses..." />;
  }

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <View style={s.header}>
        <Text style={s.title}>
          Izinkan <Text style={s.accent}>akses?</Text>
        </Text>
        <Text style={s.lead}>
          <Text style={s.ink}>{clientId}</Text> minta izin buat akses akun ruang. milikmu.
        </Text>
      </View>

      <Panel>
        <Text style={s.kicker}>Yang diminta</Text>
        <View style={s.scopes}>
          {scopes.map((scope) => (
            <View style={s.scopeRow} key={scope}>
              <View style={s.scopeDot} />
              <Text style={s.scopeText}>{scope}</Text>
            </View>
          ))}
        </View>
        <Text style={s.note}>
          Kamu bisa tolak kapan aja. Tolak berarti balik ke halaman sebelumnya tanpa izin tambahan.
        </Text>
        <View style={s.actions}>
          <View style={s.actionGrow}>
            <Button onPress={handleAllow}>Izinkan akses</Button>
          </View>
          <View style={s.actionGrow}>
            <GhostButton onPress={handleDeny}>Tolak</GhostButton>
          </View>
        </View>
      </Panel>

      <Text
        style={s.back}
        onPress={() => router.replace('/')}
        accessibilityRole="link"
      >
        Kembali ke ringkasan tanpa memberi izin.
      </Text>
    </ScrollView>
  );
}

// Named export pinned by tests/auth-pages-exports.test.mjs.
export { OAuthConsent, OAuthConsent as OAuthConsentScreen };

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
      fontSize: 34,
      lineHeight: 38,
      letterSpacing: -0.065,
      fontWeight: '500',
      color: t.ink,
      marginBottom: 10,
    },
    accent: { color: t.accentText, fontStyle: 'italic', fontWeight: '400' },
    lead: { fontSize: 14, lineHeight: 23, color: t.muted },
    ink: { color: t.ink, fontWeight: '500' },
    kicker: {
      fontFamily: t.font.mono,
      fontSize: 11,
      letterSpacing: 0.88,
      color: t.muted,
      textTransform: 'uppercase',
    },
    scopes: { marginTop: 13, gap: 10 },
    scopeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    scopeDot: { width: 6, height: 6, backgroundColor: t.accent, marginTop: 7 },
    scopeText: { flex: 1, fontSize: 13, lineHeight: 20, color: t.body },
    note: { fontSize: 12, lineHeight: 20, color: t.subtle, marginTop: 18 },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 11, marginTop: 20 },
    actionGrow: { flexGrow: 1, flexBasis: 130 },
    back: { fontSize: 13, lineHeight: 21, color: t.muted, marginTop: 18 },
  });
