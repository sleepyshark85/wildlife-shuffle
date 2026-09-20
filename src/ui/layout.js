// THE sizing function. There is exactly one, it is pure, it is module-level, and
// every consumer receives its result as a prop (AC-107).
//
// v1 had two disagreeing formulas — GameScreen.js:14 sized on width only,
// GameGrid.js:27 on min(width, height) — so the board sat off-centre inside its
// own frame (docs/v1-review.md D1). Nothing in this module reads React, holds
// state, caches, or knows the name of a device (AC-118, AC-126).
//
// The four-stage ladder is docs/v2/ui.md §3.2. Chrome yields before the board
// does: a floor that can exceed its container is an overflow, not a safety net
// (AC-108, AC-112-AC-116).

import { BOARD } from '../engine/constants.js';

export const COLS = BOARD.width;   // 10
export const ROWS = BOARD.height;  // 15

/** Total horizontal space reserved outside the board in the vertical stages. */
export const GUTTER = 32;

/** Wide stage: outer gutter and the board/rail gap. */
export const WIDE_GUTTER = 12;
export const WIDE_GAP = 12;
export const WIDE_GUTTERS = WIDE_GUTTER * 2 + WIDE_GAP; // 36

/** The screen width at which chrome moves into a side rail (AC-120). */
export const WIDE_BREAKPOINT = 600;

/** AC-121: the rail is never narrower than this. */
export const RAIL_MIN = 96;

/**
 * Chrome budgets, in points of vertical space consumed outside the board.
 * ui.md §3.2: full 177, compact 144, rail 77.
 */
export const CHROME = Object.freeze({
  full:    Object.freeze({ hud: 52, action: 48, tray: 45, gaps: 32 }), // 177
  compact: Object.freeze({ hud: 44, action: 44, tray: 36, gaps: 20 }), // 144
  rail:    Object.freeze({ hud: 0,  action: 0,  tray: 45, gaps: 32 }), //  77
});

const sum = (c) => c.hud + c.action + c.tray + c.gaps;

export const STAGE = Object.freeze({
  WIDE: 'wide',
  COMFORTABLE: 'comfortable',
  COMPACT: 'compact',
  MINIMUM: 'minimum',
  UNSUPPORTED: 'unsupported',
});

/**
 * @param {number} screenW    logical width in points
 * @param {number} screenH    logical height in points
 * @param {number} insetTop   safe-area inset, read as a number, never as a wrapper view
 * @param {number} insetBottom
 * @returns {{stage:string, cell:number|null, chrome:object, chromeHeight:number,
 *            boardW:number, boardH:number, railW:number, gutter:number}}
 */
export function boardLayout(screenW, screenH, insetTop = 0, insetBottom = 0) {
  const fit = (chrome, lo, hi) => {
    const availH = screenH - insetTop - insetBottom - sum(chrome);
    const raw = Math.floor(Math.min((screenW - GUTTER) / COLS, availH / ROWS));
    return { cell: Math.min(raw, hi), ok: raw >= lo, chrome };
  };

  if (screenW >= WIDE_BREAKPOINT) {
    const w = fit(CHROME.rail, 30, 48);
    if (w.ok) {
      // The stage-selection predicate above is the one AC-119 sweeps, unchanged.
      // The rail constraint below can only make the cell SMALLER, so both sweep
      // invariants (cell*15 + chrome + insets <= h, cell*10 <= w - 32) still
      // hold. It exists because a 48 pt board at exactly 600 pt wide would leave
      // the rail 84 pt, and AC-121 requires 96.
      const cellForRail = Math.floor((screenW - RAIL_MIN - WIDE_GUTTERS) / COLS);
      const cell = Math.min(w.cell, cellForRail);
      return finish(STAGE.WIDE, cell, CHROME.rail, screenW, true);
    }
  }

  const s0 = fit(CHROME.full, 30, 44);
  if (s0.ok) return finish(STAGE.COMFORTABLE, s0.cell, CHROME.full, screenW, false);

  const s1 = fit(CHROME.compact, 30, 44);
  if (s1.ok) return finish(STAGE.COMPACT, s1.cell, CHROME.compact, screenW, false);

  const s2 = fit(CHROME.compact, 24, 44);
  if (s2.ok) return finish(STAGE.MINIMUM, s2.cell, CHROME.compact, screenW, false);

  return {
    stage: STAGE.UNSUPPORTED,
    cell: null,
    chrome: CHROME.compact,
    chromeHeight: sum(CHROME.compact),
    boardW: 0,
    boardH: 0,
    railW: 0,
    gutter: 0,
  };
}

function finish(stage, cell, chrome, screenW, wide) {
  const boardW = cell * COLS;
  return {
    stage,
    cell,
    chrome,
    chromeHeight: sum(chrome),
    boardW,
    boardH: cell * ROWS,
    // AC-121: whatever is left of the width after the board and the gutters.
    railW: wide ? screenW - WIDE_GUTTERS - boardW : 0,
    // AC-106: the board is centred, so the gutter is the same on both sides.
    gutter: wide ? WIDE_GUTTER : Math.round((screenW - boardW) / 2),
  };
}

/** ui.md §9: every animal is padded out to a 44 pt touch target (AC-415). */
export function hitSlopFor(width, height) {
  const h = Math.max(0, (44 - width) / 2);
  const v = Math.max(0, (44 - height) / 2);
  return { top: v, bottom: v, left: h, right: h };
}
