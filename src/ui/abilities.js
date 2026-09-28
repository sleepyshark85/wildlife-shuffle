// The abilities UI, as pure functions (ui.md §13).
//
// It imports the engine and the tokens and NOTHING that only runs on a device,
// for §6.7's reason: the sheet's affordability, the pip row, the Stand Down
// meter's three states and the targeting copy are all things a harness must be
// able to evaluate without a phone. `src/ui/trajectory.js` is the precedent and
// a hygiene test keeps it true here too.
//
// It is also the one place any of this is decided. The sheet, the action bar,
// the board's targeting dim and the tray all read these functions rather than
// each deriving "can I afford this" for themselves — §6.3's rule, because four
// derivations that agree are the bug shape rather than its absence.

import {
  ABILITIES,
  isAbilityRemovable,
  ABILITY_BAD_TARGET,
  ABILITY_DART_ACTIVE,
  ABILITY_DISABLED,
  ABILITY_IDS,
  ABILITY_METER_LOW,
  ABILITY_NO_BUFFALO,
  ABILITY_NO_CHARGE,
  STAND_DOWN_SEGMENTS,
  abilityFault,
  isMigratable,
} from '../engine/abilities.js';
import { ABILITY_CHARGE_CAP } from '../engine/constants.js';
import { plural, word } from './format.js';
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
  /**
   * ui.md §13.2 records the rejected drafts, and they are why this line reads
   * as it does. "Shrink every buffalo" omits the amount, which is the only
   * number that matters. "Clear the herd" promises a removal the ability does
   * not perform — the buffalo stay, and a player who read that and then watched
   * eleven one-cell buffalo remain would reasonably think it had failed. "Every
   * buffalo loses all but one segment" is accurate and three words too long for
   * 13/400 at `xxLarge`. This states the DESTINATION rather than the delta,
   * which is shorter and is the thing the player can verify by looking at the
   * chips afterwards: every chip shows one bar.
   */
  standDown: Object.freeze({
    name: 'Stand Down',
    effect: 'Every buffalo drops to one segment.',
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
  /**
   * AC-1421, and it is the middle of Stand Down's three states — the one a
   * lazier design would collapse into "keep breaking segments". It must not be:
   * a player holding a full meter with no buffalo on the board has NOTHING to
   * do about it, and telling them to keep breaking segments would be false.
   */
  [ABILITY_NO_BUFFALO]: 'No buffalo on the board',
});

/**
 * AC-1405j: an unaffordable row says what it costs, not merely that it is
 * unavailable. A sheet that hides why a row is unavailable looks broken rather
 * than expensive — and now that the five rows carry three different prices,
 * "why not that one" is a question the player will actually ask.
 */
function shortfall(cost) {
  // "a charge" rather than "1 charge" is the designer's wording and is kept;
  // the count above one still goes through the one agreement rule, so the `s`
  // is not decided here.
  return cost === 1 ? 'Needs a charge' : `Needs ${plural(cost, 'charge')}`;
}

/**
 * ui.md §13.2 — Stand Down's cost column is the METER, not pips, and the two
 * vocabularies are deliberately different SHAPES: round pips for charges, square
 * ticks for the meter.
 *
 * A player who could not tell those apart would try to save charges for Stand
 * Down, which is exactly the confusion gameplay.md §13.2f-vi is built to
 * prevent. So this is not "pips at a different count": it is a second object,
 * and the sheet and the strip draw the same one.
 *
 * `gold` is the whole meter's state rather than a per-tick one (ui.md §7.1: at
 * full "every tick goes `last-stand` gold"), because full is a fact about the
 * meter and a tick has no business deciding it.
 */
export function meterTicks(meter, cap = STAND_DOWN_SEGMENTS) {
  const filled = Math.max(0, Math.min(cap, meter));
  return Array.from({ length: cap }, (_, i) => ({ index: i, filled: i < filled }));
}

/**
 * ui.md §7.1 — "the VoiceOver label is the numeral, because a screen reader
 * cannot count ticks".
 *
 * The visible meter is ticks for two reasons §7.1 gives — the charge pips
 * established the accumulate-a-quantity vocabulary, and *how close am I* and
 * *am I there* are readable off ticks without arithmetic where `6/10` needs two
 * numbers subtracted. Neither survives a screen reader, so the label is the
 * numeral it refuses to draw.
 */
function meterWords(meter, cap = STAND_DOWN_SEGMENTS) {
  const filled = Math.max(0, Math.min(cap, meter));
  // `word(0)` is "no", which is right for the strip's "no buffalo on the board"
  // and wrong for a QUANTITY: an empty meter read "Stand Down, no of ten",
  // which is not a sentence. Caught in the browser at the one value the meter
  // spends most of a run at, and the one a fixture is least likely to pick.
  return `${filled === 0 ? 'zero' : word(filled)} of ${word(cap)}`;
}

export function meterLabel(meter, cap = STAND_DOWN_SEGMENTS) {
  return `Stand Down, ${meterWords(meter, cap)}.`;
}

/**
 * The same quantity as a sentence of its own, for the sheet row — where the
 * name has already been said and the unit has not.
 */
function meterSentence(meter, cap = STAND_DOWN_SEGMENTS) {
  const words = meterWords(meter, cap);
  return `${words[0].toUpperCase()}${words.slice(1)} buffalo segments.`;
}

/**
 * The five rows of the sheet, in scope order.
 *
 * `enabled` is `abilityFault() === null` and nothing else, so what the sheet
 * offers and what the engine accepts are one predicate. Targeted abilities are
 * asked about the BEST target available — one that exists — because at sheet
 * time the player has not chosen one yet and "Burrow is unaffordable" must mean
 * "you cannot burrow", not "you have not said what yet".
 *
 * TWO SLOTS FOR TEXT, and the split is ui.md §13.2/§13.3 read literally rather
 * than approximately. `line` is the second line of the row and `note` is the
 * right-hand column under the price. A charge-priced row keeps its effect on the
 * line and puts `Needs 2 charges` in the note (AC-1405j). Stand Down replaces
 * THE EFFECT LINE ITSELF, because both of its unavailable states need a whole
 * sentence and because the two say different things about what to do next:
 *
 *   meter not full          `6 of 10 buffalo segments`   — keep breaking them
 *   full, no buffalo up     `No buffalo on the board`    — ready, nothing to use it on
 *   full, buffalo up        the effect line              — live
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
    const effect = ABILITY_COPY[id].effect;
    // The cost stated in its own unit, which is the rule the pips already
    // follow — a dimmed row showing ●●● looks expensive, a dimmed row showing
    // nothing looks broken (ui.md §13.2).
    const short = fault === ABILITY_METER_LOW
      ? `${state.standDownMeter} of ${STAND_DOWN_SEGMENTS} buffalo segments`
      : fault === ABILITY_NO_CHARGE ? shortfall(spec.cost)
        : fault ? REASON[fault] || 'Unavailable' : null;
    return {
      id,
      species: spec.species,
      scope: spec.scope,
      /** AC-1405h. Read off the engine's table, never re-derived from scope. */
      cost: spec.cost,
      /**
       * AC-1405j / ui.md §13.2: the price renders as PIPS, not a numeral, so
       * the player compares two rows of dots — the cost against the reserve on
       * the button — rather than a number against a number. Stand Down's is
       * empty and its `meter` is the cost column instead (AC-1433).
       */
      costPips: Array.from({ length: spec.cost }, (_, i) => i),
      meter: spec.meter
        ? {
          ticks: meterTicks(state.standDownMeter),
          filled: Math.min(STAND_DOWN_SEGMENTS, state.standDownMeter),
          cap: STAND_DOWN_SEGMENTS,
          /** Gold as soon as it is FULL, including when there is no target:
           *  "ready, nothing to use it on" is a different fact from "not yet". */
          gold: state.standDownMeter >= STAND_DOWN_SEGMENTS,
          label: meterLabel(state.standDownMeter),
        }
        : null,
      needsTarget: spec.target !== null,
      name: ABILITY_COPY[id].name,
      effect,
      /** The second line, always drawn. */
      line: spec.meter && short ? short : effect,
      /** The right-hand note under the price, or null. */
      note: spec.meter ? null : short,
      /**
       * The whole sentence VoiceOver reads, built HERE rather than in the
       * component (§6.7: a label is a claim about what is on screen, and a
       * claim only a device can read is a claim nobody checks).
       *
       * THE PRICE IS SPOKEN IN ITS OWN UNIT. "Costs 0 charges" would tell a
       * screen-reader user that Stand Down was free, which is the confusion
       * §13.2f-vi exists to prevent — so the meter row speaks notches.
       *
       * AND THE PRICE IS NOT SAID TWICE. Stand Down's visible second line IS
       * its price while the meter is filling, so speaking both gave "Stand
       * Down. Zero of ten buffalo segments. 0 of 10 buffalo segments." When the
       * line is the price restated, the EFFECT is spoken in its place; when it
       * is the no-target reason, that is spoken, because the two states need
       * different answers.
       */
      spoken: [
        `${ABILITY_COPY[id].name}.`,
        spec.meter ? meterSentence(state.standDownMeter) : `Costs ${plural(spec.cost, 'charge')}.`,
        fault === ABILITY_METER_LOW || !spec.meter || !short ? effect : `${short}.`,
        !spec.meter && short ? `${short}.` : null,
      ].filter(Boolean).join(' '),
      enabled: fault === null,
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
 * ui.md §13.3 — the targeting chip.
 *
 * Stampede, Dart and Stand Down resolve immediately on arming, so they never
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

/** ui.md §13.4 — `2 MOVES LEFT`, counting down, while a Dart is open. */
export function dartLabel(dart) {
  if (dart <= 0) return null;
  return `${plural(dart, 'MOVE', 'MOVES')} LEFT`;
}

/**
 * What the action bar's status line says. One function, so the bar cannot
 * disagree with the HUD about what the player is being asked to do.
 */
export function turnStatus({ gameOver, resolving, arming, dart }) {
  if (gameOver) return 'RUN OVER';
  if (arming) return 'CHOOSE A TARGET';
  // AC-406: there is no BLOCKED rank any more. The body cannot reach an
  // illegal column, so nothing can raise the announcement — and it could not
  // have been retargeted to contact in any case, because this bar is React and
  // a word appearing mid-drag is a re-render AC-831 forbids.
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
  const usable = rows.filter((r) => r.enabled).length;
  return {
    visible: true,
    /**
     * AC-1415, and the predicate is now `nothing is usable` rather than
     * `charges < the cheapest price`.
     *
     * IT HAD TO CHANGE, and the reason is the whole of the second currency: at
     * zero charges with a full meter and a buffalo on the board the player HAS
     * an ability, and a button muted on a charge count would have told them they
     * had none — in exactly the position Stand Down exists for. `usable` is the
     * engine's own predicate counted, so this cannot disagree with the sheet or
     * with `reduce()` (§6.3); the two conditions it replaces are subsumed
     * because `abilityFault` already faults every row when abilities are off or
     * a Dart is open.
     */
    muted: usable === 0,
    charges: state.charges,
    pips: chargePips(state.charges),
    /** How many of the five are usable right now — the sheet is worth opening. */
    usable,
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

