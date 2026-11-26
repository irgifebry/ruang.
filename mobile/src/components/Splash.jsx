/**
 * Boot splash — a full-screen brand overlay mounted by the root layout.
 *
 * It covers the app until TWO things are true: the session lookup has settled
 * (`status !== 'loading'`) and the splash has been on screen for at least
 * `SPLASH_MIN_MS`. Only then does it call `onReady()` and let the layout remove
 * it. It never navigates — `AppShell` still owns the decision between `/` and
 * `/login`, and duplicating that here would put a second redirect in the boot
 * path.
 *
 * The animation runs once on mount: glyph scale + fade, wordmark fade, and an
 * accent line growing to full width. No `Animated.loop` — a splash that keeps
 * moving for its whole (short) life is noise, and the idle guard already owns
 * long-lived timers in this app.
 */

import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useSession } from '../state/SessionProvider.jsx';
import { FAVICON_GLYPH } from '../theme/favicon.js';
import { tokens } from '../theme/tokens.js';
import { useTheme } from '../theme/useTheme.js';

export const SPLASH_MIN_MS = 1200;

/** A hung session lookup must not leave the overlay up forever. */
export const SPLASH_MAX_WAIT_MS = 8000;

const IN_MS = 620;
const LINE_DELAY_MS = 180;
const LINE_WIDTH = 148;

export default function Splash({ onReady }) {
  const { status } = useSession();
  const t = tokens(useTheme().resolved);
  const s = stylesFor(t);

  const glyphScale = useRef(new Animated.Value(0.86)).current;
  const glyphOpacity = useRef(new Animated.Value(0)).current;
  const wordOpacity = useRef(new Animated.Value(0)).current;
  const lineGrow = useRef(new Animated.Value(0)).current;
  const fired = useRef(false);
  const [minElapsed, setMinElapsed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMinElapsed(true), SPLASH_MIN_MS);
    // Upper bound for a bootstrap that never settles: still only signals
    // readiness — AppShell remains the one that chooses the destination.
    const maxTimer = setTimeout(() => {
      if (!fired.current) {
        fired.current = true;
        onReady?.();
      }
    }, SPLASH_MAX_WAIT_MS);
    Animated.parallel([
      Animated.timing(glyphScale, {
        toValue: 1,
        duration: IN_MS,
        useNativeDriver: true,
      }),
      Animated.timing(glyphOpacity, {
        toValue: 1,
        duration: IN_MS,
        useNativeDriver: true,
      }),
      Animated.timing(wordOpacity, {
        toValue: 1,
        duration: IN_MS,
        delay: 100,
        useNativeDriver: true,
      }),
      Animated.timing(lineGrow, {
        toValue: LINE_WIDTH,
        duration: IN_MS,
        delay: LINE_DELAY_MS,
        useNativeDriver: false,
      }),
    ]).start();
    return () => {
      clearTimeout(timer);
      clearTimeout(maxTimer);
    };
  }, []);

  useEffect(() => {
    if (!fired.current && status !== 'loading' && minElapsed) {
      fired.current = true;
      onReady?.();
    }
  }, [status, minElapsed, onReady]);

  return (
    <View style={[StyleSheet.absoluteFill, s.screen]}>
      <Animated.View
        style={[
          s.mark,
          { opacity: glyphOpacity, transform: [{ scale: glyphScale }] },
        ]}
      >
        <Svg width={36} height={36} viewBox="0 0 32 32">
          <Path d={FAVICON_GLYPH} fill={t.accentInk} />
        </Svg>
      </Animated.View>

      <Animated.Text style={[s.wordmark, { opacity: wordOpacity }]}>
        ruang<Text style={s.accent}>.</Text>
      </Animated.Text>

      <View style={s.track}>
        <Animated.View style={[s.fill, { width: lineGrow }]} />
      </View>
    </View>
  );
}

const stylesFor = (t) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.bg,
    },
    mark: {
      width: 64,
      height: 64,
      borderRadius: t.radius.lg,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.accent,
    },
    wordmark: {
      fontFamily: t.font.display,
      fontSize: 40,
      lineHeight: 46,
      letterSpacing: -2.2,
      color: t.ink,
      marginTop: 20,
    },
    accent: { color: t.accentText },
    track: {
      width: LINE_WIDTH,
      height: 2,
      marginTop: 18,
      borderRadius: t.radius.full,
      overflow: 'hidden',
      backgroundColor: t.track,
    },
    fill: {
      height: '100%',
      borderRadius: t.radius.full,
      backgroundColor: t.accent,
    },
  });
