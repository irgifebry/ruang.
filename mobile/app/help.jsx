import { useEffect } from 'react';
import { useNavigation } from 'expo-router';

import { StaticInfo } from '../src/screens/StaticInfo.jsx';

/** `/help` — the four in-app FAQ topics. */
export default function HelpRoute() {
  const navigation = useNavigation();

  useEffect(() => {
    navigation.setOptions?.({ headerShown: false, title: 'Bantuan' });
  }, [navigation]);

  return <StaticInfo variant="help" />;
}
