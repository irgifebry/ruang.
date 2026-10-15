/**
 * Budget category colour maps.
 *
 * The colours are stored in Postgres as bare strings ('lime', 'blue', …) but
 * Tailwind cannot see a class name built at runtime — `bg-${color}` is purged
 * from the stylesheet and the element renders with no background at all. Every
 * colour therefore has to resolve through one of these explicit lookup tables.
 *
 * `barClass` is for solid fills (progress bars), `chipClass` for the tinted
 * badge, and `swatchClass` for the colour picker.
 *
 * `fill` is the one exception that cannot be a class name: an SVG `fill`
 * attribute takes a colour value, not a Tailwind utility. The donut chart on the
 * summary page needs one per category. `lime` stays a CSS variable so it matches
 * `COLOR_CLASS.lime` in both themes, rather than being one fixed hex.
 */

export const COLOR_CLASS = {
  lime: 'bg-ruang-accent',
  blue: 'bg-[#70c8ff]',
  orange: 'bg-[#ffad6b]',
  violet: 'bg-[#c1a0ff]',
  pink: 'bg-[#ff92bd]',
};

export const CHIP_CLASS = {
  lime: 'bg-[#c9fb5514] text-ruang-accent-text',
  blue: 'bg-[#70c8ff18] text-[#77caff]',
  orange: 'bg-[#ffad6b18] text-[#ffb77a]',
  violet: 'bg-[#c1a0ff18] text-[#c1a0ff]',
  pink: 'bg-[#ff92bd18] text-[#ff92bd]',
};

/** Solid swatch for the colour picker in settings. */
export const SWATCH_CLASS = COLOR_CLASS;

export const FILL = {
  lime: 'rgb(var(--c-accent))',
  blue: '#70c8ff',
  orange: '#ffad6b',
  violet: '#c1a0ff',
  pink: '#ff92bd',
};

/** Resolves safely so an unexpected colour from the database cannot blank a row. */
export const barClass = (color) => COLOR_CLASS[color] ?? COLOR_CLASS.lime;
export const chipClass = (color) => CHIP_CLASS[color] ?? CHIP_CLASS.lime;
export const swatchClass = (color) => SWATCH_CLASS[color] ?? SWATCH_CLASS.lime;
/** An SVG `fill` value, for the donut chart. Same fallback rule as the rest. */
export const fill = (color) => FILL[color] ?? FILL.lime;
