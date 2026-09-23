// ui.md §7.1 — what the buffalo strip shows, as pure functions.
//
// PURE, AND IN ITS OWN MODULE FOR A REASON. Nothing here imports React or
// react-native, so `node --test` can read the strip's ordering, its label and
// its show/hide rule back without a renderer. The component in
// `components/Hud.js` does no arithmetic of its own; it maps over what this
// returns. Everything the strip claims is therefore checkable at tier 2, which
// matters more here than usual: the strip is the only place the herd's size is
// reported, and AC-311 removed the thing that used to bound it.

import { BUFFALO } from '../engine/constants.js';

/** ui.md §7.1: the strip shows when a buffalo is up, or the next one is close. */
export const COUNTDOWN_SHOW_AT = 5;

export function stripIsVisible(count, countdown) {
  return count > 0 || (typeof countdown === 'number' && countdown <= COUNTDOWN_SHOW_AT);
}

/**
 * The chips to draw, in the order to draw them.
 *
 * TWO SOURCES, AND THE SECOND IS WHY THIS IS NOT `buffaloes.map`. A retired
 * buffalo is off `state.animals` on the commit that retired it, so by React's
 * clock its chip is already gone — but ui.md §7.1 asks the chip to leave over
 * 200 ms "and close the gap on the board's settle", which is a quarter of a
 * second AFTER the commit. So a buffalo that this turn's plan is still playing
 * out of existence keeps its chip until the plan says it has gone. That is
 * AC-509b's rule — the strip moves when the board moves, never on a React
 * commit — applied to the row rather than to one segment.
 *
 * ORDERED BOTTOM ROW FIRST (AC-509), and the departing ones take their place in
 * that order rather than being appended, so a retirement does not make the
 * other chips jump before it has even faded. y = 0 is the floor.
 *
 * @param {object[]} buffaloes `currentBuffaloes(state)` — already sorted
 * @param {object|null} plan the turn's replay plan, or null at rest
 * @returns {{id, size, y, shrink, leaving}[]}
 */
export function stripRows(buffaloes, plan) {
  const rows = buffaloes.map((b) => ({
    id: b.id,
    size: b.size,
    y: b.y,
    shrink: plan && plan.moves[b.id] ? plan.moves[b.id].size : null,
    leaving: null,
  }));
  if (plan) {
    for (const dep of plan.departures) {
      if (dep.type !== BUFFALO) continue;
      rows.push({
        id: dep.id,
        // The body it is a picture of is still the size it was when it left.
        size: dep.size,
        y: dep.y,
        shrink: null,
        leaving: { at: dep.collapseAt },
      });
    }
  }
  return rows.sort((a, b) => (a.y - b.y) || (a.id < b.id ? -1 : 1));
}

/**
 * AC-509's accessibility label.
 *
 * ui.md §7.1 asks the whole strip to be ONE element reading "Three buffalo on
 * the board: five segments, three segments, one segment. Next buffalo in four
 * turns." Bar colour is never the only cue — the filled count is in the words,
 * which is also the half of this that survives a player who cannot see it.
 */
const WORDS = Object.freeze([
  'no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
]);

const word = (n) => (n >= 0 && n < WORDS.length ? WORDS[n] : String(n));

export function stripLabel(sizes, countdown) {
  const turns = countdown === 0
    ? 'A buffalo arrives this turn.'
    : `Next buffalo in ${word(countdown)} ${countdown === 1 ? 'turn' : 'turns'}.`;
  if (sizes.length === 0) return turns;
  const each = sizes.map((n) => `${word(n)} ${n === 1 ? 'segment' : 'segments'}`).join(', ');
  return `${word(sizes.length)} buffalo on the board: ${each}. ${turns}`;
}
