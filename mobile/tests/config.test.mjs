import assert from 'node:assert/strict';
import { test } from 'node:test';

import { apiBaseURL, avatarBaseURL } from '../src/config.js';

test('apiBaseURL strips trailing slash from an explicit apiUrl', () => {
  assert.equal(apiBaseURL({ apiUrl: 'https://x.test/' }), 'https://x.test');
});

test('apiBaseURL without arguments returns the production default origin', () => {
  const saved = process.env.EXPO_PUBLIC_API_URL;
  delete process.env.EXPO_PUBLIC_API_URL;
  try {
    const base = apiBaseURL();
    assert.equal(base, 'https://ruang-cashflow.vercel.app');
    assert.ok(!base.endsWith('/'), 'result must not end with a slash');
    new URL(base); // parses as a URL
  } finally {
    if (saved !== undefined) process.env.EXPO_PUBLIC_API_URL = saved;
  }
});

test('apiBaseURL uses EXPO_PUBLIC_API_URL when set and no apiUrl is passed', () => {
  const saved = process.env.EXPO_PUBLIC_API_URL;
  process.env.EXPO_PUBLIC_API_URL = 'https://env.test/';
  try {
    assert.equal(apiBaseURL(), 'https://env.test');
  } finally {
    if (saved === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = saved;
  }
});

test('avatarBaseURL is the public Storage origin, not the app API origin', () => {
  const saved = process.env.EXPO_PUBLIC_SUPABASE_URL;
  delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  try {
    const base = avatarBaseURL();
    assert.match(base, /^https:\/\/[a-z0-9]+\.supabase\.co$/);
    assert.equal(avatarBaseURL({ supabaseUrl: 'https://self.test/' }), 'https://self.test');
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://env-storage.test/';
    assert.equal(avatarBaseURL(), 'https://env-storage.test');
  } finally {
    if (saved === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    else process.env.EXPO_PUBLIC_SUPABASE_URL = saved;
  }
});
