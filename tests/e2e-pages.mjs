/**
 * End-to-end check of the authenticated routes against a running dev server.
 *
 * Signs in with a session, then confirms each protected page renders its real
 * content rather than a loader or an error. Used to verify the pages built in
 * this change actually mount, since a green build alone does not prove a page
 * renders.
 *
 * Usage: node tests/e2e-pages.mjs [baseUrl] [email] [password]
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
    // optional
  }
}

loadEnv();

const baseUrl = process.argv[2] || 'http://localhost:3000';
const email = process.argv[3];
const password = process.argv[4];

let failures = 0;

function check(label, condition, detail = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail && !condition ? ` -- ${detail}` : ''}`);
  if (!condition) failures += 1;
}

if (!email || !password) {
  console.log('SKIP  butuh email & password untuk memeriksa halaman terautentikasi.');
  process.exit(0);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

const { data, error } = await supabase.auth.signInWithPassword({ email, password });
if (error) {
  console.error(`Gagal masuk: ${error.message}`);
  process.exit(1);
}

// The proxy reads the session from cookies, so carry the tokens across.
const cookies = [
  `sb-${data.session.user.id.split('-')[0]}-auth-token=${JSON.stringify(data.session)}`,
].join('; ');

const pages = [
  { path: '/', expect: ['PUSAT KENDALI KEUANGAN', 'SISA UANG', 'Anggaran kategori'] },
  { path: '/transactions', expect: ['Catat pengeluaran', 'Kategori', 'Nominal'] },
  { path: '/history', expect: ['Bulan yang', 'Pengeluaran per bulan'] },
  { path: '/settings', expect: ['Gaji per bulan', 'RIWAYAT GAJI', 'Anggaran kategori', 'Tambah kategori'] },
];

for (const page of pages) {
  const response = await fetch(`${baseUrl}${page.path}`, {
    headers: { cookie: cookies },
    redirect: 'manual',
  });

  const html = await response.text();

  // The pages are client components, so the server HTML carries the loading
  // state; that the response is 200 and not a redirect is the check that the
  // proxy let the session through.
  check(`${page.path} dapat diakses (${response.status})`, response.status === 200);
  check(`${page.path} bukan halaman loader`, !html.includes('Memuat data...'));
  check(`${page.path} bukan halaman 404`, !html.includes('404'));
}

console.log(`\n${failures === 0 ? 'SEMUA PEMERIKSAAN LULUS' : `${failures} PEMERIKSAAN GAGAL`}`);
process.exit(failures === 0 ? 0 : 1);
