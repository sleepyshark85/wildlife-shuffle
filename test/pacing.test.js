// AC-318 / AC-320h — pacing. Slow by nature: 330 complete bot runs.
//
// This drives the engine directly rather than calling measurePacing() from
// tools/play.mjs, so the assertion and the number printed by `--pacing` are two
// independent counts of the same thing. A miscount in either shows up as a
// disagreement instead of agreeing with itself.
//
// AC-318 IS NO LONGER A GATE. It is a starting hypothesis, and the board
// narrowing to 9 columns falsified it. The band retune (gameplay.md §5.6a)
// moved every median up, and then the habitats were removed altogether
// (§5.5b). Where each measurement landed:
//
//   difficulty  hypothesis   pre-retune   post-retune   post-retune
//                            (30 seeds)   (30 seeds)    (300 seeds)
//   meadow       100-150      73           84            69
//   savanna       60- 90      35.5         53.5          47
//   tundra        35- 55      27           30            31
//   ---- one curve, buffalo herd, no gate (this pass) ------------------
//   the curve      n/a         -            -            58   (p10 37, p90 91)
//
// THE ORDERING ASSERTION IS GONE WITH THE HABITATS, and so is AC-318d's ratio:
// there is nothing left to order or to take a ratio of. That is not a
// weakening of this file, it is the thing the removal was FOR — §5.5b's
// argument is precisely that the ratio wandered 1.15-1.62 across ten
// independent 30-seed blocks and could not carry an assertion.
//
// What is asserted instead is AC-320h's range, which is wide on purpose: it is
// a gate against the curve having MOVED, not a target to tune toward. AC-318g's
// minutes gate supersedes it once a device measurement exists.
//
// THE 30-SEED / 300-SEED SPLIT STILL MATTERS. AC-318 mandates 30 seeds and a
// 30-seed median is noisy: the mandated block overstated the old Meadow by 22%
// against a 300-seed sample. So the AC-320h gate below runs 300, and the
// 30-seed block is measured beside it and REPORTED, so the two are never
// confused again.

import test from 'node:test';
import assert from 'node:assert/strict';

import { BUFFALO, STATUS } from '../src/engine/constants.js';
import { createRun, reduce } from '../src/engine/engine.js';
import { chooseAction, measurePacing } from '../tools/bot.mjs';

/** A run is a run: long enough to be a game, short enough to be a run. */
const SANE = [10, 400];

/** AC-320h: measured 58, p10 37, p90 91 over 300 bot seeds. */
const AC_320H = [50, 70];

/** §0 wants 3-5 minutes. AC-318g's own assumption is ~4 s per turn. */
const SECONDS_PER_TURN = 4;
const MINUTES = [3, 5];

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function pct(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

/** Seeded runs to game over. Abilities OFF: AC-1404, and the curve is the curve. */
function runsToGameOver(seeds) {
  const turns = [];
  const arrivals = [];
  const retired = [];
  const locked = [];
  let peak = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    let state = createRun({ seed, abilities: false });
    const seen = new Set();
    while (state.status === STATUS.READY && state.turn < 3000) {
      state = reduce(state, chooseAction(state));
      let here = 0;
      for (const a of state.animals) if (a.type === BUFFALO) { seen.add(a.id); here += 1; }
      if (here > peak) peak = here;
    }
    turns.push(state.turn);
    arrivals.push(seen.size);
    retired.push(state.stats.buffaloRetired);
    locked.push(state.animals.reduce((n, a) => n + (a.type === BUFFALO ? a.size : 0), 0));
  }
  const mean = (v) => v.reduce((x, y) => x + y, 0) / v.length;
  return {
    turns,
    arrivals: mean(arrivals),
    retired: mean(retired),
    locked: mean(locked),
    peak,
  };
}

/**
 * ONE 300-seed sweep, read by two tests. It is 20 seconds of bot; running it
 * twice would be 40 for nothing.
 */
const WIDE = runsToGameOver(300);

test('AC-320h the curve runs 50-70 turns at the median, and the spread is reported', () => {
  const wide = WIDE;
  const m = median(wide.turns);
  const p10 = pct(wide.turns, 10);
  const p90 = pct(wide.turns, 90);

  assert.ok(m >= SANE[0] && m <= SANE[1],
    `median ${m} is outside anything that could be a run (${SANE[0]}-${SANE[1]})`);
  assert.ok(m >= AC_320H[0] && m <= AC_320H[1],
    `median ${m} is outside AC-320h's ${AC_320H[0]}-${AC_320H[1]}: the curve has moved`);

  // AC-318g's minutes gate, which AC-320h defers to. §0 asks for 3-5 minutes.
  const minutes = (m * SECONDS_PER_TURN) / 60;
  assert.ok(minutes >= MINUTES[0] && minutes <= MINUTES[1],
    `${minutes.toFixed(1)} minutes at ${SECONDS_PER_TURN} s/turn is outside §0's 3-5`);

  // The CLI counts this separately; it must agree.
  const reported = measurePacing(300);
  assert.equal(reported.median, m, `--pacing reports ${reported.median}, this measured ${m}`);
  assert.equal(reported.p10, p10);
  assert.equal(reported.p90, p90);

  console.log(
    `  AC-320h measured: median ${m} turns (p10 ${p10}, p90 ${p90}), `
    + `${minutes.toFixed(1)} min at ${SECONDS_PER_TURN} s/turn`,
  );
});

test('AC-311/gameplay.md §5.4 the herd is what the design measured', () => {
  // The five figures §5.10 predicted for this pass, measured. They are a
  // FINGERPRINT of the change rather than a tuning target: if the schedule,
  // the gate or the band moved, these move with them, and the failure names
  // which one.
  const wide = WIDE;
  assert.ok(wide.arrivals > 4.5 && wide.arrivals < 6.5,
    `${wide.arrivals.toFixed(2)} buffalo arrivals per run against a designed 5.45`);
  assert.ok(wide.retired > 0.4 && wide.retired < 0.8,
    `${wide.retired.toFixed(2)} retired per run against a designed 0.58`);
  assert.ok(wide.peak >= 8,
    `the most buffalo ever on the board at once was ${wide.peak}; the design measured 10`);
  assert.ok(wide.locked > 14 && wide.locked < 22,
    `${wide.locked.toFixed(1)} buffalo cells locked at game over against a designed 17.9`);

  console.log(
    `  herd measured: ${wide.arrivals.toFixed(2)} arrivals, ${wide.retired.toFixed(2)} retired, `
    + `peak ${wide.peak} on the board, ${wide.locked.toFixed(1)} of 135 cells locked at game over`,
  );
});

test('AC-318 the mandated 30-seed block is noisier than the gate it would set', () => {
  // AC-318 asks for 30 seeds. This measures that block and REPORTS it beside
  // the 300-seed figure, because the two disagree and the disagreement is the
  // finding: a 30-seed median overstated the old Meadow by 22%.
  const narrow = runsToGameOver(30);
  const m = median(narrow.turns);
  assert.ok(m >= SANE[0] && m <= SANE[1], `30-seed median ${m} is not a run`);
  assert.equal(measurePacing(30).median, m, 'the CLI disagrees with this test at 30 seeds');
  console.log(`  AC-318 30-seed block: median ${m}`);
});
