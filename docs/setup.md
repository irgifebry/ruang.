# ruang.

Rencana keuangan pribadi: ubah gaji bulanan jadi anggaran yang bisa dipantau,
lalu catat setiap pengeluaran terhadapnya.

Next.js 16 (App Router) · React 19 · Supabase · Tailwind CSS 3

## Menjalankan

```bash
npm install
cp .env.example .env.local   # isi URL + publishable key dari Supabase Dashboard
npm run dev
```

| Perintah | Kegunaan |
| --- | --- |
| `npm run dev` | Server pengembangan |
| `npm run build` | Build produksi |
| `npm start` | Menjalankan hasil build |
| `npm test` | Seluruh test (logika + render) |

## Database

`supabase/schema.sql` adalah sumber kebenaran untuk database baru. Terapkan
dengan salin-menyalin ke SQL Editor, atau pakai CLI:

```bash
supabase link --project-ref <ref>
supabase db push        # untuk project yang sudah punya migration
```

Untuk project yang sudah berjalan, perubahan inkremental ada di
`supabase/migrations/`.

### Yang harus dibuat

Tabel `profiles`, `budgets`, `expenses`, dan `salary_records`, masing-masing
dengan RLS aktif dan policy berbasis kepemilikan baris. Tidak ada tabel yang
terbuka untuk `anon`.

### Gaji disimpan per bulan

`profiles.salary` awalnya menjadi satu-satunya sumber gaji, sehingga menaikkan
gaji akan menulis ulang angka bulan-bulan sebelumnya. Sekarang gaji disimpan di
`salary_records` dengan kunci `(user_id, month)`. `profiles.salary` tetap
dipertahankan sebagai cerminan bulan berjalan agar kode yang membacanya tetap
benar.

Form gaji di halaman Pengaturan punya pemilih bulan, jadi gaji bulan berapa pun
bisa diisi atau diperbaiki, bukan hanya bulan berjalan. Setiap bulan berdiri
sendiri: menyimpan Oktober tidak mengubah September maupun bulan setelahnya.

### Riwayat hanya berisi bulan yang benar diisi

Sebuah bulan masuk riwayat setelah kamu menyimpan gaji untuk bulan itu. Nominal
nol dibaca sebagai "belum diisi", jadi tidak menjadi baris riwayat — inilah
alasan trigger tidak lagi membuat `salary_records` dengan nilai 0 untuk akun
baru. Membrane seperti itu membuat akun kosong terlihat sudah punya riwayat.

Akun lama yang sudah punya baris 0 tidak dihapus; baris itu ditimpa kalau kamu
menyimpan nilai lain untuk bulan yang sama.

### Kategori awal

Trigger `on_auth_user_created` membuat profil, lima kategori siap pakai, dan
salary record bulan ini. Sebelumnya akun baru mendapat profil kosong tanpa
kategori, dan tidak ada cara menambahkan kategori dari antarmuka — alur Daftar
langsung buntu di halaman Pengaturan.

### Hapus akun dengan masa tunggu 7 hari

`/settings/profile` punya panel terakhir, **Hapus akun**. Memencetnya tidak
menghapus apa pun: server hanya mengisi `profiles.deletion_requested_at` lalu
mencabut semua sesi, dan pengguna langsung dikeluarkan. Tujuh hari kemudian
akun itu dihapus permanen.

**Masuk lagi adalah cara membatalkannya.** Hook `databaseHooks.session.create.before`
di `src/lib/auth.js` dilewati setiap sign-in — dengan kata sandi, lewat Google,
atau dari sesi yang diperbarui. Di sana timestempel dibersihkan, jadi tidak ada
yang perlu dibangun ulang karena memang tidak pernah dihapus. Kalau tenggatnya
sudah lewat, hook itu justru *menghapus* akunnya lalu mengembalikan `false`,
sehingga sesi tidak dibuat dan login ditolak.

Dua hal yang perlu diketahui:

- **Penghapusan permanen dijalankan dari route, bukan dari SQL.** `vercel.json`
  menjadwalkan `GET /api/cron/purge-deletions` setiap hari. Alasannya avatar:
  Supabase memblokir `DELETE` pada `storage.objects` dari SQL justru karena
  file-nya akan tertinggal di bucket, jadi foto hanya bisa dihapus lewat
  Storage API. `pg_cron` di database tidak akan pernah menyentuhnya.
- **Tanpa `CRON_SECRET`, route menolak semua permintaan.** Akun yang ditandai
  hanya jadi tidak bisa dijangkau, tidak pernah benar-benar terhapus. Set variabel
  itu di Vercel (Project Settings → Environment Variables) supaya jadwalnya
  benar-benar berjalan.

Tabel yang dihapus satu per satu, bukan mengandalkan cascade:
`expenses`, `budgets`, `salary_records`, `profiles`, lalu `public."user"`.
`schema.sql` menunjuk `auth.users` sementara project yang dipakai menunjuk
`public."user"`, jadi daftar eksplisit behave sama di keduanya.

## Langkah manual di Supabase Dashboard

Bagian ini tidak bisa diaplikasi lewat migration atau MCP, jadi harus disetel
sendiri setelah deploy.

### 1. URL pengembalian (Redirect URLs)

Tanpa ini, tautan verifikasi email dan pemulihan kata sandi berakhir di 404.

- **Authentication → URL Configuration → Redirect URLs**, tambahkan:

  ```
  http://localhost:3000/auth/callback
  http://localhost:3000/reset-password
  https://<domain-anda>/auth/callback
  https://<domain-anda>/reset-password
  ```

### 2. Konfirmasi email

Project ini sekarang memakai **`Confirm email` nonaktif**
(`mailer_autoconfirm: true`). Pendaftaran langsung mengembalikan session, jadi
pengguna masuk ke ringkasan tanpa menunggu email.

`src/components/AuthForm.jsx` tetap punya cabang `setNotice(...)` untuk kasus
`data.session` bernilai `null`. Cabang itu tidak lagi terjangkau selama
konfirmasi email mati — jangan dihapus, tapi tetap perlu dipertahankan sebagai
jaring pengaman kalau setting ini dinyalakan lagi.

Kalau `Confirm email` diaktifkan lagi, alur verifikasi muncul: pengguna harus
membuka email dulu sebelum bisa masuk. Dua hal yang perlu diperhatikan:

- Akun yang terlanjur dibuat tanpa verifikasi **tidak** ikut terverifikasi
  otomatis. Pengguna itu masih harus lewat tautan konfirmasi.
- Project ini belum punya SMTP kustom, sehingga email jatuh ke mailer bawaan
  Supabase dengan rate limit ketat. Untuk pengembangan, sebaiknya biarkan
  konfirmasi email mati.

### 3. Proteksi kata sandi bocor

Advisor keamanan menandai satu hal:

> Leaked Password Protection Disabled

Aktifkan di **Authentication → Policies → Password** agar kata sandi yang sudah
pernah muncul di kebocoran data ditolak. Ini di luar lingkup kode dan tidak bisa
diubah lewat migration.

## Arsitektur

```
src/
  app/                  Rute; setiap halaman adalah client component
    page.jsx            Ringkasan (dashboard)
    transactions/       Daftar, tambah, ubah, hapus, filter
    history/            Riwayat bulanan dari data nyata
    settings/           Gaji + CRUD kategori
      profile/          Nama, avatar, tema, ganti kata sandi
      security/         Redirect ke /settings/profile
    welcome/            Halaman tamu dengan data contoh
    login|register|reset-password/
    auth/callback/      Tukar kode OAuth/konfirmasi email dengan sesi
    oauth/consent/      Layar izin OAuth; tamu diteruskan ke /login?next=
    help/               FAQ (server component)
    about/              Tentang ruang. (server component)
    loading.jsx         Fallback streaming tingkat root
    global-error.jsx    Error boundary root (ganti layout)
    error.jsx           Batas error per rute
    not-found.jsx       404
  components/
    AppShell.jsx        Tata letak; sidebar desktop + laci mobile
    Sidebar.jsx         Navigasi, dengan status aktif per rute
    AuthForm.jsx        Formulir masuk & daftar yang sama
    PasswordPanel.jsx  Panel ganti / buat kata sandi di /settings/profile
    DeleteAccountPanel.jsx  Panel hapus akun (masa tunggu 7 hari)
    form.jsx            Field formulir dengan label dan error terikat
    expense-row.jsx     Baris transaksi & baris anggaran kategori
    ui.jsx              Eyebrow, Panel, LoadingState, ErrorState, EmptyState
    icons.jsx           Satu titik impor ikon
  hooks/
    useLedgerData.js    Siklus muat / muat-ulang / error, dengan subscription
  lib/
    client.ts           Klien Supabase sisi browser
    server.ts           Klien Supabase sisi server
    middleware.ts       Segarkan sesi + gerbang auth, dipanggil dari proxy.ts
    proxy.ts            Titik masuk middleware (Next.js 16)
    ledger.js           Semua baca/tulis Postgres + validasi
    money.js            Format rupiah, tanggal, ringkasan anggaran
    account.js          Panggilan level akun (status, set password, hapus akun)
    account-deletion.js Masa tunggu 7 hari, fungsinya murni
    account-purge.js    Tanda / batalkan / hapus permanen (server)
    safe-redirect.js    Validasi ?next= / redirect_uri (anti open redirect)
    category-colors.js  Peta warna kategori
    data.js             Data contoh untuk halaman tamu saja
```

### Catatan implementasi

Beberapa keputusan yang mungkin tidak langsung terlihat dari kodenya:

**`bg-${color}` tidak pernah bekerja.** Tailwind hanya bisa melihat nama kelas
yang muncul utuh di source. Warna kategori disimpan sebagai string polos
(`'lime'`) di Postgres, jadi setiap warna harus lewat tabel pencarian eksplisit
di `category-colors.js`.

**Tanggal `date` dibaca dalam waktu lokal.** `new Date('2026-10-07')` di parsing
sebagai tengah malam UTC, yang menjadi 6 Oktober bagi siapa pun di barat
Greenwich. Setiap tanggal melewati `toDate()` dan diformat dari komponen lokal.
Hal yang sama berlaku untuk `monthEnd()`, yang pernah mengembalikan tanggal
salah di timezone dengan offset positif.

**Nominal memakai `type="text"`, bukan `type="number"`.** Input number
membuang ketikan yang tidak valid secara diam-diam, sehingga tempelan
"12.500" tidak pernah sampai ke validasi dan pengguna tidak mendapat umpan
balik apa pun. Sebagai teks, nilai mentahnya terlihat dan pesannya bisa
dibacakan.

**Angka bulat demi validasi.** Kolom `numeric` Postgres menerima desimal, tapi
form mewajibkan digit saja. Menyimpan 12.500,50 tidak menambah apa pun pada
anggaran pribadi dan membuat pembulatan tidak konsisten.

**`?next=` dibatasi pada path relatif.** Login dan `/auth/callback` menolak
nilai yang diawali `//` atau URL penuh, supaya parameter tidak bisa dipakai
sebagai open redirect.

**Kategori yang dihapus ikut menghapus transaksinya.** Ini perilaku cascade di
skema. Dialog konfirmasi karena itu menyebutkan jumlah transaksi yang akan ikut
hilang, dan menjelaskan bahwa riwayat bulan berjalan ikut berubah.

**Masuk lagi adalah satu-satunya cara membatalkan penghapusan akun.** Account
deletion sengaja tidak punya tombol " Batal" di halaman mana pun: begitu
diminta, semua sesi dicabut, jadi tidak ada lagi halaman yang bisa dibuka.
Restore lewat sign-in bukan semata-mata karena hemat tempat — itu juga yang
membuat "dikembalikan apa adanya" benar, karena tidak ada satu baris pun yang
pernah dihapus. `cancelDeletion()` di `account-purge.js` masih ada untuk kasus
sesi yang selamat dari pencabutan, bukan untuk tombol UI.

## Test

`npm test` menjalankan suite tanpa dependensi tambahan.

**`tests/ledger.test.js`** menguji fungsi murni: format rupiah, ringkasan
anggaran, operasi tanggal, dan aturan validasi — termasuk input nol,
negatif, dan junk.

**`tests/safe-redirect.test.js`** menguji validasi `?next=` dan `redirect_uri`
di `lib/safe-redirect.js`: path absolut, `//`, dan `/\` harus jatuh ke
fallback, bukan ke host lain.

**`tests/account-deletion.test.js`** menguji arithmetic masa tunggu di
`lib/account-deletion.js`: batas detik terakhir, batas detik pertama yang sudah
terlalu lewat, dan countdown yang membulatkan ke bawah — 6 hari 23 jam harus tetap
 terbaca "6 hari", bukan "7 hari".

**`tests/render.test.jsx`** merender komponen sebenarnya ke HTML, lalu
memeriksa markup hasilnya. Ini menutup celah yang tidak Tertangkap build:
`next build` hanya membuktikan modul bisa di-parse, bukan bahwa mereka
merender. Builder-nya memaipin Babel yang sudah ikut terpasang di Next
(`next/dist/compiled/babel`), jadi tidak ada dependensi baru.

**Skrip verifikasi**, tidak dijalankan `npm test` karena butuh jaringan:

```bash
node tests/e2e-signup.mjs    # daftar pengguna baru, cek trigger signup
node tests/e2e-pages.mjs http://localhost:3000 <email> <password>
```

## Batasan yang diketahui

- Tidak ada integrasi bank; semua angka berasal dari yang dicatat pengguna.
- Gaji dicatat sebagai satu nilai per bulan, tanpa riwayat kenaikan.
- Riwayat menampilkan 12 bulan terakhir.
- Transaksi tidak dipaginasi; daftar tumbuh seiring pemakaian.

