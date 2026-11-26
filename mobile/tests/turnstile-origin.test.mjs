/**
 * Turnstile is bound to the ruang API origin. `react-native-webview@14` only
 * honours `baseUrl` inside `source={{ html, baseUrl }}`; as a top-level WebView
 * prop it is ignored and the widget runs on about:blank with an opaque origin,
 * which Cloudflare refuses — sign-in, sign-up and Google all fail once the
 * captcha is enforced. The widget imports React Native, so this is a source
 * check paired with the pure `apiBaseURL()` it must use.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { apiBaseURL } from '../src/config.js';

const mobileRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const widget = readFileSync(join(mobileRoot, 'src/components/TurnstileWidget.jsx'), 'utf8');

test('the WebView sets baseUrl inside source, not as an ignored top-level prop', () => {
  assert.match(
    widget,
    /source=\{\{\s*html:\s*'<html><body><\/body><\/html>',\s*baseUrl:\s*baseURL\s*\?\?\s*apiBaseURL\(\)\s*\}\}/,
    'use source.baseUrl — react-native-webview ignores a top-level baseUrl prop',
  );
  assert.doesNotMatch(widget, /^\s*baseUrl=/m, 'there must be no top-level baseUrl prop');
  assert.doesNotMatch(widget, /about:blank/, 'an opaque origin cannot validate Turnstile');
});

test('the fallback baseUrl is the API origin the site key is bound to', () => {
  assert.match(widget, /import \{ apiBaseURL \} from '\.\.\/config\.js'/);
  const configured = process.env.EXPO_PUBLIC_API_URL;
  const expected = configured
    ? String(configured).replace(/\/+$/, '')
    : 'https://ruang-cashflow.vercel.app';
  assert.equal(apiBaseURL(), expected);
  assert.equal(new URL(apiBaseURL()).origin, apiBaseURL(), 'baseUrl must be an origin, not a path');
});

test('a caller-supplied baseURL still overrides the API default', () => {
  assert.match(widget, /\{\s*onToken,\s*baseURL,\s*style\s*\}/);
  assert.match(widget, /baseUrl:\s*baseURL\s*\?\?\s*apiBaseURL\(\)/);
});
