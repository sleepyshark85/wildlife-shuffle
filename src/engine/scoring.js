// Scoring. gameplay.md §7.
//
// Score is paid on clears only, never on elapsed turns (D9). Every term below is
// integer arithmetic: the streak multiplier is carried in tenths so that, for
// example, 700 x 1.4 is exactly 980 rather than 979.9999999999999, which would
// floor to 979.

import { SCORE } from './constants.js';

/** rowValue(n) for n rows completing in the same step. 1/2/3/4 -> 100/300/600/1000. */
export function rowValue(rows) {
  if (rows <= 0) return 0;
  if (rows < SCORE.rowValues.length) return SCORE.rowValues[rows];
  const top = SCORE.rowValues[SCORE.rowValues.length - 1];
  return top + SCORE.rowValueStep * (rows - (SCORE.rowValues.length - 1));
}

/** Cascade depth within one resolution: 1,2,3,4,5,5,5... (AC-605). */
export function chainMult(step) {
  return Math.min(Math.max(step, 1), SCORE.chainMultCap);
}

/** The streak multiplier in tenths, for exact integer arithmetic. */
function streakTenths(clearingTurns) {
  const table = SCORE.streakTenths;
  if (clearingTurns <= 0) return table[0];
  return table[Math.min(clearingTurns, table.length - 1)];
}

/**
 * The multiplier for a clear on the nth consecutive clearing turn:
 * 1.0, 1.3, 1.6, 2.0, 2.5, 3.0 (capped) — AC-606.
 * The streak is incremented before this is called, so the value returned is the
 * one THIS clear earned, not the one the next clear will earn.
 */
export function streakMult(clearingTurns) {
  return streakTenths(clearingTurns) / 10;
}

/**
 * Score for one chain step.
 * (rowValue(n) + 50 x shrinks + 500 x retired) x chainMult(step) x streakMult,
 * floored. A buffalo row does not count toward n — it did not clear (AC-612).
 */
export function stepScore({ rows, shrinks = 0, retired = 0, step, clearingTurns = 1 }) {
  const base =
    rowValue(rows) + SCORE.buffaloShrink * shrinks + SCORE.buffaloRetire * retired;
  return Math.floor((base * chainMult(step) * streakTenths(clearingTurns)) / 10);
}
