# ruang.

Rencana keuangan pribadi: catat pemasukan dan pengeluaran, susun anggaran per
kategori, lalu pantau sisa uangnya.

**Next.js 16 (App Router) · React 19 · Better Auth · Supabase (Postgres) · Tailwind CSS 3**

---

## Fitur

- **Ringkasan** — sisa uang (pemasukan dikurangi pengeluaran), pengeluaran per
  kategori, grafik.
- **Transaksi** — tambah, ubah, hapus, filter pemasukan dan pengeluaran per bulan
  dan kategori.
- **Riwayat** — 12 bulan terakhir dari data nyata, bukan data contoh; sebuah bulan
  muncul bila ada pemasukan atau pengeluaran.
- **Pemasukan** — satu pencatatan di `incomes`: deskripsi, sumber opsional berupa
  teks bebas, nominal, dan tanggal. Tidak ada angka tetap bulanan yang jadi
  acuan anggaran.
- **Kategori** — amplop anggaran dibuat sendiri oleh pengguna; **akun baru tidak
  memakai template**.
- **Profil** — nama, avatar (Supabase Storage), tema (`dark` / `light` / `system`).
- **Masuk dengan Google** — opsional, aktif hanya bila `AUTH_GOOGLE_ID` **dan**
  `AUTH_GOOGLE_SECRET` sama-sama diisi.
- **Auto-logout idle** — 1 jam tanpa aktivitas, bisa diganti lewat env.
- **Hapus akun dengan masa tunggu 7 hari** — masuk lagi adalah cara membatalkannya.

## Menjalankan

```bash
npm install
cp .env.example .env.local   # isi nilainya, lihat bagian Environment
npm run dev
```

Buka `http://localhost:3000`. `/welcome` bisa dilihat tanpa akun — isinya memakai
data contoh, tidak menyentuh database.

## Environment

Salin `.env.example` ke `.env.local` lalu isi dari Supabase Dashboard
(Project Settings → API / Database / Auth).

| Variabel | Wajib | Keterangan |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | ya | URL project |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ya | Kunci publishable (anon) |
| `DATABASE_URL` | ya | Koneksi Postgres; **pakai port 6543** (transaction pooler), bukan `db.<ref>.supabase.co` yang IPv6-only, dan bukan 5432 yang Worldwide-nya terbatas 15 sesi |
| `BETTER_AUTH_SECRET` | ya | Minimal 32 karakter (`openssl rand -base64 32`) |
| `BETTER_AUTH_URL` | ya | URL aplikasi. **Tidak bisa dipakai bersama** antar environment |
| `NEXT_PUBLIC_BETTER_AUTH_URL` | ya | Cerminan `BETTER_AUTH_URL`, **di-freeze saat build** |
| `SUPABASE_SERVICE_ROLE_KEY` | ya | Server-side saja. Tidak boleh berawalan `NEXT_PUBLIC_` |
| `RESEND_API_KEY` | ya | Email verifikasi & pemulihan kata sandi |
| `EMAIL_FROM` | ya | Pengirim, mis. `Ruang <onboarding@resend.dev>` |
| `CRON_SECRET` | ya | Bearer token `/api/cron/purge-deletions`. Tanpa ini route menolak semua panggilan dan akun yang ditandai tidak pernah benar-benar dihapus |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | tidak | Keduanya harus ada atau keduanya tidak ada; pasang salah satu bikin `auth.js` gagal saat boot |
| `NEXT_PUBLIC_IDLE_TIMEOUT_MS` | tidak | Default `3600000` (1 jam). Di bawah `1000` diabaikan |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | tidak | Cloudflare Turnstile; kalau diisi, login & daftar wajib lewat captcha |

> Hanya `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` yang
> boleh ada di `.env.example` secara default. Apapun berawalan `NEXT_PUBLIC_`
> dikirim ke browser — `service_role` di sana berarti seluruh database terbuka.

## Database

`supabase/schema.sql` adalah sumber kebenaran untuk project baru dan mengikuti
bentuk yang dipakai di production: user Better Auth di `public."user"` dengan id
berupa teks. Terapkan lewat SQL Editor, atau dengan CLI:

```bash
supabase link --project-ref <ref>
supabase db push        # project yang sudah punya migration
```

Tabel: `profiles`, `budgets`, `expenses`, `incomes` — semuanya memakai RLS. Di
project yang sudah dideploy RLS aktif tanpa policy, jadi tabel tidak bisa dibaca
lewat PostgREST dengan publishable key; `schema.sql` memuat policy berbasis
kepemilikan untuk project baru. Tidak ada tabel yang terbuka untuk `anon`.

Perubahan inkremental untuk project yang sudah berjalan ada di
`supabase/migrations/`. Migration `20261122_incomes_only.sql` mengubah baris
`salary_records` lama menjadi baris `incomes` (deskripsi dan sumber "Gaji") lebih
dulu, lalu menghapus tabel `salary_records` dan kolom `profiles.salary`. Migration
ini hanya ditulis — menjalankannya ke project deployed adalah keputusan terpisah.

User Better Auth tidak pernah menulis ke `auth.users`, jadi trigger
`on_auth_user_created` tidak aktif; yang dipakai adalah `on_better_user_created`.

### Langkah manual di Supabase Dashboard

Bagian ini tidak bisa diaplikasi lewat migration, jadi harus disetel manual:

1. **Redirect URLs** (Authentication → URL Configuration) — tambahkan
   `http://localhost:3000/api/auth/callback/google`,
   `http://localhost:3000/reset-password`, dan padanannya di production. Rute
   `/auth/callback` hanya stub yang mengalihkan bookmark lama ke `/login` dengan
   pesan error; pertukaran kode sungguhan dilakukan Better Auth di
   `/api/auth/callback/google`. Konfirmasi email dan *Leaked Password Protection*
   adalah pengaturan Supabase Auth lama; Better Auth yang mengatur masuk dan kata
   sandi di sini, jadi dua toggle itu tidak berpengaruh.
2. **`BETTER_AUTH_URL` di Vercel** harus `https://ruang-cashflow.vercel.app` untuk
   Production. Nilai ini menentukan `redirect_uri` yang dikirim ke Google dan
   dicocokkan persis — kalau tertinggal di `localhost:3000`, production gagal dengan
   `redirect_uri_mismatch`.

## Arsitektur

```
src/
  proxy.ts             Titik masuk middleware (Next.js 16: proxy, bukan middleware)
  app/
    page.jsx           Ringkasan (dashboard)
    transactions/      CRUD + filter pengeluaran dan pemasukan
    history/           Riwayat bulanan
    settings/          CRUD kategori (pemasukan dicatat di /transactions)
      profile/         Nama, avatar, tema, kata sandi, hapus akun
      security/        Redirect ke /settings/profile
    welcome/           Landing tamu dengan data contoh (server component)
    login|register|    Layar masuk & daftar (server component)
    reset-password/    Pengisian token (client component)
    oauth/consent/     Layar izin OAuth
    help|about/        Statis (server component)
  api/
    auth/[...all]/     Handler Better Auth, termasuk /api/auth/callback/google
    account/           Status akun, set kata sandi, jadwalkan/batalkan penghapusan
    avatar/            Upload & hapus avatar
    cron/purge-deletions/  Hapus permanen akun yang lewat masa tunggu
    ledger/            Semua baca/tulis ledger
  components/
    AppShell.jsx       Tata letak; rail desktop + laci mobile
    Sidebar.jsx        Navigasi dengan status aktif
    AuthForm.jsx       Formulir masuk & daftar yang sama
    PasswordPanel.jsx  Ganti/buat kata sandi
    DeleteAccountPanel.jsx  Panel hapus akun
    form.jsx           Field / TextField / NumberField / SelectField / Button
    ui.jsx             Eyebrow / Panel / Loading / Error / Empty
    idle-logout.jsx    Auto-logout idle, dipasang AppShell di semua rute
  lib/
    auth.js            Instance Better Auth (email/password + Google, bcrypt, Resend)
    auth-client.js     Klien Better Auth di browser
    db.js              Pool Postgres
    ledger.js          Semua baca/tulis Postgres + validasi
    ledger-validation.js  Aturan validasi murni
    money.js           Format rupiah, tanggal, ringkasan arus kas & anggaran
    avatar.js          Satu helper URL avatar; upload/hapus lewat /api/avatar
    account.js         Panggilan level akun
    account-deletion.js  Masa tunggu 7 hari, sebagai fungsi murni
    account-purge.js   Tanda / batalkan / hapus — server-side only
    safe-redirect.js   Validasi `?next=` / `redirect_uri`
    idle-logout.js     Deadline idle: persistensi & cross-tab (tanpa React)
    sidebar.js         State rail + pre-hydration script
    theme.jsx          ThemeProvider + useTheme
    theme-presets.js   Data tema + glyph favicon + pre-paint script
    category-colors.js Tabel pencarian warna kategori
  hooks/
    useLedgerData.js   Siklus muat / muat-ulang / error + subscription
    useProfile.js      Profil + tema
```

### Konvensi yang perlu dijaga

**Tema.** Jangan pernah menulis hex di komponen. Semua warna lewat token
`ruang-*` di `tailwind.config.cjs`, yang membaca CSS variable di
`src/app/globals.css`. Ada tepat tiga tema: `dark`, `light`, `system`. Tidak ada
warna yang ditulis runtime.

**Spacing.** Dua token: `card` (16px) dan `section` (32px). Jangan tulis ulang
sebagai arbitrary value — itulah alasan halaman-halaman ini dulu terlihat tidak
saling berkaitan. Margin bawah header selalu `mb-section`.

**`bg-${color}` tidak pernah bekerja.** Tailwind hanya melihat nama kelas utuh di
source. Warna kategori adalah string polos (`'lime'`) di Postgres, jadi selalu
lewat `category-colors.js`.

**Tanggal bersifat local-time.** `new Date('2026-10-07')` di-parse sebagai UTC
midnight, yaitu sehari sebelumnya di barat Greenwich. Semua tanggal lewat `toDate()`.

**Nominal.`type="text"`, bukan `type="number"`** — input number membuang ketikan
tidak valid secara senyap sehingga tidak ada umpan balik. Form mewajibkan bilangan
bulat; `validateExpense` menolak desimal asli seperti `12.75`.

**Render test tidak bisa memuat `.ts` atau `next/navigation`.**
`tests/jsx-hooks.mjs` hanya me-resolve `.js`/`.jsx`, jadi komponen yang diuji
tidak boleh menarik `src/lib/client.ts` secara transitif dan harus navigate
dengan `window.location`. Ini alasan `DeleteAccountPanel` dipecah jadi komponen
presentational.

## Test

```bash
npm test           # seluruh test (logika + render)
npm run test:logic # ledger + safe-redirect
npm run test:render
```

Suite berjalan tanpa dependensi tambahan — Babel-nya dipinjam dari Next.

| File | Menguji |
| --- | --- |
| `tests/ledger.test.js` | Format rupiah, ringkasan anggaran, operasi tanggal, validasi (nol, negatif, junk) |
| `tests/ledger-validation.test.js` | Aturan validasi expense/kategori |
| `tests/safe-redirect.test.js` | `?next=` dan `redirect_uri` — path absolut, `//`, `/\` harus jatuh ke fallback |
| `tests/account-deletion.test.js` | Aritmetika masa tunggu, termasuk batas detik dan countdown yang membulatkan ke bawah |
| `tests/charts.test.js` | Perhitungan data grafik |
| `tests/idle-logout.test.mjs` | Deadline idle dengan clock yang di-inject — jangan tunggu 15 menit sungguhan |
| `tests/sidebar-collapse.test.mjs` | State & persistensi rail |
| `tests/theme.test.jsx` | Preset tema & token |
| `tests/favicon-apply.test.mjs` | Glyph favicon |
| `tests/render.test.jsx` | Merender komponen nyata ke HTML lalu memeriksa markup-nya |

`next build` hanya membuktikan modul bisa di-parse, bukan bahwa mereka merender —
itulah yang ditutup `render.test.jsx`.

E2E (butuh jaringan + kredensial, tidak masuk `npm test`):

```bash
node tests/e2e-signup.mjs
node tests/e2e-pages.mjs http://localhost:3000 <email> <password>
```

## Deploy

Vercel. `vercel.json` menjadwalkan `GET /api/cron/purge-deletions` setiap hari
pukul 03:17 UTC — jadwal itu yang benar-benar menghapus akun yang lewat masa
tunggu, karena Supabase memblokir `DELETE` pada `storage.objects` dari SQL, jadi
avatar hanya bisa dihapus lewat Storage API.

Sebelum deploy pertama, pastikan `CRON_SECRET`, `BETTER_AUTH_URL`, dan
`SUPABASE_SERVICE_ROLE_KEY` ada di Project Settings → Environment Variables.
`NEXT_PUBLIC_*` di-freeze saat build, jadi nilai yang salah butuh **redeploy**,
bukan restart.

## Batasan yang diketahui

- Tidak ada integrasi bank; semua angka berasal dari yang dicatat pengguna.
- Pemasukan dicatat per transaksi dengan sumber opsional berupa teks bebas.
- Riwayat menampilkan 12 bulan terakhir.
- Transaksi tidak dipaginasi; daftar tumbuh seiring pemakaian.

## Catatan lain

`AGENTS.md` adalah sumber kebenaran untuk keputusan arsitektur — berisi alasan di
balik setiap pilihan yang tidak langsung terlihat dari kodenya. Baca itu sebelum
mengubah perilaku yang sudah ada.