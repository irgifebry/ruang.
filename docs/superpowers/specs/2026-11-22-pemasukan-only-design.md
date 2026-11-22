# Desain: pemasukan-only + tuntasan temuan audit

## Intent

Aplikasi `ruang.` dipakai untuk pencatatan uang masuk/keluar. Konsep "gaji" selama ini
berdiri sendiri (`salary_records`, `profiles.salary`) di samping `incomes` (THR, bonus),
dan juga dipakai sebagai acuan batas anggaran. Ini membuat dua jalur pemasukan yang
membingungkan dan beberapa test/validasi mengacu ke angka yang sudah tidak ada.
Permintaan: gaji dihapus, `incomes` jadi satu-satunya pencatatan uang masuk, dan semua
temuan audit sebelumnya ikut dikerjakan.

## Goals

- Satu jalur pemasukan: `incomes` deskripsi + sumber opsional + nominal + tanggal.
- Baris `salary_records` lama dikonversi jadi income (deskripsi "Gaji", sumber "Gaji"),
  lalu tabel `salary_records` dan kolom `profiles.salary` dihapus via migration.
- "Sisa uang" = total pemasukan − total pengeluaran. Riwayat bulan memakai bulan yang
  punya pemasukan atau pengeluaran.
- Batas anggaran tidak lagi dibatasi gaji/pemasukan; `budgets` murni amplop yang
  dipilih pengguna. Validasi tetap membatasi nominal per kategori.
- Semua temuan audit prioritas tinggi/sedang/rendah dituntaskan, termasuk celah
  sesi-cache pada endpoint sensitif, race purge, validasi, a11y, dan sinkronisasi docs.

## Non-goals / anti-goals

- Tidak mengubah stack (tetap Next.js 16, Better Auth, Postgres, Tailwind token).
- Tidak menyentuh data Supabase deployed langsung dari sesi ini. Migration ditulis
  sebagai file; eksekusiProduction menjadi keputusan terpisah.
- Tidak menambah kategori pemasukan baru atau fitur transfer/utang. `source` tetap teks
  bebas opsional.
- Tidak mengembalikan seed kategori default saat signup.

## Constraints

- Migration harus mengikuti bentuk deployed: `user_id text` → `public."user"`,
  RLS aktif tanpa policy. Jangan pakai `auth.uid()` / `auth.users`.
- `schema.sql` harus diselaraskan supaya project baru tidak gagal boot.
- Logika murni tetap bebas React/Next/.ts agar 273+ tes bisa dijalankan Node.
- Tailwind: tidak ada hex warna baru di komponen; pakai token yang ada.
- Semua penulisan/profile lewat `updateProfile()`; semua data lewat `/api/ledger`.

## Approaches yang dipertimbangkan

1. **Konversi + hapus tabel (dipilih).** Migration mengubah data lama jadi income lalu
   drop objek lama. Paling bersih: tidak ada jalur gaji mati, docs bisa jujur. Risikonya
   migration destruktif — sudah disetujui pengguna, dan file migration tidak dijalankan
   otomatis ke produksi oleh sesi ini.
2. **Konversi, tabel dibiarkan.** Lebih aman rollback, tapi menyisakan skema mati yang
   tetap harus dijelaskan di docs. Ditolak karena tujuan awalnya menghilangkan gaji.
3. **Gaji jadi kategori pemasukan + cap mengikuti pemasukan.** Mempertahankan perilaku
   lama, tapi batas anggaran jadi naik-turun dan bisa menolak input sebelum pemasukan
   dicatat. Ditolak demi pencatatan input/output yang sederhana.

## Keputusan desain (sudah final)

### Model data
- Hapus `salary_records`; hapus `profiles.salary`.
- `incomes` tetap: `id, user_id, description, source?, amount, received_on, created_at`.
- Migration baru: `INSERT INTO incomes ... SELECT ... FROM salary_records` (amount > 0),
  lalu `DROP TABLE salary_records`, `ALTER TABLE profiles DROP COLUMN salary`.
- `schema.sql` diperbarui mengikuti bentuk deployed (text id, trigger Better Auth) agar
  benar-benar bisa dipakai project baru. Ini juga menyelesaikan temuan "schema.sql bukan
  source of truth". Catatan: migration ini tidak dijalankan otomatis ke project deployed.

### API / logika (`/api/ledger`)
- Hapus action `fetchSalaryHistory`, `saveSalary`; hapus `salary`, `salaryRecords` dari
  response `fetchLedger`. Tambah agregat pemasukan bulanan bila diperlukan history.
- `fetchMonthlyBreakdown`: bucket bulan dari **gabungan** expenses dan incomes.
- Hapus semua server-side salary cap di `createBudget`/`updateBudget`; terapkan batas
  nominal per-entri seragam di server (`validAmount`) dan samakan konstanta max di client.
- `updateProfile` dibungkus transaksi (nama profil + `"user".name` + `provider_image`).
- Avatar URL: satu helper (`avatar.js`) dipakai ulang, hapus duplikasi literal URL.
- Origin check: tolak request tanpa `Origin` untuk metode state-changing kecuali
  `sec-fetch-site: same-origin` (jangan memecah e2e/curl yang sah).

### UI
- `/settings`: hapus tab gaji; tab "Pemasukan" jadi CRUD `incomes` penuh.
- Dashboard: `sisa = inflow − spent`, inflow dari semua income; label dan copy bebas gaji.
- Riwayat: satu baris per bulan yang punya pemasukan atau pengeluaran; tampilkan
  `pemasukan`, `pengeluaran`, `sisa`, jumlah entry.
- `LOW_BALANCE_PERCENT` / `balanceLevel` tetap dipakai, argumen berganti `income`.
- Hilangkan `tone="ghost"`, perbaiki skip link di rute bare, sembunyikan account menu
  dari tab order saat tertutup + Escape-to-close, bungkus `useSearchParams` di Suspense.
- Satukan konstanta tinggi mobile bar (56px) jadi satu token.

### Auth / keamanan
- Endpoint sensitif (`/api/account`, `/api/avatar`) memakai sesi otoritatif
  (`disableCookieCache: true`) lewat helper bersama; `/api/ledger` tetap memakai cache
  melihat trade-off yang terdokumentasi, namun tidak untuk operasi pencabutan/penghapusan.
- Hook reconcile: tambah `session.update.before` agar refresh sesi juga memulihkan flag
  hapus akun; hook tetap fail-open.
- Purge: lock baris / cek ulang `deletion_requested_at` dan deadline di dalam transaksi
  sebelum menghapus; samakan sumber waktu (Postgres `now()`).
- `/auth/callback`: hapus stub mati; perbarui AGENTS.md & docs/setup ke callback Better
  Auth yang benar (`/api/auth/callback/google`).
- Rate limiting bawaan Better Auth untuk sign-in/sign-up/reset; captcha juga dipasang
  untuk social sign-in bila kunci tersedia.
- Token reset: escape HTML pada email, validasi token sebelum dipakai, dan jangan
  tampilkan token mentah di UI.

### Docs & tes
- Perbarui AGENTS.md (model uang, callback, hook, client/server inventory, schema,
  accessor avatar, klaim theme/sidebar yang keliru) dan `data.js`/komentar seeding.
- Perbarui/menghapus tes lama yang mengacu gaji; tambah tes untuk konversi migration,
  history dari income, purge race, dan validasi amount boundary.

## Yang diserahkan ke builder

Rincian implementasi, urutan commit, dan pilihan nama helper menjadi keputusan builder
selama sesuai keputusan di atas. Subagent akan bekerja pada file yang tidak bertabrakan;
integrasi akhir dan verifikasi (`npm test`, `npm run build`, `git diff`) dilakukan di sini.
