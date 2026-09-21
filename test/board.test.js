// AC-2xx gravity, AC-4xx movement rules.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MOVE_BLOCKED,
  MOVE_NOOP,
  MOVE_OK,
  MOVE_OUT_OF_BOUNDS,
  applyGravity,
  checkMove,
  filledRows,
  freeRuns,
  moveAnimal,
} from '../src/engine/board.js';
import { BOARD } from '../src/engine/constants.js';
import { animal, fullRow, rowExcept } from './helpers.js';

test('AC-206 an animal with nothing beneath it falls to y=0', () => {
  const fox = animal('fox', 3, 9);
  const [settled] = applyGravity([fox]);
  assert.equal(settled.y, 0);
  assert.equal(settled.x, 3, 'gravity never changes x');
});

test('AC-206 gravity does not tunnel through a blocker', () => {
  const floor = animal('rat', 3, 0);
  const elk = animal('elk', 2, 8);
  const settled = applyGravity([floor, elk]);
  assert.equal(settled.find((a) => a.id === elk.id).y, 1);
});

test('AC-207 lower animals settle before the animals resting on them', () => {
  // Two rats stacked high in the same column, nothing beneath them.
  const lower = animal('rat', 4, 6);
  const upper = animal('rat', 4, 9);
  const settled = applyGravity([upper, lower]);
  assert.equal(settled.find((a) => a.id === lower.id).y, 0);
  assert.equal(settled.find((a) => a.id === upper.id).y, 1);
});

test('AC-206 gravity is idempotent on a settled board', () => {
  const board = applyGravity([animal('elk', 0, 5), animal('fox', 1, 9), animal('rat', 7, 3)]);
  assert.deepEqual(applyGravity(board), board);
});

test('filledRows finds only rows with every column occupied', () => {
  const board = [...fullRow(0), ...rowExcept(1, [7])];
  assert.deepEqual(filledRows(board), [0]);
});

test('freeRuns reports maximal runs of free columns', () => {
  const occ = [true, false, false, true, true, false, false, false, false, false];
  assert.deepEqual(freeRuns(occ), [
    [1, 2],
    [5, 5],
  ]);
});

test('AC-403 a move may not cross another animal in the same row (swept path)', () => {
  // The exact v1 defect: canMoveAnimal checked only the destination, so this passed.
  const mover = animal('rat', 0, 0);
  const blocker = animal('rat', 2, 0);
  const board = [mover, blocker];
  assert.equal(checkMove(board, mover.id, 4), MOVE_BLOCKED);
  assert.equal(checkMove(board, mover.id, 1), MOVE_OK, 'stopping short of the blocker is legal');
  assert.equal(checkMove(board, mover.id, 2), MOVE_BLOCKED, 'landing on it is illegal too');
});

test('AC-403 the swept path is checked in both directions', () => {
  const mover = animal('fox', BOARD.width - 2, 3);
  const blocker = animal('elk', 3, 3);
  assert.equal(checkMove([mover, blocker], mover.id, 0), MOVE_BLOCKED);
  assert.equal(checkMove([mover, blocker], mover.id, 6), MOVE_OK);
});

test('AC-403 an animal in a different row never blocks', () => {
  const mover = animal('rat', 0, 0);
  const other = animal('rat', 2, 1);
  assert.equal(checkMove([mover, other], mover.id, 5), MOVE_OK);
});

test('AC-404 out-of-bounds moves are rejected at both edges', () => {
  const elephant = animal('elephant', 2, 0);
  assert.equal(checkMove([elephant], elephant.id, -1), MOVE_OUT_OF_BOUNDS);
  assert.equal(checkMove([elephant], elephant.id, 6), MOVE_OUT_OF_BOUNDS);
  assert.equal(checkMove([elephant], elephant.id, 5), MOVE_OK, 'x + size == 10 is legal');
});

test('AC-402 a zero-distance move is reported as a no-op, not a turn', () => {
  const rat = animal('rat', 4, 0);
  assert.equal(checkMove([rat], rat.id, 4), MOVE_NOOP);
});

test('AC-405 a move changes x only', () => {
  const fox = animal('fox', 0, 5);
  const [moved] = moveAnimal([fox], fox.id, 6);
  assert.equal(moved.x, 6);
  assert.equal(moved.y, 5);
  assert.equal(moved.size, fox.size);
});
