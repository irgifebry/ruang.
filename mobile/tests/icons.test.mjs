import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { solarPaths } from '../src/theme/solar-paths.js';

const brandMarkPath = fileURLToPath(new URL('../src/components/BrandMark.jsx', import.meta.url));

test('solarPaths holds a path string starting with M for every icon', () => {
  assert.ok(solarPaths.home, 'solarPaths.home must be present');
  for (const [name, d] of Object.entries(solarPaths)) {
    assert.equal(typeof d, 'string', `solarPaths.${name} should be a string`);
    assert.ok(d.startsWith('M'), `solarPaths.${name} should start with M`);
  }
});

test('FAVICON_GLYPH is consumed by BrandMark', () => {
  const source = readFileSync(brandMarkPath, 'utf8');
  assert.ok(source.includes('FAVICON_GLYPH'), 'BrandMark.jsx should import and use FAVICON_GLYPH');
});
