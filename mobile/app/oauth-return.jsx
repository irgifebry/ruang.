import { useEffect } from 'react';
import { useNavigation, useRouter } from 'expo-router';

import { LoadingState } from '../src/components/ui.jsx';
import { useSession } from '../src/state/SessionProvider.jsx';

/**
 * `ruang://oauth-return`, the callback URL `buildSocialPayload()` sends to
 * Better Auth. The native Google flow exchanges the idToken directly, so this
 * deep link is not where the token is traded — it is the landing place if a
 * provider ever bounces back here. It re-reads the session and goes to the
 * tabs (or to login when there is none), without inventing a new OAuth flow.
 */
export default function OAuthReturnRoute() {
  const navigation = useNavigation();
  const router = useRouter();
  const { refresh } = useSession();

  useEffect(() => {
    navigation.setOptions?.({ headerShown: false });
  }, [navigation]);

  useEffect(() => {
    let active = true;
    refresh()
      .then((result) => {
        if (active) router.replace(result?.user ? '/' : '/login');
      })
      .catch(() => {
        if (active) router.replace('/login');
      });
    return () => {
      active = false;
    };
  }, [refresh, router]);

  return <LoadingState label="Memuat sesi..." />;
}
