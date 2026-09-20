// The occupancy snapshot the drag worklet runs on.
//
// AC-832 requires the legal/illegal ghost to be computed in the gesture worklet,
// which means the worklet cannot call into the engine and cannot read React
// state. It is handed this snapshot instead, and takes its own copy at gesture
// start.
//
// The snapshot is an interval, and it can be, because movement is a swept slide
// (gameplay.md §6.1): an animal is stopped by the FIRST obstruction in each
// direction, so the set of legal target columns is always contiguous. The
// `slideRange === checkMove` equivalence is asserted exhaustively in
// test/occupancy.test.js — if that ever breaks, the ghost starts lying and
// AC-407 is worse than v1's silence.

import { BOARD } from '../engine/constants.js';

/**
 * @returns {{minX:number, maxX:number, leftBlockerId:string, rightBlockerId:string}}
 */
export function slideRange(animals, animal, width = BOARD.width) {
  let minX = 0;
  let maxX = width - animal.size;
  let leftBlockerId = '';
  let rightBlockerId = '';

  for (const other of animals) {
    if (other.id === animal.id || other.y !== animal.y) continue;
    if (other.x + other.size <= animal.x) {
      // Wholly to the left: it stops the slide at the column just past its edge.
      const limit = other.x + other.size;
      if (limit > minX) {
        minX = limit;
        leftBlockerId = other.id;
      }
    } else if (other.x >= animal.x + animal.size) {
      const limit = other.x - animal.size;
      if (limit < maxX) {
        maxX = limit;
        rightBlockerId = other.id;
      }
    }
  }

  return { minX, maxX, leftBlockerId, rightBlockerId };
}

/** One snapshot per animal, keyed by id. Recomputed when the board changes. */
export function slideRanges(animals, width = BOARD.width) {
  const ranges = {};
  for (const animal of animals) ranges[animal.id] = slideRange(animals, animal, width);
  return ranges;
}
