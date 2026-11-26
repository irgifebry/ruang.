import { StyleSheet, Text, View } from 'react-native';

import { tokens } from '../theme/tokens.js';
import { useTheme } from '../theme/useTheme.js';

/**
 * The read-only notice at the top of every demo screen.
 *
 * The copy is passed by the screen rather than hard-coded here, so the banner
 * text is pinned at each call site by tests/demo-screens.test.mjs. Every colour
 * comes from `tokens(resolved)` — a demo flag must not introduce a palette.
 */
export function DemoBanner({ children }) {
  const t = tokens(useTheme().resolved);
  const s = stylesFor(t);
  return (
    <View style={s.banner} accessibilityRole="alert">
      <Text style={s.text}>{children}</Text>
    </View>
  );
}

const stylesFor = (t) =>
  StyleSheet.create({
    banner: {
      borderWidth: 1,
      borderColor: t.line3,
      backgroundColor: t.raised,
      borderRadius: t.radius.sm,
      paddingHorizontal: 12,
      paddingVertical: 9,
      marginBottom: t.spacing.card,
    },
    text: {
      fontFamily: t.font.mono,
      fontSize: 11,
      letterSpacing: 0.4,
      lineHeight: 17,
      color: t.warnText,
    },
  });

export default DemoBanner;
