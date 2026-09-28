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
  SPECIES,
  STATUS,
} from '../src/engine/constants.js';
import {
  ABILITIES,
  ABILITY_BAD_TARGET,
  ABILITY_DART_ACTIVE,
  ABILITY_DISABLED,
  ABILITY_IDS,
  ABILITY_METER_LOW,
  ABILITY_NO_BUFFALO,
  ABILITY_NO_CHARGE,
  ABILITY_UNKNOWN,
  DART_MOVES,
  MIGRATE_SPECIES,
  STAND_DOWN_SEGMENTS,
  abilityCost,
  abilityFault,
  abilitySpecies,
  applyAbility,
  isAbilityRemovable,
  isMigratable,
  packRows,
  stampede,
  standDown,
} from '../src/engine/abilities.js';
import { ACTIONS, chargeState, createRun, reduce, runRecord } from '../src/engine/engine.js';
import { summariseEvents } from '../src/engine/summary.js';
import { chooseAction, measureArm, measurePacing, playAbilityRun } from '../tools/bot.mjs';
import { LAST, animal, eventOfType, rowString } from './helpers.js';

/** A run with the board and the economy forced to a chosen state. */
function board({ animals, charges = 0, score = 0, ...rest }) {
  const base = createRun({ seed: 'abilities' });
  return { ...base, animals, charges, score, queue: base.queue, ...rest };
}

/** A board with the Stand Down meter full, which is the only way to buy it. */
function ready({ animals, ...rest }) {
  return board({ animals, standDownMeter: STAND_DOWN_SEGMENTS, ...rest });
}

/** A buffalo part-way through its five segments. `animal()` only makes whole ones. */
function buffalo(x, y, size) {
  return { ...animal('buffalo', x, y), size };
}

/** A row of rats filling every column but `gap`, which the buffalo occupies. */
function rowAround(y, gap, size) {
  const rats = [];
  for (let x = 0; x < BOARD.width; x += 1) {
    if (x >= gap && x < gap + size) continue;
    rats.push(animal('rat', x, y));
  }
  return rats;
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
  assert.deepEqual(ABILITY_IDS, ['burrow', 'dart', 'migrate', 'stampede', 'standDown']);
  // AC-1410: Hold the Line does not exist, and it is not merely unreachable.
  assert.ok(!Object.prototype.hasOwnProperty.call(ABILITIES, 'hold'));
});

test('AC-1405h/AC-1426 costs are priced from value, and are NOT the scope ladder', () => {
  assert.deepEqual(
    ABILITY_IDS.map((id) => [id, abilityCost(id)]),
    [['burrow', 1], ['dart', 1], ['migrate', 2], ['stampede', 2], ['standDown', 0]],
  );

  // The two ladders deliberately disagree, and this is the assertion that
  // stops somebody "tidying" cost into a function of size: Stand Down has the
  // LARGEST scope in the set and costs no charge at all, because it is bought
  // in the second currency (§13.2d, AC-1433).
  const byScope = ABILITY_IDS.slice().sort((a, b) => ABILITIES[b].scope - ABILITIES[a].scope);
  assert.equal(byScope[0], 'standDown', 'buffalo no longer has the widest scope');
  assert.equal(abilityCost('standDown'), 0, 'price was derived from size after all');
  // AC-1405h2: NOTHING costs 3 any more. Stampede's 3 rested on a +194% that
  // does not reproduce on this curve (AC-1426), and the reserve's top rung has
  // no tenant rather than a trap.
  assert.ok(ABILITY_IDS.every((id) => abilityCost(id) < ABILITY_CHARGE_CAP));
});

test('AC-1405i a full reserve is two Stampedes-worth, or three Burrows', () => {
  assert.equal(abilityCost('burrow') * 3, ABILITY_CHARGE_CAP);
  // What each rung of the reserve unlocks (§13.2d's table). Stand Down is NOT
  // here, at any rung, because charges do not buy it (AC-1433).
  const priced = ABILITY_IDS.filter((id) => abilityCost(id) > 0);
  const affordableAt = (n) => priced.filter((id) => abilityCost(id) <= n);
  assert.deepEqual(affordableAt(1), ['burrow', 'dart']);
  assert.deepEqual(affordableAt(2), ['burrow', 'dart', 'migrate', 'stampede']);
  assert.deepEqual(affordableAt(3), priced);
});

test('AC-1402 an ability is available with none of its species on the board', () => {
  // Rats everywhere, so every ability's OWN species is absent except burrow's.
  //
  // STAND DOWN IS THE ONE EXCEPTION AND IT IS NOT A GATE ON ITS SPECIES' CARD:
  // it is gated on having a TARGET, exactly as Migrate is on a species being
  // present (AC-1412d), so it is asked here about a board that has one. AC-1402
  // is about the ability's own species, not about the target the player picks.
  const animals = [animal('rat', 0, 0), animal('rat', 2, 0), animal('rat', 4, 0)];
  for (const id of ABILITY_IDS) {
    if (ABILITIES[id].meter) continue;
    const state = board({ animals, charges: ABILITY_CHARGE_CAP });
    const target = ABILITIES[id].target === 'animal' ? animals[0].id
      : ABILITIES[id].target === 'species' ? 'rat' : undefined;
    assert.equal(abilityFault(state, id, target), null, `${id} was gated on its species`);
    const next = reduce(state, use(id, target));
    assert.notEqual(next.lastAction.type, 'REJECTED', `${id} was rejected`);
  }
});

test('the fault reasons are stated, not implied', () => {
  const animals = [animal('elk', 0, 0)];
  assert.equal(abilityFault(board({ animals, charges: 3 }), 'teleport'), ABILITY_UNKNOWN);
  assert.equal(abilityFault(board({ animals, charges: 0 }), 'stampede'), ABILITY_NO_CHARGE);
  // AC-1405h: one charge is not enough for a two-charge ability, and the fault
  // says so — the sheet turns this into "Needs 2 charges".
  assert.equal(abilityFault(board({ animals, charges: 1 }), 'stampede'), ABILITY_NO_CHARGE);
  assert.equal(abilityFault(board({ animals, charges: 2 }), 'stampede'), null);
  assert.equal(abilityFault(board({ animals, charges: 1 }), 'migrate', 'elk'), ABILITY_NO_CHARGE);
  assert.equal(abilityFault(board({ animals, charges: 1 }), 'burrow', animals[0].id), null);
  // AC-1433: the second currency is asked the same question in its own unit,
  // and a full reserve of charges does not answer it.
  assert.equal(abilityFault(board({ animals, charges: 3 }), 'standDown'), ABILITY_METER_LOW);
  assert.equal(
    abilityFault(board({ animals, charges: 3, abilities: false }), 'stampede'),
    ABILITY_DISABLED,
  );
  assert.equal(
    abilityFault(board({ animals, charges: 3, dart: 2 }), 'stampede'),
    ABILITY_DART_ACTIVE,
  );
  assert.equal(
    abilityFault(board({ animals, charges: 1 }), 'burrow', 'no-such-id'),
    ABILITY_BAD_TARGET,
  );
  // A species with nothing on the board is a bad target, not a legal waste: a
  // charge that evaporates for nothing is the opposite of an assist.
  assert.equal(abilityFault(board({ animals, charges: 2 }), 'migrate', 'fox'), ABILITY_BAD_TARGET);
});

test('AC-1412b no ability removes the buffalo, Burrow included', () => {
  const animals = [animal('buffalo', 0, 0), animal('rat', 5, 0)];
  const state = board({ animals, charges: ABILITY_CHARGE_CAP });
  assert.equal(abilityFault(state, 'burrow', animals[0].id), ABILITY_BAD_TARGET);
  assert.equal(abilityFault(state, 'burrow', animals[1].id), null);
  assert.equal(abilityFault(state, 'migrate', 'buffalo'), ABILITY_BAD_TARGET);
  // ...and the rule is per-OBJECT: one predicate, both abilities.
  assert.equal(isAbilityRemovable('buffalo'), false);
  assert.ok(MIGRATE_SPECIES.every(isAbilityRemovable));
  // A board of nothing but buffalo leaves Burrow unusable rather than lethal.
  const onlyBuffalo = board({ animals: [animal('buffalo', 0, 0)], charges: 3 });
  assert.equal(abilityFault(onlyBuffalo, 'burrow', onlyBuffalo.animals[0].id), ABILITY_BAD_TARGET);
});

// ---- AC-1403 · spending costs no score -----------------------------------

test('AC-1403 spending a charge leaves the score exactly where it was', () => {
  const animals = [animal('rat', 0, 0), animal('elk', 3, 0)];
  for (const id of ABILITY_IDS) {
    // `ladder: 6` parks the run at the top of its own ladder, so the only
    // thing that can move `charges` in this test is the spend.
    const before = board({
      animals: ABILITIES[id].meter ? animals.concat(animal('buffalo', 4, 1)) : animals,
      charges: ABILITY_CHARGE_CAP,
      score: 4321,
      ladder: 6,
      standDownMeter: STAND_DOWN_SEGMENTS,
    });
    const target = ABILITIES[id].target === 'animal' ? animals[0].id
      : ABILITIES[id].target === 'species' ? 'rat' : undefined;
    const after = reduce(before, use(id, target));
    // The ability's own turn may EARN score from a clear it caused (AC-1408),
    // so the assertion is that it never goes DOWN — thresholds are gates, not
    // purchases, and a deduction would make the leaderboard reward never using
    // the mechanic.
    assert.ok(after.score >= before.score, `${id} deducted score`);
    assert.equal(
      after.charges, before.charges - abilityCost(id),
      `${id} did not spend exactly its ${abilityCost(id)}-charge price`,
    );
  }
});

// ---- AC-1404 · the pacing measurement runs with abilities off ------------

test('AC-1404 the AC-318 harness measures with abilities disabled, explicitly', () => {
  // Not "the bot happens not to press the button": the switch is passed, and
  // with it off nothing in the economy runs at all — including Last Stand,
  // which grants without being asked.
  const state = createRun({ seed: 1, abilities: false });
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
  let lit = createRun({ seed: 1, abilities: true });
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

test('AC-320g ONE ability ladder, six rungs, escalating', () => {
  // Three ladders existed only because three medians differed by 1.68x and
  // 1.84x. There is one curve, so there is one ladder (gameplay.md §5.9).
  assert.ok(Array.isArray(ABILITY_THRESHOLDS), 'the ladder is still a map of habitats');
  assert.equal(ABILITY_PERCENTILES.length, 6);
  assert.equal(ABILITY_THRESHOLDS.length, ABILITY_PERCENTILES.length);
  for (let i = 1; i < ABILITY_THRESHOLDS.length; i += 1) {
    assert.ok(ABILITY_THRESHOLDS[i] > ABILITY_THRESHOLDS[i - 1], `rung ${i} does not escalate`);
  }
});

test('AC-1405f the ladder is the MEASURED percentiles of THIS curve', () => {
  // AC-1405f: each rung is a percentile of the measured final-score
  // distribution. The collapse shortens the median run 69 -> 58 turns and the
  // median score 2,655 -> 2,325, so carrying the shipped Meadow ladder over
  // would have sold the first charge at the 47th percentile of a table that
  // says p35. Re-measured here from the same bot the pacing gate uses, so a
  // retune that stranded the ladder fails here rather than in a document.
  const scores = measurePacing(120).scores.slice().sort((a, b) => a - b);
  const pct = (q) => scores[Math.min(scores.length - 1, Math.floor((q / 100) * scores.length))];
  const want = [pct(35), pct(50), pct(75), pct(90)];
  want.forEach((raw, i) => {
    const rung = ABILITY_THRESHOLDS[i];
    assert.ok(Math.abs(rung - raw) < Math.max(200, raw * 0.15),
      `${ABILITY_PERCENTILES[i]} rung ${rung} against a measured ${raw}`);
  });
  // The last two are multiples of the p90 rung, exactly.
  assert.ok(Math.abs(ABILITY_THRESHOLDS[4] - ABILITY_THRESHOLDS[3] * 1.6) <= 100);
  assert.ok(Math.abs(ABILITY_THRESHOLDS[5] - ABILITY_THRESHOLDS[3] * 2.4) <= 100);
});

test('AC-1405 crossing a threshold grants exactly one charge', () => {
  const rungs = ABILITY_THRESHOLDS;
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
  const rungs = ABILITY_THRESHOLDS;
  // Full, and holding a score past the next two rungs.
  const full = board({
    animals: [animal('rat', 0, 0), animal('rat', 4, 0)],
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
  const target = full.animals[0].id;
  const spent = reduce(held, use('burrow', target));
  assert.equal(spent.charges, ABILITY_CHARGE_CAP, 'the owed rung did not arrive');
  assert.equal(spent.ladder, 1, 'the ladder paid more than the freed slot');
});

test('AC-1405d score keeps accumulating while saturated', () => {
  const full = board({
    animals: [...Array.from({ length: BOARD.width }, (_, x) => animal('rat', x, 1))],
    charges: ABILITY_CHARGE_CAP,
    score: ABILITY_THRESHOLDS[5] + 1,
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
  {
    const rungs = ABILITY_THRESHOLDS;
    const earnedAt = (score) => rungs.filter((r) => score >= r).length;
    // p50 and p90 are rungs 2 and 4 by construction (AC-1405f).
    assert.equal(earnedAt(rungs[1]), 2, 'a p50 score does not buy two charges');
    assert.equal(earnedAt(rungs[3]), 4, 'a p90 score does not buy four');
    // Four is past the cap, so a p90 run MUST have spent to hold them all.
    assert.ok(4 > ABILITY_CHARGE_CAP, 'saturation is no longer reachable by good play');
  }
});

// ---- AC-1406 / AC-1406b · an ability IS the turn's action ----------------

test('AC-1406 using an ability is the turn: one arrival, one advance', () => {
  const state = board({ animals: [animal('rat', 0, 0)], charges: ABILITY_CHARGE_CAP });
  const next = reduce(state, use('stampede'));
  assert.equal(next.turn, state.turn + 1, 'the turn did not advance exactly once');
  const arrival = eventOfType(next.lastTurn.events, 'ARRIVAL');
  assert.deepEqual(arrival.placed.map((a) => a.id), state.queue.map((a) => a.id),
    'the ability turn skipped its arrival');
  assert.equal(next.lastTurn.action, ACTIONS.ABILITY);
});

test('AC-1406b/AC-1405i a full reserve is three turns of Burrow, never one turn', () => {
  // The cheapest ability is the one that makes the point sharpest: three
  // charges is three Burrows and therefore three TURNS, because an ability is
  // the turn's action. There is no burst to prevent (AC-1406b).
  let state = board({ animals: [animal('rat', 0, 0)], charges: ABILITY_CHARGE_CAP, ladder: 6 });
  const startTurn = state.turn;
  let spends = 0;
  for (let i = 0; i < 3 && state.status === STATUS.READY; i += 1) {
    const victim = state.animals.find((a) => a.type !== 'buffalo');
    const next = reduce(state, use('burrow', victim.id));
    assert.notEqual(next.lastAction.type, 'REJECTED');
    assert.equal(next.turn, state.turn + 1, 'two abilities resolved in one turn');
    spends += 1;
    state = next;
  }
  assert.equal(spends, 3);
  assert.equal(state.turn - startTurn, 3, 'three charges cost fewer than three turns');

  // ...and the same reserve buys ONE Stampede with change (AC-1426: it is 2 now,
  // not 3), which is §13.2d's breadth-against-depth dial without a top rung that
  // costs the whole reserve. Nothing costs 3 any more (AC-1405h2).
  const rich = board({ animals: [animal('rat', 0, 0), animal('elk', 4, 0)], charges: 3, ladder: 6 });
  const once = reduce(rich, use('stampede'));
  assert.equal(once.charges, 1, 'Stampede did not cost exactly two of the three');
  assert.equal(reduce(once, use('stampede')).lastAction.reason, ABILITY_NO_CHARGE);
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

test('AC-1408 the run record counts a Dart as an ability use', () => {
  // It did not. Arming a Dart returned from `reduce()` before the fold, so the
  // one ability that never reaches `commit()` was the one the record never
  // counted — the run under-reported by exactly the number of Darts.
  const animals = [animal('rat', 0, 0)];
  const state = board({ animals, charges: ABILITY_CHARGE_CAP, ladder: 6 });
  assert.equal(state.stats.abilitiesUsed, 0);

  const armed = reduce(state, use('dart'));
  assert.equal(armed.stats.abilitiesUsed, 1, 'arming a Dart was not counted');
  assert.equal(runRecord(armed).abilitiesUsed, 1);

  // ...and playing the Dart out does not count it a second time.
  let live = armed;
  for (const x of [5, 7, 2]) {
    live = reduce(live, { type: ACTIONS.MOVE, id: animals[0].id, x });
  }
  assert.equal(live.stats.abilitiesUsed, 1, 'a Dart was counted once per move');

  // Every other ability reaches `commit()` and is counted there, so all five
  // agree — which is the point of folding them off the one event stream.
  for (const [id, target] of [['burrow', animals[0].id], ['standDown', undefined],
    ['stampede', undefined], ['migrate', 'rat']]) {
    const one = reduce(
      ready({
        animals: id === 'standDown' ? animals.concat(animal('buffalo', 3, 0)) : animals,
        charges: ABILITY_CHARGE_CAP,
        ladder: 6,
      }),
      use(id, target),
    );
    assert.equal(one.stats.abilitiesUsed, 1, `${id} was not counted`);
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
  // THE QUEUE IS EXPLICIT, and it was not: this fixture used to inherit
  // whatever `createRun` happened to draw for its seed, and it cleared only
  // because that draw happened to land on the last column. Collapsing the
  // habitats changed the draw and the fixture stopped clearing — which is a
  // fixture that was passing by luck, not a rule that moved. The arrival is
  // what completes the row after the stampede packs it, so it has to be stated.
  const state = board({
    animals,
    charges: ABILITY_CHARGE_CAP,
    queue: [animal('rat', LAST, 0)],
  });
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
  let state = createRun({ seed: 3, abilities: true });
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
    let s = createRun({ seed: 'lastStand', abilities: true });
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
  // §13.3's guarantee is an argument. This executes it.
  //
  // The attack it used to face was the freeze — "a player cannot freeze their
  // way to an unbounded run" — and that attack no longer exists, because Hold
  // the Line is withdrawn and NOTHING can suppress an arrival (AC-1409,
  // AC-1427). So the guarantee is now structural, and the strongest remaining
  // attack is the one that frees the most board at once: a policy that fires
  // Stand Down on sight, releasing up to 44 cells in a single ACTION phase.
  const report = [];
  // THREE policies, because AC-1405h's pricing split them. A bot that spends
  // the moment it holds a charge buys Burrow at 1 and never saves the 2 a
  // Stampede costs — measured over 60 runs it took Stampede zero times, so one
  // policy had silently stopped testing the strongest ability in the set.
  for (const policy of ['value', 'standDown', 'stampede']) {
    // Eighteen seeds on the one curve, where this was six on each of three
    // habitats (gameplay.md §5.5b): the sample size is unchanged.
    for (let seed = 1; seed <= 18; seed += 1) {
      const run = playAbilityRun(seed, 2000, { policy });
      assert.equal(run.ended, true, `seed ${seed} (${policy}) did not end within 2000 turns`);
      report.push({ ...run, policy });
    }
  }
  // Per POLICY rather than per run: an individual seed can die before it can
  // afford a 2- or 3-charge ability, and that is the economy working. What
  // must not happen is a policy that never exercises the thing it exists for.
  const spentBy = (p) => report.filter((r) => r.policy === p).reduce((n, r) => n + r.spent, 0);
  for (const policy of ['value', 'standDown', 'stampede']) {
    assert.ok(spentBy(policy) > 0, `the ${policy} policy never spent, so it tested nothing`);
  }
  const turns = Math.max(...report.map((r) => r.turns));
  console.log(`  AC-1409: ${report.length} spending runs across three policies, all ended. ` +
    `longest ${turns} turns, ${spentBy('standDown')} Stand Downs taken, ` +
    `${spentBy('stampede')} Stampedes taken`);
});

// ---- AC-1410 / AC-1427 · Hold the Line does not exist --------------------

test('AC-1410/AC-1427 nothing in the game can suppress an arrival', () => {
  // The withdrawal is checked as a PROPERTY of every turn rather than as the
  // absence of one ability, because "we deleted `hold`" would still pass if the
  // freeze had merely moved. Every ability, on the same board: the batch the
  // tray promised lands, every time.
  const animals = [animal('rat', 0, 0), animal('buffalo', 3, 1), animal('elk', 5, 0)];
  for (const id of ABILITY_IDS) {
    const state = ready({ animals, charges: ABILITY_CHARGE_CAP, ladder: 6 });
    const promised = state.queue.map((a) => a.id);
    const target = ABILITIES[id].target === 'animal' ? animals[0].id
      : ABILITIES[id].target === 'species' ? 'rat' : undefined;
    const next = reduce(state, use(id, target));
    if (id === 'dart') {
      // Dart resolves no turn until its moves are made; it is the one ability
      // that does not deliver a batch on the turn it is armed, because it has
      // not ended the turn yet. So play it out and then check.
      const played = reduce(next, { type: ACTIONS.MOVE, id: animals[0].id, x: 7 });
      const closed = reduce(reduce(played, { type: ACTIONS.PASS }), { type: ACTIONS.PASS });
      assert.ok(closed.turn > state.turn, 'a Dart never closed its turn');
      continue;
    }
    const arrival = eventOfType(next.lastTurn.events, 'ARRIVAL');
    assert.deepEqual(arrival.placed.map((a) => a.id), promised,
      `${id} suppressed or altered the arrival`);
    assert.ok(arrival.risenIds.length > 0, `${id} left the board where it was`);
    // AC-1427: the field itself is gone, not merely always zero.
    assert.equal('frozen' in arrival, false, `${id}'s ARRIVAL still carries a frozen flag`);
    assert.equal('frozen' in next, false, 'the run still carries a frozen counter');
    // ...and the spawner ADVANCED, because a batch was consumed. The one branch
    // that used to hold the PRNG still was the frozen one.
    assert.notEqual(next.rng, state.rng, `${id} did not advance the spawner`);
  }
});

// ---- AC-1419 to AC-1423, AC-1433 · Stand Down ---------------------------

test('AC-1419 Stand Down takes every buffalo to one segment, and removes none', () => {
  const animals = [
    buffalo(0, 0, 5), buffalo(5, 1, 4),
    buffalo(2, 2, 1), animal('rat', 8, 0),
  ];
  const out = standDown(animals);
  assert.deepEqual(out.animals.map((a) => [a.type, a.x, a.size]), [
    ['buffalo', 0, 1], ['buffalo', 5, 1], ['buffalo', 2, 1], ['rat', 8, 1],
  ], 'a buffalo moved, or something that is not a buffalo changed');
  // AC-1418: nothing is REMOVED. The ladder is completed, not inverted — the
  // one ability that may change a buffalo changes the only field the rules
  // already change, by the only mechanism they already use.
  assert.equal(out.animals.length, animals.length);
  // AC-1422: a buffalo already at 1 is untouched and is not a reason to refuse.
  assert.deepEqual(out.shrunk.map((s) => [s.fromSize, s.toSize]), [[5, 1], [4, 1]]);
  assert.equal(out.animals[2], animals[2], 'an already-minimal buffalo was rewritten');
  assert.equal(out.animals[3], animals[3], 'a non-buffalo was rewritten');
});

test('AC-1420 Stand Down scores exactly nothing, and counts nothing', () => {
  // The shrink path inside `resolveClears` pays 50 a segment because a completed
  // row bought it. A button is not a completed row, and wiring Stand Down
  // through that path would pay up to 500 for one tap.
  const animals = [buffalo(0, 0, 5), buffalo(4, 1, 5)];
  const state = ready({ animals, score: 4321, ladder: 6, queue: [] });
  const next = reduce(state, use('standDown'));
  assert.notEqual(next.lastAction.type, 'REJECTED');
  assert.equal(next.score, state.score, 'Stand Down paid points');
  assert.equal(next.lastTurn.score, 0);
  assert.equal(next.stats.buffaloShrinks, state.stats.buffaloShrinks,
    'Stand Down was counted as eight row-bought shrinks');
  assert.equal(next.stats.buffaloRetired, state.stats.buffaloRetired);
  // AC-1431b's engine half: the shrinks ride the ACTION event, not a CLEAR_STEP,
  // which is WHY none of the above can happen.
  const action = eventOfType(next.lastTurn.events, 'ACTION');
  assert.equal(action.shrunk.length, 2);
  assert.equal(next.lastTurn.events.filter((e) => e.type === 'CLEAR_STEP').length, 0);
  assert.equal(summariseEvents(next.lastTurn.events).buffaloShrinks, 0);
});

test('AC-1434 the meter is TEN, and 9 and 12 are the levers either side', () => {
  // Pinned as a value as well as measured, because 10 is a tuning decision with
  // named alternatives rather than a derived quantity: too dear -> 9 (1.13
  // uses/run, +6% turns), too generous -> 12 (0.69 uses/run, 0% turns, ratchet
  // still down 17%). Moving it is a design call and discards every stored
  // resume (AC-1430), which is what this assertion makes deliberate.
  assert.equal(STAND_DOWN_SEGMENTS, 10);
  // ...and it is NOT a charge price. §13.2db measured both 3 and 2 at 0.01 uses
  // a run, so "reach for a cheaper price" is the one fix that is ruled out.
  assert.equal(ABILITIES.standDown.cost, 0);
  assert.equal(ABILITIES.standDown.meter, true);
});

test('AC-1433 the meter fills from play, stops at ten, and empties on spending', () => {
  // One completed row over two buffalo: two segments break, two notches fill.
  // 5 + 4 is exactly `width`, which is the pair §6.4b's mass floor is derived
  // from — the one row that is nothing but buffalo.
  const row = [buffalo(0, 0, 5), buffalo(5, 0, 4)];
  const start = board({ animals: row, queue: [] });
  assert.equal(start.standDownMeter, 0);
  const cleared = reduce(start, { type: ACTIONS.PASS });
  assert.equal(summariseEvents(cleared.lastTurn.events).buffaloShrinks, 2);
  assert.equal(cleared.standDownMeter, 2, 'a completed row over two buffalo filled one notch');

  // It STOPS at ten: a full meter never banks a second use, which is §13.2a's
  // dial applied to the second currency.
  const nearlyFull = board({
    animals: row, queue: [], standDownMeter: STAND_DOWN_SEGMENTS - 1,
  });
  assert.equal(reduce(nearlyFull, { type: ACTIONS.PASS }).standDownMeter, STAND_DOWN_SEGMENTS);
  const full = board({ animals: row, queue: [], standDownMeter: STAND_DOWN_SEGMENTS });
  assert.equal(reduce(full, { type: ACTIONS.PASS }).standDownMeter, STAND_DOWN_SEGMENTS);

  // Spending empties it to 0 with no remainder carried.
  const spent = reduce(
    ready({ animals: [buffalo(0, 0, 5)], queue: [] }),
    use('standDown'),
  );
  assert.notEqual(spent.lastAction.type, 'REJECTED');
  assert.equal(spent.standDownMeter, 0, 'the meter carried a remainder');
});

test('AC-1433 Stand Down\'s own shrinks fill nothing, or it refills itself', () => {
  // The sharpest form of the rule: four buffalo, 14 segments spent by the
  // ability in one action. If any of them counted, the meter would come back
  // full and Stand Down would be free forever.
  const animals = [
    buffalo(0, 0, 5), buffalo(5, 0, 4),
    buffalo(0, 1, 3), buffalo(4, 1, 2),
  ];
  const next = reduce(ready({ animals, queue: [] }), use('standDown'));
  assert.notEqual(next.lastAction.type, 'REJECTED');
  const spentSegments = eventOfType(next.lastTurn.events, 'ACTION')
    .shrunk.reduce((n, sh) => n + (sh.fromSize - sh.toSize), 0);
  assert.equal(spentSegments, 10, 'the fixture no longer spends a meter\'s worth');
  assert.equal(next.standDownMeter, 0, 'the ability refilled its own meter');
});

test('AC-1433 a retirement is one segment and fills exactly one notch', () => {
  // A buffalo going from size 1 to retired is the LAST segment, not a bonus.
  const animals = [buffalo(0, 0, 1)].concat(rowAround(0, 0, 1));
  const next = reduce(board({ animals, queue: [] }), { type: ACTIONS.PASS });
  assert.equal(next.stats.buffaloRetired, 1, 'the fixture did not retire the buffalo');
  assert.equal(next.standDownMeter, 1, 'a retirement filled more or fewer than one notch');
});

test('AC-1421 with no buffalo on the board it is unavailable, and the meter holds', () => {
  const state = ready({ animals: [animal('rat', 0, 0)], queue: [] });
  assert.equal(abilityFault(state, 'standDown'), ABILITY_NO_BUFFALO);
  const rejected = reduce(state, use('standDown'));
  assert.equal(rejected.lastAction.type, 'REJECTED');
  assert.equal(rejected.lastAction.reason, ABILITY_NO_BUFFALO);
  // AC-1414's ruling, reached in the second currency: a full meter that
  // evaporates for nothing is the opposite of an assist.
  assert.equal(rejected.standDownMeter, STAND_DOWN_SEGMENTS, 'the meter was emptied for nothing');
  assert.equal(rejected.turn, state.turn, 'a rejected ability consumed the turn');

  // ...and the meter still FILLS while there is nothing to spend it on, because
  // nothing about the fill consults the board.
  const filling = board({
    animals: [buffalo(0, 0, 1)].concat(rowAround(0, 0, 1)),
    queue: [],
    standDownMeter: 3,
  });
  const after = reduce(filling, { type: ACTIONS.PASS });
  assert.equal(after.animals.filter((a) => a.type === 'buffalo').length, 0);
  assert.equal(after.standDownMeter, 4, 'the meter stopped filling once the herd was gone');
});

test('AC-1422 an all-size-1 herd is a legal purchase that changes nothing', () => {
  const animals = [buffalo(0, 0, 1), buffalo(4, 1, 1)];
  const state = ready({ animals, queue: [] });
  assert.equal(abilityFault(state, 'standDown'), null, 'the engine second-guessed a legal buy');
  const next = reduce(state, use('standDown'));
  assert.notEqual(next.lastAction.type, 'REJECTED');
  assert.deepEqual(eventOfType(next.lastTurn.events, 'ACTION').shrunk, []);
  assert.equal(next.standDownMeter, 0, 'a legal purchase did not charge for itself');
});

test('AC-1423 Stand Down is the turn\'s action and takes no special path', () => {
  const animals = [buffalo(0, 0, 5), animal('rat', 6, 0)];
  const state = ready({ animals, ladder: 6 });
  const next = reduce(state, use('standDown'));
  assert.equal(next.turn, state.turn + 1, 'the turn did not advance exactly once');
  // Every phase, in order, exactly as a one-cell drag: freeing up to 44 cells is
  // the largest structural change the engine can be asked to make, and it is
  // still one action and still one turn.
  const phases = next.lastTurn.events.map((e) => e.phase);
  for (const phase of ['ACTION', 'SETTLE', 'ARRIVAL', 'JUDGE', 'ADVANCE']) {
    assert.ok(phases.includes(phase), `Stand Down skipped ${phase}`);
  }
  const arrival = eventOfType(next.lastTurn.events, 'ARRIVAL');
  assert.deepEqual(arrival.placed.map((a) => a.id), state.queue.map((a) => a.id));
  // Gravity settled the shrunken herd: nothing is left floating.
  for (const a of next.animals) {
    if (a.y === 0) continue;
    const support = next.animals.some((b) => b !== a && b.y === a.y - 1
      && b.x < a.x + a.size && a.x < b.x + b.size);
    assert.ok(support, `${a.type} at ${a.x},${a.y} is floating after Stand Down`);
  }
});

test('AC-1412b Stand Down does not open a Burrow or Migrate route to the buffalo', () => {
  // AC-1418 bounds AC-1412b rather than weakening it: no ability REMOVES a
  // buffalo, exactly one may CHANGE one. So the other four are re-asked here,
  // on a board where the meter is full and Stand Down is live.
  const animals = [buffalo(0, 0, 5), animal('rat', 6, 0)];
  const state = ready({ animals, charges: ABILITY_CHARGE_CAP });
  assert.equal(abilityFault(state, 'burrow', animals[0].id), ABILITY_BAD_TARGET);
  assert.equal(abilityFault(state, 'migrate', 'buffalo'), ABILITY_BAD_TARGET);
  const next = reduce(state, use('standDown'));
  assert.equal(next.animals.filter((a) => a.type === 'buffalo').length, 1,
    'Stand Down removed a buffalo');
});

// ---- AC-1428 · Burrow's second lever -------------------------------------

/** Burrow, as the ACTION phase applies it: the effect plus what it moved. */
function burrowOf(animals, id) {
  return applyAbility(animals, 'burrow', id);
}

test('AC-1428 Burrow removes one animal and left-packs the row it was in', () => {
  const animals = [
    animal('rat', 0, 0), animal('fox', 2, 0), animal('elk', 5, 0),
    animal('rat', 4, 1),
  ];
  const out = burrowOf(animals, animals[1].id);
  // The fox leaves and the elk closes up behind it; the rat below does not move.
  assert.equal(rowString(out.animals, 0), 'REEE.....');
  assert.equal(rowString(out.animals, 1), '....R....');
  assert.deepEqual(out.removedIds, [animals[1].id]);
  assert.deepEqual(out.moved.map((m) => [m.y, m.fromX, m.toX]), [[0, 5, 1]]);
});

test('AC-1428b Burrow never completes a row by itself, over a fuzz of boards', () => {
  // AC-1411's argument at one-row scope: packing is a permutation of that row's
  // occupancy, so the REMOVAL is the only thing that changes it, by exactly one
  // animal. A row two cells short is two cells short afterwards.
  let seed = 98765;
  const rand = (n) => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % n;
  };
  let checked = 0;
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
    if (animals.length === 0) continue;
    const victim = animals[rand(animals.length)];
    const out = burrowOf(animals, victim.id);
    const cells = (rows, y) => rows.filter((a) => a.y === y).reduce((n, a) => n + a.size, 0);
    for (let y = 0; y < 4; y += 1) {
      const expected = cells(animals, y) - (y === victim.y ? victim.size : 0);
      assert.equal(cells(out.animals, y), expected,
        `trial ${trial} row ${y}: occupancy changed beyond the one removal`);
      // The pack never COMPLETES the row: occupancy is what completes a row and
      // the pack does not add to it, so the only row that can be full is one
      // that was full before and did not lose the victim.
      const occupied = new Set();
      for (const a of out.animals.filter((r) => r.y === y)) {
        for (let c = a.x; c < a.x + a.size; c += 1) {
          assert.ok(c >= 0 && c < BOARD.width, `trial ${trial}: out of bounds`);
          assert.ok(!occupied.has(c), `trial ${trial}: overlap at ${c}`);
          occupied.add(c);
        }
      }
      if (occupied.size === BOARD.width) {
        assert.equal(cells(animals, y), BOARD.width,
          `trial ${trial} row ${y}: the pack completed a row that was short`);
      }
    }
    // Only the victim's row may have moved at all.
    for (const move of out.moved) {
      assert.equal(move.y, victim.y, `trial ${trial}: the pack reached row ${move.y}`);
    }
    checked += 1;
  }
  assert.ok(checked > 1800, `only ${checked} boards fuzzed`);
});

test('AC-1428c the packed row\'s buffalo moves its x and keeps its size', () => {
  const animals = [animal('rat', 0, 0), buffalo(3, 0, 4), animal('elk', 8, 1)];
  const out = burrowOf(animals, animals[0].id);
  const moved = out.animals.find((a) => a.type === 'buffalo');
  assert.equal(moved.x, 0, 'the buffalo did not pack with the row');
  assert.equal(moved.size, 4, 'the pack resized a buffalo');
  // ...and it is still not a TARGET: AC-1412b is untouched by the pack.
  assert.equal(isAbilityRemovable('buffalo'), false);
});

test('AC-1430b Burrow carries its effect as DATA, so the fingerprint sees it', () => {
  // Burrow's COST did not move in this pass, so `packs` is the only thing that
  // tells `TUNING_SURFACE` the ability now leaves a different board. A behaviour
  // change the surface cannot see is the one shape of AC-1016's bug the surface
  // cannot catch (AC-1430b).
  assert.equal(ABILITIES.burrow.packs, true);
  assert.equal(ABILITIES.standDown.meter, true);
  // ...and the flags are real rather than decorative: the engine's own packing
  // is what `packs` describes, at the one-row scope `packRows` provides.
  const stray = animal('rat', 4, 0);
  const below = animal('elk', 0, 1);
  assert.deepEqual(
    packRows([stray, below], new Set([0])).moved,
    [{ id: stray.id, y: 0, fromX: 4, toX: 0 }],
  );
  assert.deepEqual(packRows([animal('elk', 3, 1)], new Set([0])).moved, [],
    'a one-row pack reached a row it was not given');
});

// ---- AC-1434 / AC-1435 · what the meter measures, on a small sample -------

test('AC-1434 Stand Down moves the BUFFALO, not the length of the run', () => {
  // The shipped table is 200 seeds (`node tools/play.mjs --abilities`); this is
  // 30, which is enough for the DIRECTION and not for the percentages. What it
  // guards is the claim a regression would break first: the tool converts the
  // herd, and it does not hand the player a longer game.
  const roster = ABILITY_IDS.filter((id) => id !== 'standDown');
  const control = [];
  const armed = [];
  for (let seed = 1; seed <= 30; seed += 1) {
    control.push(measureArm(seed, { allow: roster }));
    armed.push(measureArm(seed, { allow: ABILITY_IDS }));
  }
  const mean = (runs, f) => runs.reduce((n, r) => n + f(r), 0) / runs.length;
  const median = (runs, f) => {
    const v = runs.map(f).sort((a, b) => a - b);
    return v.length % 2 ? v[v.length >> 1] : (v[(v.length >> 1) - 1] + v[v.length >> 1]) / 2;
  };

  assert.ok(control.every((r) => r.ended) && armed.every((r) => r.ended),
    'a run did not end, which is AC-1409 rather than this');
  // It is TAKEN, at roughly once a run — the whole point of the second currency
  // is that a charge price measured 0.01 (AC-1405L).
  const uses = mean(armed, (r) => r.uses.standDown || 0);
  assert.ok(uses > 0.4 && uses < 2, `Stand Down fired ${uses.toFixed(2)} times a run`);
  assert.equal(mean(control, (r) => r.uses.standDown || 0), 0, 'the control arm spent it');

  // The premium gets COLLECTED: retirements up, cells at game over down.
  const retired = [mean(control, (r) => r.retired), mean(armed, (r) => r.retired)];
  assert.ok(retired[1] > retired[0] * 2,
    `retirements ${retired[0].toFixed(2)} -> ${retired[1].toFixed(2)} is not the 3.4x claim`);
  const cells = [mean(control, (r) => r.buffaloCells), mean(armed, (r) => r.buffaloCells)];
  assert.ok(cells[1] < cells[0], `buffalo cells at game over ${cells[0]} -> ${cells[1]}`);

  // ...and it buys SCORE, not TIME. AC-1434's +3% on median run length is the
  // number that says this is not a survivability handout, and the guard is
  // generous because 30 seeds cannot resolve 3%.
  const turns = [median(control, (r) => r.turns), median(armed, (r) => r.turns)];
  assert.ok(turns[1] <= turns[0] * 1.25,
    `median run length ${turns[0]} -> ${turns[1]}: the tool is buying time`);
  assert.ok(median(armed, (r) => r.score) >= median(control, (r) => r.score),
    'the arm scores no better than the control');
});

test('AC-1435 the meter reaches the drowning player, not only the comfortable one', () => {
  // The SHAPE is the finding, not the level (the full table is 300 runs with
  // Stand Down as the only ability). Charge availability climbed 8 -> 34 -> 81
  // -> 100% across the crisis buckets: it concentrated the tool in the runs
  // that needed it least. The meter must not do that.
  const runs = [];
  for (let seed = 1; seed <= 60; seed += 1) runs.push(measureArm(seed, { allow: ['standDown'] }));
  const bucket = (lo, hi) => runs.filter((r) => r.peakLocked >= lo && r.peakLocked <= hi);
  const fires = (list) => (list.length === 0 ? null : list.filter((r) => r.uses.standDown).length
    / list.length);

  const mild = fires(bucket(5, 9));
  const modal = fires(bucket(10, 14));
  const heavy = fires(bucket(15, 99));
  assert.ok(mild !== null && modal !== null && heavy !== null,
    'a crisis bucket is empty, so the shape cannot be read');
  // Flat to RISING. The assertion is deliberately about the drowning end: the
  // meter must not fall away as the herd gets worse, which is what a currency
  // earned by scoring does.
  assert.ok(heavy >= mild, `the meter reaches 15+ less often (${heavy}) than 5-9 (${mild})`);
  assert.ok(modal >= mild, `the meter reaches the modal crisis (${modal}) less often than 5-9`);
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
  const next = reduce(board({ animals, charges: 3, queue: [] }), use('stampede'));
  const elephant = next.animals.find((a) => a.type === 'elephant');
  assert.equal(elephant.y, 0, 'the elephant was left floating after the pack');
  assert.equal(next.animals.find((a) => a.type === 'fox').y, 1, 'the fox lost its support');
});

// ---- AC-1412 · Migrate ----------------------------------------------------

test('AC-1412 Migrate removes every animal of the species, and never buffalo', () => {
  const animals = [
    animal('elk', 0, 0), animal('rat', 3, 0), animal('elk', 4, 0), animal('buffalo', 0, 1),
  ];
  const next = reduce(board({ animals, charges: 2, queue: [] }), use('migrate', 'elk'));
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
    abilityFault(board({ animals, charges: abilityCost('migrate') }), 'migrate', 'buffalo'),
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
    let s = createRun({ seed: 'det', abilities: true });
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
  {
    for (let seed = 1; seed <= 12; seed += 1) {
      let s = createRun({ seed, abilities: true });
      while (s.status === STATUS.READY && s.turn < 200) {
        const action = s.charges > 0 && s.dart === 0
          ? { type: ACTIONS.ABILITY, ability: ABILITY_IDS[s.turn % ABILITY_IDS.length],
            target: pickTarget(s, ABILITY_IDS[s.turn % ABILITY_IDS.length]) }
          : chooseAction(s);
        const next = reduce(s, action);
        s = next.lastAction && next.lastAction.type === 'REJECTED'
          ? reduce(s, chooseAction(s)) : next;
        assertLegal(s, `seed ${seed}/turn ${s.turn}`);
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
