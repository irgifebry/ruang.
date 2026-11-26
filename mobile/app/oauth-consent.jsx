import { useEffect } from 'react';
import { useLocalSearchParams, useNavigation } from 'expo-router';

import { OAuthConsent } from '../src/screens/OAuthConsent.jsx';

/**
 * `ruang://oauth-consent?client_id=…&scope=…&state=…&next=…`
 *
 * The query is passed through unchanged: this project registers no OAuth
 * clients, so there is nothing to look up and no redirect rule to invent.
 */
export default function OAuthConsentRoute() {
  const navigation = useNavigation();
  const params = useLocalSearchParams();

  useEffect(() => {
    navigation.setOptions?.({ headerShown: false, title: 'Izin akses' });
  }, [navigation]);

  return <OAuthConsent params={params} />;
}
