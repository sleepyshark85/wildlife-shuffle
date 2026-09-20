// AC-8xx, the motion half: the replay plan.
//
// Everything a clear animation does is decided here, by a pure function, from
// the event stream the engine already emitted. That is what makes AC-834
// checkable without a renderer: the plan is downstream of the board, and the
// board is downstream of nothing.
//
// The visual half — that the flash is actually white, that the collapse is
// actually visible — cannot be asserted in Node and is verified by driving the
// real app (see the report).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ACTIONS, createRun, reduce } from '../src/engine/engine.js';
import { BOARD } from '../src/engine/constants.js';
import { buildReplay, inDangerBand } from '../src/ui/replay.js';
import { runReducer } from '../src/ui/useGameRun.js';
import { MOTION, MOTION_SIZE, brighten } from '../src/ui/theme.js';
import { animal, fullRow, rowExcept } from './helpers.js';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));

/** The AC-504d fixture: a settled board whose cascade runs 10 steps deep. */
function deepChainBoard() {
  const file = path.join(TEST_DIR, 'fixtures', 'deep-board.json');
  return JSON.parse(readFileSync(file, 'utf8')).map((a, i) => ({ ...a, id: `deep-${i}` }));
}

/**
 * A board whose SETTLE really cascades in two steps.
 *
 * It has to be built with care, because the turn applies gravity BEFORE the
 * clear loop: anything that could simply fall into a gap does so first, and
 * then both rows complete in one step. A genuine step 2 needs an animal that
 * could not move until a clear released it.
 *
 *   row 2        . . . . . . . . . R      the rider, held up by the fox
 *   row 1        R R R R R R R R F F      full: this is what clears first
 *   row 0        R R R R R R R R R .      one short, at column 9
 *
 * Row 1 clears; the rider drops two rows into column 9; row 0 completes.
 */
function cascadeBoard() {
  const rider = animal('rat', 9, 2);
  return {
    rider,
    board: [
      ...rowExcept(0, [9]),
      ...Array.from({ length: 8 }, (_, x) => animal('rat', x, 1)),
      animal('fox', 8, 1),
      rider,
    ],
  };
}

/**
 * Resolve one PASS over a hand-built board and return { before, after, plan }.
 * The board is used verbatim — the turn's own SETTLE gravity is part of what is
 * under test, so it must not be pre-applied here.
 */
function turnOn(animals, queue = []) {
  const base = createRun({ seed: 'replay' });
  const before = { ...base, animals, queue };
  const after = runReducer(before, { type: ACTIONS.PASS });
  return { before, after, plan: after.plan };
}

// ---- the plan is derived, never a driver (AC-833, AC-834) ----------------

test('AC-834 the plan is additive: the board and the score are what reduce() said', () => {
  // The wrapper the state layer uses must not be able to change the game. If a
  // frame never plays, `state.animals` is still this.
  for (let s = 0; s < 12; s += 1) {
    let plain = createRun({ seed: `same-${s}`, difficulty: 'savanna' });
    let wrapped = createRun({ seed: `same-${s}`, difficulty: 'savanna' });
    for (let turn = 0; turn < 20 && plain.status === 'READY'; turn += 1) {
      plain = reduce(plain, { type: ACTIONS.PASS });
      wrapped = runReducer(wrapped, { type: ACTIONS.PASS });
      assert.deepEqual(wrapped.animals, plain.animals, `seed ${s} turn ${turn}: board`);
      assert.equal(wrapped.score, plain.score, `seed ${s} turn ${turn}: score`);
      assert.deepEqual(wrapped.stats, plain.stats, `seed ${s} turn ${turn}: stats`);
    }
  }
});

test('AC-201 buildReplay does not touch the board it is handed', () => {
  // The snapshot is taken before anything has run, because the fault this
  // guards against is an ALIAS: replaying the events over the caller's own
  // objects rather than over copies would rewrite the board it is describing,
  // and a snapshot taken afterwards would have been rewritten with it.
  const board = [...fullRow(0), animal('elk', 3, 1), animal('rat', 0, 2)];
  const snapshot = JSON.parse(JSON.stringify(board));
  const base = createRun({ seed: 'replay' });
  const after = reduce({ ...base, animals: board, queue: [] }, { type: ACTIONS.PASS });
  const plan = buildReplay(board, after.lastTurn);
  assert.deepEqual(board, snapshot, 'buildReplay rewrote the board it was given');
  assert.ok(plan.departures.length > 0, 'the fixture must actually clear');
});

// ---- the clear (ui.md §8.2a) --------------------------------------------

test('AC-511 a cleared animal is drawn exactly once, at the row it left from', () => {
  const { rider, board } = cascadeBoard();
  const { after, plan } = turnOn(board);

  const steps = after.lastTurn.events.filter((e) => e.type === 'CLEAR_STEP');
  assert.equal(steps.length, 2, 'the fixture must actually cascade');

  const removed = steps.flatMap((e) => e.removedIds.concat(e.retiredIds));
  assert.equal(plan.departures.length, removed.length);
  assert.deepEqual(
    plan.departures.map((d) => d.id).sort(),
    removed.slice().sort(),
    'every animal the engine removed is drawn leaving, and nothing else is',
  );
  // AC-511: exactly once. The same rows flashing twice is v1's C7.
  assert.equal(new Set(plan.departures.map((d) => d.id)).size, plan.departures.length);

  // The rider left from row 0, not from row 2 where it started: by the step
  // that took it, gravity had already moved it two rows. Only a replay of the
  // events over the pre-turn board knows that, and getting it wrong would draw
  // the clear happening in a row that is not the row that cleared.
  const drawn = plan.departures.find((d) => d.id === rider.id);
  assert.equal(drawn.y, 0);
  assert.equal(drawn.x, 9);
});

test('AC-807/AC-511 an animal that falls before it clears leaves from where it landed', () => {
  // The rat is floating three rows above the gap it completes. The turn's own
  // SETTLE gravity drops it; the clear then takes it. Drawing it leaving from
  // row 3 would show the clear happening in a row that did not clear.
  const faller = animal('rat', 9, 3);
  const { after, plan } = turnOn([...rowExcept(0, [9]), faller]);

  const gravity = after.lastTurn.events.find((e) => e.type === 'GRAVITY');
  assert.deepEqual(gravity.moved, [{ id: faller.id, fromY: 3, toY: 0 }]);

  const move = plan.moves[faller.id];
  assert.equal(move.keys[0].y, 0);
  assert.equal(move.keys[0].dur, MOTION.fall);
  assert.equal(plan.departures.find((d) => d.id === faller.id).y, 0);
});

test('AC-813/AC-813b the first step is announced 80 ms before it goes', () => {
  const { plan } = turnOn(cascadeBoard().board);
  const starts = [...new Set(plan.departures.map((d) => d.collapseAt))].sort((a, b) => a - b);
  assert.equal(starts.length, 2, 'two steps, two distinct collapse times');

  const first = plan.departures.find((d) => d.collapseAt === starts[0]);
  const second = plan.departures.find((d) => d.collapseAt === starts[1]);
  assert.equal(first.collapseAt - first.flashAt, MOTION.lead);
  assert.equal(second.collapseAt - second.flashAt, 0);

  // AC-813b: 320 ms total, 60 attack and 260 decay. The asymmetry is the spec.
  assert.equal(MOTION.flash, 320);
  assert.equal(MOTION.flashAttack, 60);
  assert.equal(MOTION.flashDecay, 260);
  // AC-813c: the flash outlives the step it announces, and is allowed to.
  assert.ok(MOTION.flash > MOTION.lead + MOTION.collapse);
});

test('AC-813d the collapse has somewhere to go, and the fade outlives it', () => {
  assert.equal(MOTION_SIZE.collapseScale, 0.85);
  assert.equal(MOTION_SIZE.collapseDrift, 6);
  assert.equal(MOTION.collapse, 110);
  assert.equal(MOTION.fadePast, 140);
});

test('AC-811 the screen shakes at three rows in one step, and not at two', () => {
  const two = turnOn([...fullRow(0), ...fullRow(1)]);
  assert.equal(two.after.lastTurn.events.find((e) => e.type === 'CLEAR_STEP').clearedRows.length, 2);
  assert.equal(two.plan.shakeAt, null);

  const three = turnOn([...fullRow(0), ...fullRow(1), ...fullRow(2)]);
  assert.equal(
    three.after.lastTurn.events.find((e) => e.type === 'CLEAR_STEP').clearedRows.length,
    3,
  );
  assert.ok(three.plan.shakeAt !== null);
});

// ---- the cap is presentation only (AC-825) ------------------------------

test('AC-825 a 10-step cascade replays as at most 6 units and still pays 17,100', () => {
  const before = { ...createRun({ seed: 1 }), streak: 5, animals: deepChainBoard(), queue: [] };
  const after = runReducer(before, { type: ACTIONS.PASS });

  // The engine resolved and scored every step (AC-504c/504d), untouched.
  assert.equal(after.score, 17100);
  assert.equal(after.stats.longestChain, 10);
  assert.equal(after.stats.buffaloRetired, 1);

  const steps = after.lastTurn.events.filter((e) => e.type === 'CLEAR_STEP');
  assert.ok(steps.length >= 10, `only ${steps.length} steps in the fixture`);

  // ...and the replay folds them into 6 animated units, losing nobody.
  const units = new Set(after.plan.departures.map((d) => `${d.flashAt}/${d.collapseAt}`));
  assert.ok(units.size <= 6, `${units.size} animated units`);
  const removed = steps.flatMap((e) => e.removedIds.concat(e.retiredIds));
  assert.deepEqual(after.plan.departures.map((d) => d.id).sort(), removed.slice().sort());
  assert.ok(after.plan.lockMs <= 1500);
});

// ---- buffalo (AC-508, AC-812) -------------------------------------------

test('AC-508/AC-812 a shrinking buffalo gets a new width and a shard, not a departure', () => {
  // A complete row containing a size-4 buffalo: everything else in the row
  // goes, the buffalo loses one segment, and the row does NOT clear (AC-506).
  const buff = animal('buffalo', 0, 0);
  const board = [buff, ...Array.from({ length: 6 }, (_, i) => animal('rat', 4 + i, 0))];
  const { after, plan } = turnOn(board);

  const step = after.lastTurn.events.find((e) => e.type === 'CLEAR_STEP');
  assert.deepEqual(step.shrunk, [{ id: buff.id, fromSize: 4, toSize: 3 }]);
  assert.equal(step.clearedRows.length, 0, 'a buffalo row does not clear');

  assert.equal(plan.departures.some((d) => d.id === buff.id), false);
  assert.deepEqual(plan.moves[buff.id].size, {
    at: plan.departures[0].collapseAt,
    dur: MOTION.buffaloShrink,
    to: 3,
  });
  // The segment that came off is the trailing one: the buffalo keeps its x.
  assert.equal(plan.shards.length, 1);
  assert.equal(plan.shards[0].x, buff.x + 3);
  // AC-813: a buffalo row is not announced as "going", because it is not.
  assert.equal(plan.flashes.length, 0);
  // ...but the player is told what happened.
  assert.ok(plan.floats.some((f) => f.text === 'BUFFALO −1'));
});

// ---- arrival (AC-809) ----------------------------------------------------

test('AC-809 every animal from the tray is given a flight from the tray', () => {
  const queue = [animal('fox', 0, 0), animal('elk', 4, 0)];
  const { after, plan } = turnOn([animal('rat', 9, 0)], queue);

  for (const arriving of queue) {
    const move = plan.moves[arriving.id];
    assert.ok(move && move.arrival, `${arriving.type} arrived with no flight`);
    assert.equal(move.arrival.dur, MOTION.arrival);
    assert.equal(move.arrival.trayX, arriving.x);
  }
  // The animal that was already on the board is pushed up, and gets no flight.
  const resident = after.animals.find((a) => a.type === 'rat');
  assert.equal(plan.moves[resident.id].arrival, null);
});

// ---- the danger band (AC-810) -------------------------------------------

test('AC-810 the pulse follows the band, and stops when it is clear', () => {
  assert.equal(inDangerBand([animal('rat', 0, BOARD.dangerBandLow - 1)]), false);
  assert.equal(inDangerBand([animal('rat', 0, BOARD.dangerBandLow)]), true);
  assert.equal(inDangerBand([animal('rat', 0, BOARD.dangerBandHigh)]), true);
  assert.equal(inDangerBand([]), false);
});

// ---- ui.md §5.4 ----------------------------------------------------------

test('ui.md §5.4 the grabbed edge brightens 12%, and clamps at white', () => {
  assert.equal(brighten('#000000', 0.12), '#000000');
  assert.equal(brighten('#646464', 0.12), '#707070'); // 100 -> 112
  assert.equal(brighten('#ffffff', 0.12), '#ffffff'); // clamped, not wrapped
  assert.notEqual(brighten('#D9A83C', MOTION_SIZE.edgeBrighten), '#D9A83C');
});
