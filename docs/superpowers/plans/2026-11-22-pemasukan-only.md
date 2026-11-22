# Pemasukan-only + audit fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hapus konsep gaji, jadikan `incomes` satu-satunya pencatatan uang masuk, dan tuntaskan semua temuan audit sebelumnya.

**Architecture:** Enam task dengan kepemilikan file yang saling lepas. Task 1 menetapkan antarmuka logika murni + API; Task 2–5 mengonsumsinya di UI, auth, SQL, dan komponen; Task 6 menyelaraskan docs. Integrasi dan verifikasi akhir dilakukan oleh orkestrator.

**Tech Stack:** Next.js 16.4.5, React 19, Better Auth 1.7.7, Postgres via `pg`, Supabase Storage, Tailwind 3 token, Node test runner.

**Spec:** `docs/superpowers/specs/2026-11-22-pemasukan-only-design.md`

## Global Constraints

- Tidak ada gaji: tanpa `salary_records`, `profiles.salary`, `saveSalary`, `validateSalary`, `fetchSalaryHistory`, atau teks "gaji" di UI/dokumen aktif (kecualiMigration lama bersejarah dan desain doc ini).
- Batas nominal seragam: `AMOUNT_MAX = 999_999_999_999` dari `src/lib/ledger-validation.js`; client mengimpor konstanta itu, bukan angka literal.
- Migration mengikuti bentuk deployed: `user_id text` → `public."user"`, RLS aktif tanpa policy; jangan pakai `auth.uid()` / `auth.users` di migration baru.
- Logika murni tetap bebas React/Next/.ts agar `node --test` bisa memuatnya.
- Warna: tidak ada hex baru di komponen; pakai token `ruang-*`. Spacing lintas kartu pakai `gap-card` / `mb-section` / `mt-section`.
- Semua penulisan profil lewat `updateProfile()`; semua data lewat `/api/ledger`.
- Migration **ditulis saja**, tidak dijalankan ke Supabase deployed oleh subagent.
- Jangan mengubah `package.json`, `package-lock.json`, atau `next-env.d.ts`.

## Review Focus

1. **Nominal tepat di batas** — `999_999_999_999` diterima, `1_000_000_000_000` ditolak oleh form **dan** API → test di Task 1.
2. **Bulan dengan pemasukan tanpa pengeluaran** — tetap muncul di riwayat dengan `spent = 0` → test di Task 1 & 2.
3. **Sesi dicabut lalu endpoint sensitif dipanggil** — harus memakai sesi otoritatif, bukan cookie cache → test di Task 3.
4. **Purge vs. login bersamaan** — akun yang flag-nya sudah dibatalkan tidak boleh terhapus → test di Task 3.
5. **Data lama setelah migration** — baris `salary_records` jadi income dengan sumber "Gaji", tidak ada yang hilang → test statik isi migration di Task 4.

---

### Task 1: Logika uang & API (`/api/ledger`)

**Files:**
- Modify: `src/lib/money.js`, `src/lib/charts.js`, `src/lib/ledger.js`, `src/lib/ledger-validation.js`, `src/app/api/ledger/route.js`
- Test: `tests/ledger.test.js`, `tests/charts.test.js`, `tests/income.test.js`, `tests/ledger-validation.test.js`
- Create: `tests/income-only.test.js` bila diperlukan

**Interfaces (produced — dipakai Task 2):**
- `getBudgetSummary(budgets = [], expenses = [])` → `{ spent, allocated, unspent, categories, overBudgetCount }`; `unspent = allocated - spent`; `categories` tetap `{ ...budget, spent, remaining, percent, over }`.
- `getCashflowSummary(incomes = [], budgets = [], expenses = [])` → `{ income, inflow, spent, remaining, savedPercent, allocated, categories, overBudgetCount }`; `remaining = inflow - spent`.
- `balanceLevel(remaining, inflow)` — tanda tangan sama, arti parameter kedua berganti inflow.
- `cashflowByMonth(incomes = [], expenses = [], month, count = 6)` → `{ key, label, inflow, outflow, net }` (tanpa `salary`/`extra`).
- `buildHistoryRows({ months, budgets, incomesByMonth })` → baris `{ key, income, inflow, spent, saved, savedPercent, incomeCount, categories }`; bulan qualify bila punya income **atau** expense.
- `fetchMonthlyBreakdown(months = 12)` → `{ budgets, months, incomesByMonth }`; `months` dari gabungan kunci income dan expense.
- `validateBudget({name, monthlyLimit}, {budgets, ignoreId})` — tanpa opsi `salary`; tidak ada pesan "melebihi gaji".
- `AMOUNT_MAX` diekspor dan dipakai keempat validator di `ledger.js`.
- `fetchLedger()` response: `{ profile, budgets, expenses, incomes }` — tanpa `salary`/`salaryRecords`.
- Hapus ekspor: `fetchSalaryHistory`, `fetchSalaryRecords`, `saveSalary`, `validateSalary`; hapus action API `fetchSalaryHistory`, `saveSalary`; hapus salary cap di `createBudget`/`updateBudget`.
- `updateProfile` server: bungkus update `profiles` + `"user".name` + `"user".image` dalam satu transaksi.
- `/api/ledger`: tolak request state-changing tanpa `Origin` kecuali `sec-fetch-site: same-origin`.

**Steps:**
- [ ] **Step 1**: Update `tests/ledger.test.js`, `tests/charts.test.js`, `tests/income.test.js`, `tests/ledger-validation.test.js` untuk antarmuka di atas, termasuk batas AMOUNT_MAX dan bulan tanpa pengeluaran. Jalankan `npm run test:logic` — expected FAIL.
- [ ] **Step 2**: Implementasikan perubahan di `money.js`, `charts.js`, `ledger.js`, `ledger-validation.js`.
- [ ] **Step 3**: Implementasikan perubahan `route.js` (action, cap, transaksi, origin check).
- [ ] **Step 4**: Jalankan `npm test` — expected PASS.
- [ ] **Step 5**: Laporkan daftar persis ekspor yang dihapus/berganti agar Task 2 bisa sinkron.

---

### Task 2: Halaman & copi bebas gaji

**Files:**
- Modify: `src/app/page.jsx`, `src/app/transactions/page.jsx`, `src/app/history/page.jsx`, `src/app/settings/page.jsx`, `src/app/welcome/page.jsx`, `src/app/welcome/help/page.jsx`, `src/app/help/page.jsx`, `src/app/about/page.jsx`, `src/app/opengraph-image.jsx`, `src/app/layout.jsx` (metadata saja; Task 5 menyentuh script di file yang sama — koordinasi: Task 2 hanya menyentuh blok metadata), `src/lib/data.js`, `src/components/DeleteAccountPanel.jsx`, `tests/render.test.jsx`, `tests/e2e-pages.mjs`

**Consumes:** semua antarmuka Task 1.

- [ ] **Step 1**: Sesuaikan `tests/render.test.jsx` dan `tests/e2e-pages.mjs` (ekspektasi `/settings` kini "Anggaran kategori" tanpa "Gaji per bulan"/"RIWAYAT GAJI") — expected FAIL.
- [ ] **Step 2**: Dashboard — `getCashflowSummary(incomes, budgets, expenses)`, `cashflowByMonth(incomes, expenses, month, 6)`; headline "dari pemasukan", empty state mengarah ke `/transactions` untuk menambah pemasukan; hapus semua copy gaji.
- [ ] **Step 3**: Transactions — stat "Pemasukan" menggantikan "Gaji"; hapus "(di luar gaji)" dan copy terkait; tetap satu CRUD untuk pemasukan.
- [ ] **Step 4**: History — hapus `fetchSalaryHistory` dari `loadHistory`; `buildHistoryRows(breakdown)`; empty state & catatan bawah bebas gaji; tampilkan jumlah pemasukan.
- [ ] **Step 5**: Settings — hapus seluruh panel gaji (state, picker bulan, `saveSalary`, `validateSalary`, impor terkait); sisakan CRUD kategori + tautan ke `/transactions` untuk pemasukan. Hapus `createClient` yang tidak dipakai.
- [ ] **Step 6**: Welcome/help/about/metadata/opengraph/`data.js`/DeleteAccountPanel — copi bebas gaji; sample data memakai pemasukan.
- [ ] **Step 7**: Jalankan `npm run test:render` — expected PASS.

---

### Task 3: Auth & keamanan

**Files:**
- Create: `src/lib/auth-session.js`
- Modify: `src/lib/auth.js`, `src/app/api/account/route.js`, `src/app/api/avatar/route.js`, `src/lib/account-purge.js`, `src/lib/account-deletion.js`, `src/app/api/cron/purge-deletions/route.js`, `tests/account-deletion.test.js`
- Create: `tests/auth-security.test.mjs` bila diperlukan

**Interfaces (produced):**
- `getAuthoritativeSession(headers)` dari `auth-session.js` — helper yang memanggil `auth.api.getSession({ headers, disableCookieCache: true })`.
- `reconcileOnSignIn` tetap diekspor dari `account-purge.js`; hook terdaftar di `session.create.before` **dan** `session.update.before`.

**Steps:**
- [ ] **Step 1**: Tulis test untuk (a) purge tidak menghapus akun yang flag-nya dibatalkan setelah select, (b) helper otoritatif dipakai di `/api/account` & `/api/avatar`. Expected FAIL.
- [ ] **Step 2**: `auth-session.js` + pakai di endpoint sensitif. `/api/ledger` tetap memakai cache (trade-off terdokumentasi).
- [ ] **Step 3**: `auth.js` — daftarkan `session.update.before`; aktifkan rate limit bawaan Better Auth untuk sign-in/sign-up/reset; pasang captcha juga untuk `/sign-in/social` bila kunci Turnstile ada; escape URL pada email reset.
- [ ] **Step 4**: `account-purge.js` — cek ulang `deletion_requested_at` + deadline di dalam transaksi sebelum delete; samakan waktu dengan `now()` Postgres; hapus DELETE `salary_records` (mewarisi perubahan Task 4). `account-deletion.js` — hapus `salary_records` dari daftar tabel.
- [ ] **Step 5**: `auth/callback/route.js` — hapus stub; pastikan tidak ada rute mati yang menjanjikan exchange kode.
- [ ] **Step 6**: Jalankan `npm test` — expected PASS.

---

### Task 4: Migration & schema

**Files:**
- Modify: `supabase/schema.sql`
- Create: `supabase/migrations/20261122_incomes_only.sql`
- Modify (komentar/utility lama sesuai kebutuhan): `supabase/migrations/20261016_incomes.sql`

- [ ] **Step 1**: Tulis migration: `INSERT INTO incomes (id, user_id, description, source, amount, received_on, created_at) SELECT gen_random_uuid(), user_id, 'Gaji', 'Gaji', amount, month, updated_at FROM salary_records WHERE amount > 0;` lalu `DROP TRIGGER` + `DROP FUNCTION validate_salary_month()` + `DROP TABLE salary_records` + `ALTER TABLE profiles DROP COLUMN IF EXISTS salary`; perbarui comment tabel `incomes`.
- [ ] **Step 2**: Perbaiki urutan hardening `search_path` (migration terbaru menang) dan tambahkan unique index nama budget yang hilang di deployed.
- [ ] **Step 3**: Tulis ulang `schema.sql` mengikuti bentuk deployed (text id → `public."user"`, trigger Better Auth, tanpa gaji, RLS tanpa policyPostgREST atau dengan policy yang benar-benar cocok untuk project baru). Pastikan project baru bisa boot.
- [ ] **Step 4**: Verifikasi statik: tidak ada `salary_records`/`profiles.salary` di `schema.sql`; migration valid SQL (tinjau urutan drop).

---

### Task 5: Komponen, a11y & theme polish

**Files:**
- Modify: `src/components/AppShell.jsx`, `src/components/Sidebar.jsx`, `src/components/form.jsx`, `src/app/layout.jsx` (blok skip-link & script), `src/app/globals.css`, `src/app/reset-password/page.jsx`, `src/app/settings/profile/page.jsx`, `src/lib/avatar.js`, `src/lib/theme-presets.js`, `src/app/icon.svg`, `tests/sidebar-collapse.test.mjs`, `tests/sidebar-scroll.test.mjs`, `tests/theme.test.jsx` (bags); `tailwind.config.cjs` hanya bila menghapus token mati
- **Konflik Task 2**: `layout.jsx` — Task 2 hanya metadata, Task 5 hanya script/skip-link.

- [ ] **Step 1**: Skip link — tambahkan `id="konten"` ke rute bare (`login`, `register`, `reset-password`, `error`, `global-error`, `loading`) atau render skip link hanya bila target ada; pilih yang paling sederhana. Test render.
- [ ] **Step 2**: Account menu — tambahkan `visibility:hidden`/`inert` saat tertutup + Escape-to-close; jangan merusak aturan sidebar yang sudah ada.
- [ ] **Step 3**: `tone="ghost"` → pakai `GhostButton`; `useSearchParams` di `reset-password` dibungkus `<Suspense>`.
- [ ] **Step 4**: Satukan konstanta tinggi mobile bar jadi satu token CSS/Tailwind; hapus duplikasi literal 56px.
- [ ] **Step 5**: Avatar URL — satu helper di `avatar.js`; `Sidebar.jsx` dan `settings/profile/page.jsx` memakainya; hapus literal URL.
- [ ] **Step 6**: Samakan ink favicon (`icon.svg` ↔ `FAVICON_GLYPH`); perbarui test yang sebelumnya hanya cek path. Bersihkan token/class mati bila aman.
- [ ] **Step 7**: Jalankan `npm test` — expected PASS.

---

### Task 6: Dokumentasi & e2e lama

**Files:**
- Modify: `AGENTS.md`, `README.md`, `docs/setup.md`, `tests/e2e-signup.mjs`
- **Jangan** mengubah `docs/superpowers/specs/*` dan `docs/superpowers/plans/*` (arsip bersejarah).

- [ ] **Step 1**: `AGENTS.md` — perbarui arsitektur, tabel, "salary per month", "zero salary", `saveSalary`, klaim `/auth/callback`, klaim hook refresh, klaim `schema.sql`, inventory client/server, accessor avatar, "hanya /help /about server", dan copy lain yang sudah tidak benar.
- [ ] **Step 2**: `README.md` + `docs/setup.md` — deskripsi produk, daftar tabel, alur pemasukan, setup.
- [ ] **Step 3**: `tests/e2e-signup.mjs` — hapus asersi `salary_records`; ganti dengan asersi tidak ada income otomatis.
- [ ] **Step 4**: Telusur sisa kata "gaji" di file aktif; pastikan hanya arsip/migration lama yang menyebutnya.

---

### Integrasi akhir (orkestrator)

- [ ] `npm test`, `npm run build`, `git diff --check`, `git status`.
- [ ] Cek konfigurasi Supabase & Vercel lewat MCP: env vars (`BETTER_AUTH_URL`, `CRON_SECRET`, Google OAuth, Turnstile), redirect URL, dan jadwal cron — laporkan yang perlu diubah (tanpa mengungkap nilai rahasia).
