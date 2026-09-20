// AC-1xx layout: the cell-size ladder and THE SWEEP.
//
// This file is the standing, executable form of AC-119. It runs the sweep
// against src/ui/layout.js — the function the app actually ships — not against
// the reference implementation in docs/v2/layout-sweep.mjs. Re-run it after any
// change to chrome heights, cell bounds or the breakpoint.

import test from 'node:test';
import assert from 'node:assert/strict';

import { hudScale } from '../src/ui/theme.js';

import {
  CHROME,
  COLS,
  GUTTER,
  HAIRLINE,
  RAIL_MIN,
  ROWS,
  STAGE,
  WIDE_BREAKPOINT,
  WIDE_GUTTERS,
  MIN_TOUCH,
  actionBarHeight,
  boardLayout,
  hitSlopFor,
  hudHeight,
  passButtonHeight,
  verticalSlack,
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


// ---------------------------------------------------------------------------
// AC-103, in the geometry the screen actually renders
// ---------------------------------------------------------------------------

test('AC-103 the board and tray fit the space the two bars leave, on every viewport', () => {
  // The ladder's budget is abstract; this is the rendered stack. The HUD and the
  // action bar are laid out at their chrome height PLUS their 1 pt rule, because
  // React Native is border-box. Getting that wrong cost a point of scroll at
  // compact and minimum chrome, which is what this sweep now stops.
  let worst = Infinity;
  let worstAt = null;
  for (let w = 272; w <= 900; w += 2) {
    for (let h = 480; h <= 1200; h += 2) {
      for (const [it, ib] of INSET_PROFILES) {
        const L = boardLayout(w, h, it, ib);
        if (L.stage === STAGE.UNSUPPORTED) continue;
        const slack = verticalSlack(L, h, it, ib);
        if (slack < worst) { worst = slack; worstAt = `${w}x${h} ${it}/${ib} ${L.stage}`; }
        assert.ok(slack >= 0, `${w}x${h} ${it}/${ib} ${L.stage}: overflows by ${-slack} pt`);
      }
    }
  }
  assert.ok(worst >= 0, `tightest fit ${worst} pt at ${worstAt}`);
});

test('AC-114/AC-103 the action bar contains its own Pass button, at every stage', () => {
  // This is the check that F1 was missing. React Native is border-box, so the
  // bar's CONTENT box is its laid-out height minus its rule; the button has to
  // fit in THAT, not in the border box. At compact chrome the two differ by the
  // exact point of vertical scroll the tester measured.
  for (const chrome of [CHROME.full, CHROME.compact]) {
    const contentBox = actionBarHeight(chrome) - HAIRLINE;
    const button = passButtonHeight(chrome);
    assert.ok(button >= MIN_TOUCH, `${chrome.action} pt bar: button is only ${button} pt`);
    assert.ok(
      button <= contentBox,
      `${chrome.action} pt bar: a ${button} pt button overhangs a ${contentBox} pt content box`,
    );
  }
  // And the content box is the chrome budget the ladder actually spent.
  assert.equal(actionBarHeight(CHROME.compact) - HAIRLINE, CHROME.compact.action);
  assert.equal(actionBarHeight(CHROME.full) - HAIRLINE, CHROME.full.action);
  assert.equal(hudHeight(CHROME.compact) - HAIRLINE, CHROME.compact.hud);
  assert.equal(passButtonHeight(CHROME.compact), 44);
  assert.equal(passButtonHeight(CHROME.full), 44);
});

// ---------------------------------------------------------------------------
// The stage-W rail constraint: a DELIBERATE divergence from the reference
// ---------------------------------------------------------------------------

/**
 * `docs/v2/layout-sweep.mjs`'s `layout()`, reproduced here in behaviour.
 *
 * It is AC-119's reference and it is correct about overflow — but it does not
 * check AC-121, and at 600-610 pt of width it produces a rail narrower than the
 * 96 pt that AC says. The shipped function caps the wide cell by what the rail
 * needs. This test is what keeps that divergence deliberate: if someone
 * "simplifies" the shipped function back to the reference, the last assertion
 * here fails and says why.
 */
function referenceLayout(w, h, it, ib) {
  const FULL = { hud: 52, act: 48, tray: 45, gaps: 32 };
  const COMPACT = { hud: 44, act: 44, tray: 36, gaps: 20 };
  const RAIL = { hud: 0, act: 0, tray: 45, gaps: 32 };
  const total = (c) => c.hud + c.act + c.tray + c.gaps;
  const fit = (c, lo, hi) => {
    const avail = h - it - ib - total(c);
    const raw = Math.floor(Math.min((w - 32) / 10, avail / 15));
    return { cell: Math.min(raw, hi), ok: raw >= lo };
  };
  if (w >= 600) { const x = fit(RAIL, 30, 48); if (x.ok) return { stage: STAGE.WIDE, cell: x.cell }; }
  const s0 = fit(FULL, 30, 44); if (s0.ok) return { stage: STAGE.COMFORTABLE, cell: s0.cell };
  const s1 = fit(COMPACT, 30, 44); if (s1.ok) return { stage: STAGE.COMPACT, cell: s1.cell };
  const s2 = fit(COMPACT, 24, 44); if (s2.ok) return { stage: STAGE.MINIMUM, cell: s2.cell };
  return { stage: STAGE.UNSUPPORTED, cell: null };
}

test('the shipped ladder assigns exactly the stages the reference assigns', () => {
  let n = 0;
  for (let w = 272; w <= 900; w += 2) {
    for (let h = 480; h <= 1200; h += 2) {
      for (const [it, ib] of INSET_PROFILES) {
        const mine = boardLayout(w, h, it, ib);
        const ref = referenceLayout(w, h, it, ib);
        assert.equal(mine.stage, ref.stage, `${w}x${h} ${it}/${ib} stage`);
        if (mine.cell !== null) {
          // The rail cap may only ever LOWER the cell, which is what keeps both
          // AC-119 invariants true a fortiori.
          assert.ok(mine.cell <= ref.cell, `${w}x${h} ${it}/${ib}: ${mine.cell} > ${ref.cell}`);
        }
        n += 1;
      }
    }
  }
  assert.equal(n, 682290);
});

test('AC-120/AC-121 the rail cap is why stage W is buildable at 600 pt', () => {
  // Exactly the band where the reference and the shipped function part company.
  let referenceFailures = 0;
  const failingWidths = new Set();
  for (let w = WIDE_BREAKPOINT; w <= 900; w += 2) {
    for (let h = 480; h <= 1200; h += 2) {
      for (const [it, ib] of INSET_PROFILES) {
        const ref = referenceLayout(w, h, it, ib);
        if (ref.stage !== STAGE.WIDE) continue;
        if (w - WIDE_GUTTERS - ref.cell * COLS < RAIL_MIN) {
          referenceFailures += 1;
          failingWidths.add(w);
        }
        assert.ok(boardLayout(w, h, it, ib).railW >= RAIL_MIN);
      }
    }
  }
  assert.equal(referenceFailures, 6131, 'the reference AC-121 shortfall has moved');
  assert.deepEqual([...failingWidths].sort((a, b) => a - b), [600, 602, 604, 606, 608, 610]);

  // The worst case, pinned: at exactly the breakpoint the reference leaves the
  // rail 84 pt, twelve short of a 44 pt Pass button with room to breathe.
  const ref600 = referenceLayout(600, 900, 42, 34);
  assert.equal(ref600.cell, 48);
  assert.equal(600 - WIDE_GUTTERS - ref600.cell * COLS, 84);

  const mine600 = boardLayout(600, 900, 42, 34);
  assert.equal(mine600.cell, 46);
  assert.equal(mine600.railW, 104);
  assert.equal(mine600.stage, STAGE.WIDE);
});

// ---- AC-910d/e: Dynamic Type inside a fixed HUD ---------------------------
//
// react-native-web hard-codes `fontScale: 1` and ignores `allowFontScaling`,
// so the browser can never contradict any of this. It is arithmetic, and it is
// tested as arithmetic; the appearance still needs a device (AC-824c's list).

test('AC-910d the HUD trades its labels for its values at xxLarge', () => {
  // iOS body text goes 17 / 19 / 21 pt at Large / xLarge / xxLarge, so xxLarge
  // lands at a font scale of about 1.235.
  assert.deepEqual(hudScale(1, false), { large: false, score: 30 });
  assert.deepEqual(hudScale(1.12, false), { large: false, score: 30 }, 'xLarge is not enough');
  assert.deepEqual(hudScale(1.235, false), { large: true, score: 40 }, 'xxLarge trades');
  assert.deepEqual(hudScale(3.1, false), { large: true, score: 40 }, 'AX sizes do not grow past it');
  // Compact chrome is a 44 pt HUD, so its value grows less far.
  assert.deepEqual(hudScale(1.235, true), { large: true, score: 34 });
  assert.deepEqual(hudScale(undefined, false), { large: false, score: 30 }, 'a missing scale is 1');
});

test('AC-910e the grown score still fits the HUD it grew inside', () => {
  for (const chrome of [CHROME.full, CHROME.compact]) {
    const compact = chrome.hud === 44;
    const { score } = hudScale(2, compact);
    assert.ok(
      score <= chrome.hud,
      `a ${score} pt score does not fit a ${chrome.hud} pt HUD`,
    );
    // ...and the board never pays for it: the chrome budget is untouched.
    assert.equal(hudHeight(chrome), chrome.hud + 1);
  }
});
