// AC-4xx input snapshot, AC-8xx input-lock arithmetic, AC-216/AC-1309 chain guard.
// Everything in the presentation layer that can be executed without a renderer.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BOARD } from '../src/engine/constants.js';
import { MOVE_OK, checkMove } from '../src/engine/board.js';
import { ACTIONS, createRun, reduce } from '../src/engine/engine.js';
import { slideRange, slideRanges } from '../src/ui/occupancy.js';
import {
  LOCK_BUDGET_MS,
  MAX_ANIMATED_UNITS,
  allocateUnits,
  lockDelay,
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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * AC-824e: the budget is derived, not restated.
 *
 * `docs/v2/budget.mjs` is the designer's own derivation from the timing
 * constants; `src/ui/timeline.js` is the one the app actually plays. They were
 * written separately and they have disagreed before — §8.2 carried a stale
 * 0.78x, then a stale 0.71x, and the correct figure for the worst legal split
 * of the 6-unit cap is 0.636x. So this runs the script and holds the shipped
 * implementation to what it prints, rather than to a number typed twice.
 *
 * It is run as a subprocess deliberately: budget.mjs calls `process.exit` at
 * the end, so importing it would end the test run on the spot.
 */
function budgetTable() {
  const out = execFileSync('node', [path.join(ROOT, 'docs/v2/budget.mjs')], {
    encoding: 'utf8',
  });
  const rows = [];
  for (const line of out.split('\n')) {
    const m = /^(.+?)\s{2,}(\d+)\/(\d+)\s+(\d+) ms\s+(none|[\d.]+)x?$/.exec(line.trimEnd());
    if (m) rows.push({
      name: m[1].trim(),
      settle: Number(m[2]),
      arrival: Number(m[3]),
      raw: Number(m[4]),
      scale: m[5] === 'none' ? 1 : Number(m[5]),
    });
  }
  return { out, rows };
}

const clearStep = (phase, step) => ({ type: 'CLEAR_STEP', phase, step });
const cascadeEvents = (settle, arrival) => {
  const events = [];
  for (let k = 1; k <= settle; k += 1) events.push(clearStep('SETTLE', k));
  for (let k = 1; k <= arrival; k += 1) events.push(clearStep('ARRIVAL', k));
  return events;
};

test('AC-824e turnTimeline reproduces docs/v2/budget.mjs, row for row', () => {
  const { rows } = budgetTable();
  assert.ok(rows.length >= 4, `budget.mjs printed no parseable table:\n${budgetTable().out}`);
  for (const row of rows) {
    const t = turnTimeline(cascadeEvents(row.settle, row.arrival), 'MOVE');
    assert.equal(t.rawMs, row.raw, `${row.name} (${row.settle}/${row.arrival}): raw`);
    assert.equal(
      Number(t.scale.toFixed(3)),
      row.scale,
      `${row.name} (${row.settle}/${row.arrival}): scale`,
    );
  }
  // ...and the named cases are the ones §8.2 quotes.
  const byName = Object.fromEntries(rows.map((r) => [r.name.split(':')[0], r]));
  assert.equal(byName['no clear'].raw, 570);              // AC-820
  assert.equal(byName.typical.raw, 960);                  // AC-821
  assert.equal(byName['realistic worst'].raw, 1610);      // AC-824b
  assert.equal(byName['absolute worst'].raw, 2360);       // AC-824e
  assert.equal(byName['absolute worst'].scale, 0.636);
});

test('AC-824e every legal split agrees with budget.mjs, not just the four named', () => {
  // budget.mjs sweeps all 28 splits internally and exits non-zero on a breach;
  // execFileSync throws on a non-zero exit, so reaching here is that assertion.
  budgetTable();
  let checked = 0;
  for (let settle = 0; settle <= MAX_ANIMATED_UNITS; settle += 1) {
    for (let arrival = 0; settle + arrival <= MAX_ANIMATED_UNITS; arrival += 1) {
      const t = turnTimeline(cascadeEvents(settle, arrival), 'MOVE');
      assert.ok(t.scale >= 0.55, `${settle}/${arrival} scaled to ${t.scale}`);
      assert.ok(t.lockMs <= LOCK_BUDGET_MS);
      checked += 1;
    }
  }
  assert.equal(checked, 28);
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

test('AC-824f the clock starts at finger-up, and is never charged twice', () => {
  // Nothing measured yet: the lock is the animation's own length.
  assert.equal(lockDelay(960, 0, 0), 960);

  // 61 ms of engine + React happened before the first frame could play. The
  // player has already spent it, so it comes out of the lock: finger-up to
  // input reopening is still 960.
  assert.equal(lockDelay(960, 0, 61), 899);
  assert.equal(61 + lockDelay(960, 0, 61), 960);

  // Whatever the scale already reserved is not charged again.
  assert.equal(lockDelay(900, 60, 61), 899);
  assert.equal(lockDelay(900, 60, 60), 900);
  assert.equal(lockDelay(900, 60, 40), 900, 'a gap smaller than reserved costs nothing');

  // A pathological gap cannot produce a negative timer.
  assert.equal(lockDelay(570, 0, 9000), 0);
});

test('AC-824f a reserved gap compresses the timeline, on EVERY turn', () => {
  // The first version of this reserved against the 1500 ms ceiling only, so it
  // bit on compressed turns and nowhere else — which is to say almost never,
  // and the browser duly measured a one-clear turn at 1027 ms against
  // AC-821's 960. The reservation has to come out of the turn's own length.
  for (const [settle, arrival, natural] of [[0, 0, 570], [1, 0, 960], [2, 1, 1610]]) {
    const events = cascadeEvents(settle, arrival);
    const plain = turnTimeline(events, 'MOVE');
    const docked = turnTimeline(events, 'MOVE', 62);
    assert.equal(plain.rawMs, natural);
    assert.ok(docked.lockMs < plain.lockMs, `${settle}/${arrival} did not compress`);
    // The promise: gap + animation = the AC's figure.
    assert.ok(
      62 + docked.lockMs <= Math.min(natural, LOCK_BUDGET_MS) + 1,
      `${settle}/${arrival}: 62 + ${docked.lockMs} exceeds ${natural}`,
    );
  }
  // The 0.55x floor still wins over an absurd reservation.
  const starved = turnTimeline(cascadeEvents(3, 3), 'MOVE', 5000);
  assert.ok(starved.scale >= 0.55, `starved scale ${starved.scale}`);
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
