// A deterministic greedy policy, used by tools/play.mjs to drive a headless run
// and by the test suite to reach board states that PASS alone never gets to.
//
// This is not part of the game. It is a harness: it only ever calls the public
// reducer, so anything it can do a player could do.

import { BOARD, DIFFICULTIES, STATUS } from '../src/engine/constants.js';
import { checkMove, MOVE_OK } from '../src/engine/board.js';
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

/** AC-318: median turns per run, 30 seeds per difficulty, greedy bot. */
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
      let state = createRun({ seed, difficulty });
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
