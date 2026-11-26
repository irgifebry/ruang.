import { ActivityIndicator, Dimensions, StyleSheet, Text, View } from 'react-native';

import { GhostButton, Button } from './form.jsx';
import { SolarIcon } from './icons.jsx';
import { useTheme } from '../theme/useTheme.js';
import { tokens } from '../theme/tokens.js';

/**
 * The shared UI primitives, the native mirror of `src/components/ui.jsx` on
 * the web app. Every colour comes from `tokens(resolved)` — nothing is
 * hardcoded.
 */

const stylesFor = (t) =>
  StyleSheet.create({
    eyebrow: {
      fontFamily: t.font.mono,
      fontSize: 11,
      letterSpacing: 0.44,
      color: t.muted,
    },
    panel: {
      backgroundColor: t.panel,
      borderWidth: 1,
      borderColor: t.line,
      borderRadius: t.radius.xl,
      paddingVertical: 22,
      paddingHorizontal: 24,
    },
    panelRaised: { backgroundColor: t.raised },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    spinner: {
      width: 32,
      height: 32,
      borderRadius: t.radius.full,
      backgroundColor: t.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    loadingText: {
      marginTop: 14,
      fontFamily: t.font.display,
      fontSize: 15,
      fontWeight: '500',
      color: t.ink,
    },
    errorBadge: {
      width: 34,
      height: 34,
      borderRadius: t.radius.full,
      backgroundColor: t.dangerInk,
      alignItems: 'center',
      justifyContent: 'center',
    },
    errorText: {
      marginTop: 14,
      fontSize: 15,
      lineHeight: 26,
      textAlign: 'center',
      color: t.ink,
    },
    errorButtons: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: 14,
      marginTop: 24,
    },
    empty: {
      paddingVertical: 24,
      paddingHorizontal: 16,
      borderWidth: 1,
      borderColor: t.line2,
      borderStyle: 'dashed',
      borderRadius: t.radius.xl,
      fontSize: 13,
      lineHeight: 23,
      textAlign: 'center',
      color: t.muted,
    },
  });

/**
 * The small mono kicker that opens every page header and panel.
 *
 * A `Text`, not a `View`: every caller passes a bare string (`<Eyebrow>November
 * 2026</Eyebrow>`), and React Native rejects a string child outside a `Text`.
 */
export function Eyebrow({ children, style }) {
  const t = tokens(useTheme().resolved);
  return <Text style={[stylesFor(t).eyebrow, style]}>{children}</Text>;
}

/** The bordered surface every card sits in. */
export function Panel({ children, tone = 'panel', style }) {
  const t = tokens(useTheme().resolved);
  const s = stylesFor(t);
  return (
    <View style={[s.panel, tone === 'raised' ? s.panelRaised : null, style]}>{children}</View>
  );
}

/** Full-height loading state shared by every data-backed page. */
export function LoadingState({ label = 'Memuat data...' }) {
  const t = tokens(useTheme().resolved);
  const s = stylesFor(t);
  return (
    <View
      style={[
        s.center,
        { paddingVertical: 32, minHeight: Math.round(Dimensions.get('window').height * 0.65) },
      ]}
    >
      <View style={s.spinner}>
        <SolarIcon name="loader" size={16} color={t.accentInk} />
      </View>
      <Text style={s.loadingText}>{label}</Text>
    </View>
  );
}

/**
 * Full-height error state. `onRetry` retries the load; `onSignIn` is the
 * secondary action (the web app's "Masuk lagi" link) when the cause is a
 * missing session.
 */
export function ErrorState({ message, onRetry, retryLabel = 'Coba lagi', onSignIn, signInLabel = 'Masuk lagi' }) {
  const t = tokens(useTheme().resolved);
  const s = stylesFor(t);
  return (
    <View style={[s.center, { paddingHorizontal: 22 }]}>
      <View style={s.errorBadge}>
        <SolarIcon name="danger-circle" size={18} color={t.accentInk} />
      </View>
      <Text style={s.errorText}>{message}</Text>
      <View style={s.errorButtons}>
        {onRetry ? <Button onPress={onRetry}>{retryLabel}</Button> : null}
        {onSignIn ? <GhostButton onPress={onSignIn}>{signInLabel}</GhostButton> : null}
      </View>
    </View>
  );
}

/** Dashed-border placeholder for an empty list, so a zero state never looks broken. */
export function EmptyState({ children, style }) {
  const t = tokens(useTheme().resolved);
  return <Text style={[stylesFor(t).empty, style]}>{children}</Text>;
}
