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
//   3. A tray that goes on promising a batch through three frozen turns. The
//      queue is right — it is being HELD — and the strip showing it is a
//      promise the engine will not keep this turn.
//
// None of those is a position, and none of them would have been caught by
// comparing one.

import test from 'node:test';
import assert from 'node:assert/strict';

import { ABILITY_CHARGE_CAP, BOARD, SPECIES } from '../src/engine/constants.js';
import {
  ABILITIES, abilityCost, burrow, migrate, stampede,
} from '../src/engine/abilities.js';
import { ACTIONS, createRun, reduce } from '../src/engine/engine.js';
import {
  ABILITY_COPY,
  EMPTY_PIP_ALPHA,
  FROZEN_STRIP_OPACITY,
  LAST_STAND_PIP_ALPHA,
  TARGET_DIM,
  abilityButton,
  abilityRows,
  chargePips,
  dartLabel,
  frozenLabel,
  isTarget,
  migratableSpecies,
  needsTarget,
  pipAlpha,
  pipBloomTone,
  targetOf,
  targetingChip,
  trayStripOpacity,
  turnStatus,
} from '../src/ui/abilities.js';
import { buildReplay } from '../src/ui/replay.js';
import {
  ABILITY_LABEL_W, ABILITY_W, ACTION_GAP, GUTTER, MIN_TOUCH, STATUS_W,
  actionBarSlots, boardLayout, STAGE,
} from '../src/ui/layout.js';
import { HIT, Z, tapAt, topmost } from '../src/ui/stacking.js';
import {
  LOCK_BUDGET_MS, STAMPEDE_BEATS, actionLead, stampedeBeats, turnTimeline,
} from '../src/ui/timeline.js';
import { COPY, MOTION } from '../src/ui/theme.js';
import {
  TUNING_SURFACE, buildResume, engineVersionFor, openRun, restoreResume, serialiseResume,
} from '../src/ui/session.js';
import { runReducer } from '../src/ui/useGameRun.js';
import { chooseAction } from '../tools/bot.mjs';
import { animal } from './helpers.js';

/**
 * Play until the run has EARNED a charge, through the public reducer only.
 *
 * The fixtures elsewhere in this file hand `charges` to a state directly, which
 * is fine for a rule but useless for a resume: a replay reconstructs the run
 * from its inputs, so a charge nobody earned is a charge the replay cannot
 * find. Everything below this line has to be reachable by playing.
 */
function playedToCharges(seed, difficulty, want = 1, maxTurns = 600) {
  let state = openRun({ seed, difficulty });
  while (state.status === 'READY' && state.turn < maxTurns && state.charges < want) {
    state = runReducer(state, chooseAction(state));
  }
  return state;
}

function board({ animals, charges = 0, difficulty = 'savanna', ...rest }) {
  const base = createRun({ seed: 'ui-abilities', difficulty });
  return { ...base, animals, charges, ...rest };
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
  // AC-1405h: one charge buys Burrow and Dart and nothing else.
  assert.equal(one.usable, 2);
  assert.equal(abilityButton({ ...state, charges: 2 }).usable, 4);
  assert.equal(abilityButton({ ...state, charges: 3 }).usable, 5);

  // A Dart in progress mutes it too: an ability is the turn's action and the
  // turn's action has already been taken (AC-1406).
  assert.equal(abilityButton({ ...state, charges: 2, dart: 2 }).muted, true);
});

// ---- ui.md §13.2 · the sheet says WHY, it does not merely grey out --------

test('AC-1413 the sheet offers exactly what the engine would accept', () => {
  const animals = [animal('elk', 0, 0), animal('buffalo', 0, 1)];
  const rows = abilityRows(board({ animals, charges: ABILITY_CHARGE_CAP }));
  assert.deepEqual(rows.map((r) => r.id), ['burrow', 'dart', 'migrate', 'stampede', 'hold']);
  assert.ok(rows.every((r) => r.enabled), 'a row the engine accepts was greyed out');
  for (const row of rows) {
    assert.equal(row.name, ABILITY_COPY[row.id].name);
    assert.ok(row.effect.length > 0);
    assert.equal(row.species, ABILITIES[row.id].species);
    assert.equal(row.needsTarget, ABILITIES[row.id].target !== null);
  }

  // ...and it states the reason rather than implying it.
  // ...and it states the reason rather than implying it, WITH the price, so a
  // dimmed row reads as expensive rather than broken (AC-1405j).
  const broke = abilityRows(board({ animals, charges: 0 }));
  assert.ok(broke.every((r) => !r.enabled));
  assert.deepEqual(
    broke.map((r) => r.reason),
    ['Needs a charge', 'Needs a charge', 'Needs 2 charges', 'Needs 3 charges',
      'Needs 2 charges'],
  );

  // Migrate and Burrow with nothing but a buffalo on the board: both say so
  // specifically (AC-1412b), and the three that need no target stay usable.
  const buffaloOnly = abilityRows(
    board({ animals: [animal('buffalo', 0, 0)], charges: ABILITY_CHARGE_CAP }),
  );
  for (const id of ['migrate', 'burrow']) {
    const row = buffaloOnly.find((r) => r.id === id);
    assert.equal(row.enabled, false, `${id} offered a buffalo as a target`);
    assert.equal(row.reason, 'Nothing to target');
  }
  assert.equal(buffaloOnly.filter((r) => r.enabled).length, 3);
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

  // AC-1405j: at 2 charges Stampede is unavailable AND says why — "a sheet
  // that hides why a row is unavailable looks broken rather than expensive".
  const atTwo = abilityRows(board({ animals, charges: 2 }));
  const stampedeRow = atTwo.find((r) => r.id === 'stampede');
  assert.equal(stampedeRow.enabled, false);
  assert.equal(stampedeRow.reason, 'Needs 3 charges');
  assert.equal(stampedeRow.costPips.length, 3, 'the cost vanished with the affordability');
  assert.deepEqual(
    atTwo.filter((r) => r.enabled).map((r) => r.id),
    ['burrow', 'dart', 'migrate', 'hold'],
  );

  const atOne = abilityRows(board({ animals, charges: 1 }));
  assert.equal(atOne.find((r) => r.id === 'hold').reason, 'Needs 2 charges');
  assert.equal(atOne.find((r) => r.id === 'burrow').reason, null);
  assert.equal(abilityRows(board({ animals, charges: 0 }))[0].reason, 'Needs a charge');
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
  for (const id of ['dart', 'stampede', 'hold']) {
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

test('AC-1410b the tray says FROZEN and GREYS OUT, and both come back', () => {
  assert.equal(frozenLabel(0), null, 'a live tray claimed to be frozen');
  assert.equal(frozenLabel(2), 'FROZEN · 2');
  assert.equal(frozenLabel(1), 'FROZEN · 1');

  // The grey-out is the half that shipped missing: a static `opacity: 0.45`
  // sat in the same style array as the arrival reveal's animated opacity, and
  // whichever was written last won — so the label said FROZEN over a strip at
  // full opacity. The two are multiplied now, and this asserts the factor the
  // component actually multiplies by.
  assert.equal(trayStripOpacity(0), 1, 'a live tray is greyed out');
  assert.equal(trayStripOpacity(2), FROZEN_STRIP_OPACITY);
  assert.equal(FROZEN_STRIP_OPACITY, 0.45);
});

test('AC-1410c the announce and the counter are in different units', () => {
  // "3 TURNS" against "FROZEN · 2". An announce of 3 beside a counter of 2 in
  // the SAME unit would read as an off-by-one, which is the whole reason the
  // design asks for two units.
  assert.match(COPY.holdAnnounce, /3 TURNS/);
  assert.match(frozenLabel(2), /^FROZEN/);
  assert.ok(!/TURNS/.test(frozenLabel(2)), 'the counter borrowed the announce\'s unit');
  assert.ok(!COPY.holdAnnounce.includes('FROZEN'));
});

test('AC-1407 the bar counts the Dart down, and says MOVE in the singular', () => {
  assert.equal(dartLabel(0), null);
  assert.equal(dartLabel(3), '3 MOVES LEFT');
  assert.equal(dartLabel(1), '1 MOVE LEFT');
});

test('one status line, and the arming state outranks the idle one', () => {
  const base = { gameOver: false, blocked: false, resolving: false, arming: false, dart: 0 };
  assert.equal(turnStatus(base), 'YOUR MOVE');
  assert.equal(turnStatus({ ...base, dart: 2 }), '2 MOVES LEFT');
  assert.equal(turnStatus({ ...base, arming: true }), 'CHOOSE A TARGET');
  assert.equal(turnStatus({ ...base, blocked: true }), 'BLOCKED');
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
    ['migrate', 'rat'], ['hold', undefined]]) {
    const state = board({ animals, charges: ABILITY_CHARGE_CAP });
    const next = reduce(state, use(id, target));
    assert.notEqual(next.lastAction.type, 'REJECTED', id);
    const timeline = turnTimeline(next.lastTurn.events, next.lastTurn.action, 0);
    assert.ok(timeline.lockMs <= LOCK_BUDGET_MS,
      `${id}: ${timeline.lockMs} ms exceeds the ${LOCK_BUDGET_MS} ms budget`);
    // The ability's own beat is INSIDE the scaled timeline, not added to it.
    assert.ok(timeline.settleFallAt <= timeline.lockMs, `${id}: the lead outran the lock`);
  }

  // Dart and Hold the Line move nothing, so they cost the timeline nothing.
  assert.equal(actionLead([{ type: 'ACTION', action: 'ABILITY', ability: 'hold',
    removedIds: [], moved: [] }], 'ABILITY'), 0);
  assert.equal(actionLead([{ type: 'ACTION', action: 'MOVE' }], 'MOVE'), MOTION.snap);
  assert.equal(actionLead([{ type: 'ACTION', action: 'PASS' }], 'PASS'), 0);
});

// ---- the replay plan: what would look wrong while the state is right -----

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
  let state = playedToCharges('resume-ability', 'meadow', abilityCost('burrow'));
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
    ['difficulty', 'digest', 'engineVersion', 'moves', 'schemaVersion', 'seed', 'start'],
  );
  assert.equal(record.charges, undefined, 'the charge count was persisted');
  assert.equal(record.lastStand, undefined, 'Last Stand was persisted');

  const back = restoreResume(serialiseResume(record));
  assert.ok(back, 'a run containing an ability use could not be resumed');
  assert.equal(back.charges, state.charges);
  assert.deepEqual(back.animals, state.animals, 'the burrowed animal came back');
});

test('AC-1416 a Dart replays as an arming plus its moves', () => {
  let state = playedToCharges('resume-dart', 'meadow', abilityCost('dart'));
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

test('AC-1416 charges, the ladder, the freeze and Last Stand all come back', () => {
  let state = playedToCharges('resume-economy', 'meadow', abilityCost('hold'));
  assert.equal(state.status, 'READY');
  for (let i = 0; i < 12 && state.status === 'READY'; i += 1) {
    state = state.charges >= abilityCost('hold') && state.dart === 0
      ? runReducer(state, use('hold'))
      : runReducer(state, chooseAction(state));
  }
  assert.equal(state.status, 'READY', 'the run ended, and a finished run is not resumed');
  assert.ok(state.stats.chargesEarned > 0, 'the run earned nothing, so nothing was proved');

  const back = restoreResume(serialiseResume(buildResume(state)));
  assert.ok(back, 'the run could not be resumed');
  assert.equal(back.charges, state.charges, 'charges were not reconstructed');
  assert.equal(back.ladder, state.ladder, 'the ladder position was not reconstructed');
  assert.equal(back.lastStand, state.lastStand, 'Last Stand was not reconstructed');
  assert.equal(back.frozen, state.frozen, 'the freeze was not reconstructed');
  assert.equal(back.score, state.score);
  assert.equal(back.stats.abilitiesUsed, state.stats.abilitiesUsed);
});

test('AC-1014b/AC-1014c the record carries `abilities`, and a restart proves it', () => {
  // AC-1014c: carried state stays hidden until something carries it, so this
  // has to reach the SECOND run of the session. A measurement run and a played
  // run reach different boards from the same seed and the same moves — the
  // measurement never grants a charge — so a record that omitted the switch
  // would resume one as the other.
  let state = openRun({ seed: 'carried', difficulty: 'savanna', abilities: false });
  for (let i = 0; i < 5; i += 1) state = runReducer(state, { type: ACTIONS.PASS });
  state = runReducer(state, { type: ACTIONS.RESTART, seed: 'carried-2', difficulty: 'savanna' });
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
    entry && entry.savanna && Array.isArray(entry.savanna)
      ? { ...entry, savanna: [1, ...entry.savanna.slice(1)] }
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
