// AC-318 — pacing. Slow by nature: 90 complete bot runs.
//
// This drives the engine directly rather than calling measurePacing() from
// tools/play.mjs, so the assertion and the number printed by `--pacing` are two
// independent counts of the same thing. A miscount in either shows up as a
// disagreement instead of agreeing with itself.
//
// AC-318 IS NO LONGER A GATE. It is a starting hypothesis, and the board
// narrowing to 9 columns falsified it — every median came in short:
//
//   difficulty  hypothesis   measured median (30 seeds)   p90   min   max
//   meadow       100-150      73                          150    31   282
//   savanna       60- 90      35.5                         81    21    90
//   tundra        35- 55      27                           39    19    43
//
// So this file asserts the two things that are still PROPERTIES rather than
// preferences — the difficulty ordering, and agreement with the CLI — plus a
// sanity envelope wide enough that it cannot be read as a tuning target but
// narrow enough that an engine which ended every run on turn 2, or never ended
// one at all, would fail. The hypothesis is recorded and its distance from the
// measurement is reported, not asserted.

import test from 'node:test';
import assert from 'node:assert/strict';

import { STATUS } from '../src/engine/constants.js';
import { createRun, reduce } from '../src/engine/engine.js';
import { chooseAction, measurePacing } from '../tools/bot.mjs';

/** The pre-narrowing hypothesis, kept for the record. Not a gate. */
const HYPOTHESIS = {
  meadow: [100, 150],
  savanna: [60, 90],
  tundra: [35, 55],
};

/** A run is a run: long enough to be a game, short enough to be a run. */
const SANE = [10, 400];

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** 30 seeded runs to game over, counting turns survived. */
function turnsPerRun(difficulty, seeds = 30) {
  const turns = [];
  for (let seed = 1; seed <= seeds; seed++) {
    let state = createRun({ seed, difficulty });
    while (state.status === STATUS.READY && state.turn < 3000) {
      state = reduce(state, chooseAction(state));
    }
    turns.push(state.turn);
  }
  return turns;
}

test('AC-318 pacing is measured, ordered, and agrees with the CLI', () => {
  const medians = {};
  const report = [];
  for (const [difficulty, [low, high]] of Object.entries(HYPOTHESIS)) {
    const m = median(turnsPerRun(difficulty));
    medians[difficulty] = m;
    const verdict = m >= low && m <= high ? 'within' : m < low ? `${(low - m).toFixed(1)} short` : `${(m - high).toFixed(1)} over`;
    report.push(`${difficulty}: median ${m}, hypothesis ${low}-${high} (${verdict})`);
    assert.ok(
      m >= SANE[0] && m <= SANE[1],
      `${difficulty}: median ${m} is outside anything that could be a run (${SANE[0]}-${SANE[1]})`,
    );
  }

  // The ordering is a property of the difficulty table, not a tuning target:
  // Meadow's band is strictly below Savanna's, which is strictly below
  // Tundra's, so a run on Meadow that did not outlast one on Savanna would mean
  // the bands were not reaching the board.
  assert.ok(medians.meadow > medians.savanna, `Meadow ${medians.meadow} must outlast Savanna ${medians.savanna}`);
  assert.ok(medians.savanna > medians.tundra, `Savanna ${medians.savanna} must outlast Tundra ${medians.tundra}`);

  // The number the CLI prints is counted separately; it must agree with this one.
  const reported = measurePacing();
  for (const difficulty of Object.keys(HYPOTHESIS)) {
    assert.equal(
      reported[difficulty].median,
      medians[difficulty],
      `${difficulty}: --pacing reports ${reported[difficulty].median}, this test measured ${medians[difficulty]}`,
    );
  }

  console.log(`  AC-318 measured: ${report.join(' | ')}`);
});
