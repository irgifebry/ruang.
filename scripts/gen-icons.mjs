/**
 * Generates `src/app/apple-icon.png`.
 *
 * iOS does not read SVG favicons. Without an `apple-icon` file, Safari falls
 * back to a screenshot of the page on the home screen, which for this app means
 * a dark rectangle. This writes the real mark instead.
 *
 * Run after changing the glyph: `node scripts/gen-icons.mjs`.
 *
 * The glyph is rasterised straight from `FAVICON_GLYPH` rather than from a
 * separate description of the shape, so the home-screen icon cannot drift from
 * the tab icon. That needs the small SVG path interpreter below; it handles
 * only the commands the glyph actually uses, and throws on anything else rather
 * than drawing a wrong shape quietly.
 */

import { deflateSync } from 'node:zlib';
import { readFileSync, writeFileSync } from 'node:fs';

import { FAVICON_FILL, FAVICON_GLYPH, FAVICON_INK } from '../src/lib/theme-presets.js';

const hex = (value) => [
  parseInt(value.slice(1, 3), 16),
  parseInt(value.slice(3, 5), 16),
  parseInt(value.slice(5, 7), 16),
];

// The dark palette, matching `icon.svg`. A home-screen icon cannot follow the
// page theme, so it takes the brand colours and stays.
const TILE = hex(FAVICON_FILL.dark);
const INK = hex(FAVICON_INK.dark);

const SIZE = 180;
/** iOS masks the corners itself, so the tile runs full bleed to the edge. */
const SAMPLES = 4;

// --- PNG encoding ----------------------------------------------------------
// Only what a flat RGBA image needs: no interlacing, no palette, filter 0.

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- drawing ---------------------------------------------------------------

/** Whether a point in the 32-unit mark space is inside the glyph. */
// --- the glyph path --------------------------------------------------------

/**
 * Flattens an SVG path into polylines.
 *
 * Supports only what `FAVICON_GLYPH` uses — `M`, `L`, `H`, `V`, `A`, `Z`, in
 * both absolute and relative form, plus `C` because the glyph is easy to redraw
 * with a curve in the shoulder. Anything else throws: a command silently
 * ignored here would render a subtly wrong icon, which is worse than a crash.
 */
function flattenPath(d, stepsPerArc = 64) {
  const tokens = d.match(/[MLHVACZmlhvacz]|-?\d*\.?\d+(?:e-?\d+)?/g);
  if (!tokens) throw new Error('no path data');

  const subpaths = [];
  let points = null;
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let i = 0;

  const next = () => {
    if (i >= tokens.length) throw new Error('path data ended early');
    return parseFloat(tokens[i++]);
  };
  const push = (px, py) => points.push([px, py]);
  const isNumber = (token) => token !== undefined && /^-?\d/.test(token);
  const isRepeatable = (c) =>
    c === 'A' || c === 'a' || c === 'C' || c === 'c' || c === 'L' || c === 'l';

  let command = null;

  while (i < tokens.length) {
    const token = tokens[i];

    // SVG lets an argument run repeat without restating the command letter:
    // `a1 1 0 0 1 2 0 3 3 0 0 1 4 0` is two arcs. The glyph's period is drawn
    // that way, so a leading number here continues the previous command.
    if (isNumber(token)) {
      // `L`/`l` also allow repeated coordinate pairs, so they stay repeatable.
      if (!isRepeatable(command)) {
        throw new Error(`stray number in path data: ${token}`);
      }
    } else {
      command = token;
      i++;
    }

    if (command === 'M' || command === 'm') {
      const relative = command === 'm';
      const nx = relative ? x + next() : next();
      const ny = relative ? y + next() : next();
      points = [[nx, ny]];
      subpaths.push(points);
      x = nx;
      y = ny;
      startX = nx;
      startY = ny;
      // Extra coordinate pairs after a moveto are implicit linetos, not new
      // subpaths, and they keep the moveto's relative/absolute sense.
      command = relative ? 'l' : 'L';
    } else if (command === 'L' || command === 'l') {
      x = command === 'l' ? x + next() : next();
      y = command === 'l' ? y + next() : next();
      push(x, y);
    } else if (command === 'H' || command === 'h') {
      x = command === 'h' ? x + next() : next();
      push(x, y);
    } else if (command === 'V' || command === 'v') {
      y = command === 'v' ? y + next() : next();
      push(x, y);
    } else if (command === 'A' || command === 'a') {
      const rx = next();
      const ry = next();
      next(); // x-axis-rotation; the glyph never rotates its arcs
      const largeArc = next();
      const sweep = next();
      const ex = command === 'a' ? x + next() : next();
      const ey = command === 'a' ? y + next() : next();
      arcTo(points, x, y, rx, ry, largeArc, sweep, ex, ey, stepsPerArc);
      x = ex;
      y = ey;
    } else if (command === 'C' || command === 'c') {
      const rel = command === 'c';
      const c1x = rel ? x + next() : next();
      const c1y = rel ? y + next() : next();
      const c2x = rel ? x + next() : next();
      const c2y = rel ? y + next() : next();
      const ex = rel ? x + next() : next();
      const ey = rel ? y + next() : next();
      for (let s = 1; s <= stepsPerArc; s++) {
        const u = s / stepsPerArc;
        const v = 1 - u;
        push(
          v * v * v * x + 3 * v * v * u * c1x + 3 * v * u * u * c2x + u * u * u * ex,
          v * v * v * y + 3 * v * v * u * c1y + 3 * v * u * u * c2y + u * u * u * ey,
        );
      }
      x = ex;
      y = ey;
    } else if (command === 'Z' || command === 'z') {
      push(startX, startY);
      x = startX;
      y = startY;
      // `z` takes no arguments; a number after it starts nothing valid.
      command = null;
    } else {
      throw new Error(`unsupported path command: ${command}`);
    }
  }

  return subpaths;
}

/** Appends an elliptical arc, flattened. Endpoint parameterisation (SVG spec F.6). */
function arcTo(points, x, y, rx, ry, largeArc, sweep, ex, ey, steps) {
  if (rx === 0 || ry === 0) {
    points.push([ex, ey]);
    return;
  }

  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const dx2 = (x - ex) / 2;
  const dy2 = (y - ey) / 2;

  // Scale up radii that are too small to span the chord (F.6.6).
  const lambda = (dx2 * dx2) / (rx * rx) + (dy2 * dy2) / (ry * ry);
  if (lambda > 1) {
    const scale = Math.sqrt(lambda);
    rx *= scale;
    ry *= scale;
  }

  const sign = largeArc === sweep ? -1 : 1;
  const numerator =
    rx * rx * ry * ry - rx * rx * dy2 * dy2 - ry * ry * dx2 * dx2;
  const denominator = rx * rx * dy2 * dy2 + ry * ry * dx2 * dx2;
  const factor = sign * Math.sqrt(Math.max(0, numerator / denominator));
  const cxp = (factor * rx * dy2) / ry;
  const cyp = (-factor * ry * dx2) / rx;
  const cx = cxp + (x + ex) / 2;
  const cy = cyp + (y + ey) / 2;

  const angle = (ux, uy, vx, vy) => {
    const dot = (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy));
    const a = Math.acos(Math.min(1, Math.max(-1, dot)));
    return ux * vy - uy * vx < 0 ? -a : a;
  };

  const start = angle(1, 0, (dx2 - cxp) / rx, (dy2 - cyp) / ry);
  let delta = angle((dx2 - cxp) / rx, (dy2 - cyp) / ry, (-dx2 - cxp) / rx, (-dy2 - cyp) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;

  const count = Math.max(2, Math.ceil((Math.abs(delta) / (Math.PI / 2)) * steps));
  for (let s = 1; s <= count; s++) {
    const theta = start + (delta * s) / count;
    points.push([cx + rx * Math.cos(theta), cy + ry * Math.sin(theta)]);
  }
}

/**
 * Nonzero winding test, matching how an SVG renderer fills a path.
 *
 * The glyph has two overlapping subpaths that must both count as solid; a
 * naive even-odd test would punch the hole where they meet.
 */
function insideGlyph(subpaths, px, py) {
  let winding = 0;
  for (const points of subpaths) {
    for (let i = 0; i < points.length - 1; i++) {
      const [ax, ay] = points[i];
      const [bx, by] = points[i + 1];
      if (ay <= py) {
        if (by > py && (bx - ax) * (py - ay) - (px - ax) * (by - ay) > 0) winding++;
      } else if (by <= py && (bx - ax) * (py - ay) - (px - ax) * (by - ay) < 0) {
        winding--;
      }
    }
  }
  return winding !== 0;
}

function render(subpaths) {
  const rgba = Buffer.alloc(SIZE * SIZE * 4);
  const step = 32 / SIZE;

  for (let py = 0; py < SIZE; py++) {
    for (let px = 0; px < SIZE; px++) {
      let hits = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          // Sample the centre of each sub-pixel, in mark space.
          const x = (px + (sx + 0.5) / SAMPLES) * step;
          const y = (py + (sy + 0.5) / SAMPLES) * step;
          if (insideGlyph(subpaths, x, y)) hits++;
        }
      }

      // Coverage as alpha over the tile: a partially covered edge pixel keeps
      // the lime underneath and blends towards the ink, which is what an
      // antialiased vector render would produce.
      const coverage = hits / (SAMPLES * SAMPLES);
      const i = (py * SIZE + px) * 4;
      for (let c = 0; c < 3; c++) {
        rgba[i + c] = Math.round(TILE[c] + (INK[c] - TILE[c]) * coverage);
      }
      rgba[i + 3] = 255;
    }
  }

  return rgba;
}

// --- run -------------------------------------------------------------------

const iconSvg = readFileSync(new URL('../src/app/icon.svg', import.meta.url), 'utf8');
if (!iconSvg.includes(`d="${FAVICON_GLYPH}"`)) {
  console.error('src/app/icon.svg no longer contains the glyph. Re-run the theme tests.');
  process.exit(1);
}

const target = new URL('../src/app/apple-icon.png', import.meta.url);
writeFileSync(target, encodePng(SIZE, SIZE, render(flattenPath(FAVICON_GLYPH))));
console.log(`Wrote ${target.pathname} (${SIZE}x${SIZE})`);
