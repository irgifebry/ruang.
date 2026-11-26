import { useEffect } from 'react';
import { useLocalSearchParams, useNavigation } from 'expo-router';

import { AuthScreen } from '../src/screens/AuthScreen.jsx';

/** `/register` — the second entry point into the one shared auth screen. */
export default function RegisterRoute() {
  const navigation = useNavigation();
  const params = useLocalSearchParams();

  useEffect(() => {
    navigation.setOptions?.({ headerShown: false });
  }, [navigation]);

  return <AuthScreen mode="register" params={params} />;
}
