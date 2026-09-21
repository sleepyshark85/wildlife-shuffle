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
  ABILITIES, burrow, migrate, stampede,
} from '../src/engine/abilities.js';
import { ACTIONS, createRun, reduce } from '../src/engine/engine.js';
import {
  ABILITY_COPY,
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
  targetOf,
  targetingChip,
  turnStatus,
} from '../src/ui/abilities.js';
import { buildReplay } from '../src/ui/replay.js';
import {
  ACTION_GAP, MIN_TOUCH, actionBarSlots, boardLayout, STAGE,
} from '../src/ui/layout.js';
import {
  LOCK_BUDGET_MS, STAMPEDE_BEATS, actionLead, stampedeBeats, turnTimeline,
} from '../src/ui/timeline.js';
import { MOTION } from '../src/ui/theme.js';
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
function playedToACharge(seed, difficulty, maxTurns = 400) {
  let state = openRun({ seed, difficulty });
  while (state.status === 'READY' && state.turn < maxTurns && state.charges === 0) {
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
  // The fourth reads as "one you have not earned", not as a slot you are
  // failing to fill: it rests at 25% while the other three rest at full.
  assert.equal(empty[3].restAlpha, LAST_STAND_PIP_ALPHA);
  assert.deepEqual(empty.slice(0, 3).map((p) => p.restAlpha), [1, 1, 1]);

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

test('AC-1415 at zero charges the button is muted and still there', () => {
  const state = board({ animals: [animal('rat', 0, 0)], charges: 0 });
  const zero = abilityButton(state);
  assert.equal(zero.visible, true, 'the button disappeared at zero charges');
  assert.equal(zero.muted, true);
  assert.equal(zero.usable, 0);
  assert.equal(zero.pips.length, ABILITY_CHARGE_CAP + 1,
    'the pip row changed length, so the bar would reflow');

  const one = abilityButton({ ...state, charges: 1 });
  assert.equal(one.muted, false);
  assert.equal(one.pips.length, zero.pips.length, 'the bar reflows when a charge arrives');
  assert.equal(one.usable, 5);

  // A Dart in progress mutes it too: an ability is the turn's action and the
  // turn's action has already been taken (AC-1406).
  assert.equal(abilityButton({ ...state, charges: 2, dart: 2 }).muted, true);
});

// ---- ui.md §13.2 · the sheet says WHY, it does not merely grey out --------

test('AC-1413 the sheet offers exactly what the engine would accept', () => {
  const animals = [animal('elk', 0, 0), animal('buffalo', 0, 1)];
  const rows = abilityRows(board({ animals, charges: 1 }));
  assert.deepEqual(rows.map((r) => r.id), ['burrow', 'dart', 'migrate', 'stampede', 'hold']);
  assert.ok(rows.every((r) => r.enabled), 'a row the engine accepts was greyed out');
  for (const row of rows) {
    assert.equal(row.name, ABILITY_COPY[row.id].name);
    assert.ok(row.effect.length > 0);
    assert.equal(row.species, ABILITIES[row.id].species);
    assert.equal(row.needsTarget, ABILITIES[row.id].target !== null);
  }

  // ...and it states the reason rather than implying it.
  const broke = abilityRows(board({ animals, charges: 0 }));
  assert.ok(broke.every((r) => !r.enabled));
  assert.deepEqual([...new Set(broke.map((r) => r.reason))], ['Needs a charge']);

  // Migrate with nothing migratable on the board: the reason is specific to
  // that row, and the other four stay usable.
  const buffaloOnly = abilityRows(board({ animals: [animal('buffalo', 0, 0)], charges: 1 }));
  const migrateRow = buffaloOnly.find((r) => r.id === 'migrate');
  assert.equal(migrateRow.enabled, false);
  assert.equal(migrateRow.reason, 'Nothing to target');
  assert.equal(buffaloOnly.filter((r) => r.enabled).length, 4);
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
  // Burrow takes any one animal.
  assert.equal(isTarget('burrow', rat), true);
  assert.equal(isTarget('burrow', buffalo), true);
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

test('AC-1410 the tray says FROZEN while nothing is coming, and stops when it is', () => {
  assert.equal(frozenLabel(0), null, 'a live tray claimed to be frozen');
  assert.equal(frozenLabel(2), 'FROZEN · 2');
  assert.equal(frozenLabel(1), 'FROZEN · 1');
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

test('AC-114 both action-bar buttons stay above 44 pt at every supported width', () => {
  // The design's 150 pt is a reference-device figure. Taken as a constant it
  // overflows below about 344 pt of screen, and the sweep supports 248.
  const offenders = [];
  for (let w = 240; w <= 900; w += 1) {
    const layout = boardLayout(w, 900, 0, 0);
    if (layout.stage === STAGE.UNSUPPORTED) continue;
    const slots = actionBarSlots(w);
    if (slots.buttonW < MIN_TOUCH) offenders.push(`${w}: ${slots.buttonW} pt`);
    // ...and the pair plus the gap plus the gutters must fit the screen.
    if (slots.buttonW * 2 + slots.gap + 32 > w) offenders.push(`${w}: overflows`);
  }
  assert.deepEqual(offenders, [], `action bar does not fit: ${offenders.join(', ')}`);
  assert.equal(actionBarSlots(393).gap, ACTION_GAP);
  // At the reference device the slots are wider than the specified 150, never
  // narrower — the deviation only ever gives the buttons more room.
  assert.ok(actionBarSlots(393).buttonW >= 150, actionBarSlots(393).buttonW);
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
    const state = board({ animals, charges: 1 });
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
  const state = board({ animals, charges: 1, queue: [] });
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
  const state = board({ animals, charges: 1, queue: [] });
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
  const state = board({ animals, charges: 1, queue: [] });
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
  let live = reduce(board({ animals, charges: 1, queue: [] }), use('dart'));
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
  let state = playedToACharge('resume-ability', 'meadow');
  assert.equal(state.status, 'READY', 'the run ended before it earned anything');
  assert.ok(state.charges > 0, 'the run never earned a charge, so nothing was proved');
  state = runReducer(state, use('hold'));
  state = runReducer(state, chooseAction(state));

  const record = buildResume(state);
  assert.ok(record.moves.some((m) => m.t === 'A'), 'the ability use is not in the move log');
  assert.equal(record.moves.find((m) => m.t === 'A').a, 'hold');
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
  assert.equal(back.frozen, state.frozen, 'the freeze was not reconstructed');
});

test('AC-1416 a Dart replays as an arming plus its moves', () => {
  let state = playedToACharge('resume-dart', 'meadow');
  assert.equal(state.status, 'READY');
  assert.ok(state.charges > 0);

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
  let state = playedToACharge('resume-economy', 'meadow');
  assert.equal(state.status, 'READY');
  for (let i = 0; i < 12 && state.status === 'READY'; i += 1) {
    state = state.charges > 0 && state.dart === 0
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
