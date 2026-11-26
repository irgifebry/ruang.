import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { FAVICON_GLYPH } from '../theme/favicon.js';
import { useTheme } from '../theme/useTheme.js';
import { tokens } from '../theme/tokens.js';

const styles = StyleSheet.create({
  box: { borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});

/**
 * The brand glyph — the same drawing the web app uses for its tab favicon,
 * so the app icon and the tab icon cannot drift. `FAVICON_GLYPH` is drawn as
 * the glyph inside a chip of the accent token; the chip itself is filled with
 * the token accent, the glyph with its ink form, both read from `tokens()`.
 */
export default function BrandMark({ size = 32 }) {
  const t = tokens(useTheme().resolved);
  return (
    <View style={[styles.box, { width: size, height: size, backgroundColor: t.accent }]}>
      <Svg width={size} height={size} viewBox="0 0 32 32">
        <Path d={FAVICON_GLYPH} fill={t.accentInk} />
      </Svg>
    </View>
  );
}
