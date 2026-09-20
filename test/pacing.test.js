// AC-318 — pacing. Slow by nature: 90 complete bot runs.
//
// This drives the engine directly rather than calling measurePacing() from
// tools/play.mjs, so the assertion and the number printed by `--pacing` are two
// independent counts of the same thing. A miscount in either shows up as a
// disagreement instead of agreeing with itself.

import test from 'node:test';
import assert from 'node:assert/strict';

import { STATUS } from '../src/engine/constants.js';
import { createRun, reduce } from '../src/engine/engine.js';
import { chooseAction, measurePacing } from '../tools/bot.mjs';

const RANGES = {
  meadow: [100, 150],
  savanna: [60, 90],
  tundra: [35, 55],
};

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

test('AC-318 median turns per run land in the acceptance ranges', () => {
  const medians = {};
  for (const [difficulty, [low, high]] of Object.entries(RANGES)) {
    medians[difficulty] = median(turnsPerRun(difficulty));
    assert.ok(
      medians[difficulty] >= low && medians[difficulty] <= high,
      `${difficulty}: median ${medians[difficulty]} outside ${low}-${high}`,
    );
  }

  assert.ok(medians.meadow > medians.savanna, 'Meadow outlasts Savanna');
  assert.ok(medians.savanna > medians.tundra, 'Savanna outlasts Tundra');

  // The number the CLI prints is counted separately; it must agree with this one.
  const reported = measurePacing();
  for (const difficulty of Object.keys(RANGES)) {
    assert.equal(
      reported[difficulty].median,
      medians[difficulty],
      `${difficulty}: --pacing reports ${reported[difficulty].median}, this test measured ${medians[difficulty]}`,
    );
  }
});
