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
  MIN_ABILITY_COST,
  isAbilityRemovable,
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
  [ABILITY_DART_ACTIVE]: 'Dart in progress',
  [ABILITY_DISABLED]: 'Unavailable',
  [ABILITY_BAD_TARGET]: 'Nothing to target',
});

/**
 * AC-1405j: an unaffordable row says what it costs, not merely that it is
 * unavailable. A sheet that hides why a row is unavailable looks broken rather
 * than expensive — and now that the five rows carry three different prices,
 * "why not that one" is a question the player will actually ask.
 */
function shortfall(cost) {
  return cost === 1 ? 'Needs a charge' : `Needs ${cost} charges`;
}

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
      // The probe has to be a target the engine would ACCEPT, or an all-buffalo
      // board would report Burrow as affordable and then reject it (AC-1412b).
      ? (state.animals.find((a) => isAbilityRemovable(a.type)) || {}).id
      : spec.target === 'species'
        ? migratableSpecies(state.animals)[0]
        : undefined;
    const fault = abilityFault(state, id, probe);
    return {
      id,
      species: spec.species,
      scope: spec.scope,
      /** AC-1405h. Read off the engine's table, never re-derived from scope. */
      cost: spec.cost,
      /**
       * AC-1405j / ui.md §13.2: the price renders as PIPS, not a numeral, so
       * the player compares two rows of dots — the cost against the reserve on
       * the button — rather than a number against a number.
       */
      costPips: Array.from({ length: spec.cost }, (_, i) => i),
      needsTarget: spec.target !== null,
      name: ABILITY_COPY[id].name,
      effect: ABILITY_COPY[id].effect,
      enabled: fault === null,
      reason: fault === ABILITY_NO_CHARGE
        ? shortfall(spec.cost)
        : fault ? REASON[fault] || 'Unavailable' : null,
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

/** An ordinary pip that has not been earned yet. */
export const EMPTY_PIP_ALPHA = 0.55;

/**
 * `restAlpha` is the FINAL opacity the pip sits at, not a factor.
 *
 * It shipped as a factor, and the component multiplied the gold pip's 0.25 by
 * the 0.55 meant for ordinary empties — so the fourth pip rendered at 13.75%
 * against a specified 25%, while the test asserting `restAlpha === 0.25`
 * passed. The number was right and what was drawn was not, which is the whole
 * shape of this defect class: a pure function asserted, and nothing asserting
 * what the component does with its value.
 *
 * So the composition happens HERE, once, and `pipAlpha` below is what the
 * component renders verbatim — a hygiene test refuses it a `restAlpha` of its
 * own to do arithmetic on.
 */
export function chargePips(charges) {
  const pips = [];
  for (let i = 0; i < ABILITY_CHARGE_CAP; i += 1) {
    pips.push({ index: i, filled: i < charges, gold: false, restAlpha: EMPTY_PIP_ALPHA });
  }
  pips.push({
    index: ABILITY_CHARGE_CAP,
    filled: charges > ABILITY_CHARGE_CAP,
    gold: true,
    restAlpha: LAST_STAND_PIP_ALPHA,
  });
  return pips;
}

/** The opacity a pip rests at. The component renders this and nothing else. */
export function pipAlpha(pip) {
  return pip.filled ? 1 : pip.restAlpha;
}

/**
 * ui.md §13.4 / AC-1410b — the frozen strip greys out, and it is load-bearing:
 * the tray's contract is that it shows what is coming, so while nothing is
 * coming the strip has to read as switched off rather than merely relabelled.
 *
 * It is a FUNCTION rather than a style, because the strip's opacity is also
 * driven by the arrival reveal, and a static `opacity: 0.45` sitting in the
 * same style array as an animated one is silently overwritten by whichever is
 * written last — which is exactly how it shipped rendering at opacity 1. The
 * two are multiplied on the UI thread instead, so neither can erase the other.
 */
export const FROZEN_STRIP_OPACITY = 0.45;

export function trayStripOpacity(frozen) {
  return frozen > 0 ? FROZEN_STRIP_OPACITY : 1;
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
  // AC-1412b. The rule is per-OBJECT, not per-ability: the buffalo is a
  // different kind of thing, and AC-1412 had already encoded that for Migrate.
  // Burrow shipped returning true unconditionally, which let one rat charge
  // delete a size-5 buffalo that otherwise costs five clears.
  if (ability === ABILITIES.burrow.id) return isAbilityRemovable(animal.type);
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
    // AC-1415: muted below the price of the CHEAPEST thing in the set, which
    // is what "you cannot use an ability right now" means once the five carry
    // three different prices.
    muted: state.charges < MIN_ABILITY_COST || !state.abilities || state.dart > 0,
    charges: state.charges,
    pips: chargePips(state.charges),
    /** How many of the five are usable right now — the sheet is worth opening. */
    usable: rows.filter((r) => r.enabled).length,
  };
}

/**
 * ui.md §13.1 — the gold marks the EVENT, not the slot.
 *
 * The first wording called the fourth dot "the Last Stand pip", which conflated
 * a slot with a moment: gold appeared only when Last Stand OVERFLOWED a full
 * reserve — the one case that does not need it — and was absent at 0 charges,
 * for the player the grant was invented for (AC-1408e). Whichever pip Last
 * Stand fills now blooms gold for the 400 ms of the announce and then settles
 * to its ordinary fill. The fourth SLOT is still reachable only by overflow;
 * the EVENT is marked wherever it lands.
 *
 * Returned as data rather than decided in the component, because "the gold
 * landed on the wrong pip" is precisely a claim about a rendered value that no
 * position check can see.
 */
export function pipBloomTone(pip, grants) {
  if (!grants) return null;
  const grant = grants.find((g) => g.charges - 1 === pip.index);
  if (!grant) return null;
  return grant.reason === 'lastStand' ? 'lastStand' : 'ladder';
}

