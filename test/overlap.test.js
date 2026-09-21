// AC-808: two animals may never occupy the same screen space.
//
// The owner: "briefly right before a row is full and cleared, the animals in
// that row appear to be different animals." They were watching stacked animals
// cross each other mid-fall.
//
// Every check the project had compared FINAL positions, and the final
// positions were correct — the same blind spot that let an invisible animal
// ship one round earlier. Right final state, wrong appearance, twice.
//
// This sweeps the rendered trajectory itself. It can do that because the
// trajectory is now a pure function (`rowAt` in src/ui/motion.js) of the plan
// and one shared clock, evaluated identically here and on the UI thread. When
// each animal ran its own `withSequence` there was no such function: position
// depended on which frame each animation happened to start on, which is
// exactly the bug.

import test from 'node:test';
import assert from 'node:assert/strict';

import { ACTIONS, createRun, reduce } from '../src/engine/engine.js';
import { MOVE_OK, checkMove } from '../src/engine/board.js';
import { BOARD } from '../src/engine/constants.js';
import { bezierAt, rowAt } from '../src/ui/trajectory.js';
import { runReducer } from '../src/ui/useGameRun.js';

/**
 * Columns are compared at their settled values, and that is sufficient.
 *
 * Only one animal changes column in a turn — the one the player moved — and it
 * slides over the first 110 ms, before anything falls (the settle begins at
 * 110). Its swept path is guaranteed clear in its own row by `checkMove`, and
 * every other row is still settled a whole row away. So the horizontal axis
 * cannot contribute an overlap that the vertical sweep below would miss; the
 * browser check (scratchpad/e2e/r6overlap.mjs) covers both axes anyway.
 */
const sharesColumns = (a, b) =>
  Math.min(a.x + a.size, b.x + b.size) > Math.max(a.x, b.x);

/**
 * Everything the board draws during a turn, as (startY, keys) per animal.
 *
 * An animal in flight from the tray is excluded until its flight lands: its
 * board copy is deliberately invisible until then (AC-809), so it cannot be
 * seen to overlap anything.
 */
function castOf(before, after, plan) {
  const gone = new Set(plan.departures.map((d) => String(d.id)));
  const cast = [];
  for (const animal of after.animals) {
    if (gone.has(String(animal.id))) continue;
    const move = plan.moves[animal.id];
    const was = before.find((z) => String(z.id) === String(animal.id));
    cast.push({
      animal,
      startY: move && move.startY !== undefined ? move.startY : (was ? was.y : animal.y),
      keys: move ? move.keys : [],
      visibleFrom: move && move.arrival ? move.arrival.at + move.arrival.dur : 0,
    });
  }
  return cast;
}

/** The worst approach between any two column-sharing animals, in rows. */
function closestApproach(cast, clockMs, cap = 0) {
  let worst = { gap: Infinity };
  for (let t = 0; t <= clockMs + 32; t += 4) {
    for (let i = 0; i < cast.length; i += 1) {
      for (let j = i + 1; j < cast.length; j += 1) {
        const A = cast[i];
        const B = cast[j];
        if (!sharesColumns(A.animal, B.animal)) continue;
        if (t < A.visibleFrom || t < B.visibleFrom) continue;
        const gap = Math.abs(
          rowAt(A.startY, A.keys, t, cap) - rowAt(B.startY, B.keys, t, cap),
        );
        if (gap < worst.gap) worst = { gap, t, A, B };
      }
    }
  }
  return worst;
}

/** A greedy legal move, so the sweep plays real turns rather than passes. */
function chooseAction(state) {
  for (const animal of state.animals) {
    for (let x = 0; x <= BOARD.width - animal.size; x += 1) {
      if (x !== animal.x && checkMove(state.animals, animal.id, x, BOARD.width) === MOVE_OK) {
        return { type: ACTIONS.MOVE, id: animal.id, x };
      }
    }
  }
  return { type: ACTIONS.PASS };
}

function sweep({ seeds, turns, difficulty, cap = 0 }) {
  let checked = 0;
  let worst = { gap: Infinity };
  for (let s = 0; s < seeds; s += 1) {
    let state = createRun({ seed: `overlap-${difficulty}-${s}`, difficulty });
    for (let t = 0; t < turns && state.status === 'READY'; t += 1) {
      const before = state.animals;
      const next = runReducer(state, chooseAction(state));
      if (next === state) { state = reduce(state, { type: ACTIONS.PASS }); continue; }
      if (next.plan) {
        const found = closestApproach(castOf(before, next, next.plan), next.plan.clockMs, cap);
        if (found.gap < worst.gap) worst = { ...found, seed: s, turn: t };
        checked += 1;
      }
      state = next;
    }
  }
  return { checked, worst };
}

function describe(worst) {
  if (!worst.A) return 'nothing';
  const show = (e) =>
    `${e.animal.type} x${e.animal.x}w${e.animal.size} ${e.startY}->${e.animal.y} ` +
    `[${e.keys.map((k) => `${k.kind}@${k.start}/${k.dur}`).join(' ')}]`;
  return `seed ${worst.seed} turn ${worst.turn}, gap ${worst.gap.toFixed(3)} rows at ` +
    `t=${worst.t}ms\n    A ${show(worst.A)}\n    B ${show(worst.B)}`;
}

test('AC-808 two animals never come within a row of each other, mid-animation', () => {
  const { checked, worst } = sweep({ seeds: 30, turns: 40, difficulty: 'savanna' });
  assert.ok(checked > 500, `only ${checked} turns swept`);
  assert.ok(worst.gap >= 0.999, `animals overlapped on screen: ${describe(worst)}`);
});

test('AC-808 it holds on the other two habitats too', () => {
  for (const difficulty of ['meadow', 'tundra']) {
    const { checked, worst } = sweep({ seeds: 8, turns: 30, difficulty });
    assert.ok(checked > 100, `${difficulty}: only ${checked} turns swept`);
    assert.ok(worst.gap >= 0.999, `${difficulty}: ${describe(worst)}`);
  }
});

test('AC-907 it holds under Reduce Motion, where every duration is clamped', () => {
  // Clamping shortens each key without moving its start, so animals that fall
  // together still land together — but only because they read one clock.
  const { checked, worst } = sweep({ seeds: 8, turns: 30, difficulty: 'savanna', cap: 120 });
  assert.ok(checked > 100, `only ${checked} turns swept`);
  assert.ok(worst.gap >= 0.999, `under Reduce Motion: ${describe(worst)}`);
});

// ---- the mechanism this rests on ----------------------------------------

test('AC-808 two identical schedules are the same function, not two animations', () => {
  // The heart of the fix. Before it, these were two `withSequence` chains each
  // counting from its own first frame; five animals with byte-identical
  // schedules were measured starting in two groups a frame apart.
  const keys = [
    { start: 110, dur: 200, y: 1, kind: 'fall' },
    { start: 310, dur: 260, y: 2, kind: 'rise' },
  ];
  const lower = keys.map((k) => ({ ...k, y: k.y - 1 }));
  for (let t = -20; t <= 620; t += 1) {
    const gap = rowAt(2, keys, t, 0) - rowAt(1, lower, t, 0);
    assert.ok(
      Math.abs(gap - 1) < 1e-9,
      `a one-row gap became ${gap.toFixed(4)} at t=${t}`,
    );
  }
});

test('rowAt is the trajectory: it rests, it moves, and it settles', () => {
  const keys = [{ start: 100, dur: 200, y: 0, kind: 'fall' }];
  assert.equal(rowAt(3, keys, -1, 0), 3, 'before the turn, where the turn began');
  assert.equal(rowAt(3, keys, 0, 0), 3);
  assert.equal(rowAt(3, keys, 100, 0), 3, 'the key has not started yet');
  assert.equal(rowAt(3, keys, 300, 0), 0, 'and it is finished');
  assert.equal(rowAt(3, keys, 5000, 0), 0);
  const mid = rowAt(3, keys, 200, 0);
  assert.ok(mid < 3 && mid > 0, `mid-fall should be between: ${mid}`);
  // Reduce Motion clamps the duration without moving the start (AC-907).
  assert.equal(rowAt(3, keys, 100, 120), 3);
  assert.equal(rowAt(3, keys, 220, 120), 0, 'clamped to 120 ms, so already done');
  assert.equal(rowAt(3, [], 50, 0), 3, 'no keys is no movement');
});

test('bezierAt reproduces the two easings ui.md §8 names', () => {
  for (const [x1, y1, x2, y2] of [[0.55, 0, 1, 0.45], [0.22, 1, 0.36, 1]]) {
    assert.equal(bezierAt(x1, y1, x2, y2, 0), 0);
    assert.equal(bezierAt(x1, y1, x2, y2, 1), 1);
    let previous = 0;
    for (let p = 0; p <= 1.0001; p += 0.02) {
      const v = bezierAt(x1, y1, x2, y2, p);
      assert.ok(v >= previous - 1e-9, `not monotonic at ${p}`);
      previous = v;
    }
  }
  // Gravity accelerates: it is still near the top at the half-way point.
  assert.ok(bezierAt(0.55, 0, 1, 0.45, 0.5) < 0.3);
  // The push-up decelerates: most of the distance is covered early. This is
  // why a single frame of drift used to be a quarter of a row.
  assert.ok(bezierAt(0.22, 1, 0.36, 1, 0.1) > 0.35);
});
