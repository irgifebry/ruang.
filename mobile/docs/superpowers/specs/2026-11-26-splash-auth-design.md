# Desain: splash → auth, tanpa halaman Welcome (native)

## Intent

Aplikasi native `ruang.` saat dibuka tidak boleh menampilkan halaman pemasaran
`/welcome`. Pengguna harus melihat splash singkat, lalu masuk ke layar auth.
Tampilan auth dibebaskan dari kewajiban menyalin web — boleh dan sebaiknya
berbeda, lebih menarik, tapi tetap terasa `ruang.`.

## Goals

- Boot: splash bermerek ±1,2 detik → guest ke `/login`, pengguna bersesi ke `/`.
- Halaman `/welcome` dan FAQ pendek `/welcome-help` tidak ada lagi di native.
- Auth screen yang lebih kuat secara visual: headline besar, aksen italic,
  CTA lime penuh, Google button outline, footer Bantuan/Tentang.
- Semua fungsi auth tetap utuh: Turnstile (token sekali pakai), Google idToken,
  validasi lokal, notifikasi `deleted=1`/`idle=1`, `safePath` untuk `?next=`.
- Tema dark/light tetap memakai token yang sama; tidak ada hex baru di komponen.

## Non-goals / anti-goals

- Tidak mengubah website (web `/welcome` tetap ada).
- Tidak mengubah backend, API, atau Better Auth.
- Tidak menambah library animasi berat; cukup `Animated` dari React Native.
- Tidak memindahkan rute dashboard dari `/`.

## Constraints

- `AppShell` sudah meng-redirect guest ke `/login` dan menjaga status sesi; splash
  tidak boleh mengambil alih keputusan itu atau menduplikasi redirect.
- Root layout sudah memasang `ThemeProvider`, `SessionProvider`, dan `IdleLogout`
  sekali; splash ditambahkan sebagai overlay di layout yang sama.
- `expo export` tidak menangkap named import yang undefined; setiap pasangan
  rute/layar dan identifier yang dipanggil harus dipin oleh tes source-level
  (`tests/auth-pages-exports.test.mjs`).
- Turnstile WebView adalah satu-satunya WebView yang diizinkan.

## Approaches

1. **Overlay splash di root layout (dipilih).** Splash menutupi seluruh aplikasi
   saat boot, menunggu sesi selesai dan durasi minimum, lalu membuka diri.
   `AppShell` tetap yang memutuskan tujuan. Tidak ada konflik rute, guard utuh.
2. **Rute `/` khusus splash.** Dashboard harus dipindah dari `/`; lebih banyak
   perubahan dan risiko pada tautan `?next=` serta deep link. Ditolak.
3. **`expo-splash-screen` statis saja.** Hanya gambar diam, tidak bisa
   menunggu sesi atau memilih tujuan; kurang terasa sebagai aplikasi. Ditolak.

## Keputusan desain

### Splash

- Komponen `src/components/Splash.jsx`, dirender sebagai overlay absolut di
  `app/_layout.jsx` di dalam `ThemeProvider`/`SessionProvider`.
- Animated: glyph `FAVICON_GLYPH` skala 0,86 → 1 + fade, wordmark `ruang.`
  fade, garis accent 0 → 100% lebar. Durasi total ~1,2 detik; kurang dari itu
  tidak terasa, lebih lama terasa lambat.
- Menutup diri hanya ketika **dua** syarat terpenuhi: `status !== 'loading'`
  dan durasi minimum terpenuhi. Tidak ada navigasi sendiri dari splash.

### Penghapusan Welcome

- Hapus `app/welcome.jsx`, `app/welcome-help.jsx`, `src/screens/Welcome.jsx`.
- `StaticInfo` hanya menyisakan varian `help` dan `about`; hapus varian
  `welcome-help`, daftar FAQ pendek, dan tautan balik ke `/welcome`.
- Perbarui `tests/auth-pages-exports.test.mjs`: pasangan rute/halaman Welcome
  dihapus, tautan ke `/welcome` tidak boleh ada lagi, tes deep-equality sample
  data & glyph dipertahankan atau dipindah ke tes yang masih relevan.
- `sample-data.js` / `favicon.js` boleh tetap (dipakai tes), tapi bukan milik
  layar mana pun.

### Auth (desain baru, bukan parity web)

- Satu layar untuk login/register seperti sekarang; judul dan komposisi diubah.
- Struktur: brand lockup di atas → headline dua baris ("Catat uangmu,"
  / *"tenang di akhir bulan."* dengan italic accent) → panel form radius besar →
  Google outline + divider → email → Turnstile → password + toggle → CTA lime
  dengan ikon panah → toggle mode → footer "Bantuan · Tentang".
- Halo dekoratif di kanan atas memakai `withAlpha(t.accent, 0.10)` dan garis
  SVG memakai token; tidak ada warna literal baru.
- Micro-interaction: headline fade-up sekali saat mount, tombol menekan
  sedikit mengecil (`Animated`/`useNativeDriver`), fokus field menaikkan
  border accent. Tidak ada animasi terus-menerus yang menguras baterai.
- Semua logika submit, captcha reset, notifikasi, dan navigasi dipertahankan
  apa adanya — hanya tampilan dan susunan yang berubah.

## Yang diserahkan ke builder

- Detail ukuran font/radius final selama masih lewat `tokens.js`.
- Penempatan tepat `TurnstileWidget` di dalam panel agar tidak memutus alur.
- Nama style lokal di `stylesFor(t)`.

## Verification

- `cd mobile && npm test` — termasuk tes source-level untuk pasangan rute,
  identifier terikat, tidak ada tautan `/welcome`, dan splash menunggu sesi.
- `npx expo export --platform ios --platform android`.
- Orca CLI browser: boot → splash → `/login`; cek headline, Google, validasi
  password pendek, toggle daftar/masuk, footer Bantuan/Tentang, dark + light.
