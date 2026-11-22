/**
 * Static guards for the Task 5 a11y / polish fixes.
 *
 * These are source assertions rather than render tests on purpose: the files
 * under test either import `next/navigation` (which the render suite cannot
 * load) or are server components with no test renderer, but the regressions
 * they protect against are all textual — a missing id, a literal that came
 * back, a class that no longer matches its CSS.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { avatarUrl } from '../src/lib/avatar.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

// ---------------------------------------------------------------------------
// Skip link
// ---------------------------------------------------------------------------

test('every bare route renders the #konten skip-link target exactly once', () => {
  // The link lives in the root layout, outside every route. A bare page with
  // no target made it a no-op for exactly the guests who need it most.
  for (const path of [
    '../src/app/login/page.jsx',
    '../src/app/register/page.jsx',
    '../src/app/reset-password/page.jsx',
    '../src/app/error.jsx',
    '../src/app/global-error.jsx',
    '../src/app/loading.jsx',
  ]) {
    const matches = read(path).match(/id="konten"/g) ?? [];
    assert.equal(matches.length, 1, `${path} must have exactly one skip-link target`);
  }
});

// ---------------------------------------------------------------------------
// Account menu
// ---------------------------------------------------------------------------

test('the closed account popover is hidden from the tab order', () => {
  const css = read('../src/app/globals.css');
  const closed = css.match(/\.account-menu\s*\{([^}]*)\}/);
  const open = css.match(/\.account-menu-open\s*\{([^}]*)\}/);

  assert.ok(closed, 'no .account-menu rule');
  assert.ok(open, 'no .account-menu-open rule');
  assert.match(closed[1], /visibility:\s*hidden/, 'closed menu is still focusable');
  assert.match(open[1], /visibility:\s*visible/, 'open menu stays hidden');
  assert.match(closed[1], /visibility 180ms/, 'the fade-out drops the menu instantly');

  const sidebar = read('../src/components/Sidebar.jsx');
  assert.match(sidebar, /inert=\{!menuOpen\}/);
  assert.match(sidebar, /aria-hidden=\{!menuOpen\}/);
  assert.match(sidebar, /ref=\{menuTriggerRef\}/);
});

test('Escape closes the account popover and returns focus to its trigger', () => {
  const sidebar = read('../src/components/Sidebar.jsx');
  assert.match(sidebar, /event\.key !== 'Escape'/, 'no Escape handler for the popover');
  assert.match(sidebar, /menuTriggerRef\.current\?\.focus\(\)/, 'focus is not restored');
});

// ---------------------------------------------------------------------------
// Mobile bar height
// ---------------------------------------------------------------------------

test('the mobile bar height is one token, not three handwritten copies', () => {
  const css = read('../src/app/globals.css');
  const config = read('../tailwind.config.cjs');
  const sidebar = read('../src/components/Sidebar.jsx');
  const shell = read('../src/components/AppShell.jsx');

  assert.match(css, /--mobile-bar-h:\s*56px/);
  assert.ok(config.includes("'mobile-bar': 'var(--mobile-bar-h)'"));
  assert.ok(config.includes("'mobile-bar-scroll': 'calc(var(--mobile-bar-h) + 14px)'"));

  assert.match(sidebar, /h-mobile-bar/);
  assert.doesNotMatch(sidebar, /h-\[56px\]/);
  assert.match(shell, /pt-mobile-bar/);
  assert.doesNotMatch(shell, /pt-\[56px\]/);
});

// ---------------------------------------------------------------------------
// Avatar URL
// ---------------------------------------------------------------------------

test('avatarUrl is safe for a missing path and builds the public URL once', () => {
  const previous = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  try {
    assert.equal(avatarUrl(null), null);
    assert.equal(avatarUrl(''), null);
    assert.equal(
      avatarUrl('user-1/avatar-a.png'),
      'https://example.supabase.co/storage/v1/object/public/avatars/user-1/avatar-a.png',
    );
    assert.equal(
      avatarUrl('user-1/avatar a.png', 7),
      'https://example.supabase.co/storage/v1/object/public/avatars/user-1/avatar%20a.png?v=7',
    );
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previous;
  }
});

test('both avatar consumers call the helper instead of building the URL', () => {
  for (const path of [
    '../src/components/Sidebar.jsx',
    '../src/app/settings/profile/page.jsx',
  ]) {
    const source = read(path);
    assert.match(source, /avatarUrl\(/, `${path} does not call the helper`);
    assert.ok(!source.includes('/storage/v1/object/public/avatars/'), `${path} still builds the URL`);
    assert.ok(!source.includes('getPublicUrl'), `${path} still calls getPublicUrl`);
  }
});

// ---------------------------------------------------------------------------
// Button / Suspense / dead tokens
// ---------------------------------------------------------------------------

test('the avatar removal action is a ghost button', () => {
  const source = read('../src/app/settings/profile/page.jsx');
  assert.ok(!source.includes('tone="ghost"'), 'an unsupported tone came back');
  assert.match(source, /<GhostButton onClick=\{handleRemoveAvatar\}/);
});

test('reset-password puts useSearchParams behind a Suspense boundary', () => {
  const source = read('../src/app/reset-password/page.jsx');
  assert.match(source, /<Suspense fallback=\{null\}>/);
  assert.match(source, /function ResetPasswordInner\(\)/);
});

test('reset-password validates email locally with friendly copy', () => {
  const source = read('../src/app/reset-password/page.jsx');
  assert.match(source, /Isi alamat email dengan benar\./);
  assert.ok(!source.includes('[body.email]'), 'a Better Auth field path leaked into the UI');
});

test('tokens with no consumers were removed from the Tailwind config', () => {
  const config = read('../tailwind.config.cjs');
  for (const token of [
    'ruang-accent-soft',
    'ruang-bubble',
    'cat-blue',
    'cat-orange',
    'cat-violet',
    'cat-pink',
  ]) {
    assert.ok(!config.includes(token), `${token} is still declared`);
  }
});

test('form primitives no longer carry salary-era copy', () => {
  assert.ok(!read('../src/components/form.jsx').includes('gaji'));
});
