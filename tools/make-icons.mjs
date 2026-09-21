// Generates the four App Store / store-listing images into `assets/`
// (ui.md §11.1, AC-1201/AC-1202). Run: `node tools/make-icons.mjs`.
//
// They are GENERATED rather than checked in as opaque binaries for the same
// reason the sounds are (`tools/make-sounds.mjs`): a PNG in a repository is a
// blob nobody can review, and "the icon is 1024 x 1024 with no alpha" is then
// a claim rather than a property. Here it is arithmetic — the encoder below
// only knows how to write colour type 2, so an alpha channel is not something
// this file could emit even by mistake, and the ground is painted over every
// pixel before anything is drawn on it so no pixel is ever left unset.
//
// The design is ui.md §11.1's: ground `#16212C`, three panelled species bars —
// elephant 4 cells, elk 3, fox 2 — climbing to the right as a rising staircase,
// no text. It is the game's thesis (every animal is a different width) rather
// than a picture of an animal, and three flat bars still read at 60 x 60 where
// an illustration does not.
//
// WHAT THIS FILE CANNOT DO is tell you whether the icon is any good. It is
// defensible, it is on-brand, and it is a placeholder for a decision only the
// owner can make.

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets');

// ---- the palette, copied deliberately -------------------------------------
// These five values also live in `src/ui/theme.js`, and a test asserts they
// agree (test/assets.test.js). They are NOT imported: this script must run
// against a plain Node with no bundler, and `theme.js` is React Native source.
const GROUND = '#16212C'; // THEME.dark.colors.board
const BARS = [
  { fill: '#5B6E88', edge: '#3F4F66', cells: 4 }, // elephant
  { fill: '#5FA45C', edge: '#427A40', cells: 3 }, // elk
  { fill: '#F58A47', edge: '#C96A2C', cells: 2 }, // fox
];

/**
 * AC-1501/AC-1513 moved the splash, and only the splash.
 *
 * The app now OPENS bright, and AC-1205's rule is that the splash ground and
 * the app ground are one colour — the seam between the splash storyboard and
 * React's first frame is invisible only while that holds. So the splash is
 * drawn on the light app ground with the light ramp, and the mark is the same
 * mark.
 *
 * The ICON is not moved. An icon is a mark on a home screen rather than a
 * surface of the app, ui.md §11.1 specifies its ground as `#16212C`, and a
 * theme the player can change is not a reason to restyle a brand mark.
 */
const SPLASH_BG = '#F2EDE3'; // THEME.light.colors.bg
const SPLASH_BARS = [
  { fill: '#3E4F66', edge: '#26303F', cells: 4 }, // elephant
  { fill: '#3F7A3E', edge: '#284E27', cells: 3 }, // elk
  { fill: '#D4712F', edge: '#94430F', cells: 2 }, // fox
];

// ---- a minimal PNG encoder, truecolour only -------------------------------

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** An RGB canvas. Three bytes per pixel and no fourth — that is AC-1202. */
function canvas(width, height, background) {
  const [r, g, b] = rgb(background);
  const px = Buffer.alloc(width * height * 3);
  for (let i = 0; i < px.length; i += 3) {
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
  }
  return { width, height, px };
}

/** Source-over of an opaque colour at `alpha` onto one pixel. */
function blend(c, x, y, [r, g, b], alpha) {
  if (x < 0 || y < 0 || x >= c.width || y >= c.height) return;
  const i = (y * c.width + x) * 3;
  c.px[i] = Math.round(c.px[i] * (1 - alpha) + r * alpha);
  c.px[i + 1] = Math.round(c.px[i + 1] * (1 - alpha) + g * alpha);
  c.px[i + 2] = Math.round(c.px[i + 2] * (1 - alpha) + b * alpha);
}

/**
 * A rounded rectangle, antialiased by 4x4 supersampling of the coverage mask.
 * Antialiasing matters more than it looks: at 60 x 60 a jagged bar edge is the
 * difference between "a designed mark" and "a screenshot of a spreadsheet".
 */
function roundRect(c, { x, y, w, h, r, colour, alpha = 1 }) {
  const [cr, cg, cb] = rgb(colour);
  const radius = Math.min(r, w / 2, h / 2);
  const inside = (px, py) => {
    const dx = Math.max(x + radius - px, 0, px - (x + w - radius));
    const dy = Math.max(y + radius - py, 0, py - (y + h - radius));
    if (dx === 0 || dy === 0) return px >= x && px <= x + w && py >= y && py <= y + h;
    return dx * dx + dy * dy <= radius * radius;
  };
  for (let py = Math.floor(y); py < Math.ceil(y + h); py += 1) {
    for (let px = Math.floor(x); px < Math.ceil(x + w); px += 1) {
      let hits = 0;
      for (let sy = 0; sy < 4; sy += 1) {
        for (let sx = 0; sx < 4; sx += 1) {
          if (inside(px + (sx + 0.5) / 4, py + (sy + 0.5) / 4)) hits += 1;
        }
      }
      if (hits) blend(c, px, py, [cr, cg, cb], alpha * (hits / 16));
    }
  }
}

function encodePng(c) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(c.width, 0);
  ihdr.writeUInt32BE(c.height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type 2 = truecolour RGB. No alpha channel exists here.
  // 10, 11, 12 = deflate / adaptive filtering / no interlace, all zero.

  const stride = c.width * 3;
  const raw = Buffer.alloc((stride + 1) * c.height);
  for (let y = 0; y < c.height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter type 0: none
    c.px.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

// ---- the mark -------------------------------------------------------------

/**
 * The three bars, as a staircase, inside the box `{x, y, w}`.
 *
 * The box is 6 cells wide and the bars are 4, 3 and 2 cells starting at cells
 * 0, 2 and 4, so each step begins two columns right of the one below it and the
 * silhouette climbs. Panel seams sit on the cell boundaries (ui.md §5.2 cue 2),
 * which is what makes the widths countable rather than merely different.
 */
function drawMark(c, { x, y, w, bars = BARS }) {
  const cell = w / 6;
  const barH = cell * BAR_H;
  const gap = cell * BAR_GAP;
  const radius = cell * 0.17;
  const seamW = Math.max(1, Math.round(cell * 0.028));
  const seamInset = barH * 0.11;

  bars.forEach((bar, i) => {
    // Bottom bar is the widest; index 0 is drawn lowest.
    const row = bars.length - 1 - i;
    const bx = x + i * 2 * cell;
    const by = y + row * (barH + gap);
    const bw = bar.cells * cell;
    roundRect(c, { x: bx, y: by, w: bw, h: barH, r: radius, colour: bar.edge });
    roundRect(c, {
      x: bx + seamW,
      y: by + seamW,
      w: bw - seamW * 2,
      h: barH - seamW * 2,
      r: radius,
      colour: bar.fill,
    });
    for (let k = 1; k < bar.cells; k += 1) {
      roundRect(c, {
        x: bx + k * cell - seamW / 2,
        y: by + seamInset,
        w: seamW,
        h: barH - seamInset * 2,
        r: 0,
        colour: '#000000',
        alpha: 0.22,
      });
    }
  });
}

/**
 * Bar height and the gap between bars, both in cells. The bars are taller than
 * one cell so the mark carries weight inside a 1024 square; on the board itself
 * an animal is exactly one cell tall, and this is a logo rather than a
 * screenshot.
 */
const BAR_H = 1.25;
const BAR_GAP = 0.25;

/** The height the mark occupies for a given box width. */
const markHeight = (w) => {
  const cell = w / 6;
  return cell * (BARS.length * BAR_H + (BARS.length - 1) * BAR_GAP);
};

// ---- the four files -------------------------------------------------------

function icon() {
  const c = canvas(1024, 1024, GROUND);
  const w = 900;
  drawMark(c, { x: (1024 - w) / 2, y: (1024 - markHeight(w)) / 2, w });
  return c;
}

/**
 * Android's foreground layer. The outer 33% can be masked away by any launcher
 * shape, so the mark is inset to the 66% safe circle: a 1024 circle's inscribed
 * square is 724 across, and the mark's own box goes inside that.
 */
function adaptiveIcon() {
  const c = canvas(1024, 1024, GROUND);
  const w = 640;
  drawMark(c, { x: (1024 - w) / 2, y: (1024 - markHeight(w)) / 2, w });
  return c;
}

/** `resizeMode: "contain"` on the light app ground, mark centred at 42%. */
function splash() {
  const c = canvas(1284, 2778, SPLASH_BG);
  const w = 780;
  drawMark(c, { x: (1284 - w) / 2, y: 2778 * 0.42 - markHeight(w) / 2, w, bars: SPLASH_BARS });
  return c;
}

/** 48 x 48: the single elephant bar. Anything with three bars is mud at 16 px. */
function favicon() {
  const c = canvas(48, 48, GROUND);
  const cell = 10;
  const x = (48 - cell * 4) / 2;
  const y = (48 - cell) / 2;
  roundRect(c, { x, y, w: cell * 4, h: cell, r: 2, colour: BARS[0].edge });
  roundRect(c, { x: x + 1, y: y + 1, w: cell * 4 - 2, h: cell - 2, r: 2, colour: BARS[0].fill });
  for (let k = 1; k < 4; k += 1) {
    roundRect(c, { x: x + k * cell - 0.5, y: y + 1.5, w: 1, h: cell - 3, r: 0, colour: '#000000', alpha: 0.22 });
  }
  return c;
}

mkdirSync(OUT, { recursive: true });
const files = [
  ['icon.png', icon()],
  ['adaptive-icon.png', adaptiveIcon()],
  ['splash.png', splash()],
  ['favicon.png', favicon()],
];
for (const [name, c] of files) {
  const bytes = encodePng(c);
  writeFileSync(path.join(OUT, name), bytes);
  process.stdout.write(`${name.padEnd(18)} ${c.width} x ${c.height}  RGB, no alpha  ${bytes.length} bytes\n`);
}
