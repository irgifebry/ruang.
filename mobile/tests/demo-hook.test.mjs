/**
 * Task 2 gate for the demo handoff and the read-only hook path.
 *
 * These modules import `react-native` / `expo-router`, so Node cannot load
 * them; the wiring is checked at source level — the same protection Tasks 9,
 * 11 and 14 needed for undefined named imports and bare calls that `expo
 * export` bundles without a warning.
 *
 * Four bindings matter:
 *  1. the hook really takes demo data as a third argument;
 *  2. the demo path returns data without ever reaching `client.request`;
 *  3. the shell lets a demo guest stay on the ledger screens and offers a way
 *     out (otherwise "Lihat-lihat dulu" lands on /login);
 *  4. the provider wraps the tree, so both ends of the handoff are mounted.
 *
 * Run with: node --test tests/demo-hook.test.mjs (or: npm test).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(mobileRoot, path), 'utf8');

/** A source slice with explicit markers, so a missing marker is a real failure. */
function slice(source, from, to) {
  const start = source.indexOf(from);
  assert.ok(start >= 0, `missing source marker: ${from}`);
  const end = to ? source.indexOf(to, start) : source.length;
  assert.ok(end > start, `missing source marker: ${to}`);
  return source.slice(start, end);
}

test('useLedgerData accepts demo data as its third argument', () => {
  const hook = read('src/hooks/useLedgerData.js');
  assert.match(hook, /export function useLedgerData\(client, requestOptions, demoData = null\)/);
  // One ref mirrors the argument, so `load` cannot keep a stale snapshot when
  // a visitor enters or leaves demo mode without a remount.
  assert.match(hook, /const demoRef = useRef\(demoData\);/);
  assert.match(hook, /demoRef\.current = demoData;/);
});

test('the only client.request in the hook sits behind the demo guard', () => {
  const hook = read('src/hooks/useLedgerData.js');
  const code = hook.replace(/\/\*[\s\S]*?\*\//g, '');
  const load = slice(hook, 'const load = useCallback', 'const apply = useCallback');
  assert.equal((code.match(/\.request\(/g) ?? []).length, 1, 'no second fetch path');
  assert.match(load, /if \(demoRef\.current != null\) return demoRef\.current;/);
  assert.match(load, /clientRef\.current\.request\(LEDGER_PATH, optionsRef\.current\)/);
  assert.ok(
    load.indexOf('if (demoRef.current != null)') < load.indexOf('clientRef.current.request'),
    'the demo guard must come before the network call',
  );
  // The load effect skips entirely in demo: no request and no refresh timer.
  const effect = slice(hook, 'useEffect(() => {', 'const reload = useCallback');
  assert.match(effect, /if \(demoActive\) return/);
  assert.match(effect, /\[reloadToken, load, apply, demoActive\]/);
});

test('the demo branch returns data with no loading and no-op callbacks', () => {
  const hook = read('src/hooks/useLedgerData.js');
  assert.match(hook, /const noop = \(\) => \{\};/);
  const branch = slice(hook, 'if (demoActive) {', 'return { data, loading, error, syncError, reload, patchData };');
  assert.match(branch, /data: demoData/);
  assert.match(branch, /loading: false/);
  assert.match(branch, /error: null/);
  assert.match(branch, /syncError: null/);
  assert.match(branch, /reload: noop/);
  assert.match(branch, /patchData: noop/);
  // All hooks are called before the branch, so toggling demo cannot break the
  // hook order on a mounted screen.
  assert.ok(
    hook.indexOf('if (demoActive) {') > hook.indexOf('useState(true)') &&
      hook.indexOf('if (demoActive) {') > hook.indexOf('useEffect(() => {'),
  );
});

test('DemoProvider owns the flag and the dataset without any API access', () => {
  const provider = read('src/state/DemoProvider.jsx');
  assert.match(provider, /export function DemoProvider\(/);
  assert.match(provider, /export function useDemo\(\)/);
  assert.match(provider, /useState\(false\)/);
  assert.match(provider, /useState\(\(\) => buildDemoData\(\)\)/);
  assert.match(provider, /setIsDemo\(true\)/);
  assert.match(provider, /setIsDemo\(false\)/);
  assert.match(provider, /\{ isDemo, data, enterDemo, exitDemo \}/);
  assert.doesNotMatch(provider, /client\.request|fetch\(|api\/ledger|signIn|signUp/);
  const data = read('src/shared/demo-data.js');
  assert.doesNotMatch(data, /client\.request|fetch\(|SecureStore|localStorage/);
});

test('AppShell checks isDemo before redirecting and offers Keluar demo', () => {
  const shell = read('src/components/AppShell.jsx');
  assert.match(shell, /const \{ isDemo, exitDemo \} = useDemo\(\);/);
  const effect = slice(shell, 'useEffect(() => {', '}, [session.status, router, isDemo]);');
  assert.ok(
    effect.indexOf('if (isDemo') < effect.indexOf("session.status !== 'out'"),
    'a demo guest must never be redirected',
  );
  // The shell must also render children in demo, not hold on a session gate.
  assert.match(shell, /if \(!isDemo && session\.status !== 'in'\)/);
  assert.match(shell, /Keluar demo/);
  const labelAt = shell.indexOf('Keluar demo');
  const exit = shell.slice(Math.max(0, labelAt - 400), labelAt + 100);
  assert.match(exit, /exitDemo\(\);/);
  assert.match(exit, /router\.replace\('\/login'\)/);
  // The existing guest routing is still there for non-demo visitors.
  assert.match(shell, /seen\s*\?\s*'\/login'\s*:\s*'\/onboarding'/);
});

test('the root layout mounts DemoProvider inside both providers, outside screens', () => {
  const layout = read('app/_layout.jsx');
  assert.match(layout, /import \{ DemoProvider \} from ['"][^'"]*src\/state\/DemoProvider\.jsx['"]/);
  assert.equal((layout.match(/<DemoProvider>/g) ?? []).length, 1);
  const themeAt = layout.indexOf('<ThemeProvider>');
  const sessionAt = layout.indexOf('<SessionProvider');
  const demoAt = layout.indexOf('<DemoProvider>');
  const stackAt = layout.indexOf('<Stack');
  assert.ok(themeAt >= 0 && sessionAt > themeAt, 'DemoProvider needs both outer providers');
  assert.ok(demoAt > sessionAt && stackAt > demoAt, 'DemoProvider must wrap the screens');
});

test('the onboarding route wires Lihat-lihat dulu to enterDemo', () => {
  const route = read('app/onboarding.jsx');
  assert.match(route, /import \{ useDemo \} from ['"][^'"]*src\/state\/DemoProvider\.jsx['"]/);
  assert.match(route, /const \{ enterDemo \} = useDemo\(\);/);
  assert.match(route, /<Onboarding storage=\{secureStorage\} onLookAround=\{enterDemo\} \/>/);
});
