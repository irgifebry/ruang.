// The brand mark, as a component.
//
// The same glyph the favicon uses (`FAVICON_GLYPH`), so the tile in the sidebar
// and the tile in a browser tab are the same drawing. It was a text "R" before,
// which meant the app and its own icon were two unrelated designs.
//
// Unlike the favicon there is no tile here and no colour to choose: the mark is
// painted by `currentColor`, so the surrounding chip's `text-ruang-accent-ink`
// decides it and the theme switch needs no extra wiring.

import { FAVICON_GLYPH } from '../lib/theme-presets';

/** The bare glyph. Pair it with a chip that sets the background colour. */
export default function BrandMark({ size = 20, className = '' }) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path d={FAVICON_GLYPH} fill="currentColor" />
    </svg>
  );
}
