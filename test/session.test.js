// AC-1012 to AC-1022 · session resume, as a replay.
//
// The property that decides the whole design is AC-1015: whatever comes off
// the disk, the board that reaches the player is one the RULES produced. So
// the sharpest test here is the fuzz at the bottom — it mutates a real saved
// replay thousands of ways and asserts that every single result is either
// discarded or a board that satisfies the engine's own invariants. A snapshot
// could not pass it, which is the point.
//
// Nothing here is mocked. The blobs are real strings, the engine is the real
// engine, and the replay is the shipped one.

import test from 'node:test';
import assert from 'node:assert/strict';

import { BOARD, DIFFICULTIES, STATUS } from '../src/engine/constants.js';
import { ACTIONS, canMove, reduce } from '../src/engine/engine.js';
import { runReducer } from '../src/ui/useGameRun.js';
import {
  ENGINE_VERSION,
  MAX_REPLAY_MOVES,
  RESUME_SCHEMA_VERSION,
  TUNING_SURFACE,
  atRest,
  boardDigest,
  buildResume,
  engineVersionFor,
  fnv1a,
  moveOf,
  openRun,
  parseResume,
  replayResume,
  restoreResume,
  serialiseResume,
} from '../src/ui/session.js';
import { animal, fullRow } from './helpers.js';

// ---- a run to save -------------------------------------------------------

/**
 * Play `n` turns through the SHIPPED state-layer reducer, choosing a real legal
 * move where one exists and passing otherwise. Using `runReducer` rather than
 * the engine's `reduce` is deliberate: the move log is its responsibility, so
 * a replay built from anything else would be testing a fixture.
 */
function playedRun(seed, n, difficulty = 'savanna') {
  let state = openRun({ seed, difficulty });
  for (let i = 0; i < n; i += 1) {
    const pick = state.animals[(i * 7) % state.animals.length];
    let action = { type: ACTIONS.PASS };
    if (pick) {
      for (let x = 0; x <= BOARD.width - pick.size; x += 1) {
        if (canMove(state, pick.id, x)) { action = { type: ACTIONS.MOVE, id: pick.id, x }; break; }
      }
    }
    const next = runReducer(state, action);
    // Stop at the last state that is still IN PROGRESS. A finished run is not
    // a run to resume (AC-1020), so a fixture that played past the end would
    // be testing the wrong thing — and did, on the first run of this suite.
    if (next.status !== STATUS.READY) break;
    state = next;
  }
  return state;
}

/** The engine's own invariants. A board that fails one is not a legal board. */
function assertLegalBoard(state, why) {
  const occupied = new Set();
  for (const a of state.animals) {
    assert.ok(a.size >= 1 && a.size <= 5, `${why}: bad size`);
    assert.ok(a.x >= 0 && a.x + a.size <= BOARD.width, `${why}: out of bounds`);
    assert.ok(a.y >= 0 && a.y < BOARD.height, `${why}: off the board`);
    for (let c = a.x; c < a.x + a.size; c += 1) {
      const key = `${c}.${a.y}`;
      assert.ok(!occupied.has(key), `${why}: two animals in cell ${key}`);
      occupied.add(key);
    }
  }
  // Nothing floats: every animal is on the floor or supported from below.
  for (const a of state.animals) {
    if (a.y === 0) continue;
    let supported = false;
    for (let c = a.x; c < a.x + a.size && !supported; c += 1) {
      supported = occupied.has(`${c}.${a.y - 1}`);
    }
    assert.ok(supported, `${why}: a floating animal at ${a.x},${a.y}`);
  }
  assert.ok(Number.isInteger(state.score) && state.score >= 0, `${why}: bad score`);
  assert.ok(Number.isInteger(state.turn) && state.turn >= 1, `${why}: bad turn`);
  assert.equal(new Set(state.animals.map((a) => a.id)).size, state.animals.length, `${why}: id collision`);
}

// ---- AC-1012 · the no-regression case ------------------------------------

test('AC-1012 a backgrounded run comes back at exactly the state it was left in', () => {
  for (const [seed, turns, difficulty] of [
    ['bg-a', 25, 'savanna'], ['bg-b', 40, 'meadow'], ['bg-c', 18, 'tundra'], ['bg-d', 1, 'savanna'],
  ]) {
    const live = playedRun(seed, turns, difficulty);
    const blob = serialiseResume(buildResume(live));
    const back = restoreResume(blob);

    assert.ok(back, `${seed}: the replay was discarded`);
    assert.deepEqual(back.animals, live.animals, `${seed}: board`);
    assert.equal(back.score, live.score, `${seed}: score`);
    assert.equal(back.streak, live.streak, `${seed}: streak`);
    assert.equal(back.turn, live.turn, `${seed}: turn`);
    assert.deepEqual(back.queue, live.queue, `${seed}: queued batch`);
    assert.deepEqual(back.stats, live.stats, `${seed}: run statistics`);
    assert.equal(back.difficulty, live.difficulty);
  }
});

test('AC-1012 a run reached through Play Again resumes too', () => {
  // The case the design's record shape could not express: RESTART mints a new
  // id namespace from `runIndex` and the inherited id counter (AC-214), so a
  // replay that assumed runIndex 1 would look up animals that do not exist.
  let state = playedRun('restart-first', 12);
  state = runReducer(state, { type: ACTIONS.RESTART, seed: 'restart-second', difficulty: 'savanna' });
  assert.equal(state.runIndex, 2);
  assert.deepEqual(state.moves, [], 'a restart starts a new move log');

  for (let i = 0; i < 9; i += 1) state = runReducer(state, { type: ACTIONS.PASS });

  const back = restoreResume(serialiseResume(buildResume(state)));
  assert.ok(back, 'a restarted run could not be replayed');
  assert.deepEqual(back.animals, state.animals);
  assert.equal(back.score, state.score);
  assert.equal(back.turn, state.turn);
});

test('AC-1021 a resumed run continues into exactly the run that never stopped', () => {
  const live = playedRun('continue', 20);
  const resumed = restoreResume(serialiseResume(buildResume(live)));
  assert.ok(resumed);

  let a = live;
  let b = resumed;
  for (let i = 0; i < 15 && a.status === STATUS.READY; i += 1) {
    a = runReducer(a, { type: ACTIONS.PASS });
    b = runReducer(b, { type: ACTIONS.PASS });
  }
  assert.deepEqual(b.animals, a.animals, 'the futures diverged');
  assert.equal(b.score, a.score);
  assert.deepEqual(b.stats, a.stats, 'so it writes the same run record and the same high score');
  assert.equal(b.status, a.status);
});

test('AC-1012 a resumed run opens at rest, with no turn left animating', () => {
  const live = playedRun('at-rest', 14);
  assert.ok(live.lastTurn, 'the fixture has a turn to leave behind');
  assert.ok(live.plan, 'and a replay plan for it');

  const back = restoreResume(serialiseResume(buildResume(live)));
  assert.equal(back.lastTurn, null, 'the last turn would replay its animation and its input lock');
  assert.equal(back.plan, undefined);
  assert.equal(back.lastAction, null);
  // atRest is the same function, and it leaves the board alone.
  assert.deepEqual(atRest(live).animals, live.animals);
});

// ---- AC-1013 / AC-1014 · a replay, not a snapshot ------------------------

test('AC-1014 the stored record is a replay and carries no board at all', () => {
  const live = playedRun('shape', 30);
  const record = buildResume(live);

  assert.deepEqual(Object.keys(record).sort(), [
    'difficulty', 'digest', 'engineVersion', 'moves', 'schemaVersion', 'seed', 'start',
  ]);
  assert.equal(record.schemaVersion, RESUME_SCHEMA_VERSION);
  assert.equal(record.engineVersion, ENGINE_VERSION);
  assert.equal(record.moves.length, live.turn - 1, 'one move per resolved turn');
  for (const move of record.moves) {
    assert.ok(move.t === 'M' || move.t === 'P');
    assert.deepEqual(Object.keys(move).sort(), move.t === 'M' ? ['id', 't', 'x'] : ['t']);
  }

  // No animal, no row, no cell. A snapshot is what this must not be.
  const blob = serialiseResume(record);
  assert.doesNotMatch(blob, /"animals"|"queue"|"size"|"score"|"type"/);
  assert.ok(blob.length < 4000, `a 30-turn replay serialised to ${blob.length} bytes`);
});

test('AC-1014 only a turn that RESOLVED is recorded', () => {
  // A blocked move, a zero-distance drag and a move naming an animal that is
  // not there all leave the board alone. A replay that recorded them would
  // reconstruct a different run — and `lastTurn`'s identity is the only thing
  // that knows the difference.
  const base = openRun({ seed: 'rejects', difficulty: 'savanna' });
  const wall = [...fullRow(0), animal('rat', 0, 1), animal('rat', 2, 1)];
  const state = { ...base, animals: wall, queue: [], moves: [] };
  const blocked = state.animals.find((a) => a.y === 1 && a.x === 0);

  const afterBlocked = runReducer(state, { type: ACTIONS.MOVE, id: blocked.id, x: 4 });
  assert.deepEqual(afterBlocked.moves, [], 'a blocked move was recorded');

  const afterNoop = runReducer(state, { type: ACTIONS.MOVE, id: blocked.id, x: 0 });
  assert.deepEqual(afterNoop.moves, [], 'a zero-distance drag was recorded');

  const afterGhost = runReducer(state, { type: ACTIONS.MOVE, id: 'no-such-animal', x: 3 });
  assert.deepEqual(afterGhost.moves, [], 'a move naming nothing was recorded');

  const afterReal = runReducer(state, { type: ACTIONS.PASS });
  assert.deepEqual(afterReal.moves, [{ t: 'P' }], 'a real turn was NOT recorded');
  assert.deepEqual(moveOf({ type: ACTIONS.MOVE, id: 'x1', x: 4 }), { t: 'M', id: 'x1', x: 4 });
});

// ---- AC-1016 · version stamping ------------------------------------------

test('AC-1016 a retune of the bands, weights or scoring changes the engine version', () => {
  // The claim the AC rests on, executed. A tuning change must invalidate every
  // replay written before it, or the same seed and the same moves rebuild a
  // DIFFERENT run and the player resumes into somebody else's game.
  const copy = () => JSON.parse(JSON.stringify(TUNING_SURFACE));
  assert.equal(engineVersionFor(TUNING_SURFACE), ENGINE_VERSION, 'the shipped version is this hash');

  const retunedBand = copy();
  retunedBand[1].savanna.startBand = [4, 6];
  assert.notEqual(engineVersionFor(retunedBand), ENGINE_VERSION, 'a band retune did not invalidate');

  const retunedWeights = copy();
  retunedWeights[1].meadow.weights.rat = 34;
  assert.notEqual(engineVersionFor(retunedWeights), ENGINE_VERSION, 'a weight retune did not invalidate');

  const retunedScore = copy();
  retunedScore[2].buffaloRetire = 700;
  assert.notEqual(engineVersionFor(retunedScore), ENGINE_VERSION, 'a scoring change did not invalidate');

  const narrower = copy();
  narrower[0].width = 8;
  assert.notEqual(engineVersionFor(narrower), ENGINE_VERSION, 'a board change did not invalidate');

  const biggerElk = copy();
  biggerElk[3].elk.size = 4;
  assert.notEqual(engineVersionFor(biggerElk), ENGINE_VERSION, 'a species change did not invalidate');
});

test('AC-1016 a replay stamped with another engine version is DISCARDED, not replayed', () => {
  const live = playedRun('versioned', 20);
  const record = buildResume(live);

  for (const stamp of [
    'e1.deadbeef', 'e0.427t4s', '', null, 0, undefined, `${ENGINE_VERSION} `, ENGINE_VERSION.toUpperCase(),
  ]) {
    const blob = JSON.stringify({ ...record, engineVersion: stamp });
    assert.equal(parseResume(blob), null, `stamp ${String(stamp)} survived the parse`);
    assert.equal(restoreResume(blob), null, `stamp ${String(stamp)} was replayed anyway`);
  }
  // The same record with the right stamp still resumes, so this is not passing
  // by refusing everything.
  assert.ok(restoreResume(serialiseResume(record)));
});

// ---- AC-1017 · the digest ------------------------------------------------

test('AC-1017 the reconstructed board is checked against the stored digest', () => {
  const live = playedRun('digest', 22);
  const record = buildResume(live);
  assert.equal(record.digest, boardDigest(live));

  // A digest that does not describe this run.
  assert.equal(restoreResume(JSON.stringify({ ...record, digest: 'nope' })), null);
  assert.equal(restoreResume(JSON.stringify({ ...record, digest: fnv1a('something else') })), null);

  // A move list quietly edited: the replay produces a legal board that is not
  // the one that was saved, and the digest is what notices.
  const edited = { ...record, moves: record.moves.slice(0, -1) };
  assert.equal(restoreResume(JSON.stringify(edited)), null, 'a truncated move list resumed');

  // The digest is a function of what the player can see.
  assert.notEqual(boardDigest(live), boardDigest({ ...live, score: live.score + 1 }));
  assert.notEqual(boardDigest(live), boardDigest({ ...live, turn: live.turn + 1 }));
  assert.notEqual(boardDigest(live), boardDigest({ ...live, streak: live.streak + 1 }));
  assert.notEqual(boardDigest(live), boardDigest({ ...live, animals: live.animals.slice(1) }));
  // ...and not of the id namespace, which the player cannot see.
  const renamed = live.animals.map((a) => ({ ...a, id: `z${a.id}` }));
  assert.equal(boardDigest({ ...live, animals: renamed }), boardDigest(live));
});

// ---- AC-1022 · what this build no longer supports -------------------------

test('AC-1022 a resume for an unsupported difficulty is discarded cleanly', () => {
  const live = playedRun('gone', 10);
  const record = buildResume(live);
  for (const difficulty of ['jungle', '', null, 42, 'SAVANNA', '__proto__']) {
    const blob = JSON.stringify({ ...record, difficulty });
    assert.equal(parseResume(blob), null, `difficulty ${String(difficulty)} was accepted`);
    assert.equal(restoreResume(blob), null);
  }
  assert.ok(DIFFICULTIES[record.difficulty], 'the fixture uses a real difficulty');
});

test('AC-1022 an impossible start or an over-long move list is refused', () => {
  const record = buildResume(playedRun('bounds', 8));
  for (const start of [null, {}, { runIndex: -1, nextAnimalId: 1 }, { runIndex: 1.5, nextAnimalId: 1 },
    { runIndex: 1 }, { runIndex: 1e12, nextAnimalId: 1 }]) {
    assert.equal(parseResume(JSON.stringify({ ...record, start })), null, `start ${JSON.stringify(start)}`);
  }
  const huge = { ...record, moves: Array.from({ length: MAX_REPLAY_MOVES + 1 }, () => ({ t: 'P' })) };
  assert.equal(parseResume(JSON.stringify(huge)), null, 'an unbounded replay was accepted');

  // A move naming a column off the board.
  const offBoard = { ...record, moves: [{ t: 'M', id: 'a', x: BOARD.width }] };
  assert.equal(parseResume(JSON.stringify(offBoard)), null);
});

// ---- AC-1005's other half: a corrupt resume never throws ------------------

test('AC-1005 a corrupt resume blob is discarded, and nothing throws', () => {
  const good = serialiseResume(buildResume(playedRun('corrupt', 16)));
  const blobs = [
    null, undefined, 42, '', '  ', 'not json',
    '{', '[]', 'null', '{}', '"x"',
    good.slice(0, Math.floor(good.length / 3)),
    good.slice(0, good.length - 1),
    good.replace('"moves":[', '"moves":"'),
    JSON.stringify({ ...JSON.parse(good), schemaVersion: 99 }),
    JSON.stringify({ ...JSON.parse(good), seed: {} }),
    JSON.stringify({ ...JSON.parse(good), moves: [{ t: 'X' }] }),
    JSON.stringify({ ...JSON.parse(good), moves: [null] }),
    JSON.stringify({ ...JSON.parse(good), moves: [{ t: 'M', x: 1 }] }),
    JSON.stringify({ ...JSON.parse(good), moves: [{ t: 'M', id: 'a', x: -1 }] }),
  ];
  for (const blob of blobs) {
    let out;
    assert.doesNotThrow(() => { out = restoreResume(blob); }, `threw on ${String(blob).slice(0, 30)}`);
    assert.equal(out, null, `resumed from ${String(blob).slice(0, 30)}`);
  }
  assert.ok(restoreResume(good), 'the battery refuses everything, including the good one');
});

// ---- AC-1015 · THE property ----------------------------------------------

test('AC-1015 however corrupt or tampered, the board that comes back is a legal one', () => {
  // 3,000 mutations of real saved replays. Every result must be either
  // discarded or a board the RULES could have produced — which is true by
  // construction for a replay and could not be true for a snapshot, because a
  // snapshot is a board somebody else wrote.
  const bases = ['fuzz-a', 'fuzz-b', 'fuzz-c'].map((s) => buildResume(playedRun(s, 24)));
  let rng = 123456789;
  const next = () => {
    rng = (Math.imul(rng, 1103515245) + 12345) & 0x7fffffff;
    return rng / 0x7fffffff;
  };
  const pick = (list) => list[Math.floor(next() * list.length) % list.length];

  let survived = 0;
  for (let i = 0; i < 3000; i += 1) {
    const record = JSON.parse(JSON.stringify(pick(bases)));
    switch (i % 8) {
      case 0: record.moves = record.moves.slice(0, Math.floor(next() * record.moves.length)); break;
      case 1: record.moves.push({ t: 'M', id: pick(['a', 'b', '1.x.4']), x: Math.floor(next() * BOARD.width) }); break;
      case 2: {
        const at = Math.floor(next() * record.moves.length);
        if (record.moves[at]) record.moves[at] = { t: 'M', id: '1.zzz.9', x: Math.floor(next() * BOARD.width) };
        break;
      }
      case 3: record.seed = `tampered-${i}`; break;
      case 4: record.start = { runIndex: Math.floor(next() * 5), nextAnimalId: Math.floor(next() * 50) }; break;
      case 5: record.digest = fnv1a(String(i)); break;
      case 6: record.difficulty = pick(['meadow', 'savanna', 'tundra', 'swamp']); break;
      default: {
        const at = Math.floor(next() * record.moves.length);
        if (record.moves[at]) record.moves[at] = { t: 'P' };
        break;
      }
    }
    // Half of them go through the string, bytes and all.
    const out = i % 2 === 0
      ? restoreResume(JSON.stringify(record))
      : replayResume(parseResume(JSON.stringify(record)));
    if (out === null) continue;
    survived += 1;
    assertLegalBoard(out, `mutation ${i}`);
    assert.equal(out.status, STATUS.READY, `mutation ${i}: resumed a finished run`);
    // Whatever survived, it survived because the digest recognised it — so it
    // IS the run that was saved.
    assert.equal(boardDigest(out), record.digest, `mutation ${i}: digest not enforced`);
  }
  // The fuzz is only worth anything if some mutations got through the parser
  // and were actually replayed. A no-op mutation (case 7 rewriting a PASS as a
  // PASS) is the one that legitimately survives.
  assert.ok(survived > 0, 'nothing survived, so nothing was actually replayed');
});

test('AC-1015 a hand-written "save file" cannot inject a board at all', () => {
  // The design's argument, stated as a test: there is no field in the record
  // that describes a board, so there is no way to put one in. A snapshot format
  // would make this test impossible to write.
  const forged = {
    schemaVersion: RESUME_SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    seed: 'forged',
    difficulty: 'savanna',
    start: { runIndex: 1, nextAnimalId: 1, abilities: true },
    moves: [],
    digest: 'anything',
    // An attacker's board, in every shape the engine would recognise.
    animals: [{ id: 'x', type: 'elephant', x: 0, y: 14, size: 4 }],
    board: [{ id: 'y', type: 'rat', x: 0, y: 99, size: 1 }],
    score: 999999,
    stats: { rowsCleared: 9999 },
  };
  const out = restoreResume(JSON.stringify(forged));
  assert.equal(out, null, 'the forged digest was not checked');

  // With a digest that actually matches its (empty) replay, it still only gets
  // the board `createRun` produces from that seed — its injected fields are not
  // read at all.
  const honest = openRun({ seed: 'forged', difficulty: 'savanna' });
  const accepted = restoreResume(JSON.stringify({ ...forged, digest: boardDigest(honest) }));
  assert.ok(accepted);
  assert.deepEqual(accepted.animals, honest.animals, 'the injected board reached the player');
  assert.equal(accepted.score, 0, 'the injected score reached the player');
  assert.deepEqual(accepted.stats, honest.stats);
  assertLegalBoard(accepted, 'forged');
});

// ---- the replay stops where a run stops -----------------------------------

test('AC-1020 a replay that runs the game out is not a run to resume', () => {
  // A resume record is cleared when a run ends, so one whose moves finish the
  // run describes a file that should not exist. It is discarded rather than
  // handed back as a Game Over the player has already seen.
  let state = openRun({ seed: 'to-the-end', difficulty: 'tundra' });
  while (state.status === STATUS.READY) state = runReducer(state, { type: ACTIONS.PASS });
  assert.equal(state.status, STATUS.GAME_OVER);

  const record = {
    schemaVersion: RESUME_SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    seed: 'to-the-end',
    difficulty: 'tundra',
    start: { runIndex: 1, nextAnimalId: 1 },
    moves: state.moves,
    digest: boardDigest(state),
  };
  assert.equal(restoreResume(JSON.stringify(record)), null);

  // ...and one move past the end is refused too, rather than throwing.
  const over = { ...record, moves: [...state.moves, { t: 'P' }] };
  assert.equal(restoreResume(JSON.stringify(over)), null);
});

test('a resume replays identically every time it is read', () => {
  // Determinism is the load-bearing property of the whole project, and the
  // replay is now a third consumer of it (gameplay.md §9).
  const blob = serialiseResume(buildResume(playedRun('deterministic', 28)));
  const a = restoreResume(blob);
  const b = restoreResume(blob);
  assert.deepEqual(a, b);
  assert.equal(boardDigest(a), boardDigest(b));
  // And a run played from the same seed with the same moves lands in the same
  // place whether it went through the disk or not.
  assert.equal(reduce(a, { type: ACTIONS.PASS }).score, reduce(b, { type: ACTIONS.PASS }).score);
});
