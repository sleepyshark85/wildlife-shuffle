// Wildlife Shuffle v2 — engine constants.
// Pure data. No mutable module state: every dimension lives here as a frozen
// constant and is passed explicitly to the functions that need it.
// (docs/v1-review.md A3 — v1 kept GRID_WIDTH/GRID_HEIGHT as mutable module globals
// written during render, so canMoveAnimal and checkGameOver silently disagreed with
// the rest of the system.)

/** Board geometry. gameplay.md §3: one fixed board, 10 wide x 15 tall. */
export const BOARD = Object.freeze({
  width: 10,
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
  buffalo: Object.freeze({ type: 'buffalo', size: 4, emoji: '\u{1F403}' }),
  elephant: Object.freeze({ type: 'elephant', size: 5, emoji: '\u{1F418}' }),
});

export const BUFFALO = 'buffalo';

/** Species that may be drawn at random, largest first. */
export const DRAWABLE = Object.freeze(['elephant', 'elk', 'fox', 'rat']);

/** gameplay.md §5.5. Difficulty varies band, weights and buffalo cadence. */
export const DIFFICULTIES = Object.freeze({
  meadow: Object.freeze({
    id: 'meadow',
    label: 'Meadow',
    startBand: Object.freeze([2, 4]),
    // Raised from 4-6 after the Slice 1 pacing measurement: at 4-6 the bot could
    // hold the board indefinitely (240-turn mean, one seed alive at 1,349).
    ceilingBand: Object.freeze([5, 7]),
    buffaloEvery: 12,
    weights: Object.freeze({ rat: 35, fox: 30, elk: 25, elephant: 10 }),
  }),
  savanna: Object.freeze({
    id: 'savanna',
    label: 'Savanna',
    startBand: Object.freeze([3, 5]),
    ceilingBand: Object.freeze([6, 8]),
    buffaloEvery: 10,
    weights: Object.freeze({ rat: 25, fox: 28, elk: 27, elephant: 20 }),
  }),
  tundra: Object.freeze({
    id: 'tundra',
    label: 'Tundra',
    startBand: Object.freeze([4, 6]),
    ceilingBand: Object.freeze([7, 9]),
    buffaloEvery: 8,
    weights: Object.freeze({ rat: 15, fox: 25, elk: 30, elephant: 30 }),
  }),
});

export const DEFAULT_DIFFICULTY = 'savanna';

/** gameplay.md §5.5: +1 to both ends of the band every 12 turns, until the ceiling. */
export const RAMP_EVERY_TURNS = 12;

/** gameplay.md §5.2 (D5): a batch may never occupy all 10 columns. */
export const MAX_BATCH_CELLS = 9;

/**
 * gameplay.md §4: a crash guard, NOT a scoring cutoff.
 *
 * The clear loop terminates by construction — every step removes at least one
 * completed row, ten occupied cells of which at most four can belong to the one
 * permitted buffalo, from a board holding at most width x height — so the
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
  buffaloRetire: 500,
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
