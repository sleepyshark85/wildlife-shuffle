// AC-2xx turn structure, AC-3xx preview contract, AC-4xx move handling,
// AC-6xx score/streak integration, AC-7xx run lifecycle.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  BOARD,
  MAX_BATCH_CELLS,
  PHASE,
  PHASE_ORDER,
  SCORE,
  SPECIES,
  STATUS,
  STREAK_TURNS_AT_CAP,
} from '../src/engine/constants.js';
import {
  ACTIONS,
  canMove,
  createRun,
  currentBuffalo,
  queueCells,
  reduce,
  runIdPrefix,
  runRecord,
  streakPill,
} from '../src/engine/engine.js';
import { readFileSync as readFixture } from 'node:fs';

import { filledRows } from '../src/engine/board.js';
import { resolveClears } from '../src/engine/resolve.js';
import { summariseEvents } from '../src/engine/summary.js';
import { chooseAction } from '../tools/bot.mjs';
import { bandForTurn } from '../src/engine/spawn.js';
import { LAST, animal, fullRow, rowExcept } from './helpers.js';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const ENGINE_DIR = path.join(TEST_DIR, '..', 'src', 'engine');

/**
 * The AC-504d fixture, as the REDUCER sees it: a settled 9-wide board whose
 * cascade runs 7 steps deep, found by directed search over valid boards.
 *
 * The published fixture is 10 wide and stays that way in resolve.test.js,
 * because `resolveClears` takes its width as a parameter and a 10-step cascade
 * is worth keeping. The reducer does not take a width — it reads BOARD.width —
 * so running the old board through it silently stopped clearing anything
 * (4,650 instead of 17,100). This is the same board-narrowing drift as the
 * column literals, in fixture form.
 */
function deepChainBoard() {
  const file = path.join(TEST_DIR, 'fixtures', 'deep-board-9.json');
  return JSON.parse(readFixture(file, 'utf8')).map((a, i) => ({ ...a, id: `deep-${i}` }));
}

/** Play `count` turns with the greedy harness, restarting whenever a run ends. */
function play(state, count, onTurn) {
  let current = state;
  for (let i = 0; i < count; i++) {
    if (current.status !== STATUS.READY) {
      current = reduce(current, { type: ACTIONS.RESTART, seed: current.seed + 1 });
    }
    const before = current;
    current = reduce(current, chooseAction(current));
    if (onTurn) onTurn(before, current);
  }
  return current;
}

// ---- AC-201 / AC-213: the engine is pure ---------------------------------

test('AC-201/213 no engine file imports React, sets a timer, or uses ambient state', () => {
  const files = readdirSync(ENGINE_DIR).filter((f) => f.endsWith('.js'));
  assert.ok(files.length >= 6, 'the engine has files to check');
  for (const file of files) {
    const source = readFileSync(path.join(ENGINE_DIR, file), 'utf8');
    const code = source.replace(/^\s*\/\/.*$/gm, '');
    for (const banned of ['react', 'setTimeout', 'setInterval', 'Date.now', 'Math.random', 'console.']) {
      assert.ok(!code.includes(banned), `${file} must not contain "${banned}"`);
    }
    assert.ok(!/^export let /m.test(code), `${file} must not export mutable module state`);
  }
});

test('AC-201 the reducer never mutates the state it is given', () => {
  const state = createRun({ seed: 9 });
  const snapshot = structuredClone(state);
  reduce(state, { type: ACTIONS.PASS });
  assert.deepEqual(state, snapshot);
});

test('AC-202 the same state and action resolve to deeply equal results', () => {
  const state = createRun({ seed: 2024, difficulty: 'savanna' });
  const a = reduce(state, { type: ACTIONS.PASS });
  const b = reduce(state, { type: ACTIONS.PASS });
  assert.deepEqual(a, b);
});

test('AC-202/314 a whole run replays identically from its seed', () => {
  const run = (seed) => {
    let state = createRun({ seed, difficulty: 'savanna' });
    const trace = [];
    for (let i = 0; i < 25 && state.status === STATUS.READY; i++) {
      state = reduce(state, chooseAction(state));
      trace.push(state);
    }
    return { state, trace };
  };
  const first = run(31337);
  const second = run(31337);
  assert.deepEqual(first.state, second.state);
  assert.deepEqual(first.trace, second.trace);
});

// ---- AC-204/205/208/209/210: phase order and arrival ---------------------

test('AC-204 phases execute in exactly the specified order', () => {
  const state = createRun({ seed: 5 });
  const next = reduce(state, { type: ACTIONS.PASS });
  const phases = next.lastTurn.events.map((e) => e.phase);

  // Every phase that appears must appear in PHASE_ORDER order, contiguously.
  const seen = [];
  for (const phase of phases) if (seen[seen.length - 1] !== phase) seen.push(phase);
  assert.deepEqual(seen, PHASE_ORDER.filter((p) => phases.includes(p)));
  assert.deepEqual(seen, [PHASE.ACTION, PHASE.SETTLE, PHASE.ARRIVAL, PHASE.JUDGE, PHASE.ADVANCE]);
});

test('AC-205 gravity precedes every clear check within a phase', () => {
  const state = createRun({ seed: 77 });
  play(state, 120, (_before, after) => {
    const events = after.lastTurn.events;
    for (const phase of [PHASE.SETTLE, PHASE.ARRIVAL]) {
      const inPhase = events.filter((e) => e.phase === phase);
      const gravityAt = inPhase.findIndex((e) => e.type === 'GRAVITY');
      const firstClearAt = inPhase.findIndex((e) => e.type === 'CLEAR_STEP');
      assert.ok(gravityAt >= 0, `${phase} always runs gravity`);
      if (firstClearAt >= 0) assert.ok(gravityAt < firstClearAt);
    }
  });
});

test('AC-208 arrival raises every animal by 1 before placing the queue at y=0', () => {
  const state = createRun({ seed: 11 });
  const before = state.animals;
  const next = reduce(state, { type: ACTIONS.PASS });
  const arrival = next.lastTurn.events.find((e) => e.type === 'ARRIVAL');
  assert.deepEqual(arrival.risenIds.slice().sort(), before.map((a) => a.id).sort());
  assert.ok(arrival.placed.every((a) => a.y === 0));
});

test('AC-209 a stack with no arrival beneath it returns to its pre-arrival rows', () => {
  const base = createRun({ seed: 3 });
  const stack = [animal('fox', 0, 0), animal('fox', 0, 1)];
  const queued = [animal('elk', 6, 0)];
  const state = { ...base, animals: stack, queue: queued };

  const next = reduce(state, { type: ACTIONS.PASS });
  const ys = next.animals.filter((a) => a.type === 'fox').map((a) => a.y).sort();
  assert.deepEqual(ys, [0, 1], 'the stack settled straight back down');
});

test('AC-210 a stack with an arrival beneath it rises by exactly 1', () => {
  const base = createRun({ seed: 3 });
  const stack = [animal('fox', 0, 0), animal('fox', 0, 1)];
  const queued = [animal('rat', 0, 0)];
  const state = { ...base, animals: stack, queue: queued };

  const next = reduce(state, { type: ACTIONS.PASS });
  const ys = next.animals.filter((a) => a.type === 'fox').map((a) => a.y).sort();
  assert.deepEqual(ys, [1, 2]);
});

// ---- AC-214: identity ----------------------------------------------------

test('AC-214 no two animals share an id, across restarts in one session', () => {
  const seen = new Set();
  const record = (list, where) => {
    for (const a of list) {
      assert.ok(!seen.has(a.id), `duplicate animal id ${a.id} (${where})`);
      seen.add(a.id);
    }
  };

  let state = createRun({ seed: 1, difficulty: 'meadow' });
  record(state.animals, 'seeded board');
  record(state.queue, 'first tray');

  for (let run = 0; run < 4; run++) {
    for (let i = 0; i < 30 && state.status === STATUS.READY; i++) {
      state = reduce(state, chooseAction(state));
      const advance = state.lastTurn.events.find((e) => e.type === 'ADVANCE');
      if (advance) record(advance.queue, `run ${run} turn ${state.turn}`);
    }
    state = reduce(state, { type: ACTIONS.RESTART });
    record(state.animals, `run ${run + 1} seeded board`);
    record(state.queue, `run ${run + 1} first tray`);
  }
  assert.ok(seen.size > 100, `only ${seen.size} animals were checked`);
});

// ---- AC-301/302/312: the preview contract -------------------------------

test('AC-301/302/1306 the tray is a promise: 200 consecutive turns, zero tolerance', () => {
  let state = createRun({ seed: 1, difficulty: 'meadow' });
  let checked = 0;

  let runs = 1;
  for (let i = 0; i < 200; i++) {
    // The tray contract is about arrivals, not about how long a run lasts.
    // This used to assert READY here, which quietly made it a pacing test too:
    // at 9 columns the greedy bot tops out around turn 72 on Meadow and the
    // TRAY test failed. Run length is measured in test/pacing.test.js, where it
    // can be read; here it just restarts and keeps checking arrivals.
    if (state.status !== STATUS.READY) {
      state = reduce(state, { type: ACTIONS.RESTART, seed: state.seed + 1 });
      runs += 1;
    }
    const promised = state.queue.map((a) => ({ id: a.id, type: a.type, x: a.x, size: a.size }));
    const next = reduce(state, chooseAction(state));
    const arrival = next.lastTurn.events.find((e) => e.type === 'ARRIVAL');
    const delivered = arrival.placed.map((a) => ({ id: a.id, type: a.type, x: a.x, size: a.size }));

    assert.deepEqual(delivered, promised, `turn ${state.turn}: the arrival did not match the tray`);
    for (const a of arrival.placed) assert.equal(a.y, 0);
    checked += 1;
    state = next;
  }
  assert.equal(checked, 200);
  assert.ok(runs >= 2, 'the restart path is exercised, not just asserted');
});

test('AC-312 each advance generates exactly one new batch', () => {
  let state = createRun({ seed: 42 });
  for (let i = 0; i < 30; i++) {
    const previousQueue = state.queue;
    const next = reduce(state, chooseAction(state));
    if (next.status !== STATUS.READY) break;
    const advances = next.lastTurn.events.filter((e) => e.type === 'ADVANCE');
    assert.equal(advances.length, 1);
    assert.deepEqual(advances[0].queue, next.queue);
    assert.notDeepEqual(next.queue, previousQueue, 'the queue is replaced, not reused');
    assert.equal(advances[0].turn, next.turn);
    state = next;
  }
});

test('AC-313 a run opens on a seeded board at turn 1 with a tray and no score', () => {
  const state = createRun({ seed: 8, difficulty: 'savanna' });
  assert.equal(state.turn, 1);
  assert.equal(state.score, 0);
  assert.equal(state.streak, 0);
  assert.equal(state.status, STATUS.READY);
  assert.ok(state.animals.length > 0, 'two arrival batches have already landed');
  assert.ok(state.queue.length > 0, 'the tray shows the batch for turn 1');
  // The band is the TARGET the tray is drawn against, not a per-batch
  // guarantee: count-first draws a whole number of animals, so one tray
  // scatters around it (AC-307b). What holds for a single run is the cap; the
  // band shows up in the mean.
  assert.ok(queueCells(state) >= 1 && queueCells(state) <= MAX_BATCH_CELLS);
  const [low, high] = bandForTurn('savanna', 1);
  let cells = 0;
  for (let seed = 0; seed < 400; seed++) cells += queueCells(createRun({ seed, difficulty: 'savanna' }));
  const mean = cells / 400;
  assert.ok(mean > low && mean < high, `Savanna turn 1 tray mean ${mean.toFixed(2)} outside ${low}-${high}`);
});

// ---- AC-4xx: the rules half of movement ---------------------------------

test('AC-401 a legal move of non-zero distance resolves exactly one turn', () => {
  const base = createRun({ seed: 4 });
  const mover = animal('rat', 0, 0);
  const state = { ...base, animals: [mover], queue: [] };
  const next = reduce(state, { type: ACTIONS.MOVE, id: mover.id, x: 5 });
  assert.equal(next.turn, state.turn + 1);
  assert.equal(next.animals.find((a) => a.id === mover.id).x, 5);
});

test('AC-402 a zero-distance drag does not resolve a turn or change the board', () => {
  const state = createRun({ seed: 4 });
  const target = state.animals[0];
  const next = reduce(state, { type: ACTIONS.MOVE, id: target.id, x: target.x });
  assert.equal(next.turn, state.turn);
  assert.deepEqual(next.animals, state.animals);
  assert.deepEqual(next.queue, state.queue);
  assert.equal(next.lastAction.type, 'NOOP');
});

test('AC-403/406 an illegal move is rejected with a reason and costs no turn', () => {
  const base = createRun({ seed: 4 });
  const mover = animal('rat', 0, 0);
  const blocker = animal('rat', 2, 0);
  const state = { ...base, animals: [mover, blocker], queue: [] };

  const next = reduce(state, { type: ACTIONS.MOVE, id: mover.id, x: 4 });
  assert.equal(next.turn, state.turn);
  assert.deepEqual(next.animals, state.animals);
  assert.equal(next.lastAction.type, 'REJECTED');
  assert.equal(next.lastAction.reason, 'blocked');
  assert.equal(canMove(state, mover.id, 4), false);
  assert.equal(canMove(state, mover.id, 1), true);
});

test('AC-405 a player action never changes an animal row', () => {
  const base = createRun({ seed: 4 });
  const mover = animal('fox', 0, 3);
  const floor = animal('elephant', 0, 0);
  const state = { ...base, animals: [floor, mover], queue: [] };
  const next = reduce(state, { type: ACTIONS.MOVE, id: mover.id, x: 3 });
  const action = next.lastTurn.events[0];
  assert.equal(action.type, 'ACTION');
  assert.equal(action.y, 3, 'the action phase records the row and does not change it');
});

test('AC-411/412 Pass always advances the turn, even with no legal move', () => {
  const base = createRun({ seed: 4 });
  // Every column of row 0 is occupied, so nothing can slide anywhere. A buffalo
  // holds the row, so it does not simply clear itself away on the next gravity
  // pass — this is a board that is genuinely stuck until the player passes.
  // (No such board is reachable at READY in normal play: every complete row has
  // already resolved, and any row with a gap admits a one-column slide. Pass
  // exists so that the question never has to be answered at runtime.)
  const stuck = [animal('buffalo', 0, 0), ...rowExcept(0, [0, 1, 2, 3])];
  const state = { ...base, animals: stuck, queue: [animal('rat', 0, 0)] };

  let legalMoves = 0;
  for (const a of state.animals) {
    for (let x = 0; x + a.size <= BOARD.width; x++) {
      if (x !== a.x && canMove(state, a.id, x)) legalMoves += 1;
    }
  }
  assert.equal(legalMoves, 0, 'the fixture really has no legal move');

  const next = reduce(state, { type: ACTIONS.PASS });
  assert.equal(next.turn, state.turn + 1);
  assert.equal(next.status, STATUS.READY, 'no soft-lock');
});

// ---- AC-6xx: scoring through the reducer --------------------------------

test('AC-601/602 a single completed row scores exactly 100 on the first clear', () => {
  const base = createRun({ seed: 4 });
  const mover = animal('rat', LAST - 1, 0);
  const state = { ...base, animals: [...rowExcept(0, [LAST - 1, LAST]), mover], queue: [] };
  const next = reduce(state, { type: ACTIONS.MOVE, id: mover.id, x: LAST });
  assert.equal(next.score, 0, 'column 8 is now empty, so nothing completed');

  // A survivor high up keeps this from also being a Perfect Clear.
  const state2 = {
    ...base,
    animals: [...rowExcept(0, [LAST]), animal('rat', LAST, 4), animal('fox', 0, 8)],
    queue: [],
  };
  const next2 = reduce(state2, { type: ACTIONS.PASS });
  assert.equal(next2.score, 100);
  assert.equal(next2.stats.rowsCleared, 1);
});

test('AC-606b three consecutive single-row clears pay 100, 130 and 160', () => {
  const base = createRun({ seed: 4 });
  const survivor = () => animal('fox', 0, 9);

  let state = base;
  const perTurn = [];
  for (let i = 0; i < 3; i++) {
    const mover = animal('rat', LAST - 1, 6);
    state = { ...state, animals: [...rowExcept(0, [LAST]), mover, survivor()], queue: [] };
    const before = state.score;
    state = reduce(state, { type: ACTIONS.MOVE, id: mover.id, x: LAST });
    perTurn.push({ gained: state.score - before, mult: state.lastTurn.streakMult, streak: state.streak });
  }

  // The streak is incremented FIRST and then applied, so the multiplier a clear
  // is paid at is the one that clear just earned (AC-606).
  assert.deepEqual(perTurn.map((t) => t.gained), [100, 130, 160]);
  assert.deepEqual(perTurn.map((t) => t.mult), [1.0, 1.3, 1.6]);
  assert.deepEqual(perTurn.map((t) => t.streak), [1, 2, 3]);
  assert.equal(state.score, 390);
});

test('AC-606c the multiplier reaches x3.0 on the sixth clearing turn and stops', () => {
  const base = createRun({ seed: 4 });
  let state = base;
  const mults = [];
  for (let i = 0; i < 8; i++) {
    const mover = animal('rat', LAST - 1, 6);
    state = { ...state, animals: [...rowExcept(0, [LAST]), mover, animal('fox', 0, 9)], queue: [] };
    state = reduce(state, { type: ACTIONS.MOVE, id: mover.id, x: LAST });
    mults.push(state.lastTurn.streakMult);
  }
  assert.deepEqual(mults, [1.0, 1.3, 1.6, 2.0, 2.5, 3.0, 3.0, 3.0]);
});

test('AC-609b a pass whose arrival completes a row INCREMENTS the streak', () => {
  // The streak follows the board, not the input method.
  const base = createRun({ seed: 4 });
  const state = {
    ...base,
    streak: 4,
    animals: [...rowExcept(0, [4, 5]), animal('elk', 0, 9)],
    queue: [animal('fox', 4, 0)],
  };

  const next = reduce(state, { type: ACTIONS.PASS });
  assert.equal(next.lastTurn.cleared, true, 'the arrival completed row 0');
  assert.equal(next.streak, 5, 'streak 4 -> 5, not 4 -> 0');
  assert.equal(next.lastTurn.streakMult, 2.5, 'and it is paid at the 5th-turn multiplier');
  assert.equal(next.score, 250);
});

test('AC-609c a pass with no clear resets the streak, like any other quiet turn', () => {
  const base = createRun({ seed: 4 });
  const state = { ...base, streak: 4, animals: [animal('rat', 0, 0)], queue: [animal('rat', 5, 0)] };
  const next = reduce(state, { type: ACTIONS.PASS });
  assert.equal(next.lastTurn.cleared, false);
  assert.equal(next.streak, 0);
  assert.equal(next.score, 0);
});

test('AC-609d a pass that empties the board wins on rule 1: cap plus the bonus', () => {
  const base = createRun({ seed: 4 });
  const state = { ...base, streak: 2, animals: rowExcept(0, [4, 5]), queue: [animal('fox', 4, 0)] };
  const next = reduce(state, { type: ACTIONS.PASS });

  assert.equal(next.animals.length, 0);
  assert.equal(next.stats.perfectClears, 1);
  assert.equal(next.streak, STREAK_TURNS_AT_CAP, 'rule 1 beats rule 2');
  // The three clear steps were paid at the streak they earned (3rd = x1.6), and
  // the Perfect Clear bonus is flat on top.
  assert.equal(next.score, 160 + 1000);
});

test('AC-608 a turn with no clear in either phase resets the streak', () => {
  const base = createRun({ seed: 4 });
  const state = { ...base, streak: 3, animals: [animal('rat', 0, 0)], queue: [] };
  const next = reduce(state, { type: ACTIONS.MOVE, id: state.animals[0].id, x: 4 });
  assert.equal(next.lastTurn.cleared, false);
  assert.equal(next.streak, 0);
  assert.equal(next.lastTurn.streakMult, 1, 'and the pill reports nothing to show');
});

test('AC-613 a perfect clear pays a flat 1000 and pins the streak to its cap', () => {
  const base = createRun({ seed: 4 });
  const mover = animal('rat', LAST - 1, 1);
  const state = { ...base, animals: [...rowExcept(0, [LAST]), mover], queue: [] };
  const next = reduce(state, { type: ACTIONS.MOVE, id: mover.id, x: LAST });

  assert.equal(next.animals.length, 0);
  assert.equal(next.score, 1100, '100 for the row plus a flat 1000');
  assert.equal(next.stats.perfectClears, 1);
  assert.equal(next.streak, STREAK_TURNS_AT_CAP, 'straight to the x3.0 cap');
  assert.equal(next.streak, 6);
});

test('AC-614 turns are never worth points', () => {
  let state = createRun({ seed: 6, difficulty: 'meadow' });
  state = { ...state, animals: [], queue: [] };
  for (let i = 0; i < 10; i++) state = reduce(state, { type: ACTIONS.PASS });
  assert.equal(state.score, 0);
  assert.equal(state.turn, 11);
});

// ---- AC-7xx: run lifecycle ----------------------------------------------

test('AC-701/703 the run ends when an animal occupies the kill line, judged once', () => {
  const base = createRun({ seed: 4 });
  const column = Array.from({ length: 14 }, (_, y) => animal('rat', 0, y));
  const state = { ...base, animals: column, queue: [animal('rat', 0, 0)] };

  const next = reduce(state, { type: ACTIONS.PASS });
  assert.equal(next.status, STATUS.GAME_OVER);

  const judges = next.lastTurn.events.filter((e) => e.type === 'JUDGE');
  assert.equal(judges.length, 1, 'exactly one game-over check, in the JUDGE phase');
  assert.equal(judges[0].phase, PHASE.JUDGE);
  assert.ok(judges[0].offendingIds.length > 0);
  assert.equal(next.lastTurn.events.some((e) => e.type === 'ADVANCE'), false, 'no ADVANCE after game over');
  assert.equal(next.turn, state.turn, 'the turn counter stops');
});

test('AC-704 a nearly full board keeps playing while row 14 is clear', () => {
  const base = createRun({ seed: 4 });
  const column = Array.from({ length: 13 }, (_, y) => animal('rat', 0, y));
  const state = { ...base, animals: column, queue: [animal('rat', 5, 0)] };
  const next = reduce(state, { type: ACTIONS.PASS });
  assert.equal(next.status, STATUS.READY);
  assert.equal(Math.max(...next.animals.map((a) => a.y)), 12);
});

test('AC-702 no animal is ever left above the kill line', () => {
  let state = createRun({ seed: 1, difficulty: 'tundra' });
  for (let i = 0; i < 400; i++) {
    for (const a of state.animals) {
      assert.ok(a.y <= BOARD.killLine, `animal at y=${a.y} is off the board`);
      assert.ok(a.x >= 0 && a.x + a.size <= BOARD.width);
    }
    if (state.status !== STATUS.READY) {
      state = reduce(state, { type: ACTIONS.RESTART, seed: state.seed + 1 });
      continue;
    }
    state = reduce(state, chooseAction(state));
  }
});

test('AC-708 restarting starts a clean run and carries no state over', () => {
  let state = createRun({ seed: 5, difficulty: 'tundra' });
  state = play(state, 20);
  const restarted = reduce(state, { type: ACTIONS.RESTART });

  assert.equal(restarted.score, 0);
  assert.equal(restarted.turn, 1);
  assert.equal(restarted.streak, 0);
  assert.equal(restarted.status, STATUS.READY);
  assert.equal(restarted.difficulty, 'tundra');
  assert.deepEqual(restarted.stats, createRun({ seed: 1 }).stats);
  assert.ok(restarted.nextAnimalId >= state.nextAnimalId, 'ids keep climbing (AC-214)');
  assert.equal(restarted.runIndex, state.runIndex + 1);
});

test('AC-706/1308 the run record carries the seed and the four run stats', () => {
  let state = createRun({ seed: 99, difficulty: 'savanna' });
  state = play(state, 30);
  const record = runRecord(state);
  assert.equal(record.seed, 99);
  assert.equal(record.difficulty, 'savanna');
  for (const key of ['score', 'turns', 'rowsCleared', 'longestChain', 'buffaloRetired']) {
    assert.equal(typeof record[key], 'number', `${key} is recorded`);
  }
});

test('an ended run ignores further play actions', () => {
  const base = createRun({ seed: 4 });
  const column = Array.from({ length: 14 }, (_, y) => animal('rat', 0, y));
  const over = reduce({ ...base, animals: column, queue: [animal('rat', 0, 0)] }, { type: ACTIONS.PASS });
  assert.equal(over.status, STATUS.GAME_OVER);

  const ignored = reduce(over, { type: ACTIONS.PASS });
  assert.equal(ignored.turn, over.turn);
  assert.deepEqual(ignored.animals, over.animals);
  assert.equal(ignored.lastAction.reason, 'not-ready');
});

test('AC-506 a buffalo in another row is untouched when a row clears beneath it', () => {
  const base = createRun({ seed: 4 });
  const state = { ...base, animals: [...fullRow(0), animal('buffalo', 2, 1)], queue: [] };
  const next = reduce(state, { type: ACTIONS.PASS });

  assert.equal(next.stats.rowsCleared, 1, 'the non-buffalo row cleared');
  const buffalo = currentBuffalo(next);
  assert.ok(buffalo, 'the buffalo is still on the board');
  assert.equal(buffalo.size, SPECIES.buffalo.size, 'and at full size: its own row was never complete');
  assert.equal(buffalo.y, 0, 'it settled onto the floor');
  assert.equal(next.score, 100);
});

test('AC-311 a live buffalo makes the schedule skip a cycle', () => {
  const base = createRun({ seed: 12, difficulty: 'savanna' });
  const buffalo = animal('buffalo', 0, 0);

  // Turn 19 advances to turn 20, a scheduled buffalo turn, with one still alive.
  const alive = reduce({ ...base, turn: 19, animals: [buffalo], queue: [] }, { type: ACTIONS.PASS });
  assert.equal(alive.turn, 20);
  assert.equal(alive.queue.some((a) => a.type === 'buffalo'), false, 'no second buffalo');

  // With the board clear of buffalo, the next scheduled turn queues one.
  const clear = reduce({ ...base, turn: 29, animals: [], queue: [] }, { type: ACTIONS.PASS });
  assert.equal(clear.turn, 30);
  assert.equal(clear.queue.some((a) => a.type === 'buffalo'), true);
});

test('AC-507/610/611 a buffalo ground down to nothing retires and pays out', () => {
  const base = createRun({ seed: 12 });
  let state = { ...base, animals: [{ ...animal('buffalo', 0, 0), size: 1 }, ...rowExcept(0, [0]), animal('fox', 0, 9)], queue: [] };
  state = reduce(state, { type: ACTIONS.PASS });

  assert.equal(currentBuffalo(state), undefined, 'the buffalo left the board');
  assert.equal(state.stats.buffaloRetired, 1);
  assert.equal(state.score, 50 + SCORE.buffaloRetire, '50 for the final shrink plus retirement');
});

test('AC-610 a buffalo shrink scores 50 and the row refuses to clear', () => {
  const base = createRun({ seed: 12 });
  // The gaps are the buffalo's own footprint, derived: it grew from 4 cells
  // to 5 this round, and a hard-coded gap list would have left column 4 doubly
  // occupied rather than failing.
  const footprint = Array.from({ length: SPECIES.buffalo.size }, (_, i) => i);
  const state = { ...base, animals: [animal('buffalo', 0, 0), ...rowExcept(0, footprint)], queue: [] };
  const next = reduce(state, { type: ACTIONS.PASS });

  assert.equal(next.score, 50);
  assert.equal(next.stats.rowsCleared, 0);
  assert.equal(next.stats.buffaloShrinks, 1);
  assert.equal(currentBuffalo(next).size, SPECIES.buffalo.size - 1);
});

test('AC-513 a perfect clear does not sneak in an extra turn', () => {
  const base = createRun({ seed: 4 });
  const mover = animal('rat', LAST - 1, 1);
  const state = { ...base, animals: [...rowExcept(0, [LAST]), mover], queue: [] };
  const next = reduce(state, { type: ACTIONS.MOVE, id: mover.id, x: LAST });
  assert.equal(next.turn, state.turn + 1, 'exactly one turn passed');
  assert.equal(next.status, STATUS.READY);
});

// ---- run start, ids and purity ------------------------------------------

test('AC-313b/c/d seeding uses turn 1 bands, no buffalo, and scores nothing', () => {
  for (const difficulty of ['meadow', 'savanna', 'tundra']) {
    for (let seed = 0; seed < 300; seed++) {
      const state = createRun({ seed, difficulty });
      assert.ok(state.animals.length > 0, `${difficulty} seed ${seed} opened on an empty board`);
      assert.equal(state.animals.some((a) => a.type === 'buffalo'), false, 'AC-313c');
      assert.equal(state.score, 0, 'AC-313d');
      assert.equal(state.streak, 0, 'AC-313d');
      assert.equal(state.stats.rowsCleared, 0, 'no clearing turn is recorded for seeding');
      assert.equal(state.turn, 1);
      // AC-313b: both seeding batches and Q(1) are drawn from turn 1's band, so
      // the opening board can never exceed two turn-1 batches' worth of cells.
      // Two seeding batches have landed. Each is capped at W-1 by AC-303, and
      // that cap — not the band — is what bounds the opening board, because a
      // batch scatters around its target (AC-307b).
      assert.ok(state.animals.reduce((n, a) => n + a.size, 0) <= MAX_BATCH_CELLS * 2,
        `${difficulty} seed ${seed} opened over the two-batch cap`);
    }
  }
});

test('AC-214 two runs started independently never share an animal id', () => {
  const idsOf = (state) => new Set(state.animals.concat(state.queue).map((a) => a.id));
  const a = idsOf(createRun({ seed: 1 }));
  const b = idsOf(createRun({ seed: 2 }));
  const shared = [...a].filter((id) => b.has(id));
  assert.deepEqual(shared, [], 'createRun called directly must not reuse the id space');

  // Across difficulties and run indexes too.
  const seen = new Map();
  for (const difficulty of ['meadow', 'savanna', 'tundra']) {
    for (let seed = 0; seed < 40; seed++) {
      for (const runIndex of [1, 2, 3]) {
        const key = `${difficulty}/${seed}/${runIndex}`;
        for (const id of idsOf(createRun({ seed, difficulty, runIndex }))) {
          const owner = seen.get(id);
          assert.ok(owner === undefined, `id ${id} shared by ${owner} and ${key}`);
          seen.set(id, key);
        }
      }
    }
  }
});

test('AC-202 the same seed and run index still mint the same ids — replay needs it', () => {
  assert.deepEqual(createRun({ seed: 7 }), createRun({ seed: 7 }));
  assert.equal(runIdPrefix(7, 1, 'savanna'), createRun({ seed: 7 }).idPrefix);
  assert.notEqual(runIdPrefix(7, 1, 'savanna'), runIdPrefix(7, 2, 'savanna'), 'run index');
  assert.notEqual(runIdPrefix(7, 1, 'savanna'), runIdPrefix(8, 1, 'savanna'), 'seed');
  assert.notEqual(runIdPrefix(7, 1, 'savanna'), runIdPrefix(7, 1, 'tundra'), 'difficulty');
});

test('AC-201 the engine touches no ambient API at runtime, not just in source', () => {
  const originals = {
    random: Math.random,
    now: Date.now,
    setTimeout: globalThis.setTimeout,
    setInterval: globalThis.setInterval,
    log: console.log,
  };
  const trips = [];
  let engineTrips;
  let harnessTrips;

  Math.random = () => {
    trips.push('Math.random');
    return 0.5;
  };
  Date.now = () => {
    trips.push('Date.now');
    return 0;
  };
  globalThis.setTimeout = () => {
    trips.push('setTimeout');
    return 0;
  };
  globalThis.setInterval = () => {
    trips.push('setInterval');
    return 0;
  };
  console.log = () => {
    trips.push('console.log');
  };

  try {
    let state = createRun({ seed: 4242, difficulty: 'savanna' });
    for (let i = 0; i < 60; i++) {
      if (state.status !== STATUS.READY) state = reduce(state, { type: ACTIONS.RESTART });
      state = reduce(state, chooseAction(state));
    }
    engineTrips = trips.slice();

    // Prove the trap is armed.
    Math.random();
    Date.now();
    globalThis.setTimeout(() => {}, 0);
    console.log('x');
    harnessTrips = trips.slice();
  } finally {
    Math.random = originals.random;
    Date.now = originals.now;
    globalThis.setTimeout = originals.setTimeout;
    globalThis.setInterval = originals.setInterval;
    console.log = originals.log;
  }

  assert.deepEqual(engineTrips, [], 'the engine reached for an ambient API');
  assert.equal(harnessTrips.length, 4, 'the poison harness itself works');
});

test('AC-613 a turn can never register two Perfect Clears', () => {
  let state = createRun({ seed: 55, difficulty: 'meadow' });
  for (let i = 0; i < 300; i++) {
    if (state.status !== STATUS.READY) {
      state = reduce(state, { type: ACTIONS.RESTART, seed: state.seed + 1 });
      continue;
    }
    state = reduce(state, chooseAction(state));
    const perfects = state.lastTurn.events.filter((e) => e.type === 'PERFECT_CLEAR');
    assert.ok(perfects.length <= 1, `${perfects.length} Perfect Clears in one turn`);
    if (perfects.length === 1) assert.equal(state.lastTurn.perfectClear, true);
  }

  // The structural reason: an arrival occupies at most 9 of 10 columns, so the
  // board it lands on can never be emptied by the arrival's own resolution.
  const base = createRun({ seed: 4 });
  const emptied = reduce(
    { ...base, animals: rowExcept(0, [4, 5]), queue: [animal('fox', 4, 0)] },
    { type: ACTIONS.PASS },
  );
  assert.equal(emptied.lastTurn.events.filter((e) => e.type === 'PERFECT_CLEAR').length, 1);
});

// ---- multi-seed invariant fuzz -------------------------------------------

/** A cheap deterministic policy: no lookahead, so it reaches ragged boards fast. */
function fuzzAction(state, seedRef) {
  const options = [{ type: ACTIONS.PASS }];
  for (const a of state.animals) {
    for (let x = 0; x + a.size <= BOARD.width; x++) {
      if (x !== a.x && canMove(state, a.id, x)) options.push({ type: ACTIONS.MOVE, id: a.id, x });
    }
  }
  seedRef.value = (seedRef.value * 1103515245 + 12345) & 0x7fffffff;
  return options[seedRef.value % options.length];
}

test('invariants hold across 120 seeded runs on every difficulty', () => {
  let turnsPlayed = 0;
  let runsPlayed = 0;

  for (const difficulty of ['meadow', 'savanna', 'tundra']) {
    for (let seed = 500; seed < 540; seed++) {
      // Half the runs are played by the greedy bot, which packs the board and
      // reaches clears, chains and buffalo; half by a no-lookahead random
      // policy, which reaches ragged near-death boards the bot never builds.
      const greedy = seed % 2 === 0;
      let state = createRun({ seed, difficulty });
      runsPlayed += 1;
      const seedRef = { value: seed + 1 };
      const idsSeen = new Set(state.animals.concat(state.queue).map((a) => a.id));

      for (let turn = 0; turn < 120 && state.status === STATUS.READY; turn++) {
        const where = `${difficulty}/${seed}/turn ${state.turn}`;

        // READY-state invariants.
        assert.ok(state.animals.length > 0 || state.stats.perfectClears > 0, where);
        assert.deepEqual(filledRows(state.animals), [], `${where}: a completed row survived`);
        assert.ok(queueCells(state) <= MAX_BATCH_CELLS, `${where}: queue over 9 cells`);
        const columns = new Set();
        for (const a of state.animals) {
          assert.ok(a.y >= 0 && a.y <= BOARD.killLine, `${where}: y=${a.y}`);
          assert.ok(a.x >= 0 && a.x + a.size <= BOARD.width, `${where}: x=${a.x}`);
          assert.ok(a.size >= 1 && a.size <= 5, `${where}: size=${a.size}`);
        }
        for (const a of state.animals) {
          for (let c = a.x; c < a.x + a.size; c++) {
            const cell = `${a.y}:${c}`;
            assert.ok(!columns.has(cell), `${where}: two animals overlap at ${cell}`);
            columns.add(cell);
          }
        }
        assert.ok(
          state.animals.filter((a) => a.type === 'buffalo').length <= 1,
          `${where}: more than one buffalo`,
        );

        const promised = state.queue;
        state = reduce(state, greedy ? chooseAction(state) : fuzzAction(state, seedRef));
        turnsPlayed += 1;

        // The preview contract, on every single turn of the fuzz.
        const arrival = state.lastTurn.events.find((e) => e.type === 'ARRIVAL');
        assert.deepEqual(arrival.placed, promised, `${where}: arrival did not match the tray`);
        for (const a of arrival.placed) {
          assert.ok(!idsSeen.has(a.id) || promised.some((q) => q.id === a.id), `${where}: id reuse`);
          idsSeen.add(a.id);
        }
        assert.ok(state.score >= 0, `${where}: negative score`);
      }
    }
  }

  assert.equal(runsPlayed, 120);
  assert.ok(turnsPlayed > 3000, `only ${turnsPlayed} turns fuzzed`);
});

// ---- AC-706b: stats and score come from one source ----------------------

test('AC-706b resolveClears returns no counters — events are the only source', () => {
  // The structural guarantee. A second increment site is not merely discouraged,
  // it is impossible: the resolution hands back nothing to increment from.
  const result = resolveClears([...fullRow(0), animal('fox', 0, 1)], { phase: 'SETTLE' });
  assert.deepEqual(Object.keys(result).sort(), ['animals', 'events']);
});

test('AC-706b every statistic equals the one derived from the same events', () => {
  for (const difficulty of ['meadow', 'savanna', 'tundra']) {
    for (let seed = 700; seed < 712; seed++) {
      let state = createRun({ seed, difficulty });
      const running = {
        score: 0,
        rowsCleared: 0,
        longestChain: 0,
        buffaloRetired: 0,
        buffaloShrinks: 0,
        perfectClears: 0,
        longestStreak: 0,
      };

      for (let i = 0; i < 150 && state.status === STATUS.READY; i++) {
        state = reduce(state, chooseAction(state));

        // Independently folded here from the same array the engine published.
        const turn = summariseEvents(state.lastTurn.events);
        running.score += turn.score;
        running.rowsCleared += turn.rowsCleared;
        running.longestChain = Math.max(running.longestChain, turn.longestChain);
        running.buffaloRetired += turn.buffaloRetired;
        running.buffaloShrinks += turn.buffaloShrinks;
        running.perfectClears += turn.perfectClears;
        running.longestStreak = Math.max(running.longestStreak, turn.longestStreak);

        const where = `${difficulty}/${seed}/turn ${state.lastTurn.turn}`;
        assert.equal(state.lastTurn.score, turn.score, `${where}: turn score`);
        assert.equal(state.score, running.score, `${where}: running score`);
        assert.equal(state.stats.rowsCleared, running.rowsCleared, `${where}: rowsCleared`);
        assert.equal(state.stats.longestChain, running.longestChain, `${where}: longestChain`);
        assert.equal(state.stats.buffaloRetired, running.buffaloRetired, `${where}: retired`);
        assert.equal(state.stats.buffaloShrinks, running.buffaloShrinks, `${where}: shrinks`);
        assert.equal(state.stats.perfectClears, running.perfectClears, `${where}: perfect`);
        assert.equal(state.stats.longestStreak, running.longestStreak, `${where}: longestStreak`);
      }
    }
  }
});

test('AC-706b the statistics are a function of the event stream and nothing else', () => {
  // Remove an event and every number that read it moves. If any statistic were
  // counted at a second site it would not.
  const base = createRun({ seed: 4 });
  const state = {
    ...base,
    streak: 5,
    animals: deepChainBoard(),
    queue: [],
  };
  const next = reduce(state, { type: ACTIONS.PASS });
  const full = summariseEvents(next.lastTurn.events);
  assert.equal(full.score, next.score);

  const steps = next.lastTurn.events.filter((e) => e.type === 'CLEAR_STEP');
  const withoutLast = summariseEvents(
    next.lastTurn.events.filter((e) => e !== steps[steps.length - 1]),
  );
  assert.ok(withoutLast.score < full.score);
  assert.ok(withoutLast.longestChain < full.longestChain);
  assert.equal(
    withoutLast.rowsCleared,
    full.rowsCleared - steps[steps.length - 1].clearedRows.length,
  );
});

test('AC-504d/706c/706d the committed fixture reported through the reducer', () => {
  const base = createRun({ seed: 1 });
  const next = reduce(
    { ...base, streak: 5, animals: deepChainBoard(), queue: [] },
    { type: ACTIONS.PASS },
  );

  // AC-504d's published figures were derived from the 10-wide board and do not
  // survive the narrowing. Reported for re-derivation, not edited into the AC:
  // 7 steps, 4 rows, 1 retirement, 15,450 at streak x3.0.
  assert.equal(next.score, 15450);
  assert.equal(next.stats.rowsCleared, 4);
  assert.equal(next.stats.longestChain, 7, 'AC-706d: the true cascade depth, not a capped one');
  assert.equal(next.stats.buffaloRetired, 1);
  assert.equal(next.lastTurn.streakMult, 3.0, 'streak 5 incremented to 6 pays at the cap');

  // AC-706c: the retirement the stat reports is the one the score was paid for.
  const retirement = next.lastTurn.events.find(
    (e) => e.type === 'CLEAR_STEP' && e.retiredIds.length > 0,
  );
  assert.ok(retirement, 'buffaloRetired 1 must correspond to a scored event');
  assert.ok(retirement.score >= SCORE.buffaloRetire);

  const record = runRecord(next);
  assert.equal(record.longestChain, 7);
  assert.equal(record.buffaloRetired, 1);
  assert.equal(record.score, 15450);
});

// ---- AC-607b/c: the pill and the raw counter are different things -------

test('AC-607b/c the raw streak keeps climbing past the cap; the pill does not', () => {
  const base = createRun({ seed: 4 });
  let state = base;
  const seen = [];
  for (let i = 0; i < 9; i++) {
    const mover = animal('rat', LAST - 1, 6);
    state = { ...state, animals: [...rowExcept(0, [LAST]), mover, animal('fox', 0, 9)], queue: [] };
    state = reduce(state, { type: ACTIONS.MOVE, id: mover.id, x: LAST });
    seen.push({ raw: state.streak, pill: streakPill(state).mult });
  }

  assert.deepEqual(seen.map((s) => s.raw), [1, 2, 3, 4, 5, 6, 7, 8, 9], 'the raw count is raw');
  assert.deepEqual(
    seen.map((s) => s.pill),
    [1.0, 1.3, 1.6, 2.0, 2.5, 3.0, 3.0, 3.0, 3.0],
    'the pill tops out',
  );
  assert.equal(streakPill(state).show, true);
  assert.equal(runRecord(state).longestStreak, 9, 'AC-607c: the record keeps the raw count');
});

test('AC-607b the pill hides itself at x1.0 and reports the raw count separately', () => {
  const base = createRun({ seed: 4 });
  assert.deepEqual(streakPill(base), { raw: 0, mult: 1, show: false });
  assert.deepEqual(streakPill({ ...base, streak: 1 }), { raw: 1, mult: 1, show: false });
  assert.deepEqual(streakPill({ ...base, streak: 2 }), { raw: 2, mult: 1.3, show: true });
  assert.deepEqual(streakPill({ ...base, streak: 23 }), { raw: 23, mult: 3, show: true });
});

test('AC-609/607c a Perfect Clear never knocks a longer streak back to the cap', () => {
  const base = createRun({ seed: 4 });
  const long = { ...base, streak: 13, animals: rowExcept(0, [4, 5]), queue: [animal('fox', 4, 0)] };
  const next = reduce(long, { type: ACTIONS.PASS });

  assert.equal(next.stats.perfectClears, 1);
  assert.equal(next.streak, 14, 'a Perfect Clear is also a clearing turn');
  assert.equal(streakPill(next).mult, 3.0);
  assert.equal(runRecord(next).longestStreak, 14);

  // And from below the cap it still jumps straight to it.
  const short = { ...base, streak: 1, animals: rowExcept(0, [4, 5]), queue: [animal('fox', 4, 0)] };
  assert.equal(reduce(short, { type: ACTIONS.PASS }).streak, 6);
});

test('longestStreak records the best streak of the run, not the last', () => {
  const base = createRun({ seed: 4 });
  let state = base;
  for (let i = 0; i < 4; i++) {
    const mover = animal('rat', LAST - 1, 6);
    state = { ...state, animals: [...rowExcept(0, [LAST]), mover, animal('fox', 0, 9)], queue: [] };
    state = reduce(state, { type: ACTIONS.MOVE, id: mover.id, x: LAST });
  }
  assert.equal(state.streak, 4);
  state = reduce({ ...state, animals: [animal('rat', 0, 0)], queue: [] }, { type: ACTIONS.PASS });
  assert.equal(state.streak, 0, 'broken');
  assert.equal(runRecord(state).longestStreak, 4, 'but remembered');
});

test('AC-706e longestStreak is carried by the ADVANCE event, not folded separately', () => {
  const base = createRun({ seed: 4 });
  let state = base;
  for (let i = 0; i < 4; i++) {
    const mover = animal('rat', LAST - 1, 6);
    state = { ...state, animals: [...rowExcept(0, [LAST]), mover, animal('fox', 0, 9)], queue: [] };
    state = reduce(state, { type: ACTIONS.MOVE, id: mover.id, x: LAST });
  }

  const advance = state.lastTurn.events.find((e) => e.type === 'ADVANCE');
  assert.ok(advance, 'every advancing turn emits an ADVANCE event');
  assert.equal(advance.streak, state.streak, 'and it carries the settled streak');
  assert.equal(summariseEvents(state.lastTurn.events).longestStreak, state.streak);
  assert.equal(runRecord(state).longestStreak, 4);

  // The mutation probe: remove the only event carrying the streak and the
  // statistic goes with it. A second fold site would keep reporting 4.
  const without = summariseEvents(state.lastTurn.events.filter((e) => e !== advance));
  assert.equal(without.longestStreak, 0, 'longestStreak reads the stream and nothing else');

  // And it tracks whatever the event says, not whatever the state says.
  const rewritten = state.lastTurn.events.map((e) =>
    e === advance ? { ...e, streak: 99 } : e,
  );
  assert.equal(summariseEvents(rewritten).longestStreak, 99);
});

test('AC-706e a game-over turn emits no ADVANCE and cannot lower longestStreak', () => {
  const base = createRun({ seed: 4 });
  const column = Array.from({ length: 14 }, (_, y) => animal('rat', 0, y));
  const state = {
    ...base,
    streak: 7,
    stats: { ...base.stats, longestStreak: 7 },
    animals: column,
    queue: [animal('rat', 0, 0)],
  };

  const over = reduce(state, { type: ACTIONS.PASS });
  assert.equal(over.status, STATUS.GAME_OVER);
  assert.equal(over.lastTurn.events.some((e) => e.type === 'ADVANCE'), false);
  assert.equal(summariseEvents(over.lastTurn.events).longestStreak, 0, 'the turn contributes none');
  assert.equal(over.stats.longestStreak, 7, 'so the run keeps the best it had');
  assert.equal(runRecord(over).longestStreak, 7);
});

test('AC-706b/e no statistic is computed anywhere but summariseEvents', () => {
  // Structural: every field of `stats` is the previous value folded with the
  // corresponding field of the summary, and `stats` has no field the summary
  // cannot supply. A statistic derived some other way would show up as a key
  // here that summariseEvents does not produce.
  const state = reduce(createRun({ seed: 11 }), { type: ACTIONS.PASS });
  const summary = summariseEvents(state.lastTurn.events);
  const statKeys = Object.keys(state.stats).sort();
  const summaryKeys = Object.keys(summary);

  for (const key of statKeys) {
    const source = key === 'chainGuardTrips' ? 'guardTrips' : key;
    assert.ok(summaryKeys.includes(source), `stats.${key} has no source in the event summary`);
  }
  assert.deepEqual(statKeys, [
    'buffaloRetired',
    'buffaloShrinks',
    'chainGuardTrips',
    'longestChain',
    'longestStreak',
    'mostRowsInStep',
    'perfectClears',
    'rowsCleared',
  ]);
});
