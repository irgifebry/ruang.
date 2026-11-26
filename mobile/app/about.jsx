import { useEffect } from 'react';
import { useNavigation } from 'expo-router';

import { StaticInfo } from '../src/screens/StaticInfo.jsx';

/** `/about` — the three principles. */
export default function AboutRoute() {
  const navigation = useNavigation();

  useEffect(() => {
    navigation.setOptions?.({ headerShown: false, title: 'Tentang' });
  }, [navigation]);

  return <StaticInfo variant="about" />;
}
