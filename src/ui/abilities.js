// The abilities UI, as pure functions (ui.md §13).
//
// It imports the engine and the tokens and NOTHING that only runs on a device,
// for §6.7's reason: the sheet's affordability, the pip row, the targeting copy
// and the frozen tray are all things a harness must be able to evaluate without
// a phone. `src/ui/trajectory.js` is the precedent and a hygiene test keeps it
// true here too.
//
// It is also the one place any of this is decided. The sheet, the action bar,
// the board's targeting dim and the tray all read these functions rather than
// each deriving "can I afford this" for themselves — §6.3's rule, because four
// derivations that agree are the bug shape rather than its absence.

import {
  ABILITIES,
  ABILITY_BAD_TARGET,
  ABILITY_DART_ACTIVE,
  ABILITY_DISABLED,
  ABILITY_IDS,
  ABILITY_NO_CHARGE,
  abilityFault,
  isMigratable,
} from '../engine/abilities.js';
import { ABILITY_CHARGE_CAP } from '../engine/constants.js';
import { COPY } from './theme.js';

/**
 * ui.md §13.2 — the name and the one-line effect, at 16/600 and 13/400.
 *
 * The effect line is written to state the SCOPE, because scope scaling with
 * size is the thing the five are meant to teach (gameplay.md §13.1). A player
 * who reads all five should come away knowing that bigger means wider.
 */
export const ABILITY_COPY = Object.freeze({
  burrow: Object.freeze({
    name: 'Burrow',
    effect: 'Remove one animal of your choice.',
  }),
  dart: Object.freeze({
    name: 'Dart',
    effect: 'Make up to three moves this turn instead of one.',
  }),
  migrate: Object.freeze({
    name: 'Migrate',
    effect: 'Every animal of one species leaves the board.',
  }),
  stampede: Object.freeze({
    name: 'Stampede',
    effect: 'Every row slides left, closing the gaps inside it.',
  }),
  hold: Object.freeze({
    name: 'Hold the Line',
    effect: 'Nothing arrives for three turns.',
  }),
});

/**
 * Why a row is unaffordable, IN WORDS (ui.md §13.2: "the reason stated rather
 * than implied"). A greyed row with no reason teaches the player nothing about
 * a system that exists to help them.
 */
const REASON = Object.freeze({
  [ABILITY_NO_CHARGE]: 'Needs a charge',
  [ABILITY_DART_ACTIVE]: 'Dart in progress',
  [ABILITY_DISABLED]: 'Unavailable',
  [ABILITY_BAD_TARGET]: 'Nothing to target',
});

/**
 * The five rows of the sheet, in scope order.
 *
 * `enabled` is `abilityFault() === null` and nothing else, so what the sheet
 * offers and what the engine accepts are one predicate. Targeted abilities are
 * asked about the BEST target available — one that exists — because at sheet
 * time the player has not chosen one yet and "Burrow is unaffordable" must mean
 * "you cannot burrow", not "you have not said what yet".
 */
export function abilityRows(state) {
  return ABILITY_IDS.map((id) => {
    const spec = ABILITIES[id];
    const probe = spec.target === 'animal'
      ? (state.animals[0] && state.animals[0].id)
      : spec.target === 'species'
        ? migratableSpecies(state.animals)[0]
        : undefined;
    const fault = abilityFault(state, id, probe);
    return {
      id,
      species: spec.species,
      scope: spec.scope,
      needsTarget: spec.target !== null,
      name: ABILITY_COPY[id].name,
      effect: ABILITY_COPY[id].effect,
      enabled: fault === null,
      reason: fault ? REASON[fault] || 'Unavailable' : null,
    };
  });
}

/** The migratable species actually standing on the board, in a stable order. */
export function migratableSpecies(animals) {
  const seen = [];
  for (const a of animals) {
    if (isMigratable(a.type) && !seen.includes(a.type)) seen.push(a.type);
  }
  return seen;
}

/**
 * ui.md §13.1 — FOUR dots: three for the banked cap, and a fourth, gold-rimmed,
 * that only ever fills from Last Stand.
 *
 * The fourth sits at 25% while empty so the row reads as "three, plus one you
 * have not earned" rather than as a four-slot bar the player is failing to
 * fill. That is the whole reason it is not simply a four-pip counter: the cap
 * is three, and a UI that implies four would be reporting a reserve the economy
 * does not offer (gameplay.md §13.2a).
 */
export const LAST_STAND_PIP_ALPHA = 0.25;

export function chargePips(charges) {
  const pips = [];
  for (let i = 0; i < ABILITY_CHARGE_CAP; i += 1) {
    pips.push({ index: i, filled: i < charges, gold: false, restAlpha: 1 });
  }
  pips.push({
    index: ABILITY_CHARGE_CAP,
    filled: charges > ABILITY_CHARGE_CAP,
    gold: true,
    restAlpha: LAST_STAND_PIP_ALPHA,
  });
  return pips;
}

/**
 * ui.md §13.3 — the targeting chip.
 *
 * Stampede, Dart and Hold the Line resolve immediately on arming, so they never
 * reach a targeting state at all and this returns null for them.
 *
 * UNDERSPECIFIED IN THE DESIGN, and reported: ui.md gives the Burrow string
 * ("Tap an animal to burrow") and none for Migrate, whose target is a SPECIES
 * rather than an animal. The player still taps an animal — there is nothing
 * else on the board to tap — so the copy has to say what the tap will take.
 */
export function targetingChip(ability) {
  if (ability === ABILITIES.burrow.id) return 'Tap an animal to burrow';
  if (ability === ABILITIES.migrate.id) return 'Tap an animal — its whole species leaves';
  return null;
}

export function needsTarget(ability) {
  return Boolean(ability) && ABILITIES[ability].target !== null;
}

/**
 * Is this animal a legal target for the armed ability? Drives the board's
 * targeting dim (ui.md §13.3: everything dims to 45% except valid targets).
 */
export function isTarget(ability, animal) {
  if (ability === ABILITIES.burrow.id) return true;
  if (ability === ABILITIES.migrate.id) return isMigratable(animal.type);
  return false;
}

/** The action the tap commits: an animal id for Burrow, a species for Migrate. */
export function targetOf(ability, animal) {
  if (ability === ABILITIES.migrate.id) return animal.type;
  return animal.id;
}

/** ui.md §13.3: everything that is not a valid target dims to this. */
export const TARGET_DIM = 0.45;

/**
 * ui.md §13.4 — the tray's frozen label.
 *
 * "The tray's whole contract is that it shows what is coming; when nothing is
 * coming it must say so, or the contract reads as broken for three turns."
 *
 * UNDERSPECIFIED, and reported. The design writes `FROZEN · 3`, which is only
 * reachable if the freeze spares the turn it was used on — and a freeze that
 * lets the batch already in the tray land has not rescued the player who
 * pressed it for exactly that batch. The engine therefore suppresses this
 * turn's arrival and the two after it, three in total (AC-1410), and this
 * counts what is still to come rather than what has already happened. The
 * player sees 2, then 1. The ability's own announcement says 3.
 */
export function frozenLabel(frozen) {
  return frozen > 0 ? `FROZEN · ${frozen}` : null;
}

/** ui.md §13.4 — `2 MOVES LEFT`, counting down, while a Dart is open. */
export function dartLabel(dart) {
  if (dart <= 0) return null;
  return dart === 1 ? '1 MOVE LEFT' : `${dart} MOVES LEFT`;
}

/**
 * What the action bar's status line says. One function, so the bar cannot
 * disagree with the HUD about what the player is being asked to do.
 */
export function turnStatus({ gameOver, blocked, resolving, arming, dart }) {
  if (gameOver) return 'RUN OVER';
  if (arming) return 'CHOOSE A TARGET';
  if (blocked) return COPY.blocked;
  if (resolving) return COPY.resolving;
  // The Dart counter replaces the idle line rather than sitting beside it: the
  // bar has one status slot and "how many moves are left" is the status.
  if (dart > 0) return dartLabel(dart);
  return COPY.idle;
}

/**
 * AC-1415: at zero charges the button is disabled but still VISIBLE, and the
 * bar does not reflow. Expressed as a value rather than as a conditional
 * render, because "does not reflow" is a claim about what is on screen and a
 * component that returns null cannot make it.
 */
export function abilityButton(state) {
  const rows = abilityRows(state);
  return {
    visible: true,
    muted: state.charges <= 0 || !state.abilities || state.dart > 0,
    charges: state.charges,
    pips: chargePips(state.charges),
    /** How many of the five are usable right now — the sheet is worth opening. */
    usable: rows.filter((r) => r.enabled).length,
  };
}
