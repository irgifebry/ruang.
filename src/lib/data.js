/**
 * Sample data for the signed-out welcome page only.
 *
 * This is a fixed illustration, not a seed for the database: new accounts get
 * their five categories from the `on_auth_user_created` trigger instead. Nothing
 * in the authenticated app reads from this file — it exists so the marketing
 * page can show realistic-looking numbers without an account.
 */

export const initialSalary = 12_500_000;

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
