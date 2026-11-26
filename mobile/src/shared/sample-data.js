/**
 * Sample figures kept only so the binding test can pin them against the web
 * app's `src/lib/data.js`. No screen renders them.
 *
 * Metro will not resolve a module outside the `mobile/` project root, so the
 * native app cannot import the web file directly. `tests/auth-pages-exports`
 * (auth-flow/pages) asserts these three arrays stay byte-for-byte equal to the
 * web source, which is the same protection an import would have given: the
 * illustration cannot drift between the two apps.
 *
 * These are fixed figures, not a seed. New accounts start empty and name
 * their own categories; no authenticated screen reads this file.
 */

export const initialIncomes = [
  { id: 'i1', description: 'Pemasukan bulanan', amount: 12_500_000, received_on: '2026-10-01', source: 'Utama' },
  { id: 'i2', description: 'Bonus proyek', amount: 1_500_000, received_on: '2026-10-08', source: 'Bonus' },
];

export const initialBudgets = [
  { id: 'food', name: 'Makan & minum', monthly_limit: 2_400_000, color: 'lime' },
  { id: 'home', name: 'Tempat tinggal', monthly_limit: 3_000_000, color: 'blue' },
  { id: 'transport', name: 'Transportasi', monthly_limit: 1_200_000, color: 'orange' },
  { id: 'bills', name: 'Tagihan', monthly_limit: 950_000, color: 'violet' },
  { id: 'lifestyle', name: 'Hiburan & gaya hidup', monthly_limit: 1_400_000, color: 'pink' },
];

export const initialExpenses = [
  { id: 'e1', description: 'Belanja mingguan', amount: 385_000, category_id: 'food', spent_on: '2026-10-07' },
  { id: 'e2', description: 'Kopi dan makan siang', amount: 96_000, category_id: 'food', spent_on: '2026-10-06' },
  { id: 'e3', description: 'Kartu transportasi', amount: 250_000, category_id: 'transport', spent_on: '2026-10-05' },
  { id: 'e4', description: 'Internet rumah', amount: 350_000, category_id: 'bills', spent_on: '2026-10-03' },
  { id: 'e5', description: 'Iuran tempat tinggal', amount: 3_000_000, category_id: 'home', spent_on: '2026-10-01' },
  { id: 'e6', description: 'Nonton akhir pekan', amount: 180_000, category_id: 'lifestyle', spent_on: '2026-10-01' },
];
