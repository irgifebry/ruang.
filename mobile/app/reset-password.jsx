import { useEffect } from 'react';
import { useLocalSearchParams, useNavigation } from 'expo-router';

import { ResetPassword } from '../src/screens/ResetPassword.jsx';

/**
 * `/reset-password` and its deep link `ruang://reset-password?token=…`.
 * Expo Router resolves both to this file; the token is handed to the screen,
 * which gates the update form with `isValidResetToken`.
 */
export default function ResetPasswordRoute() {
  const navigation = useNavigation();
  const params = useLocalSearchParams();

  useEffect(() => {
    navigation.setOptions?.({ headerShown: false });
  }, [navigation]);

  return <ResetPassword params={params} />;
}
