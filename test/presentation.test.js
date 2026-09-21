// AC-4xx input snapshot, AC-8xx input-lock arithmetic, AC-216/AC-1309 chain guard.
// Everything in the presentation layer that can be executed without a renderer.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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
  handoverWindow,
  lockDelay,
  stepInterval,
  turnTimeline,
} from '../src/ui/timeline.js';
import { HANDOVER_MS, MOTION } from '../src/ui/theme.js';
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
    { id: 'R', type: 'elk', x: BOARD.width - 3, y: 0, size: 3 },
  ];
  const r = slideRange(animals, animals[1], BOARD.width);
  assert.deepEqual(r, { minX: 2, maxX: BOARD.width - 4, leftBlockerId: 'L', rightBlockerId: 'R' });
});

test('an animal alone in its row may slide the full width', () => {
  const animals = [
    { id: 'A', type: 'elk', x: 3, y: 2, size: 3 },
    { id: 'B', type: 'rat', x: 0, y: 0, size: 1 },
  ];
  const r = slideRange(animals, animals[0], BOARD.width);
  assert.deepEqual(r, { minX: 0, maxX: BOARD.width - 3, leftBlockerId: '', rightBlockerId: '' });
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

// ---- AC-315e / AC-419-425: the handover and the origin recess -----------
//
// Two features that a renderer would check by looking at pixels, checked here
// by the two things that can be checked without one: the arithmetic, and the
// structure of the worklets. Both were chosen because a pixel test on an
// emulator would not have caught either of the failure modes below.

/** One gesture callback's source body, by brace matching from `.onX(`. */
function callbackBody(source, name) {
  const needle = `.${name}(`;
  const start = source.indexOf(needle);
  assert.notEqual(start, -1, `no ${name} in the source`);
  let depth = 0;
  for (let i = start + needle.length - 1; i < source.length; i += 1) {
    if (source[i] === '(') depth += 1;
    else if (source[i] === ')') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unbalanced ${name}`);
}

const readSrc = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

test('AC-315e the silhouette finishes becoming the animal exactly as it lands', () => {
  // The failure this exists for is invisible on a device and obvious here: a
  // resolve scheduled from the START of the flight (at -> at+160) finishes
  // 100 ms early and the view spends the last 100 ms flying as a completed
  // animal. It still LOOKS like a nice transition. It just no longer happens
  // at the moment the arrival stops being a forecast, which is the only reason
  // the device exists.
  const w = handoverWindow(500, MOTION.arrival, HANDOVER_MS);
  assert.equal(w.dur, HANDOVER_MS, 'the full 160 ms');
  assert.equal(w.at + w.dur, 500 + MOTION.arrival, 'and it ends WITH the flight');
  assert.equal(w.at, 500 + MOTION.arrival - HANDOVER_MS);

  // Reduce Motion shortens the flight. The resolve is clamped to it rather
  // than running past its own arrival.
  const reducedFlight = handoverWindow(500, MOTION.reduced, HANDOVER_MS);
  assert.equal(reducedFlight.dur, MOTION.reduced);
  assert.equal(reducedFlight.at, 500, 'it fills the whole flight, and no more');
  assert.equal(reducedFlight.at + reducedFlight.dur, 500 + MOTION.reduced);

  assert.ok(HANDOVER_MS < MOTION.arrival, 'a handover that filled the flight would be a fade-in');
});

test('AC-419 the origin recess is not a second dashed outline in the default theme', () => {
  // AC-419 names this as a defect BY NAME, because it is the obvious thing to
  // reach for and it quietly undoes the whole design: three dashed outlines in
  // three colours is the diagram the three-register split exists to avoid.
  const source = stripComments(readSrc('src/ui/components/Board.js'));
  const start = source.indexOf('function OriginRecess');
  assert.notEqual(start, -1, 'the recess must exist to be checked');
  const body = source.slice(start, source.indexOf('function BoardImpl'));

  const swap = body.indexOf('if (highContrast)');
  assert.notEqual(swap, -1, 'AC-425: High Contrast trades the register');
  const dflt = body.slice(swap + body.slice(swap).indexOf('}\n\n'));

  assert.ok(!/dashed/.test(dflt), 'the default recess must not be dashed');
  assert.ok(!/borderStyle/.test(dflt), 'nor take a border style at all');
  assert.ok(!/COLORS\.accent|COLORS\.illegal/.test(dflt), 'nor borrow the ghost’s colours');
  // What it IS: a darkened ground plus a 1 pt top edge.
  assert.match(dflt, /RECESS\.darken/);
  assert.match(dflt, /RECESS\.topEdge/);
  // AC-425's outline lives on the other side of the branch, and only there.
  assert.match(body.slice(swap, swap + 900), /dashed/);

  // RECORDED GAP, not an assertion dressed down to pass. AC-425 asks for the
  // High Contrast origin to be dashed 6 on / 4 off "against the destination
  // ghost's 3 on / 3 off, so the two remain distinguishable by rhythm".
  // React Native exposes `borderStyle: 'dashed'` and nothing else — the dash
  // length is the platform's. Measured in the browser, both outlines get the
  // same UA dash, so they are distinguishable by COLOUR (white 70% against
  // accent/red) but NOT by rhythm. The destination ghost has had this gap
  // since it was written. Closing it needs per-segment views or an SVG
  // dependency, which is a decision rather than an implementation detail.
  assert.match(body.slice(swap, swap + 900), /borderStyle: 'dashed'/);
  assert.ok(
    !/dashArray|strokeDasharray|Svg/.test(body),
    'if a dash pattern ever becomes controllable, this note is stale',
  );
});

test('AC-420/AC-423 the origin is written once in onBegin and never in onUpdate', () => {
  // AC-423 is a performance claim ("zero React commits", "written once"), and
  // the way it breaks is not a crash: someone updates the recess in onUpdate
  // to "keep it in sync", it still looks right, and the cheapest thing on the
  // board silently becomes the most expensive. Counting writes is the only
  // way that shows up.
  const source = stripComments(readSrc('src/ui/components/AnimalView.js'));
  const begin = callbackBody(source, 'onBegin');
  const update = callbackBody(source, 'onUpdate');
  const finalize = callbackBody(source, 'onFinalize');

  for (const field of ['originX', 'originY', 'originSize', 'originFill', 'originAlpha']) {
    const writes = (begin.match(new RegExp(`drag\\.${field}\\.value\\s*=`, 'g')) || []).length;
    assert.equal(writes, 1, `onBegin must write drag.${field} exactly once`);
  }
  assert.ok(!/drag\.origin/.test(update), 'onUpdate must not touch the origin at all');

  // AC-420: no zero-displacement suppression. The only thing onBegin is
  // allowed to gate the recess on is the input lock, which gates the whole
  // gesture — so the recess write sits after the lock check and under no other
  // condition.
  const afterLock = begin.slice(begin.indexOf('armed.value = 1;'));
  assert.ok(afterLock.includes('drag.originAlpha.value = 1;'), 'written on every armed grab');
  const guard = afterLock.slice(0, afterLock.indexOf('drag.originAlpha.value = 1;'));
  assert.ok(!/\bif\s*\(/.test(guard), 'and under no further condition (AC-420)');

  assert.match(finalize, /drag\.originAlpha\.value = withTiming\(0, snapConfig\)/);
});

test('AC-421/AC-422 the recess fades on every route out, before any of them', () => {
  // Three ways a drag ends — accepted, rejected, cancelled — and each one is a
  // separate `return` inside onFinalize. A fade written next to any single one
  // of them would leave a recess on the board after the other two. Putting it
  // ahead of the first return is what makes "one rule for all three outcomes"
  // structural rather than something to remember.
  const source = stripComments(readSrc('src/ui/components/AnimalView.js'));
  const finalize = callbackBody(source, 'onFinalize');

  const fade = finalize.indexOf('drag.originAlpha.value');
  assert.notEqual(fade, -1);
  // Past the guard clause that leaves before the drag was ever armed.
  const GUARD = 'if (armed.value !== 1) return;';
  const armedGuard = finalize.indexOf(GUARD);
  assert.notEqual(armedGuard, -1);
  // Past the guard's OWN return, not into it. (`+ 10` landed inside it and
  // made this assertion compare the fade against the guard, which it always
  // lost — the test failed on correct code until this was fixed.)
  const firstRoute = finalize.indexOf('return;', armedGuard + GUARD.length);
  assert.ok(fade < firstRoute, 'the fade must precede every route out of the gesture');

  const routes = (finalize.match(/return;/g) || []).length;
  assert.ok(routes >= 4, `only ${routes} exits — has a route been added past the fade?`);

  // AC-422: it is the body's own snap, so the two converge to nothing
  // together and the recess cannot outlive the shake.
  assert.equal(MOTION.snap, 110);
  assert.ok(MOTION.snap < MOTION.illegal, 'the shake outlasts the fade, not the other way round');
});

test('AC-424 the recess survives Reduce Motion, and needs no reduced twin', () => {
  const source = stripComments(readSrc('src/ui/components/AnimalView.js'));
  const finalize = callbackBody(source, 'onFinalize');
  const line = finalize.split('\n').find((l) => l.includes('drag.originAlpha.value'));
  assert.ok(!/reduced/.test(line), 'the fade must not be gated on Reduce Motion');
  // The reason it needs no twin: 110 ms already sits inside the cross-fade
  // ceiling, so there is nothing for Reduce Motion to shorten.
  assert.ok(MOTION.snap <= MOTION.reduced, `${MOTION.snap} ms must fit the ${MOTION.reduced} ms ceiling`);
});
