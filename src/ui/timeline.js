// The turn's timeline: when every structural thing happens, and when input
// reopens.
//
// Pure, and derived from the engine's own event stream — the reducer has
// already resolved the whole turn before the first frame plays, so the
// presentation layer knows the entire timeline up front (ui.md §8.3 ¶3).
// Nothing here drives the board; it only decides *when* the replay shows what
// the engine already decided (AC-833, AC-834).
//
// This implements the structural arithmetic of ui.md §8.2/§8.2a. The
// announcement and ambient classes are deliberately absent from `lockMs`: they
// never gate input, so they never appear in that number (AC-813c, AC-826).

import { MOTION } from './theme.js';

/**
 * ui.md §8.2a / AC-823: the gap between the start of cascade step k's collapse
 * and step k+1's.
 *
 * Revision 3 inverted the curve — it was `max(150, 250 − 20(k−1))`. A chain
 * reaction gathering pace was dramatically correct and legibly wrong: later
 * steps overlapped so heavily they stopped reading as discrete events, which is
 * the opposite of the "more natural" the owner asked for.
 */
export function stepInterval(k) {
  return Math.max(200, 260 - 15 * (k - 1));
}

/** ui.md §8.2: at most 5 separately animated steps plus 1 combined, per turn. */
export const MAX_ANIMATED_UNITS = 6;

/** The structural ceiling. Worst case is scaled to fit it; the floor is 0.55x. */
export const LOCK_BUDGET_MS = 1500;
/** Below this, motion stops reading. The 6-unit cap is what keeps us off it. */
const MIN_SCALE = 0.55;

/**
 * How many animated units each phase gets, given the per-turn cap.
 *
 * AC-825's cap is counted across SETTLE and ARRIVAL combined, because the
 * player experiences one turn. A phase that produced any steps at all keeps at
 * least one unit: folding an ARRIVAL clear into a SETTLE unit would play it
 * before the arrival it came from, which is a lie about causality rather than a
 * compression of it.
 */
export function allocateUnits(settleSteps, arrivalSteps, max = MAX_ANIMATED_UNITS) {
  let settle = settleSteps;
  let arrival = arrivalSteps;
  while (settle + arrival > max) {
    if (arrival >= settle && arrival > 1) arrival -= 1;
    else if (settle > 1) settle -= 1;
    else if (arrival > 1) arrival -= 1;
    else break;
  }
  return { settle, arrival };
}

/**
 * One phase's cascade, laid out from `start`.
 *
 * `start` is when the phase's gravity has finished — the moment the first row
 * could begin to go. Step 1 pays the 80 ms leading beat: its flash attack lands
 * before the geometry moves, so the row is announced and *then* goes (AC-813).
 * Steps 2+ are strictly concurrent, because by then the player is watching a
 * cascade and the announcing job is done.
 */
function cascade(start, steps) {
  const units = [];
  let collapseAt = start + MOTION.lead;
  for (let k = 1; k <= steps; k += 1) {
    units.push({
      index: k,
      // AC-813: the lead is on the first step only.
      flashAt: k === 1 ? collapseAt - MOTION.lead : collapseAt,
      collapseAt,
      fallAt: collapseAt + MOTION.collapse,
    });
    if (k < steps) collapseAt += stepInterval(k);
  }
  const end = steps === 0 ? start : collapseAt + MOTION.clearStep;
  return { units, end };
}

/**
 * AC-824f: what remains of a turn's lock, measured from finger-up.
 *
 * The budget is a promise about what the player feels, and that starts when
 * they let go — not when React commits, which is an internal event they cannot
 * perceive. Everything between the two (the runOnJS hop, the engine resolving
 * the turn, reconciliation, the DOM commit) is time the player has already
 * spent waiting, so it comes out of the lock.
 *
 * `reservedMs` is the part already taken out of the budget when the timeline
 * was scaled, so it is not charged twice. The rest is charged here.
 *
 * @param {number} lockMs     the scaled animation length, from the commit
 * @param {number} reservedMs what the scale already reserved
 * @param {number} elapsedMs  measured finger-up -> now
 */
export function lockDelay(lockMs, reservedMs, elapsedMs) {
  const unreserved = Math.max(0, elapsedMs - reservedMs);
  return Math.max(0, Math.round(lockMs - unreserved));
}

/**
 * The whole turn, at natural timings and then uniformly scaled to fit.
 *
 * @param {object[]} events  the turn's event stream, straight off state.lastTurn
 * @param {string} action    'MOVE' or 'PASS'
 * @param {number} reservedMs AC-824f: the commit gap to make room for. The
 *                            budgets are measured from finger-up, so the time
 *                            the engine and React spend before the first frame
 *                            can play has to come out of the timeline, not be
 *                            added to it. Uniform time-scaling is the
 *                            mechanism AC-824 already blesses; this applies it
 *                            for a second reason.
 * @returns {{lockMs:number, scale:number, rawMs:number,
 *            settleSteps:number, arrivalSteps:number,
 *            settleFallAt:number, arrivalAt:number,
 *            units:object[]}}
 */
export function turnTimeline(events, action, reservedMs = 0) {
  let settleSteps = 0;
  let arrivalSteps = 0;
  for (const event of events) {
    if (event.type !== 'CLEAR_STEP') continue;
    if (event.phase === 'SETTLE') settleSteps += 1;
    else arrivalSteps += 1;
  }

  // The engine still resolved and still scored every step it emitted; this is a
  // presentation cap only and must not change a point (AC-825, gameplay.md §4).
  const cap = allocateUnits(settleSteps, arrivalSteps);

  const settleFallAt = action === 'MOVE' ? MOTION.snap : 0;
  const settleStart = settleFallAt + MOTION.fall;
  const settle = cascade(settleStart, cap.settle);

  const arrivalAt = settle.end;
  const arrival = cascade(arrivalAt + MOTION.arrival, cap.arrival);

  const rawMs = arrival.end;

  // Uniform time-scaling is the readability-preserving form of compression:
  // every step stays distinct, the sequence keeps its shape (ui.md §8.2).
  // The turn owes whichever is smaller — its own natural length (AC-820/821)
  // or the hard 1500 ms cap (AC-822) — and it owes it from FINGER-UP, so the
  // commit gap comes off both. A 960 ms turn that spent 62 ms resolving and
  // committing gets 898 ms of animation, and reopens at 960 as promised.
  //
  // Subtracting from only the 1500 cap, as the first version did, made the
  // reservation bite on compressed turns and nowhere else — which is to say
  // almost never. The browser duly measured a one-clear turn at 1027 ms.
  const ceiling = Math.min(LOCK_BUDGET_MS, rawMs) - Math.max(0, reservedMs);
  const scale = rawMs > ceiling ? Math.max(MIN_SCALE, ceiling / rawMs) : 1;

  const units = settle.units
    .map((u) => ({ ...u, phase: 'SETTLE' }))
    .concat(arrival.units.map((u) => ({ ...u, phase: 'ARRIVAL' })))
    .map((u) => ({
      ...u,
      flashAt: u.flashAt * scale,
      collapseAt: u.collapseAt * scale,
      fallAt: u.fallAt * scale,
    }));

  return {
    rawMs,
    scale,
    lockMs: Math.round(rawMs * scale),
    settleSteps: cap.settle,
    arrivalSteps: cap.arrival,
    settleFallAt: settleFallAt * scale,
    arrivalAt: arrivalAt * scale,
    units,
  };
}
