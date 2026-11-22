# ruang.

Rencana keuangan pribadi: catat pemasukan dan pengeluaran, susun anggaran per
kategori, lalu pantau sisa uangnya.

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

`supabase/schema.sql` adalah sumber kebenaran untuk database baru. Skemanya
mengikuti bentuk yang dipakai di production: user Better Auth di `public."user"`
dengan id berupa teks. Terapkan dengan salin-menyalin ke SQL Editor, atau pakai CLI:

```bash
supabase link --project-ref <ref>
supabase db push        # untuk project yang sudah punya migration
```

Untuk project yang sudah berjalan, perubahan inkremental ada di
`supabase/migrations/`. Migration `20261122_incomes_only.sql` mengubah dulu baris
`salary_records` lama menjadi baris `incomes` (deskripsi dan sumber "Gaji"), baru
lalu menghapus `salary_records` dan kolom `profiles.salary`. Menjalankannya ke
project deployed adalah keputusan terpisah — migration ini hanya disiapkan.

### Yang harus dibuat

Tabel `profiles`, `budgets`, `expenses`, dan `incomes`, masing-masing dengan RLS
aktif. Di project yang sudah dideploy RLS aktif tanpa policy, jadi tabel tidak
terjangkau lewat PostgREST dengan publishable key; `schema.sql` memuat policy
kepemilikan baris untuk project baru. Tidak ada tabel yang terbuka untuk `anon`.

### Pemasukan adalah satu-satunya uang masuk

`incomes` menyimpan tiap pemasukan sebagai baris tersendiri: `description`,
`source` opsional berupa teks bebas (misalnya "THR" atau "Bonus"), `amount`, dan
`tanggal diterima`. Tidak ada angka tetap bulanan; objek lama yang dipakai untuk
itu sudah dihapus oleh migration di atas. Anggaran juga tidak punya batas yang
dihitung dari pemasukan — `budgets` murni amplop yang limitnya dipilih pengguna.
Pemasukan dicatat dari halaman Transaksi, bukan dari Pengaturan.

### Riwayat hanya berisi bulan yang ada isinya

Sebuah bulan masuk riwayat bila ada pemasukan **atau** pengeluaran di bulan itu.
Akun baru tidak mendapat baris contoh, jadi riwayatnya kosong sampai pengguna
mencatat sesuatu. Tidak ada nominal nol yang dipakai sebagai penanda "belum
diisi".

### Kategori awal

Akun baru hanya mendapat profil — tidak ada kategori template. Kategori dibuat
sendiri dari halaman Pengaturan. Trigger lama yang menabur lima kategori dan
baris contoh sudah dihapus; jangan menambahkannya lagi, karena itu mengisi daftar
kosong dengan pilihan yang belum diminta pengguna.

### Hapus akun dengan masa tunggu 7 hari

`/settings/profile` punya panel terakhir, **Hapus akun**. Memencetnya tidak
menghapus apa pun: server hanya mengisi `profiles.deletion_requested_at` lalu
mencabut semua sesi, dan pengguna langsung dikeluarkan. Tujuh hari kemudian
akun itu dihapus permanen.

**Masuk lagi adalah cara membatalkannya.** Hook `databaseHooks.session.create.before`
dan `.session.update.before` di `src/lib/auth.js` dilewati setiap sign-in — dengan
kata sandi, lewat Google, atau dari sesi yang diperbarui. Di sana timestempel
dibersihkan, jadi tidak ada yang perlu dibangun ulang karena memang tidak pernah
dihapus. Kalau tenggatnya
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
`expenses`, `budgets`, `incomes`, `profiles`, lalu `public."user"`. Berkas avatar
ikut dihapus lewat Storage API dari route yang sama.

## Langkah manual di Supabase Dashboard

Bagian ini tidak bisa diaplikasi lewat migration atau MCP, jadi harus disetel
sendiri setelah deploy.

### 1. URL pengembalian (Redirect URLs)

Tambahkan URL panggilan balik Better Auth dan halaman pemulihan kata sandi:

- **Authentication → URL Configuration → Redirect URLs**, tambahkan:

  ```
  http://localhost:3000/api/auth/callback/google
  http://localhost:3000/reset-password
  https://<domain-anda>/api/auth/callback/google
  https://<domain-anda>/reset-password
  ```

Rute `/auth/callback` hanya stub yang mengalihkan tautan lama ke `/login`
dengan pesan error; kode OAuth ditukar Better Auth di
`/api/auth/callback/google`.

Konfirmasi email dan *Leaked Password Protection* adalah pengaturan Supabase
Auth lama. Better Auth yang mengatur proses masuk dan kebijakan kata sandi di
aplikasi ini, jadi kedua toggle itu tidak berpengaruh dan tidak perlu disetel.

### 2. `BETTER_AUTH_URL` di Vercel

Nilainya harus `https://ruang-cashflow.vercel.app` untuk Production. Nilai ini
menentukan `redirect_uri` yang dikirim ke Google dan dicocokkan persis — kalau
tertinggal di `localhost:3000`, production gagal dengan `redirect_uri_mismatch`.

## Arsitektur

```
src/
  app/                  Rute; halaman berstate adalah client component, yang
                        mengekspor metadata adalah server component
    page.jsx            Ringkasan (dashboard)
    transactions/       Daftar, tambah, ubah, hapus, filter pengeluaran & pemasukan
    history/            Riwayat bulanan dari data nyata
    settings/           CRUD kategori (pemasukan dicatat di /transactions)
      profile/          Nama, avatar, tema, ganti kata sandi
      security/         Redirect ke /settings/profile
    welcome/            Halaman tamu dengan data contoh (server component)
    login|register/     Layar masuk & daftar (server component)
    reset-password/     Pengisian token (client component)
    oauth/consent/      Layar izin OAuth; tamu diteruskan ke /login?next=
    help/               FAQ (server component)
    about/              Tentang ruang. (server component)
    loading.jsx         Fallback streaming tingkat root
    global-error.jsx    Error boundary root (ganti layout)
    error.jsx           Batas error per rute
    not-found.jsx       404
  api/
    auth/[...all]/      Handler Better Auth, termasuk /api/auth/callback/google
    account/            Status akun, kata sandi, jadwalkan/batalkan hapus
    avatar/             Upload & hapus avatar
    ledger/             Semua baca/tulis ledger
    cron/purge-deletions/  Hapus permanen lewat masa tunggu
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
    client.ts           Klien Supabase di browser — hanya Storage getPublicUrl
    server.ts           Klien Supabase sisi server peninggalan Supabase Auth; tidak dipakai
    middleware.ts       Segarkan sesi + gerbang auth, dipanggil dari proxy.ts
    proxy.ts            Titik masuk middleware (Next.js 16)
    ledger.js           Semua baca/tulis Postgres + validasi
    money.js            Format rupiah, tanggal, ringkasan arus kas & anggaran
    avatar.js           Satu helper URL avatar; upload/hapus lewat /api/avatar
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

**`?next=` dibatasi pada path relatif.** Login dan `proxy.ts` menolak nilai yang
diawali `//` atau URL penuh, dan `AuthForm` melakukan hal yang sama pada
`callbackURL` Google, supaya parameter tidak bisa dipakai sebagai open redirect.
Rute `/auth/callback` tidak ikut memvalidasi — ia hanya mengalihkan ke `/login`.

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
- Pemasukan dicatat per transaksi dengan sumber opsional berupa teks bebas.
- Riwayat menampilkan 12 bulan terakhir.
- Transaksi tidak dipaginasi; daftar tumbuh seiring pemakaian.

