// A deterministic greedy policy, used by tools/play.mjs to drive a headless run
// and by the test suite to reach board states that PASS alone never gets to.
//
// This is not part of the game. It is a harness: it only ever calls the public
// reducer, so anything it can do a player could do.

import { BOARD, BUFFALO, STATUS } from '../src/engine/constants.js';
import { checkMove, MOVE_OK } from '../src/engine/board.js';
import {
  ABILITIES, MIGRATE_SPECIES, abilityCost, stampede,
} from '../src/engine/abilities.js';
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
 * AC-318 / AC-320h: median turns per run over `seeds` seeds, greedy bot.
 *
 * ONE ROW, because there is one curve (gameplay.md §5.5b). It used to return a
 * row per habitat.
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

  const pct = (values, p) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
  };

  const turns = [];
  const scores = [];
  for (let seed = 1; seed <= seeds; seed++) {
    let state = createRun({ seed, abilities: false });
    while (state.status === STATUS.READY && state.turn < turnCap) {
      state = reduce(state, chooseAction(state));
    }
    turns.push(state.turn);
    scores.push(state.score);
  }
  return {
    median: median(turns),
    mean: turns.reduce((a, b) => a + b, 0) / turns.length,
    min: Math.min(...turns),
    max: Math.max(...turns),
    // AC-320h asks for the spread beside the median, because the gate is
    // "the curve has not moved", not a target to tune toward.
    p10: pct(turns, 10),
    p90: pct(turns, 90),
    medianScore: median(scores),
    scores,
  };
}


// ---- AC-1409 · runs still always end, measured ---------------------------

/**
 * A policy that SPENDS. The pacing bot never touches an ability, which makes it
 * useless for AC-1409: "a player cannot freeze their way to an unbounded run"
 * is a claim about a player who freezes, and the only honest way to check it is
 * to play one.
 *
 * THREE policies, because AC-1405h's pricing split them. A policy that spends
 * the moment it holds a charge buys Burrow at 1 and therefore NEVER saves the
 * 3 a Stampede costs — measured over 60 runs it took Stampede zero times. One
 * policy is now one half of the economy, so there are three: spend on value,
 * buy nothing but the freeze, or save the whole reserve for the elephant.
 * All three must terminate, and the freeze one is the policy §13.3's guarantee
 * is actually worded against.
 *
 * Dart is skipped deliberately: it buys extra moves rather than extra turns,
 * and the greedy search already plays the first of them.
 *
 * It is a harness, exactly like `chooseAction`: it only ever calls the public
 * reducer, so nothing it does is something a player could not do.
 */
/** The abilities a policy is willing to buy, in the order it tries them. */
const POLICY = Object.freeze({
  /** Spend on the best thing affordable, right now. Never saves, so never
   *  reaches Stampede — which is exactly why it is not the only policy. */
  value: ['stampede', 'migrate', 'hold', 'burrow'],
  /** Buys nothing but the freeze. The policy AC-1409's wording is about. */
  freeze: ['hold'],
  /** Saves the entire reserve for the one ability that costs all of it. */
  stampede: ['stampede'],
});

export function chooseAbility(state, { policy = 'value' } = {}) {
  if (state.dart > 0) return null;
  const wanted = POLICY[policy] || POLICY.value;

  for (const ability of wanted) {
    if (state.charges < abilityCost(ability)) continue;

    if (ability === ABILITIES.stampede.id) {
      if (stampede(state.animals).moved.length === 0) continue;
      return { type: ACTIONS.ABILITY, ability };
    }
    if (ability === ABILITIES.hold.id) {
      if (state.frozen > 0) continue;
      return { type: ACTIONS.ABILITY, ability };
    }
    if (ability === ABILITIES.migrate.id) {
      const counts = new Map();
      for (const a of state.animals) {
        if (!MIGRATE_SPECIES.includes(a.type)) continue;
        counts.set(a.type, (counts.get(a.type) || 0) + 1);
      }
      let best = null;
      for (const [type, n] of counts) if (!best || n > best[1]) best = [type, n];
      if (!best) continue;
      return { type: ACTIONS.ABILITY, ability, target: best[0] };
    }
    // Burrow. The buffalo is not a target for it (AC-1412b), so the policy has
    // to skip it exactly as a player does.
    const highest = state.animals.reduce(
      (top, a) => (a.type !== BUFFALO && (!top || a.y > top.y) ? a : top),
      null,
    );
    if (!highest) continue;
    return { type: ACTIONS.ABILITY, ability, target: highest.id };
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
export function playAbilityRun(seed, turnCap = 3000, policy = {}) {
  let state = createRun({ seed, abilities: true });
  let spent = 0;
  let frozenTurns = 0;
  while (state.status === STATUS.READY && state.turn < turnCap) {
    if (state.frozen > 0) frozenTurns += 1;
    const ability = chooseAbility(state, policy);
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
