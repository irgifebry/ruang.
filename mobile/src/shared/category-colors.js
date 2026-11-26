/**
 * Budget category colours, as native hex values.
 *
 * The colours are stored in Postgres as bare strings ('lime', 'blue', …). The
 * web version of this module resolves Tailwind class names, which do not exist
 * in React Native, so each one is a hex value here instead — pinned to the web
 * palette so a category looks the same in both apps.
 *
 * `lime` is deliberately absent from both tables: it is the brand accent, and
 * it has to follow the active theme (`#c9fb55` on dark, `#7aa80c` on light)
 * rather than being one fixed hex.
 */

import { tokens } from '../theme/tokens.js';

/** Solid fill for a progress bar. */
const BAR = {
  blue: '#70c8ff',
  orange: '#ffad6b',
  violet: '#c1a0ff',
  pink: '#ff92bd',
};

/**
 * The tinted chip. The web writes these as two utilities —
 * `bg-[#70c8ff18] text-[#77caff]` — and a native view needs both values at
 * once, so each category carries its background and label colour together.
 * The eight-digit `bg` is the same hex at the same alpha as the web class.
 */
const CHIP = {
  blue: { bg: '#70c8ff18', text: '#77caff' },
  orange: { bg: '#ffad6b18', text: '#ffb77a' },
  violet: { bg: '#c1a0ff18', text: '#c1a0ff' },
  pink: { bg: '#ff92bd18', text: '#ff92bd' },
};

/** The lime chip's tint is fixed, exactly as on the web; only its label moves. */
const LIME_CHIP_BG = '#c9fb5514';

/** A category bar colour. Same fallback rule as the web: unknown lands on lime. */
export const barColor = (color, theme = 'dark') => BAR[color] ?? tokens(theme).accent;

/**
 * A raw `fill` value for SVG (the donut chart). On the web this is a separate
 * table only because `lime` there is a CSS variable rather than a class; in
 * native both resolve to a hex, so it delegates rather than duplicating values.
 */
export const fill = (color, theme = 'dark') => barColor(color, theme);

/** The chip's background and label colours. Unknown colours land on lime. */
export const chipColor = (color, theme = 'dark') =>
  CHIP[color] ?? { bg: LIME_CHIP_BG, text: tokens(theme).accentText };
