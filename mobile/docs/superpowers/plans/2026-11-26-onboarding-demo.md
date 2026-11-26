# Onboarding carousel + mode demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Splash → onboarding carousel tiga slide dengan animasi → auth; opsi "Lihat-lihat dulu" membuka aplikasi penuh dengan data contoh read-only.

**Architecture:** Onboarding adalah rute guest baru yang dipilih `AppShell` untuk guest pertama kali; flag lokal tersimpan di SecureStore. Demo memakai `DemoProvider` + `buildDemoData()` yang menyuntik data ke `useLedgerData`, tanpa akun dan tanpa penulisan. Animasi memakai `Animated` bawaan React Native.

**Tech Stack:** Expo Router, React Native `Animated`/`StyleSheet`/`react-native-svg`, `expo-secure-store`, `node:test` source-level, Orca CLI browser.

**Spec:** `mobile/docs/superpowers/specs/2026-11-26-onboarding-demo-design.md`

## Global Constraints

- Tidak ada akun tamu di database; mode demo tidak pernah menulis ke API.
- Splash tetap tidak melakukan navigasi; `AppShell` satu-satunya penentu redirect guest.
- Tiga slide, slide terakhir berisi `Masuk`, `Daftar`, dan "Lihat-lihat dulu →".
- Animasi memakai `Animated` bawaan, `useNativeDriver: true` untuk transform/opacity, tanpa library baru dan tanpa loop terus-menerus.
- Semua warna/ukuran dari `tokens(resolved)`; tidak ada hex literal baru.
- Data demo berasal dari `src/shared/sample-data.js`, tanggal dipetakan ke bulan berjalan.
- Setiap pasangan rute/layar dan identifier yang dipanggil dipin tes source-level (`expo export` tidak menangkap import undefined).
- Bekerja di checkout utama; **jangan commit ke `main`** (integrasi branch masih terbuka).

## Review Focus

- Guest perpetual onboarding: flag tidak tersimpan → carousel muncul tiap boot. Pin: tes `hasSeenOnboarding/setSeenOnboarding` dengan adapter palsu (Task 1).
- Rute/import mismatch seperti Task 9/11/14 → layar crash. Pin: `onboarding-exports.test.mjs` memeriksa named import/default export dan bare calls (Task 1).
- Demo masih menulis ke API → data contoh berubah/401. Pin: tes bahwa `useLedgerData` dalam mode demo tidak memanggil `client.request`, dan tes source-level bahwa tombol tulis pada empat layar punya guard `isDemo` (Task 2 + 3).
- Data demo kosong di Ringkasan/Riwayat karena tanggal Oktober 2026. Pin: tes `buildDemoData()` menghasilkan bulan berjalan pada `spent_on`/`received_on` (Task 2).
- Guest terjebak di demo: `AppShell` tetap redirect ke `/login` karena `status === 'out'`. Pin: tes source-level bahwa `AppShell` memeriksa `isDemo` sebelum redirect dan menyediakan "Keluar demo" (Task 2).

---

### Task 1: Onboarding carousel + flag + routing

**Files:**
- Create: `mobile/app/onboarding.jsx`, `mobile/src/screens/Onboarding.jsx`, `mobile/src/state/onboarding.js`, `mobile/tests/onboarding.test.mjs`
- Modify: `mobile/src/components/AppShell.jsx`, `mobile/tests/auth-pages-exports.test.mjs`

**Interfaces:**
- Consumes: `tokens(resolved)`, `useTheme()`, `useRouter()`, `SolarIcon`/`BrandMark`.
- Produces: `hasSeenOnboarding(storage)`, `setSeenOnboarding(storage)`, `ONBOARDING_KEY = 'ruang.onboarding.seen'`; `Onboarding` default + named export.

- [ ] **Step 1: Tulis tes yang gagal**

`mobile/tests/onboarding.test.mjs` (source + pure storage):
1. `ONBOARDING_KEY === 'ruang.onboarding.seen'`.
2. `hasSeenOnboarding` mengembalikan false untuk `null`, true untuk `'1'`.
3. `setSeenOnboarding` menulis `'1'` ke adapter.
4. `Onboarding.jsx` memuat tiga entri slide, `Animated.timing`, `useNativeDriver: true`, `pagingEnabled`, dan tidak ada `Animated.loop`.
5. Slide terakhir memuat teks `Masuk`, `Daftar`, `Lihat-lihat dulu`.
6. `AppShell.jsx` memanggil `hasSeenOnboarding` dan meng-redirect guest ke `/onboarding` bila belum pernah, `/login` bila sudah.
7. `app/onboarding.jsx` mengimpor `{ Onboarding }` dari `src/screens/Onboarding.jsx`; named export ada.

- [ ] **Step 2: Jalankan tes, pastikan gagal**

Run: `cd mobile && node --test tests/onboarding.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implementasi**

`onboarding.js`: fungsi murni + adapter SecureStore. `Onboarding.jsx`: carousel paging tiga slide (ilustrasi dari StyleSheet/SVG + token), animasi fade/translate stagger saat slide aktif, dot aktif melebar, CTA akhir fade-up, tombol press-scale. `app/onboarding.jsx`: wrapper tipis, header disembunyikan. `AppShell.jsx`: pada `status === 'out'`, cek flag; tujuan `/onboarding` atau `/login`; tulis flag hanya setelah onboarding selesai/lewati. Jangan mengubah `session.status` atau logika auth.

- [ ] **Step 4: Jalankan tes + export**

Run: `cd mobile && npm test && npx expo export --platform ios --platform android`
Expected: PASS, dua bundle.

- [ ] **Step 5: Catatan**

Jangan commit. Perbarui laporan; verifikasi Orca dilakukan di Task 3.

---

### Task 2: Demo provider + data + injeksi ke hook

**Files:**
- Create: `mobile/src/state/DemoProvider.jsx`, `mobile/src/shared/demo-data.js`, `mobile/tests/demo-data.test.mjs`, `mobile/tests/demo-hook.test.mjs`
- Modify: `mobile/app/_layout.jsx`, `mobile/src/components/AppShell.jsx`, `mobile/src/hooks/useLedgerData.js`

**Interfaces:**
- Consumes: `initialIncomes/initialBudgets/initialExpenses` dari `src/shared/sample-data.js`, `monthKey()/todayISO()` dari shared money.
- Produces: `buildDemoData(now = new Date())` → `{ profile, budgets, expenses, incomes }`; `DemoProvider` expose `{ isDemo, data, enterDemo, exitDemo }`; `useDemo()`; `useLedgerData(client, options, demoData = null)`.

- [ ] **Step 1: Tulis tes yang gagal**

`mobile/tests/demo-data.test.mjs`:
1. `buildDemoData(new Date('2026-11-15T00:00:00'))` mengembalikan 5 budgets, 6 expenses, 2 incomes.
2. Setiap `spent_on`/`received_on` berawalan `2026-11`.
3. Setiap expense punya `budgets: {id,name,color}` yang cocok dengan category_id.
4. `user_id === 'demo'` pada semua baris; tidak ada field `password`/`token`.

`mobile/tests/demo-hook.test.mjs` (source-level):
1. `useLedgerData.js` menerima parameter ketiga `demoData`.
2. Ada cabang awal yang mengembalikan data demo tanpa memanggil `client.request`, dengan `loading:false`, `reload`/`patchData` no-op.
3. `AppShell.jsx` memeriksa `isDemo` sebelum redirect dan menampilkan "Keluar demo".
4. `_layout.jsx` membungkus pohon dengan `DemoProvider`.

- [ ] **Step 2: Jalankan tes, pastikan gagal**

Run: `cd mobile && node --test tests/demo-data.test.mjs tests/demo-hook.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implementasi**

`demo-data.js`: petakan tanggal contoh ke bulan `now`, tambah `budgets` join dan `user_id`. `DemoProvider.jsx`: state `isDemo`, `data = buildDemoData()`, `enterDemo/exitDemo`. `useLedgerData`: parameter ketiga; bila ada, return data tanpa fetch. `AppShell`: `const { isDemo, exitDemo } = useDemo()`; lewati redirect guest saat demo; tampilkan tombol "Keluar demo" → `exitDemo()` + `router.replace('/login')`. Root layout: pasang `DemoProvider` di dalam `ThemeProvider`/`SessionProvider`. Onboarding "Lihat-lihat dulu" memanggil `enterDemo()` lalu `router.replace('/')` (Task 1 perlu menambahkan pemanggilan ini bila belum ada).

- [ ] **Step 4: Jalankan tes + export**

Run: `cd mobile && npm test && npx expo export --platform ios --platform android`
Expected: PASS.

- [ ] **Step 5: Catatan**

Jangan commit.

---

### Task 3: Mode demo pada lima layar + verifikasi visual

**Files:**
- Modify: `mobile/src/screens/Dashboard.jsx`, `Transactions.jsx`, `History.jsx`, `Settings.jsx`, `Profile.jsx`, `mobile/tests/auth-pages-exports.test.mjs`
- Create: `mobile/tests/demo-screens.test.mjs`

**Interfaces:**
- Consumes: `useDemo()` (Task 2), `useLedgerData(client, options, demo.data)` (Task 2).
- Produces: banner "Mode demo — perubahan tidak disimpan" pada tiap layar; aksi tulis disabled.

- [ ] **Step 1: Tulis tes yang gagal**

`mobile/tests/demo-screens.test.mjs`: untuk kelima layar, source harus mengandung `useDemo()` dan `demo.data` pada pemanggilan `useLedgerData`; keempat layar dengan aksi tulis (Dashboard tidak menulis) harus mengandung `isDemo` pada jalur simpan/hapus; semua harus memuat teks banner.

- [ ] **Step 2: Jalankan tes, pastikan gagal**

Run: `cd mobile && node --test tests/demo-screens.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implementasi**

Tiap layar: `const { isDemo, data: demoData } = useDemo();` lalu `useLedgerData(client, OPTIONS, demoData)`; bila `isDemo`, tampilkan banner dan disable tombol/form yang menulis (simpan, hapus, arsip, upload avatar, ganti tema/password, hapus akun). Jangan mengubah perhitungan atau tampilan data.

- [ ] **Step 4: Verifikasi Orca CLI + gates**

Run: `cd mobile && npm test && npx expo export --platform ios --platform android`; buka `http://localhost:8081` di browser Orca: splash → carousel 3 slide → "Lihat-lihat dulu" → Ringkasan terisi → pindah tab → tombol tulis disabled → "Keluar demo" → auth. Ulangi dengan flag sudah ada → langsung auth.

- [ ] **Step 5: Catatan**

Jangan commit. Laporkan temuan visual.

---

## Self-Review

- Spec coverage: carousel+animasi (Task 1), flag & routing (Task 1), demo data & provider (Task 2), demo menyeluruh read-only (Task 2+3), Orca (Task 3). Lengkap.
- Step scan: tiap step punya hasil yang bisa dicek; tidak ada body algoritma yang ditulis penuh.
- Type consistency: `ONBOARDING_KEY`, `useDemo()`, `buildDemoData()`, `useLedgerData(client, options, demoData)` konsisten di ketiga task.
- Review focus: kelima risiko punya tes di task yang owning kodenya.
- Proportion: plan lebih pendek dari kode yang dijelaskan.
