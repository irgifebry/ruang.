# Desain: onboarding carousel + mode demo tamu

## Intent

Aplikasi tidak lagi langsung mendarat di form login. Setelah splash, pengguna baru
melihat carousel onboarding tiga slide yang menjelaskan apa yang bisa dilakukan
`ruang.`. Di slide terakhir ada tiga pilihan: **Masuk**, **Daftar**, atau
**Lihat-lihat dulu**. Pilihan terakhir membuka aplikasi penuh dengan data contoh
dalam **mode demo read-only**, supaya orang bisa merasa mencoba sebelum daftar.

## Goals

- Splash → onboarding (kali pertama) → auth; pengguna lanjut langsung ke auth.
- Carousel tiga slide: catat pemasukan/pengeluaran, atur anggaran kategori,
  lihat riwayat per bulan. Isi bebas, bertumpu pada token warna yang ada.
- Animasi entrace per slide, dot indikator yang ikut bergerak, dan CTA akhir
  yang muncul bertahap — tanpa library animasi baru.
- "Lihat-lihat dulu" membuka Ringkasan/Transaksi/Riwayat/Pengaturan dengan
  data contoh; semua aksi tulis dinonaktifkan dan diberi penanda "Mode demo".
- Tidak ada akun testing, tidak ada penulisan ke database untuk tamu.

## Non-goals / anti-goals

- Tidak membuat akun tamu di database.
- Tidak mengubah web app atau backend.
- Tidak mengubah alur auth email/password, deep link, atau Google.
- Tidak menambah pustaka animasi berat (Reanimated/Lottie).

## Constraints

- `AppShell` saat ini meng-redirect guest ke `/login`; onboarding harus menjadi
  tujuan pertama guest, dengan `/login` tetap menjadi jalur langsung yang valid.
- `sample-data.js` memakai tanggal Oktober 2026. Data demo harus dipetakan ke
  bulan berjalan supaya Ringkasan dan Riwayat tidak terlihat kosong.
- Keempat layar mengambil data lewat `useLedgerData(session.client, ...)`;
  mode demo harus menyuntik data tanpa mengganti logika masing-masing layar.
- Semua warna/ukuran lewat `tokens(resolved)`; tidak ada hex literal baru.
- Tes source-level `node:test` adalah gate otomatis; Orca CLI browser adalah
  gate visual. Perubahan nama import harus dipin tes (class bug Task 9/11/14).

## Approaches

1. **Carousel + demo menyeluruh (dipilih).** Onboarding sebagai rute `/onboarding`;
   demo sebagai flag lokal + data contoh yang disuntikkan ke layar yang sama.
   Paling terasa sebagai aplikasi. Biaya: empat layar perlu menerima data demo
   dan tombol tulisnya dinonaktifkan.
2. **Preview statis.** "Lihat-lihat dulu" hanya membuka showcase. Lebih murah,
   tapi tidak terasa seperti mencoba aplikasi. Ditolak.
3. **Akun tamu sementara.** Menulis ke DB dan butuh cleanup. Ditolak.

## Keputusan desain

### Onboarding

- Rute baru `app/onboarding.jsx` → `src/screens/Onboarding.jsx`.
- Tiga slide dengan ilustrasi yang dibangun dari `StyleSheet` + `react-native-svg`
  dan token: kartu saldo, kumpulan kategori, bar riwayat.
- Navigasi geser (paging) + tombol Lanjut/Kembali + "Lewati".
- Slide terakhir menampilkan `Masuk`, `Daftar`, dan tautan "Lihat-lihat dulu →".
- Flag `ruag.onboarding.seen` disimpan di SecureStore/FastStorage lokal; hanya
  ditulis setelah carousel selesai atau tombol Lewati ditekan.
- `AppShell` meng-redirect guest ke `/onboarding` bila flag belum ada, kalau
  tidak ke `/login` seperti sekarang. `?idle=1`/`?deleted=1` tetap diteruskan
  ke layar auth bila ada.

### Animasi

- `Animated.Value` per slide untuk opacity + translateY; stagger 60–90 ms antar
  elemen judul, ilustrasi, dan kata kunci.
- Dot indikator: dot aktif melebar dan warnanya `t.accent`, dot lain `t.track`.
- Ilustrasi kartu "mengapung" sekali saat slide masuk, bukan loop terus-menerus.
- Tombol akhir fade-up saat slide ketiga aktif; press-scale pada CTA.
- `useNativeDriver: true` untuk transform/opacity; tidak ada animasi warna/lebar
  memakai native driver (fallback JS bila perlu).

### Mode demo

- `src/state/DemoProvider.jsx`: `isDemo`, `data`, `enterDemo()`, `exitDemo()`.
- `src/shared/demo-data.js`: `buildDemoData()` dari `sample-data.js`, mengubah
  `user_id` menjadi `'demo'`, menambah relasi `budgets` pada expense, dan
  memetakan tanggal ke bulan berjalan supaya Ringkasan/Riwayat terisi.
- `useLedgerData(client, options)` menerima opsi `{ demo }`: bila demikian,
  mengembalikan `data` dari provider tanpa fetch, `loading:false`, dan
  `reload/patchData` menjadi no-op.
- Keempat layar mengecek `isDemo`: form/hapus/edit dinonaktifkan, dan banner
  kecil "Mode demo — perubahan tidak disimpan" tampil di header.
- Tab bar tetap sama; "Keluar demo" di account menu mengarah ke `/login`.

## Yang diserahkan ke builder

- Detail teks tiga slide selama singkat dan Bahasa Indonesia.
- Besaran durasi animasi (kisaran 240–420 ms) dan jarak stagger.
- Penempatan banner demo di tiap layar.

## Verification

- `cd mobile && npm test`: tes source-level untuk flag onboarding, rute/screen
  binding, demo data, dan tidak ada penulisan saat demo.
- `npx expo export --platform ios --platform android`.
- Orca CLI browser: splash → onboarding → geser tiga slide → Masuk/Daftar;
  "Lihat-lihat dulu" → Ringkasan dengan angka contoh → pindah tab → tombol
  tulis disabled → "Keluar demo" → auth. Ulangi dengan flag onboarding sudah
  ada supaya langsung ke auth.
