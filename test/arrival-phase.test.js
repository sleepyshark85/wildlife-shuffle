// AC-808/AC-809: the arrival and the room the board makes for it are one
// event, on one clock.
//
// The owner, on a device: "sometime when a new arrival row appear, the board
// react a little bit late and there is a short overlap between them."
//
// This is §6.7's incident surviving in the one layer that was never migrated.
// The board's animals were moved onto a single shared clock with position as
// pure arithmetic (`rowAt`), because `withDelay` anchors to its OWN
// animation's first frame and twenty of them built across a vsync start up to
// a frame apart. `ArrivalFlight` kept its three `withDelay`s and `GameScreen`
// mounted it without the clock, so the flier and the board's push-up were two
// time sources only approximately in phase.
//
// The reason it survived is that nothing measured the PHASE RELATIONSHIP
// between the two layers. `test/overlap.test.js` sweeps the board against
// itself and skips an arriving animal entirely until its flight has landed;
// nothing ever evaluated the flier and the board at the same t. So this file
// does exactly that, on real plans from real turns, and in pixels.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ACTIONS, createRun, reduce } from '../src/engine/engine.js';
import { MOVE_OK, checkMove } from '../src/engine/board.js';
import { BOARD } from '../src/engine/constants.js';
import { ROWS, boardLayout, boardTrayGap, trayMetrics } from '../src/ui/layout.js';
import { flightAt, handedOver, rowAt } from '../src/ui/trajectory.js';
import { handoverWindow } from '../src/ui/timeline.js';
import { HANDOVER_MS, MOTION } from '../src/ui/theme.js';
import { runReducer } from '../src/ui/useGameRun.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** One frame at 60 Hz, and two. The drift §6.7 measured, in milliseconds. */
const FRAME = 1000 / 60;

// ---- the model of what is on screen --------------------------------------
//
// The flier's geometry is ArrivalFlight.js's, and the board copy's is
// AnimalView.js's. Both are transcribed here rather than imported, because
// both live in modules that import Reanimated and so cannot load in Node
// (§6.7). Every number below is a line of a component:
//
//   flier  top    = fromTop + (toTop - fromTop) * travel   (ArrivalFlight)
//   flier  height = bodyH + (cell - bodyH) * travel        (ArrivalFlight)
//   board  top    = (ROWS - 1 - rowAt(...)) * cell         (AnimalView)
//   board  height = cell                                   (AnimalView)

/** The iPhones the board is swept for, as [w, h, insetTop, insetBottom]. */
const PHONES = [
  ['6.1" (iPhone 15)', 393, 852, 59, 34],
  ['6.7" (iPhone 15 Plus)', 430, 932, 59, 34],
  ['4.7" (iPhone SE)', 375, 667, 20, 0],
  ['smallest supported', 320, 568, 20, 0],
];

function geometryOf([, w, h, top, bottom]) {
  const L = boardLayout(w, h, top, bottom);
  const { labelH, stripH, bodyH } = trayMetrics(L.cell, L.chrome.hud === 44);
  return {
    cell: L.cell,
    bodyH,
    // GameScreen.js: every stage but WIDE spaces the group by the ladder's gap.
    fromTop: L.boardH + boardTrayGap(L.chrome) + labelH + (stripH - bodyH) / 2,
    toTop: (ROWS - 1) * L.cell,
  };
}

const shares = (a, b) => Math.min(a.x + a.size, b.x + b.size) > Math.max(a.x, b.x);

/** A greedy legal move, so the sweep plays real turns rather than passes. */
function chooseAction(state) {
  for (const a of state.animals) {
    for (let x = 0; x <= BOARD.width - a.size; x += 1) {
      if (x !== a.x && checkMove(state.animals, a.id, x, BOARD.width) === MOVE_OK) {
        return { type: ACTIONS.MOVE, id: a.id, x };
      }
    }
  }
  return { type: ACTIONS.PASS };
}

/**
 * Every turn a bot plays, as {before, after, plan} — the same plans the device
 * replays, built by the same `buildReplay` the screen uses.
 */
function* turns({ seeds = 10, limit = 40, habitats = ['meadow', 'savanna', 'tundra'] } = {}) {
  for (const difficulty of habitats) {
    for (let s = 0; s < seeds; s += 1) {
      let state = createRun({ seed: `arrival-${difficulty}-${s}`, difficulty });
      for (let t = 0; t < limit && state.status === 'READY'; t += 1) {
        const before = state.animals;
        const next = runReducer(state, chooseAction(state));
        if (next === state) { state = reduce(state, { type: ACTIONS.PASS }); continue; }
        if (next.plan) yield { difficulty, seed: s, turn: t, before, after: next, plan: next.plan };
        state = next;
      }
    }
  }
}

/** The turn's cast: what the board draws, and what the flight layer draws. */
function castOf({ before, after, plan }) {
  const gone = new Set(plan.departures.map((d) => String(d.id)));
  const board = [];
  const fliers = [];
  for (const animal of after.animals) {
    if (gone.has(String(animal.id))) continue;
    const move = plan.moves[animal.id];
    const was = before.find((z) => String(z.id) === String(animal.id));
    const startY = move && move.startY !== undefined ? move.startY : was ? was.y : animal.y;
    board.push({
      animal,
      startY,
      keys: move ? move.keys : [],
      arrival: move ? move.arrival : null,
    });
    if (move && move.arrival) fliers.push({ animal, plan: move.arrival });
  }
  return { board, fliers };
}

// ---- 1 · the phase relationship, which is the defect itself ---------------

/**
 * The board animals whose whole turn is the arrival push-up.
 *
 * `arrive()` lifts the board by one row, so on any turn with an arrival there
 * are normally several: one key, 'rise', starting at the flight's own `at` for
 * the flight's own `dur`. Their eased progress is what the flier has to match,
 * because it is the room being made for it.
 */
function risersUnder(cast, arrival) {
  return cast.board.filter(
    (e) =>
      e.keys.length === 1 &&
      e.keys[0].kind === 'rise' &&
      e.keys[0].start === arrival.at &&
      e.keys[0].dur === arrival.dur &&
      e.keys[0].y === e.startY + 1,
  );
}

/**
 * The assertion, as one number: the worst disagreement in rows between the
 * flight's progress and the board's, at the same t, over a whole turn.
 *
 * `lag` models the defect — the board's clock running that many ms behind the
 * flier's own animation, which is what two independent `withDelay`s produce
 * when they are built either side of a vsync. At 0 it is the fix.
 */
function worstPhaseGap(cast, cap, lag) {
  let worst = 0;
  let where = null;
  let compared = 0;
  for (const flier of cast.fliers) {
    const { at, dur } = flier.plan;
    for (const riser of risersUnder(cast, flier.plan)) {
      compared += 1;
      for (let t = at - 40; t <= at + dur + 40; t += 1) {
        const flight = flightAt(at, dur, t, cap);
        const board = rowAt(riser.startY, riser.keys, t - lag, cap) - riser.startY;
        const gap = Math.abs(flight - board);
        if (gap > worst) { worst = gap; where = { t, tRel: t - at, flight, board }; }
      }
    }
  }
  return { worst, where, compared };
}

test('AC-808/AC-809 the flight and the board push-up are the same function of t', () => {
  let compared = 0;
  let worst = 0;
  let where = null;
  for (const it of turns()) {
    const cast = castOf(it);
    if (cast.fliers.length === 0) continue;
    const found = worstPhaseGap(cast, 0, 0);
    compared += found.compared;
    if (found.worst > worst) {
      worst = found.worst;
      where = { ...found.where, habitat: it.difficulty, seed: it.seed, turn: it.turn };
    }
  }
  // §6.2: a sweep that compared nothing would pass this silently.
  assert.ok(compared > 1000, `only ${compared} flier/riser pairs compared`);
  assert.ok(
    worst < 1e-12,
    `the flight and the board disagree by ${worst.toFixed(6)} rows: ${JSON.stringify(where)}`,
  );
});

test('AC-808 and the same check catches a single frame of drift', () => {
  // The proof that the assertion above is worth anything (§6.2, "never trust a
  // green check you have not seen fail"). One and two frames of drift are what
  // `withDelay` per flier actually produced: §6.7 measured five animals with
  // byte-identical schedules starting in two groups a frame apart.
  const it = [...turns({ seeds: 1, limit: 12, habitats: ['meadow'] })]
    .map((x) => ({ it: x, cast: castOf(x) }))
    .find(({ cast }) => cast.fliers.length > 0 && risersUnder(cast, cast.fliers[0].plan).length > 0);
  assert.ok(it, 'no turn with both a flight and a riser to compare it against');

  const drifted = [1, 2].map((frames) => worstPhaseGap(it.cast, 0, frames * FRAME).worst);
  // The push-up decelerates hard, so a frame at the head of it is a quarter of
  // a row — which is what the owner was watching.
  assert.ok(drifted[0] > 0.2, `one frame of drift shows as only ${drifted[0].toFixed(4)} rows`);
  assert.ok(drifted[1] > drifted[0], 'two frames should be worse than one');
});

// ---- 2 · what that phase difference looks like on the glass ---------------

/**
 * The worst overlap in POINTS between a flier and any board animal sharing its
 * columns, over the flight. Positive is the owner's "short overlap".
 */
function worstOverlap(cast, geo, cap, lag) {
  let worst = -Infinity;
  let where = null;
  for (const flier of cast.fliers) {
    const { at, dur } = flier.plan;
    for (let t = at; t <= at + dur; t += 1) {
      const travel = flightAt(at, dur, t, cap);
      const top = geo.fromTop + (geo.toTop - geo.fromTop) * travel;
      const bottom = top + geo.bodyH + (geo.cell - geo.bodyH) * travel;
      for (const e of cast.board) {
        if (String(e.animal.id) === String(flier.animal.id)) continue;
        if (!shares(flier.animal, e.animal)) continue;
        // AC-809: an animal still in flight is invisible on the board, so it
        // cannot be seen to overlap anything.
        if (e.arrival && t < e.arrival.at + e.arrival.dur) continue;
        const boardTop = (ROWS - 1 - rowAt(e.startY, e.keys, t - lag, cap)) * geo.cell;
        const over = Math.min(bottom, boardTop + geo.cell) - Math.max(top, boardTop);
        if (over > worst) {
          worst = over;
          where = { t, tRel: t - at, over, flier: flier.animal.type, other: e.animal.type };
        }
      }
    }
  }
  return { worst, where };
}

function sweepOverlap(geo, cap, lag, options) {
  let worst = -Infinity;
  let where = null;
  let swept = 0;
  for (const it of turns(options)) {
    const cast = castOf(it);
    if (cast.fliers.length === 0) continue;
    swept += 1;
    const found = worstOverlap(cast, geo, cap, lag);
    if (found.worst > worst) { worst = found.worst; where = { ...found.where, seed: it.seed, turn: it.turn, habitat: it.difficulty }; }
  }
  return { worst, where, swept };
}

test('AC-809 a flier never overlaps the board it is landing in, on any iPhone', () => {
  for (const phone of PHONES) {
    const geo = geometryOf(phone);
    const { worst, where, swept } = sweepOverlap(geo, 0, 0, { seeds: 6, limit: 40 });
    assert.ok(swept > 200, `${phone[0]}: only ${swept} arrival turns swept`);
    assert.ok(
      worst <= 0,
      `${phone[0]}: the arrival overlapped the board by ${worst.toFixed(3)} pt: ${JSON.stringify(where)}`,
    );
  }
});

test('AC-809 and that sweep is tight enough to see one frame of drift', () => {
  // The margin is exactly zero by construction: the flier's last frame puts it
  // in row 0 at the instant the animal it pushed reaches row 1, edge to edge.
  // That is what makes a positive number a defect rather than a tolerance
  // question — and it is why the assertion above is `<= 0` and not `< 1`.
  const geo = geometryOf(PHONES[0]);
  const options = { seeds: 6, limit: 40 };
  const locked = sweepOverlap(geo, 0, 0, options);
  assert.equal(locked.worst, 0, 'phase-locked, the flier should just touch and never cross');

  const one = sweepOverlap(geo, 0, 1 * FRAME, options).worst;
  const two = sweepOverlap(geo, 0, 2 * FRAME, options).worst;
  assert.ok(one > 0, `one frame of drift produced no overlap at all (${one})`);
  assert.ok(two > one, `two frames (${two.toFixed(3)} pt) should be worse than one (${one.toFixed(3)} pt)`);
  // Measured, so a regression in the geometry shows as a number moving.
  assert.ok(two > 5, `two frames of drift should be plainly visible, not ${two.toFixed(3)} pt`);
});

// ---- 3 · the handover, which is the frame the player is looking at --------

test('AC-809 at the handover the flier is exactly where the board copy is', () => {
  let checked = 0;
  for (const phone of PHONES) {
    const geo = geometryOf(phone);
    for (const it of turns({ seeds: 4, limit: 30 })) {
      const cast = castOf(it);
      for (const flier of cast.fliers) {
        const { at, dur } = flier.plan;
        const copy = cast.board.find((e) => String(e.animal.id) === String(flier.animal.id));
        assert.ok(copy, 'an arriving animal with no board copy to hand over to');

        const travel = flightAt(at, dur, at + dur, 0);
        assert.equal(travel, 1, 'the flight is not finished when it lands');
        const top = geo.fromTop + (geo.toTop - geo.fromTop) * travel;
        const height = geo.bodyH + (geo.cell - geo.bodyH) * travel;
        const copyTop = (ROWS - 1 - rowAt(copy.startY, copy.keys, at + dur, 0)) * geo.cell;
        assert.equal(top, copyTop, 'the flier lands somewhere other than its board copy');
        assert.equal(height, geo.cell, 'the flier lands at the wrong height');

        // ...and the swap is on that frame and not the one either side of it.
        // AnimalView.js fades the board copy IN at `arrival.at + arrival.dur`;
        // this is the other half of the same instant.
        assert.equal(handedOver(at, dur, at + dur - 1), 1, 'the flier vanishes early');
        assert.equal(handedOver(at, dur, at + dur), 0, 'the flier outstays its flight');
        checked += 1;
      }
    }
  }
  assert.ok(checked > 400, `only ${checked} handovers checked`);
});

test('AC-907 under Reduce Motion both sides clamp by the same rule', () => {
  const cap = MOTION.reduced;
  let compared = 0;
  let worst = 0;
  for (const it of turns({ seeds: 4, limit: 30 })) {
    const cast = castOf(it);
    if (cast.fliers.length === 0) continue;
    const found = worstPhaseGap(cast, cap, 0);
    compared += found.compared;
    worst = Math.max(worst, found.worst);
  }
  assert.ok(compared > 300, `only ${compared} pairs compared under Reduce Motion`);
  assert.ok(worst < 1e-12, `clamped, the flight and the board disagree by ${worst} rows`);

  // The handover is deliberately NOT clamped: AnimalView fades the board copy
  // in at the unclamped `at + dur`, so clamping only the flier's side would
  // leave the arriving animal invisible in between — §6.7's first bug.
  assert.equal(handedOver(310, 260, 310 + cap), 1, 'the flier left before its copy arrived');
  assert.equal(handedOver(310, 260, 310 + 260), 0);
  // ...while the movement IS clamped, exactly as `rowAt` clamps a key.
  assert.equal(flightAt(310, 260, 310 + cap, cap), 1);
  assert.equal(rowAt(0, [{ start: 310, dur: 260, y: 1, kind: 'rise' }], 310 + cap, cap), 1);
});

// ---- 4 · the arithmetic itself -------------------------------------------

test('flightAt rests, moves and settles, like rowAt', () => {
  assert.equal(flightAt(310, 260, -1, 0), 0, 'before the turn, still in the tray');
  assert.equal(flightAt(310, 260, 310, 0), 0, 'the flight has not started yet');
  assert.equal(flightAt(310, 260, 570, 0), 1, 'and it is finished');
  assert.equal(flightAt(310, 260, 5000, 0), 1);
  const mid = flightAt(310, 260, 440, 0);
  assert.ok(mid > 0 && mid < 1, `mid-flight should be between: ${mid}`);
  // It is ui.md §8's ease-out, which is the curve `rowAt` gives a 'rise'.
  assert.equal(mid, rowAt(0, [{ start: 310, dur: 260, y: 1, kind: 'rise' }], 440, 0));
});

test('AC-315e the resolve ends WITH the flight, never before it', () => {
  for (const dur of [260, 143, 120, 90]) {
    const w = handoverWindow(310, dur, HANDOVER_MS);
    assert.equal(w.at + w.dur, 310 + dur, 'the silhouette resolves early');
    assert.equal(flightAt(w.at, w.dur, 310 + dur, 0), 1, 'it is still a shadow when it lands');
    assert.equal(flightAt(w.at, w.dur, w.at, 0), 0, 'it started resolving before its window');
  }
});

// ---- 5 · the structural half: that the app uses the arithmetic -----------
//
// §6.9's rule. The sweep above proves the numbers agree; only the source can
// say whether the component reads them. The defect was never in the
// arithmetic, it was in the flier having its own clock at all.

test('AC-808 the flight layer schedules nothing of its own but the t=0 ramp', () => {
  const flight = read('src/ui/components/ArrivalFlight.js');
  // `delay()` is `withDelay`, and `withDelay` is the defect: it anchors to its
  // own animation's first frame (src/ui/motion.js).
  assert.ok(!/\bdelay\(/.test(flight), 'ArrivalFlight is scheduling with withDelay again');

  // Exactly one animation remains, and it is the clock for a turn that has
  // none — see the `solo` ramp. Anything else is a second time source.
  const timings = [...flight.matchAll(/withTiming\(/g)].length;
  assert.equal(timings, 1, `ArrivalFlight runs ${timings} animations; it may run one`);
  assert.ok(/clock\.key\.value === planKey \? clock\.ms\.value/.test(flight),
    'the flight is not reading the board\'s clock');
  assert.ok(/flightAt\(/.test(flight), 'the flight is not arithmetic on that clock');

  // ...and the screen actually hands it the clock. This is the whole bug: the
  // board got `clock={clock}` one line above and the flight did not.
  const screen = read('src/ui/screens/GameScreen.js');
  const mount = screen.slice(screen.indexOf('<ArrivalFlight'));
  assert.ok(/clock=\{clock\}/.test(mount.slice(0, mount.indexOf('/>'))),
    'GameScreen mounts ArrivalFlight without the shared clock');
});

test('AC-808 a turn can carry an arrival and no clock, so the flight owns a fallback', () => {
  // `useTurnClock` does not ramp when `clockMs` is 0, and this is how often a
  // turn with an arrival has nothing else to move: the batch props nothing up
  // and every column it did not fill falls straight back, so `compact()` drops
  // every key. Without the fallback ramp the flier would be parked in the tray
  // for the rest of the run — §6.7's invisible-animal shape.
  let withArrivals = 0;
  let noClock = 0;
  for (const it of turns({ seeds: 12, limit: 40 })) {
    if (!Object.values(it.plan.moves).some((m) => m.arrival)) continue;
    withArrivals += 1;
    if (it.plan.clockMs <= 0) noClock += 1;
  }
  assert.ok(withArrivals > 400, `only ${withArrivals} arrival turns`);
  assert.ok(noClock > 0, 'no turn arrived without a clock; the fallback may be dead code');

  const flight = read('src/ui/components/ArrivalFlight.js');
  assert.ok(/turn\.clockMs > 0/.test(flight),
    'the flight does not check for a turn with no clock');
});
