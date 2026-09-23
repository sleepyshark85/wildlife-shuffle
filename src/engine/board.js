// Board primitives: occupancy, gravity, row completion, movement legality.
//
// Every function is pure and takes its dimensions as arguments — nothing here
// reads module-level mutable state (AC-213).
//
// An animal is { id, type, x, y, size }: v1's model, kept verbatim. `x` is its
// leftmost column, `y` its row (0 = bottom), and it occupies [x, x + size).

import { BOARD, BUFFALO } from './constants.js';

/** Do two animals overlap horizontally if `a` sat at column `ax`? */
function overlapsAt(ax, aSize, other) {
  return !(ax + aSize <= other.x || ax >= other.x + other.size);
}

/**
 * Maximal runs of free columns in an occupancy map, as [start, length] pairs.
 * Used by the spawner to guarantee every animal it draws can actually be placed.
 */
export function freeRuns(occupancy) {
  const runs = [];
  let start = -1;
  for (let c = 0; c <= occupancy.length; c++) {
    const free = c < occupancy.length && !occupancy[c];
    if (free && start === -1) start = c;
    if (!free && start !== -1) {
      runs.push([start, c - start]);
      start = -1;
    }
  }
  return runs;
}

/**
 * Bottom-to-top gravity. Ported unchanged from v1's applyGravity
 * (src/data/gameLogic.js:119-155) — verified correct, no tunnelling.
 * Animals are processed in ascending `y` so that lower animals settle first
 * (AC-206, AC-207). Array.prototype.sort is stable, so equal rows keep their
 * input order and the result is deterministic.
 */
export function applyGravity(animals) {
  const result = animals.slice();
  const sorted = result.slice().sort((a, b) => a.y - b.y);

  for (const animal of sorted) {
    let lowestY = animal.y;

    for (let testY = animal.y - 1; testY >= 0; testY--) {
      const blocked = result.some((other) => {
        if (other.id === animal.id) return false;
        if (other.y !== testY) return false;
        return overlapsAt(animal.x, animal.size, other);
      });

      if (!blocked) {
        lowestY = testY;
      } else {
        break;
      }
    }

    const resultIndex = result.findIndex((a) => a.id === animal.id);
    if (resultIndex !== -1) {
      result[resultIndex] = { ...result[resultIndex], y: lowestY };
    }
  }

  return result;
}

/** Rows whose every column is occupied, ascending. */
export function filledRows(animals, width = BOARD.width, height = BOARD.height) {
  const counts = new Array(height).fill(null);
  for (const animal of animals) {
    if (animal.y < 0 || animal.y >= height) continue;
    if (!counts[animal.y]) counts[animal.y] = new Array(width).fill(false);
    for (let c = animal.x; c < animal.x + animal.size; c++) {
      if (c >= 0 && c < width) counts[animal.y][c] = true;
    }
  }
  const rows = [];
  for (let y = 0; y < height; y++) {
    if (counts[y] && counts[y].every(Boolean)) rows.push(y);
  }
  return rows;
}

/**
 * Every buffalo on the board, ordered BOTTOM ROW FIRST then left to right.
 *
 * PLURAL SINCE AC-311, AND THE COMMENT THAT USED TO SIT HERE WAS THE RULE: it
 * read "At most one exists (D10)", which the owner overruled having played it
 * — "we can have multiple buffalo, the player need to try to clear it as soon
 * as possible". There is no population cap and nothing may add one.
 *
 * What survives is a narrower invariant, and it is arithmetic rather than
 * policy: no ROW holds two buffalo, because `2 x SPECIES.buffalo.size >
 * BOARD.width` (10 > 9). That is what leaves every rule in gameplay.md §6.4
 * untouched — a completed row still holds exactly one buffalo or none
 * (AC-311b).
 *
 * The order is the HUD's (ui.md §7.1, AC-509): chip k is buffalo k counted up
 * from the floor, so the eye can match a chip to a body without counting. y = 0
 * is the bottom row.
 */
export function buffaloesOnBoard(animals) {
  return animals
    .filter((a) => a.type === BUFFALO)
    .sort((a, b) => (a.y - b.y) || (a.x - b.x));
}

export const MOVE_OK = 'ok';
export const MOVE_NOOP = 'noop';
const MOVE_NO_ANIMAL = 'no-animal';
export const MOVE_OUT_OF_BOUNDS = 'out-of-bounds';
export const MOVE_BLOCKED = 'blocked';

/**
 * Is moving `animalId` to column `targetX` legal?
 *
 * gameplay.md §6.1 (D6): movement is a slide, not a teleport. The whole swept
 * path must be clear — the animal may not cross another animal in its own row.
 * v1's canMoveAnimal (src/data/gameLogic.js:236-259) checked only the
 * destination, so a rat at x=0 could move to x=4 straight through a blocker at
 * x=2 (AC-403).
 *
 * Returns one of the MOVE_* reasons. MOVE_NOOP means legal but zero-distance,
 * which does not consume a turn (§6.2, AC-402).
 */
export function checkMove(animals, animalId, targetX, width = BOARD.width) {
  const animal = animals.find((a) => a.id === animalId);
  if (!animal) return MOVE_NO_ANIMAL;
  if (!Number.isInteger(targetX)) return MOVE_OUT_OF_BOUNDS;
  if (targetX < 0 || targetX + animal.size > width) return MOVE_OUT_OF_BOUNDS;
  if (targetX === animal.x) return MOVE_NOOP;

  const neighbours = animals.filter((a) => a.id !== animalId && a.y === animal.y);
  const step = targetX > animal.x ? 1 : -1;
  for (let x = animal.x + step; ; x += step) {
    for (const other of neighbours) {
      if (overlapsAt(x, animal.size, other)) return MOVE_BLOCKED;
    }
    if (x === targetX) break;
  }
  return MOVE_OK;
}

/** Apply a move that has already been validated. */
export function moveAnimal(animals, animalId, targetX) {
  return animals.map((a) => (a.id === animalId ? { ...a, x: targetX } : a));
}

/** Which animals changed row between two boards, for the presentation layer. */
export function diffRows(before, after) {
  const previous = new Map(before.map((a) => [a.id, a.y]));
  const moved = [];
  for (const animal of after) {
    const fromY = previous.get(animal.id);
    if (fromY !== undefined && fromY !== animal.y) {
      moved.push({ id: animal.id, fromY, toY: animal.y });
    }
  }
  return moved;
}
