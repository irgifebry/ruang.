import { useEffect } from 'react';
import { useLocalSearchParams, useNavigation } from 'expo-router';

import { AuthScreen } from '../src/screens/AuthScreen.jsx';

/**
 * `/login?next=…&error=…&deleted=1&idle=1`.
 *
 * A thin wrapper: the screen owns the form, the deep-link notices and the
 * captcha gate; this route only hides the Stack header (the screen draws its
 * own title, like every other screen) and hands the query down. The named
 * import is pinned by tests/auth-pages-exports.test.mjs — expo export bundles
 * an undefined named import without complaining.
 */
export default function LoginRoute() {
  const navigation = useNavigation();
  const params = useLocalSearchParams();

  useEffect(() => {
    navigation.setOptions?.({ headerShown: false });
  }, [navigation]);

  return <AuthScreen mode="login" params={params} />;
}
