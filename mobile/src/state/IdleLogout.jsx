import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Modal, StyleSheet, Text, View } from 'react-native';
import { deleteItemAsync, getItem, setItem } from 'expo-secure-store';
import { useRouter } from 'expo-router';

import { Button, GhostButton } from '../components/form.jsx';
import { useSession } from './SessionProvider.jsx';
import { rememberLogoutNotice } from './logout-notice.js';
import { clearIdleState, createIdleController, IDLE_TIMEOUT_MS } from '../shared/idle-logout.js';
import { useTheme } from '../theme/useTheme.js';
import { tokens } from '../theme/tokens.js';

/**
 * Storage for the idle clock — SecureStore's synchronous `getItem`/`setItem`
 * plus the async delete. Passing it to the controller (rather than letting
 * the module resolve it) makes the persistence explicit and lets the guard
 * start before Metro has a chance to define `require`.
 */
const idleStorage = {
  getItem: (key) => getItem(key),
  setItem: (key, value) => setItem(key, value),
  removeItem: (key) => {
    deleteItemAsync(key).catch(() => {});
  },
};

/**
 * Idle auto-logout, mounted by the root layout on every route.
 *
 * The timing lives in `src/shared/idle-logout.js`; this component is the part
 * that needs React — resolving the session from `SessionProvider` and turning
 * a timeout into a sign-out and a navigation.
 *
 * Three deliberate choices, the native flavour of the web counterpart:
 *
 * - **It lives in the root layout, not a tab screen or the shell.** The guard
 *   runs wherever the user is — including a bare /login with a live session —
 *   and is mounted exactly once, whether or not `AppShell` is on screen.
 * - **It passes storage and AppState to the controller.** SecureStore is the
 *   clock's storage and `AppState` its events, so the guard starts without
 *   depending on the module resolving them lazily.
 * - **There is no native login route yet** — sign-out navigates to `/login`
 *   and a later task adds the screen. While there is no session to guard, the
 *   stored clock is cleared so signing back in cannot start already expired.
 */
export default function IdleLogout() {
  const [warning, setWarning] = useState(false);
  const controllerRef = useRef(null);
  // A latch rather than state: two paths into the sign-out (the timer, the
  // dialog button) must not both fire.
  const signingOutRef = useRef(false);
  const { status, signOut } = useSession();
  const router = useRouter();

  const signOutAndLeave = useCallback(async () => {
    if (signingOutRef.current) return;
    signingOutRef.current = true;
    clearIdleState();
    // The shell now redirects every guest; record why so its /login still
    // carries the notice even if it wins the race with the navigation below.
    rememberLogoutNotice('idle');
    try {
      await signOut();
    } catch (error) {
      console.error('[auth] sign-out gagal:', error);
    } finally {
      // Navigate by route, not the history stack: the session is gone and the
      // server-side cookie state is what the login page reads. `idle=1` is the
      // reason the AuthScreen shows its "Sesi berakhir" notice — without it a
      // silent logout reads as the account being taken away.
      router.replace('/login?idle=1');
    }
  }, [router, signOut]);

  useEffect(() => {
    // Nothing to guard without a session — and any clock left behind by a
    // previous one has to go, or signing back in could mount already expired.
    if (status !== 'in') {
      clearIdleState();
      return undefined;
    }

    const controller = createIdleController({
      storage: idleStorage,
      appState: AppState,
      onWarn: () => setWarning(true),
      onExtend: () => setWarning(false),
      onTimeout: () => signOutAndLeave(),
    });
    controllerRef.current = controller;
    controller.start();

    // One line, and the only way to tell an armed guard from an absent one
    // without waiting out the whole window.
    console.debug(`[idle] armed — signs out after ${Math.round(IDLE_TIMEOUT_MS / 1000)}s of no activity`);

    return () => {
      controller.stop();
      controllerRef.current = null;
    };
  }, [status, signOutAndLeave]);

  const stay = useCallback(() => {
    // Only close the dialog if the deadline actually moved. `extend` declines
    // while the throttle gate is shut, and dismissing anyway would leave an
    // imminent deadline with no warning on screen and no way to stop it.
    if (controllerRef.current?.extend() !== true) return;
    setWarning(false);
  }, []);

  const t = tokens(useTheme().resolved);
  const styles = stylesFor(t);
  const idleMinutes = Math.round(IDLE_TIMEOUT_MS / 60000);

  return (
    <Modal visible={warning} onRequestClose={stay} animationType="fade">
      <View style={styles.overlay}>
        <Text style={styles.title}>Masih di sini?</Text>
        <Text style={styles.text}>
          Tidak ada aktivitas selama {idleMinutes} menit, jadi sesi kamu akan berakhir.
          Semua data kamu tetap aman.
        </Text>
        <View style={styles.buttons}>
          <Button tone="danger" onPress={signOutAndLeave}>
            Keluar sekarang
          </Button>
          <GhostButton onPress={stay}>Lanjut dipakai</GhostButton>
        </View>
      </View>
    </Modal>
  );
}

const stylesFor = (t) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: t.bg,
      paddingHorizontal: 24,
      justifyContent: 'center',
      alignItems: 'center',
    },
    title: {
      fontFamily: t.font.display,
      fontSize: 16,
      fontWeight: 'bold',
      color: t.ink,
      marginBottom: 8,
    },
    text: { fontFamily: t.font.display, fontSize: 13, lineHeight: 22, color: t.body },
    buttons: { flexDirection: 'row', gap: 12, marginTop: 24, width: '100%' },
  });
