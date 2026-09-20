// How long the input lock lasts for one resolved turn.
//
// Pure, and derived from the engine's own event stream — the reducer has already
// resolved the whole turn before the first frame plays, so the presentation
// layer knows the entire timeline up front (ui.md §8.3 ¶3). Nothing here drives
// the board; it only decides when input reopens (AC-413, AC-414).
//
// This implements the structural arithmetic of ui.md §8.2. The announcement and
// ambient classes are deliberately absent: they never gate input, so they never
// appear in this number.

import { MOTION } from './theme.js';

/** ui.md §8.2: the gap between the start of cascade step k and step k+1. */
export function stepInterval(k) {
  return Math.max(150, 250 - 20 * (k - 1));
}

/** ui.md §8.2: at most 5 separately animated steps plus 1 combined, per turn. */
export const MAX_ANIMATED_UNITS = 6;

/** The structural ceiling. Worst case is scaled to fit it; the floor is 0.55x. */
export const LOCK_BUDGET_MS = 1500;
export const MIN_SCALE = 0.55;

function cascadeMs(steps) {
  if (steps <= 0) return 0;
  let total = MOTION.clearStep;
  for (let k = 1; k < steps; k += 1) total += stepInterval(k);
  return total;
}

/**
 * @param {object[]} events  the turn's event stream, straight off state.lastTurn
 * @param {string} action    'MOVE' or 'PASS'
 * @returns {{lockMs:number, scale:number, rawMs:number, settleSteps:number, arrivalSteps:number}}
 */
export function turnTimeline(events, action) {
  let settleSteps = 0;
  let arrivalSteps = 0;
  for (const event of events) {
    if (event.type !== 'CLEAR_STEP') continue;
    if (event.phase === 'SETTLE') settleSteps += 1;
    else arrivalSteps += 1;
  }

  // The cap is per turn and counted across both phases, so a turn can never
  // schedule more animated units than the budget below was built on. The engine
  // still resolved and still scored every step it emitted (gameplay.md §4).
  let capSettle = settleSteps;
  let capArrival = arrivalSteps;
  const over = capSettle + capArrival - MAX_ANIMATED_UNITS;
  if (over > 0) {
    const takeFromArrival = Math.min(capArrival, over);
    capArrival -= takeFromArrival;
    capSettle -= over - takeFromArrival;
  }

  const rawMs =
    (action === 'MOVE' ? MOTION.snap : 0) +
    MOTION.fall +
    cascadeMs(capSettle) +
    MOTION.arrival +
    cascadeMs(capArrival);

  // Uniform time-scaling is the readability-preserving form of compression:
  // every step stays distinct, the sequence keeps its shape (ui.md §8.2).
  const scale = rawMs > LOCK_BUDGET_MS ? Math.max(MIN_SCALE, LOCK_BUDGET_MS / rawMs) : 1;
  return {
    rawMs,
    scale,
    lockMs: Math.round(rawMs * scale),
    settleSteps: capSettle,
    arrivalSteps: capArrival,
  };
}
