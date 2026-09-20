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
 * A settled 10x15 board whose cascade runs 10 steps deep, found by directed
 * search. It is the AC-504d fixture: at streak 5 it must pay 17,100.
 */
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
  // Row 0 full. Row 1 missing column 9. Row 2 has a rat at column 9, which drops
  // into the gap once row 0 goes and completes row 1 as the new row 0.
  const board = [...fullRow(0), ...rowExcept(1, [9]), animal('rat', 9, 2)];
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

  const result = resolve(board, { phase: 'SETTLE', clearingTurns: 6 });

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

test('AC-504d the committed fixture at streak 5 pays exactly 17,100', () => {
  // "At streak 5" is the streak the turn starts with; incremented first, the
  // clear is paid at the 6th-turn multiplier, x3.0 (AC-606).
  const result = resolve(deepChainBoard(), { phase: 'SETTLE', clearingTurns: 6 });

  assert.equal(result.score, 17100);
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
  const steps = resolve(deepChainBoard(), { phase: 'SETTLE', clearingTurns: 6 }).events.filter(
    (e) => e.type === 'CLEAR_STEP' && e.step > 8,
  );
  assert.equal(steps.length, 2);
  for (const step of steps) assert.ok(step.score > 0, `step ${step.step} paid nothing`);
});

test('AC-504b the crash guard sits above anything board mass permits', () => {
  // The guard is unreachable with a correct engine, so what is testable is the
  // arithmetic that makes it unreachable. A complete row is 10 occupied columns
  // of which at most 4 can be the one permitted buffalo, so every step removes
  // at least 6 cells from a board that holds at most 150.
  const maxCells = BOARD.width * BOARD.height;
  const minCellsPerStep = BOARD.width - SPECIES.buffalo.size;
  const massBound = Math.floor(maxCells / minCellsPerStep);

  assert.equal(massBound, 25);
  assert.ok(CHAIN_GUARD_STEPS > massBound, `${CHAIN_GUARD_STEPS} must exceed ${massBound}`);

  // And it is never approached: the deepest cascade anyone has built is 10.
  const deep = resolve(deepChainBoard(), { phase: 'SETTLE' });
  assert.equal(deep.guardTrips, 0);
  assert.ok(deep.clearSteps <= massBound);
});

test('AC-504b every step removes mass, which is what bounds the loop', () => {
  const board = deepChainBoard();
  const cells = (list) => list.reduce((n, a) => n + a.size, 0);
  const before = cells(board);

  const { events, animals } = resolveClears(board, { phase: 'SETTLE' });
  const steps = events.filter((e) => e.type === 'CLEAR_STEP');
  for (const step of steps) {
    assert.ok(
      step.removedIds.length + step.shrunk.length > 0,
      `step ${step.step} removed nothing, so the loop would not terminate`,
    );
  }
  assert.ok(cells(animals) < before);
  assert.ok(steps.length <= before / (BOARD.width - SPECIES.buffalo.size) + 1);
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
  const board = [buffalo, ...rowExcept(0, [0, 1, 2, 3])];
  const result = resolve(board, { phase: 'SETTLE' });

  assert.equal(result.clearSteps, 1);
  assert.equal(result.rowsCleared, 0, 'a buffalo row does not count as cleared');
  assert.equal(result.buffaloShrinks, 1);
  assert.equal(result.score, 50, 'no rowValue term');

  const survivor = result.animals.find((a) => a.type === 'buffalo');
  assert.equal(result.animals.length, 1, 'every non-buffalo in the row is swept away');
  assert.equal(survivor.size, 3, 'size n -> n - 1');
  assert.equal(survivor.x, 0, 'x is unchanged: it shrinks from the trailing edge');
  assert.equal(rowString(result.animals, 0), 'BBB.......');
});

test('AC-507 a size-1 buffalo is retired rather than shrunk', () => {
  const buffalo = { ...animal('buffalo', 9, 0), size: 1 };
  const board = [buffalo, ...rowExcept(0, [9])];
  const result = resolve(board, { phase: 'SETTLE' });

  assert.equal(result.buffaloRetired, 1);
  assert.equal(result.animals.length, 0);
  assert.deepEqual(result.events[0].retiredIds, [buffalo.id]);
  assert.equal(result.score, 550, '50 for the final shrink plus 500 for retirement');
});

test('AC-506 a buffalo takes four completed rows to remove', () => {
  let buffalo = animal('buffalo', 3, 0);
  let sizes = [];
  for (let i = 0; i < 4; i++) {
    const board = [buffalo, ...rowExcept(0, [3, 4, 5, 6].slice(0, buffalo.size))];
    const result = resolve(board, { phase: 'SETTLE' });
    const next = result.animals.find((a) => a.type === 'buffalo');
    sizes.push(next ? next.size : 0);
    if (!next) break;
    buffalo = next;
  }
  assert.deepEqual(sizes, [3, 2, 1, 0]);
});

test('AC-617 the worked example from gameplay.md §7.3 scores exactly 800', () => {
  // Two rows complete at once; the collapse completes a third row holding the
  // buffalo. 4th consecutive clearing turn, so x2.0 (incremented first).
  const board = [
    ...fullRow(0),
    ...fullRow(1),
    animal('buffalo', 0, 2),
    animal('elk', 4, 3),
    animal('elk', 7, 3),
  ];
  const result = resolve(board, { phase: 'SETTLE', clearingTurns: 4 });

  assert.equal(result.clearSteps, 2);
  assert.equal(result.events[0].score, 600, 'step 1: 300 x 1 x 2.0');
  assert.equal(result.events[1].score, 200, 'step 2: 50 x 2 x 2.0');
  assert.equal(result.score, 800);
});

test('AC-617b the same example retiring the buffalo pays 2200 on step 2', () => {
  // Same shape, but the buffalo is down to its last segment, so step 2 retires it.
  const board = [
    ...fullRow(0),
    ...fullRow(1),
    { ...animal('buffalo', 0, 2), size: 1 },
    ...rowExcept(3, [0]).filter((a) => a.x >= 1),
  ];
  const result = resolve(board, { phase: 'SETTLE', clearingTurns: 4 });

  assert.equal(result.clearSteps, 2);
  assert.equal(result.events[0].score, 600);
  assert.equal(result.buffaloRetired, 1);
  assert.equal(result.events[1].score, 2200, '(50 + 500) x 2 x 2.0');
});

test('a resolution with no complete row is a no-op', () => {
  const board = rowExcept(0, [5]);
  const result = resolve(board, { phase: 'SETTLE' });
  assert.equal(result.clearSteps, 0);
  assert.equal(result.score, 0);
  assert.equal(result.animals, board, 'the same array is returned untouched');
  assert.equal(result.events.length, 0);
});
