// The diagnostic log (the owner's request, after the invisible-animals bug).
//
// The test that matters here is the last one: the log has to make the fault
// that caused it obvious. A log that would not have caught its own origin
// story is the wrong log, so that is asserted rather than assumed.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clearDiagnostics,
  diagnosticsAvailable,
  diagnosticsEnabled,
  diagnosticsReport,
  recordTurn,
  registerProbe,
  releaseProbe,
  setDiagnosticsEnabled,
} from '../src/ui/diagnostics.js';

const DEV = () => true;
const RELEASE = () => false;

const board = [
  { id: 'a1', type: 'rat', x: 0, y: 0, size: 1 },
  { id: 'a2', type: 'fox', x: 3, y: 0, size: 2 },
];

const turn = (animals = board) => ({
  turn: 12,
  action: 'MOVE',
  seed: 'mfr2f6yo.8roxq0',
  difficulty: 'savanna',
  score: 1240,
  gained: 100,
  lockMs: 898,
  animals,
});

/** What an animal that rendered correctly would report. */
const healthy = (a) => () => ({ col: a.x, row: a.y, cells: a.size, alpha: 1, arriving: false });

function reset() {
  setDiagnosticsEnabled(false, DEV);
  for (const a of board) releaseProbe(a.id);
}

test('AC-1301 the log is off by default and records nothing', () => {
  reset();
  assert.equal(diagnosticsEnabled(), false);
  recordTurn(turn());
  assert.match(diagnosticsReport(), /off/i);

  // "The report says off" is not the property — the report says that whether
  // or not anything was retained. The property is that nothing WAS retained,
  // so turn it on afterwards and look. (The first version of this assertion
  // could not fail: planting a recording no-op left it green.)
  setDiagnosticsEnabled(true, DEV);
  assert.doesNotMatch(diagnosticsReport(), /turn 12/);
  reset();
});

test('the log cannot be turned on in a production bundle', () => {
  reset();
  setDiagnosticsEnabled(true, RELEASE);
  assert.equal(diagnosticsEnabled(), false);
  recordTurn(turn());
  assert.match(diagnosticsReport(), /off/i);
  setDiagnosticsEnabled(true, DEV);
  assert.doesNotMatch(diagnosticsReport(), /turn 12/, 'it recorded while it was off');
  // ...and the real probe is the build flag, which Node does not set.
  assert.equal(diagnosticsAvailable(), false);
  reset();
});

test('the log leads with the seed, so a report is a reproduction', () => {
  reset();
  setDiagnosticsEnabled(true, DEV);
  for (const a of board) registerProbe(a.id, healthy(a));
  recordTurn(turn());

  const report = diagnosticsReport();
  // Anchored to the start of a line: the unanchored version also matched the
  // `replay ... --seed <seed>` line below, so deleting the seed header left it
  // green. A check that another line satisfies is not a check.
  assert.match(report, /^seed {8}mfr2f6yo\.8roxq0$/m);
  assert.match(report, /^difficulty {2}savanna$/m);
  assert.match(report, /node tools\/play\.mjs --seed mfr2f6yo\.8roxq0/);
  assert.match(report, /turn 12\s+MOVE\s+score 1,240\s+\+100/);
  reset();
});

test('turning the log off forgets what it had', () => {
  reset();
  setDiagnosticsEnabled(true, DEV);
  recordTurn(turn());
  assert.match(diagnosticsReport(), /turn 12/);
  setDiagnosticsEnabled(false, DEV);
  setDiagnosticsEnabled(true, DEV);
  assert.doesNotMatch(diagnosticsReport(), /turn 12/);
  reset();
});

test('clearing keeps the log on', () => {
  reset();
  setDiagnosticsEnabled(true, DEV);
  recordTurn(turn());
  clearDiagnostics();
  assert.equal(diagnosticsEnabled(), true);
  assert.doesNotMatch(diagnosticsReport(), /turn 12/);
  reset();
});

test('a probe that throws does not take the turn with it', () => {
  reset();
  setDiagnosticsEnabled(true, DEV);
  registerProbe('a1', () => { throw new Error('shared value gone'); });
  registerProbe('a2', healthy(board[1]));
  recordTurn(turn());
  const report = diagnosticsReport();
  assert.match(report, /not rendered/);
  assert.match(report, /turn 12/);
  reset();
});

test('an animal still in flight is reported as arriving, not as a fault', () => {
  // The flight hands over at the END of the turn's timeline and AC-824f ends
  // the lock BEFORE that, so the log samples an arriving animal mid-handover.
  // Left as-is it cried wolf on every single arrival, which would have taught
  // the owner to ignore the loudest line in the log.
  reset();
  setDiagnosticsEnabled(true, DEV);
  registerProbe('a1', healthy(board[0]));
  registerProbe('a2', () => ({ col: 3, row: 0, cells: 2, alpha: 0, arriving: true }));
  recordTurn(turn());

  const report = diagnosticsReport();
  assert.match(report, /arriving 1/);
  assert.match(report, /\(arriving\)/);
  assert.doesNotMatch(report, /INVISIBLE/, 'an arrival mid-handover is not a fault');
  reset();
});

// ---- the one that matters ------------------------------------------------

test('THE ORIGIN STORY: the log makes an invisible animal obvious at a glance', () => {
  // The bug the owner reported: animals arriving from the tray rendered at
  // opacity 0 and stayed that way. They were in the DOM, at the RIGHT ROWS,
  // moving correctly every turn — which is why 195 unit tests, a 78-turn
  // parity run and a 296-drag measurement all passed straight over it.
  reset();
  setDiagnosticsEnabled(true, DEV);
  registerProbe('a1', healthy(board[0]));
  // Right place, right width, right everything — and not drawn.
  registerProbe('a2', () => ({ col: 3, row: 0, cells: 2, alpha: 0, arriving: false }));
  recordTurn(turn());

  const report = diagnosticsReport();
  assert.match(report, /1 ON THE BOARD BUT INVISIBLE/);
  assert.match(report, /<- INVISIBLE/);
  // The engine and rendered columns agree — which is the whole point. A log
  // that only printed positions would have shown nothing wrong here.
  assert.match(report, /a2\s+fox\s+r 0 c 3 w2\s+r 0 c 3 w2\s+0\.00/);
  reset();
});

test('the log also catches the failures position tests DO cover', () => {
  reset();
  setDiagnosticsEnabled(true, DEV);
  registerProbe('a1', () => ({ col: 7, row: 4, cells: 1, alpha: 1, arriving: false }));
  registerProbe('a2', () => ({ col: 3, row: 0, cells: 5, alpha: 1, arriving: false }));
  recordTurn(turn());

  const report = diagnosticsReport();
  assert.match(report, /1 IN THE WRONG PLACE/);
  assert.match(report, /<- MOVED/);
  assert.match(report, /<- WRONG WIDTH/);
  reset();
});
