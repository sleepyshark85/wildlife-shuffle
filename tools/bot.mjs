// A deterministic greedy policy, used by tools/play.mjs to drive a headless run
// and by the test suite to reach board states that PASS alone never gets to.
//
// This is not part of the game. It is a harness: it only ever calls the public
// reducer, so anything it can do a player could do.

import { BOARD, DIFFICULTIES, STATUS } from '../src/engine/constants.js';
import { checkMove, MOVE_OK } from '../src/engine/board.js';
import { ABILITIES, MIGRATE_SPECIES, stampede } from '../src/engine/abilities.js';
import { ACTIONS, createRun, reduce } from '../src/engine/engine.js';

/** Column heights and buried holes, the two things a packer cares about. */
function shape(animals) {
  const heights = new Array(BOARD.width).fill(0);
  const filled = new Array(BOARD.width).fill(0);
  for (const a of animals) {
    for (let c = a.x; c < a.x + a.size; c++) {
      heights[c] = Math.max(heights[c], a.y + 1);
      filled[c] += 1;
    }
  }
  let holes = 0;
  for (let c = 0; c < BOARD.width; c++) holes += heights[c] - filled[c];
  return { maxHeight: Math.max(...heights), holes, bumpiness: bumpiness(heights) };
}

function bumpiness(heights) {
  let total = 0;
  for (let c = 1; c < heights.length; c++) total += Math.abs(heights[c] - heights[c - 1]);
  return total;
}

function evaluate(next) {
  if (next.status === STATUS.GAME_OVER) return -1e9;
  const { maxHeight, holes, bumpiness: bump } = shape(next.animals);
  const gained = next.lastTurn ? next.lastTurn.score : 0;
  return gained * 2 - maxHeight * 40 - holes * 12 - bump * 2;
}

/** Every action the player could legally take, PASS first. */
function legalActions(state) {
  const actions = [{ type: ACTIONS.PASS }];
  for (const animal of state.animals) {
    for (let x = 0; x + animal.size <= BOARD.width; x++) {
      if (x === animal.x) continue;
      if (checkMove(state.animals, animal.id, x, BOARD.width) === MOVE_OK) {
        actions.push({ type: ACTIONS.MOVE, id: animal.id, x });
      }
    }
  }
  return actions;
}

/** Pick the action with the best resulting board. Ties go to the first found. */
export function chooseAction(state) {
  let best = null;
  let bestValue = -Infinity;
  for (const action of legalActions(state)) {
    const value = evaluate(reduce(state, action));
    if (value > bestValue) {
      bestValue = value;
      best = action;
    }
  }
  return best;
}

/**
 * AC-318: median turns per run, 30 seeds per difficulty, greedy bot.
 *
 * AC-1404: **abilities are off**, explicitly, and that word is doing work. It
 * held by construction while no ability code existed — this bot never
 * dispatches an ABILITY action, so nothing could be spent — but Last Stand
 * grants without being asked, and "the harness happens not to use the feature"
 * is not the same claim as "the feature is not in the measurement". A curve
 * measured with an optional player intervention in it is not a curve, so the
 * switch is passed rather than assumed (`createRun({ abilities: false })`), and
 * test/pacing.test.js asserts that it is.
 */
export function measurePacing(seeds = 30, turnCap = 3000) {
  const median = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };

  const rows = {};
  for (const difficulty of Object.keys(DIFFICULTIES)) {
    const turns = [];
    const scores = [];
    for (let seed = 1; seed <= seeds; seed++) {
      let state = createRun({ seed, difficulty, abilities: false });
      while (state.status === STATUS.READY && state.turn < turnCap) {
        state = reduce(state, chooseAction(state));
      }
      turns.push(state.turn);
      scores.push(state.score);
    }
    rows[difficulty] = {
      median: median(turns),
      mean: turns.reduce((a, b) => a + b, 0) / turns.length,
      min: Math.min(...turns),
      max: Math.max(...turns),
      medianScore: median(scores),
    };
  }
  return rows;
}


// ---- AC-1409 · runs still always end, measured ---------------------------

/**
 * A policy that SPENDS. The pacing bot never touches an ability, which makes it
 * useless for AC-1409: "a player cannot freeze their way to an unbounded run"
 * is a claim about a player who freezes, and the only honest way to check it is
 * to play one.
 *
 * So this one hoards nothing. It spends the moment it holds a charge, and it
 * spends on the ability that most extends the run — Hold the Line first,
 * because that is the ability the guarantee is actually about (§13.3: freezing
 * stops the supply of the thing that buys freezes), then Stampede to repack,
 * then Migrate on whatever species is most numerous, then Burrow on the highest
 * animal. Dart is skipped deliberately: it buys extra moves rather than extra
 * turns, and the greedy search below already plays the first of them.
 *
 * It is a harness, exactly like `chooseAction`: it only ever calls the public
 * reducer, so nothing it does is something a player could not do.
 */
export function chooseAbility(state) {
  if (state.charges <= 0 || state.dart > 0) return null;
  if (state.frozen === 0) return { type: ACTIONS.ABILITY, ability: ABILITIES.hold.id };

  const packed = stampede(state.animals);
  if (packed.moved.length > 0) {
    return { type: ACTIONS.ABILITY, ability: ABILITIES.stampede.id };
  }

  const counts = new Map();
  for (const a of state.animals) {
    if (!MIGRATE_SPECIES.includes(a.type)) continue;
    counts.set(a.type, (counts.get(a.type) || 0) + 1);
  }
  let best = null;
  for (const [type, n] of counts) if (!best || n > best[1]) best = [type, n];
  if (best) {
    return { type: ACTIONS.ABILITY, ability: ABILITIES.migrate.id, target: best[0] };
  }

  const highest = state.animals.reduce((top, a) => (!top || a.y > top.y ? a : top), null);
  if (highest) {
    return { type: ACTIONS.ABILITY, ability: ABILITIES.burrow.id, target: highest.id };
  }
  return null;
}

/**
 * Play one run to its end with abilities ON and a policy that spends every
 * charge it earns. Returns the run record plus what it spent.
 *
 * `turnCap` is a bound on the harness, not on the game: a run that reaches it
 * has NOT terminated, and that is the failure AC-1409 is about.
 */
export function playAbilityRun(seed, difficulty, turnCap = 3000) {
  let state = createRun({ seed, difficulty, abilities: true });
  let spent = 0;
  let frozenTurns = 0;
  while (state.status === STATUS.READY && state.turn < turnCap) {
    if (state.frozen > 0) frozenTurns += 1;
    const ability = chooseAbility(state);
    const next = ability ? reduce(state, ability) : reduce(state, chooseAction(state));
    if (ability && next.lastAction && next.lastAction.type === 'REJECTED') {
      // The policy asked for something illegal; fall back rather than stall.
      state = reduce(state, chooseAction(state));
      continue;
    }
    if (ability) spent += 1;
    state = next;
  }
  return {
    turns: state.turn,
    score: state.score,
    ended: state.status === STATUS.GAME_OVER,
    spent,
    frozenTurns,
    charges: state.charges,
    earned: state.stats.chargesEarned,
  };
}
