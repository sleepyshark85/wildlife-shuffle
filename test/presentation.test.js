// AC-4xx input snapshot, AC-8xx input-lock arithmetic, AC-216/AC-1309 chain guard.
// Everything in the presentation layer that can be executed without a renderer.

import test from 'node:test';
import assert from 'node:assert/strict';

import { BOARD } from '../src/engine/constants.js';
import { MOVE_OK, checkMove } from '../src/engine/board.js';
import { ACTIONS, createRun, reduce } from '../src/engine/engine.js';
import { slideRange, slideRanges } from '../src/ui/occupancy.js';
import {
  LOCK_BUDGET_MS,
  MAX_ANIMATED_UNITS,
  allocateUnits,
  stepInterval,
  turnTimeline,
} from '../src/ui/timeline.js';
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

const clearStep = (phase, step) => ({ type: 'CLEAR_STEP', phase, step });

test('ui.md §8.2a: every published arithmetic line reproduces exactly', () => {
  // AC-820. snap 110 + settle 200 + arrival 260.
  assert.equal(turnTimeline([], 'MOVE').rawMs, 570);

  // AC-821. + lead 80 + step 310. The lead is what §8.2a added.
  assert.equal(turnTimeline([clearStep('SETTLE', 1)], 'MOVE').rawMs, 960);

  // AC-824b, the realistic worst case: a 3-step cascade split 2/1, the deepest
  // ever observed. Before §8.2a this was 1440 ms and fitted uncompressed.
  const realistic = turnTimeline(
    [clearStep('SETTLE', 1), clearStep('SETTLE', 2), clearStep('ARRIVAL', 1)],
    'MOVE',
  );
  assert.equal(realistic.rawMs, 1610);
  assert.equal(realistic.lockMs, LOCK_BUDGET_MS);
  assert.equal(Math.round(realistic.scale * 100) / 100, 0.93);

  // AC-824, the absolute worst case the published table works: 5 steps split
  // 3/2, which costs more than 5 in one phase because each phase pays its own
  // lead and its own final settle.
  const worst = turnTimeline(
    [
      clearStep('SETTLE', 1), clearStep('SETTLE', 2), clearStep('SETTLE', 3),
      clearStep('ARRIVAL', 1), clearStep('ARRIVAL', 2),
    ],
    'MOVE',
  );
  assert.equal(worst.rawMs, 2115);
  assert.equal(worst.lockMs, LOCK_BUDGET_MS);
  assert.equal(Math.round(worst.scale * 100) / 100, 0.71);
});

test('AC-823 the cascade interval now SLOWS as the chain deepens', () => {
  // Was max(150, 250 - 20(k-1)). The old curve gathered pace and stopped
  // reading as discrete events; this one tightens gently and floors at 200.
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map(stepInterval), [260, 245, 230, 215, 200, 200, 200]);
});

test('AC-813 the 80 ms lead beat is on the first step of a resolution only', () => {
  // A two-step SETTLE cascade: 1220 ms natural, so nothing is time-scaled here
  // and the raw numbers are readable. (AC-824's scaling is asserted above.)
  const t = turnTimeline([clearStep('SETTLE', 1), clearStep('SETTLE', 2)], 'MOVE');
  assert.equal(t.scale, 1, 'this fixture must be uncompressed for the numbers below');
  const [first, second] = t.units;

  // Step 1: the flash attack lands, and THEN the geometry moves.
  assert.equal(first.collapseAt - first.flashAt, 80);
  // Step 2+: strictly concurrent. The announcing job is already done.
  assert.equal(second.collapseAt - second.flashAt, 0);
  // AC-823: consecutive collapses are one interval apart...
  assert.equal(second.collapseAt - first.collapseAt, stepInterval(1));
  // ...and step 2 begins while step 1's animals are still falling.
  assert.ok(second.collapseAt < first.fallAt + 200);

  // A separate resolution pays its own lead: ARRIVAL is not step 3 of SETTLE.
  const split = turnTimeline([clearStep('SETTLE', 1), clearStep('ARRIVAL', 1)], 'MOVE');
  assert.equal(split.scale, 1);
  const arrival = split.units.find((u) => u.phase === 'ARRIVAL');
  assert.equal(arrival.collapseAt - arrival.flashAt, 80);
});

test('AC-825 the unit cap never strands a phase that produced steps', () => {
  for (let settle = 0; settle <= 12; settle += 1) {
    for (let arrival = 0; arrival <= 12; arrival += 1) {
      const got = allocateUnits(settle, arrival);
      assert.ok(got.settle + got.arrival <= MAX_ANIMATED_UNITS);
      assert.ok(got.settle <= settle && got.arrival <= arrival);
      // Folding an ARRIVAL clear into a SETTLE unit would play it before the
      // arrival that caused it, which is a lie about causality.
      if (settle > 0) assert.ok(got.settle >= 1, `${settle}/${arrival} stranded SETTLE`);
      if (arrival > 0) assert.ok(got.arrival >= 1, `${settle}/${arrival} stranded ARRIVAL`);
    }
  }
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

test('AC-824 the 0.55x floor is never reached, at any split of the cap', () => {
  let worst = 1;
  for (let settle = 0; settle <= MAX_ANIMATED_UNITS; settle += 1) {
    const arrival = MAX_ANIMATED_UNITS - settle;
    const events = [];
    for (let k = 1; k <= settle; k += 1) events.push(clearStep('SETTLE', k));
    for (let k = 1; k <= arrival; k += 1) events.push(clearStep('ARRIVAL', k));
    worst = Math.min(worst, turnTimeline(events, 'MOVE').scale);
  }
  // The published figure is 0.71x for the 5-step case; the true floor across
  // every legal 6-unit split is this. Both are comfortably above 0.55.
  assert.ok(worst >= 0.55, `a legal split needed ${worst}`);
  assert.equal(Math.round(worst * 100) / 100, 0.64);
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
