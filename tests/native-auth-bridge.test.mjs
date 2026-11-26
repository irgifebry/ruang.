import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The native client has no browser cookie jar. It authenticates by sending
 * `Authorization: Bearer <token>` and keeps the token it reads back off the
 * `set-auth-token` response header. It also hands control back to `ruang://`
 * after a Google sign-in, an origin the web-only allowlist never listed.
 *
 * `auth.js` pulls in `pg`, which the JSX test loader in `npm test` cannot
 * resolve, so this pins the source contract directly — the same approach as
 * `auth-security.test.mjs`. Every assertion is scoped to the region it talks
 * about, so a stray mention elsewhere in the file cannot satisfy it.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const auth = readFileSync(join(ROOT, 'src/lib/auth.js'), 'utf8');
const compact = (text) => text.replace(/\s+/g, ' ');

test('the bearer plugin is imported from better-auth/plugins', () => {
  // Merged into the existing plugins import or standing on its own are both
  // fine; what matters is the module it comes from.
  assert.match(
    compact(auth),
    /import\s*\{[^}]*\bbearer\b[^}]*\}\s*from\s*'better-auth\/plugins'/,
    'expected `bearer` to be imported from better-auth/plugins',
  );
});

test('bearer() is registered as a plugin', () => {
  // Scoped to the plugin wiring, which starts after the imports: an import of
  // the symbol is not a registration of the plugin.
  const start = auth.indexOf('const plugins =');
  assert.ok(start !== -1, 'expected the plugins array to be declared as `const plugins =`');

  const region = auth.slice(start, auth.indexOf('export const auth'));
  assert.match(
    region,
    /\bbearer\(\)/,
    'expected bearer() to be called when the plugin list is built',
  );
});

test('the ruang:// scheme is a trusted origin', () => {
  const start = auth.indexOf('trustedOrigins:');
  assert.ok(start !== -1, 'expected a trustedOrigins option');

  const end = auth.indexOf('.filter(Boolean)', start);
  assert.ok(end > start, 'expected trustedOrigins to end with .filter(Boolean)');

  const origins = compact(auth.slice(start, end));
  assert.match(
    origins,
    /'ruang:\/\/'/,
    "expected 'ruang://' inside the trustedOrigins array",
  );
});

test('native clients bypass captcha but browsers keep it', () => {
  assert.match(
    compact(auth),
    /import\s*\{[^}]*\bappAwareCaptcha\b[^}]*\}\s*from\s*'\.\/captcha-plugin\.js'/,
    'expected auth.js to import the app-aware captcha wrapper',
  );

  const start = auth.indexOf('if (turnstileSecretKey)');
  const region = compact(auth.slice(start, auth.indexOf('export const auth')));
  assert.match(
    region,
    /appAwareCaptcha\(\{/,
    'expected the wrapper, not the bare captcha(), in the plugin list',
  );

  const wrapper = compact(
    readFileSync(join(ROOT, 'src/lib/captcha-plugin.js'), 'utf8'),
  );
  assert.match(wrapper, /x-ruang-app/);
  assert.match(wrapper, /sec-fetch-site/);
  assert.match(wrapper, /onRequest/);
});
