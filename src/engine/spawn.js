// Batch generation. gameplay.md §5.
//
// A batch is generated once, frozen into state.queue, rendered in the tray, and
// applied verbatim at the Arrival phase. There is no re-roll and no collision
// fallback — row 0 is provably empty at placement time because Arrival raises
// every animal by 1 first. This is THE preview contract (AC-301).
//
// v1 generated a preview and threw it away (docs/v1-review.md C2), and required a
// free column either side of every placement, which capped every batch at 8 of 10
// columns (C3). Both are gone.
//
// COUNT FIRST, THEN SPECIES, THEN PLACE — and the inversion is the whole point.
//
// The approved algorithm chose species against a SHRINKING candidate pool: a
// species stayed eligible only while enough room remained for it. With a 3-5
// cell target the capacity left after one or two draws is already smaller than
// an elephant, so the largest species was shut out of the LAST draw of nearly
// every batch — and batches are two or three animals long, so most draws are
// last-ish. Measured over 60,000 batches, Savanna drew 48.9% rats against a
// weight of 25 and 6.6% elephants against 20: a realised mean size of 1.81
// against 2.42, every difficulty running about 0.7 of a cell lighter than
// written. The owner saying the game "felt easy" was a defect report.
//
// The designer's first diagnosis — fragmentation from interleaved placement —
// was measured and refuted: removing fragmentation entirely moved the mean from
// 1.79 to 1.81. It is capacity exclusion, and no placement change touches it.
//
// So the dependency runs the other way now. The cell target buys a NUMBER of
// animals up front; every species draw then sees the full pool. What that costs
// is the band's per-batch guarantee: `k` is a whole number of animals, so a
// batch's cell total scatters around the rolled target. Stochastic rounding
// keeps the expectation on target (AC-306, AC-307b).
//
// It also removes the only part of this file that could fail. Placement is now
// arithmetic — pack contiguously, scatter the free columns — so there is no
// candidate-fits-the-run test, no retry and no fallback, because there is
// nothing left that can come up empty (AC-317b).

import {
  BOARD,
  BUFFALO,
  DIFFICULTIES,
  DRAWABLE,
  RAMP_EVERY_TURNS,
  SPECIES,
  meanDrawnSize,
} from './constants.js';
import { nextFraction, nextInt, shuffle, weightedPick } from './rng.js';

/**
 * The cells-per-turn band for a difficulty at a given turn.
 * gameplay.md §5.5: +1 to both ends every 12 turns, until the ceiling.
 * Savanna: t1 3-5, t13 4-6, t25 5-7, t37+ 6-8 (AC-306, AC-307).
 */
export function bandForTurn(difficultyId, turn) {
  const difficulty = DIFFICULTIES[difficultyId];
  if (!difficulty) throw new Error(`Unknown difficulty: ${difficultyId}`);
  const ramps = Math.max(0, Math.floor((turn - 1) / RAMP_EVERY_TURNS));
  return [
    Math.min(difficulty.startBand[0] + ramps, difficulty.ceilingBand[0]),
    Math.min(difficulty.startBand[1] + ramps, difficulty.ceilingBand[1]),
  ];
}

/** gameplay.md §5.4: buffalo is scheduled on turn n x buffaloEvery, never turn 0. */
export function isBuffaloTurn(difficultyId, turn) {
  const difficulty = DIFFICULTIES[difficultyId];
  if (!difficulty) throw new Error(`Unknown difficulty: ${difficultyId}`);
  return turn > 0 && turn % difficulty.buffaloEvery === 0;
}

/** Total columns a batch occupies. */
export function batchCells(batch) {
  return batch.reduce((sum, animal) => sum + animal.size, 0);
}

/**
 * Scatter `free` columns at random among `slots` gaps.
 *
 * Every free column picks its own gap, so the spacing is multinomial rather
 * than clumped at one end. This is the whole of "WHERE", and it cannot fail:
 * the gaps sum to exactly the free columns by construction.
 */
function distributeGaps(rng, free, slots) {
  const gaps = new Array(slots).fill(0);
  let state = rng;
  for (let i = 0; i < free; i += 1) {
    const slot = nextInt(state, 0, slots - 1);
    state = slot.rng;
    gaps[slot.value] += 1;
  }
  return { rng: state, value: gaps };
}

/**
 * Generate one batch. gameplay.md §5.2.
 *
 * @returns {{ rng: number, nextId: number, batch: object[], target: number }}
 *   `target` is the rolled cell count. The batch scatters around it rather than
 *   matching it (AC-307b) — a batch that misses the target is not a defect, a
 *   mean that misses it is.
 */
export function generateBatch({
  turn,
  difficulty,
  rng,
  nextId,
  idPrefix = '',
  hasBuffaloOnBoard = false,
  allowBuffalo = true,
  width = BOARD.width,
}) {
  const config = DIFFICULTIES[difficulty];
  if (!config) throw new Error(`Unknown difficulty: ${difficulty}`);

  let state = rng;
  let id = nextId;
  /** Invariant 1: a batch may never fill the row. Derived, never a literal. */
  const cap = width - 1;

  const [low, high] = bandForTurn(difficulty, turn);
  const rolled = nextInt(state, low, high);
  state = rolled.rng;
  const target = Math.max(1, Math.min(cap, rolled.value));

  const chosen = [];
  let filled = 0;

  // The scheduled buffalo, at most one on the board at a time (AC-310, AC-311).
  // It sits outside the k draws because it is scheduled rather than drawn — it
  // must not appear in the realised mix AC-308b measures.
  if (
    allowBuffalo
    && !hasBuffaloOnBoard
    && isBuffaloTurn(difficulty, turn)
    && SPECIES.buffalo.size <= cap
  ) {
    chosen.push(BUFFALO);
    filled += SPECIES.buffalo.size;
  }

  // HOW MANY. Stochastic rounding, so the expected cell count is the target
  // exactly rather than the target rounded down.
  const raw = target / meanDrawnSize(difficulty);
  const whole = Math.floor(raw);
  const carry = nextFraction(state);
  state = carry.rng;
  const k = Math.max(1, whole + (carry.value < raw - whole ? 1 : 0));

  // WHICH. k draws from the FULL weighted pool. The only exclusion is the hard
  // board limit, which is a rule rather than a fit heuristic (AC-308c).
  for (let i = 0; i < k; i += 1) {
    const pool = DRAWABLE.filter((key) => SPECIES[key].size <= cap - filled);
    if (pool.length === 0) break;
    const drawn = weightedPick(state, pool, pool.map((key) => config.weights[key]));
    state = drawn.rng;
    chosen.push(drawn.value);
    filled += SPECIES[drawn.value].size;
  }

  // WHERE. Shuffle so the order on the row is not the order drawn, then pack
  // contiguously and scatter the free columns among the gaps.
  const shuffled = shuffle(state, chosen);
  state = shuffled.rng;
  const spread = distributeGaps(state, width - filled, shuffled.value.length + 1);
  state = spread.rng;

  const batch = [];
  let x = 0;
  shuffled.value.forEach((key, index) => {
    x += spread.value[index];
    const species = SPECIES[key];
    batch.push({ id: `${idPrefix}${id++}`, type: species.type, x, y: 0, size: species.size });
    x += species.size;
  });

  return { rng: state, nextId: id, batch, target };
}
