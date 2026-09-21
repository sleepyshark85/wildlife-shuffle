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

/**
 * The HUD's bottom rule and the action bar's top rule. React Native is
 * border-box, so a bar given `height: chrome.action` has a CONTENT box of
 * `chrome.action - HAIRLINE` — which is one point too short to hold the 44 pt
 * Pass button at compact chrome, and the button then overhangs the rule.
 * Chrome heights in CHROME below are content heights; the bars add this.
 */
export const HAIRLINE = 1;


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
 * ui.md §3.2: full 163, compact 134, rail 63.
 *
 * The tray lost 14 pt when it became silhouettes (§6.2), and that is not
 * decoration: it is a third of why the reference iPhone goes from a 36 pt cell
 * to 39. The thinner tray is part of why nine columns reads better, rather
 * than merely a consequence of it.
 */
export const CHROME = Object.freeze({
  full:    Object.freeze({ hud: 52, action: 48, tray: 31, gaps: 32 }), // 163
  compact: Object.freeze({ hud: 44, action: 44, tray: 26, gaps: 20 }), // 134
  rail:    Object.freeze({ hud: 0,  action: 0,  tray: 31, gaps: 32 }), //  63
});

const sum = (c) => c.hud + c.action + c.tray + c.gaps;

/**
 * The gap between the board and the tray. The `gaps` line of the chrome budget
 * covers this plus the breathing room above and below the group; the group is
 * a flex child centred in whatever remains, so the surplus is absorbed rather
 * than spent (ui.md §3.1).
 */
export function boardTrayGap(chrome) {
  return chrome === CHROME.compact ? 10 : 16;
}


/**
 * The tray's internal geometry (ui.md §6).
 *
 * It lives here, next to the one sizing function, because two components now
 * need it: the tray draws the strip, and the arrival flight has to start from
 * the exact pixel the strip drew the animal at (AC-809). Two copies of these
 * five numbers would be v1's two disagreeing cell formulas in miniature.
 */
export function trayMetrics(cell, compact) {
  const chrome = compact ? CHROME.compact : CHROME.full;
  const labelH = compact ? 8 : 10;
  const ruleH = compact ? 2 : 3;
  // ui.md §6.2: 0.46 x cell, which is 18 pt at the reference 39 pt cell and
  // 10 + 18 + 3 = the 31 pt block exactly. The clamp is what keeps that true at
  // the 44 pt ceiling, where the ratio alone would overrun the budget the
  // ladder promised the board — a tray that quietly exceeds its own chrome
  // allowance is a clip waiting for a device nobody swept.
  const stripH = Math.min(Math.round(cell * 0.46), chrome.tray - labelH - ruleH);
  // No `glyph`: the strip draws silhouettes now, so there is no emoji to
  // size, and a zero left here would be a number the tray could start reading
  // again by accident (ui.md §6.2, AC-315).
  return { labelH, stripH, ruleH, bodyH: stripH - 2 };
}

/**
 * Where each tray silhouette is drawn, and how wide (ui.md §6.2, AC-315b).
 *
 * This is a pure function rather than JSX arithmetic because AC-315b is a
 * claim about GEOMETRY that has to be checkable: a fox at column 3 and two
 * rats at columns 3 and 4 must produce visibly different shapes — one 2-wide
 * shadow against two 1-wide ones — and if they merged, the preview would be
 * stating a footprint the batch does not have. That is the one thing the
 * silhouette is not allowed to do, because it crosses from withholding
 * flavour into misrepresenting the plan, which is the exact v1 defect §6
 * exists to close.
 *
 * The gap is taken off the RIGHT of each silhouette rather than split around
 * it, so every left edge still sits exactly on its spawn column and the
 * preview stays literal about where the animal lands (AC-315, AC-301).
 */
export function traySilhouettes(queue, cell, gap) {
  return queue.map((animal) => ({
    id: animal.id,
    type: animal.type,
    left: animal.x * cell,
    width: animal.size * cell - gap,
  }));
}

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

/** ui.md §9: the floor for every touch target, at every stage (AC-114). */
export const MIN_TOUCH = 44;

/** ui.md §13.1: the gap between the two action-bar buttons. */
export const ACTION_GAP = 12;

/**
 * The two action-bar slots (ui.md §13.1), and the one deviation in this slice.
 *
 * The design says "two buttons, 150 pt each, 12 pt gap". 150 is a figure read
 * off the reference 393 pt device, and taken as a constant it OVERFLOWS: the
 * layout sweep supports widths down to 248 pt, where 150 + 12 + 150 + 32 pt of
 * gutter is 344 pt against 248 available. A hard 150 would clip the Pass button
 * off the right of the screen on every stage below comfortable.
 *
 * So the slots are derived from the width the same way every other dimension in
 * this file is (AC-126): the bar's content box, less the gap, halved. At the
 * reference device that gives 174 pt rather than 150 — wider than specified,
 * never narrower — and it stays above MIN_TOUCH everywhere the ladder supports
 * a board at all. `test/layout.test.js` sweeps it.
 */
export function actionBarSlots(screenW) {
  const inner = screenW - GUTTER;
  return {
    buttonW: Math.max(MIN_TOUCH, Math.floor((inner - ACTION_GAP) / 2)),
    gap: ACTION_GAP,
  };
}

/**
 * The action bar's laid-out height.
 *
 * React Native is border-box, so a bar given `chrome.action` has a CONTENT box
 * of `chrome.action - HAIRLINE`. Adding the rule on top is what keeps the
 * content box equal to the chrome budget — and the budget is what has to hold
 * the Pass button. Getting this backwards cost a point of vertical scroll at
 * compact and minimum chrome (AC-103).
 */
export function actionBarHeight(chrome) {
  return chrome.action + HAIRLINE;
}

/** Same construction, same correction: the HUD's rule sits below its content. */
export function hudHeight(chrome) {
  return chrome.hud + HAIRLINE;
}

/**
 * The Pass button's height inside the vertical action bar. It never falls below
 * MIN_TOUCH, and it must never exceed the bar's content box — `test/layout.test.js`
 * asserts both, for every chrome budget on the ladder.
 */
export function passButtonHeight(chrome) {
  return Math.max(MIN_TOUCH, chrome.action - 4);
}

/**
 * How much vertical room the board + tray group has left over, once the HUD and
 * the action bar have taken their content heights AND their rules.
 *
 * This is the AC-103 guarantee expressed in the geometry the screen actually
 * renders, rather than in the ladder's abstract budget: a negative result is a
 * scroll or a clip. `test/layout.test.js` sweeps it.
 */
export function verticalSlack(layout, screenH, insetTop, insetBottom) {
  if (layout.stage === STAGE.UNSUPPORTED) return 0;
  const { chrome, cell } = layout;
  const wide = layout.stage === STAGE.WIDE;
  // Stage W moves the HUD and the action bar into the rail, so the only
  // vertical chrome left is the tray.
  const bars = wide ? 0 : hudHeight(chrome) + actionBarHeight(chrome);
  const region = screenH - insetTop - insetBottom - bars;
  const group = cell * ROWS + boardTrayGap(chrome) + chrome.tray;
  return region - group;
}

/** ui.md §9: every animal is padded out to a 44 pt touch target (AC-415). */
export function hitSlopFor(width, height) {
  const h = Math.max(0, (44 - width) / 2);
  const v = Math.max(0, (44 - height) / 2);
  return { top: v, bottom: v, left: h, right: h };
}
