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
// against 2.42, running about 0.7 of a cell lighter than written. The owner
// saying the game "felt easy" was a defect report.
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
  BUFFALO_PHASES,
  CURVE,
  DRAWABLE,
  RAMP_EVERY_TURNS,
  SPECIES,
  meanDrawnSize,
} from './constants.js';
import { nextFraction, nextInt, shuffle, weightedPick } from './rng.js';

/**
 * The cells-per-turn band at a given turn. One curve, one table (AC-306).
 *
 * gameplay.md §5.5: +1 to both ends every 12 turns, until the ceiling — which
 * is 3-5 and is reached at turn 13, after which this function is constant for
 * the rest of the run (AC-307d). That flatness is the design, not an
 * oversight: what escalates past turn 13 is the buffalo cadence, and a band
 * that kept climbing beside it would be a second escalating lever nobody could
 * attribute a pacing shift to (§5.5b).
 */
export function bandForTurn(turn) {
  const ramps = Math.max(0, Math.floor((turn - 1) / RAMP_EVERY_TURNS));
  return [
    Math.min(CURVE.startBand[0] + ramps, CURVE.ceilingBand[0]),
    Math.min(CURVE.startBand[1] + ramps, CURVE.ceilingBand[1]),
  ];
}

/**
 * AC-306b — THE BAND FLOOR, as a check rather than as a sentence.
 *
 * §5.2 draws `k >= 1`, so the smallest arrival this generator can produce is
 * ONE ANIMAL: 2.10 cells on this curve's weights. A band asking for less than
 * that cannot be delivered — it measures high, because the floor rounds it up.
 * The designer found this by trying 1-3: mean 2.0 on paper, 2.41 cells/turn
 * measured. That is not a band, it is a rounding artefact, and it is why the
 * 2-4 starting band stayed put in the retune while every other band moved —
 * which is also why it is the band the one curve inherited.
 *
 * Two rules, and the second is the one with teeth:
 *   - no band's LOW may be below 2;
 *   - no band's MEAN may sit below the mean animal size.
 *
 * This walks every band the curve actually reaches, start through ceiling,
 * rather than checking the two endpoints — the ramp moves both ends together,
 * so an intermediate band cannot violate the floor if the start does not, but
 * that is an argument and this is a check.
 *
 * @returns {string[]} one line per violation; empty means the table is legal.
 */
export function bandFloorViolations() {
  const out = [];
  const floor = meanDrawnSize();
  const ceiling = CURVE.ceilingBand;
  for (let turn = 1; ; turn += RAMP_EVERY_TURNS) {
    const [low, high] = bandForTurn(turn);
    if (low < 2) out.push(`band ${low}-${high}: low ${low} is below 2`);
    const mean = (low + high) / 2;
    if (mean < floor) {
      out.push(`band ${low}-${high}: mean ${mean} is below the ${floor.toFixed(2)} floor`);
    }
    if (low === ceiling[0] && high === ceiling[1]) break;
  }
  return out;
}

/**
 * gameplay.md §5.5b, AC-310/AC-310b — is a buffalo scheduled for this turn?
 *
 * A PURE FUNCTION OF THE TURN NUMBER. It reads no board state, no run state and
 * no PRNG, and that is the property the HUD countdown (AC-509c) is built on: a
 * schedule with an input the player cannot see would be a number that lies,
 * which is exactly the defect v1 shipped in its tray.
 *
 * 12, 24, 36, then 46, 56, 66, then every 8 for ever.
 */
export function isBuffaloTurn(turn) {
  if (!(turn > 0)) return false;
  for (const phase of BUFFALO_PHASES) {
    if (phase.until === null || turn <= phase.until) {
      return (turn - phase.from) % phase.every === 0;
    }
  }
  return false;
}

/**
 * AC-509c — turns from `turn` until the next scheduled buffalo, 0 if one is
 * scheduled for `turn` itself.
 *
 * Bounded by the longest cadence in the table, so the loop cannot run away even
 * if the phases are edited into something strange.
 */
export function turnsUntilBuffalo(turn) {
  const longest = BUFFALO_PHASES.reduce((m, p) => Math.max(m, p.every), 1);
  const from = Math.max(0, turn);
  for (let d = 0; d <= longest; d += 1) {
    if (isBuffaloTurn(from + d)) return d;
  }
  return longest;
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
  rng,
  nextId,
  idPrefix = '',
  allowBuffalo = true,
  width = BOARD.width,
}) {
  let state = rng;
  let id = nextId;
  /** Invariant 1: a batch may never fill the row. Derived, never a literal. */
  const cap = width - 1;

  const [low, high] = bandForTurn(turn);
  const rolled = nextInt(state, low, high);
  state = rolled.rng;
  const target = Math.max(1, Math.min(cap, rolled.value));

  const chosen = [];
  let filled = 0;

  // The scheduled buffalo (AC-310, AC-310c). It sits outside the k draws
  // because it is scheduled rather than drawn — it must not appear in the
  // realised mix AC-308b measures.
  //
  // ONE CONDITION, AND IT IS `allowBuffalo`, WHICH IS NOT A GAME RULE: it is
  // AC-313c's seeding switch, off for the two batches that build the opening
  // board and on for every turn thereafter.
  //
  // The two conditions that used to stand here are both gone and neither may
  // come back (AC-310c, AC-311). `!hasBuffaloOnBoard` was the one-at-a-time
  // gate, which the owner overruled having played it: measured over 150 bot
  // runs it suppressed the schedule 3.63 times per run and delivered 1.13
  // buffalo against a cadence that should have delivered five.
  // `SPECIES.buffalo.size <= cap` was `5 <= 8`, a constant true that has never
  // once been false. A THIRD condition is not a safety valve either — a
  // population cap is an owner decision (open-questions.md Q3), never a defect
  // fix, and the caps of 2 and 3 were measured and rejected on design grounds.
  if (allowBuffalo && isBuffaloTurn(turn)) {
    chosen.push(BUFFALO);
    filled += SPECIES.buffalo.size;
  }

  // HOW MANY. Stochastic rounding, so the expected cell count is the target
  // exactly rather than the target rounded down.
  const raw = target / meanDrawnSize();
  const whole = Math.floor(raw);
  const carry = nextFraction(state);
  state = carry.rng;
  const k = Math.max(1, whole + (carry.value < raw - whole ? 1 : 0));

  // WHICH. k draws from the FULL weighted pool. The only exclusion is the hard
  // board limit, which is a rule rather than a fit heuristic (AC-308c).
  for (let i = 0; i < k; i += 1) {
    const pool = DRAWABLE.filter((key) => SPECIES[key].size <= cap - filled);
    if (pool.length === 0) break;
    const drawn = weightedPick(state, pool, pool.map((key) => CURVE.weights[key]));
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
