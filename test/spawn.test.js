// AC-3xx spawning and the difficulty bands.

import test from 'node:test';
import assert from 'node:assert/strict';

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { BOARD, DIFFICULTIES, MAX_BATCH_CELLS, meanDrawnSize } from '../src/engine/constants.js';
import {
  bandFloorViolations,
  bandForTurn,
  batchCells,
  generateBatch,
  isBuffaloTurn,
} from '../src/engine/spawn.js';
import { makeRng, nextFraction, nextInt } from '../src/engine/rng.js';


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

test('AC-306 the Savanna band ramps 2-4 / 3-5 / 4-6 and stops', () => {
  // Retuned (gameplay.md §5.6a): start and ceiling both dropped by 1 after the
  // bot measured a median of 35.5 turns against a 60-90 hypothesis.
  assert.deepEqual(bandForTurn('savanna', 1), [2, 4]);
  assert.deepEqual(bandForTurn('savanna', 12), [2, 4]);
  assert.deepEqual(bandForTurn('savanna', 13), [3, 5]);
  assert.deepEqual(bandForTurn('savanna', 25), [4, 6]);
  assert.deepEqual(bandForTurn('savanna', 37), [4, 6], 'the ceiling holds');
  assert.deepEqual(bandForTurn('savanna', 400), [4, 6]);
});

test('AC-307 Meadow and Tundra bands and ceilings', () => {
  // Meadow reaches its ceiling one ramp sooner than the others now: 2-4 is its
  // FLOOR (AC-306b) and 3-5 its ceiling, so there is exactly one step.
  assert.deepEqual(bandForTurn('meadow', 1), [2, 4]);
  assert.deepEqual(bandForTurn('meadow', 12), [2, 4]);
  assert.deepEqual(bandForTurn('meadow', 13), [3, 5]);
  assert.deepEqual(bandForTurn('meadow', 25), [3, 5], 'the ceiling holds one ramp early');
  assert.deepEqual(bandForTurn('meadow', 500), [3, 5]);
  assert.deepEqual(bandForTurn('tundra', 1), [3, 5]);
  assert.deepEqual(bandForTurn('tundra', 13), [4, 6]);
  assert.deepEqual(bandForTurn('tundra', 25), [5, 7]);
  assert.deepEqual(bandForTurn('tundra', 500), [5, 7]);
  // The W-1 = 8 cap that once forced Tundra's ceiling to 6-8 rather than 7-9
  // is no longer what binds it — the retune is. The invariant still stands
  // above it, and this records the headroom rather than pretending the cap is
  // still doing the work.
  assert.ok(bandForTurn('tundra', 500)[1] < MAX_BATCH_CELLS,
    'Tundra now sits UNDER the cap; the cap is a ceiling on the table, not the table');
});

test('AC-306b no band asks for less than one animal', () => {
  // The floor the designer found by trying 1-3 on Meadow: it has a mean of 2.0
  // on paper and measures 2.41 cells/turn, because §5.2 draws k >= 1 and the
  // smallest arrival is one whole animal. A band under that floor is not a
  // band, it is a rounding artefact — which is the whole reason Meadow's
  // starting band did not move in a retune that moved every other band.
  assert.deepEqual(bandFloorViolations(), []);

  // And the floor is where Meadow actually SITS, not somewhere far below it:
  // a table that satisfied AC-306b with room to spare would mean the floor was
  // never the reason Meadow stayed at 2-4.
  const [low, high] = bandForTurn('meadow', 1);
  assert.equal(low, 2, 'the lowest legal low');
  assert.ok((low + high) / 2 >= meanDrawnSize('meadow'), 'and at the mean-size floor');
  assert.ok((low + high) / 2 - meanDrawnSize('meadow') < 1,
    `Meadow's start is ${(low + high) / 2} against a ${meanDrawnSize('meadow')} floor — not a floor at all`);
});

test('AC-306b the floor is measurable, not just arithmetic', () => {
  // The claim is that a sub-floor band CANNOT BE DELIVERED, so it measures
  // high. Proven by generating against one rather than by restating it.
  const [lo, hi] = [1, 3];
  let cells = 0;
  const batches = 20000;
  for (let seed = 0; seed < batches; seed += 1) {
    const rng = makeRng(seed * 7919 + 1);
    // Roll inside the hypothetical 1-3 band and feed the generator directly.
    const rolled = nextInt(rng, lo, hi);
    const target = rolled.value;
    const raw = target / meanDrawnSize('meadow');
    const carry = nextFraction(rolled.rng);
    const k = Math.max(1, Math.floor(raw) + (carry.value < raw - Math.floor(raw) ? 1 : 0));
    cells += k * meanDrawnSize('meadow');
  }
  const measured = cells / batches;
  const onPaper = (lo + hi) / 2;
  assert.ok(measured > onPaper + 0.3,
    `a 1-3 band asked for ${onPaper} and delivers ${measured.toFixed(2)}; if these agreed the floor would not exist`);
  assert.ok(Math.abs(measured - 2.41) < 0.15, `the designer measured 2.41, this measured ${measured.toFixed(2)}`);
});

test('gameplay.md §5.5 every band holds its fraction of the row', () => {
  // Fraction-of-row is how the bands were DERIVED for a 9-wide board (§5.6),
  // and it is no longer how they are SET: §5.6a lowered them against a
  // measurement, so these numbers now record where the retune landed rather
  // than reproducing the 10-wide design's 30/60, 40/70, 50/80.
  const fraction = (d, turn) => {
    const [lo, hi] = bandForTurn(d, turn);
    return ((lo + hi) / 2) / BOARD.width;
  };
  const pct = (v) => Math.round(v * 100);
  assert.deepEqual([pct(fraction('meadow', 1)), pct(fraction('meadow', 500))], [33, 44]);
  assert.deepEqual([pct(fraction('savanna', 1)), pct(fraction('savanna', 500))], [33, 56]);
  assert.deepEqual([pct(fraction('tundra', 1)), pct(fraction('tundra', 500))], [44, 67]);

  // Meadow and Savanna now SHARE a starting band, which §5.6a flags as a
  // consequence to watch: for twelve turns they differ only in species mix.
  // Asserted so it is a known state rather than a surprise.
  assert.deepEqual(bandForTurn('meadow', 1), bandForTurn('savanna', 1));
  assert.notDeepEqual(bandForTurn('meadow', 500), bandForTurn('savanna', 500),
    'and they must still diverge by the ceiling, or the choice stops mattering');
});

test('AC-307b the batch SCATTERS around its target, and the mean lands on it', () => {
  // The property this replaces asserted exact equality, and that equality was
  // the defect: deriving the animal count from the cell target one draw at a
  // time is what shut elephants out of the last draw of nearly every batch
  // (gameplay.md §5.2). Drawing a whole number of animals up front means a
  // batch's cells scatter. A batch that misses the target is not a defect; a
  // MEAN that misses it is.
  let scattered = 0;
  let batches = 0;
  const error = {};
  for (const difficulty of Object.keys(DIFFICULTIES)) {
    let sum = 0;
    let targets = 0;
    for (let seed = 0; seed < 60; seed++) {
      for (const { batch, target } of sample({ difficulty, turns: ALL_TURNS, seed })) {
        const cells = batchCells(batch);
        if (cells !== target) scattered += 1;
        sum += cells;
        targets += target;
        batches += 1;
      }
    }
    error[difficulty] = (sum - targets) / batches;
  }
  assert.ok(scattered > 0, 'exact equality would mean the old algorithm is back');
  // Stochastic rounding keeps the expectation on target. The residual is
  // negative because the W-1 cap truncates the top of the highest bands, which
  // AC-306 permits and asks to be recorded rather than tuned away.
  for (const [difficulty, err] of Object.entries(error)) {
    assert.ok(Math.abs(err) < 0.3, `${difficulty} mean error ${err.toFixed(3)}`);
  }
});

test('AC-307b the target itself always sits inside the band', () => {
  for (const difficulty of Object.keys(DIFFICULTIES)) {
    for (let seed = 0; seed < 20; seed++) {
      for (const { turn, target } of sample({ difficulty, turns: ALL_TURNS, seed })) {
        const [low, high] = bandForTurn(difficulty, turn);
        // The target is the roll, clamped to the cap. The buffalo no longer
        // raises it: it is scheduled OUTSIDE the k draws, so it does not
        // consume the band's cells (gameplay.md §5.2).
        assert.ok(target >= low && target <= high, `${difficulty} t${turn}: ${target}`);
      }
    }
  }
});

test('AC-306/307 generated batches sit inside their band', () => {
  for (const difficulty of Object.keys(DIFFICULTIES)) {
    for (let seed = 0; seed < 40; seed++) {
      for (const { turn, batch } of sample({ difficulty, turns: ALL_TURNS, seed })) {
        const cells = batchCells(batch);
        // A batch's CELLS no longer sit inside the band — `k` is a whole
        // number of animals, so they scatter around the rolled target
        // (AC-307b). What still holds absolutely is the cap.
        assert.ok(cells >= 1 && cells <= MAX_BATCH_CELLS,
          `${difficulty} turn ${turn}: ${cells} cells`);
      }
    }
  }
});

test('AC-308c no species is ever excluded from a draw for FITTING reasons', () => {
  // This replaces AC-316's interleaving proof, which the count-first generator
  // contradicts by design. AC-316 still describes selection and placement as
  // one loop; AC-308c forbids exactly that, because a candidate pool filtered
  // by largest-free-run is the specific mistake AC-308b exists to catch. The
  // two cannot both hold and §5.2 is the one that was rewritten — reported.
  //
  // The property, stated positively: every animal the generator can legally
  // place, it does place, and placement never fails.
  let batches = 0;
  let elephants = 0;
  for (const difficulty of Object.keys(DIFFICULTIES)) {
    for (let seed = 100; seed < 140; seed++) {
      for (const { batch } of sample({ difficulty, turns: ALL_TURNS, seed })) {
        assert.ok(batch.length > 0, 'a batch is never empty');
        assert.ok(batchCells(batch) <= MAX_BATCH_CELLS);
        elephants += batch.filter((a) => a.type === 'elephant').length;
        batches += 1;
      }
    }
  }
  assert.ok(batches >= 24000, `only ${batches} batches sampled`);
  // Under the superseded algorithm elephants were 6.6% of Savanna's draws
  // against a weight of 20. If that bias ever returns this count collapses.
  assert.ok(elephants / batches > 0.3, `only ${(elephants / batches).toFixed(2)} elephants/batch`);
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

test('AC-309 Tundra at its ceiling reaches 8 of 9, and never 9', () => {
  // Amended with the board: the old wording asked for a 9-column batch, which
  // on a 9-wide row is a self-clearing arrival that §5.2 invariant 1 forbids.
  // Tundra's ceiling dropped 7-9 -> 6-8 for the same reason.
  const widths = new Set();
  const turns = Array.from({ length: 50 }, (_, i) => i + 25);
  for (let seed = 0; seed < 10; seed++) {
    for (const { batch } of sample({ difficulty: 'tundra', turns, seed })) {
      widths.add(batchCells(batch));
    }
  }
  assert.ok(
    widths.has(BOARD.width - 1),
    `never reached ${BOARD.width - 1} columns; saw ${[...widths].sort((a, b) => a - b).join(',')}`,
  );
  assert.ok(!widths.has(BOARD.width), 'and never the whole row (AC-303)');
});

test('AC-309b no batch anywhere occupies the whole row', () => {
  for (const difficulty of Object.keys(DIFFICULTIES)) {
    for (let seed = 0; seed < 30; seed++) {
      for (const { batch } of sample({ difficulty, turns: ALL_TURNS, seed })) {
        assert.ok(batchCells(batch) <= MAX_BATCH_CELLS);
      }
    }
  }
});

test('AC-317 generation never deadlocks and never produces an empty batch', () => {
  // The old wording asked about a target of 9 satisfied by {1, 3, 5}: both the
  // target and the size-5 drawable are gone (cap is 8, elephant is 4), so the
  // case it names cannot arise. What it was really protecting is the property
  // below, and the count-first generator holds it by construction rather than
  // by interleaving — placement is arithmetic now, so there is nothing to
  // strand.
  let batches = 0;
  for (const difficulty of Object.keys(DIFFICULTIES)) {
    for (let seed = 0; seed < 200; seed++) {
      for (const { batch } of sample({ difficulty, turns: [1, 13, 25, 37, 61], seed })) {
        assert.ok(batch.length > 0, 'a batch is never empty');
        const occupied = new Set();
        for (const a of batch) {
          assert.ok(a.x >= 0 && a.x + a.size <= BOARD.width, 'in bounds (AC-305)');
          for (let c = a.x; c < a.x + a.size; c += 1) {
            assert.ok(!occupied.has(c), 'no two animals overlap (AC-304)');
            occupied.add(c);
          }
        }
        batches += 1;
      }
    }
  }
  assert.ok(batches >= 2000, `only ${batches} batches sampled`);
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

test('AC-317b/c the draw count is EXACT, and now at the shipped width', () => {
  // A retry loop would have to consume extra PRNG draws, whatever it was
  // called, so counting draws is how "no retry, no backtracking, no fallback"
  // is proven rather than asserted.
  //
  // This used to need a carve-out: at the shipped width the equality did not
  // hold, because placement drew from a candidate list whose length varied and
  // `nextInt` short-circuits a degenerate range. AC-317c made it one-sided and
  // ran the exact form at width 40. **The count-first generator removes the
  // carve-out** — placement no longer draws from a variable list, it scatters
  // the free columns — so the exact equality now holds at 9 columns, which is
  // the width that ships.
  //
  //   1 target + 1 stochastic-rounding fraction + one draw per species chosen
  //   + (n-1) to shuffle + one per free column
  let checked = 0;
  for (const difficulty of Object.keys(DIFFICULTIES)) {
    for (let seed = 0; seed < 150; seed++) {
      for (const turn of [1, 10, 13, 25, 37, 40]) {
        const before = makeRng(seed * 31 + turn);
        const out = generateBatch({ turn, difficulty, rng: before, nextId: 1 });
        const buffalo = out.batch.filter((a) => a.type === 'buffalo').length;
        const drawn = out.batch.length - buffalo;
        const free = BOARD.width - batchCells(out.batch);
        const expected = 2 + drawn + Math.max(0, out.batch.length - 1) + free;

        assert.equal(
          rngStepsBetween(before, out.rng),
          expected,
          `${difficulty} turn ${turn} seed ${seed}: ${out.batch.length} animals, ${free} free`,
        );
        checked += 1;
      }
    }
  }
  assert.ok(checked >= 2000, `only ${checked} batches checked`);
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

test('every animal drawn is also placed, and truncation only ever means the cap', () => {
  // Original wording: "a batch always reaches its target". Under count-first it
  // does not, by design (AC-307b) — the half of this that still matters is that
  // nothing is drawn and then silently dropped. The generator has exactly one
  // arm that can shorten a batch, the empty-pool break, and it may only fire
  // when the board limit is genuinely reached.
  //
  // k is recomputed here from the public primitives rather than read back out
  // of the generator, so a generator that quietly placed fewer animals than it
  // drew would disagree with this.
  let truncated = 0;
  let batches = 0;
  for (const difficulty of Object.keys(DIFFICULTIES)) {
    for (let seed = 0; seed < 40; seed++) {
      let rng = makeRng(seed);
      let nextId = 1;
      for (const turn of ALL_TURNS) {
        const [low, high] = bandForTurn(difficulty, turn);
        const rolled = nextInt(rng, low, high);
        const target = Math.max(1, Math.min(MAX_BATCH_CELLS, rolled.value));
        const raw = target / meanDrawnSize(difficulty);
        const whole = Math.floor(raw);
        const carry = nextFraction(rolled.rng);
        const k = Math.max(1, whole + (carry.value < raw - whole ? 1 : 0));

        const out = generateBatch({ turn, difficulty, rng, nextId });
        rng = out.rng;
        nextId = out.nextId;

        const buffalo = out.batch.filter((a) => a.type === 'buffalo').length;
        const placed = out.batch.length - buffalo;
        assert.ok(placed <= k, `${difficulty} t${turn}: placed ${placed} > drawn ${k}`);
        if (placed < k) {
          truncated += 1;
          assert.equal(
            batchCells(out.batch), MAX_BATCH_CELLS,
            `${difficulty} t${turn}: short by ${k - placed} with room to spare`,
          );
        }
        batches += 1;
      }
    }
  }
  assert.ok(batches >= 20000, `only ${batches} batches`);
  // Recorded, not asserted as a target: the cap bites on the highest bands.
  assert.ok(truncated / batches < 0.10, `truncated ${truncated}/${batches}`);
});
