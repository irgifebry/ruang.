import { useEffect } from 'react';
import { useNavigation } from 'expo-router';

import { secureStorage } from '../src/api/storage.js';
import { useDemo } from '../src/state/DemoProvider.jsx';
import { Onboarding } from '../src/screens/Onboarding.jsx';

/**
 * `/onboarding` — the first-run carousel, chosen by AppShell for a guest who
 * has never completed it. Like the auth routes, this is a thin wrapper: the
 * screen owns the slides and the flag write, and the route hides the Stack
 * header and injects the SecureStore adapter.
 *
 * "Lihat-lihat dulu" sets the local demo flag before the screen navigates to
 * `/`, so `AppShell` lets a sessionless visitor stay on the ledger screens.
 */
export default function OnboardingRoute() {
  const navigation = useNavigation();
  const { enterDemo } = useDemo();

  useEffect(() => {
    navigation.setOptions?.({ headerShown: false });
  }, [navigation]);

  return <Onboarding storage={secureStorage} onLookAround={enterDemo} />;
}
