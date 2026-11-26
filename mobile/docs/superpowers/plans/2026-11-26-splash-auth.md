# Splash → auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Native app dibuka dengan splash singkat lalu masuk ke auth; halaman Welcome dihapus; layar auth dirancang ulang agar lebih menarik.

**Architecture:** Splash adalah overlay di root layout yang menunggu sesi dan durasi minimum, lalu membuka diri. `AppShell` tetap satu-satunya yang memutuskan redirect guest ke `/login`. Welcome dan FAQ pendek dihapus dari native; auth screen disusun ulang dengan token warna yang sudah ada.

**Tech Stack:** Expo Router, React Native `Animated`, `StyleSheet`, `react-native-svg`, token `tokens(resolved)` + `withAlpha`, `node:test` source-level, Orca CLI browser untuk verifikasi visual.

**Spec:** `mobile/docs/superpowers/specs/2026-11-26-splash-auth-design.md`

## Global Constraints

- Tidak ada halaman `/welcome` atau `/welcome-help` di native; website tidak diubah.
- Splash hanya menunggu, tidak melakukan navigasi; `AppShell` tetap mem-redirect guest ke `/login`.
- Semua warna lewat `tokens(resolved)` / `withAlpha`; tidak ada hex literal baru di komponen.
- Turnstile satu-satunya WebView; token sekali pakai tetap di-reset setelah submit.
- Google idToken, validasi lokal, `safePath`, notifikasi `deleted=1` / `idle=1` tidak berubah.
- Setiap pasangan rute/layar dan identifier yang dipanggil dipin oleh tes source-level; `expo export` tidak menangkap named import undefined.
- Bekerja di checkout utama (`mobile/` sudah dipindah ke sana). **Jangan commit ke `main`** — keputusan integrasi branch masih terbuka.

## Review Focus

- Splash bisa menutup sebelum sesi selesai → guest melihat dashboard atau flash salah arah. Pin dengan tes yang mengecek splash hanya menutup jika `status !== 'loading'` **dan** durasi minimum terpenuhi (Task 1).
- Tautan `/welcome` tertinggal di komponen atau tes → halaman mati tetap bisa dibuka. Pin dengan tes source-level bahwa tidak ada lagi string `/welcome` di `mobile/app` dan `mobile/src` (Task 1).
- Auth kehilangan captcha/Google/notifikasi saat redesign → login rusak. Pin dengan tes source-level bahwa `TurnstileWidget`, `handleGoogle`, `authNotices`, `clearCaptchaToken`, dan `captchaRef.reset()` masih hadir (Task 2).
- Named import/identifier tidak terikat seperti bug Task 9/11/14 → layar crash. Jalankan ulang `tests/auth-pages-exports.test.mjs` dan perluas cakupannya ke splash (Task 1 + 2).
- Tampilan overload/animasi berulang → baterai dan keterbacaan. Tes source-level: `Animated` hanya untuk mount + press, tidak ada loop; pin di Task 2.

---

### Task 1: Splash global + hapus Welcome

**Files:**
- Create: `mobile/src/components/Splash.jsx`, `mobile/tests/splash.test.mjs`
- Modify: `mobile/app/_layout.jsx`, `mobile/src/screens/StaticInfo.jsx`, `mobile/tests/auth-pages-exports.test.mjs`
- Delete: `mobile/app/welcome.jsx`, `mobile/app/welcome-help.jsx`, `mobile/src/screens/Welcome.jsx`

**Interfaces:**
- Consumes: `useTheme()` → `{ resolved }`, `useSession()` → `{ status }`, `tokens(resolved)`, `FAVICON_GLYPH` dari `src/theme/favicon.js`.
- Produces: `Splash` default export; `SPLASH_MIN_MS = 1200`.

- [ ] **Step 1: Tulis tes yang gagal**

`mobile/tests/splash.test.mjs` (source-level, karena tidak ada renderer test):
1. `SPLASH_MIN_MS === 1200`.
2. `Splash.jsx` mengandung `status !== 'loading'` dan `Animated.timing` / `Animated.loop` tidak digunakan untuk animasi berulang.
3. `Splash.jsx` tidak mengandung `router.replace` / `router.push`.
4. `app/_layout.jsx` merender `<Splash />` di dalam `ThemeProvider` dan `SessionProvider`.
5. Tidak ada file `app/welcome.jsx`, `app/welcome-help.jsx`, `src/screens/Welcome.jsx`.
6. Tidak ada string `/welcome` di seluruh `mobile/app` dan `mobile/src` (kecuali file `docs/`).

- [ ] **Step 2: Jalankan tes, pastikan gagal**

Run: `cd mobile && node --test tests/splash.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implementasi**

`Splash.jsx`: overlay absolut `StyleSheet.absoluteFill`, warna `t.bg`; glyph + wordmark + garis accent; animasi mount sekali (`Animated.timing`, `useNativeDriver: true` bila didukung) dan auto-hide lewat callback `onReady()` setelah durasi minimum & sesi selesai. `app/_layout.jsx`: state `splashDone`, render `<Splash onReady={() => setSplashDone(true)} />` sampai selesai; **jangan** mengganti navigasi. Hapus tiga file Welcome. `StaticInfo.jsx`: hapus varian `welcome-help`, FAQ pendek, dan tautan balik ke `/welcome`; hanya `help` + `about`. Perbarui `tests/auth-pages-exports.test.mjs` (hapus pasangan Welcome, hapus asumsi sample-data dipakai layar Welcome tetapi tetap pin deep-equality sample data/glyph).

- [ ] **Step 4: Jalankan tes, pastikan lolos**

Run: `cd mobile && npm test`
Expected: PASS.

- [ ] **Step 5: Commit / catatan**

Jangan commit ke `main`. Laporkan file yang diubah untuk dicatat controller.

---

### Task 2: Redesain layar auth

**Files:**
- Modify: `mobile/src/screens/AuthScreen.jsx`, `mobile/tests/auth-pages-exports.test.mjs`
- Create: `mobile/tests/auth-visual.test.mjs` bila diperlukan

**Interfaces:**
- Consumes: semua API/auth yang sudah ada (`signInSocial`, `signUpEmail`, `signInWithGoogle`, `TurnstileWidget`, `authNotices`, `captchaReady`, `clearCaptchaToken`).
- Produces: tampilan baru tanpa mengubah interface/perilaku submit.

- [ ] **Step 1: Tulis tes regresi yang gagal**

Tambah ke `mobile/tests/auth-pages-exports.test.mjs` / file baru:
1. `AuthScreen.jsx` masih memanggil `TurnstileWidget`, `handleGoogle`, `authNotices`, `clearCaptchaToken`, dan `captchaRef.current?.reset?.()`.
2. Tidak ada string `/welcome`.
3. Ada headline dua baris dengan teks `Catat uangmu,` dan `tenang di akhir bulan.`.
4. Ada footer `Bantuan` dan `Tentang` yang menuju `/help` dan `/about`.
5. `withAlpha` dipakai untuk halo dekoratif; tidak ada hex literal baru di `AuthScreen.jsx` (boleh hanya `tokens`/`withAlpha`).

- [ ] **Step 2: Jalankan tes, pastikan gagal**

Run: `cd mobile && node --test tests/auth-pages-exports.test.mjs tests/auth-visual.test.mjs`
Expected: FAIL pada assertion visual baru.

- [ ] **Step 3: Implementasi**

Susun ulang JSX/styles `AuthScreen.jsx` sesuai sketch spec: brand lockup, headline dua baris dengan italic accent, halo `withAlpha(t.accent, 0.10)`, panel form radius lebih besar, Google button outline + logo 4 warna, divider "atau", field email, Turnstile, password + toggle, CTA lime dengan ikon panah, toggle mode, footer Bantuan/Tentang. Animated fade-up saat mount dan press-scale pada CTA. **Jangan** mengubah logika `handleSubmit`, `handleGoogle`, `resetCaptcha`, `ready`, atau notifikasi.

- [ ] **Step 4: Jalankan tes + export**

Run: `cd mobile && npm test && npx expo export --platform ios --platform android`
Expected: PASS, dua bundle ter-export.

- [ ] **Step 5: Verifikasi Orca CLI + catatan**

Buka `http://localhost:8081` di browser Orca: splash → `/login`; cek headline, toggle ke `/register`, validasi password pendek, Google button, footer. Jangan commit ke `main`.

---

## Self-Review

- Spec coverage: splash (Task 1), penghapusan Welcome (Task 1), desain ulang auth (Task 2), fungsi auth terjaga (Task 2), Orca visual (Task 2). Lengkap.
- Step scan: setiap step punya satu hasil yang bisa dicek.
- Type consistency: `Splash({ onReady })`, `SPLASH_MIN_MS`, `useSession().status`, `tokens(resolved)` konsisten di kedua task.
- Review focus: kelima input punya tes di task yang owning kodenya.
- Proportion: plan lebih pendek dari kode yang dijelaskan; tidak ada body algoritma yang ditulis penuh.
