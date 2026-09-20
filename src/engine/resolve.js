// resolveClears: the chain loop. gameplay.md §4.
//
// An iterative loop — never a recursive call into a state setter, which is what
// v1 did (executeChainClear, gameStore.js:52-66, docs/v1-review.md A1).
//
// The loop is NOT capped at a step count. Every step that resolves, scores
// (AC-504c). The superseded 8-step rail bounded nothing — chainMult is already
// flat at x5 from step 5 — and cost 9,750 of 17,100 points on a 10-step cascade,
// including a buffalo retirement the player was never paid for.

import { BOARD, BUFFALO, CHAIN_GUARD_STEPS } from './constants.js';
import { applyGravity, diffRows, filledRows } from './board.js';
import { stepScore } from './scoring.js';

/** RN and Metro define __DEV__; Node and production bundles do not. */
function isDevelopment() {
  return typeof globalThis.__DEV__ !== 'undefined' && globalThis.__DEV__ === true;
}

/**
 * Resolve every complete row, repeatedly, until none remain.
 *
 * Per step: non-buffalo animals in complete rows are removed; a buffalo in a
 * complete row loses one segment from its trailing edge (size -= 1, x unchanged)
 * and that row does NOT clear (AC-506). A buffalo reduced to 0 is retired
 * (AC-507). Gravity then runs and the loop repeats (AC-503).
 *
 * Termination is by construction, not by a counter (AC-504): every step removes
 * at least one completed row — ten occupied cells, of which at most four can
 * belong to the single permitted buffalo — so board mass strictly decreases from
 * a maximum of width x height. `CHAIN_GUARD_STEPS` is a crash guard against an
 * engine bug and nothing else (AC-504b).
 *
 * Score and statistics are both read back off `events` by summariseEvents(),
 * so this returns no counters of its own (AC-706b).
 *
 * @returns {{ animals: object[], events: object[] }}
 */
export function resolveClears(
  animals,
  { phase, clearingTurns = 1, width = BOARD.width, height = BOARD.height } = {},
) {
  let board = animals;
  let step = 0;
  const events = [];

  for (;;) {
    const filled = filledRows(board, width, height);
    if (filled.length === 0) break;

    step += 1;
    if (step > CHAIN_GUARD_STEPS) {
      // Unreachable by the mass argument above. Reaching it means the engine is
      // broken, so it is loud: it throws in development, and in production it
      // stops and flags the run rather than hanging or failing silently.
      if (isDevelopment()) {
        throw new Error(
          `resolveClears exceeded ${CHAIN_GUARD_STEPS} steps in phase ${phase}: ` +
            'gravity is not settling or a clear is not removing',
        );
      }
      events.push({ type: 'CHAIN_GUARD', phase, steps: step - 1 });
      break;
    }

    const buffaloRows = [];
    const clearedRows = [];
    for (const row of filled) {
      if (board.some((a) => a.y === row && a.type === BUFFALO)) buffaloRows.push(row);
      else clearedRows.push(row);
    }

    const removedIds = [];
    const shrunk = [];
    const retiredIds = [];
    const survivors = [];

    for (const animal of board) {
      if (!filled.includes(animal.y)) {
        survivors.push(animal);
        continue;
      }
      if (animal.type !== BUFFALO) {
        removedIds.push(animal.id);
        continue;
      }
      const nextSize = animal.size - 1;
      shrunk.push({ id: animal.id, fromSize: animal.size, toSize: nextSize });
      if (nextSize <= 0) {
        retiredIds.push(animal.id);
        continue;
      }
      survivors.push({ ...animal, size: nextSize });
    }

    const settled = applyGravity(survivors);

    events.push({
      type: 'CLEAR_STEP',
      phase,
      step,
      rows: filled,
      clearedRows,
      buffaloRows,
      removedIds,
      shrunk,
      retiredIds,
      score: stepScore({
        rows: clearedRows.length,
        shrinks: shrunk.length,
        retired: retiredIds.length,
        step,
        clearingTurns,
      }),
      moved: diffRows(survivors, settled),
    });

    board = settled;
  }

  return { animals: board, events };
}
