// AC-6xx scoring formula (the pure arithmetic half).

import test from 'node:test';
import assert from 'node:assert/strict';

import { chainMult, rowValue, stepScore, streakMult } from '../src/engine/scoring.js';

test('AC-602/603/604 rowValue is super-linear', () => {
  assert.equal(rowValue(0), 0);
  assert.equal(rowValue(1), 100);
  assert.equal(rowValue(2), 300);
  assert.equal(rowValue(3), 600);
  assert.equal(rowValue(4), 1000);
  assert.equal(rowValue(5), 1400);
  assert.equal(rowValue(6), 1800);
});

test('AC-605 chain multiplier is the step index, capped at 5', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 8].map(chainMult), [1, 2, 3, 4, 5, 5, 5]);
});

test('AC-606 the streak multiplier is the lookup table, not a formula', () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6].map(streakMult),
    [1.0, 1.3, 1.6, 2.0, 2.5, 3.0],
  );
  assert.equal(streakMult(0), 1.0, 'no streak scores at 1.0, never below');
});

test('AC-606c six consecutive clearing turns reach the cap and stop', () => {
  assert.equal(streakMult(6), 3.0);
  assert.equal(streakMult(7), 3.0);
  assert.equal(streakMult(40), 3.0);
});

test('AC-607 every reachable multiplier is one of the five HUD values', () => {
  const reachable = new Set();
  for (let n = 1; n <= 50; n++) reachable.add(streakMult(n));
  assert.deepEqual([...reachable].sort((a, b) => a - b), [1.0, 1.3, 1.6, 2.0, 2.5, 3.0]);
});

test('AC-602 one row at chain 1 and streak 1.0 scores exactly 100', () => {
  assert.equal(stepScore({ rows: 1, step: 1, clearingTurns: 0 }), 100);
});

test('AC-603/604 multi-row steps at chain 1 and streak 1.0', () => {
  assert.equal(stepScore({ rows: 2, step: 1 }), 300);
  assert.equal(stepScore({ rows: 3, step: 1 }), 600);
  assert.equal(stepScore({ rows: 4, step: 1 }), 1000);
  assert.equal(stepScore({ rows: 5, step: 1 }), 1400);
});

test('AC-605 chain multiplies the whole step', () => {
  assert.equal(stepScore({ rows: 1, step: 2 }), 200);
  assert.equal(stepScore({ rows: 1, step: 5 }), 500);
  assert.equal(stepScore({ rows: 1, step: 6 }), 500);
});

test('AC-610/611 buffalo terms are paid before the multipliers', () => {
  assert.equal(stepScore({ rows: 0, shrinks: 1, step: 1 }), 50);
  assert.equal(stepScore({ rows: 0, shrinks: 1, step: 2 }), 100);
  assert.equal(
    stepScore({ rows: 0, shrinks: 1, retired: 1, step: 1 }),
    550,
    'a retiring completion pays both terms: taking the last segment is still taking one',
  );
});

test('AC-611b a buffalo pays exactly 700 across its life at chain 1, streak x1.0', () => {
  const shrink = stepScore({ rows: 0, shrinks: 1, step: 1, clearingTurns: 1 });
  const retire = stepScore({ rows: 0, shrinks: 1, retired: 1, step: 1, clearingTurns: 1 });
  assert.equal(shrink * 3 + retire, 700);
});

test('AC-614 a step with nothing in it scores nothing', () => {
  assert.equal(stepScore({ rows: 0, step: 1, clearingTurns: 9 }), 0);
});

test('AC-602 the streak multiplies a plain row clear as the table says', () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6].map((n) => stepScore({ rows: 1, step: 1, clearingTurns: n })),
    [100, 130, 160, 200, 250, 300],
  );
});

test('streak arithmetic is exact rational arithmetic, not float rounding', () => {
  // The multiplier is carried in tenths internally. Checked here against exact
  // integer arithmetic so a future table value with a worse float representation
  // (the old 1.4 gave 700 x 1.4 = 979.9999999999999) cannot silently lose a point.
  const tenths = { 1: 10, 2: 13, 3: 16, 4: 20, 5: 25, 6: 30 };
  for (let clearingTurns = 1; clearingTurns <= 6; clearingTurns++) {
    for (let shrinks = 0; shrinks <= 20; shrinks++) {
      for (let step = 1; step <= 5; step++) {
        const base = 50 * shrinks;
        const expected = Math.floor((base * Math.min(step, 5) * tenths[clearingTurns]) / 10);
        assert.equal(stepScore({ rows: 0, shrinks, step, clearingTurns }), expected);
      }
    }
  }
});

test('AC-606 every step score is an exact integer at every reachable multiplier', () => {
  for (let clearingTurns = 0; clearingTurns <= 8; clearingTurns++) {
    for (let rows = 0; rows <= 6; rows++) {
      for (let step = 1; step <= 8; step++) {
        const value = stepScore({ rows, shrinks: 1, retired: 0, step, clearingTurns });
        assert.ok(Number.isInteger(value), `${rows}/${step}/${clearingTurns} -> ${value}`);
      }
    }
  }
});
