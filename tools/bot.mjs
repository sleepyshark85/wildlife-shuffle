// A deterministic greedy policy, used by tools/play.mjs to drive a headless run
// and by the test suite to reach board states that PASS alone never gets to.
//
// This is not part of the game. It is a harness: it only ever calls the public
// reducer, so anything it can do a player could do.

import { BOARD, BUFFALO, STATUS } from '../src/engine/constants.js';
import { checkMove, MOVE_OK } from '../src/engine/board.js';
import {
  ABILITIES, ABILITY_IDS, MIGRATE_SPECIES, abilityCost, abilityFault, isAbilityRemovable,
  stampede,
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
 * 2 a Stampede costs — measured over 60 runs it took Stampede zero times. One
 * policy is now one half of the economy, so there are three: spend on value,
 * buy nothing but Stand Down, or save the whole reserve for the elephant.
 * All three must terminate.
 *
 * THE MIDDLE ONE USED TO BE `freeze`, and it was the policy §13.3's guarantee
 * was worded against — "a player cannot freeze their way to an unbounded run".
 * Hold the Line is withdrawn (AC-1410), so nothing in the game can suppress an
 * arrival and that attack no longer exists. Its replacement attacks the same
 * guarantee from the only angle left: Stand Down frees up to 44 cells in one
 * ACTION phase, which is the largest structural change the engine can be asked
 * to make, and a policy that fires it on sight is what proves that buys score
 * rather than time (AC-1409, AC-1434's +3%).
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
  value: ['standDown', 'stampede', 'migrate', 'burrow'],
  /** Buys nothing but Stand Down — and buys it in the second currency. */
  standDown: ['standDown'],
  /** Saves the entire reserve for the one ability that costs all of it. */
  stampede: ['stampede'],
});

export function chooseAbility(state, { policy = 'value' } = {}) {
  if (state.dart > 0) return null;
  const wanted = POLICY[policy] || POLICY.value;

  for (const ability of wanted) {
    if (state.charges < abilityCost(ability)) continue;

    if (ability === ABILITIES.standDown.id) {
      // The meter and the target are both the engine's own predicate, so this
      // policy cannot ask for something `reduce()` would reject (AC-1421).
      if (abilityFault(state, ability)) continue;
      // AC-1422 makes an all-size-1 herd legal, and a policy that spent the
      // meter on one would be measuring nothing. §13.2f-iii's "fire at the
      // first opportunity" means the first USEFUL one.
      if (!state.animals.some((a) => a.type === BUFFALO && a.size > 1)) continue;
      return { type: ACTIONS.ABILITY, ability };
    }
    if (ability === ABILITIES.stampede.id) {
      if (stampede(state.animals).moved.length === 0) continue;
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
  while (state.status === STATUS.READY && state.turn < turnCap) {
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
    charges: state.charges,
    earned: state.stats.chargesEarned,
  };
}


// ---- AC-1434 / AC-1435 · the arm measurement -----------------------------

/**
 * The ONE-PLY CANDIDATE policy — §13.2da's method, and the reason it exists.
 *
 * The `chooseAbility` policies above spend the instant they can afford to,
 * which measures charge INCOME more than it measures an ability: at a flat cost
 * of 1 that fired Stampede 27.8 times a run, which is not a use pattern any
 * player has. So the measurement offers each ability to the search as ONE MORE
 * CANDIDATE and takes it only when the resulting board beats the best ordinary
 * move. `uses/run` is then a number about the economy rather than about the
 * harness.
 *
 * `allow` is the roster this arm is measured with; AC-1405L's limit is that a
 * one-at-a-time arm table cannot say whether a player would ever PICK an
 * ability, so the shipped measurement passes the whole roster.
 *
 * Its blind spot is stated rather than hidden: one ply cannot value a repack it
 * would cash in two turns' time, which understates Stampede and Burrow (§13.2d,
 * §13.2e). It does not understate Stand Down, whose cells come free on the turn
 * it fires.
 */
function abilityCandidates(state, ability) {
  if (abilityFault(state, ability, undefined) && ABILITIES[ability].target === null) return [];
  switch (ability) {
    case ABILITIES.burrow.id:
      return state.animals
        .filter((a) => isAbilityRemovable(a.type))
        .map((a) => ({ type: ACTIONS.ABILITY, ability, target: a.id }));
    case ABILITIES.migrate.id:
      return [...new Set(state.animals.map((a) => a.type))]
        .filter((type) => MIGRATE_SPECIES.includes(type))
        .map((type) => ({ type: ACTIONS.ABILITY, ability, target: type }));
    default:
      return [{ type: ACTIONS.ABILITY, ability }];
  }
}

/**
 * What a candidate is worth, one ply out — with Dart PLAYED OUT.
 *
 * Dart resolves no turn (AC-1407): arming it leaves the board untouched, so a
 * one-ply evaluation of the arming action scores exactly the same as PASS and
 * the ability would never be taken. §13.2da's fix is the honest one: play all
 * three moves greedily and evaluate the board they leave. That is what took
 * Dart from "+8%, a floor" to the second-best p90 in the table.
 */
function candidateValue(state, action) {
  let next = reduce(state, action);
  if (next.lastAction && next.lastAction.type === 'REJECTED') return -Infinity;
  if (action.ability === ABILITIES.dart.id) {
    while (next.dart > 0 && next.status === STATUS.READY) {
      const move = chooseAction(next);
      const after = reduce(next, move);
      if (after.lastAction && after.lastAction.type === 'REJECTED') break;
      next = after;
    }
  }
  return evaluate(next);
}

export function chooseCandidate(state, { allow = ABILITY_IDS } = {}) {
  // Inside an open Dart the turn belongs to the moves, not to a second ability.
  if (state.dart > 0) return chooseAction(state);

  let best = null;
  let bestValue = -Infinity;
  for (const action of legalActions(state)) {
    const value = evaluate(reduce(state, action));
    if (value > bestValue) {
      bestValue = value;
      best = action;
    }
  }
  for (const ability of allow) {
    for (const action of abilityCandidates(state, ability)) {
      const value = candidateValue(state, action);
      // Strictly greater: an ability that ties an ordinary move is not taken,
      // so nothing is spent for nothing.
      if (value > bestValue) {
        bestValue = value;
        best = action;
      }
    }
  }
  return best;
}

/** Σ(size − 1) over the herd: what Stand Down converts (gameplay.md §5.9). */
function lockedSegments(animals) {
  let locked = 0;
  for (const a of animals) if (a.type === BUFFALO) locked += a.size - 1;
  return locked;
}

/**
 * One arm of the measurement: play `seed` with `allow` available, and report
 * everything AC-1434 and AC-1435 ask about.
 *
 * `uses` is per ability, off `state.lastAction` rather than off a counter the
 * loop keeps, so a rejected use cannot be counted as a use.
 */
export function measureArm(seed, { allow = ABILITY_IDS, turnCap = 3000 } = {}) {
  let state = createRun({ seed, abilities: true });
  const uses = {};
  let peakLocked = lockedSegments(state.animals);
  while (state.status === STATUS.READY && state.turn < turnCap) {
    const action = chooseCandidate(state, { allow });
    const next = reduce(state, action);
    if (next.lastAction && next.lastAction.type === 'REJECTED') {
      // The search asked for something illegal; fall back rather than stall.
      state = reduce(state, chooseAction(state));
      continue;
    }
    if (next.lastAction && next.lastAction.type === ACTIONS.ABILITY) {
      uses[next.lastAction.ability] = (uses[next.lastAction.ability] || 0) + 1;
    }
    state = next;
    peakLocked = Math.max(peakLocked, lockedSegments(state.animals));
  }
  let buffaloCells = 0;
  for (const a of state.animals) if (a.type === BUFFALO) buffaloCells += a.size;
  return {
    seed,
    score: state.score,
    turns: state.turn,
    ended: state.status === STATUS.GAME_OVER,
    retired: state.stats.buffaloRetired,
    shrinks: state.stats.buffaloShrinks,
    earned: state.stats.chargesEarned,
    buffaloCells,
    peakLocked,
    uses,
  };
}
