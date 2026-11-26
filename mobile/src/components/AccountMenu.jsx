import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';

import { SolarIcon } from './icons.jsx';
import { useSession } from '../state/SessionProvider.jsx';
import { useTheme } from '../theme/useTheme.js';
import { tokens } from '../theme/tokens.js';

/**
 * The account menu — the native counterpart of the web sidebar's account
 * popover. Tautan Profil / Bantuan / Tentang, and the Keluar button.
 *
 * Routes are pushed with the router; there is no `/login` screen yet, so
 * navigating by path is forward-looking — later tasks fill these in. The menu
 * opens only when there is a session to sign out of, and closes on press of an
 * item.
 */

/** Account menu links — the same shape as the web menu. */
const MENU_ITEMS = [
  { key: 'profil', label: 'Profil', icon: 'user', path: '/settings/profile' },
  { key: 'bantuan', label: 'Bantuan', icon: 'help', path: '/help' },
  { key: 'tentang', label: 'Tentang', icon: 'info-circle', path: '/about' },
];

export default function AccountMenu() {
  const [open, setOpen] = useState(false);
  const { status, signOut, user } = useSession();
  const router = useRouter();
  const t = tokens(useTheme().resolved);
  const styles = stylesFor(t);

  if (status !== 'in') return null;

  const close = () => setOpen(false);
  const goTo = (path) => {
    router.push(path);
    close();
  };

  return (
    <View>
      <Pressable style={styles.trigger} onPress={() => setOpen((value) => !value)}>
        <Text style={styles.triggerLabel} numberOfLines={1}>
          {user?.name?.trim() || user?.email || 'Pengguna'}
        </Text>
        <SolarIcon name="user-circle" size={16} color={t.subtle} />
      </Pressable>

      {open ? (
        <View style={styles.overlay}>
          <Text style={styles.overlayTitle}>Pengaturan akun</Text>
          {MENU_ITEMS.map((item) => (
            <Pressable key={item.key} style={styles.item} onPress={() => goTo(item.path)}>
              <SolarIcon name={item.icon} size={17} color={t.body} />
              <Text style={styles.itemText}>{item.label}</Text>
            </Pressable>
          ))}
          <View style={styles.divider} />
          <Pressable style={styles.item} onPress={signOut}>
            <SolarIcon name="logout" size={17} color={t.dangerInk} />
            <Text style={styles.itemText}>Keluar</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const stylesFor = (t) =>
  StyleSheet.create({
    trigger: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 8,
    },
    triggerLabel: {
      fontFamily: t.font.display,
      fontSize: 13,
      color: t.body,
    },
    overlay: {
      marginTop: 6,
      backgroundColor: t.panel,
      borderWidth: 1,
      borderColor: t.line,
      borderRadius: t.radius.xl,
      paddingVertical: 8,
    },
    overlayTitle: {
      fontFamily: t.font.mono,
      fontSize: 11,
      color: t.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.12,
      paddingHorizontal: 8,
      marginBottom: 6,
    },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 9,
      paddingHorizontal: 8,
    },
    itemText: { fontFamily: t.font.display, fontSize: 13, color: t.ink },
    divider: { height: 1, backgroundColor: t.lineSoft, marginVertical: 8 },
  });
