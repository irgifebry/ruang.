import { Tabs } from 'expo-router';

import AppShell from '../../src/components/AppShell.jsx';
import { SolarIcon } from '../../src/components/icons.jsx';
import { tokens } from '../../src/theme/tokens.js';
import { useTheme } from '../../src/theme/useTheme.js';

/**
 * The authenticated tab group: Ringkasan / Transaksi / Riwayat / Pengaturan.
 *
 * `AppShell` is the guard that holds the screens until the session resolves;
 * the tab bar is expo-router's. Screen titles come from the tabs, icons from
 * `solar-paths.js`. Later tasks fill the placeholders with the real screens.
 */
export default function AppLayout() {
  const t = tokens(useTheme().resolved);

  return (
    <AppShell>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: t.shell,
            borderTopColor: t.line,
            borderTopWidth: 1,
            height: 64,
            paddingBottom: 8,
            paddingTop: 6,
          },
          tabBarActiveTintColor: t.accentText,
          tabBarInactiveTintColor: t.muted,
          tabBarLabelStyle: {
            fontFamily: t.font.display,
            fontSize: 11,
            fontWeight: '500',
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Ringkasan',
            tabBarIcon: ({ size, color }) => <SolarIcon name="wallet" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="transactions"
          options={{
            title: 'Transaksi',
            tabBarIcon: ({ size, color }) => <SolarIcon name="tag" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="history"
          options={{
            title: 'Riwayat',
            tabBarIcon: ({ size, color }) => <SolarIcon name="history-3" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Pengaturan',
            tabBarIcon: ({ size, color }) => <SolarIcon name="settings" size={size} color={color} />,
          }}
        />
      </Tabs>
    </AppShell>
  );
}
