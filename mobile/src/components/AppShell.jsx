import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { secureStorage } from '../api/storage.js';
import { useDemo } from '../state/DemoProvider.jsx';
import { hasSeenOnboarding } from '../state/onboarding.js';
import { useSession } from '../state/SessionProvider.jsx';
import { loginPathForNotice, takeLogoutNotice } from '../state/logout-notice.js';
import { useTheme } from '../theme/useTheme.js';
import { tokens } from '../theme/tokens.js';
import AccountMenu from './AccountMenu.jsx';
import { LoadingState } from './ui.jsx';

/**
 * The authenticated shell.
 *
 * Every screen under the `(app)` group renders through here: the background
 * matches the theme and the account menu is available. The idle guard lives
 * in the root layout instead, so it is mounted on the bare routes too (a
 * session left open on /login is exactly one that needs guarding).
 *
 * The shell holds until `SessionProvider` has finished resolving — a visible
 * loading state rather than a redirect, so signing in lands in the shell and
 * there is nothing else a bare root could do. Once resolved as `out` it
 * redirects instead of rendering the screens: a guest or an expired session
 * must not sit on a ledger page showing an error whose retry will always 401.
 * A visitor who has never finished the carousel lands on /onboarding; every
 * other guest goes to /login. A `?idle=1` / `?deleted=1` notice always wins,
 * so the redirect does not erase why the session ended. This only reads the
 * local flag — it never changes `session.status` or the auth flow.
 *
 * Demo is the one exception: a visitor who chose "Lihat-lihat dulu" has no
 * session at all and must still see the screens. The flag is checked before
 * the redirect and before the loading gate, and the shell shows a "Keluar
 * demo" control that clears the flag and goes back to /login.
 */
export default function AppShell({ children }) {
  const session = useSession();
  const { isDemo, exitDemo } = useDemo();
  const router = useRouter();
  const redirectedRef = useRef(false);
  const t = tokens(useTheme().resolved);
  const styles = stylesFor(t);

  useEffect(() => {
    if (isDemo || session.status !== 'out' || redirectedRef.current) return;
    redirectedRef.current = true;
    let active = true;

    // Consume the reason first: an idle auto-logout or a scheduled deletion
    // must still be readable on /login even if onboarding was never seen.
    const notice = takeLogoutNotice();
    (async () => {
      // Broken storage must not strand a returning guest in the carousel on
      // every boot, so a failed read falls back to "seen".
      let seen = true;
      try {
        seen = await hasSeenOnboarding(secureStorage);
      } catch (error) {
        console.warn('[onboarding] penanda tidak bisa dibaca:', error?.message ?? error);
      }
      // The flag read is async: a visitor can enter demo (or the effect can be
      // cleaned up) while it is in flight. Neither case may still navigate a
      // guest out of the demo they just chose.
      if (!active || isDemo) return;
      const destination = notice
        ? loginPathForNotice(notice)
        : seen ? '/login' : '/onboarding';
      router.replace(destination);
    })();

    return () => {
      active = false;
    };
  }, [session.status, router, isDemo]);

  if (!isDemo && session.status !== 'in') {
    return <LoadingState label="Memuat sesi..." />;
  }

  return (
    <View style={styles.shell}>
      <AccountMenu />
      {isDemo ? (
        <Pressable
          style={styles.demoExit}
          onPress={() => {
            // We are already leaving; do not let the guest guard fire a second
            // replace on the render where `isDemo` flips back to false.
            redirectedRef.current = true;
            exitDemo();
            router.replace('/login');
          }}
          accessibilityRole="button"
        >
          <Text style={styles.demoExitText}>Keluar demo</Text>
        </Pressable>
      ) : null}
      {children}
    </View>
  );
}

const stylesFor = (t) =>
  StyleSheet.create({
    shell: {
      flex: 1,
      backgroundColor: t.bg,
      paddingHorizontal: 16,
      paddingTop: 24,
    },
    demoExit: {
      alignSelf: 'flex-start',
      borderWidth: 1,
      borderColor: t.line3,
      borderRadius: t.radius.md,
      paddingHorizontal: 10,
      paddingVertical: 6,
      marginBottom: t.spacing.card,
    },
    demoExitText: {
      fontFamily: t.font.display,
      fontSize: 13,
      color: t.accentText,
    },
  });
