// AC-14xx — Layer D, the presentation half (ui.md §13), plus its resume.
//
// §6.7's question, asked before the code was written rather than after the
// owner found it: WHAT WOULD THIS LOOK LIKE WRONG WHILE THE STATE IS RIGHT?
//
// Three answers, and all three are tested here rather than on a device:
//
//   1. A Stampede whose animals teleport. Every other x change in this game is
//      already applied by the gesture that caused it, so nothing in the plan
//      carried a horizontal schedule. The board would be right, every position
//      check would pass, and the herd would jump.
//   2. A Dart whose second and third moves replay the first one's animation.
//      The plan's key was the turn number, and a Dart resolves three times
//      inside one turn.
//   3. A Stand Down that reads as eleven events instead of one. Every buffalo
//      ends at one cell and every position check passes; staggered per segment
//      it is 44 units of machine-gun fire, which reads as a bug (AC-1431).
//
// None of those is a position, and none of them would have been caught by
// comparing one.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  ABILITY_CHARGE_CAP, ABILITY_PERCENTILES, BOARD, SPECIES,
} from '../src/engine/constants.js';
import {
  ABILITIES, ABILITY_IDS, STAND_DOWN_SEGMENTS, abilityCost, burrow, migrate, stampede,
} from '../src/engine/abilities.js';
import { ACTIONS, createRun, reduce } from '../src/engine/engine.js';
import {
  ABILITY_COPY,
  EMPTY_PIP_ALPHA,
  LAST_STAND_PIP_ALPHA,
  TARGET_DIM,
  abilityButton,
  abilityRows,
  chargePips,
  dartLabel,
  isTarget,
  meterLabel,
  meterTicks,
  migratableSpecies,
  needsTarget,
  pipAlpha,
  pipBloomTone,
  targetOf,
  targetingChip,
  turnStatus,
} from '../src/ui/abilities.js';
import { buildReplay } from '../src/ui/replay.js';
import { buffaloRate } from '../src/ui/cues.js';
import {
  ABILITY_LABEL_W, ABILITY_W, ACTION_GAP, GUTTER, MIN_TOUCH, RAIL_MIN, RAIL_PAD, STATUS_W,
  actionBarSlots, boardLayout, railSlots, STAGE,
} from '../src/ui/layout.js';
import { HIT, Z, tapAt, topmost } from '../src/ui/stacking.js';
import {
  LOCK_BUDGET_MS, STAMPEDE_BEATS, STAND_DOWN_BEAT, actionLead, stampedeBeats, turnTimeline,
} from '../src/ui/timeline.js';
import { COPY, MOTION } from '../src/ui/theme.js';
import {
  TUNING_SURFACE, buildResume, engineVersionFor, openRun, parseResume, restoreResume,
  serialiseResume,
} from '../src/ui/session.js';
import { runReducer } from '../src/ui/useGameRun.js';
import { chooseAction, chooseCandidate } from '../tools/bot.mjs';
import { animal } from './helpers.js';

/**
 * Play until the run has EARNED a charge, through the public reducer only.
 *
 * The fixtures elsewhere in this file hand `charges` to a state directly, which
 * is fine for a rule but useless for a resume: a replay reconstructs the run
 * from its inputs, so a charge nobody earned is a charge the replay cannot
 * find. Everything below this line has to be reachable by playing.
 */
function playedToCharges(seed, want = 1, maxTurns = 600) {
  let state = openRun({ seed });
  while (state.status === 'READY' && state.turn < maxTurns && state.charges < want) {
    state = runReducer(state, chooseAction(state));
  }
  return state;
}

function board({ animals, charges = 0, ...rest }) {
  const base = createRun({ seed: 'ui-abilities' });
  return { ...base, animals, charges, ...rest };
}

/** A buffalo part-way through its five segments. */
function buffalo(x, y, size) {
  return { ...animal('buffalo', x, y), size };
}

const use = (ability, target) => ({ type: ACTIONS.ABILITY, ability, target });

// ---- AC-1415 · the pips, and the fourth that is not a fourth slot ---------

test('AC-1415 four pips: three banked, and a gold one only Last Stand fills', () => {
  const empty = chargePips(0);
  assert.equal(empty.length, ABILITY_CHARGE_CAP + 1);
  assert.deepEqual(empty.map((p) => p.filled), [false, false, false, false]);
  assert.deepEqual(empty.map((p) => p.gold), [false, false, false, true]);
  // THE DEFECT THIS NOW CATCHES. `restAlpha` was a factor, the component
  // multiplied the gold pip's 0.25 by the 0.55 meant for ordinary empties, and
  // the fourth pip rendered at 13.75% against a specified 25% — while a test
  // asserting `restAlpha === 0.25` passed. So the assertion is on the value
  // that is RENDERED, through the same function the component calls.
  assert.deepEqual(
    empty.map(pipAlpha),
    [EMPTY_PIP_ALPHA, EMPTY_PIP_ALPHA, EMPTY_PIP_ALPHA, LAST_STAND_PIP_ALPHA],
  );
  assert.equal(LAST_STAND_PIP_ALPHA, 0.25);
  assert.deepEqual(chargePips(2).map(pipAlpha), [1, 1, EMPTY_PIP_ALPHA, LAST_STAND_PIP_ALPHA]);

  // Banking to the cap fills three and leaves the gold one empty, because
  // the ladder cannot reach it (AC-1405c).
  assert.deepEqual(
    chargePips(ABILITY_CHARGE_CAP).map((p) => p.filled),
    [true, true, true, false],
  );
  // Only a fourth charge — which only Last Stand can grant — lights it.
  assert.deepEqual(
    chargePips(ABILITY_CHARGE_CAP + 1).map((p) => p.filled),
    [true, true, true, true],
  );
});

test('ui.md §13.1 the gold marks the Last Stand EVENT, not the fourth slot', () => {
  const pips = chargePips(1);
  // The player at 0 charges — AC-1408e's player, the entire reason the grant
  // exists — takes Last Stand on PIP 1. The gold has to go with it. It shipped
  // appearing only when Last Stand overflowed a full reserve, which is the one
  // case that does not need it.
  const lastStandAtZero = [{ reason: 'lastStand', charges: 1 }];
  assert.equal(pipBloomTone(pips[0], lastStandAtZero), 'lastStand');
  assert.equal(pipBloomTone(pips[3], lastStandAtZero), null,
    'the gold stayed on the fourth slot instead of following the event');

  // An ordinary ladder charge landing on the same pip is NOT gold.
  assert.equal(pipBloomTone(pips[0], [{ reason: 'ladder', charges: 1 }]), 'ladder');

  // ...and the fourth SLOT is still reachable only by overflow, so both
  // statements in ui.md §13.1 stay true at once.
  assert.equal(chargePips(ABILITY_CHARGE_CAP)[3].filled, false);
  assert.equal(
    pipBloomTone(chargePips(4)[3], [{ reason: 'lastStand', charges: 4 }]),
    'lastStand',
  );
});

test('AC-1415 at zero charges the button is muted and still there', () => {
  const state = board({ animals: [animal('rat', 0, 0)], charges: 0 });
  const zero = abilityButton(state);
  assert.equal(zero.visible, true, 'the button disappeared at zero charges');
  assert.equal(zero.muted, true);
  assert.equal(zero.usable, 0);
  assert.equal(zero.pips.length, ABILITY_CHARGE_CAP + 1,
    'the pip row changed length, so the bar would reflow');

  const one = abilityButton({ ...state, charges: 1 });
  assert.equal(one.muted, false, 'one charge buys the cheapest ability, so the button is live');
  assert.equal(one.pips.length, zero.pips.length, 'the bar reflows when a charge arrives');
  // AC-1405h: one charge buys Burrow and Dart and nothing else. Stand Down is
  // never in this count at any charge level, because charges do not buy it.
  assert.equal(one.usable, 2);
  assert.equal(abilityButton({ ...state, charges: 2 }).usable, 4);
  assert.equal(abilityButton({ ...state, charges: 3 }).usable, 4);

  // A Dart in progress mutes it too: an ability is the turn's action and the
  // turn's action has already been taken (AC-1406).
  assert.equal(abilityButton({ ...state, charges: 2, dart: 2 }).muted, true);

  // AC-1433's consequence for AC-1415, and it is the reason `muted` is now
  // "nothing is usable" rather than "charges < the cheapest price": at ZERO
  // charges with a full meter and a buffalo on the board the player HAS an
  // ability, and a button muted on a charge count would have told the
  // AC-1408e player — the one the second currency exists for — that they had
  // nothing.
  const armed = abilityButton(board({
    animals: [buffalo(0, 0, 5)], charges: 0, standDownMeter: STAND_DOWN_SEGMENTS,
  }));
  assert.equal(armed.muted, false, 'a full meter at zero charges muted the button');
  assert.equal(armed.usable, 1);
  assert.equal(armed.charges, 0, 'the meter was counted as a charge');
  // ...and a meter one notch short leaves it muted again.
  const short = abilityButton(board({
    animals: [buffalo(0, 0, 5)], charges: 0, standDownMeter: STAND_DOWN_SEGMENTS - 1,
  }));
  assert.equal(short.muted, true);
});

// ---- ui.md §13.2 · the sheet says WHY, it does not merely grey out --------

test('AC-1413 the sheet offers exactly what the engine would accept', () => {
  const animals = [animal('elk', 0, 0), animal('buffalo', 0, 1)];
  const full = { animals, charges: ABILITY_CHARGE_CAP, standDownMeter: STAND_DOWN_SEGMENTS };
  const rows = abilityRows(board(full));
  assert.deepEqual(rows.map((r) => r.id), ['burrow', 'dart', 'migrate', 'stampede', 'standDown']);
  assert.ok(rows.every((r) => r.enabled), 'a row the engine accepts was greyed out');
  for (const row of rows) {
    assert.equal(row.name, ABILITY_COPY[row.id].name);
    assert.ok(row.effect.length > 0);
    assert.equal(row.line.length > 0, true);
    assert.equal(row.species, ABILITIES[row.id].species);
    assert.equal(row.needsTarget, ABILITIES[row.id].target !== null);
  }

  // ...and it states the reason rather than implying it, WITH the price, so a
  // dimmed row reads as expensive rather than broken (AC-1405j).
  const broke = abilityRows(board({ animals, charges: 0 }));
  assert.ok(broke.every((r) => !r.enabled));
  assert.deepEqual(
    broke.map((r) => r.note),
    ['Needs a charge', 'Needs a charge', 'Needs 2 charges', 'Needs 2 charges', null],
  );
  // Stand Down states its price in ITS OWN UNIT, on the effect line, because
  // "Needs 0 charges" would say it was free (ui.md §13.2).
  assert.equal(broke[4].line, `0 of ${STAND_DOWN_SEGMENTS} buffalo segments`);

  // Migrate and Burrow with nothing but a buffalo on the board: both say so
  // specifically (AC-1412b), and the two that need no target stay usable —
  // Stand Down among them, because a buffalo IS its target.
  const buffaloOnly = abilityRows(board({
    animals: [animal('buffalo', 0, 0)],
    charges: ABILITY_CHARGE_CAP,
    standDownMeter: STAND_DOWN_SEGMENTS,
  }));
  for (const id of ['migrate', 'burrow']) {
    const row = buffaloOnly.find((r) => r.id === id);
    assert.equal(row.enabled, false, `${id} offered a buffalo as a target`);
    assert.equal(row.note, 'Nothing to target');
  }
  assert.deepEqual(buffaloOnly.filter((r) => r.enabled).map((r) => r.id),
    ['dart', 'stampede', 'standDown']);
});

test('ui.md §13.2 every row speaks its price in its OWN unit, and says it once', () => {
  // The sheet reads `row.spoken` verbatim, so this is the label a VoiceOver
  // user hears. Two things it must not do: tell them Stand Down "costs 0
  // charges" — which says free, the confusion §13.2f-vi exists to prevent —
  // and say the price twice, which is what happened when the meter's visible
  // second line IS its price.
  const herd = [buffalo(0, 0, 5), animal('rat', 6, 0)];
  const spokenFor = (state, id) => abilityRows(board(state)).find((r) => r.id === id).spoken;

  assert.equal(
    spokenFor({ animals: herd, charges: 0, standDownMeter: 0 }, 'standDown'),
    'Stand Down. Zero of ten buffalo segments. Every buffalo drops to one segment.',
  );
  assert.equal(
    spokenFor({ animals: herd, charges: 0, standDownMeter: STAND_DOWN_SEGMENTS }, 'standDown'),
    'Stand Down. Ten of ten buffalo segments. Every buffalo drops to one segment.',
  );
  assert.equal(
    spokenFor({ animals: [animal('rat', 0, 0)], standDownMeter: STAND_DOWN_SEGMENTS }, 'standDown'),
    'Stand Down. Ten of ten buffalo segments. No buffalo on the board.',
  );
  // Never in charges, at any charge level.
  for (const charges of [0, 1, 2, 3]) {
    const said = spokenFor({ animals: herd, charges, standDownMeter: 4 }, 'standDown');
    assert.ok(!/charge/i.test(said), `the meter row spoke charges: ${said}`);
  }
  // The four charge-priced rows still do, and they agree with `plural()`.
  assert.equal(
    spokenFor({ animals: herd, charges: 0 }, 'burrow'),
    'Burrow. Costs 1 charge. Remove one animal of your choice. Needs a charge.',
  );
  assert.equal(
    spokenFor({ animals: herd, charges: 3 }, 'stampede'),
    'Stampede. Costs 2 charges. Every row slides left, closing the gaps inside it.',
  );

  // The component reads it verbatim rather than assembling one of its own,
  // which is what stops the label and the row drifting apart (§6.7).
  const sheet = readFileSync(new URL('../src/ui/screens/AbilitySheet.js', import.meta.url), 'utf8');
  assert.match(sheet, /accessibilityLabel=\{row\.spoken\}/);
  assert.ok(!/Costs \$\{/.test(sheet), 'the sheet builds a price sentence of its own');
});

test('AC-1421/AC-1433 Stand Down\'s row has three states and never collapses two', () => {
  // ui.md §13.3's table, as data. The middle state is the one a lazier design
  // would fold into the first, and it must not be: a player holding a full
  // meter with an empty board has NOTHING to do about it, and telling them to
  // keep breaking segments would be false.
  const herd = [buffalo(0, 0, 5)];
  const rowFor = (state) => abilityRows(board(state)).find((r) => r.id === 'standDown');

  const filling = rowFor({ animals: herd, standDownMeter: 6 });
  assert.equal(filling.enabled, false);
  assert.equal(filling.line, `6 of ${STAND_DOWN_SEGMENTS} buffalo segments`);
  assert.equal(filling.meter.gold, false, 'a part-filled meter went gold');
  assert.equal(filling.meter.filled, 6);

  const nothingToDo = rowFor({
    animals: [animal('rat', 0, 0)], standDownMeter: STAND_DOWN_SEGMENTS,
  });
  assert.equal(nothingToDo.enabled, false);
  assert.equal(nothingToDo.line, 'No buffalo on the board');
  assert.equal(nothingToDo.meter.gold, true,
    'a full meter with no target reads as not-yet-earned');

  const live = rowFor({ animals: herd, standDownMeter: STAND_DOWN_SEGMENTS });
  assert.equal(live.enabled, true);
  assert.equal(live.line, ABILITY_COPY.standDown.effect);
  assert.equal(live.meter.gold, true);

  // The three lines are genuinely three, which is the whole assertion.
  assert.equal(new Set([filling.line, nothingToDo.line, live.line]).size, 3);
});

test('ui.md §7.1 the meter draws ticks and SPEAKS the numeral', () => {
  // A screen reader cannot count ticks, so the label is the numeral the meter
  // refuses to draw.
  const ticks = meterTicks(6);
  assert.equal(ticks.length, STAND_DOWN_SEGMENTS);
  assert.deepEqual(ticks.map((t) => t.filled).filter(Boolean).length, 6);
  assert.deepEqual(ticks.map((t) => t.index), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(meterLabel(6), 'Stand Down, six of ten.');
  assert.equal(meterLabel(STAND_DOWN_SEGMENTS), 'Stand Down, ten of ten.');
  // The value the meter spends most of a run at, and the one a fixture is least
  // likely to pick: `word(0)` is "no", which is right for the strip's "no
  // buffalo on the board" and not a sentence here.
  assert.equal(meterLabel(0), 'Stand Down, zero of ten.');
  assert.ok(!meterLabel(0).includes(' no '), 'an empty meter reads "no of ten"');
  // It never draws past its cap, however it is asked.
  assert.equal(meterTicks(99).filter((t) => t.filled).length, STAND_DOWN_SEGMENTS);
  assert.equal(meterTicks(-3).filter((t) => t.filled).length, 0);

  // The ticks are SQUARE and the pips are ROUND, and the two are different
  // objects rather than one at two counts (gameplay.md §13.2f-vi).
  const pips = chargePips(1);
  assert.ok(!('index' in pips[0]) || pips.length !== ticks.length,
    'the pip row and the meter became the same shape');
  assert.equal(pips.length, ABILITY_CHARGE_CAP + 1);
});

test('AC-1405h/AC-1405j every row shows its price, and an unaffordable one says so', () => {
  const animals = [animal('elk', 0, 0), animal('rat', 4, 0)];

  // The price is on EVERY row, affordable or not, and it is the engine's own
  // number rather than anything re-derived from scope.
  for (const charges of [0, 1, 2, 3]) {
    for (const row of abilityRows(board({ animals, charges }))) {
      assert.equal(row.cost, abilityCost(row.id), `${row.id} priced itself`);
      assert.equal(row.costPips.length, row.cost,
        `${row.id} renders ${row.costPips.length} cost pips for a cost of ${row.cost}`);
    }
  }

  // AC-1405j: at 1 charge Stampede is unavailable AND says why — "a sheet
  // that hides why a row is unavailable looks broken rather than expensive".
  const atOne = abilityRows(board({ animals, charges: 1 }));
  const stampedeRow = atOne.find((r) => r.id === 'stampede');
  assert.equal(stampedeRow.enabled, false);
  assert.equal(stampedeRow.note, 'Needs 2 charges');
  assert.equal(stampedeRow.costPips.length, 2, 'the cost vanished with the affordability');
  assert.deepEqual(atOne.filter((r) => r.enabled).map((r) => r.id), ['burrow', 'dart']);

  const atTwo = abilityRows(board({ animals, charges: 2 }));
  assert.deepEqual(atTwo.filter((r) => r.enabled).map((r) => r.id),
    ['burrow', 'dart', 'migrate', 'stampede']);
  assert.equal(atTwo.find((r) => r.id === 'burrow').note, null);
  assert.equal(abilityRows(board({ animals, charges: 0 }))[0].note, 'Needs a charge');

  // AC-1433: Stand Down's cost column is the METER and its pip count is zero,
  // at every charge level, because charges are not its price.
  for (const charges of [0, 1, 2, 3]) {
    const row = abilityRows(board({ animals, charges })).find((r) => r.id === 'standDown');
    assert.equal(row.costPips.length, 0, 'Stand Down drew charge pips');
    assert.equal(row.meter.cap, STAND_DOWN_SEGMENTS);
    assert.equal(row.note, null, 'Stand Down stated its price in charges');
  }
});

test('the sheet draws each row at its own species', () => {
  const rows = abilityRows(board({ animals: [animal('rat', 0, 0)], charges: 1 }));
  for (const row of rows) assert.ok(SPECIES[row.species], `${row.id} has no species to draw`);
  // Scope order is species-size order, which is what the sheet is teaching.
  assert.deepEqual(rows.map((r) => r.scope), [1, 2, 3, 4, 5]);
});

// ---- AC-1414 · targeting, and getting out of it --------------------------

test('AC-1414 only Burrow and Migrate target, and each has its own copy', () => {
  assert.equal(needsTarget('burrow'), true);
  assert.equal(needsTarget('migrate'), true);
  for (const id of ['dart', 'stampede', 'standDown']) {
    assert.equal(needsTarget(id), false, `${id} asked for a target it does not need`);
    assert.equal(targetingChip(id), null);
  }
  assert.match(targetingChip('burrow'), /burrow/i);
  assert.match(targetingChip('migrate'), /species/i);
});

test('AC-1412/AC-1414 the board lights the right targets, and only those', () => {
  const rat = animal('rat', 0, 0);
  const buffalo = animal('buffalo', 2, 0);
  // Burrow takes any one animal EXCEPT the buffalo (AC-1412b). It shipped
  // returning true unconditionally, which let one rat charge delete the
  // obstacle the whole of §6.4 is built around.
  assert.equal(isTarget('burrow', rat), true);
  assert.equal(isTarget('burrow', buffalo), false);
  assert.equal(targetOf('burrow', rat), rat.id);
  // Migrate takes a species, and buffalo is not one of them (AC-1412).
  assert.equal(isTarget('migrate', rat), true);
  assert.equal(isTarget('migrate', buffalo), false);
  assert.equal(targetOf('migrate', rat), 'rat');
  // Everything that is not a valid target dims to 45%.
  assert.equal(TARGET_DIM, 0.45);
});

test('migratableSpecies lists what is actually standing there, once each', () => {
  const animals = [animal('rat', 0, 0), animal('elk', 2, 0), animal('rat', 6, 0),
    animal('buffalo', 0, 1)];
  assert.deepEqual(migratableSpecies(animals), ['rat', 'elk']);
  assert.deepEqual(migratableSpecies([]), []);
});

// ---- ui.md §13.4 · the tray, and the Dart counter ------------------------

test('AC-1410b/AC-1427 the tray has ONE state, and the freeze is gone from the tree', () => {
  // A tray state that cannot occur is not history, it is a trap for a reader
  // (AC-1303). So this checks the ABSENCE in the source rather than asserting
  // that a retained `frozenLabel(0)` returns null.
  const ui = readFileSync(new URL('../src/ui/abilities.js', import.meta.url), 'utf8');
  for (const gone of ['frozenLabel', 'trayStripOpacity', 'FROZEN_STRIP_OPACITY']) {
    assert.ok(!ui.includes(gone), `src/ui/abilities.js still carries ${gone}`);
  }
  const tray = readFileSync(new URL('../src/ui/components/Tray.js', import.meta.url), 'utf8');
  assert.ok(!/frozen/i.test(tray.replace(/^\s*\/\/.*$/gm, '')),
    'Tray.js still branches on a freeze');
  const format = readFileSync(new URL('../src/ui/format.js', import.meta.url), 'utf8');
  assert.ok(!format.includes('Nothing arrives for'),
    'format.js still carries the frozen tray sentence');
  const theme = readFileSync(new URL('../src/ui/theme.js', import.meta.url), 'utf8');
  assert.ok(!theme.includes('holdAnnounce'), 'theme.js still carries the hold announce');
  assert.ok(!theme.includes('HOLD_TURNS'), 'theme.js still reads HOLD_TURNS');
  // ...and the replacement announce carries NO number, deliberately: the
  // ability's effect is every buffalo, and a count beside it would be read as
  // the number it reached, which changes every time it fires (AC-1431).
  assert.equal(COPY.standDownAnnounce, 'STAND DOWN');
  assert.ok(!/\d/.test(COPY.standDownAnnounce));
});

test('AC-1407 the bar counts the Dart down, and says MOVE in the singular', () => {
  assert.equal(dartLabel(0), null);
  assert.equal(dartLabel(3), '3 MOVES LEFT');
  assert.equal(dartLabel(1), '1 MOVE LEFT');
});

test('one status line, and the arming state outranks the idle one', () => {
  const base = { gameOver: false, resolving: false, arming: false, dart: 0 };
  assert.equal(turnStatus(base), 'YOUR MOVE');
  assert.equal(turnStatus({ ...base, dart: 2 }), '2 MOVES LEFT');
  assert.equal(turnStatus({ ...base, arming: true }), 'CHOOSE A TARGET');
  // AC-406: there is no BLOCKED state left to rank. A release can no longer be
  // illegal, so nothing can raise the announcement and the branch is gone
  // rather than unreachable.
  assert.equal(turnStatus({ ...base, blocked: true }), 'YOUR MOVE');
  assert.equal(turnStatus({ ...base, resolving: true }), 'RESOLVING…');
  assert.equal(turnStatus({ ...base, gameOver: true }), 'RUN OVER');
  // Game over outranks everything, including an arming state left behind.
  assert.equal(turnStatus({ ...base, gameOver: true, arming: true }), 'RUN OVER');
});

// ---- ui.md §13.1 · the bar holds two buttons and no more chrome ----------

test('AC-114/AC-1415 every action-bar slot survives every supported width', () => {
  // ui.md §13.1 draws two 150 pt buttons and moves the turn-state line into the
  // HUD. Neither survives arithmetic — see `layout.js` — so the bar carries
  // three derived slots and drops the ability LABEL first and the status line
  // second as the screen narrows. This sweeps the whole supported range.
  const offenders = [];
  let droppedLabel = 0;
  let droppedStatus = 0;
  for (let w = 240; w <= 900; w += 1) {
    const layout = boardLayout(w, 900, 0, 0);
    if (layout.stage === STAGE.UNSUPPORTED) continue;
    const slots = actionBarSlots(w);
    const gaps = ACTION_GAP * (slots.showStatus ? 2 : 1);
    const used = slots.statusW + slots.abilityW + slots.passW + gaps;

    if (slots.passW < MIN_TOUCH) offenders.push(`${w}: Pass ${slots.passW} pt`);
    if (slots.abilityW < MIN_TOUCH) offenders.push(`${w}: abilities ${slots.abilityW} pt`);
    if (used > w - GUTTER) offenders.push(`${w}: overflows by ${used - (w - GUTTER)} pt`);
    if (!slots.showAbilityLabel) droppedLabel += 1;
    if (!slots.showStatus) droppedStatus += 1;
    // The status never survives a width the label does not, or the bar would
    // be spending its last points on decoration.
    if (slots.showStatus && !slots.showAbilityLabel && slots.passW < MIN_TOUCH) {
      offenders.push(`${w}: kept the status at the cost of the touch floor`);
    }
  }
  assert.deepEqual(offenders, [], `action bar does not fit: ${offenders.slice(0, 6).join(', ')}`);

  // The reference device keeps everything the design drew.
  const reference = actionBarSlots(393);
  assert.equal(reference.showStatus, true, 'the reference device lost its turn-state line');
  assert.equal(reference.showAbilityLabel, true, 'the reference device lost the ABILITIES label');
  assert.equal(reference.gap, ACTION_GAP);
  assert.ok(reference.passW >= MIN_TOUCH);

  // ...and the degradation is real rather than theoretical: there ARE widths
  // in the supported range where each one drops, or the branch is dead code.
  assert.ok(droppedLabel > 0, 'the label branch is unreachable, so it is untested');
  assert.ok(droppedStatus > 0, 'the status branch is unreachable, so it is untested');
  assert.ok(droppedStatus < droppedLabel, 'the status drops before the label does');
  assert.equal(actionBarSlots(248).abilityW >= ABILITY_W, true);
  // The slots are the named constants and not numbers invented in the
  // component, which is what keeps this sweep about the shipped layout.
  assert.equal(reference.statusW, STATUS_W);
  assert.equal(reference.abilityW, ABILITY_W + ABILITY_LABEL_W);
});

// ---- ui.md §13.1 · and the same question asked of the RAIL ---------------

/**
 * Stage W's abilities button shipped reading `⚡ ABIL…`.
 *
 * The bar measures; the rail did not. `showLabel={column || ...}` treated
 * "this is a rail" as "this is wide", and at the Duo's unfolded width the rail
 * is 158 pt — 134 pt of content against the 156 pt the word needs. ui.md §13
 * already specifies the glyph-only variant "where the bar is too narrow for the
 * word"; the variant existed and nothing chose it. This sweeps every rail the
 * ladder can produce rather than the one width the capture happened to show,
 * which is AC-126's rule: derive from the dimension, never from the device.
 */
test('AC-121/AC-1415 the rail measures its own width before it shows the word', () => {
  const offenders = [];
  let withWord = 0;
  let glyphOnly = 0;
  for (let w = 600; w <= 1600; w += 1) {
    for (const h of [600, 700, 800, 890, 951, 1024, 1200]) {
      const layout = boardLayout(w, h, 42, 34);
      if (layout.stage !== STAGE.WIDE) continue;
      const rail = railSlots(layout.railW);

      // AC-121, and the arithmetic railSlots depends on.
      if (layout.railW < RAIL_MIN) offenders.push(`${w}x${h}: rail ${layout.railW} pt`);
      if (rail.content !== layout.railW - RAIL_PAD * 2) {
        offenders.push(`${w}x${h}: content ${rail.content} is not the padded box`);
      }
      // The abilities control at its smallest must fit, or the glyph-only
      // variant clips too and there is nothing further to fall back to.
      if (rail.content < ABILITY_W) offenders.push(`${w}x${h}: abilities ${rail.content} pt`);
      // AC-121 requires the turn state to be IN the rail, so it gets no drop.
      // That is only honest if it always fits — which is what this asserts, and
      // it is why railSlots carries no `showStatus`: an unreachable branch is
      // untested code.
      if (rail.content < STATUS_W) offenders.push(`${w}x${h}: status ${rail.content} pt`);
      // The word is shown exactly when it fits, and never otherwise.
      if (rail.showAbilityLabel !== (rail.content >= ABILITY_W + ABILITY_LABEL_W)) {
        offenders.push(`${w}x${h}: label ${rail.showAbilityLabel} at ${rail.content} pt`);
      }
      if (rail.showAbilityLabel) withWord += 1; else glyphOnly += 1;
    }
  }
  assert.deepEqual(offenders, [], `the rail does not fit: ${offenders.slice(0, 6).join(', ')}`);

  // Both branches are real rather than theoretical, or one of them is untested.
  assert.ok(glyphOnly > 0, 'no rail is narrow enough to drop the word, so the fix is dead code');
  assert.ok(withWord > 0, 'no rail is wide enough to keep the word');

  // THE REPORTED DEFECT, at the width it was captured at
  // (`duo-unfolded-01-skyline.png`, Slice 6). The dimension lives here rather
  // than in the source, which is AC-126.
  const duo = boardLayout(626, 890, 42, 34);
  assert.equal(duo.stage, STAGE.WIDE);
  assert.equal(duo.railW, 158);
  assert.equal(railSlots(duo.railW).showAbilityLabel, false,
    'the Duo unfolded still picks the word it cannot draw');
  // ...and a rail with room keeps it, so this is a measurement and not a ban.
  assert.equal(railSlots(ABILITY_W + ABILITY_LABEL_W + RAIL_PAD * 2).showAbilityLabel, true);
  assert.equal(railSlots(ABILITY_W + ABILITY_LABEL_W + RAIL_PAD * 2 - 1).showAbilityLabel, false);
});

/**
 * §6.7: a pure function asserted, and nothing asserting what the component does
 * with it, is how the gold pip rendered at 13.75% against a test that passed.
 * `railSlots` is only the fix if the rail actually calls it.
 */
test('AC-1415 the rail reads railSlots rather than assuming a rail is wide', () => {
  const bar = readFileSync(
    new URL('../src/ui/components/ActionBar.js', import.meta.url), 'utf8',
  );
  assert.match(bar, /railSlots\(/, 'ActionBar stopped measuring the rail');
  assert.match(bar, /showLabel=\{column \? rail\.showAbilityLabel : slots\.showAbilityLabel\}/,
    'the abilities label is not chosen from a measurement');
  assert.ok(!/showLabel=\{column \|\|/.test(bar),
    'the rail is back to asserting that it is wide enough for the word');
});

// ---- D1's whole class · what a tap actually REACHES ----------------------

test('AC-1414 a tap on a valid target reaches the target, not the cancel scrim', () => {
  // THE CHECK THAT WAS MISSING. The scrim shipped at zIndex 2 over animals at
  // zIndex 1, with a comment claiming the opposite, and Burrow and Migrate were
  // unreachable by touch for a whole round: every tap on a valid target hit the
  // scrim and was read as "outside any valid target, cancel". `isTarget()` was
  // asserted; nothing asserted that a target could be HIT.
  assert.ok(Z.animal > Z.targetScrim,
    `the targeting scrim (z ${Z.targetScrim}) is over the animals (z ${Z.animal})`);

  const animals = [
    animal('rat', 0, 0), animal('elk', 3, 0), animal('buffalo', 0, 1),
  ];
  for (const arming of ['burrow', 'migrate']) {
    for (const a of animals) {
      // Every cell the animal covers, not just its origin.
      for (let x = a.x; x < a.x + a.size; x += 1) {
        const tap = tapAt(animals, arming, isTarget, x, a.y);
        if (isTarget(arming, a)) {
          assert.equal(tap.hit, HIT.TARGET,
            `${arming}: tapping ${a.type} at ${x},${a.y} did not reach it`);
          assert.equal(tap.id, a.id);
        } else {
          // AC-1414: an animal that is not a valid target is "outside any
          // valid target", so it cancels — it must not swallow the tap.
          assert.equal(tap.hit, HIT.CANCEL,
            `${arming}: tapping the ${a.type} neither targeted nor cancelled`);
        }
      }
    }
  }

  // Empty board space cancels, which is the other half of AC-1414.
  assert.equal(tapAt(animals, 'burrow', isTarget, 7, 5).hit, HIT.CANCEL);
  // Nothing armed, nothing to hit.
  assert.equal(tapAt(animals, null, isTarget, 0, 0).hit, HIT.NONE);
});

test('the topmost layer is decided by z first and document order second', () => {
  // The tie-break the board actually relies on: the scrim and the ground share
  // z=0 and are separated only by being painted later.
  assert.equal(
    topmost([
      { z: 0, order: 0, hit: HIT.CANCEL },
      { z: 0, order: 3, hit: HIT.TARGET },
    ]).hit,
    HIT.TARGET,
  );
  assert.equal(
    topmost([
      { z: 1, order: 0, hit: HIT.TARGET },
      { z: 0, order: 9, hit: HIT.CANCEL },
    ]).hit,
    HIT.TARGET,
  );
  // A layer that takes no touches is not a candidate however high it sits.
  assert.equal(
    topmost([
      { z: 99, order: 9, hit: HIT.NONE },
      { z: 0, order: 0, hit: HIT.CANCEL },
    ]).hit,
    HIT.CANCEL,
  );
  assert.equal(topmost([]).hit, HIT.NONE);
});

test('ui.md §13.3 a valid target is NOT dimmed, and everything else is', () => {
  // D2, which was D1 wearing a different hat: with the scrim painted over the
  // animals, "everything dims except valid targets" rendered as "everything
  // dims, valid targets included" — and under Burrow, where every ordinary
  // animal is valid, there was no visual distinction on screen at all.
  const rat = animal('rat', 0, 0);
  const buffalo = animal('buffalo', 2, 0);
  const dimOf = (ability, a) => (isTarget(ability, a) ? 1 : TARGET_DIM);
  assert.equal(dimOf('burrow', rat), 1, 'a valid Burrow target is dimmed');
  assert.equal(dimOf('burrow', buffalo), TARGET_DIM);
  assert.equal(dimOf('migrate', rat), 1);
  assert.equal(dimOf('migrate', buffalo), TARGET_DIM);
  // And the distinction exists at all — under Burrow it used to be a no-op.
  assert.notEqual(dimOf('burrow', rat), dimOf('burrow', buffalo));
});

// ---- AC-1417 · the input-lock budget still holds -------------------------

test('AC-1411 the Stampede slide is staggered from the bottom up, and capped', () => {
  const moved = [
    { id: 'c', y: 5, fromX: 4, toX: 0 },
    { id: 'a', y: 0, fromX: 3, toX: 0 },
    { id: 'b', y: 2, fromX: 7, toX: 1 },
  ];
  const beats = stampedeBeats(moved);
  // Bottom-up: row 0 first, then 2, then 5. Not the order they arrived in.
  assert.equal(beats.get(0), 0);
  assert.equal(beats.get(2), MOTION.stampedeStagger);
  assert.equal(beats.get(5), MOTION.stampedeStagger * 2);

  // The span is capped, or fifteen rows would be 1,680 ms of stagger inside a
  // 1,500 ms budget and the whole turn would be scaled to the floor.
  const tall = Array.from({ length: 12 }, (_, y) => ({ id: `t${y}`, y, fromX: 4, toX: 0 }));
  const capped = stampedeBeats(tall);
  assert.equal(
    Math.max(...capped.values()),
    MOTION.stampedeStagger * (STAMPEDE_BEATS - 1),
  );
});

test('AC-1417 an ability turn still fits the input-lock budget', () => {
  const rows = [];
  for (let x = 0; x < BOARD.width; x += 2) rows.push(animal('rat', x, 0));
  const animals = rows.concat([animal('elk', 0, 1), animal('fox', 5, 2)]);

  for (const [id, target] of [['stampede', undefined], ['burrow', animals[0].id],
    ['migrate', 'rat'], ['standDown', undefined]]) {
    const state = board({
      animals: id === 'standDown' ? animals.concat(buffalo(0, 3, 5)) : animals,
      charges: ABILITY_CHARGE_CAP,
      standDownMeter: STAND_DOWN_SEGMENTS,
    });
    const next = reduce(state, use(id, target));
    assert.notEqual(next.lastAction.type, 'REJECTED', id);
    const timeline = turnTimeline(next.lastTurn.events, next.lastTurn.action, 0);
    assert.ok(timeline.lockMs <= LOCK_BUDGET_MS,
      `${id}: ${timeline.lockMs} ms exceeds the ${LOCK_BUDGET_MS} ms budget`);
    // The ability's own beat is INSIDE the scaled timeline, not added to it.
    assert.ok(timeline.settleFallAt <= timeline.lockMs, `${id}: the lead outran the lock`);
  }

  // Dart moves nothing, so it costs the timeline nothing.
  assert.equal(actionLead([{ type: 'ACTION', action: 'ABILITY', ability: 'dart',
    removedIds: [], moved: [], shrunk: [] }], 'ABILITY'), 0);
  assert.equal(actionLead([{ type: 'ACTION', action: 'MOVE' }], 'MOVE'), MOTION.snap);
  assert.equal(actionLead([{ type: 'ACTION', action: 'PASS' }], 'PASS'), 0);

  // AC-1428: Burrow's lead is the dissolve AND THEN the pack, because gravity
  // may not fall into the hole before the row has closed — but only when the
  // pack actually moves something.
  const dissolveOnly = [{ type: 'ACTION', action: 'ABILITY', ability: 'burrow',
    removedIds: ['a'], moved: [], shrunk: [] }];
  const withPack = [{ type: 'ACTION', action: 'ABILITY', ability: 'burrow',
    removedIds: ['a'], moved: [{ id: 'b', y: 0, fromX: 4, toX: 2 }], shrunk: [] }];
  assert.equal(actionLead(dissolveOnly, 'ABILITY'), MOTION.burrow);
  assert.equal(actionLead(withPack, 'ABILITY'), MOTION.burrow + MOTION.burrowPack);
  assert.equal(MOTION.burrow + MOTION.burrowPack, 400, 'ui.md §13.4 asks for 400 ms total');

  // AC-1431: Stand Down's lead is the whole beat — crack at 180, spring from
  // 380 — because up to 44 cells are freed and gravity must not claim one
  // before its buffalo has finished narrowing out of it.
  const standingDown = [{ type: 'ACTION', action: 'ABILITY', ability: 'standDown',
    removedIds: [], moved: [], shrunk: [{ id: 'b', fromSize: 5, toSize: 1 }] }];
  assert.equal(actionLead(standingDown, 'ABILITY'), STAND_DOWN_BEAT);
  assert.equal(STAND_DOWN_BEAT, 640, 'ui.md §13.4a asks for 640 ms before gravity');
  assert.equal(MOTION.standDownCrackAt, 180);
  assert.equal(MOTION.standDownCrack, 200);
  assert.equal(MOTION.standDownSpringAt, 380);
  // The announce's 0 -> 260 overlaps the crack by 80 ms on purpose: sequenced
  // end to end the beat is 720 ms, which does not fit the budget beside a
  // cascade.
  assert.ok(MOTION.standDownCrackAt < 260, 'the announce and the crack stopped overlapping');
  assert.equal(260 - MOTION.standDownCrackAt, 80);
});

// ---- the replay plan: what would look wrong while the state is right -----

test('AC-1417/AC-822 the ONLY way past the budget is Stand Down at the 6-unit cap', () => {
  // REPORTED RATHER THAN TUNED AWAY, and this is the executable form of it.
  //
  // `turnTimeline` scales the whole turn to min(1500, rawMs) — but the scale has
  // a 0.55 floor (AC-824), so a turn whose natural length exceeds 1500/0.55 =
  // 2,727 ms cannot be compressed into the budget. Stand Down's 640 ms beat is
  // the first ACTION lead large enough to push a worst-case cascade past that:
  // 640 + 200 + a 3/3 cascade is 2,890 ms, which floors at 0.55 and locks for
  // 1,590 — 90 ms over AC-822. Three ACs are in tension and none of them is
  // mine to move: AC-822's cap, AC-824's floor, and AC-1431's beat.
  //
  // What this test does is BOUND it: nothing else can exceed, the excess is
  // small, and the next change that makes it worse fails here.
  const steps = (phase, n) => Array.from(
    { length: n }, (_, i) => ({ type: 'CLEAR_STEP', phase, step: i + 1 }),
  );
  const ability = (o) => ({
    type: 'ACTION', action: 'ABILITY', ability: o.a,
    removedIds: o.r || [], moved: o.m || [], shrunk: o.s || [],
  });
  const leads = [
    ['PASS', { type: 'ACTION', action: 'PASS' }, 'PASS'],
    ['MOVE', { type: 'ACTION', action: 'MOVE' }, 'MOVE'],
    ['migrate', ability({ a: 'migrate', r: ['x'] }), 'ABILITY'],
    ['burrow', ability({ a: 'burrow', r: ['x'], m: [{ id: 'y', y: 0, fromX: 4, toX: 2 }] }), 'ABILITY'],
    ['stampede', ability({
      a: 'stampede', m: [0, 1, 2, 3].map((y) => ({ id: `y${y}`, y, fromX: 4, toX: 2 })),
    }), 'ABILITY'],
    ['standDown', ability({ a: 'standDown', s: [{ id: 'b', fromSize: 5, toSize: 1 }] }), 'ABILITY'],
  ];
  const lockFor = (lead, kind, settle, arrival) => turnTimeline(
    [lead, ...steps('SETTLE', settle), ...steps('ARRIVAL', arrival)], kind, 0,
  ).lockMs;

  for (const [name, lead, kind] of leads) {
    for (const [settle, arrival] of [[0, 0], [1, 0], [2, 1], [3, 2]]) {
      assert.ok(lockFor(lead, kind, settle, arrival) <= LOCK_BUDGET_MS,
        `${name} at ${settle}/${arrival}: ${lockFor(lead, kind, settle, arrival)} ms`);
    }
    // The full 3/3 cap: every lead but Stand Down still fits.
    const capped = lockFor(lead, kind, 3, 3);
    if (name !== 'standDown') {
      assert.ok(capped <= LOCK_BUDGET_MS, `${name} at the 6-unit cap: ${capped} ms`);
    } else {
      assert.ok(capped > LOCK_BUDGET_MS, 'the overrun has gone — delete this arm and report it');
      assert.ok(capped <= LOCK_BUDGET_MS + 100,
        `the Stand Down overrun grew to ${capped} ms, which is no longer a rounding of the floor`);
      // ...and the floor is what makes it 1,590 rather than 1,500. Lowering
      // AC-824's 0.55 would hide this arithmetic while making every deep
      // cascade unreadable, so the floor is pinned where the overrun is.
      const capTimeline = turnTimeline(
        [lead, ...steps('SETTLE', 3), ...steps('ARRIVAL', 3)], kind, 0,
      );
      assert.equal(capTimeline.scale, 0.55,
        `the scale floor moved to ${capTimeline.scale}, which is AC-824's number`);
    }
  }
});

test('AC-822 no turn a bot can actually reach exceeds the input-lock budget', () => {
  // The arithmetic above says the worst case is reachable in PRINCIPLE. This
  // asks whether play reaches it, which is the question that decides whether
  // the overrun is a defect or a corner: over 18,209 turns on 200 seeds with
  // the whole roster, ZERO turns exceeded and the worst seen was exactly 1,500.
  // Twenty-five seeds here, for the suite's sake; re-run wide before trusting a
  // change to Stand Down's beat.
  let turns = 0;
  let over = 0;
  let worst = 0;
  for (let seed = 1; seed <= 25; seed += 1) {
    let state = createRun({ seed, abilities: true });
    while (state.status === 'READY' && state.turn < 3000) {
      const action = chooseCandidate(state, { allow: ABILITY_IDS });
      let next = reduce(state, action);
      if (next.lastAction && next.lastAction.type === 'REJECTED') {
        next = reduce(state, chooseAction(state));
      }
      if (next.lastTurn) {
        const lock = turnTimeline(next.lastTurn.events, next.lastTurn.action, 0).lockMs;
        turns += 1;
        if (lock > LOCK_BUDGET_MS) over += 1;
        worst = Math.max(worst, lock);
      }
      state = next;
    }
  }
  assert.ok(turns > 1500, `only ${turns} turns swept`);
  assert.equal(over, 0, `${over} of ${turns} turns exceeded the ${LOCK_BUDGET_MS} ms budget`);
  assert.ok(worst <= LOCK_BUDGET_MS, `worst measured lock ${worst} ms`);
});

test('AC-1411 the plan carries a horizontal schedule, so the herd does not teleport', () => {
  const animals = [animal('rat', 4, 0), animal('elk', 6, 0), animal('fox', 3, 1)];
  const state = board({ animals, charges: abilityCost('stampede'), queue: [] });
  const next = reduce(state, use('stampede'));
  const plan = buildReplay(state.animals, next.lastTurn, 0);

  const slid = animals.filter((a) => plan.moves[a.id] && plan.moves[a.id].slide);
  assert.ok(slid.length >= 2, 'the Stampede produced no slide schedule at all');
  for (const a of slid) {
    const slide = plan.moves[a.id].slide;
    assert.ok(slide.dur > 0, `${a.type} slides in zero time, which is a teleport`);
    assert.notEqual(slide.fromX, slide.toX);
    assert.equal(slide.toX, next.animals.find((n) => n.id === a.id).x,
      'the slide does not end where the engine put the animal');
  }
  // Row 0 leads and row 1 follows: the herd moves from the bottom up.
  const rowOf = (type) => plan.moves[animals.find((a) => a.type === type).id].slide.at;
  assert.ok(rowOf('rat') < rowOf('fox'), 'the upper row did not follow the lower one');
  // The shared clock outlasts the slide, or an animal freezes short of home.
  assert.ok(plan.clockMs >= Math.max(...slid.map((a) => {
    const s2 = plan.moves[a.id].slide;
    return s2.at + s2.dur;
  })));
});

test('AC-1401 a burrowed animal leaves as a departure, not as a disappearance', () => {
  const animals = [animal('rat', 0, 0), animal('elk', 3, 0)];
  const state = board({ animals, charges: abilityCost('burrow'), queue: [] });
  const next = reduce(state, use('burrow', animals[1].id));
  const plan = buildReplay(state.animals, next.lastTurn, 0);

  const gone = plan.departures.filter((d) => d.id === animals[1].id);
  assert.equal(gone.length, 1, 'the burrowed animal vanished between frames');
  assert.equal(gone[0].x, animals[1].x, 'it left from somewhere it never stood');
  assert.equal(plan.moves[animals[1].id], undefined,
    'an animal that has left is still carrying a motion record');
});

test('AC-1428 the burrowed row closes up ONE beat after the dissolve', () => {
  // ui.md §13.4: the pack runs AFTER the dissolve, so the two halves read as
  // cause and effect — this leaves, and then the row closes. And it is one
  // beat, not a stagger: Stampede's stagger exists to read as fifteen rows in
  // sequence, and a staggered one-row slide is a stagger nobody perceives.
  const animals = [animal('rat', 0, 0), animal('fox', 2, 0), animal('elk', 5, 0)];
  const state = board({ animals, charges: abilityCost('burrow'), queue: [] });
  const next = reduce(state, use('burrow', animals[1].id));
  const plan = buildReplay(state.animals, next.lastTurn, 0);

  const slid = plan.moves[animals[2].id];
  assert.ok(slid && slid.slide, 'the row did not close, so the board would teleport');
  const { scale } = turnTimeline(next.lastTurn.events, next.lastTurn.action, 0);
  assert.equal(slid.slide.at, MOTION.burrow * scale, 'the pack ran during the dissolve');
  assert.equal(slid.slide.dur, MOTION.burrowPack * scale);
  assert.equal(slid.slide.fromX, 5);
  assert.equal(slid.slide.toX, 1);
  // ONE start time across every animal the pack moved — the stagger is absent
  // rather than merely short.
  const starts = new Set(Object.values(plan.moves)
    .filter((m) => m.slide).map((m) => m.slide.at));
  assert.equal(starts.size, 1, 'the one-row pack was staggered');
});

test('AC-1431 Stand Down is ONE event, not eleven, and it pays no points', () => {
  // Four buffalo losing thirteen segments between them. Every crack is at the
  // same instant and every spring is at the same instant; per-segment or
  // per-buffalo staggering here is 44 units and is AC-1411b's error repeated.
  const herd = [buffalo(0, 0, 5), buffalo(5, 0, 4), buffalo(0, 1, 3), buffalo(4, 1, 2)];
  const state = board({
    animals: herd, standDownMeter: STAND_DOWN_SEGMENTS, queue: [],
  });
  const next = reduce(state, use('standDown'));
  assert.notEqual(next.lastAction.type, 'REJECTED');
  const plan = buildReplay(state.animals, next.lastTurn, 0, state.standDownMeter);
  const { scale } = turnTimeline(next.lastTurn.events, next.lastTurn.action, 0);

  // EVERY spent segment cracks — a size-5 buffalo loses four panels here where
  // a completed row takes one — and all of them at one time.
  const standDownShards = plan.shards.filter((sh) => sh.key.includes('@standDown'));
  assert.equal(standDownShards.length, (5 - 1) + (4 - 1) + (3 - 1) + (2 - 1));
  assert.deepEqual([...new Set(standDownShards.map((sh) => sh.at))],
    [MOTION.standDownCrackAt * scale], 'the crack was staggered');
  assert.deepEqual([...new Set(standDownShards.map((sh) => sh.dur))],
    [MOTION.standDownCrack * scale], 'the crack is not the specified 200 ms beat');
  // Each panel is a distinct cell of the body it came off, so eleven buffalo do
  // not draw eleven shards on top of each other.
  const cells = standDownShards.map((sh) => `${sh.id}:${sh.x}`);
  assert.equal(new Set(cells).size, cells.length, 'two panels were drawn in one cell');

  // Bodies spring on ONE clock, and it is §5.3's existing shrink.
  const springs = herd.map((b) => plan.moves[b.id]).filter((m) => m && m.size);
  assert.equal(springs.length, 4, 'a buffalo did not spring to one cell');
  assert.deepEqual([...new Set(springs.map((m) => m.size.at))],
    [MOTION.standDownSpringAt * scale], 'the spring was staggered');
  assert.deepEqual([...new Set(springs.map((m) => m.size.to))], [1]);
  assert.deepEqual([...new Set(springs.map((m) => m.size.dur))],
    [MOTION.buffaloShrink * scale]);

  // AC-1431b: the announce, and NOTHING else. No `-4`, no per-buffalo number:
  // eleven floating numbers that all say nothing would be the loudest moment in
  // the game attached to the one event that pays no points.
  assert.deepEqual(plan.floats.map((f) => f.text), [COPY.standDownAnnounce]);
  assert.equal(plan.floats[0].at, 0);
  assert.equal(plan.score, null, 'Stand Down started the score count-up');

  // AC-1431d: ONE cue, not eleven, at the pitch of the LARGEST buffalo before
  // it fired — so the sound reports the size of what was broken.
  const metal = plan.cues.filter((c) => c.cue === 'shrink');
  assert.equal(metal.length, 1, `${metal.length} strikes for four buffalo`);
  assert.equal(metal[0].at, MOTION.standDownCrackAt * scale);
  assert.equal(metal[0].rate, buffaloRate(5, SPECIES.buffalo.size));
  // Nothing else in that 380 ms window: §15.6's collision rule is satisfied by
  // there being nothing to collide with. Whatever gravity's settle adds comes
  // after the spring.
  for (const cue of plan.cues) {
    if (cue.cue === 'shrink') continue;
    assert.ok(cue.at >= MOTION.standDownSpringAt * scale,
      `a ${cue.cue} cue fired inside Stand Down's own beat`);
  }
  assert.equal(buffaloRate(SPECIES.buffalo.size, SPECIES.buffalo.size), 1,
    'a full buffalo is no longer the pitch the sample is voiced at');
  assert.ok(buffaloRate(2, SPECIES.buffalo.size) > buffaloRate(4, SPECIES.buffalo.size),
    'ui.md §15.2: pitch must FALL as size rises');
});

test('ui.md §7.1 the meter fills on the board\'s clock and drains on the spring\'s', () => {
  // A tick fills at the moment the segment it counts cracks (AC-509b's rule
  // applied to the HUD), and the meter drains as part of Stand Down's beat so
  // the player sees the cost paid in the same breath as the effect.
  const row = [buffalo(0, 0, 5), buffalo(5, 0, 4)];
  const filling = board({ animals: row, queue: [], standDownMeter: 3 });
  const cleared = reduce(filling, { type: ACTIONS.PASS });
  const plan = buildReplay(filling.animals, cleared.lastTurn, 0, filling.standDownMeter);
  assert.equal(cleared.standDownMeter, 5);
  assert.deepEqual(plan.meter.fills.map((f) => f.index), [3, 4],
    'the ticks that filled are not the ones the engine filled');
  assert.equal(plan.meter.to, 5);
  assert.equal(plan.meter.drainAt, null, 'a clearing turn drained the meter');
  // Each fill is on the CLEAR STEP's own collapse, not on a clock of its own.
  const collapses = new Set(turnTimeline(cleared.lastTurn.events, cleared.lastTurn.action, 0)
    .units.map((u) => u.collapseAt));
  for (const fill of plan.meter.fills) {
    assert.ok(collapses.has(fill.at), `a tick filled at ${fill.at}, off the board's clock`);
  }

  // Spending drains all ten, on the spring's clock.
  const spent = board({ animals: [buffalo(0, 0, 5)], queue: [], standDownMeter: STAND_DOWN_SEGMENTS });
  const used = reduce(spent, use('standDown'));
  const drained = buildReplay(spent.animals, used.lastTurn, 0, spent.standDownMeter);
  const { scale } = turnTimeline(used.lastTurn.events, used.lastTurn.action, 0);
  assert.equal(drained.meter.drainAt, MOTION.standDownSpringAt * scale);
  assert.equal(drained.meter.to, 0);
  assert.deepEqual(drained.meter.fills, [], 'the ability refilled its own meter');
});

test('ui.md §7.1 a retirement fills its notch, on the turn the chip leaves', () => {
  // A buffalo going from 1 to retired is a shrink AND a departure, and the
  // engine counts it as one notch. The plan's fill loop sits ABOVE the
  // retirement guard for exactly that reason — below it, the drawn meter and
  // the engine's meter would part company on the one turn a player finally
  // retires a buffalo.
  const animals = [buffalo(0, 0, 1)];
  for (let x = 1; x < BOARD.width; x += 1) animals.push(animal('rat', x, 0));
  const state = board({ animals, queue: [], standDownMeter: 2 });
  const next = reduce(state, { type: ACTIONS.PASS });
  assert.equal(next.stats.buffaloRetired, 1, 'the fixture did not retire the buffalo');
  const plan = buildReplay(state.animals, next.lastTurn, 0, state.standDownMeter);
  assert.equal(next.standDownMeter, 3);
  assert.deepEqual(plan.meter.fills.map((f) => f.index), [2]);
  assert.equal(plan.meter.to, next.standDownMeter,
    'the drawn meter and the engine\'s meter disagree after a retirement');
});

test('AC-1412 a migrated species flashes in unison before it leaves', () => {
  const animals = [animal('rat', 0, 0), animal('rat', 4, 0), animal('elk', 6, 0)];
  const state = board({ animals, charges: abilityCost('migrate'), queue: [] });
  const next = reduce(state, use('migrate', 'rat'));
  const plan = buildReplay(state.animals, next.lastTurn, 0);

  const rats = plan.departures.filter((d) => d.type === 'rat');
  assert.equal(rats.length, 2);
  // In unison: one start time, not two. A stagger here would read as the
  // species being picked off rather than leaving together.
  assert.equal(new Set(rats.map((d) => d.collapseAt)).size, 1);
  assert.equal(new Set(rats.map((d) => d.flashAt)).size, 1);
  assert.ok(rats[0].collapseAt > rats[0].flashAt, 'the flash and the leaving are one beat');
  assert.equal(plan.departures.filter((d) => d.type === 'elk').length, 0);
});

test('AC-1407 each Dart move gets its own plan key, so the clock restarts', () => {
  const animals = [animal('rat', 0, 0)];
  let live = reduce(board({ animals, charges: abilityCost('dart'), queue: [] }), use('dart'));
  const keys = [];
  for (const x of [4, 7, 2]) {
    const before = live;
    live = reduce(live, { type: ACTIONS.MOVE, id: animals[0].id, x });
    keys.push(buildReplay(before.animals, live.lastTurn, 0).key);
  }
  assert.equal(new Set(keys).size, 3,
    `two Dart moves share a plan key (${keys.join(', ')}), so the second replays the first`);
});

test('AC-1405/AC-1408b the plan carries the charge grants, and says which is which', () => {
  const column = [];
  for (let y = 0; y <= BOARD.dangerBandLow - 1; y += 1) column.push(animal('rat', 0, y));
  const state = board({ animals: column, queue: [animal('rat', 0, 0)], ladder: 6 });
  const next = reduce(state, { type: ACTIONS.PASS });
  const plan = buildReplay(state.animals, next.lastTurn, 0);

  assert.equal(plan.grants.length, 1);
  assert.equal(plan.grants[0].reason, 'lastStand');
  assert.equal(plan.grants[0].charges, 1);
  // It lands when the push-up lands, which is the moment the danger band
  // lights — so the warning and the help read as one event (ui.md §13.4).
  assert.ok(plan.grants[0].at > 0);
  assert.equal(new Set(plan.grants.map((g) => g.key)).size, plan.grants.length);
});

// ---- AC-1416 / AC-1014b · the resume reconstructs charges ---------------

test('AC-1416 an ability use is a third move type and nothing new is persisted', () => {
  let state = playedToCharges('resume-ability', abilityCost('burrow'));
  assert.equal(state.status, 'READY', 'the run ended before it earned anything');
  assert.ok(state.charges >= abilityCost('burrow'), 'the run never earned enough to spend');
  const victim = state.animals.find((a) => a.type !== 'buffalo');
  state = runReducer(state, use('burrow', victim.id));
  state = runReducer(state, chooseAction(state));

  const record = buildResume(state);
  assert.ok(record.moves.some((m) => m.t === 'A'), 'the ability use is not in the move log');
  assert.equal(record.moves.find((m) => m.t === 'A').a, 'burrow');
  assert.equal(record.moves.find((m) => m.t === 'A').target, victim.id,
    'the target is not in the move log, so the replay cannot reproduce the board');
  // Nothing new is persisted: the record has exactly the fields it had before.
  assert.deepEqual(
    Object.keys(record).sort(),
    ['digest', 'engineVersion', 'moves', 'schemaVersion', 'seed', 'start'],
  );
  assert.equal(record.charges, undefined, 'the charge count was persisted');
  assert.equal(record.lastStand, undefined, 'Last Stand was persisted');

  const back = restoreResume(serialiseResume(record));
  assert.ok(back, 'a run containing an ability use could not be resumed');
  assert.equal(back.charges, state.charges);
  assert.deepEqual(back.animals, state.animals, 'the burrowed animal came back');
});

test('AC-1416 a Dart replays as an arming plus its moves', () => {
  let state = playedToCharges('resume-dart', abilityCost('dart'));
  assert.equal(state.status, 'READY');
  assert.ok(state.charges >= abilityCost('dart'));

  state = runReducer(state, use('dart'));
  assert.equal(state.dart, 3, 'the Dart did not open');
  state = runReducer(state, chooseAction(state));
  assert.equal(state.dart, 2, 'the Dart did not survive its first move');
  state = runReducer(state, { type: ACTIONS.PASS });
  assert.equal(state.dart, 0, 'the Dart did not close');

  const record = buildResume(state);
  const tail = record.moves.slice(-3).map((m) => m.t);
  assert.deepEqual(tail, ['A', 'M', 'P'],
    `arming the Dart was not logged (${tail.join(',')}), so the replay would hold a charge it spent`);

  const back = restoreResume(serialiseResume(record));
  assert.ok(back, 'a run containing a Dart could not be resumed');
  assert.equal(back.charges, state.charges);
  assert.deepEqual(back.animals, state.animals);
});

test('AC-1416/AC-1433 charges, the ladder, the meter and Last Stand all come back', () => {
  let state = playedToCharges('resume-economy', abilityCost('migrate'));
  assert.equal(state.status, 'READY');
  for (let i = 0; i < 12 && state.status === 'READY'; i += 1) {
    state = state.charges >= abilityCost('stampede') && state.dart === 0
      ? runReducer(state, use('stampede'))
      : runReducer(state, chooseAction(state));
  }
  assert.equal(state.status, 'READY', 'the run ended, and a finished run is not resumed');
  assert.ok(state.stats.chargesEarned > 0, 'the run earned nothing, so nothing was proved');

  const back = restoreResume(serialiseResume(buildResume(state)));
  assert.ok(back, 'the run could not be resumed');
  assert.equal(back.charges, state.charges, 'charges were not reconstructed');
  assert.equal(back.ladder, state.ladder, 'the ladder position was not reconstructed');
  assert.equal(back.lastStand, state.lastStand, 'Last Stand was not reconstructed');
  // AC-1433: the meter is reconstructed by REPLAY like everything else, and
  // nothing new is stored for it — `buffaloShrinks` was already in the stream.
  assert.equal(back.standDownMeter, state.standDownMeter, 'the meter was not reconstructed');
  assert.equal(back.score, state.score);
  assert.equal(back.stats.abilitiesUsed, state.stats.abilitiesUsed);
  assert.ok(!JSON.stringify(buildResume(state)).includes('standDownMeter'),
    'the meter was persisted rather than replayed');
});

test('AC-1433 the meter survives a resume on a run that actually filled it', () => {
  // The test above resumes whatever meter the run happened to reach, which on
  // a short seed is 0 — and a reconstructed 0 proves nothing. This one plays
  // until the herd has been worked, so the number that comes back is real.
  let state = openRun({ seed: 'resume-meter' });
  while (state.status === 'READY' && state.turn < 600 && state.standDownMeter < 4) {
    state = runReducer(state, chooseAction(state));
  }
  assert.ok(state.standDownMeter >= 4, `the run only reached ${state.standDownMeter} notches`);
  const back = restoreResume(serialiseResume(buildResume(state)));
  assert.ok(back, 'the run could not be resumed');
  assert.equal(back.standDownMeter, state.standDownMeter);
});

test('AC-1014b/AC-1014c the record carries `abilities`, and a restart proves it', () => {
  // AC-1014c: carried state stays hidden until something carries it, so this
  // has to reach the SECOND run of the session. A measurement run and a played
  // run reach different boards from the same seed and the same moves — the
  // measurement never grants a charge — so a record that omitted the switch
  // would resume one as the other.
  let state = openRun({ seed: 'carried', abilities: false });
  for (let i = 0; i < 5; i += 1) state = runReducer(state, { type: ACTIONS.PASS });
  state = runReducer(state, { type: ACTIONS.RESTART, seed: 'carried-2' });
  assert.equal(state.abilities, false, 'the switch did not survive a restart');
  for (let i = 0; i < 5; i += 1) state = runReducer(state, { type: ACTIONS.PASS });

  const record = buildResume(state);
  assert.equal(record.start.abilities, false,
    'the record dropped an input createRun consumes (AC-1014b)');
  const back = restoreResume(serialiseResume(record));
  assert.ok(back, 'the restarted measurement run could not be resumed');
  assert.equal(back.abilities, false);

  // A record whose switch is missing is not a record.
  const stripped = JSON.parse(serialiseResume(record));
  delete stripped.start.abilities;
  assert.equal(restoreResume(JSON.stringify(stripped)), null,
    'a record missing an engine input was accepted');
});

test('AC-1016 repricing the ladder invalidates every resume written before it', () => {
  // The claim the tuning surface makes, executed rather than asserted: a
  // retune of §13.2c must not silently rebuild a DIFFERENT run from the same
  // moves. The surface is rehashed from a copy with one rung moved.
  const before = engineVersionFor(TUNING_SURFACE);
  const reprice = TUNING_SURFACE.map((entry) => (
    Array.isArray(entry) && entry.length === ABILITY_PERCENTILES.length
      && entry.every((v) => typeof v === 'number')
      ? [1, ...entry.slice(1)]
      : entry
  ));
  assert.notEqual(engineVersionFor(reprice), before,
    'the ability ladder is not in the engine fingerprint');

  // ...and so does changing what an ability DOES, which is the sharper case:
  // every stored move still applies, into a completely different board, and
  // the player resumes somebody else's run with no way to tell. HOLD_TURNS and
  // DART_MOVES are both 3 in the surface; moving either has to change the hash.
  const rerule = TUNING_SURFACE.map((entry) => (entry === 3 ? 4 : entry));
  assert.notEqual(engineVersionFor(rerule), before,
    'the ability constants are not in the engine fingerprint');
  assert.ok(TUNING_SURFACE.includes(3), 'the ability constants left the surface');

  // AC-1433: the meter's own constant is in the surface too, so moving it off
  // 10 — the one lever §13.2f-ii names — discards every resume written at 10.
  const remeter = TUNING_SURFACE.map((entry) => (entry === STAND_DOWN_SEGMENTS ? 12 : entry));
  assert.notEqual(engineVersionFor(remeter), before,
    'STAND_DOWN_SEGMENTS is not in the engine fingerprint');

  // AC-1430b: BURROW'S COST DID NOT MOVE, so `packs` is the only thing that can
  // tell the surface its effect did. This is the assertion that would fail if
  // somebody "tidied" the flag away as redundant with the code.
  const unpacked = TUNING_SURFACE.map((entry) => (
    entry && entry.burrow && entry.burrow.packs
      ? { ...entry, burrow: { ...entry.burrow, packs: undefined } }
      : entry
  ));
  assert.notEqual(engineVersionFor(unpacked), before,
    'Burrow\'s effect is invisible to the fingerprint, which is AC-1430b exactly');
});

test('AC-1430 a resume written before this pass is DISCARDED, unreplayed', () => {
  // The record is REAL — a run played through the public reducer and written by
  // `buildResume` — with only the stamp and the move list rolled back to what a
  // pre-pass build would have produced: a `hold` it could afford at the old
  // price of 2. Both halves must refuse it, and the SECOND is the one that
  // matters: AC-1016 says discarded, NOT replayed, and "replay it and then
  // notice" is running the wrong rules over the player's moves to find out they
  // are wrong.
  const live = playedToCharges('pre-pass-resume', 2);
  const record = buildResume(live);
  const stale = {
    ...record,
    engineVersion: 'e1.x2hg53',
    moves: [...record.moves, { t: 'A', a: 'hold', target: null }],
  };
  assert.equal(parseResume(serialiseResume(stale)), null, 'a stale stamp parsed');
  assert.equal(restoreResume(serialiseResume(stale)), null, 'a stale record was replayed');

  // ...and the ability id alone is refused even under the CURRENT stamp, so
  // there is no fallback for an unknown ability and no default cost: a stored
  // `hold` is never skipped, defaulted or reinterpreted.
  const withHold = { ...record, moves: [...record.moves, { t: 'A', a: 'hold', target: null }] };
  assert.equal(parseResume(serialiseResume(withHold)), null, 'a `hold` move parsed');
  assert.equal(restoreResume(serialiseResume(withHold)), null, 'a `hold` move was replayed');
  assert.throws(() => abilityCost('hold'), /no such ability/,
    'an unknown ability still has a default price, and the default is free');

  // The same record untouched still resumes, so none of the above passes by
  // refusing everything.
  assert.ok(restoreResume(serialiseResume(record)), 'the control record does not resume');
});

// ---- the pure engine transforms, as the UI's own sanity check ------------

test('burrow and migrate remove what they say they remove', () => {
  const animals = [animal('rat', 0, 0), animal('rat', 3, 0), animal('elk', 5, 0)];
  assert.deepEqual(burrow(animals, animals[0].id).removedIds, [animals[0].id]);
  assert.equal(burrow(animals, 'nobody').animals.length, animals.length);
  assert.deepEqual(migrate(animals, 'rat').removedIds, [animals[0].id, animals[1].id]);
  assert.equal(migrate(animals, 'rat').animals.length, 1);
  assert.equal(stampede(animals).animals.length, animals.length);
});
