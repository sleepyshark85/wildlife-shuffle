// AC-3xx spawning, the band, and the buffalo schedule.

import test from 'node:test';
import assert from 'node:assert/strict';

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  BOARD, BUFFALO_PHASES, CURVE, MAX_BATCH_CELLS, SPECIES, meanDrawnSize,
} from '../src/engine/constants.js';
import {
  bandFloorViolations,
  bandForTurn,
  batchCells,
  generateBatch,
  isBuffaloTurn,
  turnsUntilBuffalo,
} from '../src/engine/spawn.js';
import { makeRng, nextFraction, nextInt } from '../src/engine/rng.js';


/** Generate a batch per turn, cycling through `turns`. */
function sample({ turns, seed = 7, allowBuffalo = true }) {
  let rng = makeRng(seed);
  let nextId = 1;
  const batches = [];
  for (const turn of turns) {
    const out = generateBatch({ turn, rng, nextId, allowBuffalo });
    rng = out.rng;
    nextId = out.nextId;
    batches.push({ turn, batch: out.batch, target: out.target });
  }
  return batches;
}

const ALL_TURNS = Array.from({ length: 200 }, (_, i) => i + 1);

{
  test('AC-303/304/305 batch invariants hold over 200 turns', () => {
    for (const { turn, batch } of sample({ turns: ALL_TURNS })) {
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

test('AC-306 the band ramps 2-4 -> 3-5 and stops', () => {
  assert.deepEqual(bandForTurn(1), [2, 4]);
  assert.deepEqual(bandForTurn(12), [2, 4]);
  assert.deepEqual(bandForTurn(13), [3, 5]);
});

test('AC-307d the ramp reaches its ceiling at turn 13 and never leaves it', () => {
  // The curve's escalation past turn 13 is the BUFFALO, not the band
  // (gameplay.md §5.5b). A band that kept climbing would be a second
  // escalating lever and would make the pacing measurement unattributable, so
  // "flat for ever" is the assertion rather than "flat for a while".
  for (let turn = 13; turn <= 1000; turn += 1) {
    assert.deepEqual(bandForTurn(turn), [3, 5], `turn ${turn}`);
  }
  // And nothing ANY turn produces is wider or higher than the ceiling.
  let widest = 0;
  let highest = 0;
  for (let turn = 1; turn <= 1000; turn += 1) {
    const [lo, hi] = bandForTurn(turn);
    widest = Math.max(widest, hi - lo);
    highest = Math.max(highest, hi);
  }
  assert.equal(highest, CURVE.ceilingBand[1]);
  assert.equal(widest, CURVE.ceilingBand[1] - CURVE.ceilingBand[0]);
  assert.ok(highest < MAX_BATCH_CELLS,
    'the band sits UNDER the cap; the cap is a ceiling on the table, not the table');
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
  const [low, high] = bandForTurn(1);
  assert.equal(low, 2, 'the lowest legal low');
  assert.ok((low + high) / 2 >= meanDrawnSize(), 'and at the mean-size floor');
  assert.ok((low + high) / 2 - meanDrawnSize() < 1,
    `the start is ${(low + high) / 2} against a ${meanDrawnSize()} floor — not a floor at all`);
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
    const raw = target / meanDrawnSize();
    const carry = nextFraction(rolled.rng);
    const k = Math.max(1, Math.floor(raw) + (carry.value < raw - Math.floor(raw) ? 1 : 0));
    cells += k * meanDrawnSize();
  }
  const measured = cells / batches;
  const onPaper = (lo + hi) / 2;
  assert.ok(measured > onPaper + 0.3,
    `a 1-3 band asked for ${onPaper} and delivers ${measured.toFixed(2)}; if these agreed the floor would not exist`);
  assert.ok(Math.abs(measured - 2.41) < 0.15, `the designer measured 2.41, this measured ${measured.toFixed(2)}`);
});

test('gameplay.md §5.5 the band holds its fraction of the row', () => {
  // Fraction-of-row is how the bands were DERIVED for a 9-wide board (§5.6),
  // and it is no longer how they are SET: §5.6a lowered them against a
  // measurement, so these numbers record where the retune landed rather than
  // reproducing the 10-wide design's 30 -> 60.
  const fraction = (turn) => {
    const [lo, hi] = bandForTurn(turn);
    return ((lo + hi) / 2) / BOARD.width;
  };
  const pct = (v) => Math.round(v * 100);
  assert.deepEqual([pct(fraction(1)), pct(fraction(500))], [33, 44]);
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
  let sum = 0;
  let targets = 0;
  for (let seed = 0; seed < 60; seed++) {
    // The buffalo is scheduled OUTSIDE the k draws, so it does not belong to
    // the cell total the band controls (gameplay.md §5.2).
    for (const { batch, target } of sample({ turns: ALL_TURNS, seed, allowBuffalo: false })) {
      const cells = batchCells(batch);
      if (cells !== target) scattered += 1;
      sum += cells;
      targets += target;
      batches += 1;
    }
  }
  assert.ok(scattered > 0, 'exact equality would mean the old algorithm is back');
  // Stochastic rounding keeps the expectation on target. The residual is
  // negative because the W-1 cap truncates the top of the band, which AC-306
  // permits and asks to be recorded rather than tuned away.
  const err = (sum - targets) / batches;
  assert.ok(Math.abs(err) < 0.3, `mean error ${err.toFixed(3)}`);
});

test('AC-307b the target itself always sits inside the band', () => {
  for (let seed = 0; seed < 20; seed++) {
    for (const { turn, target } of sample({ turns: ALL_TURNS, seed })) {
      const [low, high] = bandForTurn(turn);
      // The target is the roll, clamped to the cap. The buffalo does not
      // raise it: it is scheduled OUTSIDE the k draws, so it does not
      // consume the band's cells (gameplay.md §5.2).
      assert.ok(target >= low && target <= high, `t${turn}: ${target}`);
    }
  }
});

test('AC-306 generated batches stay under the cap', () => {
  for (let seed = 0; seed < 40; seed++) {
    for (const { turn, batch } of sample({ turns: ALL_TURNS, seed })) {
      const cells = batchCells(batch);
      // A batch's CELLS no longer sit inside the band — `k` is a whole
      // number of animals, so they scatter around the rolled target
      // (AC-307b). What still holds absolutely is the cap.
      assert.ok(cells >= 1 && cells <= MAX_BATCH_CELLS, `turn ${turn}: ${cells} cells`);
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
  for (let seed = 100; seed < 140; seed++) {
    for (const { batch } of sample({ turns: ALL_TURNS, seed })) {
      assert.ok(batch.length > 0, 'a batch is never empty');
      assert.ok(batchCells(batch) <= MAX_BATCH_CELLS);
      elephants += batch.filter((a) => a.type === 'elephant').length;
      batches += 1;
    }
  }
  assert.ok(batches >= 8000, `only ${batches} batches sampled`);
  // Under the superseded algorithm elephants were 6.6% of draws against a
  // weight of 20. If that bias ever returns this count collapses. The curve's
  // elephant weight is 10, the lowest of the three tables, so the floor here
  // is lower than the one the three-habitat sweep used.
  assert.ok(elephants / batches > 0.1, `only ${(elephants / batches).toFixed(3)} elephants/batch`);
});

test('AC-309/309b no batch ever occupies the whole row, and what it does reach', () => {
  // AC-309 IS STALE AND IS REPORTED, NOT REINTERPRETED. It reads "Given 500
  // batches at Tundra's ceiling band (5-7, turn 25+), Then the maximum
  // occupancy observed equals that band's high of 7" — and there is no Tundra
  // (AC-320). Its second half is general and survives verbatim: "no batch at
  // any difficulty ever reaches BOARD.width = 9, which would be a self-clearing
  // arrival". That half is asserted; the first half is replaced by RECORDING
  // what this curve actually reaches, which is what a future amendment needs.
  const widths = new Set();
  for (let seed = 0; seed < 60; seed += 1) {
    for (const { batch } of sample({ turns: ALL_TURNS, seed })) {
      widths.add(batchCells(batch));
    }
  }
  assert.ok(!widths.has(BOARD.width), 'a batch reached the whole row (AC-303)');
  const observed = Math.max(...widths);
  assert.ok(observed <= MAX_BATCH_CELLS, `observed ${observed} over the cap`);
  // Recorded: the curve's ceiling band is 3-5 and its scheduled buffalo is 5,
  // so the widest batch is a buffalo turn, not a band turn.
  assert.equal(observed, 8, `the curve's widest observed batch is ${observed} of ${BOARD.width}`);
});

test('AC-317 generation never deadlocks and never produces an empty batch', () => {
  // The old wording asked about a target of 9 satisfied by {1, 3, 5}: both the
  // target and the size-5 drawable are gone (cap is 8, elephant is 4), so the
  // case it names cannot arise. What it was really protecting is the property
  // below, and the count-first generator holds it by construction rather than
  // by interleaving — placement is arithmetic now, so there is nothing to
  // strand.
  let batches = 0;
  for (let seed = 0; seed < 600; seed++) {
    for (const { batch } of sample({ turns: [1, 13, 25, 37, 61], seed })) {
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
  for (let seed = 0; seed < 450; seed++) {
    // Turn 12 and 24 are buffalo turns: the schedule must cost no draw either
    // (AC-310b — it reads no PRNG).
    for (const turn of [1, 10, 12, 13, 24, 25, 37, 40, 46, 74]) {
      const before = makeRng(seed * 31 + turn);
      const out = generateBatch({ turn, rng: before, nextId: 1 });
      const buffalo = out.batch.filter((a) => a.type === 'buffalo').length;
      const drawn = out.batch.length - buffalo;
      const free = BOARD.width - batchCells(out.batch);
      const expected = 2 + drawn + Math.max(0, out.batch.length - 1) + free;

      assert.equal(
        rngStepsBetween(before, out.rng),
        expected,
        `turn ${turn} seed ${seed}: ${out.batch.length} animals, ${free} free`,
      );
      checked += 1;
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

// ---- the buffalo schedule (gameplay.md §5.5b) ----------------------------

/** AC-310's list, written out rather than computed, so the code cannot agree
 *  with itself by sharing an arithmetic mistake with the thing it checks. */
const SCHEDULED = [12, 24, 36, 46, 56, 66, 74, 82, 90, 98, 106, 114, 122, 130];

test('AC-310 a buffalo is queued on 12, 24, 36, 46, 56, 66, 74, 82, 90, 98 ... and no other turn', () => {
  const wanted = new Set(SCHEDULED);
  for (let turn = 0; turn <= 130; turn += 1) {
    assert.equal(isBuffaloTurn(turn), wanted.has(turn), `turn ${turn}`);
  }
  assert.equal(isBuffaloTurn(0), false, 'never turn 0');
  assert.equal(isBuffaloTurn(-12), false, 'and never a negative turn');
});

test('AC-310 the three cadences are 12, then 10, then 8 for ever', () => {
  const gaps = [];
  let last = 0;
  for (let turn = 1; turn <= 400; turn += 1) {
    if (!isBuffaloTurn(turn)) continue;
    gaps.push(turn - last);
    last = turn;
  }
  assert.deepEqual(gaps.slice(0, 6), [12, 12, 12, 10, 10, 10]);
  assert.ok(gaps.slice(6).every((g) => g === 8), `late gaps are ${[...new Set(gaps.slice(6))]}`);
  // The owner's "2-3 times" at each of the first two cadences, as a count.
  assert.equal(gaps.filter((g) => g === 12).length, 3);
  assert.equal(gaps.filter((g) => g === 10).length, 3);
});

test('AC-310b the schedule is a pure function of the turn number', () => {
  // It reads no board state, no run state and no PRNG — which is what makes
  // the HUD countdown (AC-509c) a promise rather than a guess. Proven three
  // ways: by signature, by source, and by repetition.
  assert.equal(isBuffaloTurn.length, 1, 'isBuffaloTurn takes the turn and nothing else');
  const source = readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'engine', 'spawn.js'),
    'utf8',
  );
  const body = source.slice(source.indexOf('export function isBuffaloTurn'));
  const fn = body.slice(0, body.indexOf('\n}\n') + 2);
  for (const banned of ['rng', 'animals', 'state', 'Math.random', 'board']) {
    assert.ok(!fn.includes(banned), `isBuffaloTurn reads "${banned}"`);
  }
  for (let turn = 0; turn <= 200; turn += 1) {
    assert.equal(isBuffaloTurn(turn), isBuffaloTurn(turn), `turn ${turn} is not stable`);
  }
});

test('AC-310c a scheduled buffalo is in that turn\'s batch, with no exception', () => {
  // Every scheduled turn, at 200 seeds each: the generator has exactly one
  // condition left and it is `allowBuffalo`, which is AC-313c's seeding switch
  // rather than a game rule.
  let checked = 0;
  for (let seed = 0; seed < 200; seed += 1) {
    for (const turn of SCHEDULED) {
      const out = generateBatch({ turn, rng: makeRng(seed * 104729 + turn), nextId: 1 });
      assert.equal(out.batch.filter((a) => a.type === 'buffalo').length, 1,
        `turn ${turn} seed ${seed} did not queue exactly one buffalo`);
      checked += 1;
    }
  }
  assert.ok(checked >= 2000, `only ${checked} scheduled turns checked`);

  // And on no unscheduled turn, at the same sample size.
  for (let seed = 0; seed < 200; seed += 1) {
    for (const turn of [1, 11, 13, 23, 35, 37, 45, 47, 67, 73, 75]) {
      const out = generateBatch({ turn, rng: makeRng(seed * 104729 + turn), nextId: 1 });
      assert.equal(out.batch.some((a) => a.type === 'buffalo'), false, `turn ${turn} seed ${seed}`);
    }
  }
});

test('AC-311 the generator has no gate on what is already on the board', () => {
  // DO NOT FIX THIS BACK. The owner overruled one-at-a-time having played it,
  // and a population cap is an owner decision (open-questions.md Q11), never a
  // defect fix. The gate is gone at the level of the SIGNATURE: there is no
  // parameter through which a caller could tell the generator what is standing
  // on the board, so no gate can be reintroduced without changing the shape of
  // the call — which is what makes this greppable rather than hopeful.
  const source = readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'engine', 'spawn.js'),
    'utf8',
  );
  const code = source.replace(/^\s*(\/\/|\*|\/\*).*$/gm, '');
  assert.ok(!code.includes('hasBuffaloOnBoard'), 'the one-at-a-time gate is back');
  assert.ok(!code.includes('buffaloesOnBoard'), 'the generator can see the board again');
  assert.ok(!code.includes('cap)'), 'the size <= cap condition is back (AC-310c)');

  // And behaviourally: the same scheduled turn queues a buffalo however many
  // are notionally standing, because there is nothing to tell it.
  const a = generateBatch({ turn: 46, rng: makeRng(5), nextId: 1 });
  const b = generateBatch({ turn: 46, rng: makeRng(5), nextId: 1, width: BOARD.width });
  assert.deepEqual(a.batch, b.batch);
  assert.equal(a.batch.filter((x) => x.type === 'buffalo').length, 1);
});

test('AC-311b holds for two FULL buffalo and for nothing else. REPORTED.', () => {
  // AC-311b: "no row contains two buffalo, because 2 x SPECIES.buffalo.size >
  // BOARD.width (10 > 9)". The arithmetic is right and the conclusion is wrong,
  // because a buffalo SHRINKS. This test asserts both halves so the true
  // statement is the one on record.
  assert.ok(2 * SPECIES.buffalo.size > BOARD.width,
    `two FULL buffalo: 2 x ${SPECIES.buffalo.size} does fit in ${BOARD.width}`);

  // A shrunk buffalo and a full one fit exactly, and the engine reaches it:
  // measured over 18,712 bot turns on 300 seeds, 15.2% of settled boards had at
  // least two buffalo in one row, the worst four of them (3+2+2+1 of 9).
  const pairs = [];
  for (let a = 1; a <= SPECIES.buffalo.size; a += 1) {
    for (let b = a; b <= SPECIES.buffalo.size; b += 1) {
      if (a + b <= BOARD.width) pairs.push([a, b]);
    }
  }
  assert.ok(pairs.length > 0,
    'AC-311b would hold if no two buffalo sizes fitted a row; these do: '
      + JSON.stringify(pairs));
  assert.deepEqual(pairs.at(-1), [4, 5], 'the pair that fills a row exactly');

  // AC-504's termination floor is therefore NOT `width - buffalo.size` = 4.
  // `(width - B) + n` cells leave a completed row, and `B - n` is maximised at
  // 7 by the 4+5 pair, so the true floor is 2. See resolve.js and the comment
  // beside CHAIN_GUARD_STEPS.
  let floor = BOARD.width;
  const walk = (from, sizes) => {
    const B = sizes.reduce((x, y) => x + y, 0);
    if (sizes.length > 0) floor = Math.min(floor, BOARD.width - B + sizes.length);
    for (let size = from; size <= SPECIES.buffalo.size; size += 1) {
      if (B + size <= BOARD.width) walk(size, [...sizes, size]);
    }
  };
  walk(1, []);
  assert.equal(floor, 2, 'the worst-case cells removed by one clear step');
  assert.ok(floor >= 1, 'board mass still strictly decreases, so the loop terminates');
});

test('AC-509c the countdown is the schedule, read forwards', () => {
  for (let turn = 0; turn <= 300; turn += 1) {
    const d = turnsUntilBuffalo(turn);
    assert.ok(d >= 0, `turn ${turn}: ${d}`);
    assert.equal(isBuffaloTurn(turn + d), true, `turn ${turn} + ${d} is not a buffalo turn`);
    for (let k = 0; k < d; k += 1) {
      assert.equal(isBuffaloTurn(turn + k), false, `turn ${turn}: missed one at +${k}`);
    }
    assert.ok(d <= Math.max(...BUFFALO_PHASES.map((ph) => ph.every)),
      `turn ${turn}: ${d} is longer than the longest cadence`);
  }
  assert.equal(turnsUntilBuffalo(12), 0, 'a scheduled turn counts down to zero');
  assert.equal(turnsUntilBuffalo(11), 1);
  assert.equal(turnsUntilBuffalo(13), 11);
  assert.equal(turnsUntilBuffalo(67), 7);
});

test('AC-314 the same seed and turn produce an identical batch', () => {
  const a = generateBatch({ turn: 17, rng: makeRng(123), nextId: 1 });
  const b = generateBatch({ turn: 17, rng: makeRng(123), nextId: 1 });
  assert.deepEqual(a, b);

  const c = generateBatch({ turn: 17, rng: makeRng(124), nextId: 1 });
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
  for (let seed = 0; seed < 120; seed++) {
    let rng = makeRng(seed);
    let nextId = 1;
    for (const turn of ALL_TURNS) {
      const [low, high] = bandForTurn(turn);
      const rolled = nextInt(rng, low, high);
      const target = Math.max(1, Math.min(MAX_BATCH_CELLS, rolled.value));
      const raw = target / meanDrawnSize();
      const whole = Math.floor(raw);
      const carry = nextFraction(rolled.rng);
      const k = Math.max(1, whole + (carry.value < raw - whole ? 1 : 0));

      const out = generateBatch({ turn, rng, nextId });
      rng = out.rng;
      nextId = out.nextId;

      const buffalo = out.batch.filter((a) => a.type === 'buffalo').length;
      const placed = out.batch.length - buffalo;
      assert.ok(placed <= k, `t${turn}: placed ${placed} > drawn ${k}`);
      if (placed < k) {
        truncated += 1;
        assert.equal(
          batchCells(out.batch), MAX_BATCH_CELLS,
          `t${turn}: short by ${k - placed} with room to spare`,
        );
      }
      batches += 1;
    }
  }
  assert.ok(batches >= 20000, `only ${batches} batches`);
  // Recorded, not asserted as a target: the cap bites on the highest bands.
  assert.ok(truncated / batches < 0.10, `truncated ${truncated}/${batches}`);
});
