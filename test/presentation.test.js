// AC-4xx input snapshot, AC-8xx input-lock arithmetic, AC-216/AC-1309 chain guard.
// Everything in the presentation layer that can be executed without a renderer.

import test from 'node:test';
import assert from 'node:assert/strict';

import { BOARD } from '../src/engine/constants.js';
import { MOVE_OK, checkMove } from '../src/engine/board.js';
import { ACTIONS, createRun, reduce } from '../src/engine/engine.js';
import { slideRange, slideRanges } from '../src/ui/occupancy.js';
import { LOCK_BUDGET_MS, MAX_ANIMATED_UNITS, stepInterval, turnTimeline } from '../src/ui/timeline.js';
import { inspectChainGuard } from '../src/ui/chainGuard.js';

// ---- the drag snapshot ---------------------------------------------------

test('AC-407/AC-408 slideRange agrees with checkMove on every column of every board', () => {
  // 400 real boards from real runs, every animal, every target column.
  let checked = 0;
  for (let s = 0; s < 40; s += 1) {
    let state = createRun({ seed: `snapshot-${s}`, difficulty: 'savanna' });
    for (let turn = 0; turn < 10 && state.status === 'READY'; turn += 1) {
      const ranges = slideRanges(state.animals, BOARD.width);
      for (const animal of state.animals) {
        const r = ranges[animal.id];
        for (let x = 0; x <= BOARD.width - animal.size; x += 1) {
          const engineLegal = checkMove(state.animals, animal.id, x, BOARD.width) === MOVE_OK;
          const ghostLegal = x >= r.minX && x <= r.maxX && x !== animal.x;
          assert.equal(
            ghostLegal,
            engineLegal,
            `seed ${s} turn ${turn} animal ${animal.id} -> x=${x}: ghost says ` +
              `${ghostLegal}, engine says ${engineLegal}`,
          );
          checked += 1;
        }
      }
      state = reduce(state, { type: ACTIONS.PASS });
    }
  }
  assert.ok(checked > 5000, `only ${checked} columns exercised`);
});

test('AC-407 the snapshot names the animal that blocks, on each side', () => {
  const animals = [
    { id: 'L', type: 'fox', x: 0, y: 0, size: 2 },
    { id: 'M', type: 'rat', x: 4, y: 0, size: 1 },
    { id: 'R', type: 'elk', x: 7, y: 0, size: 3 },
  ];
  const r = slideRange(animals, animals[1], BOARD.width);
  assert.deepEqual(r, { minX: 2, maxX: 6, leftBlockerId: 'L', rightBlockerId: 'R' });
});

test('an animal alone in its row may slide the full width', () => {
  const animals = [
    { id: 'A', type: 'elk', x: 3, y: 2, size: 3 },
    { id: 'B', type: 'rat', x: 0, y: 0, size: 1 },
  ];
  const r = slideRange(animals, animals[0], BOARD.width);
  assert.deepEqual(r, { minX: 0, maxX: 7, leftBlockerId: '', rightBlockerId: '' });
});

// ---- the input-lock budget ----------------------------------------------

test('ui.md §8.2: the three published arithmetic lines reproduce exactly', () => {
  const noClear = turnTimeline([], 'MOVE');
  assert.equal(noClear.rawMs, 570); // snap 110 + settle 200 + arrival 260

  const typical = turnTimeline(
    [{ type: 'CLEAR_STEP', phase: 'SETTLE', step: 1 }],
    'MOVE',
  );
  assert.equal(typical.rawMs, 880); // + 1 step 310

  const worst = turnTimeline(
    [
      { type: 'CLEAR_STEP', phase: 'SETTLE', step: 1 },
      { type: 'CLEAR_STEP', phase: 'SETTLE', step: 2 },
      { type: 'CLEAR_STEP', phase: 'SETTLE', step: 3 },
      { type: 'CLEAR_STEP', phase: 'ARRIVAL', step: 1 },
      { type: 'CLEAR_STEP', phase: 'ARRIVAL', step: 2 },
    ],
    'MOVE',
  );
  // Phase-2 790 + Phase-3 560 + snap/settle/arrival 570
  assert.equal(worst.rawMs, 1920);
  assert.equal(worst.lockMs, LOCK_BUDGET_MS);
  assert.ok(worst.scale > 0.77 && worst.scale < 0.79);
});

test('ui.md §8.2 step interval tightens as the chain deepens, then holds at 150', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map(stepInterval), [250, 230, 210, 190, 170, 150, 150]);
});

test('AC-822 the lock never exceeds 1500 ms, whatever the engine emits', () => {
  // gameplay.md §4: the stream is bounded by board mass, not by a step counter.
  // "The pipeline must not assume a small number."
  for (let n = 0; n <= 32; n += 1) {
    const events = [];
    for (let i = 1; i <= n; i += 1) events.push({ type: 'CLEAR_STEP', phase: 'SETTLE', step: i });
    for (let i = 1; i <= n; i += 1) events.push({ type: 'CLEAR_STEP', phase: 'ARRIVAL', step: i });
    const t = turnTimeline(events, 'MOVE');
    assert.ok(t.lockMs <= LOCK_BUDGET_MS, `${2 * n} events produced a ${t.lockMs} ms lock`);
    assert.ok(t.scale >= 0.55, `${2 * n} events scaled to ${t.scale}`);
    assert.ok(t.settleSteps + t.arrivalSteps <= MAX_ANIMATED_UNITS);
  }
});

test('a PASS costs no snap time', () => {
  assert.equal(turnTimeline([], 'PASS').rawMs, 460);
});

// ---- the chain guard ----------------------------------------------------

test('AC-1309 a CHAIN_GUARD event throws in development', () => {
  const events = [{ type: 'CHAIN_GUARD', phase: 'SETTLE', steps: 32 }];
  assert.throws(
    () => inspectChainGuard(events, { seed: 'abc', turn: 7 }, () => true),
    /CHAIN_GUARD.*32 steps.*seed abc, turn 7/s,
  );
});

test('AC-1309 in release it is recorded and the player is not interrupted', () => {
  const events = [{ type: 'CHAIN_GUARD', phase: 'ARRIVAL', steps: 32 }];
  const record = inspectChainGuard(events, { seed: 'abc', turn: 7 }, () => false);
  assert.deepEqual(record, { steps: 32, phase: 'ARRIVAL', seed: 'abc', turn: 7 });
});

test('AC-217 an ordinary turn produces no guard record at all', () => {
  let state = createRun({ seed: 'quiet', difficulty: 'meadow' });
  for (let i = 0; i < 25 && state.status === 'READY'; i += 1) {
    state = reduce(state, { type: ACTIONS.PASS });
    if (!state.lastTurn) continue;
    assert.equal(inspectChainGuard(state.lastTurn.events, state, () => true), null);
  }
  assert.equal(state.stats.chainGuardTrips, 0);
});
