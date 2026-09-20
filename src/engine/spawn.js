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

import {
  BOARD,
  BUFFALO,
  DIFFICULTIES,
  DRAWABLE,
  MAX_BATCH_CELLS,
  RAMP_EVERY_TURNS,
  SPECIES,
} from './constants.js';
import { freeRuns } from './board.js';
import { nextInt, pick, shuffle, weightedPick } from './rng.js';

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

/** Every column at which an animal of `size` fits entirely in free cells. */
function validPositions(occupancy, size) {
  const positions = [];
  for (let x = 0; x + size <= occupancy.length; x++) {
    let fits = true;
    for (let c = x; c < x + size; c++) {
      if (occupancy[c]) {
        fits = false;
        break;
      }
    }
    if (fits) positions.push(x);
  }
  return positions;
}

/** Total columns a batch occupies. */
export function batchCells(batch) {
  return batch.reduce((sum, animal) => sum + animal.size, 0);
}

/**
 * Generate one batch.
 *
 * Species selection and placement are interleaved: a species is only a candidate
 * if it fits both the remaining cell target AND the largest remaining free run in
 * row 0 (gameplay.md §5.2 step 3). Interleaving is what makes step 5's "pick a
 * valid x" total — selecting the whole batch first can produce a set of sizes
 * that sums to <= 9 yet cannot be packed by sequential random placement
 * (e.g. rat at x=1, elk at x=4, then an elephant has nowhere to go).
 *
 * @returns {{ rng: number, nextId: number, batch: object[], target: number }}
 *   `target` is the rolled cell count. Invariant 3 of §5.2: the batch occupies
 *   exactly that many columns, never fewer (AC-307b).
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

  const [low, high] = bandForTurn(difficulty, turn);
  const rolled = nextInt(state, low, high);
  state = rolled.rng;
  let target = Math.max(1, Math.min(MAX_BATCH_CELLS, rolled.value));

  const occupancy = new Array(width).fill(false);
  const batch = [];
  let filled = 0;

  const place = (speciesKey, x) => {
    const species = SPECIES[speciesKey];
    batch.push({ id: `${idPrefix}${id++}`, type: species.type, x, y: 0, size: species.size });
    for (let c = x; c < x + species.size; c++) occupancy[c] = true;
    filled += species.size;
  };

  // Step 2: the scheduled buffalo, at most one on the board at a time (AC-310, AC-311).
  if (allowBuffalo && !hasBuffaloOnBoard && isBuffaloTurn(difficulty, turn)) {
    target = Math.max(target, SPECIES.buffalo.size);
    const spots = validPositions(occupancy, SPECIES.buffalo.size);
    const spot = pick(state, spots);
    state = spot.rng;
    if (spot.value !== undefined) place(BUFFALO, spot.value);
  }

  // Step 3: draw and place until the target is met or nothing fits.
  while (filled < target) {
    const room = target - filled;
    const largestRun = freeRuns(occupancy).reduce((max, [, len]) => Math.max(max, len), 0);
    const cap = Math.min(room, largestRun);
    const candidates = DRAWABLE.filter((key) => SPECIES[key].size <= cap);
    if (candidates.length === 0) break;

    const weights = candidates.map((key) => config.weights[key]);
    const drawn = weightedPick(state, candidates, weights);
    state = drawn.rng;

    const spots = validPositions(occupancy, SPECIES[drawn.value].size);
    const spot = pick(state, spots);
    state = spot.rng;
    if (spot.value === undefined) break;
    place(drawn.value, spot.value);
  }

  // Step 4: shuffle. Purely the order the tray lists them in; positions are fixed.
  const shuffled = shuffle(state, batch);
  state = shuffled.rng;

  return { rng: state, nextId: id, batch: shuffled.value, target };
}
