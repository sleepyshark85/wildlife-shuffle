// Shared test fixtures. Boards are written bottom-up: row 0 is the floor.

import { BOARD, SPECIES } from '../src/engine/constants.js';

let nextId = 1000;

/**
 * The rightmost column index.
 *
 * Fixtures that complete a row by sliding something into the last column wrote
 * `9` when the board was 10 wide. At 9 columns those fixtures did not fail —
 * several went on PASSING, because a row that was meant to be one short was
 * already full and an out-of-bounds move was simply rejected. Deriving the
 * index is the only way that class of silent drift is visible (AC-126).
 */
export const LAST = BOARD.width - 1;

/** Make one animal. Sizes come from the species table so fixtures cannot drift. */
export function animal(type, x, y) {
  return { id: nextId++, type, x, y, size: SPECIES[type].size };
}

/**
 * A full row of rats at `y`.
 *
 * Width comes from the constant, never from a literal: the board narrowed from
 * 10 to 9 and a fixture that had hard-coded its width would have gone on
 * building a row that no longer completes anything (gameplay.md §3, AC-126).
 */
export function fullRow(y) {
  return Array.from({ length: BOARD.width }, (_, x) => animal('rat', x, y));
}

/** A row of rats at `y` covering every column except those listed. */
export function rowExcept(y, gaps) {
  const out = [];
  for (let x = 0; x < BOARD.width; x++) if (!gaps.includes(x)) out.push(animal('rat', x, y));
  return out;
}

/** Occupancy of a row as a compact string, for readable assertions. */
export function rowString(animals, y, width = BOARD.width) {
  const cells = new Array(width).fill('.');
  for (const a of animals) {
    if (a.y !== y) continue;
    for (let c = a.x; c < a.x + a.size; c++) cells[c] = a.type[0].toUpperCase();
  }
  return cells.join('');
}

/** The first event of a given type in a turn's event log. */
export function eventOfType(events, type) {
  return events.find((e) => e.type === type);
}
