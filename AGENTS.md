<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project

**ruang.** — personal finance app (Indonesian UI). Next.js 16 App Router · React 19 · Supabase (auth + Postgres) · Tailwind CSS 3.

## Commands

```bash
npm run dev          # dev server
npm run build        # production build
npm start            # run built output
npm test             # all tests (logic + render)
npm run test:logic   # ledger + safe-redirect only
npm run test:render  # JSX render tests only
```

E2E scripts (need network + credentials, not in `npm test`):
```bash
node tests/e2e-signup.mjs
node tests/e2e-pages.mjs http://localhost:3000 <email> <password>
```

## Next.js 16 breaking changes

- **`proxy.ts` replaces `middleware.ts`.** The file lives at `src/proxy.ts` (next to `app/`). It exports `proxy()` and a `config.matcher`. Do not create `middleware.ts` — it will be ignored.
- Pages are **client components** by default; only static pages (`/help`, `/about`) are server components.

## Architecture

```
src/
  proxy.ts             Middleware entry (session refresh + guest redirect)
  app/
    page.jsx           Dashboard (client)
    transactions/      CRUD + filter (client)
    history/           Monthly history (client)
    settings/          Salary + category CRUD
      profile/         Name, avatar, theme, password, delete account
      security/        Redirect to profile (password lives there now)
    welcome/           Guest landing with sample data
    login|register|reset-password/
    auth/callback/     OAuth/email code exchange
    oauth/consent/     OAuth consent screen
    help|about/        Static (server)
  api/
    account/           Account status, set password, schedule/cancel deletion
    avatar/            Avatar upload & delete
    cron/purge-deletions/  Destroys accounts past the 7-day grace period
    ledger/            Every ledger read/write
  components/
    form.jsx           Field / TextField / NumberField / SelectField / Button
    ui.jsx             Eyebrow / Panel / Loading / Error / Empty
    BrandMark.jsx      The brand glyph, painted in `currentColor`
    PasswordPanel.jsx  Password change/create, a panel on /settings/profile
    DeleteAccountPanel.jsx  Account deletion, a panel on /settings/profile
    idle-logout.jsx      Idle auto-logout, mounted on every route by AppShell
  lib/
    client.ts          Browser Supabase client
    server.ts          Server Supabase client
    auth.js            Better Auth instance (email/password + Google, bcrypt, Resend)
    auth-client.js     Browser Better Auth client (signIn, signUp, signInSocial)
    middleware.ts      updateSession() — called by proxy.ts
    ledger.js          All Postgres reads/writes + validation
    money.js           Rupiah format, dates, budget summary
    account.js         Account-level client calls
    account-deletion.js The 7-day grace period, as pure functions
    account-purge.js   Flag / cancel / destroy — server-side only
    safe-redirect.js   ?next= / redirect_uri validation
    idle-logout.js     Idle auto-logout: deadline, persistence, cross-tab (no React)
    category-colors.js Explicit color lookup table
    data.js            Sample data for guest page only
    theme.jsx          ThemeProvider + useTheme (client)
    theme-presets.js   Theme data + favicon glyph + the pre-paint script (no React)
    avatar.js          Avatar upload to the `avatars` storage bucket
  hooks/
    useLedgerData.js   Load/reload/error cycle + subscription
scripts/
  theme-codemod.mjs    One-off: hex literals -> theme tokens (idempotent)
  gen-icons.mjs        Rebuilds `apple-icon.png` from the favicon glyph
```

## Theming

- **Never write a hex colour in a component.** Every colour resolves through a
  token in `tailwind.config.cjs` (`ruang-*`), which reads a CSS variable defined
  in `src/app/globals.css`. The only literal hexes left are the five category
  colours, which are stored in the database as strings and looked up in
  `category-colors.js`.
- Adding a colour means: a `--c-*` variable in `:root`, a `.theme-light`
  override, and a matching Tailwind entry. The codemod maps old hexes to tokens
  if one is ever missed.
- **There are exactly three themes: `dark`, `light`, `system`.** Nothing writes a
  CSS variable at runtime — the whole palette is `:root` plus a `.theme-light`
  override, so `applyTheme` only toggles that one class (and the favicon). Do not
  reintroduce a per-user colour choice without an equivalent reason.
- **The theme lives in Postgres (`profiles.theme`) and is cached in
  localStorage.** The cache exists only so the page paints correctly before React
  hydrates; `PRE_HYDRATION_THEME_SCRIPT` in `theme-presets.js` is inlined in
  `<head>` to do that. Seeding the provider from a hardcoded `'dark'` instead of
  `readStoredTheme()` reintroduces a visible flash.
- `ruang-accent` is the fill; `ruang-accent-text` is the readable form of the
  same hue. They differ because a bright lime chip is legible on near-black and
  unreadable on paper. Text and borders use `-text`, fills use `-accent`.

## Layout rhythm

- **Two spacing tokens, defined in `tailwind.config.cjs`: `card` (16px) and
  `section` (32px).** `gap-card` / `mb-card` is the gutter between two adjacent
  cards; `mt-section` / `mb-section` is the vertical rhythm between card groups
  and between a page header and the content below it.
- **Never spell these as arbitrary values.** The same relationship used to be
  written `gap-[14px]`, `gap-[15px]`, `gap-[18px]`, `gap-[30px]`, `gap-[32px]`,
  `gap-[48px]`, `gap-[56px]`, `mb-[18px]`, `mb-[24px]`, `mb-[25px]`,
  `mb-[28px]`, `mb-[32px]`, `mb-[34px]`, `mt-[36px]`, `mt-[42px]` depending on
  the file — which is exactly why the pages read as unrelated to each other. A
  new page uses the tokens so a card gutter on `/settings` matches the one on
  `/transactions`.
- Header bottom margin is `mb-section` on every page. The one exception is
  `/welcome`, a bare marketing page outside the app chrome.
- Spacing *inside* a card (form field gaps, label-to-value, row padding) is
  still free — those are not the cross-page relationship.

## Sidebar

- **The desktop rail collapses via one attribute on `<html>`, not React state.**
  `data-sidebar="collapsed"` is all the CSS reads; `--sidebar-w` (238px → 68px)
  is what the rail *and* the page gutter in `AppShell` both size themselves
  from, so they cannot drift mid-animation. The token is `sidebar` in
  `tailwind.config.cjs` (`w-sidebar`, `lg:ml-sidebar`).
- **Every collapse rule lives in `globals.css` inside one `@media (min-width:
  1024px)` block, scoped to `.sidebar-desktop`.** Under `lg` the rail is not in
  the layout and the mobile drawer is, and the drawer renders the same `Brand`,
  `NavLinks` and `UserBlock` — so anything not scoped to `.sidebar-desktop`
  would hide the drawer's labels too. For the same reason a rule that has to
  *override* a utility (the nav row's `padding-left`, the account popover's
  `left`/`right`) lives in `@layer components`, which loses to utilities, and
  the utility is deleted from the JSX instead.
- **`PRE_HYDRATION_SIDEBAR_SCRIPT` in `src/lib/sidebar.js` runs in `<head>`**,
  for the same reason the theme has one: the choice is in localStorage, so
  without it a collapsed session paints wide and then narrows after hydration.
- **A transition reads its timing from the state being entered**, which is why
  the fast opacity value sits on the collapsed rule and the slow one on the
  open default: text clears out at once and comes back as the rail widens.
- **Only a collapsed rail is a hit area.** `cursor-col-resize` and the
  background click are both scoped to `[data-sidebar='collapsed']` in
  `globals.css` — the cursor in CSS, never as a `cursor-col-resize` utility on
  the `<aside>`, because a utility cannot see the state and would promise a
  resize on an open rail that ignores clicks. An open rail collapses from the
  toggle button alone: clicking the empty space beside a full-size sidebar is
  aimed at nothing, and shrinking the navigation out from under the user is a
  worse guess than ignoring it. `isRailToggleClick()` in `src/lib/sidebar.js`
  holds both halves of the rule — collapsed, and not a link, a button or the
  account popover. The cursor is inherited, so the nav links, the brand and the
  toggle re-assert `cursor-pointer` and `.account-menu` takes it back with
  `cursor: auto`.

## Database

- **`supabase/schema.sql`** is the source of truth for new projects. **`supabase/migrations/`** has incremental changes for existing projects.
- Tables: `profiles`, `budgets`, `expenses`, `salary_records` — all with RLS, ownership-based policies. No table is open to `anon`.
- **Salary is per-month** in `salary_records` (keyed by `(user_id, month)`). `profiles.salary` mirrors the current month only.
- **`profiles` carries identity and appearance**: `name`, `avatar_path`, `theme`.
  `avatar_path` is a storage object path, not a URL — derive the URL with
  `avatar.js`. `accent` was dropped in `20261013`.
- **Trigger `on_auth_user_created`** creates the profile (with the display name
  from `raw_user_meta_data.full_name`) and nothing else.
- **Trigger `on_better_user_created`** (on Better Auth's `"user"` table) does the
  same for accounts created through Better Auth, including Google sign-ups.
- **A signup seeds no budget categories.** `20261009` removed the starter rows,
  `20261011` put them back inside the function it rewrote for `profiles.name`,
  and a second hand-made trigger seeded the same five rows for every Better Auth
  signup. `20261014` strips both functions back to a profile insert and records
  the Better Auth trigger in a migration so it stops being dashboard folklore.
  Do not re-add a template: a new account lands on the empty states in
  `/settings` and on the dashboard, and names its own categories. Both trigger
  functions use `on conflict (id) do nothing` for the same reason — a duplicate
  profile must not abort the signup.
- **On the deployed project `profiles.id` references `public."user"(id)`,** not
  `auth.users(id)` as `schema.sql` still says. `on_auth_user_created` therefore
  cannot fire there — Better Auth never writes `auth.users` — so it is legacy on
  that project and the Better Auth trigger is the live one.
- **Avatars** live in a public `avatars` storage bucket. Writes are keyed to the
  folder name (`<user_id>/…`), so a user cannot post to somebody else's path.
- **`profiles.deletion_requested_at` is a pending flag, not a tombstone.**
  "Hapus akun" only stamps it and revokes every session; signing in again inside
  the grace period clears it. The purge reads it, then deletes `expenses`,
  `budgets`, `salary_records`, `profiles` and `public."user"` — written out one
  by one rather than left to the cascade, because `schema.sql` points `user_id`
  at `auth.users` while the deployed project points it at `public."user"`.
  **The sweep runs from `/api/cron/purge-deletions`, not from SQL**, because
  Supabase blocks `DELETE` on `storage.objects` precisely to stop files being
  orphaned — a SQL purge would strand every deleted user's avatar in a public
  bucket forever. It is scheduled by `vercel.json` and authenticated with
  `CRON_SECRET`; unset, the route refuses every call and nothing is ever
  actually destroyed.
- **Category deletion cascades to transactions** (schema-level `ON DELETE CASCADE`).
- Zero salary = "not set" — no history row created.

## Manual Supabase Dashboard setup (not in migrations)

1. **Redirect URLs** — add `http://localhost:3000/auth/callback`, `http://localhost:3000/reset-password`, and production equivalents. Without these, email verification and password reset 404.
2. **Email confirm is disabled** (`mailer_autoconfirm: true`). Signup returns a session immediately. Do not remove the `setNotice` branch in `AuthForm.jsx` for `null` session — it's a safety net.
3. **Leaked Password Protection** — enable under Authentication → Policies → Password.

## Environment

Copy `.env.example` to `.env.local`. Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — never put `service_role` in a `NEXT_PUBLIC_` variable.

### Google OAuth

Google sign-in is opt-in: set both `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`. With neither set the provider is never registered, so the button renders but the flow is unavailable; set one without the other and `auth.js` throws at boot rather than 500ing on click.

**One client serves both environments.** `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` are environment-independent — the same credentials appear in `.env` and `.env.local` on purpose, because the OAuth client has both redirect URIs registered:

```
http://localhost:3000/api/auth/callback/google
https://ruang-cashflow.vercel.app/api/auth/callback/google
```

**`BETTER_AUTH_URL` is the one value that cannot be shared.** It determines the `redirect_uri` sent to Google, and Google matches it exactly — no prefix matching, no scheme tolerance, no path wildcards. Left at `localhost:3000`, production fails with `redirect_uri_mismatch`. It is therefore deliberately absent from `.env`; Vercel sets it from Project Settings → Environment Variables, where it must be `https://ruang-cashflow.vercel.app` for Production.

`NEXT_PUBLIC_BETTER_AUTH_URL` mirrors it and is **frozen at build time**, so a wrong value needs a redeploy, not a restart.

### Secrets in git

`.gitignore` excludes `.env`, `.env.local`, and `client_secret_*.json`. **A `.gitignore` does not untrack a file that is already tracked** — `git ls-files` will still list `.env` and `.env.local`, and `git add -A` will keep committing them until `git rm --cached` runs. Check `git ls-files` before assuming a secret is out of the repo.

Rotating a Google client secret: Cloud Console → Credentials → edit → reset, then update `AUTH_GOOGLE_SECRET` in `.env`, `.env.local`, and Vercel.

## Implementation gotchas

- **`bg-${color}` never works.** Tailwind can't see dynamic class names. Category colors are plain strings (`'lime'`) in Postgres — always map through `category-colors.js`.
- **`profiles` writes go through `updateProfile()` in `ledger.js`.** The settings page used to call `supabase.from('profiles')` directly and discarded the returned error, so a failed save reported success. `salary` is deliberately not in its writable set — `saveSalary()` owns that column.
- **Dates are local-time.** `new Date('2026-10-07')` parses as UTC midnight, which is the previous day west of Greenwich. Every date goes through `toDate()` and formats from local components.
- **Money inputs use `type="text"`.** Number inputs silently discard invalid input (e.g. pasted "12.500"), giving no feedback. Text lets validation catch it.
- **Integer amounts only.** Postgres `numeric` columns accept decimals, but forms enforce digits-only. No decimals in personal budgeting. `validateExpense` therefore rejects a real decimal like `12.75` rather than rounding it into `1275`.
- **The Better Auth client takes no `baseURL`.** `getBaseURL` returns the configured value verbatim and never compares it to the current origin, so pinning it to `NEXT_PUBLIC_BETTER_AUTH_URL` makes every call absolute. That still answers 200 on localhost, which hides the bug, but `context.data.url` does not survive a cross-origin response, so the redirect plugin never fires and the Google button hangs on its busy label forever. Omitting `baseURL` falls back to `window.location.origin` — same-origin everywhere, and nothing to set per deploy. `NEXT_PUBLIC_BETTER_AUTH_URL` is now only read by the server instance.
- **Every `authClient` call resolves to `{ data, error }`.** Better-fetch is created without `throw: true`, so a 4xx/5xx does not reject — it comes back as `error` and the payload sits under `data`. Destructuring `url` off the top level of `signIn.social(...)` always yields `undefined`, which threw `no authorization url` and reported every click as "Tidak bisa terhubung ke Google" while the server had in fact answered with a Google URL.
- **`handleGoogle` navigates explicitly.** It reads `data.url` off the `signInSocial` result and assigns `window.location.href` rather than trusting better-auth's built-in redirect, and treats a missing URL as a failure so the button can never stick on "Menghubungkan ke Google...". The catch logs the real cause to the console while the visitor keeps the friendly copy — never surface Better Auth's own error code in the UI.
- **`?next=` is relative-only.** Login and `/auth/callback` reject `//` or absolute URLs to prevent open redirects. `AuthForm` applies the same check to the Google `callbackURL`, so adding a social provider must not bypass it.
- **Google account linking is on, scoped to Google.** Someone who registered with a password and later signs in with the same address gets the existing account rather than a duplicate-email rejection. `allowDifferentEmails` stays `false` and `trustedProviders` is `['google']` — widening either is an account-takeover surface, not a feature.
- **The brand glyph lives in one constant, `FAVICON_GLYPH` in `theme-presets.js`.** It reaches the tab through `faviconSvg()` and the pre-paint script, the sidebar and welcome chips through `components/BrandMark.jsx`, and `apple-icon.png` through `scripts/gen-icons.mjs`. Redrawing the logo means editing that constant, updating `src/app/icon.svg` to match, then running `node scripts/gen-icons.mjs` — the script refuses to run if the two disagree. It is a solid silhouette with no inner counter on purpose: at 16px a counter closes into a blob.
- **Signing in is the restore gesture for a pending account deletion.**
  `databaseHooks.session.create.before` in `auth.js` runs on every sign-in —
  password, Google, or a refreshed session — and calls `reconcileOnSignIn`,
  which clears `deletion_requested_at` or, past the deadline, destroys the
  account and returns `false` so no session is created. Do not add a "cancel"
  button elsewhere: the sessions are revoked on request, so there is no page
  left to put it on. The hook **fails open** — a failed sweep query must never
  lock every user out of signing in.
- **The render tests cannot load `.ts` files or `next/navigation`.**
  `tests/jsx-hooks.mjs` resolves `.js`/`.jsx` only, so a component imported by
  `tests/render.test.jsx` must not reach `src/lib/client.ts` transitively, and
  must navigate with `window.location` rather than the router if it is to stay
  testable. `DeleteAccountPanel` is a rendered component for that reason.
  Keep presentational components behind injected props.
- **Idle auto-logout lives in the app shell, not the sidebar.**
  `AppShell` mounts `<IdleLogout />` on **both** branches — the bare routes
  included, because a session left open on `/login` is exactly the one that
  needs guarding, and because auto-logout is an auth behaviour while the rail is
  furniture. The timing rules are plain functions in `src/lib/idle-logout.js`
  with no React, no Next and no `.ts`, which is what makes them testable at all:
  a version living inside `Sidebar.jsx` was unreachable from the suite, because
  anything importing `next/navigation` cannot be loaded by `tests/jsx-hooks.mjs`.
  Drive them against a stubbed `window`/`document` with an injected clock, as
  `tests/idle-logout.test.mjs` does — never wait out a real fifteen minutes.
- **The idle deadline is absolute, persisted, and never quietly renewed.**
  Three rules, each the fix for a way the obvious version fails. The deadline is
  absolute: every timer is scheduled for the *remaining* wall-clock time and
  re-checked against the clock, because a backgrounded tab has its timers
  throttled and a `pagehide`-into-bfcache tab has them frozen — "the timer has
  not fired" is not evidence the session is live. It is persisted: the last
  activity goes to `localStorage`, so closing the tab buys no extra time and
  coming back an hour later starts already expired. And returning to a tab is
  **not** activity: `visibilitychange` and `pageshow` re-check, they do not
  extend, or a tab hidden all afternoon would always return to a full window and
  the feature would be unreachable in practice.
- **A click after a stalled deadline is activity, not a lockout.** `extend()` is
  the one path that refuses to sign out on an elapsed reading — a user coming
  back and clicking is stronger evidence of presence than a throttled timer. The
  version this replaced logged them out on exactly that click.
- **Tabs sync through the `storage` event, not `BroadcastChannel`.** Same
  mechanism `ThemeProvider` already uses; it fires in every other tab of the
  origin and *only* there. A receiving tab must **adopt the value verbatim, never
  re-stamp with `now()`** — writing a fresh timestamp back would have the two
  tabs trade an ever-rising value until the browser gave up. A removal means
  another tab signed out, and because Better Auth revokes a cookie every tab
  shares, this one follows; only a tab that genuinely went idle passes
  `?idle=1`, since that query is a claim about *why*.
- **The idle window is `NEXT_PUBLIC_IDLE_TIMEOUT_MS`, default 15 minutes.**
  Overridable for one reason: a guard that fires once every fifteen minutes is
  close to untestable on a deployed environment, where you cannot shorten the
  clock from a console. Set it to `20000` in Vercel to verify the whole path in
  twenty seconds. Anything under 1000 is ignored rather than honoured, because a
  guard that fires between two keystrokes is worse than none.
  **`IdleLogout` logs `[idle] armed …` on arm and `[idle] gagal memuat sesi …`
  on a failed session lookup** — an absent guard is otherwise indistinguishable
  from a working one until the whole window has elapsed.
- **A session lookup that rejects must not be swallowed.** `IdleLogout` arms the
  controller from a bare `.then`; when that was the whole chain, a rejected
  `getSession()` left the guard simply missing, silently, forever.
- **`session.cookieCache` is on, and `maxAge` is the security budget.** Better
  Auth serves the session from a signed cookie instead of a Postgres lookup. A
  cold dashboard used to read the same session row six times — once in
  `proxy.ts` on every request, four times from components that each called
  `getSession()` on mount, and once more inside `/api/ledger`. The cost was
  worst cold: `db.js` drops idle connections after 10s, so each of those also
  paid a fresh TLS handshake. **A revoked session stays readable for up to
  `maxAge`** — an idle auto-logout in another tab, or a purge that ran the grace
  period out, is not seen until it expires. Five minutes is the deliberate
  number: invisible to a person, short enough not to be a way to keep using a
  dead session. `signOut` deletes the cookie itself, so the app's own logout
  never waits it out. Raise it only with a reason, and never past `updateAge`.
- **Client code never calls `getSession()` directly — it calls
  `getSharedSession()`.** Every authenticated page mounts `ThemeProvider`,
  `SidebarWithSession` and `IdleLogout` at once, all asking the same question;
  `getSharedSession` in `auth-client.js` collapses them into one request. It is
  a de-duplicator, not a cache: the in-flight promise is dropped the moment it
  settles, so nothing is ever served stale.
- **`useLedgerData` does not check the session before loading.** It used to
  `await getSession()` and only then fetch, which made a cold dashboard three
  sequential server calls — `proxy`, `/api/auth/get-session`, `/api/ledger` —
  before a single row appeared. `/api/ledger` already answers `401 'Sesi tidak
  ditemukan. Silakan masuk kembali.'`, and `callLedger` turns that into a
  `DataError` with the same string, so the pages' `<ErrorState message={error} />`
  is byte-identical either way. Do not reintroduce a pre-flight session check;
  it cannot make the failure case any better and it always costs a round trip.
- **No pagination** on transactions — the list grows with usage.
