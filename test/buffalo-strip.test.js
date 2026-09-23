// AC-509 / AC-509c / AC-509d / AC-510 — the HUD's buffalo strip (ui.md §7.1).
//
// WHAT THIS CAN AND CANNOT CHECK, SAID PLAINLY. There is no renderer in this
// suite, so nothing here executes `BuffaloStrip`. What it does check is
// everything the component was deliberately given nothing of its own to
// decide: the ordering, the label, the show/hide rule, and every chip
// dimension. The component maps over `stripRows` and lays out with
// `chipRuleFor`; if those are right and the component is a `map`, the only
// thing left to get wrong is on a device (tier 4).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BOARD, SPECIES } from '../src/engine/constants.js';
import { createRun, currentBuffaloes } from '../src/engine/engine.js';
import { isBuffaloTurn, turnsUntilBuffalo } from '../src/engine/spawn.js';
import {
  BUFFALO_BARS, CHIP_H, CHIP_RULES, CHROME, COUNTDOWN_GAP, COUNTDOWN_W, GUTTER,
  buffaloStripMetrics, chipRoomFor, chipRuleFor,
} from '../src/ui/layout.js';
import {
  COUNTDOWN_SHOW_AT, stripIsVisible, stripLabel, stripRows,
} from '../src/ui/buffaloStrip.js';
import { animal } from './helpers.js';

const UI_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'ui');
const read = (rel) => readFileSync(path.join(UI_DIR, rel), 'utf8');

/** ui.md §3.2's reference device: 393 pt wide, so 361 pt of content. */
const REFERENCE_CONTENT = 393 - GUTTER;

// ---- AC-509 · one chip per buffalo, bottom row first ----------------------

test('AC-509 one row per buffalo, ordered bottom row first', () => {
  const base = createRun({ seed: 'strip' });
  const state = {
    ...base,
    animals: [
      { ...animal('buffalo', 0, 0), y: 7, size: 5 },
      { ...animal('buffalo', 2, 0), y: 0, size: 2 },
      { ...animal('buffalo', 4, 0), y: 3, size: 4 },
    ],
  };
  const rows = stripRows(currentBuffaloes(state), null);
  // y = 0 is the floor, so chip k is buffalo k counted up from it: the eye can
  // match a chip to a body without counting.
  assert.deepEqual(rows.map((r) => r.y), [0, 3, 7]);
  assert.deepEqual(rows.map((r) => r.size), [2, 4, 5]);
  assert.deepEqual(rows.map((r) => r.shrink), [null, null, null]);
  assert.deepEqual(rows.map((r) => r.leaving), [null, null, null]);
});

test('AC-509b/510 a retired buffalo keeps its chip until the BOARD has finished with it', () => {
  // React removed it on the commit that retired it; ui.md §7.1 gives the chip
  // 200 ms and asks the row to close "on the board's settle". So the departing
  // body comes off the turn's plan, and it takes its place in the ORDER rather
  // than being appended — a retirement must not make the other chips jump
  // before it has even faded.
  const live = [{ id: 'a', y: 4, size: 3 }, { id: 'b', y: 0, size: 5 }];
  const plan = {
    moves: { b: { size: { at: 570, dur: 260, to: 4 } } },
    departures: [
      { id: 'gone', type: 'buffalo', y: 2, size: 1, collapseAt: 680 },
      { id: 'rat9', type: 'rat', y: 2, size: 1, collapseAt: 680 },
    ],
  };
  const rows = stripRows(live, plan);
  assert.deepEqual(rows.map((r) => r.id), ['b', 'gone', 'a'], 'the departing chip lost its place');
  assert.deepEqual(rows.find((r) => r.id === 'gone').leaving, { at: 680 });
  assert.equal(rows.find((r) => r.id === 'rat9'), undefined, 'a rat got a buffalo chip');
  // AC-509b: the shrink is the plan's own entry, so the chip's segment fades on
  // the body's 260 ms timeline rather than on the React commit.
  assert.deepEqual(rows.find((r) => r.id === 'b').shrink, { at: 570, dur: 260, to: 4 });
});

test('AC-509 the chip has FIVE bars, one per buffalo segment', () => {
  // It shipped with four. The buffalo grew from size 4 to 5 when the owner's
  // 11 July values were restored and the chip never followed, so a full buffalo
  // read "4 of 4" beside a five-cell body. The count is the constant now.
  assert.equal(BUFFALO_BARS, SPECIES.buffalo.size);
  assert.equal(BUFFALO_BARS, 5);
  const source = read('components/Controls.js');
  assert.doesNotMatch(source, /i < 4;/, 'the chip counts to a literal again');
  assert.match(source, /bars/, 'the bar count is not a prop');
});

// ---- AC-509c · the countdown ----------------------------------------------

test('AC-509c the countdown is always correct, because the schedule has no hidden input', () => {
  // Played for real: at every turn of twenty runs, the number the HUD would
  // show is the number of turns until a buffalo is actually queued.
  for (let seed = 1; seed <= 20; seed += 1) {
    const state = createRun({ seed });
    for (let turn = state.turn; turn < 200; turn += 1) {
      const d = turnsUntilBuffalo(turn);
      assert.equal(isBuffaloTurn(turn + d), true, `seed ${seed} turn ${turn}: +${d} is not a buffalo turn`);
      for (let k = 0; k < d; k += 1) {
        assert.equal(isBuffaloTurn(turn + k), false, `seed ${seed} turn ${turn}: missed one at +${k}`);
      }
    }
  }
});

test('ui.md §7.1 the strip shows with a buffalo up, or a countdown of five or less', () => {
  assert.equal(COUNTDOWN_SHOW_AT, 5);
  assert.equal(stripIsVisible(0, 6), false, 'the strip is on with nothing to say');
  assert.equal(stripIsVisible(0, 5), true);
  assert.equal(stripIsVisible(0, 0), true);
  assert.equal(stripIsVisible(3, 11), true, 'a buffalo is up and the strip is hidden');
  assert.equal(stripIsVisible(0, undefined), false);
});

test('AC-509 the strip reads as one sentence, and the count is in the WORDS', () => {
  // Bar colour is never the only cue. ui.md §7.1's own example, reproduced.
  assert.equal(
    stripLabel([5, 3, 1], 4),
    'three buffalo on the board: five segments, three segments, one segment. Next buffalo in four turns.',
  );
  assert.equal(stripLabel([2], 1), 'one buffalo on the board: two segments. Next buffalo in one turn.');
  assert.equal(stripLabel([], 5), 'Next buffalo in five turns.');
  assert.equal(stripLabel([], 0), 'A buffalo arrives this turn.');
  // Past the word list it degrades to digits rather than to `undefined`.
  assert.match(stripLabel(new Array(12).fill(1), 3), /^12 buffalo on the board/);
});

// ---- AC-509d · the chips shrink to fit, and never elide -------------------

test('AC-509d ui.md §7.1s three chip rules are reproduced exactly', () => {
  assert.deepEqual(CHIP_RULES.map((r) => [r.upTo, r.bar, r.barGap, r.chipGap, r.glyph]), [
    [4, 5, 2, 10, 13],
    [7, 3, 1.5, 7, 13],
    [10, 2, 1, 5, 0],
  ]);
  // §7.1's own arithmetic: "Ten chips at the 8-10 rule occupy
  // 10 x (5 x 2 + 4 x 1) + 9 x 5 = 185 pt of a 361 pt content width".
  const ten = chipRuleFor(10, chipRoomFor(REFERENCE_CONTENT));
  assert.equal(ten.bar, 2);
  assert.equal(ten.glyph, 0, 'the glyph survives at the tightest rule');
  assert.equal(ten.row, 185);
  assert.ok(ten.row < chipRoomFor(REFERENCE_CONTENT), 'ten chips do not fit beside the countdown');
});

test('AC-509d the chips fit at every count and every supported width — and never elide', () => {
  // The sweep is the point. §7.1 sizes ten chips against the REFERENCE device;
  // the viewport sweep supports 272 pt of width, and with no population cap
  // (AC-311) nothing bounds the count. So both are swept, and the assertion is
  // that the row fits — never that something was dropped to make it fit.
  let checked = 0;
  for (let screenW = 272; screenW <= 900; screenW += 1) {
    const room = chipRoomFor(Math.max(0, screenW - GUTTER));
    let lastBar = Infinity;
    for (let n = 1; n <= 30; n += 1) {
      const rule = chipRuleFor(n, room);
      assert.ok(rule.row <= room + 1e-9, `${screenW} pt, ${n} chips: ${rule.row} > ${room}`);
      assert.ok(rule.bar > 0, `${screenW} pt, ${n} chips: a zero-width bar`);
      // Monotone: more buffalo can never make a chip BIGGER, or the row would
      // grow as the board got worse.
      assert.ok(rule.bar <= lastBar, `${screenW} pt: ${n} chips got a wider bar than ${n - 1}`);
      lastBar = rule.bar;
      checked += 1;
    }
  }
  assert.ok(checked > 18000, `only ${checked} combinations swept`);
  assert.equal(chipRuleFor(0, 300), null, 'no buffalo, no chips');

  // AC-509d in the source: nothing scrolls, wraps or hides behind a "+n". The
  // grep is scoped to the CHIP ROW's own style — the badges row beside the
  // score wraps, deliberately and for a different reason.
  const source = read('components/Hud.js');
  assert.doesNotMatch(source, /ScrollView/, 'the chip row scrolls');
  const chips = source.slice(source.indexOf('  chips: {'));
  assert.match(chips.slice(0, chips.indexOf('}')), /flexDirection: 'row'/);
  assert.doesNotMatch(chips.slice(0, chips.indexOf('}')), /flexWrap/, 'the chip row wraps');
  assert.doesNotMatch(source, /\+\$\{rows\.length/, 'the chip row elides behind a "+n"');
});

test('AC-509d the gold rim never eats the bar it is drawn on', () => {
  // §7.1: "chip rim: 1 pt #E8B44A gold". At a 2 pt bar a 1 pt rim on each side
  // leaves nothing, and the remaining/spent distinction — which is the whole
  // information — would vanish at exactly the crowd size that needs it.
  for (const n of [1, 4, 5, 7, 8, 10, 11, 20]) {
    const rule = chipRuleFor(n, chipRoomFor(REFERENCE_CONTENT));
    assert.ok(rule.rim > 0, `${n} chips: no rim at all`);
    assert.ok(rule.rim <= 1, `${n} chips: a rim over the specified 1 pt`);
    assert.ok(rule.bar - 2 * rule.rim >= rule.bar / 2,
      `${n} chips: a ${rule.bar} pt bar with ${rule.rim} pt rims is more rim than fill`);
  }
});

// ---- the strip's own box ---------------------------------------------------

test('ui.md §7.1 the strip is 20 pt over a 12 pt chip row, and never zero at stage W', () => {
  assert.equal(CHIP_H, 12);
  const full = buffaloStripMetrics(CHROME.full);
  assert.equal(full.height, 20);
  assert.equal(full.padTop, 6, 'ui.md §7.1: 6 pt top padding');
  assert.equal(full.chipH, CHIP_H);

  const compact = buffaloStripMetrics(CHROME.compact);
  assert.equal(compact.height, 16);
  assert.equal(compact.chipH, CHIP_H, 'the bars shrank with the chrome');
  assert.ok(compact.padTop >= 0);

  // Stage W reserves nothing vertically because the strip goes into the rail
  // with the HUD. A height of 0 there would be a strip with no room to draw in.
  assert.equal(CHROME.rail.strip, 0);
  assert.equal(buffaloStripMetrics(CHROME.rail).height, CHROME.full.strip);
});

test('ui.md §7.1 the countdown is reserved, right-aligned and never wraps', () => {
  assert.equal(COUNTDOWN_W, 78);
  assert.equal(COUNTDOWN_GAP, 8);
  assert.equal(chipRoomFor(REFERENCE_CONTENT), REFERENCE_CONTENT - COUNTDOWN_W - COUNTDOWN_GAP);
  assert.equal(chipRoomFor(10), 0, 'a negative chip room would lay out backwards');

  const source = read('components/Hud.js');
  assert.match(source, /numberOfLines=\{1\}/, 'the countdown may wrap');
  assert.match(source, /textAlign: 'right'/, 'the countdown is not right-aligned');
  // ui.md §10's HUD rule: at an accessibility size, trade the LABEL for the
  // value, never the height.
  assert.match(source, /large \? `\$\{BUFFALO_GLYPH\} \$\{countdown\}`/,
    'the countdown does not shorten at an accessibility size');
});

test('the strip does no arithmetic of its own', () => {
  // AC-107's rule applied to the HUD: the component maps over what the pure
  // modules return. A chip that sized itself would be v1's two disagreeing cell
  // formulas in miniature.
  const source = read('components/Hud.js');
  assert.match(source, /chipRuleFor\(/);
  assert.match(source, /buffaloStripMetrics\(/);
  assert.match(source, /stripLabel\(/);
  assert.doesNotMatch(source, /rows\.length <= \d/, 'the component picks a chip rule itself');
  // ...and the pure module imports no React and no react-native, so this file
  // can load it.
  const pure = read('buffaloStrip.js');
  assert.doesNotMatch(pure, /from 'react/, 'buffaloStrip.js reaches for React');
});

test('AC-311b the strip is sized for a herd the board can actually hold', () => {
  // A row of chips is bounded by the board, not by the design's ten: the board
  // holds `height` rows and a row can hold more than one buffalo, so the
  // sweep above going to 30 is not arbitrary caution.
  assert.ok(BOARD.height * 2 >= 30, 'the 30-chip sweep no longer covers the board');
});
