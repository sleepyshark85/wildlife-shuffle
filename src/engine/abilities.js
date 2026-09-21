// Layer D — the five abilities, as pure board transforms (gameplay.md §13).
//
// Nothing here resolves a turn. Each function takes the board and returns the
// board the ACTION phase hands to SETTLE, so an ability is exactly as much of
// the turn as a move is: the thing that happens before gravity. That is AC-1406
// made structural — an ability cannot be "as well as" a move, because there is
// only one ACTION phase and this is what it does.
//
// SCOPE SCALES WITH SIZE, and it is the design's whole claim (§13.1): rat acts
// on one animal, fox on one turn's actions, elk on one species, elephant on the
// board's layout, buffalo on time itself. `scope` below is an ORDINAL, not a
// label, so the claim is a number a test can read rather than a sentence in a
// comment — test/abilities.test.js asserts it equals the species' own size.

import { BOARD, BUFFALO, DRAWABLE, SPECIES } from './constants.js';

/** Fox's Dart: how many moves the turn is worth instead of one (AC-1407). */
export const DART_MOVES = 3;

/** Buffalo's Hold the Line: how many turns arrive with nothing (AC-1410). */
export const HOLD_TURNS = 3;

/**
 * The five. One per species, keyed by the ability rather than by the species,
 * because the player chooses an ability and the species is the flavour.
 *
 * `target` says what the caller must supply: an animal id, a species, or
 * nothing. `scope` is the ordinal described above.
 */
export const ABILITIES = Object.freeze({
  burrow: Object.freeze({
    id: 'burrow', species: 'rat', scope: 1, target: 'animal',
  }),
  dart: Object.freeze({
    id: 'dart', species: 'fox', scope: 2, target: null,
  }),
  migrate: Object.freeze({
    id: 'migrate', species: 'elk', scope: 3, target: 'species',
  }),
  stampede: Object.freeze({
    id: 'stampede', species: 'elephant', scope: 4, target: null,
  }),
  hold: Object.freeze({
    id: 'hold', species: 'buffalo', scope: 5, target: null,
  }),
});

/** In scope order, which is species-size order. The sheet renders this list. */
export const ABILITY_IDS = Object.freeze(
  Object.keys(ABILITIES).sort((a, b) => ABILITIES[a].scope - ABILITIES[b].scope),
);

/**
 * AC-1412: buffalo is not a selectable Migrate target.
 *
 * Derived from DRAWABLE rather than written out, so a species added to the game
 * becomes migratable without anyone remembering to come back here — and buffalo
 * stays out because buffalo is the one species that is never drawn.
 */
export const MIGRATE_SPECIES = DRAWABLE;

/**
 * Elephant's Stampede: left-pack every row (AC-1411).
 *
 * Within a row, animals keep their left-to-right order and are pushed against
 * the wall in that order, so the row holds exactly the cells it held before.
 * THAT is why it can never complete a row by itself: packing is a permutation
 * of occupancy within the row, not an addition to it, and a row that was one
 * cell short is one cell short afterwards. A seven-cell row still holds seven.
 *
 * Gravity is NOT applied here. The caller's SETTLE phase does it, the same way
 * it does for a move — which is what keeps one gravity in the engine.
 */
export function stampede(animals) {
  const byRow = new Map();
  for (const animal of animals) {
    if (!byRow.has(animal.y)) byRow.set(animal.y, []);
    byRow.get(animal.y).push(animal);
  }
  const moved = [];
  const next = new Map();
  for (const [, row] of byRow) {
    // Sort by x. Two animals in one row cannot share an x, so this is total.
    const ordered = row.slice().sort((a, b) => a.x - b.x);
    let cursor = 0;
    for (const animal of ordered) {
      if (animal.x !== cursor) {
        // `y` rides along because the presentation staggers the slide from the
        // bottom row up (ui.md §13.4) and would otherwise have to look every
        // animal back up on a board the engine has already changed.
        moved.push({ id: animal.id, y: animal.y, fromX: animal.x, toX: cursor });
      }
      next.set(animal.id, cursor);
      cursor += animal.size;
    }
  }
  // Rebuild in the INPUT order, never in row order: `animals` order is part of
  // the engine's determinism (applyGravity's sort is stable) and re-ordering it
  // here would make the board depend on how this function happened to iterate.
  return {
    animals: animals.map((a) => (next.get(a.id) === a.x ? a : { ...a, x: next.get(a.id) })),
    moved,
  };
}

/** Rat's Burrow: one animal of the player's choice leaves (AC-1401). */
export function burrow(animals, id) {
  return {
    animals: animals.filter((a) => a.id !== id),
    removedIds: animals.filter((a) => a.id === id).map((a) => a.id),
  };
}

/** Elk's Migrate: every animal of one species leaves (AC-1412). */
export function migrate(animals, type) {
  return {
    animals: animals.filter((a) => a.type !== type),
    removedIds: animals.filter((a) => a.type === type).map((a) => a.id),
  };
}

export const ABILITY_UNKNOWN = 'unknown-ability';
export const ABILITY_NO_CHARGE = 'no-charge';
export const ABILITY_DISABLED = 'abilities-disabled';
export const ABILITY_BAD_TARGET = 'bad-target';
export const ABILITY_DART_ACTIVE = 'dart-active';

/**
 * Why this ability may not be used right now, or null.
 *
 * Returning a REASON rather than a boolean is what lets the sheet say why a row
 * is unaffordable instead of implying it (ui.md §13.2), and it means the engine
 * and the sheet cannot disagree about affordability — there is one predicate.
 *
 * A target that is not on the board is a fault rather than a legal waste: a
 * charge that evaporates for nothing is the opposite of an assist. AC-1402 is
 * untouched by that — it is about the ABILITY's own species (Burrow works with
 * no rat on the board), not about the target the player picks.
 */
export function abilityFault(state, ability, target) {
  if (!Object.prototype.hasOwnProperty.call(ABILITIES, ability)) return ABILITY_UNKNOWN;
  if (!state.abilities) return ABILITY_DISABLED;
  if (state.dart > 0) return ABILITY_DART_ACTIVE;
  if (state.charges <= 0) return ABILITY_NO_CHARGE;
  const spec = ABILITIES[ability];
  if (spec.target === 'animal' && !state.animals.some((a) => a.id === target)) {
    return ABILITY_BAD_TARGET;
  }
  if (spec.target === 'species') {
    if (!MIGRATE_SPECIES.includes(target)) return ABILITY_BAD_TARGET;
    if (!state.animals.some((a) => a.type === target)) return ABILITY_BAD_TARGET;
  }
  return null;
}

/**
 * Apply an ability's board effect. Returns the ACTION event the turn records,
 * plus the board SETTLE is about to run gravity on.
 *
 * Dart and Hold the Line touch no animal: their effect is on the turn and on
 * the arrival schedule, and both live in the reducer where those are.
 */
export function applyAbility(animals, ability, target) {
  switch (ability) {
    case ABILITIES.burrow.id: {
      const out = burrow(animals, target);
      return { animals: out.animals, removedIds: out.removedIds, moved: [] };
    }
    case ABILITIES.migrate.id: {
      const out = migrate(animals, target);
      return { animals: out.animals, removedIds: out.removedIds, moved: [] };
    }
    case ABILITIES.stampede.id: {
      const out = stampede(animals);
      return { animals: out.animals, removedIds: [], moved: out.moved };
    }
    default:
      return { animals, removedIds: [], moved: [] };
  }
}

/**
 * Is any animal standing in the danger band? AC-1408b's "row 11 or above".
 *
 * THE ONLY DEFINITION, and it lives in the engine because Layer D made it a
 * RULE as well as a rendering: it decides when Last Stand fires, and it decides
 * when the board's pulse lights. Those two must be the same instant — ui.md
 * §13.4 asks for the warning and the help to read as one event — and two
 * functions that agree are the §6.3 bug shape rather than its absence. The UI
 * imports this one (src/ui/components/Board.js); a hygiene test refuses a
 * second copy.
 *
 * Row 14 is inside "or above" and is never seen: occupying it ends the run in
 * the same JUDGE phase, and no charge is granted on a turn that ends the run.
 */
export function inDangerBand(animals) {
  return animals.some((a) => a.y >= BOARD.dangerBandLow);
}

/**
 * The species each ability belongs to, as the tray and the sheet draw it.
 * Exported so the UI never re-derives the pairing from a second table.
 */
export function abilitySpecies(ability) {
  return SPECIES[ABILITIES[ability].species];
}

/** Buffalo is never a Migrate target, and this is the executable form of it. */
export function isMigratable(type) {
  return type !== BUFFALO && MIGRATE_SPECIES.includes(type);
}
