// Wildlife Shuffle v2 — engine constants.
// Pure data. No mutable module state: every dimension lives here as a frozen
// constant and is passed explicitly to the functions that need it.
// (docs/v1-review.md A3 — v1 kept GRID_WIDTH/GRID_HEIGHT as mutable module globals
// written during render, so canMoveAnimal and checkGameOver silently disagreed with
// the rest of the system.)

/** Board geometry. gameplay.md §3: one fixed board, 10 wide x 15 tall. */
export const BOARD = Object.freeze({
  // gameplay.md §3. Nine columns, and every rule, band, invariant and layout
  // figure derives from this constant — AC-126's lesson applied to the board
  // itself, which is what made narrowing it a constant edit rather than a
  // rewrite.
  width: 9,
  height: 15,
  /** Row 14 is the kill line: occupying it at JUDGE ends the run. */
  killLine: 14,
  /** Rows 11-13 are the danger band (presentation only). */
  dangerBandLow: 11,
  dangerBandHigh: 13,
});

/** gameplay.md §5.4. Buffalo is scheduled, never drawn. */
export const SPECIES = Object.freeze({
  rat: Object.freeze({ type: 'rat', size: 1, emoji: '\u{1F400}' }),
  fox: Object.freeze({ type: 'fox', size: 2, emoji: '\u{1F98A}' }),
  elk: Object.freeze({ type: 'elk', size: 3, emoji: '\u{1F98C}' }),
  // gameplay.md §5.4: elephant 4 and buffalo 5, reverted to the owner's 11 July
  // values. v2 inherited 5/4 from two stale sources at once — a review written
  // against a pre-revert commit, and a spec.md still documenting the superseded
  // 8 July swap. It also tidies the lightness ramp: the drawable species now run
  // 1,2,3,4 contiguously with buffalo alone off it at 5.
  elephant: Object.freeze({ type: 'elephant', size: 4, emoji: '\u{1F418}' }),
  buffalo: Object.freeze({ type: 'buffalo', size: 5, emoji: '\u{1F403}' }),
});

export const BUFFALO = 'buffalo';

/** Species that may be drawn at random, largest first. */
export const DRAWABLE = Object.freeze(['elephant', 'elk', 'fox', 'rat']);

/**
 * gameplay.md §5.5. Difficulty varies band, weights and buffalo cadence.
 *
 * THE SECOND SET OF BANDS (gameplay.md §5.6a). The first were derived from
 * fraction-of-row and the bot falsified them: medians of 73 / 35.5 / 27
 * against a hypothesis of 100-150 / 60-90 / 35-55, all three short and Savanna
 * worst at -41%. Every ceiling drops by 1 and Savanna's and Tundra's starting
 * bands drop by 1.
 *
 * MEADOW'S STARTING BAND DOES NOT MOVE, and that is a finding rather than a
 * choice — see AC-306b and `bandFloorViolations` below. It is the one band in
 * the table that is at a hard floor rather than at a tuned value.
 *
 * This retune moves BANDS ONLY. The measured ratios (2.06 and 1.31 against a
 * target of 1.8 and 1.6) are a SHAPE problem, and lowering every band
 * uniformly cannot fix a shape — it moves all three without changing their
 * ratios. The lever for that is the per-difficulty ramp interval, which is
 * deliberately the next change and not this one, because §5.7's ordering
 * exists so a measurement can attribute an effect to a cause.
 */
export const DIFFICULTIES = Object.freeze({
  meadow: Object.freeze({
    id: 'meadow',
    label: 'Meadow',
    // 2-4 is Meadow's FLOOR, not its tuning. AC-306b.
    startBand: Object.freeze([2, 4]),
    ceilingBand: Object.freeze([3, 5]),
    buffaloEvery: 12,
    weights: Object.freeze({ rat: 35, fox: 30, elk: 25, elephant: 10 }),
  }),
  savanna: Object.freeze({
    id: 'savanna',
    label: 'Savanna',
    startBand: Object.freeze([2, 4]),
    ceilingBand: Object.freeze([4, 6]),
    buffaloEvery: 10,
    weights: Object.freeze({ rat: 25, fox: 28, elk: 27, elephant: 20 }),
  }),
  tundra: Object.freeze({
    id: 'tundra',
    label: 'Tundra',
    startBand: Object.freeze([3, 5]),
    // The W-1 = 8 ceiling that forced 6-8 rather than 7-9 (gameplay.md §5.6)
    // is no longer the binding constraint here: 5-7 sits under it with room.
    // The reason it dropped is the retune, not the invariant — but the
    // invariant is still what stops anything climbing back past 6-8.
    ceilingBand: Object.freeze([5, 7]),
    buffaloEvery: 8,
    weights: Object.freeze({ rat: 15, fox: 25, elk: 30, elephant: 30 }),
  }),
});

export const DEFAULT_DIFFICULTY = 'savanna';

/**
 * gameplay.md §5.5: +1 to both ends of the band every 12 turns, until the
 * ceiling.
 *
 * ONE INTERVAL FOR ALL THREE DIFFICULTIES, and it stayed that way through the
 * band retune on purpose. Making it per-difficulty is the designer's named
 * lever for the ratio problem (§5.6b) and is the NEXT change; moving magnitude
 * and spacing in the same pass would make the following measurement
 * unattributable.
 */
export const RAMP_EVERY_TURNS = 12;

/**
 * gameplay.md §5.2 invariant 1: a batch may never fill the row, or it would
 * clear on arrival with no player involvement. Derived from the width, never a
 * literal — the whole point of the AC-126 rule.
 */
export const MAX_BATCH_CELLS = BOARD.width - 1;

/**
 * gameplay.md §5.2: the mean size of a draw from a difficulty's weight table.
 *
 * The generator needs this to turn a cell target into a NUMBER OF ANIMALS
 * before it draws any species — which is the whole fix. Derived from the
 * weights rather than written down, so the two can never disagree.
 */
export function meanDrawnSize(difficultyId) {
  const weights = DIFFICULTIES[difficultyId].weights;
  let total = 0;
  let cells = 0;
  for (const key of DRAWABLE) {
    total += weights[key];
    cells += weights[key] * SPECIES[key].size;
  }
  return cells / total;
}

/**
 * gameplay.md §4: a crash guard, NOT a scoring cutoff.
 *
 * The clear loop terminates by construction — every step removes at least one
 * completed row, `width` occupied cells of which at most five can belong to the
 * one permitted buffalo, from a board holding at most width x height — so the
 * cascade is bounded by mass at roughly 15 steps. 32 is far above that, so
 * tripping this means the engine is broken: gravity is not settling, or a clear
 * is not removing. It must be loud, and it must never silently change the score.
 */
export const CHAIN_GUARD_STEPS = 32;

/** gameplay.md §8: the board is seeded with two arrival batches before turn 1. */
export const SEED_BATCHES = 2;

/** gameplay.md §7.2 scoring tables. */
export const SCORE = Object.freeze({
  rowValues: Object.freeze([0, 100, 300, 600, 1000]),
  rowValueStep: 400,
  buffaloShrink: 50,
  /**
   * gameplay.md §7.2: rose 500 -> 650 with the buffalo's size. At size 5 it
   * costs a fifth completion and blocks 55% of a 9-wide row rather than 40% of
   * a 10-wide one; a flat reward against a growing imposition would invert the
   * incentive §6.4 is built on.
   */
  buffaloRetire: 650,
  perfectClear: 1000,
  chainMultCap: 5,
  /**
   * streakMult by consecutive clearing turns, in tenths so the arithmetic stays
   * exact. Index 0 is the "no streak" case. gameplay.md §7.2: a lookup table,
   * not a formula — the old linear 0.2 step only reached the cap at eleven
   * consecutive clearing turns, which no 40-70 turn run ever sees.
   */
  streakTenths: Object.freeze([10, 10, 13, 16, 20, 25, 30]),
});

/** Consecutive clearing turns at which streakMult reaches its 3.0 cap. */
export const STREAK_TURNS_AT_CAP = SCORE.streakTenths.length - 1;

/** Phases of one turn (gameplay.md §4). */
export const PHASE = Object.freeze({
  ACTION: 'ACTION',
  SETTLE: 'SETTLE',
  ARRIVAL: 'ARRIVAL',
  JUDGE: 'JUDGE',
  ADVANCE: 'ADVANCE',
});

/** The only order the phases may execute in (AC-204). */
export const PHASE_ORDER = Object.freeze([
  PHASE.ACTION,
  PHASE.SETTLE,
  PHASE.ARRIVAL,
  PHASE.JUDGE,
  PHASE.ADVANCE,
]);

/** Engine-level lifecycle status. Animation phases are a presentation concern. */
export const STATUS = Object.freeze({ READY: 'READY', GAME_OVER: 'GAME_OVER' });
