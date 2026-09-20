// Shared test fixtures. Boards are written bottom-up: row 0 is the floor.

import { SPECIES } from '../src/engine/constants.js';

let nextId = 1000;

/** Make one animal. Sizes come from the species table so fixtures cannot drift. */
export function animal(type, x, y) {
  return { id: nextId++, type, x, y, size: SPECIES[type].size };
}

/** A full 10-wide row of rats at `y`. */
export function fullRow(y) {
  return Array.from({ length: 10 }, (_, x) => animal('rat', x, y));
}

/** A row of rats at `y` covering every column except those listed. */
export function rowExcept(y, gaps) {
  const out = [];
  for (let x = 0; x < 10; x++) if (!gaps.includes(x)) out.push(animal('rat', x, y));
  return out;
}

/** Occupancy of a row as a compact string, for readable assertions. */
export function rowString(animals, y, width = 10) {
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
