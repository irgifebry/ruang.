/**
 * Colour tokens resolve to CSS custom properties rather than fixed hex values.
 *
 * The palette used to be hardcoded (`bg-[#0c0f0d]`) in every component, which
 * meant there was nothing for a theme to switch. Each token below reads
 * `rgb(var(--…-rgb) / <alpha-value>)`, so a user-chosen light/dark theme is a
 * matter of redefining the variables on `<html>` — see `src/app/globals.css`.
 *
 * Keep this list in sync with the `:root` block in `src/app/globals.css`.
 */
module.exports = {
  // The theme is chosen in-app and applied as a class on <html>, not inherited
  // from the OS, so `class` strategy is required for any `dark:` variant.
  darkMode: 'class',
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      /**
       * Layout rhythm.
       *
       * Two numbers, used everywhere, so a card gutter on /settings matches the
       * one on /transactions and the gap between two card rows matches the gap
       * between two page sections. Before these tokens the same relationship was
       * spelled `gap-[14px]`, `gap-[15px]`, `gap-[18px]`, `gap-[32px]`,
       * `gap-[48px]` and `mt-[36px]` depending on the file, which is what made
       * the pages feel unrelated to each other.
       *
       *   `card`    — gutter between two adjacent cards (grid gap, mb between a
       *               card row and the card row below it).
       *   `section` — vertical rhythm between card groups / page sections.
       *   `sidebar` — the desktop rail's width, which the page gutter matches.
       *              Collapses to an icon rail when `<html>` carries
       *              `data-sidebar="collapsed"`; see `src/lib/sidebar.js`.
       */
      spacing: {
        card: '16px',
        section: '32px',
        sidebar: 'var(--sidebar-w)',
      },

      colors: {
        // Surfaces, from furthest back to closest to the reader.
        'ruang-bg': 'rgb(var(--c-bg) / <alpha-value>)',
        'ruang-shell': 'rgb(var(--c-shell) / <alpha-value>)',
        'ruang-panel': 'rgb(var(--c-panel) / <alpha-value>)',
        'ruang-panel-2': 'rgb(var(--c-panel-2) / <alpha-value>)',
        'ruang-raised': 'rgb(var(--c-raised) / <alpha-value>)',
        'ruang-sunken': 'rgb(var(--c-sunken) / <alpha-value>)',
        'ruang-hover': 'rgb(var(--c-hover) / <alpha-value>)',
        'ruang-bubble': 'rgb(var(--c-bubble) / <alpha-value>)',
        'ruang-overlay': 'rgb(var(--c-overlay) / <alpha-value>)',

        // Hairlines and separators.
        'ruang-line': 'rgb(var(--c-line) / <alpha-value>)',
        'ruang-line-soft': 'rgb(var(--c-line-soft) / <alpha-value>)',
        'ruang-line-2': 'rgb(var(--c-line-2) / <alpha-value>)',
        'ruang-line-3': 'rgb(var(--c-line-3) / <alpha-value>)',

        // Text, brightest to faintest.
        'ruang-ink': 'rgb(var(--c-ink) / <alpha-value>)',
        'ruang-body': 'rgb(var(--c-body) / <alpha-value>)',
        'ruang-muted': 'rgb(var(--c-muted) / <alpha-value>)',
        'ruang-subtle': 'rgb(var(--c-subtle) / <alpha-value>)',
        'ruang-ghost': 'rgb(var(--c-ghost) / <alpha-value>)',
        'ruang-track': 'rgb(var(--c-track) / <alpha-value>)',

        // The brand accent. Fixed rather than user-selectable; only its two
        // theme variants exist, so `globals.css` resolves these off the
        // `theme-light` class and no JavaScript rewrites them.
        'ruang-accent': 'rgb(var(--c-accent) / <alpha-value>)',
        'ruang-accent-soft': 'rgb(var(--c-accent) / 0.08)',
        'ruang-accent-hover': 'rgb(var(--c-accent-hover) / <alpha-value>)',
        'ruang-accent-ink': 'rgb(var(--c-accent-ink) / <alpha-value>)',
        // Accent as readable *text*. Split from `ruang-accent` because a bright
        // lime chip is legible on a near-black page but unreadable on paper.
        'ruang-accent-text': 'rgb(var(--c-accent-text) / <alpha-value>)',

        'ruang-danger': 'rgb(var(--c-danger) / <alpha-value>)',
        'ruang-danger-hover': 'rgb(var(--c-danger-hover) / <alpha-value>)',
        'ruang-danger-ink': 'rgb(var(--c-danger-ink) / <alpha-value>)',
        'ruang-danger-fill-ink': 'rgb(var(--c-danger-fill-ink) / <alpha-value>)',
        'ruang-danger-surface': 'rgb(var(--c-danger-surface) / <alpha-value>)',

        // Amber: the middle of the severity ramp, for money that is running out
        // without having gone negative. Same fill/text split as the accent.
        'ruang-warn': 'rgb(var(--c-warn) / <alpha-value>)',
        'ruang-warn-text': 'rgb(var(--c-warn-text) / <alpha-value>)',

        // The five category colours. A per-budget label rather than an
        // appearance setting, so they stay literal instead of following the
        // accent token.
        'cat-blue': '#70c8ff',
        'cat-orange': '#ffad6b',
        'cat-violet': '#c1a0ff',
        'cat-pink': '#ff92bd',
      },
      fontFamily: {
        sans: ['var(--font-space)', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
    },
  },
  plugins: [],
};