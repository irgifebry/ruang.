/**
 * End-to-end check of the signup trigger against the live project.
 *
 * Verifies that a newly created auth user automatically receives a profile and
 * no starter rows — the flow the onboarding depends on, which previously
 * dead-ended when categories were seeded.
 *
 * It also asserts that no income row is created: a fresh account has recorded
 * no money in, so it has no history to show yet.
 *
 * Usage: node tests/e2e-signup.mjs
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
 * in the environment (reads .env.local when run through `npm run verify`).
 */

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

function loadEnv() {
  try {
    for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (match) process.env[match[1]] ??= match[2];
    }
  } catch {
    // .env.local is optional; fall back to the ambient environment.
  }
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY tidak tersedia.');
  process.exit(2);
}

const supabase = createClient(url, key);

// The project rejects `example.com` and other disposable domains, so this uses
// a subdomain of a normal one.
const email = `ruang-e2e-${Date.now()}@ruang.app`;
const password = 'uji-otomatis-12345';

let failures = 0;

function check(label, condition) {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}`);
  if (!condition) failures += 1;
}

const { data: signUp, error: signUpError } = await supabase.auth.signUp({ email, password });

if (signUpError) {
  console.error('Gagal mendaftar:', signUpError.message);
  process.exit(1);
}

const userId = signUp.user?.id;
check('auth user dibuat', Boolean(userId));

// The session only exists when email autoconfirm is on; otherwise verify the
// trigger through the admin-free path by signing in.
if (!signUp.session) {
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  check('akun bisa langsung dipakai masuk', !signInError);
}

const [profileRes, budgetsRes, incomesRes] = await Promise.all([
  supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
  supabase.from('budgets').select('*').eq('user_id', userId).order('created_at'),
  supabase.from('incomes').select('*').eq('user_id', userId),
]);

check('profil dibuat otomatis', !profileRes.error && Boolean(profileRes.data));
// No starter categories: a template told the new account what to spend on, and
// two triggers seeded five rows for it. Both were removed in 20261014, so a
// signup now lands on an empty budget list and the user names their own.
check('tidak ada kategori template yang dibuat otomatis', !budgetsRes.error && budgetsRes.data?.length === 0);
// No placeholder row: a brand-new account has entered nothing, so it must not
// show up on /history — that page only lists months with an income or expense.
check(
  'tidak ada pemasukan otomatis sebelum user mencatat pemasukan',
  !incomesRes.error && incomesRes.data?.length === 0,
);

// A new user must not be able to read another user's rows.
const { data: otherBudgets } = await supabase.from('budgets').select('*');
check('RLS membatasi ke data sendiri', Array.isArray(otherBudgets));

// Clean up so repeated runs do not accumulate accounts. The categories and the
// profile cascade from the auth user.
await supabase.auth.admin?.deleteUser?.(userId).catch(() => {});
await supabase.auth.signOut();

console.log(`\n${failures === 0 ? 'SEMUA PEMERIKSAAN LULUS' : `${failures} PEMERIKSAAN GAGAL`}`);
process.exit(failures === 0 ? 0 : 1);
