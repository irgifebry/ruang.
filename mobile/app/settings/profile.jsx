import { useEffect } from 'react';
import { useNavigation } from 'expo-router';

import AppShell from '../../src/components/AppShell.jsx';
import { Profile } from '../../src/screens/Profile.jsx';

/**
 * The `/settings/profile` route.
 *
 * It lives at the app root rather than inside the `(app)` tab group: this is
 * a detail screen reached from the Pengaturan tab and the account menu, so it
 * should not carry a tab bar. `AppShell` is mounted explicitly for the same
 * guard every authenticated screen gets — session hold, idle logout and the
 * account menu. The Stack header is hidden because the screen draws its own
 * "Profil" header, like every other screen.
 *
 * The named import is pinned by `tests/profile-exports.test.mjs`: `expo export`
 * bundles an undefined named import without complaining.
 */
export default function ProfileRoute() {
  const navigation = useNavigation();

  useEffect(() => {
    navigation.setOptions?.({ headerShown: false });
  }, [navigation]);

  return (
    <AppShell>
      <Profile />
    </AppShell>
  );
}
