# SDD ledger — plan: docs/superpowers/plans/2026-11-22-pemasukan-only.md

Ruling: eksekusi di working tree utama, bukan worktree — tool subagent harness memakai
satu direktori kerja dan perubahan belum di-commit milik pengguna harus tetap terlihat.
Biayanya: subagent tidak bisa commit per task; integrasi & verifikasi terpusat.

Ruling: Task 1, 4, 6 paralel (file lepas); Task 2, 3, 5 paralel setelah Task 1 selesai.
Task 2 memiliki `layout.jsx` penuh; Task 5 tidak menyentuhnya.

Task 1: dispatched (Wave 1)
Task 4: complete — migration + schema.sql written, static check passed; reconciled
  (AGENTS.md sentence about ownership policies vs no policies will be fixed at integration)
Task 6: complete — AGENTS.md/README/setup/e2e-signup updated; RLS-policy sentence
  reconciled at integration (no policies, text ids cannot use auth.uid())
Ruling: migration produksi ditunda sampai kode baru terdeploy — user setuju. Alasan:
kode lama masih query salary_records, sehingga drop tabel sekarang memicu 500 di
/api/ledger. Urutan: verifikasi -> commit/push (butuh izin user) -> deploy -> backup
tabel -> jalankan 20261122_incomes_only.sql via MCP. Simpan keputusan ini.

Task 1: complete — money/charts/ledger/API income-only, 56/56 logic tests pass

Integration: 312/312 npm test, npm run build clean, git diff --check clean.
Extra fixes by orchestrator: token validation for reset-password (+ 2 tests),
/auth/callback docs corrected in AGENTS.md/README/setup.md, scroll-mt token,
register metadata.

NEXT: minta izin commit + push ke main -> deploy Vercel -> backup tabel -> migration.

Task 2: complete — UI/copy income-only, 49/49 render tests pass
Task 3: complete — authoritative session (query.disableCookieCache), session.update
  hook, purge re-check with FOR UPDATE, rate limits, captcha social, escaped reset
  email; 11/11 new auth tests pass. Full suite 308/310 with 2 failures owned by Task 1.
Task 5: complete — a11y/components done, 47/47 owned tests pass; build clean.
  DONE at integration: scroll-mt token applied to settings/page.jsx, register
  metadata "gaji" fixed by orchestrator.
