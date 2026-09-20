// AC-8xx, the motion half: the replay plan.
//
// Everything a clear animation does is decided here, by a pure function, from
// the event stream the engine already emitted. That is what makes AC-834
// checkable without a renderer: the plan is downstream of the board, and the
// board is downstream of nothing.
//
// The visual half — that the flash is actually white, that the collapse is
// actually visible — cannot be asserted in Node and is verified by driving the
// real app (see the report).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ACTIONS, createRun, reduce } from '../src/engine/engine.js';
import { turnTimeline } from '../src/ui/timeline.js';
import { BOARD } from '../src/engine/constants.js';
import { buildReplay, inDangerBand } from '../src/ui/replay.js';
import { runReducer } from '../src/ui/useGameRun.js';
import {
  MOTION, MOTION_SIZE, NUMERAL, SPECIES_STYLE, brighten, contrast,
} from '../src/ui/theme.js';
import { animal, fullRow, rowExcept } from './helpers.js';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));

/** The AC-504d fixture: a settled board whose cascade runs 10 steps deep. */
function deepChainBoard() {
  const file = path.join(TEST_DIR, 'fixtures', 'deep-board.json');
  return JSON.parse(readFileSync(file, 'utf8')).map((a, i) => ({ ...a, id: `deep-${i}` }));
}

/**
 * A board whose SETTLE really cascades in two steps.
 *
 * It has to be built with care, because the turn applies gravity BEFORE the
 * clear loop: anything that could simply fall into a gap does so first, and
 * then both rows complete in one step. A genuine step 2 needs an animal that
 * could not move until a clear released it.
 *
 *   row 2        . . . . . . . . . R      the rider, held up by the fox
 *   row 1        R R R R R R R R F F      full: this is what clears first
 *   row 0        R R R R R R R R R .      one short, at column 9
 *
 * Row 1 clears; the rider drops two rows into column 9; row 0 completes.
 */
function cascadeBoard() {
  const rider = animal('rat', 9, 2);
  return {
    rider,
    board: [
      ...rowExcept(0, [9]),
      ...Array.from({ length: 8 }, (_, x) => animal('rat', x, 1)),
      animal('fox', 8, 1),
      rider,
    ],
  };
}

/**
 * Resolve one PASS over a hand-built board and return { before, after, plan }.
 * The board is used verbatim — the turn's own SETTLE gravity is part of what is
 * under test, so it must not be pre-applied here.
 */
function turnOn(animals, queue = []) {
  const base = createRun({ seed: 'replay' });
  const before = { ...base, animals, queue };
  const after = runReducer(before, { type: ACTIONS.PASS });
  return { before, after, plan: after.plan };
}

// ---- the plan is derived, never a driver (AC-833, AC-834) ----------------

test('AC-834 the plan is additive: the board and the score are what reduce() said', () => {
  // The wrapper the state layer uses must not be able to change the game. If a
  // frame never plays, `state.animals` is still this.
  for (let s = 0; s < 12; s += 1) {
    let plain = createRun({ seed: `same-${s}`, difficulty: 'savanna' });
    let wrapped = createRun({ seed: `same-${s}`, difficulty: 'savanna' });
    for (let turn = 0; turn < 20 && plain.status === 'READY'; turn += 1) {
      plain = reduce(plain, { type: ACTIONS.PASS });
      wrapped = runReducer(wrapped, { type: ACTIONS.PASS });
      assert.deepEqual(wrapped.animals, plain.animals, `seed ${s} turn ${turn}: board`);
      assert.equal(wrapped.score, plain.score, `seed ${s} turn ${turn}: score`);
      assert.deepEqual(wrapped.stats, plain.stats, `seed ${s} turn ${turn}: stats`);
    }
  }
});

test('AC-201 buildReplay does not touch the board it is handed', () => {
  // The snapshot is taken before anything has run, because the fault this
  // guards against is an ALIAS: replaying the events over the caller's own
  // objects rather than over copies would rewrite the board it is describing,
  // and a snapshot taken afterwards would have been rewritten with it.
  const board = [...fullRow(0), animal('elk', 3, 1), animal('rat', 0, 2)];
  const snapshot = JSON.parse(JSON.stringify(board));
  const base = createRun({ seed: 'replay' });
  const after = reduce({ ...base, animals: board, queue: [] }, { type: ACTIONS.PASS });
  const plan = buildReplay(board, after.lastTurn);
  assert.deepEqual(board, snapshot, 'buildReplay rewrote the board it was given');
  assert.ok(plan.departures.length > 0, 'the fixture must actually clear');
});

// ---- the clear (ui.md §8.2a) --------------------------------------------

test('AC-511 a cleared animal is drawn exactly once, at the row it left from', () => {
  const { rider, board } = cascadeBoard();
  const { after, plan } = turnOn(board);

  const steps = after.lastTurn.events.filter((e) => e.type === 'CLEAR_STEP');
  assert.equal(steps.length, 2, 'the fixture must actually cascade');

  const removed = steps.flatMap((e) => e.removedIds.concat(e.retiredIds));
  assert.equal(plan.departures.length, removed.length);
  assert.deepEqual(
    plan.departures.map((d) => d.id).sort(),
    removed.slice().sort(),
    'every animal the engine removed is drawn leaving, and nothing else is',
  );
  // AC-511: exactly once. The same rows flashing twice is v1's C7.
  assert.equal(new Set(plan.departures.map((d) => d.id)).size, plan.departures.length);

  // The rider left from row 0, not from row 2 where it started: by the step
  // that took it, gravity had already moved it two rows. Only a replay of the
  // events over the pre-turn board knows that, and getting it wrong would draw
  // the clear happening in a row that is not the row that cleared.
  const drawn = plan.departures.find((d) => d.id === rider.id);
  assert.equal(drawn.y, 0);
  assert.equal(drawn.x, 9);
});

test('AC-807/AC-511 an animal that falls before it clears leaves from where it landed', () => {
  // The rat is floating three rows above the gap it completes. The turn's own
  // SETTLE gravity drops it; the clear then takes it. Drawing it leaving from
  // row 3 would show the clear happening in a row that did not clear.
  const faller = animal('rat', 9, 3);
  const { after, plan } = turnOn([...rowExcept(0, [9]), faller]);

  const gravity = after.lastTurn.events.find((e) => e.type === 'GRAVITY');
  assert.deepEqual(gravity.moved, [{ id: faller.id, fromY: 3, toY: 0 }]);
  assert.equal(plan.departures.find((d) => d.id === faller.id).y, 0);
});

test('an animal that falls and SURVIVES is given the fall to play', () => {
  // The same drop, with the row one short so nothing clears: now it is the
  // board's own animal and the plan has to move it.
  const faller = animal('rat', 8, 3);
  const { plan } = turnOn([...rowExcept(0, [8, 9]), faller]);
  const move = plan.moves[faller.id];
  // One key, not three: the ARRIVAL phase lifts it a row and gravity puts it
  // straight back, which is a round trip to where it already was.
  assert.equal(move.keys.length, 1);
  assert.equal(move.keys[0].y, 0);
  assert.equal(move.keys[0].dur, MOTION.fall);
  assert.equal(move.keys[0].kind, 'fall');
  // AC-807: a landing squashes, and the squash waits for the landing.
  assert.equal(move.landAt, move.keys[0].at + move.keys[0].dur);
});

test('an animal that has left the board is not left behind in `moves`', () => {
  // Reproduced by the tester on an ARRIVAL clear: an arriving animal cleared
  // by its own turn sat in `moves` still holding a flight record while also
  // appearing in `departures`. Nothing iterates `moves` instead of the board
  // today, which is the only reason it never drew the same animal flying in
  // and collapsing at once.
  const queue = [animal('fox', 8, 0)];
  const { after, plan } = turnOn([...rowExcept(0, [8, 9])], queue);
  assert.ok(plan.departures.length > 0, 'the fixture must clear on ARRIVAL');

  const live = new Set(after.animals.map((a) => a.id));
  for (const id of Object.keys(plan.moves)) {
    assert.ok(live.has(id) || live.has(Number(id)), `${id} is in moves but not on the board`);
  }
  for (const gone of plan.departures) {
    assert.equal(plan.moves[gone.id], undefined, `${gone.id} departed and kept a moves entry`);
  }
});

test('AC-813/AC-813b the first step is announced 80 ms before it goes', () => {
  const { plan } = turnOn(cascadeBoard().board);
  const starts = [...new Set(plan.departures.map((d) => d.collapseAt))].sort((a, b) => a - b);
  assert.equal(starts.length, 2, 'two steps, two distinct collapse times');

  const first = plan.departures.find((d) => d.collapseAt === starts[0]);
  const second = plan.departures.find((d) => d.collapseAt === starts[1]);
  assert.equal(first.collapseAt - first.flashAt, MOTION.lead);
  assert.equal(second.collapseAt - second.flashAt, 0);

  // AC-813b: the asymmetry IS the specification. Asserting the two numbers
  // against theme.js would only be theme.js agreeing with itself, so assert
  // the property they exist to produce: a decay that is several times the
  // attack, which is what stops the row reading as abrupt.
  assert.ok(
    MOTION.flashDecay >= 4 * MOTION.flashAttack,
    `decay ${MOTION.flashDecay} is not several times attack ${MOTION.flashAttack}`,
  );
  // ...and the total the ACs quote is the sum of the two that ship.
  assert.equal(MOTION.flashAttack + MOTION.flashDecay, 320);
});

test('AC-813c the flash is an announcement, so it costs the budget nothing', () => {
  // The property, swept: however the turn is shaped, the flash never delays
  // input by more than a frame. On every shape but one it finishes INSIDE the
  // structural window, because the collapse's own 110+200 tail outlasts the
  // 240 ms of flash left after the lead. The exception is a turn whose last
  // animated unit is a cascade step 2+, where it runs 10 ms past.
  let worstOverhang = -Infinity;
  for (let settle = 0; settle <= 6; settle += 1) {
    for (let arrival = 0; settle + arrival <= 6; arrival += 1) {
      if (settle + arrival === 0) continue;
      const events = [];
      for (let k = 1; k <= settle; k += 1) {
        events.push({ type: 'CLEAR_STEP', phase: 'SETTLE', step: k });
      }
      for (let k = 1; k <= arrival; k += 1) {
        events.push({ type: 'CLEAR_STEP', phase: 'ARRIVAL', step: k });
      }
      const t = turnTimeline(events, 'MOVE');
      const lastFlash = Math.max(...t.units.map((u) => u.flashAt));
      const flash = (MOTION.flashAttack + MOTION.flashDecay) * t.scale;
      worstOverhang = Math.max(worstOverhang, lastFlash + flash - t.lockMs);
    }
  }
  assert.ok(worstOverhang <= 16, `the flash ran ${worstOverhang} ms past the lock`);
  assert.ok(worstOverhang > 0, 'AC-813c allows an overhang; if there is none, say so');
});

test('AC-813d the fade outlives the collapse, and the collapse goes somewhere', () => {
  // Again the property rather than the digits: the point of AC-813d is that
  // the structural part ends before the announcement does, and that a cleared
  // body actually shrinks and moves rather than just vanishing.
  assert.ok(MOTION.fadePast > 0, 'the fade must outlive the structural collapse');
  assert.ok(MOTION_SIZE.collapseScale < 1 && MOTION_SIZE.collapseScale > 0.5);
  assert.ok(MOTION_SIZE.collapseDrift > 0, 'things that leave should go somewhere');
});

test('AC-811 the screen shakes at three rows in one step, and not at two', () => {
  const two = turnOn([...fullRow(0), ...fullRow(1)]);
  assert.equal(two.after.lastTurn.events.find((e) => e.type === 'CLEAR_STEP').clearedRows.length, 2);
  assert.equal(two.plan.shakeAt, null);

  const three = turnOn([...fullRow(0), ...fullRow(1), ...fullRow(2)]);
  assert.equal(
    three.after.lastTurn.events.find((e) => e.type === 'CLEAR_STEP').clearedRows.length,
    3,
  );
  assert.ok(three.plan.shakeAt !== null);
});

// ---- the cap is presentation only (AC-825) ------------------------------

test('AC-825 a 10-step cascade replays as at most 6 units and still pays 17,100', () => {
  const before = { ...createRun({ seed: 1 }), streak: 5, animals: deepChainBoard(), queue: [] };
  const after = runReducer(before, { type: ACTIONS.PASS });

  // The engine resolved and scored every step (AC-504c/504d), untouched.
  assert.equal(after.score, 17100);
  assert.equal(after.stats.longestChain, 10);
  assert.equal(after.stats.buffaloRetired, 1);

  const steps = after.lastTurn.events.filter((e) => e.type === 'CLEAR_STEP');
  assert.ok(steps.length >= 10, `only ${steps.length} steps in the fixture`);

  // ...and the replay folds them into 6 animated units, losing nobody.
  const units = new Set(after.plan.departures.map((d) => `${d.flashAt}/${d.collapseAt}`));
  assert.ok(units.size <= 6, `${units.size} animated units`);
  const removed = steps.flatMap((e) => e.removedIds.concat(e.retiredIds));
  assert.deepEqual(after.plan.departures.map((d) => d.id).sort(), removed.slice().sort());
  assert.ok(after.plan.lockMs <= 1500);
});

// ---- buffalo (AC-508, AC-812) -------------------------------------------

test('AC-508/AC-812 a shrinking buffalo gets a new width and a shard, not a departure', () => {
  // A complete row containing a size-4 buffalo: everything else in the row
  // goes, the buffalo loses one segment, and the row does NOT clear (AC-506).
  const buff = animal('buffalo', 0, 0);
  const board = [buff, ...Array.from({ length: 6 }, (_, i) => animal('rat', 4 + i, 0))];
  const { after, plan } = turnOn(board);

  const step = after.lastTurn.events.find((e) => e.type === 'CLEAR_STEP');
  assert.deepEqual(step.shrunk, [{ id: buff.id, fromSize: 4, toSize: 3 }]);
  assert.equal(step.clearedRows.length, 0, 'a buffalo row does not clear');

  assert.equal(plan.departures.some((d) => d.id === buff.id), false);
  assert.deepEqual(plan.moves[buff.id].size, {
    at: plan.departures[0].collapseAt,
    dur: MOTION.buffaloShrink,
    to: 3,
  });
  // The segment that came off is the trailing one: the buffalo keeps its x.
  assert.equal(plan.shards.length, 1);
  assert.equal(plan.shards[0].x, buff.x + 3);
  // AC-813: a buffalo row is not announced as "going", because it is not.
  assert.equal(plan.flashes.length, 0);
  // ...but the player is told what happened.
  assert.ok(plan.floats.some((f) => f.text === 'BUFFALO −1'));
});

// ---- the score announcement (AC-615, AC-615b, AC-615c) ------------------

test('AC-615/AC-615b the score waits for the board to say so', () => {
  // An ARRIVAL clear: the shape where the count-up used to finish 233-249 ms
  // before the row it was paying for had even flashed.
  const queue = [animal('fox', 8, 0)];
  const { after, plan } = turnOn([...rowExcept(0, [8, 9])], queue);
  assert.ok(after.lastTurn.score > 0, 'the fixture must actually score');

  const firstFlash = Math.min(...plan.departures.map((d) => d.flashAt));
  const firstCollapse = Math.min(...plan.departures.map((d) => d.collapseAt));

  assert.ok(plan.score, 'a scoring turn must carry a count-up');
  // AC-615: it starts at the first clear unit's collapse, never at the commit.
  assert.equal(plan.score.at, firstCollapse);
  assert.notEqual(plan.score.at, 0);
  // AC-615b: it cannot have finished — or even started — before the flash.
  assert.ok(plan.score.at > firstFlash, 'the score moved before the row was announced');
  assert.equal(plan.score.gained, after.lastTurn.score);

  // The floating +N is the same announcement and keeps the same clock.
  const float = plan.floats.find((f) => f.tone === 'score');
  assert.equal(float.at, plan.score.at);
  assert.equal(float.text, `+${after.lastTurn.score}`);
});

test('AC-615c a cascade gets ONE sweep, spanning its steps', () => {
  const { after, plan } = turnOn(cascadeBoard().board);
  const collapses = [...new Set(plan.departures.map((d) => d.collapseAt))]
    .sort((a, b) => a - b);
  assert.equal(collapses.length, 2, 'the fixture must cascade');

  // One count-up, not one per step.
  assert.equal(plan.floats.filter((f) => f.tone === 'score').length, 1);
  assert.equal(plan.score.at, collapses[0]);
  assert.equal(
    plan.score.dur,
    Math.max(MOTION.scoreCount, collapses[1] - collapses[0] + MOTION.scoreCount),
  );
  // ...and it is still running when the last step lands, which is the point:
  // one accumulating sweep rather than a counter that restarts.
  assert.ok(plan.score.at + plan.score.dur > collapses[1]);
  assert.equal(plan.score.gained, after.lastTurn.score);
});

test('a turn that scores nothing announces nothing', () => {
  const { after, plan } = turnOn([animal('rat', 0, 0)]);
  assert.equal(after.lastTurn.score, 0);
  assert.equal(plan.score, null);
  assert.equal(plan.floats.filter((f) => f.tone === 'score').length, 0);
});

// ---- the buffalo chip (AC-509b) -----------------------------------------

test('AC-509b the chip is given the body\'s own timeline, not the commit', () => {
  const buff = animal('buffalo', 0, 0);
  const board = [buff, ...Array.from({ length: 6 }, (_, i) => animal('rat', 4 + i, 0))];
  const { after, plan } = turnOn(board);

  const shrink = plan.moves[buff.id].size;
  const collapse = Math.min(...plan.departures.map((d) => d.collapseAt));
  // The HUD reads this off the same plan the body plays, so the two cannot
  // disagree: same start, same 260 ms, same target size.
  assert.equal(shrink.at, collapse);
  assert.equal(shrink.dur, MOTION.buffaloShrink);
  assert.equal(shrink.to, after.animals.find((a) => a.id === buff.id).size);
  assert.ok(shrink.at > 0, 'the commit is at 0; the chip must not fade there');
});

// ---- anticipation (AC-824d) ---------------------------------------------

test('AC-824d an ARRIVAL clear washes the row it is about to complete', () => {
  const queue = [animal('fox', 8, 0)];
  const { after, plan } = turnOn([...rowExcept(0, [8, 9])], queue);

  const step = after.lastTurn.events.find(
    (e) => e.type === 'CLEAR_STEP' && e.phase !== 'SETTLE',
  );
  assert.ok(step, 'the fixture must clear during ARRIVAL');

  assert.ok(plan.anticipate, 'an ARRIVAL clear must be anticipated');
  assert.deepEqual(plan.anticipate.rows, step.clearedRows);
  // It fades in across the push-up — the 260 ms the player is otherwise
  // waiting through with nothing to look at (ui.md §8.2b).
  assert.equal(plan.anticipate.dur, MOTION.arrival);
  // ...and hands over to the flash rather than stacking under it.
  const firstFlash = Math.min(...plan.departures.map((d) => d.flashAt));
  assert.equal(plan.anticipate.handoverAt, firstFlash);
  assert.ok(plan.anticipate.at + plan.anticipate.dur <= firstFlash);
});

test('AC-824d a SETTLE clear is not anticipated: it has nothing to wait for', () => {
  const { after, plan } = turnOn([...fullRow(0), animal('elk', 3, 1)]);
  assert.ok(
    after.lastTurn.events.some((e) => e.type === 'CLEAR_STEP' && e.phase === 'SETTLE'),
  );
  assert.equal(plan.anticipate, null);
});

// ---- arrival (AC-809) ----------------------------------------------------

test('AC-809 every animal from the tray is given a flight from the tray', () => {
  const queue = [animal('fox', 0, 0), animal('elk', 4, 0)];
  const { after, plan } = turnOn([animal('rat', 9, 0)], queue);

  for (const arriving of queue) {
    const move = plan.moves[arriving.id];
    assert.ok(move && move.arrival, `${arriving.type} arrived with no flight`);
    assert.equal(move.arrival.dur, MOTION.arrival);
    assert.equal(move.arrival.trayX, arriving.x);
  }
  // The animal that was already on the board is pushed up, and gets no flight.
  const resident = after.animals.find((a) => a.type === 'rat');
  assert.equal(plan.moves[resident.id].arrival, null);
});

// ---- the danger band (AC-810) -------------------------------------------

test('AC-810 the pulse follows the band, and stops when it is clear', () => {
  assert.equal(inDangerBand([animal('rat', 0, BOARD.dangerBandLow - 1)]), false);
  assert.equal(inDangerBand([animal('rat', 0, BOARD.dangerBandLow)]), true);
  assert.equal(inDangerBand([animal('rat', 0, BOARD.dangerBandHigh)]), true);
  assert.equal(inDangerBand([]), false);
});

// ---- ui.md §5.4 ----------------------------------------------------------

// ---- contrast (AC-905b, AC-909) -----------------------------------------

test('AC-905b the size numeral clears 4.5:1 on every species, by construction', () => {
  // The old numeral took the species' emoji ink at 0.85 opacity and failed on
  // three of five (fox 4.46, elk 3.92, elephant 3.47). Emoji ink is decorative
  // by design; the numeral is the information. The chip makes the answer the
  // same number whatever is underneath it.
  const ratio = contrast(NUMERAL.ink, NUMERAL.chip);
  assert.ok(ratio >= 4.5, `numeral contrast is ${ratio.toFixed(2)}:1`);
  assert.equal(Number(ratio.toFixed(1)), 16.7);

  // And prove the arithmetic is the arithmetic that condemned the old choice:
  // recomputing the superseded treatment must still fail on the same three.
  const composite = (fg, bg, alpha) => {
    const px = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const mix = px(fg).map((c, i) => Math.round(alpha * c + (1 - alpha) * px(bg)[i]));
    return `#${mix.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
  };
  const failed = Object.entries(SPECIES_STYLE)
    .filter(([, v]) => contrast(composite(v.glyph, v.fill, 0.85), v.fill) < 4.5)
    .map(([k]) => k);
  assert.deepEqual(failed.sort(), ['elephant', 'elk', 'fox']);
});

test('ui.md §5.4 the grabbed edge brightens 12%, and clamps at white', () => {
  assert.equal(brighten('#000000', 0.12), '#000000');
  assert.equal(brighten('#646464', 0.12), '#707070'); // 100 -> 112
  assert.equal(brighten('#ffffff', 0.12), '#ffffff'); // clamped, not wrapped
  assert.notEqual(brighten('#D9A83C', MOTION_SIZE.edgeBrighten), '#D9A83C');
});
