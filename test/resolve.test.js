// AC-5xx clearing, chains and buffalo; AC-612/617 scoring integration.

import test from 'node:test';
import assert from 'node:assert/strict';

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { resolveClears } from '../src/engine/resolve.js';
import { summariseEvents } from '../src/engine/summary.js';
import { applyGravity, filledRows } from '../src/engine/board.js';
import { BOARD, CHAIN_GUARD_STEPS, SPECIES } from '../src/engine/constants.js';
import { animal, fullRow, rowExcept, rowString } from './helpers.js';

/** Every number a caller may read comes from the event stream (AC-706b). */
function resolve(board, options) {
  const result = resolveClears(board, options);
  return { ...result, ...summariseEvents(result.events) };
}

/**
 * A settled **10-wide** board whose cascade runs 10 steps deep, found by
 * directed search. Retained deliberately after the board narrowed to 9.
 *
 * `resolveClears` takes its width as a parameter, so this still exercises the
 * thing it was built to exercise: a cascade far deeper than play produces, and
 * the proof that every step of it pays. Nine columns does not reach ten steps —
 * a directed hill-climb over 240,000 settled 9-wide boards found 5 — and
 * manufacturing a deep board the game cannot produce would be a worse fixture
 * than an honest one from the wider board.
 *
 * Its size-4 buffalo is NOT stale: 4 is a legal state for a size-5 buffalo that
 * has already taken one hit.
 *
 * **AC-504d's published figures were derived from this board and are now wrong
 * in one number.** The cascade is still 10 steps, 6 rows and 1 retirement; the
 * score is **19,350** rather than 17,100, because the retirement bonus rose
 * 500 -> 650 and that step pays at chain x5 and streak x3.0 (150 x 5 x 3 =
 * 2,250). Reported for re-derivation rather than edited into the AC.
 */
const FIXTURE_WIDTH = 10;
function deepChainBoard() {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'deep-board.json');
  // The fixture carries no ids; they are assigned here.
  return JSON.parse(readFileSync(file, 'utf8')).map((a, i) => ({ ...a, id: `deep-${i}` }));
}

test('AC-501 a complete row with no buffalo removes every animal in it', () => {
  const board = [...fullRow(0), animal('fox', 0, 1)];
  const result = resolve(board, { phase: 'SETTLE' });
  assert.equal(result.clearSteps, 1);
  assert.equal(result.animals.length, 1);
  assert.equal(result.animals[0].type, 'fox');
  assert.equal(result.rowsCleared, 1);
});

test('AC-502 gravity runs after a clear and the survivors settle', () => {
  const rider = animal('elk', 4, 1);
  const board = [...fullRow(0), rider];
  const result = resolve(board, { phase: 'SETTLE' });
  assert.equal(result.animals.find((a) => a.id === rider.id).y, 0);
});

test('AC-503 a clear that completes another row chains', () => {
  // Row 0 full. Row 1 missing its last column. Row 2 has a rat there, which
  // drops into the gap once row 0 goes and completes row 1 as the new row 0.
  const last = BOARD.width - 1;
  const board = [...fullRow(0), ...rowExcept(1, [last]), animal('rat', last, 2)];
  const result = resolve(board, { phase: 'SETTLE' });
  assert.equal(result.clearSteps, 2);
  assert.equal(result.rowsCleared, 2);
  assert.equal(result.animals.length, 0);
});

test('AC-505 two rows completing in the same step clear together', () => {
  const board = [...fullRow(0), ...fullRow(1)];
  const result = resolve(board, { phase: 'SETTLE' });
  assert.equal(result.clearSteps, 1);
  assert.equal(result.events[0].clearedRows.length, 2);
  assert.equal(result.score, 300, 'rowValue(2), not two rowValue(1)s');
});

test('AC-504/504c a 10-step cascade runs to the end, and every step pays', () => {
  const board = deepChainBoard();
  assert.deepEqual(applyGravity(board), board, 'the fixture is already gravity-settled');

  const result = resolve(board, { phase: 'SETTLE', clearingTurns: 6, width: FIXTURE_WIDTH });

  assert.equal(result.clearSteps, 10, 'the loop is not capped at a step count');
  assert.equal(result.longestChain, 10);
  assert.deepEqual(filledRows(result.animals), [], 'and no completed row survives');

  const steps = result.events.filter((e) => e.type === 'CLEAR_STEP');
  for (const step of steps) {
    const paid = step.clearedRows.length > 0 || step.shrunk.length > 0;
    if (paid) assert.ok(step.score > 0, `step ${step.step} resolved without paying`);
  }
  assert.equal(
    steps.reduce((sum, e) => sum + e.score, 0),
    result.score,
    'the score is the sum of the steps, with nothing swallowed',
  );
});

test('AC-504d the committed fixture at streak 5 pays exactly 19,350', () => {
  // "At streak 5" is the streak the turn starts with; incremented first, the
  // clear is paid at the 6th-turn multiplier, x3.0 (AC-606).
  const result = resolve(deepChainBoard(), {
    phase: 'SETTLE', clearingTurns: 6, width: FIXTURE_WIDTH,
  });

  assert.equal(result.score, 19350);
  assert.equal(result.rowsCleared, 6);
  assert.equal(result.longestChain, 10);
  assert.equal(result.buffaloRetired, 1);

  const retirement = result.events.find((e) => e.retiredIds && e.retiredIds.length > 0);
  assert.ok(retirement, 'the retirement is an event, not just a counter');
  assert.ok(retirement.score >= 500, `the +500 is visible in the score (${retirement.score})`);
});

test('AC-504c no depth past which clearing stops paying', () => {
  // Steps 9 and 10 exist and are paid; under the superseded rail they cleared
  // for nothing.
  const steps = resolve(deepChainBoard(), {
    phase: 'SETTLE', clearingTurns: 6, width: FIXTURE_WIDTH,
  }).events.filter(
    (e) => e.type === 'CLEAR_STEP' && e.step > 8,
  );
  assert.equal(steps.length, 2);
  for (const step of steps) assert.ok(step.score > 0, `step ${step.step} paid nothing`);
});

test('AC-504b the crash guard sits above anything board mass permits', () => {
  // The guard is unreachable with a correct engine, so what is testable is the
  // arithmetic that makes it unreachable. A complete row is `width` occupied
  // columns of which at most five can be the one permitted buffalo, so every
  // step removes at least width - 5 cells from a board holding width x height.
  //
  // Nine columns and a size-5 buffalo tighten this considerably: 9 x 15 = 135
  // cells at 4 per step is 33, which is ABOVE the guard's 32. So the bound is
  // no longer the slack it was, and the assertion below now says so.
  const maxCells = BOARD.width * BOARD.height;
  const minCellsPerStep = BOARD.width - SPECIES.buffalo.size;
  const massBound = Math.floor(maxCells / minCellsPerStep);

  assert.equal(massBound, 33);
  // Reported rather than tuned away: at nine columns the crude mass bound
  // (33) now EXCEEDS the 32-step guard. The bound is crude — it assumes every
  // step clears a single row containing the buffalo, which cannot happen,
  // since a buffalo row does not clear at all. The deepest cascade anyone has
  // constructed is 10, and a 9-wide board reaches 5. The guard is still far
  // above anything reachable, but the one-line arithmetic that used to prove
  // it no longer does, and that is the designer's number to re-derive.
  assert.ok(massBound > CHAIN_GUARD_STEPS, 'the crude bound has crossed the guard');
  assert.ok(CHAIN_GUARD_STEPS >= 32);

  // And it is never approached: the deepest cascade anyone has built is 10.
  const deep = resolve(deepChainBoard(), { phase: 'SETTLE', width: FIXTURE_WIDTH });
  assert.equal(deep.guardTrips, 0);
  assert.ok(deep.clearSteps <= massBound);
});

test('AC-504b every step removes mass, which is what bounds the loop', () => {
  const board = deepChainBoard();
  const cells = (list) => list.reduce((n, a) => n + a.size, 0);
  const before = cells(board);

  const { events, animals } = resolveClears(board, { phase: 'SETTLE', width: FIXTURE_WIDTH });
  const steps = events.filter((e) => e.type === 'CLEAR_STEP');
  for (const step of steps) {
    assert.ok(
      step.removedIds.length + step.shrunk.length > 0,
      `step ${step.step} removed nothing, so the loop would not terminate`,
    );
  }
  assert.ok(cells(animals) < before);
  assert.ok(steps.length <= before / (FIXTURE_WIDTH - SPECIES.buffalo.size) + 1);
});

test('AC-504 twelve stacked full rows resolve and terminate', () => {
  const board = [];
  for (let y = 0; y < 12; y++) board.push(...fullRow(y));
  const result = resolve(board, { phase: 'SETTLE' });
  assert.equal(result.clearSteps, 1, 'all twelve are complete at once');
  assert.equal(result.animals.length, 0);
  assert.equal(result.rowsCleared, 12);
});

test('AC-506/612 a complete row containing a buffalo shrinks it and does not clear', () => {
  const buffalo = animal('buffalo', 0, 0);
  assert.equal(buffalo.size, 5);
  const board = [buffalo, ...rowExcept(0, [0, 1, 2, 3, 4])];
  const result = resolve(board, { phase: 'SETTLE' });

  assert.equal(result.clearSteps, 1);
  assert.equal(result.rowsCleared, 0, 'a buffalo row does not count as cleared');
  assert.equal(result.buffaloShrinks, 1);
  assert.equal(result.score, 50, 'no rowValue term');

  const survivor = result.animals.find((a) => a.type === 'buffalo');
  assert.equal(result.animals.length, 1, 'every non-buffalo in the row is swept away');
  assert.equal(survivor.size, 4, 'size n -> n - 1, from 5');
  assert.equal(survivor.x, 0, 'x is unchanged: it shrinks from the trailing edge');
  assert.equal(rowString(result.animals, 0), 'BBBB.....');
});

test('AC-507 a size-1 buffalo is retired rather than shrunk', () => {
  const last = BOARD.width - 1;
  const buffalo = { ...animal('buffalo', last, 0), size: 1 };
  const board = [buffalo, ...rowExcept(0, [last])];
  const result = resolve(board, { phase: 'SETTLE' });

  assert.equal(result.buffaloRetired, 1);
  assert.equal(result.animals.length, 0);
  assert.deepEqual(result.events[0].retiredIds, [buffalo.id]);
  assert.equal(result.score, 700, '50 for the final shrink plus 650 for retirement');
});

test('AC-506 a buffalo takes FIVE completed rows to remove', () => {
  let buffalo = animal('buffalo', 3, 0);
  assert.equal(buffalo.size, 5, 'gameplay.md §5.4: buffalo spawns at size 5');
  let sizes = [];
  for (let i = 0; i < 4; i++) {
    const board = [buffalo, ...rowExcept(0, [3, 4, 5, 6, 7].slice(0, buffalo.size))];
    const result = resolve(board, { phase: 'SETTLE' });
    const next = result.animals.find((a) => a.type === 'buffalo');
    sizes.push(next ? next.size : 0);
    if (!next) break;
    buffalo = next;
  }
  assert.deepEqual(sizes, [4, 3, 2, 1]);
  // ...and the fifth completion is the one that retires it.
  const last = resolve([buffalo, ...rowExcept(0, [3])], { phase: 'SETTLE' });
  assert.equal(last.buffaloRetired, 1);
});

test('AC-617 the worked example from gameplay.md §7.3 scores exactly 800', () => {
  // Two rows complete at once; the collapse completes a third row holding the
  // buffalo. 4th consecutive clearing turn, so x2.0 (incremented first).
  const board = [
    ...fullRow(0),
    ...fullRow(1),
    animal('buffalo', 0, 2),
    animal('elk', 5, 3),
    animal('rat', 8, 3),
  ];
  const result = resolve(board, { phase: 'SETTLE', clearingTurns: 4 });

  assert.equal(result.clearSteps, 2);
  assert.equal(result.events[0].score, 600, 'step 1: 300 x 1 x 2.0');
  assert.equal(result.events[1].score, 200, 'step 2: 50 x 2 x 2.0');
  assert.equal(result.score, 800);
});

test('AC-617b the same example retiring the buffalo pays 2800 on step 2', () => {
  // Same shape, but the buffalo is down to its last segment, so step 2 retires it.
  const board = [
    ...fullRow(0),
    ...fullRow(1),
    { ...animal('buffalo', 0, 2), size: 1 },
    ...rowExcept(3, [0]),
  ];
  const result = resolve(board, { phase: 'SETTLE', clearingTurns: 4 });

  assert.equal(result.clearSteps, 2);
  assert.equal(result.events[0].score, 600);
  assert.equal(result.buffaloRetired, 1);
  // The retirement bonus rose 500 -> 650 with the buffalo's size (AC-611),
  // so this worked example moved with it: AC-617b still says 2200.
  assert.equal(result.events[1].score, 2800, '(50 + 650) x 2 x 2.0');
});

test('a resolution with no complete row is a no-op', () => {
  const board = rowExcept(0, [5]);
  const result = resolve(board, { phase: 'SETTLE' });
  assert.equal(result.clearSteps, 0);
  assert.equal(result.score, 0);
  assert.equal(result.animals, board, 'the same array is returned untouched');
  assert.equal(result.events.length, 0);
});
