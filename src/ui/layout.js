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
 * The rail card's horizontal padding, on each side (GameScreen's `rail` style).
 *
 * It lives here rather than only in the stylesheet because the rail's CONTENT
 * width — what its controls actually have to fit inside — is `railW` minus two
 * of these, and `railSlots` below is the thing that has to know it. The style
 * reads this constant, so there is one number rather than two that agree.
 */
export const RAIL_PAD = 12;

/**
 * Chrome budgets, in points of vertical space consumed outside the board.
 * ui.md §3.2: full 163, compact 134, rail 63 — plus ui.md §7.1's buffalo strip.
 *
 * The tray lost 14 pt when it became silhouettes (§6.2), and that is not
 * decoration: it is a third of why the reference iPhone goes from a 36 pt cell
 * to 39. The thinner tray is part of why nine columns reads better, rather
 * than merely a consequence of it.
 *
 * ---- `strip`, and the one place this deviates from ui.md §7.1 -------------
 *
 * §7.1 asks for a 20 pt buffalo strip under the HUD, "present only when a
 * buffalo is on the board or the countdown is <= 5", whose height "the gap
 * between HUD and board absorbs ... and the cell ladder steps down one rung
 * below that. It never pushes the board."
 *
 * THE GAP CANNOT ABSORB IT, MEASURED. `verticalSlack` on the shipped budget is
 * 9-51 pt across the ui.md §3.2 device table, and five of those ten devices
 * have less than 20: 375x667 has 18, 402x874 has 14, the folded Duo 18, and
 * Display Zoom on a 393x852 has 9. A strip rendered into a gap that short does
 * not fit in it; it pushes the board off the bottom of the screen, which is the
 * AC-103 overflow the whole ladder exists to prevent.
 *
 * AND A CONDITIONAL RESERVATION WOULD BE WORSE THAN A CONSTANT ONE. §7.1's own
 * argument for keeping the strip outside the 52 pt HUD is that "the HUD's
 * height is what the board's fit is calculated from and a variable-height HUD
 * would make the cell ladder variable too". That argument applies verbatim to
 * the strip: reserving it only while it is showing would resize every cell on
 * the board on the turn a buffalo lands, under the player's finger, mid-drag.
 *
 * SO IT IS RESERVED ALWAYS AND HIDDEN WHEN EMPTY, and the reservation is funded
 * the way §7.1 says — out of the gap — by moving 12 pt (full) / 6 pt (compact)
 * from `gaps` into `strip`. `gaps` keeps `boardTrayGap` plus the two hairline
 * rules plus 2 pt, which is what makes `verticalSlack` provably non-negative
 * (see its own comment). The net cost to the board is 8 pt at full chrome and
 * 10 pt at compact — one rung on some viewports, none on the reference device,
 * where the cell stays at 39.
 *
 * REPORTED, NOT DECIDED HERE: whether the board may pay 8 pt for the strip at
 * all is the owner's call, and the alternative — adding all 20 pt on top —
 * costs the reference device a rung as well.
 */
export const CHROME = Object.freeze({
  full:    Object.freeze({ hud: 52, action: 48, tray: 31, gaps: 20, strip: 20 }), // 171
  compact: Object.freeze({ hud: 44, action: 44, tray: 26, gaps: 14, strip: 16 }), // 144
  // Stage W puts the HUD in the side rail, and the strip goes with it: it is
  // part of the HUD's information, not part of the vertical stack (AC-121 —
  // the rail carries the same components, none added or removed).
  rail:    Object.freeze({ hud: 0,  action: 0,  tray: 31, gaps: 32, strip: 0 }),  //  63
});

const sum = (c) => c.hud + c.action + c.tray + c.gaps + c.strip;

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
 * ui.md §7.1 — the buffalo strip's own geometry.
 *
 * The strip is `chrome.strip` tall in total and carries a 12 pt chip row under
 * its top padding: 6 + 12 + 2 = 20 at full chrome, 2 + 12 + 2 = 16 at compact.
 * The bars do not shrink with the chrome, because a 12 pt bar is already the
 * smallest thing in the HUD that has to be countable at arm's length.
 */
export const CHIP_H = 12;

export function buffaloStripMetrics(chrome) {
  // Stage W reserves nothing in the vertical stack because the strip goes into
  // the rail with the rest of the HUD, so it takes the full budget's geometry
  // rather than a height of zero.
  const height = chrome.strip || CHROME.full.strip;
  return { height, padTop: Math.max(0, height - CHIP_H - 2), chipH: CHIP_H };
}

/**
 * ui.md §7.1's three chip rules, largest first. A chip is five bars — one per
 * `SPECIES.buffalo.size` segment — and the glyph drops at the tightest rule.
 *
 * `glyphGap` is not in §7.1; it takes the bar gap, so there is one number
 * rather than a fourth that has to agree with it.
 */
export const BUFFALO_BARS = 5;

export const CHIP_RULES = Object.freeze([
  Object.freeze({ upTo: 4,  bar: 5, barGap: 2,   chipGap: 10, glyph: 13 }),
  Object.freeze({ upTo: 7,  bar: 3, barGap: 1.5, chipGap: 7,  glyph: 13 }),
  Object.freeze({ upTo: 10, bar: 2, barGap: 1,   chipGap: 5,  glyph: 0 }),
]);

function chipWidth(rule) {
  const bars = BUFFALO_BARS * rule.bar + (BUFFALO_BARS - 1) * rule.barGap;
  return rule.glyph ? bars + rule.glyph + rule.barGap : bars;
}

function rowWidth(count, rule) {
  return count * chipWidth(rule) + Math.max(0, count - 1) * rule.chipGap;
}

/**
 * The chip rule for `count` buffalo in `available` points — AC-509d: they
 * SHRINK to fit, and never wrap, scroll, or hide behind a "+3". A count you
 * have to tap to read is not a status, it is a menu.
 *
 * Two things make this a function of the width rather than a lookup on the
 * count alone, and both are measurements rather than caution:
 *
 *   - §7.1 sizes ten chips at 185 pt "of a 361 pt content width", which is the
 *     REFERENCE device. The viewport sweep supports 272 pt of width, where the
 *     content is 240 and the chips have about 150 — so even §7.1's own ten-chip
 *     figure does not fit the narrowest screen this app claims to support.
 *   - §7.1's worst case is ten buffalo. Over 300 bot seeds on this curve I
 *     measured ELEVEN, and with no population cap (AC-311) nothing bounds it.
 *     A table that stops at ten would be a table with an unhandled case.
 *
 * So the three rules are honoured exactly where they fit, and past them the
 * tightest rule is scaled down proportionally. Nothing is ever dropped.
 */
export function chipRuleFor(count, available) {
  if (count <= 0) return null;
  for (const rule of CHIP_RULES) {
    if (count <= rule.upTo && rowWidth(count, rule) <= available) {
      return finishRule(rule, count);
    }
  }
  // The tightest rule has no COUNT ceiling, only a width one: `upTo: 10` above
  // is what stops a LARGER rule being used for eleven buffalo, not a claim that
  // eleven cannot happen. It can — I measured 11 over 300 bot seeds — and with
  // no population cap (AC-311) nothing bounds it.
  const tight = CHIP_RULES[CHIP_RULES.length - 1];
  if (rowWidth(count, tight) <= available) return finishRule(tight, count);

  // Past even that, the tightest rule is SCALED — one factor over all three
  // dimensions, never a per-dimension solve.
  //
  // The factor is what makes it monotone, and monotone is the property that
  // matters: `rowWidth(count, tight)` strictly increases with the count, so
  // the factor never increases, so no chip is ever WIDER than the one before
  // it. Solving the bar against a gap that had itself been rounded down
  // produced a 4 pt bar for eleven buffalo where ten got 2 — the row growing
  // as the board got worse.
  //
  // Half-point precision, because a quarter-point bar is a rounding artefact
  // on every scale factor iOS ships. The bar keeps a half-point floor and the
  // gaps do not: a chip with no gap is crowded, a chip with no bar is nothing.
  const half = (v, floor) => Math.max(floor, Math.floor(v * 2) / 2);
  const k = available / rowWidth(count, tight);
  return finishRule({
    upTo: null,
    bar: half(tight.bar * k, 0.5),
    barGap: half(tight.barGap * k, 0),
    chipGap: half(tight.chipGap * k, 0),
    glyph: 0,
  }, count);
}

/**
 * ui.md §7.1's gold rim, sized so it cannot eat the bar it is drawn on.
 *
 * The rim is per-BAR rather than around the chip, because at the 8-10 rule the
 * chip IS its bars: the glyph drops and there is no plate left to rim. §7.1's
 * own width arithmetic — "10 x (5 x 2 + 4 x 1) + 9 x 5 = 185" — counts a chip
 * as exactly its bars and allows nothing for a surround, so a rim that added
 * width would contradict the figure it is specified beside. React Native's
 * border is inside the box, so this one adds none.
 *
 * At a 2 pt bar a 1 pt rim on each side would leave zero fill and the chip
 * would be all rim: the remaining/spent distinction, which is the whole
 * information, would vanish at exactly the crowd size that needs it most. So
 * it scales with the bar and keeps at least half the width as fill.
 */
function finishRule(rule, count) {
  const out = { ...rule, rim: Math.min(1, rule.bar / 4) };
  return { ...out, width: chipWidth(out), row: rowWidth(count, out) };
}

/**
 * ui.md §7.1: `NEXT 🐃 n`, 11/600 mono, right-aligned, never wraps. Reserved
 * rather than measured, for `STATUS_W`'s reason — the chips have to know what
 * is left, and a width that depends on text metrics is a width the layout
 * cannot compute before it renders.
 */
export const COUNTDOWN_W = 78;

/** The gap between the chip row and the countdown. */
export const COUNTDOWN_GAP = 8;

/** How much width the chip row has, given the screen (or rail) width. */
export function chipRoomFor(contentW) {
  return Math.max(0, contentW - COUNTDOWN_W - COUNTDOWN_GAP);
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

/** ui.md §13.1: the gap between action-bar controls. */
export const ACTION_GAP = 12;

/**
 * The turn-state line's slot. 12 uppercase characters at `TYPE.label`'s 10 pt
 * with 1.4 of letter spacing — `2 MOVES LEFT` is the longest string it carries.
 */
export const STATUS_W = 96;

/** The abilities control at its smallest: the bolt, the four pips, padding. */
export const ABILITY_W = 80;

/** What the word ABILITIES adds when there is room for it. */
export const ABILITY_LABEL_W = 76;

/**
 * The action bar's three slots — and the one real deviation in this layer.
 *
 * ui.md §13.1 specifies two 150 pt buttons with the turn-state line moved into
 * "the HUD's spare right-hand column". Neither half survives arithmetic:
 *
 *   - **The HUD has no spare column.** A 12 pt label stacked over a 44 pt pause
 *     button is 58 pt inside a 52 pt (full) or 44 pt (compact) budget. Laid out
 *     as a row instead, the worst case — a 5-digit score, the streak pill, the
 *     buffalo chip, `2 MOVES LEFT` and the 44 pt button — sums to about 411 pt
 *     inside the reference device's 361 pt of content.
 *   - **150 pt is a reference-device figure.** Two of them plus the gap and the
 *     gutters is 344 pt, and the viewport sweep supports 248 pt.
 *
 * So the line stays in the bar where it already worked, and the abilities
 * control is icon-sized — the bolt plus its four pips, which ui.md §13.1 itself
 * calls "the whole status, so it needs no label". The label and then the status
 * line drop out as the screen narrows, in that order, and Pass takes whatever
 * is left. Every stage keeps both controls above the 44 pt touch floor, and no
 * chrome height moved, which is what keeps the board fitting.
 */
export function actionBarSlots(screenW) {
  const content = Math.max(0, screenW - GUTTER);
  const passFor = (statusW, labelW) =>
    content - statusW - (ABILITY_W + labelW) - ACTION_GAP * (statusW > 0 ? 2 : 1);

  // The label goes first and the status second, because the pips ARE the
  // ability's status and the turn-state line is not duplicated anywhere else.
  let showStatus = true;
  let showAbilityLabel = true;
  if (passFor(STATUS_W, ABILITY_LABEL_W) < MIN_TOUCH) {
    showAbilityLabel = false;
    if (passFor(STATUS_W, 0) < MIN_TOUCH) {
      showStatus = false;
      showAbilityLabel = passFor(0, ABILITY_LABEL_W) >= MIN_TOUCH;
    }
  }
  const statusW = showStatus ? STATUS_W : 0;
  const abilityW = ABILITY_W + (showAbilityLabel ? ABILITY_LABEL_W : 0);
  return {
    showStatus,
    showAbilityLabel,
    statusW,
    abilityW,
    passW: Math.max(MIN_TOUCH, passFor(statusW, showAbilityLabel ? ABILITY_LABEL_W : 0)),
    gap: ACTION_GAP,
  };
}

/**
 * Stage W's action bar — the same three controls, stacked in the rail.
 *
 * SEPARATE FROM `actionBarSlots` BECAUSE THE ARITHMETIC IS DIFFERENT, not
 * because the rules are. The horizontal bar shares one row between three
 * controls and subtracts the gaps between them; the rail gives each control the
 * full content width of a padded card and stacks them. One function pretending
 * to be both would be the two disagreeing cell formulas of v1 in miniature.
 *
 * WHY IT EXISTS. The rail used to pass `showLabel` unconditionally, on the
 * assumption that a rail is wide — and at the Duo's unfolded width the rail is
 * 158 pt, which is 134 pt of content against the 156 pt the word needs. The
 * button rendered `⚡ ABIL…` (Slice 6, `duo-unfolded-01-skyline.png`). ui.md
 * §13 already specifies the glyph-only variant "where the bar is too narrow for
 * the word"; nothing was measuring, so nothing chose it. AC-126's rule is that
 * the ladder derives from the width it is given, and a rail is a width.
 *
 * The turn-state line is NOT given a drop here, and that is deliberate: AC-121
 * requires the rail to carry the same components as the narrow layout with
 * "no element added or removed", and the sweep in `test/abilities-ui.test.js`
 * shows `STATUS_W` fits in the narrowest rail the ladder can produce. A branch
 * that can never be taken is untested code, so there is none.
 */
export function railSlots(railW) {
  const content = Math.max(0, railW - RAIL_PAD * 2);
  return {
    content,
    showAbilityLabel: content >= ABILITY_W + ABILITY_LABEL_W,
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
 *
 * It subtracts the buffalo strip because the strip is reserved whether or not
 * it is showing (see CHROME). That reservation is also what makes this
 * provably non-negative rather than merely measured to be: substituting the
 * definitions gives `avail - cell x ROWS + (gaps - boardTrayGap) - 2`, and
 * `gaps` is set 4 above `boardTrayGap` at both budgets precisely to cover the
 * two HAIRLINEs and leave 2 over, while `cell <= floor(avail / ROWS)` makes the
 * first term non-negative by construction.
 */
export function verticalSlack(layout, screenH, insetTop, insetBottom) {
  if (layout.stage === STAGE.UNSUPPORTED) return 0;
  const { chrome, cell } = layout;
  const wide = layout.stage === STAGE.WIDE;
  // Stage W moves the HUD and the action bar into the rail, so the only
  // vertical chrome left is the tray.
  const bars = wide ? 0 : hudHeight(chrome) + actionBarHeight(chrome);
  const region = screenH - insetTop - insetBottom - bars - chrome.strip;
  const group = cell * ROWS + boardTrayGap(chrome) + chrome.tray;
  return region - group;
}

/** ui.md §9: every animal is padded out to a 44 pt touch target (AC-415). */
export function hitSlopFor(width, height) {
  const h = Math.max(0, (44 - width) / 2);
  const v = Math.max(0, (44 - height) / 2);
  return { top: v, bottom: v, left: h, right: h };
}
