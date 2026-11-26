import { useState } from 'react';
import { Stack } from 'expo-router';

import Splash from '../src/components/Splash.jsx';
import { DemoProvider } from '../src/state/DemoProvider.jsx';
import { SessionProvider } from '../src/state/SessionProvider.jsx';
import IdleLogout from '../src/state/IdleLogout.jsx';
import ThemeProvider from '../src/theme/ThemeProvider.jsx';

/**
 * The root layout: theme, then the session provider every authenticated screen
 * reads (`useSession`). The app shell holds its screens until this resolves.
 * The idle guard is mounted here, not in the shell, so it also covers the bare
 * routes — a session left open on /login needs guarding too.
 *
 * `SessionProvider` is a *named* export — importing it as a default bundles
 * `undefined` without `expo export` complaining, and the whole tree crashes on
 * first render. The app sends no captcha: its HTTP client tags requests with
 * `x-ruang-app`, so the server only asks browsers for a Turnstile token.
 *
 * The splash is an overlay inside both providers, so it can read the theme and
 * the session while it waits. The layout only removes it when it reports ready;
 * it does not change navigation — `AppShell` still decides where a guest or a
 * signed-in user lands. `DemoProvider` sits inside both, wrapping the screens:
 * the onboarding route sets the demo flag and the shell reads it.
 */
export default function RootLayout() {
  const [splashDone, setSplashDone] = useState(false);

  return (
    <ThemeProvider>
      <SessionProvider>
        <DemoProvider>
          <IdleLogout />
          <Stack screenOptions={{ headerShown: false }} />
          {splashDone ? null : <Splash onReady={() => setSplashDone(true)} />}
        </DemoProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}
