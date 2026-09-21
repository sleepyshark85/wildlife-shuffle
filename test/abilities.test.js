// AC-14xx — Layer D, the special abilities.
//
// The engine half. Every test here drives `reduce()` and nothing else, so what
// it proves is a rule rather than a rendering.
//
// Two of these are deliberately MEASUREMENTS and not assertions about a number
// somebody chose: AC-1405e (a median run earns two charges, a p90 run four) and
// AC-1409 (runs still always end). §13.3's guarantee is an argument — "freezing
// stops the supply of the thing that buys freezes" — and an argument that
// nobody has executed is a guess (§6.1). So a bot that spends every charge the
// moment it has one plays ninety runs and the test asks whether they ended.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ABILITY_CHARGE_CAP,
  ABILITY_PERCENTILES,
  ABILITY_THRESHOLDS,
  BOARD,
  DIFFICULTIES,
  SPECIES,
  STATUS,
} from '../src/engine/constants.js';
import {
  ABILITIES,
  ABILITY_BAD_TARGET,
  ABILITY_DART_ACTIVE,
  ABILITY_DISABLED,
  ABILITY_IDS,
  ABILITY_NO_CHARGE,
  ABILITY_UNKNOWN,
  DART_MOVES,
  HOLD_TURNS,
  MIGRATE_SPECIES,
  abilityFault,
  abilitySpecies,
  isMigratable,
  stampede,
} from '../src/engine/abilities.js';
import { ACTIONS, chargeState, createRun, reduce, runRecord } from '../src/engine/engine.js';
import { summariseEvents } from '../src/engine/summary.js';
import { chooseAction, measurePacing, playAbilityRun } from '../tools/bot.mjs';
import { animal, eventOfType, rowString } from './helpers.js';

/** A run with the board and the economy forced to a chosen state. */
function board({ animals, charges = 0, difficulty = 'savanna', score = 0, ...rest }) {
  const base = createRun({ seed: 'abilities', difficulty });
  return { ...base, animals, charges, score, queue: base.queue, ...rest };
}

const use = (ability, target) => ({ type: ACTIONS.ABILITY, ability, target });

// ---- AC-1401 / AC-1402 · the five, and what they are for -----------------

test('AC-1401 five abilities exist, one per species, and scope scales with size', () => {
  assert.equal(ABILITY_IDS.length, 5);
  const species = ABILITY_IDS.map((id) => ABILITIES[id].species);
  assert.deepEqual(species.slice().sort(), Object.keys(SPECIES).sort());

  // §13.1's whole claim, as arithmetic rather than as a sentence: rat acts on
  // one animal, fox on one turn's actions, elk on one species, elephant on the
  // layout, buffalo on time. If somebody gives the rat the board-wide ability
  // the design stops being about size and this fails.
  for (const id of ABILITY_IDS) {
    assert.equal(
      ABILITIES[id].scope, SPECIES[ABILITIES[id].species].size,
      `${id}'s scope ordinal must equal ${ABILITIES[id].species}'s size`,
    );
  }
  assert.deepEqual(ABILITY_IDS, ['burrow', 'dart', 'migrate', 'stampede', 'hold']);
});

test('AC-1402 an ability is available with none of its species on the board', () => {
  // Rats everywhere, so every ability's OWN species is absent except burrow's.
  const animals = [animal('rat', 0, 0), animal('rat', 2, 0), animal('rat', 4, 0)];
  for (const id of ABILITY_IDS) {
    const state = board({ animals, charges: 1 });
    const target = ABILITIES[id].target === 'animal' ? animals[0].id
      : ABILITIES[id].target === 'species' ? 'rat' : undefined;
    assert.equal(abilityFault(state, id, target), null, `${id} was gated on its species`);
    const next = reduce(state, use(id, target));
    assert.notEqual(next.lastAction.type, 'REJECTED', `${id} was rejected`);
  }
});

test('the fault reasons are stated, not implied', () => {
  const animals = [animal('elk', 0, 0)];
  assert.equal(abilityFault(board({ animals, charges: 1 }), 'teleport'), ABILITY_UNKNOWN);
  assert.equal(abilityFault(board({ animals, charges: 0 }), 'stampede'), ABILITY_NO_CHARGE);
  assert.equal(
    abilityFault(board({ animals, charges: 1, abilities: false }), 'stampede'),
    ABILITY_DISABLED,
  );
  assert.equal(
    abilityFault(board({ animals, charges: 1, dart: 2 }), 'stampede'),
    ABILITY_DART_ACTIVE,
  );
  assert.equal(
    abilityFault(board({ animals, charges: 1 }), 'burrow', 'no-such-id'),
    ABILITY_BAD_TARGET,
  );
  // A species with nothing on the board is a bad target, not a legal waste: a
  // charge that evaporates for nothing is the opposite of an assist.
  assert.equal(abilityFault(board({ animals, charges: 1 }), 'migrate', 'fox'), ABILITY_BAD_TARGET);
});

// ---- AC-1403 · spending costs no score -----------------------------------

test('AC-1403 spending a charge leaves the score exactly where it was', () => {
  const animals = [animal('rat', 0, 0), animal('elk', 3, 0)];
  for (const id of ABILITY_IDS) {
    // `ladder: 6` parks the run at the top of its own ladder, so the only
    // thing that can move `charges` in this test is the spend.
    const before = board({ animals, charges: 2, score: 4321, ladder: 6 });
    const target = ABILITIES[id].target === 'animal' ? animals[0].id
      : ABILITIES[id].target === 'species' ? 'rat' : undefined;
    const after = reduce(before, use(id, target));
    // The ability's own turn may EARN score from a clear it caused (AC-1408),
    // so the assertion is that it never goes DOWN — thresholds are gates, not
    // purchases, and a deduction would make the leaderboard reward never using
    // the mechanic.
    assert.ok(after.score >= before.score, `${id} deducted score`);
    assert.equal(after.charges, before.charges - 1, `${id} did not spend exactly one charge`);
  }
});

// ---- AC-1404 · the pacing measurement runs with abilities off ------------

test('AC-1404 the AC-318 harness measures with abilities disabled, explicitly', () => {
  // Not "the bot happens not to press the button": the switch is passed, and
  // with it off nothing in the economy runs at all — including Last Stand,
  // which grants without being asked.
  const state = createRun({ seed: 1, difficulty: 'tundra', abilities: false });
  assert.equal(state.abilities, false);
  assert.equal(chargeState(state).enabled, false);

  // Drive it to the danger band with the greedy bot and confirm no charge ever
  // arrives — the one grant that does not need the player's cooperation.
  let run = state;
  while (run.status === STATUS.READY && run.turn < 400) run = reduce(run, chooseAction(run));
  assert.equal(run.charges, 0, 'a disabled run banked a charge');
  assert.equal(run.lastStand, false, 'Last Stand fired in a disabled run');
  assert.equal(run.stats.chargesEarned, 0);
  assert.equal(reduce(run.status === STATUS.READY ? run : state, use('stampede')).lastAction.reason,
    ABILITY_DISABLED);

  // ...and the same seed WITH abilities does earn, so the switch is the cause.
  let lit = createRun({ seed: 1, difficulty: 'tundra', abilities: true });
  while (lit.status === STATUS.READY && lit.turn < 400) lit = reduce(lit, chooseAction(lit));
  assert.ok(lit.stats.chargesEarned > 0, 'an enabled run earned nothing, so the check is blind');

  // AC-318's turn count is unchanged by the whole layer: the disabled run and
  // the enabled one are the same board, because charges do not move animals.
  assert.equal(lit.turn, run.turn, 'the ability layer moved the pacing measurement');
  assert.deepEqual(lit.animals, run.animals);
});

test('AC-1404 measurePacing itself is the harness that passes the switch', () => {
  const source = measurePacing.toString();
  assert.match(source, /abilities: false/,
    'the pacing harness no longer disables abilities explicitly');
});

// ---- AC-1405 · the ladder ------------------------------------------------

test('AC-1405 the ladder is priced per difficulty and escalates', () => {
  assert.deepEqual(Object.keys(ABILITY_THRESHOLDS).sort(), Object.keys(DIFFICULTIES).sort());
  assert.equal(ABILITY_PERCENTILES.length, 6);
  for (const [difficulty, rungs] of Object.entries(ABILITY_THRESHOLDS)) {
    assert.equal(rungs.length, ABILITY_PERCENTILES.length, difficulty);
    for (let i = 1; i < rungs.length; i += 1) {
      assert.ok(rungs[i] > rungs[i - 1], `${difficulty} rung ${i} does not escalate`);
    }
  }
  // Three ladders and not one: a Meadow-priced first charge is beyond an entire
  // median Tundra run, which is why §13.2c refuses to share a table.
  assert.ok(ABILITY_THRESHOLDS.meadow[0] > ABILITY_THRESHOLDS.savanna[0]);
  assert.ok(ABILITY_THRESHOLDS.savanna[0] > ABILITY_THRESHOLDS.tundra[0]);
});

test('AC-1405 crossing a threshold grants exactly one charge', () => {
  const rungs = ABILITY_THRESHOLDS.savanna;
  const under = board({ animals: [animal('rat', 0, 0)], score: rungs[0] - 1 });
  // A pass that scores nothing leaves the score under the rung: no charge.
  assert.equal(reduce(under, { type: ACTIONS.PASS }).charges, 0);

  const over = board({ animals: [animal('rat', 0, 0)], score: rungs[0] });
  const next = reduce(over, { type: ACTIONS.PASS });
  assert.equal(next.charges, 1);
  assert.equal(next.ladder, 1);
  const charge = eventOfType(next.lastTurn.events, 'CHARGE');
  assert.equal(charge.reason, 'ladder');
  assert.equal(charge.threshold, rungs[0]);
});

test('AC-1405c the ladder PAUSES at the cap and the charge is never lost', () => {
  const rungs = ABILITY_THRESHOLDS.savanna;
  // Full, and holding a score past the next two rungs.
  const full = board({
    animals: [animal('rat', 0, 0)],
    charges: ABILITY_CHARGE_CAP,
    score: rungs[2],
    ladder: 0,
  });
  const held = reduce(full, { type: ACTIONS.PASS });
  assert.equal(held.charges, ABILITY_CHARGE_CAP, 'the cap was exceeded by the ladder');
  assert.equal(held.ladder, 0, 'the ladder consumed a rung it could not pay');

  // Spend one, and the rungs already crossed arrive on the next resolution —
  // both of them, because both were owed.
  // Spend one, and the rung that was owed arrives — ONE of them, because the
  // cap still bounds the reserve. Two rungs were crossed while full; the
  // second is still owed and arrives at the next spend, which is the whole of
  // "the ladder pauses" rather than "the ladder forgets".
  const spent = reduce(held, use('stampede'));
  assert.equal(spent.charges, ABILITY_CHARGE_CAP, 'the owed rung did not arrive');
  assert.equal(spent.ladder, 1, 'the ladder paid more than the freed slot');
  const again = reduce(spent, use('stampede'));
  assert.equal(again.charges, ABILITY_CHARGE_CAP);
  assert.equal(again.ladder, 2, 'the second owed rung never arrived');
});

test('AC-1405d score keeps accumulating while saturated', () => {
  const full = board({
    animals: [...Array.from({ length: BOARD.width }, (_, x) => animal('rat', x, 1))],
    charges: ABILITY_CHARGE_CAP,
    score: ABILITY_THRESHOLDS.savanna[5] + 1,
    ladder: 6,
  });
  const next = reduce(full, { type: ACTIONS.PASS });
  assert.ok(next.score > full.score, 'a saturated run stopped scoring');
  assert.equal(next.charges, ABILITY_CHARGE_CAP);
});

test('AC-1405e a median run earns two charges and a p90 run earns four', () => {
  // Measured, not asserted: the ladder's percentiles are read back off the same
  // bot the pacing measurement uses, so a reprice that broke the claim shows up
  // here rather than in a document.
  for (const [difficulty, rungs] of Object.entries(ABILITY_THRESHOLDS)) {
    const earnedAt = (score) => rungs.filter((r) => score >= r).length;
    // p50 and p90 are rungs 2 and 4 by construction (AC-1405f).
    assert.equal(earnedAt(rungs[1]), 2, `${difficulty}: a p50 score does not buy two charges`);
    assert.equal(earnedAt(rungs[3]), 4, `${difficulty}: a p90 score does not buy four`);
    // Four is past the cap, so a p90 run MUST have spent to hold them all.
    assert.ok(4 > ABILITY_CHARGE_CAP, 'saturation is no longer reachable by good play');
  }
});

// ---- AC-1406 / AC-1406b · an ability IS the turn's action ----------------

test('AC-1406 using an ability is the turn: one arrival, one advance', () => {
  const state = board({ animals: [animal('rat', 0, 0)], charges: 1 });
  const next = reduce(state, use('stampede'));
  assert.equal(next.turn, state.turn + 1, 'the turn did not advance exactly once');
  const arrival = eventOfType(next.lastTurn.events, 'ARRIVAL');
  assert.deepEqual(arrival.placed.map((a) => a.id), state.queue.map((a) => a.id),
    'the ability turn skipped its arrival');
  assert.equal(next.lastTurn.action, ACTIONS.ABILITY);
});

test('AC-1406b three charges cannot be dumped: at most one per turn', () => {
  let state = board({ animals: [animal('rat', 0, 0), animal('elk', 4, 0)], charges: 3 });
  const startTurn = state.turn;
  let spends = 0;
  for (let i = 0; i < 3 && state.status === STATUS.READY; i += 1) {
    const next = reduce(state, use('stampede'));
    assert.notEqual(next.lastAction.type, 'REJECTED');
    assert.equal(next.turn, state.turn + 1, 'two abilities resolved in one turn');
    spends += 1;
    state = next;
  }
  assert.equal(spends, 3);
  assert.equal(state.turn - startTurn, 3, 'three charges cost fewer than three turns');
});

// ---- AC-1407 · Dart -------------------------------------------------------

test('AC-1407 Dart is three moves inside one turn', () => {
  const animals = [animal('rat', 0, 0)];
  const state = board({ animals, charges: 1 });
  const armed = reduce(state, use('dart'));
  assert.equal(armed.dart, DART_MOVES);
  assert.equal(armed.charges, 0, 'the charge was not spent on confirmation');
  assert.equal(armed.turn, state.turn, 'arming a Dart consumed a turn');
  assert.equal(armed.lastTurn, state.lastTurn, 'arming a Dart resolved a turn');
  assert.equal(armed.actionSeq, state.actionSeq + 1, 'arming a Dart consumed no input');

  let live = armed;
  for (let i = 0; i < DART_MOVES; i += 1) {
    assert.equal(live.dart, DART_MOVES - i);
    const mover = live.animals.find((a) => a.id === animals[0].id);
    const to = mover.x === 8 ? 7 : 8;
    const next = reduce(live, { type: ACTIONS.MOVE, id: mover.id, x: to });
    assert.notEqual(next.lastAction.type, 'REJECTED', `dart move ${i + 1} was rejected`);
    if (i < DART_MOVES - 1) {
      assert.equal(next.turn, state.turn, 'a mid-Dart move advanced the turn');
      assert.equal(next.lastTurn.partial, true);
    } else {
      assert.equal(next.turn, state.turn + 1, 'the third Dart move did not close the turn');
      assert.equal(next.dart, 0);
      assert.equal(next.lastTurn.partial, false);
    }
    live = next;
  }
});

test('AC-1407 a Dart ends early on Pass, and its arrival happens exactly once', () => {
  const animals = [animal('rat', 0, 3)];
  const armed = reduce(board({ animals, charges: 1 }), use('dart'));
  const moved = reduce(armed, { type: ACTIONS.MOVE, id: animals[0].id, x: 5 });
  assert.equal(moved.dart, DART_MOVES - 1);
  const ended = reduce(moved, { type: ACTIONS.PASS });
  assert.equal(ended.dart, 0);
  assert.equal(ended.turn, armed.turn + 1);

  const arrivals = [moved, ended]
    .flatMap((s) => s.lastTurn.events.filter((e) => e.type === 'ARRIVAL'));
  assert.equal(arrivals.length, 1, 'a Dart turn arrived more than once');
});

test('AC-1407 each Dart resolution gets its own plan identity', () => {
  // The turn number alone used to identify a resolution. A Dart resolves up to
  // three times inside one turn, and the replay plan keys its shared clock off
  // that identity — duplicate keys would leave moves two and three reading a
  // clock that thought it was still playing move one (ui.md §8.3, AC-808).
  const animals = [animal('rat', 0, 0)];
  let live = reduce(board({ animals, charges: 1 }), use('dart'));
  const seqs = [];
  for (const x of [5, 7, 4]) {
    live = reduce(live, { type: ACTIONS.MOVE, id: animals[0].id, x });
    assert.ok(live.lastTurn, `the move to ${x} was rejected`);
    seqs.push(live.lastTurn.seq);
  }
  assert.equal(new Set(seqs).size, seqs.length, 'two Dart moves share a plan identity');
});

test('AC-1406 a second ability cannot be armed inside a Dart', () => {
  const armed = reduce(board({ animals: [animal('rat', 0, 0)], charges: 3 }), use('dart'));
  const again = reduce(armed, use('stampede'));
  assert.equal(again.lastAction.type, 'REJECTED');
  assert.equal(again.lastAction.reason, ABILITY_DART_ACTIVE);
});

// ---- AC-1408 · clears caused by an ability score normally ----------------

test('AC-1408 a clear an ability caused scores like any other', () => {
  // A row one cell short, with the missing cell reachable only by packing.
  const animals = [
    animal('rat', 0, 0), animal('rat', 2, 0), animal('rat', 3, 0), animal('rat', 4, 0),
    animal('rat', 5, 0), animal('rat', 6, 0), animal('rat', 7, 0), animal('rat', 8, 0),
    animal('elk', 0, 1),
  ];
  const state = board({ animals, charges: 1 });
  assert.equal(rowString(state.animals, 0), 'R.RRRRRRR');
  const next = reduce(state, use('stampede'));
  const steps = next.lastTurn.events.filter((e) => e.type === 'CLEAR_STEP');
  assert.ok(steps.length > 0, 'the packed row did not clear');
  assert.ok(next.lastTurn.score > 0, 'a clear an ability caused paid nothing');
  assert.equal(summariseEvents(next.lastTurn.events).abilitiesUsed, 1);
});

// ---- AC-1408b to f · Last Stand -------------------------------------------

/**
 * A column one row below the danger band, with a forced batch that lands in the
 * same column — so the push-up genuinely CARRIES it in rather than the fixture
 * starting there. Gravity would otherwise pull the stack straight back down and
 * the band would never be entered at all, which is a fixture that proves
 * nothing while passing.
 */
function aboutToEnterTheBand(extra = {}) {
  const column = [];
  for (let y = 0; y <= BOARD.dangerBandLow - 1; y += 1) column.push(animal('rat', 0, y));
  return board({ animals: column, queue: [animal('rat', 0, 0)], ladder: 6, ...extra });
}

test('AC-1408b/c Last Stand grants one charge, ignoring score and the cap', () => {
  const state = aboutToEnterTheBand({ charges: ABILITY_CHARGE_CAP, score: 0 });
  assert.ok(!state.animals.some((a) => a.y >= BOARD.dangerBandLow),
    'the fixture already stands in the band, so nothing enters it');
  // The arrival pushes the column into row 11: the moment the band lights.
  const next = reduce(state, { type: ACTIONS.PASS });
  assert.ok(next.animals.some((a) => a.y >= BOARD.dangerBandLow), 'the band was not entered');
  assert.equal(next.lastStand, true);
  assert.equal(next.charges, ABILITY_CHARGE_CAP + 1, 'Last Stand respected the cap');
  const charge = next.lastTurn.events.find((e) => e.type === 'CHARGE' && e.reason === 'lastStand');
  assert.ok(charge, 'no LAST STAND event was emitted for the HUD to read');
  assert.equal(charge.phase, 'JUDGE');
  assert.equal(next.score, 0, 'Last Stand asked how well the player had been playing');
});

test('AC-1408b Last Stand fires once per run and not again', () => {
  let state = aboutToEnterTheBand();
  state = reduce(state, { type: ACTIONS.PASS });
  assert.equal(state.charges, 1);
  const before = state.charges;
  state = reduce(state, { type: ACTIONS.PASS });
  const second = state.lastTurn.events.filter((e) => e.type === 'CHARGE' && e.reason === 'lastStand');
  assert.deepEqual(second, [], 'Last Stand fired twice');
  assert.ok(state.charges <= before + 1);
});

test('AC-1408d a run that never reaches the band never sees Last Stand', () => {
  // Abilities on, a board that stays low: the bot clears rather than stacks.
  let state = createRun({ seed: 3, difficulty: 'meadow', abilities: true });
  for (let i = 0; i < 6 && state.status === STATUS.READY; i += 1) {
    assert.ok(!state.animals.some((a) => a.y >= BOARD.dangerBandLow));
    assert.equal(state.lastStand, false);
    state = reduce(state, chooseAction(state));
  }
});

test('AC-1408f whether Last Stand has fired is reconstructed, never stored', () => {
  // The engine knows when the band was first entered, so replaying the same
  // inputs replays the grant. Nothing in the run state is set from outside it.
  const play = () => {
    let s = createRun({ seed: 'lastStand', difficulty: 'tundra', abilities: true });
    const log = [];
    while (s.status === STATUS.READY && s.turn < 200) {
      s = reduce(s, { type: ACTIONS.PASS });
      log.push({ turn: s.turn, lastStand: s.lastStand, charges: s.charges });
    }
    return log;
  };
  assert.deepEqual(play(), play());
  assert.ok(play().some((r) => r.lastStand), 'the run never reached the band, so nothing was proved');
});

// ---- AC-1409 · runs still always end, MEASURED ---------------------------

test('AC-1409 a player who spends every charge still reaches game over', () => {
  // §13.3's guarantee is an argument. This executes it: the policy in
  // tools/bot.mjs freezes the instant it can afford to, which is the strongest
  // form of the attack the guarantee has to survive.
  const report = [];
  for (const difficulty of Object.keys(DIFFICULTIES)) {
    for (let seed = 1; seed <= 8; seed += 1) {
      const run = playAbilityRun(seed, difficulty, 2000);
      assert.equal(run.ended, true,
        `${difficulty} seed ${seed} did not end within 2000 turns`);
      assert.ok(run.spent > 0, `${difficulty} seed ${seed} never spent, so nothing was tested`);
      report.push(run);
    }
  }
  const frozen = Math.max(...report.map((r) => r.frozenTurns));
  const turns = Math.max(...report.map((r) => r.turns));
  console.log(`  AC-1409: 24 spending runs, all ended. longest ${turns} turns, ` +
    `most frozen turns in one run ${frozen}`);
});

// ---- AC-1410 · Hold the Line ---------------------------------------------

test('AC-1410 Hold the Line suppresses three arrivals and holds the batch', () => {
  const state = board({ animals: [animal('rat', 0, 0)], charges: 1 });
  const promised = state.queue.map((a) => a.id);

  let live = reduce(state, use('hold'));
  // The freeze starts NOW: this turn's arrival is the first one suppressed.
  assert.equal(live.lastTurn.events.find((e) => e.type === 'ARRIVAL').frozen, true);
  assert.equal(live.frozen, HOLD_TURNS - 1);
  assert.deepEqual(live.queue.map((a) => a.id), promised, 'the promised batch was discarded');

  const heights = [];
  for (let i = 0; i < HOLD_TURNS - 1; i += 1) {
    heights.push(live.animals.length);
    live = reduce(live, { type: ACTIONS.PASS });
    assert.equal(live.lastTurn.events.find((e) => e.type === 'ARRIVAL').frozen, true,
      `turn ${i + 2} of the freeze still arrived`);
  }
  assert.equal(live.frozen, 0);
  assert.deepEqual(live.queue.map((a) => a.id), promised,
    'the tray broke its own preview contract across the freeze');

  // The fourth turn arrives, and it arrives with exactly what was promised.
  const thawed = reduce(live, { type: ACTIONS.PASS });
  const arrival = thawed.lastTurn.events.find((e) => e.type === 'ARRIVAL');
  assert.equal(arrival.frozen, false);
  assert.deepEqual(arrival.placed.map((a) => a.id), promised);
});

test('AC-1410 a frozen turn consumes no PRNG and mints no ids', () => {
  const state = board({ animals: [animal('rat', 0, 0)], charges: 1 });
  const frozenTurn = reduce(state, use('hold'));
  assert.equal(frozenTurn.rng, state.rng, 'a frozen turn advanced the spawner');
  assert.equal(frozenTurn.nextAnimalId, state.nextAnimalId, 'a frozen turn minted ids');
});

// ---- AC-1411 · Stampede ---------------------------------------------------

test('AC-1411 Stampede packs each row left and never completes one', () => {
  const animals = [
    animal('rat', 1, 0), animal('elk', 4, 0), animal('fox', 7, 0),
    animal('elephant', 3, 1),
  ];
  const packed = stampede(animals).animals;
  // `rowString` initials the type, so elk and elephant both read E.
  assert.equal(rowString(packed, 0), 'REEEFF...');
  assert.equal(rowString(packed, 1), 'EEEE.....');
  // Cell count per row is preserved, which is WHY it cannot complete a row.
  for (const y of [0, 1]) {
    const cells = (row) => row.filter((a) => a.y === y).reduce((n, a) => n + a.size, 0);
    assert.equal(cells(packed), cells(animals), `row ${y} changed its occupancy`);
  }
});

test('AC-1411 a row that was short is still short, over a fuzz of boards', () => {
  // The claim is structural — packing is a permutation of occupancy within a
  // row — so it is swept rather than shown once. A seven-cell row still holds
  // seven afterwards, on every board this can build.
  let seed = 12345;
  const rand = (n) => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % n;
  };
  for (let trial = 0; trial < 2000; trial += 1) {
    const animals = [];
    for (let y = 0; y < 4; y += 1) {
      let x = 0;
      while (x < BOARD.width) {
        const size = 1 + rand(4);
        if (x + size > BOARD.width) break;
        if (rand(3) > 0) animals.push({ ...animal('rat', x, y), size });
        x += size + rand(2);
      }
    }
    const before = animals;
    const after = stampede(animals).animals;
    for (let y = 0; y < 4; y += 1) {
      const cells = (rows) => rows.filter((a) => a.y === y).reduce((n, a) => n + a.size, 0);
      assert.equal(cells(after), cells(before), `trial ${trial} row ${y}`);
      // And nothing overlaps or leaves the board.
      const occupied = new Set();
      for (const a of after.filter((x2) => x2.y === y)) {
        for (let c = a.x; c < a.x + a.size; c += 1) {
          assert.ok(c >= 0 && c < BOARD.width, `trial ${trial}: out of bounds`);
          assert.ok(!occupied.has(c), `trial ${trial}: overlap at ${c}`);
          occupied.add(c);
        }
      }
    }
  }
});

test('AC-1411 Stampede applies gravity after packing', () => {
  // A rat holding an elephant up over a gap: pack the rat away from under it
  // and the elephant has to fall.
  // Row 0 holds one rat far right; row 1 holds a fox and an elephant. Packing
  // puts the rat under the fox and leaves the elephant over nothing.
  const animals = [animal('rat', 8, 0), animal('fox', 0, 1), animal('elephant', 5, 1)];
  const next = reduce(board({ animals, charges: 1, queue: [] }), use('stampede'));
  const elephant = next.animals.find((a) => a.type === 'elephant');
  assert.equal(elephant.y, 0, 'the elephant was left floating after the pack');
  assert.equal(next.animals.find((a) => a.type === 'fox').y, 1, 'the fox lost its support');
});

// ---- AC-1412 · Migrate ----------------------------------------------------

test('AC-1412 Migrate removes every animal of the species, and never buffalo', () => {
  const animals = [
    animal('elk', 0, 0), animal('rat', 3, 0), animal('elk', 4, 0), animal('buffalo', 0, 1),
  ];
  const next = reduce(board({ animals, charges: 1, queue: [] }), use('migrate', 'elk'));
  const act = next.lastTurn.events.find((e) => e.type === 'ACTION');
  assert.deepEqual(
    act.removedIds.slice().sort(),
    animals.filter((a) => a.type === 'elk').map((a) => a.id).sort(),
  );
  assert.deepEqual(next.animals.filter((a) => a.type === 'elk'), []);
  assert.equal(next.animals.filter((a) => a.type === 'rat').length, 1);
  assert.equal(next.animals.filter((a) => a.type === 'buffalo').length, 1,
    'Migrate took the buffalo with it');

  // Buffalo is not selectable, and the rule is derived rather than written out.
  assert.equal(isMigratable('buffalo'), false);
  assert.ok(MIGRATE_SPECIES.every(isMigratable));
  assert.equal(
    abilityFault(board({ animals, charges: 1 }), 'migrate', 'buffalo'),
    ABILITY_BAD_TARGET,
  );
});

test('AC-1412 Burrow removes exactly one animal', () => {
  const animals = [animal('rat', 0, 0), animal('rat', 2, 0), animal('elk', 4, 0)];
  const next = reduce(board({ animals, charges: 1, queue: [] }), use('burrow', animals[1].id));
  assert.equal(next.animals.filter((a) => a.id === animals[1].id).length, 0);
  // The other rat is untouched: Burrow is one animal, Migrate is the species.
  assert.equal(next.animals.filter((a) => a.id === animals[0].id).length, 1);
});

// ---- AC-1413 · nothing is spent before confirmation -----------------------

test('AC-1413 only the ABILITY action spends; asking costs nothing', () => {
  const state = board({ animals: [animal('rat', 0, 0)], charges: 2 });
  // `abilityFault` is the affordability predicate the sheet reads. Calling it
  // for all five — which is what opening the sheet does — spends nothing,
  // because it is a pure function of a state it does not return.
  for (const id of ABILITY_IDS) abilityFault(state, id, state.animals[0].id);
  assert.equal(state.charges, 2);
  // A rejected ability spends nothing either: cancelling is always free.
  assert.equal(reduce(state, use('migrate', 'fox')).charges, 2);
  assert.equal(reduce(state, use('burrow', 'nobody')).charges, 2);
});

// ---- determinism and invariants under abilities ---------------------------

test('AC-202 the same inputs including abilities replay to the same board', () => {
  const play = () => {
    let s = createRun({ seed: 'det', difficulty: 'savanna', abilities: true });
    const script = [];
    for (let i = 0; i < 60 && s.status === STATUS.READY; i += 1) {
      const action = s.charges > 0 && s.dart === 0
        ? { type: ACTIONS.ABILITY, ability: 'stampede' }
        : chooseAction(s);
      script.push(action);
      s = reduce(s, action);
    }
    return { state: s, script };
  };
  const a = play();
  const b = play();
  assert.deepEqual(a.state.animals, b.state.animals);
  assert.equal(a.state.score, b.state.score);
  assert.equal(a.state.charges, b.state.charges);
  assert.deepEqual(runRecord(a.state), runRecord(b.state));
});

test('an ability turn leaves the board legal: no overlap, nothing floating', () => {
  for (const difficulty of Object.keys(DIFFICULTIES)) {
    for (let seed = 1; seed <= 4; seed += 1) {
      let s = createRun({ seed, difficulty, abilities: true });
      while (s.status === STATUS.READY && s.turn < 200) {
        const action = s.charges > 0 && s.dart === 0
          ? { type: ACTIONS.ABILITY, ability: ABILITY_IDS[s.turn % ABILITY_IDS.length],
            target: pickTarget(s, ABILITY_IDS[s.turn % ABILITY_IDS.length]) }
          : chooseAction(s);
        const next = reduce(s, action);
        s = next.lastAction && next.lastAction.type === 'REJECTED'
          ? reduce(s, chooseAction(s)) : next;
        assertLegal(s, `${difficulty}/${seed}/${s.turn}`);
      }
    }
  }
});

function pickTarget(state, ability) {
  if (ABILITIES[ability].target === 'animal') {
    return state.animals.length ? state.animals[0].id : undefined;
  }
  if (ABILITIES[ability].target === 'species') {
    const there = state.animals.find((a) => isMigratable(a.type));
    return there ? there.type : undefined;
  }
  return undefined;
}

function assertLegal(state, where) {
  const grid = new Set();
  for (const a of state.animals) {
    assert.ok(a.x >= 0 && a.x + a.size <= BOARD.width, `${where}: out of bounds`);
    assert.ok(a.y >= 0 && a.y < BOARD.height, `${where}: off the board`);
    for (let c = a.x; c < a.x + a.size; c += 1) {
      const key = `${c}:${a.y}`;
      assert.ok(!grid.has(key), `${where}: overlap at ${key}`);
      grid.add(key);
    }
  }
  // Nothing floats: every animal rests on the floor or on something.
  for (const a of state.animals) {
    if (a.y === 0) continue;
    const supported = state.animals.some(
      (o) => o.id !== a.id && o.y === a.y - 1 && o.x < a.x + a.size && a.x < o.x + o.size,
    );
    assert.ok(supported, `${where}: ${a.id} is floating at ${a.x},${a.y}`);
  }
  assert.ok(state.charges >= 0, `${where}: negative charges`);
  assert.ok(state.charges <= ABILITY_CHARGE_CAP + 1, `${where}: ${state.charges} charges held`);
}

test('the species a row of the sheet shows is the engine\'s own', () => {
  for (const id of ABILITY_IDS) {
    assert.equal(abilitySpecies(id), SPECIES[ABILITIES[id].species]);
  }
});
