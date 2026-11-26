# Visual parity audit — `ruang.` web ↔ native (2026-11-25)

## Evidence boundary — read this first

**No screenshots were taken, and none were generated.** This worktree has no
Metro server, emulator, simulator, or installed native surface, so the
brief's Step 1 (paired web/native screenshots in `mobile/docs/visual-parity/`)
**could not be run**. Nothing in this file claims a rendered or pixel-level
comparison. The audit below is a careful **source-level** read of each native
screen against its web counterpart: colour tokens, font families and sizes,
letter spacing, radius, card/section spacing, copy, icons and chart colours.

Automated gates that *were* run, after the fixes: `cd mobile && npm test`,
`npx expo export --platform ios --platform android`, root `npm test`, and the
web build via `npx next build --webpack` (see Verification below).

## What was compared (source level)

| Native | Web counterpart | Compared | State |
| --- | --- | --- | --- |
| `src/screens/Dashboard.jsx` | `src/app/page.jsx` | Header copy/title tracking, card order, panel padding/radius, donut + spend + cashflow colours (`fill`, `accent`, `muted`, `danger`), `card`/`section` rhythm | Aligned; scroll container added (web page scrolls, native was a non-scrolling `View`) |
| `src/screens/Transactions.jsx`, `src/components/TransactionForm.jsx` | `src/app/transactions/page.jsx` | Titles, summary stats, filters, income/expense form copy, chips, icons, field radius/colours | Aligned at source level; on-device interaction still unverified |
| `src/screens/History.jsx` | `src/app/history/page.jsx` | Header tracking, chart heading, month labels, summary/row colours, empty states, row meta copy | Aligned; h1/h2 tracking and the row's transaction-count copy corrected (fix round 2) |
| `src/screens/Settings.jsx` | `src/app/settings/page.jsx` | Category form, six swatches and chip colours, 44px hit areas, link rows, header→panel gap, a11y labels | Aligned; gap and swatch label corrected |
| `src/screens/Profile.jsx`, `PasswordPanel.jsx`, `DeleteAccountPanel.jsx` | `src/app/settings/profile/page.jsx` + matching components | Identity/appearance/password/deletion copy, h2 size, theme swatches, password field hints | Aligned; theme comparison, h2 scale, minLength and unused import fixed |
| `src/screens/AuthScreen.jsx`, `TurnstileWidget.jsx` | `src/components/AuthForm.jsx` | Title scale, Google mark (four brand colours + paths), divider, field copy, warn notice tint/radius, captcha gate | Aligned; title size and `warn/10` + `warn/40` tint corrected |
| `src/screens/ResetPassword.jsx` | `src/app/reset-password/page.jsx` | Deep-link token mode (already fixed in Task 14), title scale/italic accent, copy | Aligned; title size and italic `<em>` treatment corrected |
| `src/screens/Welcome.jsx` | `src/app/welcome/page.jsx` | Brand glyph, hero, sample card, section headings, category/row colours, sample data | Aligned; hero/section/sample type scale and square sample-card corners corrected |
| `src/screens/StaticInfo.jsx` | `src/app/help/page.jsx`, `src/app/about/page.jsx`, `src/app/welcome/help/page.jsx` | FAQ groups, principles, back/nav copy, title scale | Aligned; page title scale corrected |
| `src/screens/OAuthConsent.jsx` | `src/app/oauth/consent/page.jsx` | Heading, scope rows, buttons, accent colour | Aligned; title scale and italic accent corrected |
| `src/components/AppShell.jsx`, `AccountMenu.jsx`, tabs layout | `src/components/AppShell.jsx`, `Sidebar.jsx` | Background, page gutters, mobile bar height (56px), active nav colours, tab copy | Tab title now `Transaksi` (was the brief's English `Transactions`); chrome differences below are intentional |
| `src/theme/tokens.js`, `components/ui.jsx`, `components/form.jsx`, `components/charts.jsx`, `src/theme/solar-paths.js` | `tailwind.config.cjs`, `src/app/globals.css`, web components | All 28 palette values in both themes, `card` 16 / `section` 32 / bar 56, radius steps, Space Grotesk + DM Mono weights, icon paths, chart fills | Aligned at source level; `withAlpha()` added so CSS-style `warn/10` needs no new opaque colour token |

## Fixes made in this pass

1. **Tab title** — `app/(app)/_layout.jsx`: `Transactions` → `Transaksi`, matching the web nav copy and the Indonesian UI.
2. **Profile theme sync** — `saved !== theme` compared a string to the context object, so it re-persisted the same value on every load. Now `saved !== theme.theme`.
3. **Profile unused import** — removed `Eyebrow` from `Profile.jsx`.
4. **Avatar picker** — `buildAvatarForm()` no longer rejects an asset whose `fileSize` is unknown (common on iOS). A reported oversize is still rejected locally; the server enforces the 2 MB limit on the real multipart bytes either way.
5. **Password fields** — all five native password inputs now carry `minLength={8}`, mirroring the web `TextField`s. Native `submit()` already had the 8-character check; this closes the markup-level gap.
6. **Settings swatch a11y** — `accessibilityLabel={`Warna ${color}`}` → `accessibilityLabel={color}`, matching the web radio's bare colour token; the group still supplies "Warna kategori".
7. **Header rhythm** — `Settings.jsx` and `Profile.jsx` put `gap: 16` on the ScrollView content container *and* `marginBottom: 32` on the header, making the header→first-card gap 48px. The gutter now lives on a `cardStack` wrapper; the header keeps its 32px bottom margin.
8. **Captcha/auth notice** — native used a neutral `sunken` fill with a solid warn border; the web uses `border-ruang-warn/40 bg-ruang-warn/10 rounded-[4px]`. Added `withAlpha(hex, alpha)` to `tokens.js` (an `rgba()` of the existing token, not a new colour) and used it for both border and fill, with radius 4px.
9. **Type scale** — h1 tracking on Settings/Profile/History `-0.05` → `-0.065`; h2 tracking on Settings/History `-0.03` → `-0.04`; Profile/Password/Delete h2 `20px/-0.03` → `17px/-0.025` (web `text-[17px] tracking-tight`); Auth title `42/48` → `39/43`, welcome hero `40/46` → `38/42`; welcome/sample headings now 26px for features, 20px for the two examples, sample figure 32px; reset title `34/40` → `30/34`; consent title `40/46` → `34/38`; Help/About title `40/46` → `36/40`.
10. **Italic accents** — the ResetPassword and OAuthConsent accent words now carry `fontStyle: 'italic'` and weight 400, matching the web `<em className="font-normal italic …">`.
11. **Welcome sample card** — removed the 3px radius the web card does not have.
12. **Dashboard scrolling** — the dashboard content was a `View`, so charts and the recent/category panels below the fold were unreachable. It is now a `ScrollView` with the same 48px bottom breathing room as the other data screens.

No new palette entry was introduced; every colour still resolves through a
token or an alpha of one.

## Still requires a real-device screenshot pass (dark **and** light)

When a native surface becomes available, do the brief's Step 1 properly: use
the **Orca CLI** for the interactive/visual work — Orca browser at a phone
viewport for the web side, the simulator/device surface for the native side —
and save the paired screenshots under `mobile/docs/visual-parity/`. Then walk
each row of the table above and check the rendered result, not just the source.
Nothing in that directory exists yet.

Suggested order (both themes for every screen):

1. Login + register (captcha notice tint, Google button, password eye).
2. Welcome → welcome/help → help → about (hero, FAQ disclosure, italic accents).
3. Dashboard (donut, spend toggle, cashflow rows, below-the-fold scroll).
4. Transactions + new/edit form and filter sheet (stacked modals, date picker).
5. History (empty and populated months, including the month row's count copy — it must show only "transaksi" with no number, as on the web).
6. Settings (swatch hit areas, header gap, archived category copy).
7. Profile (theme swatches, avatar picker with/without `fileSize`, password sheet, deletion state).
8. Reset-password in both request and `?token=` modes, and OAuth consent.

Platform differences that are **deliberate**, not defects to "fix" in a
screenshot diff: native tab bar vs web sidebar/mobile bar, OS safe areas and
status bar, page sheets/dialogs vs HTML `<dialog>`, and the idle notice being
inline on native instead of the web's transient toast.

Other deferred items to confirm on device (from earlier tasks, unchanged here):
no success toast after delete/archive, grouped-amount caret jump, stacked
Modal behaviour, Turnstile reset after a failed attempt, FAQ taps, deep links.

## Explicit review decisions (fix round 1)

Three findings from the first review were checked against source and resolved
as follows. They are recorded here so the next reader does not re-open them.

1. **Panel heading sizes are already split — no code change needed.**
   `PasswordPanel.jsx` and `DeleteAccountPanel.jsx` each have two separate
   styles: `h2` (collapsed card heading: 17px, `letterSpacing: -0.025`, the
   native spelling of web `tracking-tight`) and `sheetTitle` (expanded form
   heading: 20px, `letterSpacing: -0.03`). Only the collapsed JSX uses
   `s.h2`; the sheet JSX uses `s.sheetTitle`. This matches the web pairs at
   `PasswordPanel.jsx:149/:193` and `DeleteAccountPanel.jsx:128/:175`.
   `tests/profile-exports.test.mjs` now pins both styles and both usages.
2. **History count copy — corrected in fix round 2 (below).** The earlier
   claim that both sides render the same blank was wrong: the native screen
   feeds on `buildHistoryData()`, which attaches a real `count`, while the web
   feeds on `buildHistoryRows()`, which does not. The rendered outputs differed
   and have now been matched. See fix round 2 for the resolution; this item is
   back on the device checklist.
3. **`cardStack` closing tags were already reindented** in the commit that
   introduced the wrappers; a follow-up check found no child line in either
   wrapper with less than eight spaces of indentation.

`minLength={8}` remains on the native password fields as a mirror of the web
markup; a comment in `PasswordPanel.jsx` points out that React Native's
`TextInput` ignores it and that `submit()` owns the real 8-character check.

## Fix round 2 — History count copy (actual mismatch, fixed)

The fix-round-1 decision above was a false parity claim. Source trace:

- native `src/screens/History.jsx` feeds on `buildHistoryData(data)`;
- `src/shared/history.js` `buildHistoryData()` explicitly maps each row and
  attaches `count` from the expense buckets (`count: toPositive(...)`);
- web `src/app/history/page.jsx` feeds on `buildHistoryRows(data)` from
  `src/lib/ledger.js`, whose rows have **no** `count` field;
- so native rendered a real number in `{row.count} transaksi` while the web
  rendered that same template with an undefined count — only the word
  "transaksi", no number.

Resolution, per the controller ruling ("tampilan frontendnya harus sama seperti
yang website"): the native **screen** no longer prints `row.count`. Its month
row renders just `transaksi`, matching the web's rendered text. The pure
`buildHistoryData()` adapter keeps its `count` field (it is data-shape parity
with the buckets and other consumers/tests may rely on it); only the render is
changed. `tests/history-exports.test.mjs` pins both halves: the adapter still
attaches `count`, and the screen does not interpolate it. The misleading
fix-round-1 comment on the row was replaced, and this item is back in the
dark+light device checklist above.

## Verification

```text
cd mobile && npm test                            303/303 pass
mobile npx expo export --platform ios --platform android   (both bundles exported)
root   npm test                                  327/327 pass
root   npx next build --webpack                  success
root   git diff --check                          clean
```

`npm run build` (the repo's Turbopack script) fails in this worktree because
its `node_modules` is a symlink outside the workspace root. This is an
environmental limitation already recorded in the SDD ledger; the webpack
build is the local gate, and Vercel preview remains the authoritative web
build check.

## Release handoff (not changed by this pass)

- Latest preview deployment: `ruang-cashflow-odffo63u7-irgi-s-projects.vercel.app`,
  commit `333e2fe`, state **READY**. Every commit after it on `native-app` is
  mobile-only, so the deployed web API/server bridge is still current.
- Still needed from the user for a native release: the release (upload) key
  SHA-1 registered in Google Cloud, and the iOS bundle ID registered for the
  Google OAuth client; the debug SHA-1 is already on file. `BETTER_AUTH_URL`
  must be `https://ruang-cashflow.vercel.app` in Vercel Production, with the
  matching `NEXT_PUBLIC_BETTER_AUTH_URL` baked at build time.
- Order: finish the dark+light screenshot pass, then re-verify preview on the
  final `native-app` head, then promote that preview to Production. Do not
  promote before the preview verification.
