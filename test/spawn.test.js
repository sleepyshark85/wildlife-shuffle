// AC-3xx spawning and the difficulty bands.

import test from 'node:test';
import assert from 'node:assert/strict';

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { BOARD, DIFFICULTIES, MAX_BATCH_CELLS } from '../src/engine/constants.js';
import { bandForTurn, batchCells, generateBatch, isBuffaloTurn } from '../src/engine/spawn.js';
import { makeRng } from '../src/engine/rng.js';


/** Generate `count` batches for one difficulty, cycling through turns. */
function sample({ difficulty, turns, seed = 7, hasBuffaloOnBoard = false }) {
  let rng = makeRng(seed);
  let nextId = 1;
  const batches = [];
  for (const turn of turns) {
    const out = generateBatch({ turn, difficulty, rng, nextId, hasBuffaloOnBoard });
    rng = out.rng;
    nextId = out.nextId;
    batches.push({ turn, batch: out.batch, target: out.target });
  }
  return batches;
}

const ALL_TURNS = Array.from({ length: 200 }, (_, i) => i + 1);

for (const difficulty of Object.keys(DIFFICULTIES)) {
  test(`AC-303/304/305 batch invariants hold for ${difficulty} over 200 turns`, () => {
    for (const { turn, batch } of sample({ difficulty, turns: ALL_TURNS })) {
      const cells = batchCells(batch);
      assert.ok(cells <= MAX_BATCH_CELLS, `turn ${turn}: ${cells} cells exceeds 9`);

      const occupied = new Set();
      for (const a of batch) {
        assert.ok(a.x >= 0, `turn ${turn}: x < 0`);
        assert.ok(a.x + a.size <= BOARD.width, `turn ${turn}: x + size > 10`);
        assert.equal(a.y, 0, 'every arrival is placed on row 0');
        for (let c = a.x; c < a.x + a.size; c++) {
          assert.ok(!occupied.has(c), `turn ${turn}: column ${c} is claimed twice`);
          occupied.add(c);
        }
      }
      assert.equal(occupied.size, cells);
    }
  });
}

test('AC-306 the Savanna band ramps 3-5 / 4-6 / 5-7 / 6-8', () => {
  assert.deepEqual(bandForTurn('savanna', 1), [3, 5]);
  assert.deepEqual(bandForTurn('savanna', 12), [3, 5]);
  assert.deepEqual(bandForTurn('savanna', 13), [4, 6]);
  assert.deepEqual(bandForTurn('savanna', 25), [5, 7]);
  assert.deepEqual(bandForTurn('savanna', 37), [6, 8]);
  assert.deepEqual(bandForTurn('savanna', 400), [6, 8], 'the ceiling holds');
});

test('AC-307 Meadow and Tundra bands and ceilings', () => {
  assert.deepEqual(bandForTurn('meadow', 1), [2, 4]);
  assert.deepEqual(bandForTurn('meadow', 13), [3, 5]);
  assert.deepEqual(bandForTurn('meadow', 25), [4, 6]);
  assert.deepEqual(bandForTurn('meadow', 37), [5, 7], 'the raised ceiling');
  assert.deepEqual(bandForTurn('meadow', 500), [5, 7]);
  assert.deepEqual(bandForTurn('tundra', 1), [4, 6]);
  assert.deepEqual(bandForTurn('tundra', 37), [7, 9]);
  assert.deepEqual(bandForTurn('tundra', 500), [7, 9]);
});

test('AC-307b a batch occupies exactly its rolled target, never fewer', () => {
  for (const difficulty of Object.keys(DIFFICULTIES)) {
    for (let seed = 0; seed < 60; seed++) {
      for (const { turn, batch, target } of sample({ difficulty, turns: ALL_TURNS, seed })) {
        assert.equal(
          batchCells(batch),
          target,
          `${difficulty} turn ${turn}: ${batchCells(batch)} cells for a target of ${target}`,
        );
      }
    }
  }
});

test('AC-307b the target itself always sits inside the band', () => {
  for (const difficulty of Object.keys(DIFFICULTIES)) {
    for (let seed = 0; seed < 20; seed++) {
      for (const { turn, target } of sample({ difficulty, turns: ALL_TURNS, seed })) {
        const [low, high] = bandForTurn(difficulty, turn);
        // A scheduled buffalo raises the target to at least its own size of 4,
        // which every band's high already covers.
        assert.ok(target >= low && target <= Math.max(high, 4), `${difficulty} t${turn}: ${target}`);
      }
    }
  }
});

test('AC-306/307 generated batches sit inside their band', () => {
  for (const difficulty of Object.keys(DIFFICULTIES)) {
    for (let seed = 0; seed < 40; seed++) {
      for (const { turn, batch } of sample({ difficulty, turns: ALL_TURNS, seed })) {
        const [low, high] = bandForTurn(difficulty, turn);
        const cells = batchCells(batch);
        if (batch.some((a) => a.type === 'buffalo')) {
          // The scheduled buffalo raises the target to at least its own size.
          assert.ok(cells >= Math.max(low, 4) && cells <= Math.max(high, 4));
        } else {
          assert.ok(
            cells >= low && cells <= high,
            `${difficulty} turn ${turn}: ${cells} outside ${low}-${high}`,
          );
        }
      }
    }
  }
});

test('AC-316 selection and placement interleave: every draw fits what was left', () => {
  // Proof by consequence: if selection ran ahead of placement, some batch would
  // eventually be short of its target (AC-317). Over 24,000 batches, none is.
  let batches = 0;
  for (const difficulty of Object.keys(DIFFICULTIES)) {
    for (let seed = 100; seed < 140; seed++) {
      for (const { batch, target } of sample({ difficulty, turns: ALL_TURNS, seed })) {
        assert.equal(batchCells(batch), target);
        batches += 1;
      }
    }
  }
  assert.ok(batches >= 24000, `only ${batches} batches sampled`);
});

test('AC-308 the three difficulties produce measurably different mean cells/turn', () => {
  const turns = Array.from({ length: 50 }, (_, i) => i + 1);
  const means = {};
  for (const difficulty of Object.keys(DIFFICULTIES)) {
    let total = 0;
    let count = 0;
    for (let seed = 0; seed < 50; seed++) {
      for (const { batch } of sample({ difficulty, turns, seed })) {
        total += batchCells(batch);
        count += 1;
      }
    }
    means[difficulty] = total / count;
  }
  assert.ok(means.meadow < means.savanna, `${means.meadow} !< ${means.savanna}`);
  assert.ok(means.savanna < means.tundra, `${means.savanna} !< ${means.tundra}`);
  assert.ok(means.tundra - means.meadow > 1.0, 'the spread is more than a rounding error');
});

test('AC-309 Tundra from turn 37 reaches 9 of 10 columns: the buffer is gone', () => {
  const widths = new Set();
  const turns = Array.from({ length: 50 }, (_, i) => i + 37);
  for (let seed = 0; seed < 10; seed++) {
    for (const { batch } of sample({ difficulty: 'tundra', turns, seed })) {
      widths.add(batchCells(batch));
    }
  }
  assert.ok(widths.has(9), `never reached 9 columns; saw ${[...widths].sort().join(',')}`);
  assert.ok(!widths.has(10), 'and never all ten (AC-303)');
});

test('AC-309b no batch anywhere occupies all ten columns', () => {
  for (const difficulty of Object.keys(DIFFICULTIES)) {
    for (let seed = 0; seed < 30; seed++) {
      for (const { batch } of sample({ difficulty, turns: ALL_TURNS, seed })) {
        assert.ok(batchCells(batch) <= MAX_BATCH_CELLS);
      }
    }
  }
});

test('AC-317 a target of 9 satisfied by {1, 3, 5} never deadlocks or falls short', () => {
  // The two-pass algorithm could place rat@1 then elk@4 and strand the elephant.
  // Interleaved generation cannot: an elephant only becomes a candidate while a
  // 5-wide free run still exists.
  let found = 0;
  for (let seed = 0; seed < 400; seed++) {
    for (const { batch, target } of sample({ difficulty: 'tundra', turns: [37, 49, 61], seed })) {
      assert.equal(batchCells(batch), target);
      const sizes = batch.map((a) => a.size).sort().join('');
      if (target === 9 && sizes === '135') found += 1;
    }
  }
  assert.ok(found > 0, 'the {1,3,5} target-9 case really does occur');
});

/**
 * mulberry32 advances its state by a fixed constant per draw, so the number of
 * draws between two states can be recovered exactly.
 */
function rngStepsBetween(before, after, max = 200) {
  for (let k = 0; k <= max; k++) {
    if (((before + Math.imul(k, 0x6d2b79f5)) >>> 0) === (after >>> 0)) return k;
  }
  return -1;
}

test('AC-317b/c the generator draws exactly once per decision at width 40', () => {
  // A retry loop would have to consume extra PRNG draws, whatever it was called.
  // On a board wide enough that every placement has several valid starts, the
  // draw count of a single-pass generator is exact: one for the target, one per
  // species choice, one per placement, and n-1 to shuffle.
  let checked = 0;
  for (const difficulty of Object.keys(DIFFICULTIES)) {
    for (let seed = 0; seed < 120; seed++) {
      for (const turn of [1, 10, 13, 25, 37, 40]) {
        const before = makeRng(seed * 31 + turn);
        const out = generateBatch({ turn, difficulty, rng: before, nextId: 1, width: 40 });
        const buffalo = out.batch.filter((a) => a.type === 'buffalo').length;
        const drawn = out.batch.length - buffalo;
        const expected = 1 + buffalo + 2 * drawn + Math.max(0, out.batch.length - 1);

        assert.equal(
          rngStepsBetween(before, out.rng),
          expected,
          `${difficulty} turn ${turn} seed ${seed}: ${out.batch.length} animals`,
        );
        checked += 1;
      }
    }
  }
  assert.ok(checked >= 2000, `only ${checked} batches checked`);
});

test('AC-317c at the shipped width the draw count never exceeds the single-pass bound', () => {
  // At width 10 the equality does not hold, and must not be "fixed" to: a forced
  // placement consumes no draw at all, because nextInt short-circuits a range
  // whose ends are equal. One-sided is the direction that matters — a retry can
  // only ever add draws.
  let checked = 0;
  let belowBound = 0;
  for (const difficulty of Object.keys(DIFFICULTIES)) {
    for (let seed = 0; seed < 200; seed++) {
      let rng = makeRng(seed * 7919 + difficulty.length);
      let nextId = 1;
      for (let turn = 1; turn <= 120; turn++) {
        const before = rng;
        const out = generateBatch({ turn, difficulty, rng, nextId });
        rng = out.rng;
        nextId = out.nextId;

        const buffalo = out.batch.filter((a) => a.type === 'buffalo').length;
        const drawn = out.batch.length - buffalo;
        const bound = 1 + buffalo + 2 * drawn + Math.max(0, out.batch.length - 1);
        const actual = rngStepsBetween(before, out.rng);

        assert.ok(actual >= 0, 'the draw count is recoverable');
        assert.ok(actual <= bound, `${difficulty} turn ${turn} seed ${seed}: ${actual} > ${bound}`);
        if (actual < bound) belowBound += 1;
        checked += 1;
      }
    }
  }
  assert.equal(checked, 72000);
  assert.ok(belowBound > 0, 'and the bound really is one-sided at width 10');
});

test('AC-317b the generator has no retry loop, backtracking or fallback', () => {
  const source = readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'engine', 'spawn.js'),
    'utf8',
  );
  // Comments may name these; the code may not.
  const code = source.replace(/^\s*(\/\/|\*|\/\*).*$/gm, '');
  for (const banned of ['retry', 'attempt', 'fallback', 'backtrack', 'while (true)', 'catch']) {
    assert.ok(!code.includes(banned), `spawn.js must not contain "${banned}"`);
  }
});

test('AC-310 Savanna queues a buffalo on turns 10, 20, 30 and on no other turn', () => {
  for (const { turn, batch } of sample({ difficulty: 'savanna', turns: ALL_TURNS })) {
    const hasBuffalo = batch.some((a) => a.type === 'buffalo');
    assert.equal(hasBuffalo, turn % 10 === 0, `turn ${turn}`);
  }
  assert.equal(isBuffaloTurn('meadow', 12), true);
  assert.equal(isBuffaloTurn('tundra', 8), true);
  assert.equal(isBuffaloTurn('savanna', 0), false, 'never turn 0');
});

test('AC-311 no second buffalo is queued while one is on the board', () => {
  const [{ batch }] = sample({
    difficulty: 'savanna',
    turns: [10],
    hasBuffaloOnBoard: true,
  });
  assert.equal(batch.some((a) => a.type === 'buffalo'), false);
});

test('AC-314 the same seed and turn produce an identical batch', () => {
  const a = generateBatch({ turn: 17, difficulty: 'tundra', rng: makeRng(123), nextId: 1 });
  const b = generateBatch({ turn: 17, difficulty: 'tundra', rng: makeRng(123), nextId: 1 });
  assert.deepEqual(a, b);

  const c = generateBatch({ turn: 17, difficulty: 'tundra', rng: makeRng(124), nextId: 1 });
  assert.notDeepEqual(a.batch, c.batch);
});

test('a batch always reaches its target: every animal drawn is also placed', () => {
  for (const difficulty of Object.keys(DIFFICULTIES)) {
    for (let seed = 0; seed < 25; seed++) {
      for (const { turn, batch } of sample({ difficulty, turns: ALL_TURNS, seed })) {
        const [low] = bandForTurn(difficulty, turn);
        assert.ok(batchCells(batch) >= Math.min(low, MAX_BATCH_CELLS));
        assert.ok(batch.length > 0);
      }
    }
  }
});
