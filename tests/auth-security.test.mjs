import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Guards for the auth fixes that cannot be exercised by loading the modules:
 * `auth.js` and `account-purge.js` pull in `pg`, which the JSX test loader
 * cannot resolve (it forces ESM format on pg's CommonJS entry). These tests
 * therefore pin the source contracts directly, the same way the sidebar and
 * theme static tests pin their invariants.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = (path) => readFileSync(join(ROOT, path), 'utf8');
const compact = (text) => text.replace(/\s+/g, ' ');

const authSession = source('src/lib/auth-session.js');
const accountRoute = source('src/app/api/account/route.js');
const avatarRoute = source('src/app/api/avatar/route.js');
const ledgerRoute = source('src/app/api/ledger/route.js');
const auth = source('src/lib/auth.js');
const purge = source('src/lib/account-purge.js');
const deletion = source('src/lib/account-deletion.js');
const cronRoute = source('src/app/api/cron/purge-deletions/route.js');
const callbackRoute = source('src/app/auth/callback/route.js');

test('the authoritative helper bypasses the cookie cache the way Better Auth 1.7.7 expects', () => {
  assert.match(authSession, /export async function getAuthoritativeSession\(headers\)/);
  // `getSession` declares `query: getSessionQuerySchema` and reads
  // `ctx.query.disableCookieCache`. A top-level flag is silently ignored.
  assert.match(
    compact(authSession),
    /auth\.api\.getSession\(\s*\{\s*headers,\s*query:\s*\{\s*disableCookieCache:\s*true,?\s*\},?\s*\}\s*\)/,
  );
});

test('every sensitive endpoint gates on the authoritative session helper', () => {
  for (const [name, src] of [
    ['/api/account', accountRoute],
    ['/api/avatar', avatarRoute],
  ]) {
    assert.match(src, /getAuthoritativeSession/, `${name} must import the helper`);
    assert.match(src, /getAuthoritativeSession\(await headers\(\)\)/, `${name} must call the helper`);
    assert.doesNotMatch(src, /auth\.api\.getSession/, `${name} must not read the cached session`);
  }

  // GET, PATCH (request/cancel) and POST (set password) all go through the
  // shared gate; avatar covers both POST and DELETE.
  assert.ok((accountRoute.match(/await currentUser\(\)/g) ?? []).length >= 3);
  assert.ok((avatarRoute.match(/await currentUser\(request\)/g) ?? []).length >= 2);
});

test('/api/ledger deliberately stays on the cached session', () => {
  assert.doesNotMatch(ledgerRoute, /getAuthoritativeSession/);
});

test('the purge re-checks the flag and the deadline inside the delete transaction', () => {
  assert.match(purge, /export async function assertStillDue\(client, id\)/);

  const guard = purge.slice(purge.indexOf('export async function assertStillDue'));
  assert.match(guard, /client\.query\(/);
  assert.match(guard, /FOR UPDATE/);
  assert.match(guard, /deletion_requested_at IS NOT NULL/);
  assert.match(guard, /deletion_requested_at <= now\(\) - make_interval\(days => \$2\)/);
  assert.match(guard, /rowCount !== 1/);
  assert.match(guard, /error\.code = 'DELETION_CANCELLED'/);

  // The guard must run before any DELETE in the same transaction, and the
  // sweep has to opt in to it.
  const destroy = purge.slice(purge.indexOf('async function destroyRows'), purge.indexOf('async function removeAvatars'));
  assert.ok(
    destroy.indexOf('assertStillDue(client, id)') < destroy.indexOf('DELETE FROM expenses'),
    'the re-check must precede the deletes',
  );
  assert.match(destroy, /if \(requireDue\) await assertStillDue\(client, id\)/);
  assert.match(purge, /destroyRows\(\[row\.id\], \{ requireDue: true, pool \}\)/);
  assert.match(purge, /error\?\.code === 'DELETION_CANCELLED'/);
  assert.match(cronRoute, /purgeExpiredAccounts\(\)/);
});

test('a flag cleared after the select stops the purge before any DELETE', () => {
  // The JSX loader in `npm test` forces ESM onto pg's CommonJS entry, so the
  // purge module cannot be imported in-process. Run it in a plain child with
  // an injected pool instead: no database, but the real transaction flow.
  const moduleUrl = pathToFileURL(join(ROOT, 'src/lib/account-purge.js')).href;
  const script = `
    import { purgeExpiredAccounts } from ${JSON.stringify(moduleUrl)};
    async function sweep(guardRows) {
      const queries = [];
      const client = {
        query: async (sql) => {
          queries.push(sql);
          return sql.includes('FOR UPDATE') ? { rowCount: guardRows } : { rowCount: 1 };
        },
        release: () => {},
      };
      const pool = {
        query: async () => ({ rows: [{ id: 'u1', avatar_path: null }] }),
        connect: async () => client,
      };
      const purged = await purgeExpiredAccounts({ pool });
      return {
        purged,
        guardRan: queries.some((q) => q.includes('FOR UPDATE')),
        deletes: queries.filter((q) => q.startsWith('DELETE')).length,
        committed: queries.includes('COMMIT'),
        rolledBack: queries.includes('ROLLBACK'),
      };
    }
    console.log('RESULT ' + JSON.stringify({ cancelled: await sweep(0), due: await sweep(1) }));
  `;
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(run.status, 0, run.stderr);
  const line = run.stdout.split('\n').find((text) => text.startsWith('RESULT '));
  assert.ok(line, `no result from the purge sweep: ${run.stdout}`);
  const { cancelled, due } = JSON.parse(line.slice('RESULT '.length));

  assert.deepEqual(cancelled.purged, []);
  assert.equal(cancelled.guardRan, true);
  assert.equal(cancelled.deletes, 0, 'a cancelled flag must not delete a single row');
  assert.equal(cancelled.rolledBack, true);
  assert.equal(cancelled.committed, false);

  // The same sweep with the flag still set must actually destroy the account.
  assert.deepEqual(due.purged, ['u1']);
  assert.equal(due.guardRan, true);
  assert.equal(due.deletes, 7, 'expenses, incomes, budgets, profile, session, account, user');
  assert.equal(due.committed, true);
  assert.equal(due.rolledBack, false);
});

test('salary is gone from account deletion bookkeeping', () => {
  assert.doesNotMatch(purge, /salary_records/);
  assert.doesNotMatch(deletion, /salary_records/);
  assert.match(purge, /DELETE FROM incomes WHERE user_id = \$1/);
});

test('a refreshed session also reconciles a pending deletion, fail-open', () => {
  assert.match(auth, /create: \{ before: reconcileBeforeSession \}/);
  assert.match(auth, /update: \{ before: reconcileBeforeSession \}/);
  const helper = auth.slice(auth.indexOf('async function reconcileBeforeSession'), auth.indexOf('export const auth'));
  assert.match(helper, /try \{/);
  assert.match(helper, /return false/);
  assert.match(helper, /catch \(error\)/);
  assert.match(helper, /console\.error/);
  // A hook that throws must never lock every user out.
  assert.match(helper, /return undefined/);
});

test('the reset email escapes the URL before it touches the HTML', () => {
  assert.match(auth, /function escapeHtml\(value\)/);
  for (const entity of ['&amp;', '&lt;', '&gt;', '&quot;', '&#39;']) {
    assert.ok(auth.includes(entity), `missing HTML escape ${entity}`);
  }
  assert.match(auth, /const safeUrl = escapeHtml\(url\)/);
  assert.doesNotMatch(auth, /\$\{url\}/, 'the raw URL must never be interpolated');
  assert.match(auth, /\$\{safeUrl\}/);
});

test('built-in rate limiting covers sign-in, sign-up and password reset', () => {
  assert.match(auth, /rateLimit: \{/);
  assert.match(auth, /enabled: true/);
  for (const path of [
    '/sign-in/email',
    '/sign-in/social',
    '/sign-up/email',
    '/request-password-reset',
    '/reset-password',
  ]) {
    assert.ok(auth.includes(`'${path}': { window: 60`), `missing rate limit rule for ${path}`);
  }
});

test('captcha stays opt-in but covers social sign-in too', () => {
  assert.match(auth, /if \(turnstileSecretKey\)/);
  assert.match(auth, /provider: 'cloudflare-turnstile'/);
  assert.match(
    compact(auth),
    /endpoints:\s*\[\s*'\/sign-in\/email',\s*'\/sign-up\/email',\s*'\/sign-in\/social'\s*\]/,
  );
  // No Google credentials means no provider; no Turnstile keys means no plugin.
  assert.match(auth, /const socialProviders = googleClientId\s*\?/);
});

test('the dead callback stub only redirects; it does not exchange a code', () => {
  assert.doesNotMatch(callbackRoute, /searchParams\.get\('code'\)/);
  assert.match(callbackRoute, /url\.pathname = '\/login'/);
  assert.match(callbackRoute, /\?error=autentikasi-tidak-didukung/);
});
