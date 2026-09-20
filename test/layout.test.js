// AC-1xx layout: the cell-size ladder and THE SWEEP.
//
// This file is the standing, executable form of AC-119. It runs the sweep
// against src/ui/layout.js — the function the app actually ships — not against
// the reference implementation in docs/v2/layout-sweep.mjs. Re-run it after any
// change to chrome heights, cell bounds or the breakpoint.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CHROME,
  COLS,
  GUTTER,
  RAIL_MIN,
  ROWS,
  STAGE,
  WIDE_BREAKPOINT,
  WIDE_GUTTERS,
  boardLayout,
  hitSlopFor,
} from '../src/ui/layout.js';

const INSET_PROFILES = [[0, 0], [20, 0], [44, 34], [59, 34], [62, 34], [70, 40]];

/** The two invariants AC-119 names, verbatim. */
function fits(L, w, h, it, ib) {
  if (L.cell === null) return true; // stage 3 renders a message, not a board
  return L.cell * ROWS + L.chromeHeight + it + ib <= h && L.cell * COLS <= w - GUTTER;
}

test('AC-119 THE SWEEP: zero overflows across 682,290 viewport combinations', () => {
  let n = 0;
  let overflowing = 0;
  const stages = {};
  for (let w = 272; w <= 900; w += 2) {
    for (let h = 480; h <= 1200; h += 2) {
      for (const [it, ib] of INSET_PROFILES) {
        const L = boardLayout(w, h, it, ib);
        n += 1;
        stages[L.stage] = (stages[L.stage] || 0) + 1;
        if (!fits(L, w, h, it, ib)) overflowing += 1;
      }
    }
  }
  assert.equal(n, 682290, 'the sweep must cover the space AC-119 names');
  assert.equal(overflowing, 0);
  // The ladder must actually be used, not collapse to a single stage.
  for (const stage of [STAGE.WIDE, STAGE.COMFORTABLE, STAGE.COMPACT, STAGE.MINIMUM]) {
    assert.ok(stages[stage] > 0, `stage ${stage} is never reached`);
  }
});

test('AC-119 the cell is always within the stage bounds it claims', () => {
  const bounds = {
    [STAGE.WIDE]: [30, 48],
    [STAGE.COMFORTABLE]: [30, 44],
    [STAGE.COMPACT]: [30, 44],
    [STAGE.MINIMUM]: [24, 44],
  };
  for (let w = 272; w <= 900; w += 2) {
    for (let h = 480; h <= 1200; h += 2) {
      for (const [it, ib] of INSET_PROFILES) {
        const L = boardLayout(w, h, it, ib);
        if (L.stage === STAGE.UNSUPPORTED) continue;
        const [lo, hi] = bounds[L.stage];
        assert.ok(
          L.cell >= lo && L.cell <= hi,
          `${w}x${h} ${it}/${ib}: ${L.stage} produced cell ${L.cell}, not in [${lo},${hi}]`,
        );
      }
    }
  }
});

test('AC-102 iPhone 15 (393 x 852, insets 59/34) is 36 pt and 360 x 540', () => {
  const L = boardLayout(393, 852, 59, 34);
  assert.equal(L.stage, STAGE.COMFORTABLE);
  assert.equal(L.cell, 36);
  assert.equal(L.boardW, 360);
  assert.equal(L.boardH, 540);
});

test('AC-101 the board is always 10 x 15', () => {
  assert.equal(COLS, 10);
  assert.equal(ROWS, 15);
  const L = boardLayout(393, 852, 59, 34);
  assert.equal(L.boardW / L.cell, 10);
  assert.equal(L.boardH / L.cell, 15);
});

test('ui.md §3.2 device table: every published row reproduces', () => {
  const table = [
    ['iPhone SE 1 / 5s',      320, 568,  0,  0, STAGE.MINIMUM,     28],
    ['iPhone SE2 / SE3 / 8',  375, 667, 20,  0, STAGE.COMFORTABLE, 31],
    ['iPhone 12 / 13 mini',   375, 812, 50, 34, STAGE.COMFORTABLE, 34],
    ['iPhone 14 / 15 / 16',   393, 852, 59, 34, STAGE.COMFORTABLE, 36],
    ['iPhone 17 / 18 Pro',    402, 874, 62, 34, STAGE.COMFORTABLE, 37],
    ['iPhone 15/16/17 Plus',  430, 932, 59, 34, STAGE.COMFORTABLE, 39],
    ['iPhone 16/17/18 Pro Max', 440, 956, 62, 34, STAGE.COMFORTABLE, 40],
    ['Display Zoom 320x693',  320, 693, 59, 34, STAGE.MINIMUM,     28],
  ];
  for (const [name, w, h, it, ib, stage, cell] of table) {
    const L = boardLayout(w, h, it, ib);
    assert.equal(L.stage, stage, `${name} stage`);
    assert.equal(L.cell, cell, `${name} cell`);
  }
});

test('AC-112 stage 0 is used whenever a 30 pt cell fits the full 177 pt chrome', () => {
  const L = boardLayout(393, 852, 59, 34);
  assert.equal(L.chromeHeight, 177);
  assert.equal(L.chrome.hud, 52);
  assert.equal(L.chrome.action, 48);
  assert.equal(L.chrome.tray, 45);
});

test('AC-113/AC-115 chrome yields before the board does', () => {
  // A viewport engineered so that stage 0 cannot hold 30 pt but compact can.
  let sawCompact = false;
  let sawMinimum = false;
  for (let h = 480; h <= 1200; h += 1) {
    const L = boardLayout(393, h, 59, 34);
    if (L.stage === STAGE.COMPACT) {
      sawCompact = true;
      assert.equal(L.chromeHeight, 144);
      assert.ok(L.cell >= 30);
      // Stage 0 at this same viewport really would have been too small.
      assert.ok(Math.floor((h - 59 - 34 - 177) / ROWS) < 30);
    }
    if (L.stage === STAGE.MINIMUM) {
      sawMinimum = true;
      assert.equal(L.chromeHeight, 144);
      assert.ok(L.cell >= 24 && L.cell < 44);
    }
  }
  assert.ok(sawCompact && sawMinimum);
});

test('AC-116 stage 3 renders no board at all rather than a clipped one', () => {
  const L = boardLayout(393, 500, 59, 34);
  assert.equal(L.stage, STAGE.UNSUPPORTED);
  assert.equal(L.cell, null);
  assert.equal(L.boardW, 0);
  assert.equal(L.boardH, 0);
  // No iPhone reaches it: 272 pt of width or ~597 pt of height with 59/34.
  assert.notEqual(boardLayout(320, 568, 0, 0).stage, STAGE.UNSUPPORTED);
  assert.notEqual(boardLayout(320, 693, 59, 34).stage, STAGE.UNSUPPORTED);
});

test('AC-117 Display Zoom shrinks the viewport and the ladder absorbs it', () => {
  const normal = boardLayout(393, 852, 59, 34);
  const zoomed = boardLayout(320, 693, 59, 34);
  assert.equal(normal.stage, STAGE.COMFORTABLE);
  assert.equal(zoomed.stage, STAGE.MINIMUM);
  assert.ok(fits(zoomed, 320, 693, 59, 34));
});

test('AC-106 the board is horizontally centred to within 1 pt', () => {
  for (let w = 272; w <= 590; w += 1) {
    const L = boardLayout(w, 852, 59, 34);
    if (L.stage === STAGE.UNSUPPORTED) continue;
    const left = L.gutter;
    const right = w - L.boardW - L.gutter;
    assert.ok(Math.abs(left - right) <= 1, `width ${w}: gutters ${left} vs ${right}`);
  }
});

test('AC-120 stage W engages at exactly 600 pt and raises the ceiling to 48', () => {
  assert.equal(WIDE_BREAKPOINT, 600);
  assert.notEqual(boardLayout(598, 900, 42, 34).stage, STAGE.WIDE);
  assert.equal(boardLayout(600, 900, 42, 34).stage, STAGE.WIDE);
  const big = boardLayout(700, 1100, 42, 34);
  assert.equal(big.stage, STAGE.WIDE);
  assert.equal(big.cell, 48);
  assert.equal(big.chromeHeight, 77);
});

test('AC-121/AC-122 the rail is >= 96 pt and inert gutter stays under 20%', () => {
  for (let w = WIDE_BREAKPOINT; w <= 900; w += 1) {
    for (let h = 480; h <= 1200; h += 4) {
      for (const [it, ib] of INSET_PROFILES) {
        const L = boardLayout(w, h, it, ib);
        if (L.stage !== STAGE.WIDE) continue;
        assert.ok(L.railW >= RAIL_MIN, `${w}x${h}: rail ${L.railW}`);
        assert.ok(WIDE_GUTTERS / w <= 0.2, `${w}: inert gutter ${WIDE_GUTTERS}`);
        assert.ok(L.boardW + L.railW + WIDE_GUTTERS <= w);
      }
    }
  }
});

test('AC-123/AC-124 both iPhone Duo states render a board, on every estimate', () => {
  // AC-126: these are inputs to a dimension-driven function, not constants in
  // the source. Every circulating estimate must work, because none is confirmed.
  const folded = [[466, 678, 59, 34], [466, 678, 20, 34], [466, 678, 70, 40], [313, 890, 59, 34]];
  for (const [w, h, it, ib] of folded) {
    const L = boardLayout(w, h, it, ib);
    assert.notEqual(L.stage, STAGE.UNSUPPORTED, `folded ${w}x${h} ${it}/${ib}`);
    assert.ok(fits(L, w, h, it, ib));
  }
  const unfolded = [[626, 890, 42, 34], [669, 951, 42, 34]];
  for (const [w, h, it, ib] of unfolded) {
    const L = boardLayout(w, h, it, ib);
    assert.equal(L.stage, STAGE.WIDE, `unfolded ${w}x${h}`);
    assert.ok(L.railW >= RAIL_MIN);
    assert.ok(fits(L, w, h, it, ib));
  }
});

test('AC-118 the function is pure: same input, same output, no cached state', () => {
  const a = boardLayout(393, 852, 59, 34);
  const b = boardLayout(320, 568, 0, 0);
  const c = boardLayout(393, 852, 59, 34);
  assert.deepEqual(a, c);
  assert.notEqual(b.cell, a.cell);
});

test('AC-415 hitSlop pads any rendered body out to 44 pt', () => {
  for (let cell = 24; cell <= 48; cell += 1) {
    for (let size = 1; size <= 5; size += 1) {
      const w = cell * size;
      const slop = hitSlopFor(w, cell);
      assert.ok(w + slop.left + slop.right >= 44, `cell ${cell} size ${size} width`);
      assert.ok(cell + slop.top + slop.bottom >= 44, `cell ${cell} height`);
    }
  }
  assert.deepEqual(hitSlopFor(180, 36), { top: 4, bottom: 4, left: 0, right: 0 });
});

test('CHROME budgets are the ones ui.md §3.2 publishes', () => {
  const total = (c) => c.hud + c.action + c.tray + c.gaps;
  assert.equal(total(CHROME.full), 177);
  assert.equal(total(CHROME.compact), 144);
  assert.equal(total(CHROME.rail), 77);
});
