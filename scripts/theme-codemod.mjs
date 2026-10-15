/**
 * One-off codemod: rewrite the hardcoded palette to theme tokens.
 *
 * Run with `node scripts/theme-codemod.mjs`. Every colour in the app used to be
 * an arbitrary hex literal repeated across a dozen files, which left a light
 * theme with nothing to switch. This maps each literal onto the token that now
 * carries it in `globals.css`.
 *
 * It is idempotent: re-running finds nothing left to replace.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { globSync } from 'node:fs';

/** hex (lowercase) -> token suffix. Chosen by role, not by appearance. */
const MAP = {
  // Surfaces
  '#0b0d0c': 'bg',
  '#0c0f0d': 'shell',
  '#111412': 'panel',
  '#151916': 'panel-2',
  '#151a15': 'raised',
  '#0e120f': 'sunken',
  '#171c18': 'hover',
  '#1a211b': 'bubble',
  '#040605': 'overlay',
  // Hairlines
  '#252a27': 'line',
  '#29312a': 'line-soft',
  '#303730': 'line-2',
  '#333b33': 'line-3',
  '#2b312b': 'track',
  // Text
  '#f0f1eb': 'ink',
  '#f1f3eb': 'ink',
  '#f5f6f2': 'ink',
  '#eef1e9': 'ink',
  '#e4e9e1': 'ink',
  '#e0e5dd': 'ink',
  '#d6ddd4': 'ink',
  '#dfe4dc': 'ink',
  '#dce1d9': 'ink',
  '#c9d1c7': 'ink',
  '#cbd1c8': 'ink',
  '#c3cbc2': 'ink',
  '#a8b0a7': 'body',
  '#b9c2b7': 'body',
  '#b7c2b7': 'body',
  '#aeb7ab': 'body',
  '#a9b1a9': 'body',
  '#a7afa6': 'body',
  '#a4aca3': 'body',
  '#a0a89f': 'body',
  '#c0c9be': 'body',
  '#8c948c': 'muted',
  '#8b948a': 'muted',
  '#8e988d': 'muted',
  '#8e968d': 'muted',
  '#8f998f': 'muted',
  '#929a91': 'muted',
  '#899289': 'muted',
  '#879087': 'muted',
  '#949b94': 'muted',
  '#828c81': 'muted',
  '#828a82': 'muted',
  '#849084': 'muted',
  '#7d857c': 'subtle',
  '#7c857c': 'subtle',
  '#747e74': 'subtle',
  '#747c75': 'subtle',
  '#737d73': 'subtle',
  '#777f77': 'subtle',
  '#6b746b': 'subtle',
  '#667067': 'subtle',
  '#616b60': 'subtle',
  '#5f685f': 'subtle',
  '#5c665c': 'ghost',
  '#586158': 'ghost',
  '#586058': 'ghost',
  '#555e55': 'ghost',
  '#4d564d': 'ghost',
  '#485049': 'ghost',
  // Accent
  '#11150b': 'accent-ink',
  '#10140a': 'accent-ink',
  '#c9fb55': 'accent',
  '#d8ff83': 'accent-hover',
  // Near-duplicates that survived the first pass because they only appear in
  // one or two places each. They are within a couple of steps of the token
  // listed, so they fold in rather than adding another variable.
  '#2c332d': 'line-3',
  '#3d493e': 'line-3',
  '#272d28': 'hover',
  '#141815': 'hover',
  '#3a453a': 'line-3',
  '#303a31': 'line-2',
  '#818980': 'muted',
  '#969f95': 'muted',

  // Danger
  '#ff8c76': 'danger',
  '#ff9a8e': 'danger-ink',
  '#ffb3a8': 'danger-hover',
  '#23120e': 'danger-fill-ink',
  '#2a1512': 'danger-surface',
};

/** Files never rewritten: the token definitions themselves. */
const SKIP = new Set([
  'src/app/globals.css',
  'tailwind.config.cjs',
  'scripts/theme-codemod.mjs',
]);

/**
 * Accent needs splitting by utility. A bright lime fill and lime *text* are the
 * same colour on a dark page but not on a light one, so `bg-` keeps the fill
 * token while every other utility reads the readable variant.
 */
const ACCENT_TEXT_PREFIXES = [
  'text-',
  'border-',
  'ring-',
  'outline-',
  'decoration-',
  'divide-',
  'fill-',
  'stroke-',
  'from-',
  'to-',
  'via-',
];

const files = globSync('src/**/*.{js,jsx}', { withFileTypes: false }).filter(
  (file) => !SKIP.has(file.replace(/\\/g, '/')),
);

let changed = 0;
for (const file of files) {
  const before = readFileSync(file, 'utf8');
  let after = before;

  // Arbitrary hex -> named token. Only rewrites inside a Tailwind class, which
  // is always `utility-[#hex]`; a bare `#hex` in CSS or JS is left alone.
  //
  // Hex values carrying an alpha suffix (`#c9fb5514`, the tinted lime chip) have
  // no token equivalent, so they are left for the accent pass below.
  after = after.replace(
    /([a-z-]+:)*([a-z-]+)-\[#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?\]/g,
    (match, variants, utility) => {
      const hex = `#${match.match(/\[#([0-9a-fA-F]+)\]/)[1]}`;
      const token = MAP[hex.toLowerCase()];
      if (!token) return match;
      return `${variants || ''}${utility}-ruang-${token}`;
    },
  );

  // `ruang-lime` was the old hardcoded accent. The lime category colour in
  // category-colors.js is now the theme accent, so both collapse onto it.
  after = after.replace(
    new RegExp(
      `((?:${ACCENT_TEXT_PREFIXES.join('|')})ruang-)` + 'lime\\b',
      'g',
    ),
    '$1accent-text',
  );
  after = after.replace(/\bruang-lime\b/g, 'ruang-accent');

  if (after !== before) {
    writeFileSync(file, after, 'utf8');
    changed += 1;
    console.log(`  rewrote ${file}`);
  }
}

console.log(`\n${changed} file(s) rewritten.`);