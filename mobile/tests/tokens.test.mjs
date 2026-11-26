import assert from 'node:assert/strict';
import { test } from 'node:test';

import { tokens, withAlpha } from '../src/theme/tokens.js';

test('tokens(dark) returns the dark palette from globals.css', () => {
  const t = tokens('dark');
  assert.equal(t.bg, '#0b0d0c');
  assert.equal(t.shell, '#0c0f0d');
  assert.equal(t.panel, '#111412');
  assert.equal(t.panel2, '#151916');
  assert.equal(t.raised, '#151a15');
  assert.equal(t.sunken, '#0e120f');
  assert.equal(t.hover, '#171c18');
  assert.equal(t.overlay, '#040605');
  assert.equal(t.line, '#252a27');
  assert.equal(t.lineSoft, '#29312a');
  assert.equal(t.line2, '#303730');
  assert.equal(t.line3, '#333b33');
  assert.equal(t.ink, '#f0f1eb');
  assert.equal(t.body, '#a8b0a7');
  assert.equal(t.muted, '#8c948c');
  assert.equal(t.subtle, '#7d857c');
  assert.equal(t.ghost, '#5c665c');
  assert.equal(t.track, '#2b312b');
});

test("tokens('dark').accent is the brand lime", () => {
  assert.equal(tokens('dark').accent, '#c9fb55');
});

test('tokens(light) returns the light palette', () => {
  const t = tokens('light');
  assert.equal(t.bg, '#f6f7f2');
  assert.equal(t.shell, '#ffffff');
  assert.equal(t.panel, '#ffffff');
  assert.equal(t.panel2, '#fafaf6');
  assert.equal(t.raised, '#f3f4ee');
  assert.equal(t.sunken, '#f6f7f0');
  assert.equal(t.ink, '#131611');
  assert.equal(t.accent, '#7aa80c');
});

test('light accent forms follow the light palette', () => {
  const t = tokens('light');
  assert.equal(t.accentHover, '#689208');
  assert.equal(t.accentInk, '#fafcf4');
  assert.equal(t.accentText, '#618b08');
});

test('spacing tokens mirror the web rhythm', () => {
  assert.equal(tokens('dark').spacing.card, 16);
  assert.equal(tokens('dark').spacing.section, 32);
  assert.equal(tokens('dark').spacing.mobileBar, 56);
});

test('radius tokens are the shared step scale', () => {
  assert.deepEqual(tokens('dark').radius, { xs: 2, sm: 3, md: 4, lg: 8, xl: 10, full: 999 });
});

test('font tokens name the families loaded in the provider', () => {
  assert.equal(tokens('dark').font.display, 'Space Grotesk');
  assert.equal(tokens('dark').font.mono, 'DM Mono');
});

test('withAlpha mirrors the web warn/10 notice surface and warn/40 border', () => {
  assert.equal(withAlpha('#ffc45c', 0.1), 'rgba(255, 196, 92, 0.1)');
  assert.equal(withAlpha('#ffc45c', 0.4), 'rgba(255, 196, 92, 0.4)');
  assert.equal(withAlpha(tokens('light').warn, 0.1), 'rgba(190, 130, 20, 0.1)');
});
