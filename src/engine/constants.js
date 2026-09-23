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
 * gameplay.md §5.5b — ONE CURVE. There are no habitats.
 *
 * Meadow, Savanna and Tundra were a choice the player had to make at the moment
 * they knew least about any of them, and our own measurement could not reliably
 * tell them apart: across ten independent 30-seed blocks the Meadow/Savanna run
 * length ratio ranged 1.15-1.62, so two of those blocks would have told a player
 * the two were the same game.
 *
 * THE SURVIVING TABLE IS MEADOW'S, AND IT WAS SELECTED, NOT INVENTED. AC-318h
 * forbids a NEW band, ramp or weight value while no per-turn duration has been
 * measured on a device; it does not forbid choosing among three that already
 * shipped. This is the only one of the three whose measured run length lands
 * inside §0's 3-5 minute window once buffalo accumulate.
 *
 * The 2-4 start is a FLOOR rather than a tuning value (AC-306b,
 * `bandFloorViolations`): it is the one band in the retune that did not move,
 * because a lower one cannot be delivered by a generator that always draws at
 * least one animal.
 *
 * The ceiling is reached at turn 13 and is flat for the rest of the run
 * (AC-307d). What escalates after that is the buffalo, not the band — see
 * BUFFALO_PHASES, and §5.5b on why the two ramps are deliberately separated in
 * time so that at every point in a run there is one dominant cause of the
 * difficulty changing.
 */
export const CURVE = Object.freeze({
  startBand: Object.freeze([2, 4]),
  ceilingBand: Object.freeze([3, 5]),
  weights: Object.freeze({ rat: 35, fox: 30, elk: 25, elephant: 10 }),
});

/**
 * gameplay.md §5.5b — the buffalo schedule, as three phases of ONE run.
 *
 * The owner: "Buffalo appears each 12 turns for 2-3 times then reduced to 10,
 * to 8 ... and probably stop at that. The game gets harder overtime instead of
 * having a fix level concept."
 *
 *   buffalo  1   2   3      4   5   6      7   8   9  10 ...
 *   turn    12  24  36     46  56  66     74  82  90  98 ...
 *            |-- every 12 --|   |- every 10 -|   |- every 8, for ever -|
 *
 * 12 / 10 / 8 are not new numbers: they were the three habitats' `buffaloEvery`
 * values, repurposed as phases of one curve.
 *
 * `until: null` is the last phase and it never ends. Each phase counts from its
 * own `from`, which is what makes turn 46 the fourth buffalo rather than the
 * 40th turn of a 10-cadence that started at zero.
 *
 * THIS TABLE IS THE WHOLE SCHEDULE (AC-310b, AC-310c). Nothing may suppress a
 * scheduled buffalo — not a population cap, not "one at a time", not a board
 * state — because the HUD countdown (AC-509c) promises the player a number, and
 * a schedule with an input the player cannot see is v1's broken tray preview
 * wearing a different hat.
 */
export const BUFFALO_PHASES = Object.freeze([
  Object.freeze({ from: 0, until: 36, every: 12 }),
  Object.freeze({ from: 36, until: 66, every: 10 }),
  Object.freeze({ from: 66, until: null, every: 8 }),
]);

/**
 * gameplay.md §13.2a — at most three charges may be BANKED.
 *
 * Three is the dial between recovery and reset, not a guard against bursting:
 * bursting is impossible because an ability is the turn's action (AC-1406b), so
 * three charges are three turns of intervention however they are held. Move it
 * only on the evidence §13.2a names — crises routinely unsurvivable with three
 * in hand, or runs routinely rescued from positions that should have ended.
 *
 * Last Stand ignores it deliberately (AC-1408c), so a run can hold four: three
 * is what good play banks, and the fourth exists only because you are in
 * trouble.
 */
export const ABILITY_CHARGE_CAP = 3;

/**
 * gameplay.md §13.2c / AC-1405, AC-320g — ONE threshold ladder.
 *
 * AC-1405f: each rung is a PERCENTILE of the measured final-score distribution,
 * and the absolute figures below are that percentile over 300 bot runs on THIS
 * curve, abilities off. `ABILITY_PERCENTILES` is carried beside the numbers so
 * the derivation is in the file rather than only in the document that produced
 * it.
 *
 * ONE LADDER, because there is one curve. Three existed only because three
 * medians differed by 1.68x and 1.84x and a single table priced for Meadow
 * would have put the first charge beyond an entire median Tundra run. That
 * argument dies with the habitats.
 *
 * THESE ARE RE-DERIVED, NOT CARRIED OVER, and the rounding rule is stated so
 * the next re-derivation is arithmetic rather than taste: each of the first four
 * rungs is its measured percentile floored to the nearest 100, and the last two
 * are 1.6x and 2.4x the rounded p90, floored the same way.
 *
 * Measured over 300 bot seeds on this curve, abilities off:
 *   raw     1750  2335  3635  5870   (p35 p50 p75 p90)
 *   rung    1700  2300  3600  5800  9200  13900
 *
 * The collapse shortens the median run from 69 turns to 58, and a run that ends
 * sooner scores less — the median final score falls 2,655 to 2,325. Carrying
 * the shipped Meadow ladder over would therefore have sold the first charge at
 * the 47th percentile of this curve rather than at the 35th, which is a rung
 * that no longer names what AC-1405f says it names. A retune re-derives the
 * ladder; it does not strand it.
 */
export const ABILITY_PERCENTILES = Object.freeze([
  'p35', 'p50', 'p75', 'p90', 'p90x1.6', 'p90x2.4',
]);

export const ABILITY_THRESHOLDS = Object.freeze(
  [1700, 2300, 3600, 5800, 9200, 13900],
);

/**
 * gameplay.md §5.5: +1 to both ends of the band every 12 turns, until the
 * ceiling — which this curve reaches at turn 13 and never leaves (AC-307d).
 *
 * It shares its 12 with the FIRST buffalo phase and nothing else, and the two
 * are deliberately separated in time rather than run together (§5.5b): the band
 * finishes ramping at turn 13, the buffalo cadence does not tighten until turn
 * 37, so at every point in a run there is one dominant cause of the difficulty
 * changing and a pacing measurement can attribute a shift to a lever.
 */
export const RAMP_EVERY_TURNS = 12;

/**
 * gameplay.md §5.2 invariant 1: a batch may never fill the row, or it would
 * clear on arrival with no player involvement. Derived from the width, never a
 * literal — the whole point of the AC-126 rule.
 */
export const MAX_BATCH_CELLS = BOARD.width - 1;

/**
 * gameplay.md §5.2: the mean size of a draw from the curve's weight table.
 *
 * The generator needs this to turn a cell target into a NUMBER OF ANIMALS
 * before it draws any species — which is the whole fix. Derived from the
 * weights rather than written down, so the two can never disagree.
 */
export function meanDrawnSize() {
  const weights = CURVE.weights;
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
 * TERMINATION, RE-DERIVED — AND AC-504's AMENDED ARGUMENT IS WRONG. REPORTED.
 *
 * AC-504 now reads: "a completed row is BOARD.width = 9 cells, of which at most
 * SPECIES.buffalo.size = 5 can belong to a buffalo (AC-311b), so every step
 * removes at least 4 cells". AC-311b's premise is that two buffalo cannot share
 * a row because `2 x 5 > 9`.
 *
 * THAT IS TRUE OF TWO FULL BUFFALO AND OF NOTHING ELSE. A buffalo shrinks: a
 * size-4 and a size-5 buffalo are 9 cells and fit a row exactly, and four
 * buffalo of sizes 3/2/2/1 were MEASURED sharing one row. Over 18,712 bot turns
 * on 300 seeds, 15.2% of settled boards had at least two buffalo in one row.
 *
 * The true floor, per clear step: a completed row is `width` cells, every
 * non-buffalo cell in it leaves and every buffalo in it spends one segment, so
 * `(width - B) + n` cells leave, where `B` is the buffalo cells and `n` the
 * number of buffalo. `B - n` is the sum of `size - 1` over those buffalo, which
 * at `size <= 5` and `B <= width` is maximised at 7 by the 5+4 pair — so
 *
 *     at least TWO cells leave the board on every step.
 *
 * Measured: a step that removed no animal at all and shrank two buffalo, on a
 * row that was nothing but buffalo. 257 of 6,595 clear steps shrank more than
 * one buffalo; the most in one step was three.
 *
 * THE CONSEQUENCE FOR THIS CONSTANT, STATED PLAINLY. Two cells a step against a
 * board holding at most `width x height` = 135 bounds the cascade at 67 steps,
 * which is ABOVE this guard rather than below it. The bound is very loose — a
 * two-cell step needs a row that is exactly two buffalo, after which that row is
 * no longer complete — and the deepest cascade ever measured is 4 steps against
 * a committed 7-step fixture. But "32 is far above the bound" was a proof and is
 * now an empirical claim, and whether 32 is still the right number is a design
 * decision (it is in TUNING_SURFACE), not a thing to change here.
 *
 * Tripping it still means the engine is broken: gravity is not settling, or a
 * clear is not removing. It must be loud, and it must never silently change the
 * score.
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
