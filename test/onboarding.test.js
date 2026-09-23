// AC-1206 to AC-1208 · the four-beat onboarding.
//
// Every one of these runs the REAL engine over the REAL beat boards. That is
// possible because `src/ui/onboarding.js` imports nothing that only exists on a
// device (§6.7's second rule), and it is the only reason "each beat gates on
// the player performing the action" is a checkable claim rather than a promise
// about a component nobody can mount in Node.
//
// The seeded sweeps below are not thoroughness for its own sake. The batch the
// tray draws changes with the seed, and the batch lands on the beat's board and
// is then packed down by gravity — so "does this beat behave" has a different
// answer on different seeds, and two beats were already wrong in exactly that
// way when they were checked on one.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BOARD, SPECIES } from '../src/engine/constants.js';
import { MOVE_OK, applyGravity, checkMove } from '../src/engine/board.js';
import { ACTIONS, reduce } from '../src/engine/engine.js';
import {
  BEAT,
  BEATS,
  beatIndex,
  beatRun,
  nextBeat,
  trayKept,
} from '../src/ui/onboarding.js';
import { DEFAULT_THEME } from '../src/ui/theme.js';
import {
  SAVE_SCHEMA_VERSION,
  defaultSave,
  hasPlayed,
  migrate,
  parseSave,
  serialiseSave,
  withOnboarded,
} from '../src/ui/progress.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');
/**
 * A source file with its comments removed, so a grep does not fire on the
 * paragraph explaining the rule it is checking. Both of the greps below did
 * exactly that on their first run — the same trap `test/hygiene.test.js` has a
 * `code()` helper for, and the reason this one is a copy of it.
 */
const code = (f) =>
  read(f)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const SEEDS = 200;
const seeds = (tag) => Array.from({ length: SEEDS }, (_, i) => `${tag}-${i}`);

/**
 * The move each beat is asking the player for. It lives in the test rather than
 * in the module because the module must not know the answer: a beat that
 * shipped its own solution could gate on "did they do what I said" without the
 * engine ever agreeing that the board changed.
 */
const SOLUTION = {
  slide: (state) => {
    const fox = state.animals.find((a) => a.type === 'fox');
    return { type: ACTIONS.MOVE, id: fox.id, x: 3 };
  },
  clear: (state) => {
    const rat = state.animals.find((a) => a.y === 1 && a.x === 0);
    const hole = holeIn(state.animals, 0);
    return { type: ACTIONS.MOVE, id: rat.id, x: hole };
  },
  tray: () => ({ type: ACTIONS.PASS }),
  buffalo: (state) => {
    const rat = state.animals.find((a) => a.y === 1);
    return { type: ACTIONS.MOVE, id: rat.id, x: holeIn(state.animals, 0) };
  },
};

/** The one empty column of row `y`. */
function holeIn(animals, y) {
  const filled = new Set();
  for (const a of animals) if (a.y === y) for (let x = a.x; x < a.x + a.size; x += 1) filled.add(x);
  const gaps = [];
  for (let x = 0; x < BOARD.width; x += 1) if (!filled.has(x)) gaps.push(x);
  assert.equal(gaps.length, 1, `row ${y} has ${gaps.length} gaps, expected 1`);
  return gaps[0];
}

// ---- AC-1206: four beats, on the real board -------------------------------

test('AC-1206 there are exactly four beats, in gameplay.md §11 order', () => {
  assert.deepEqual(BEATS, ['slide', 'clear', 'tray', 'buffalo']);
  assert.deepEqual(BEATS.map(beatIndex), [0, 1, 2, 3]);
  assert.deepEqual(BEATS.map(nextBeat), ['clear', 'tray', 'buffalo', null]);
  for (const id of BEATS) {
    assert.equal(BEAT[id].id, id);
    assert.ok(BEAT[id].title.length > 0 && BEAT[id].body.length > 0, `${id} has no copy`);
  }
});

test('AC-1206 every beat board is a board the rules could have produced', () => {
  for (const id of BEATS) {
    const state = beatRun(id, `shape-${id}`);
    // Settled: gravity is a fixed point, so nothing is floating.
    assert.deepEqual(applyGravity(state.animals), state.animals, `${id} board is not settled`);
    // No two animals share a cell, and nothing hangs off the edge.
    const seen = new Set();
    for (const a of state.animals) {
      assert.equal(a.size, SPECIES[a.type].size, `${id}: ${a.type} has the wrong size`);
      assert.ok(a.x >= 0 && a.x + a.size <= BOARD.width, `${id}: ${a.id} is off the board`);
      for (let x = a.x; x < a.x + a.size; x += 1) {
        const key = `${x},${a.y}`;
        assert.ok(!seen.has(key), `${id}: two animals occupy ${key}`);
        seen.add(key);
      }
    }
    assert.ok(state.animals.every((a) => a.y < BOARD.killLine), `${id} opens above the kill line`);
  }
});

test('AC-1206 an onboarding run is scripted but never persisted or scored', () => {
  for (const id of BEATS) {
    const state = beatRun(id, `fresh-${id}`);
    // AC-320: there is nothing left to choose a habitat with. The beat
    // boards were always scripted, so the collapse moved nothing here.
    assert.equal(state.difficulty, undefined);
    assert.equal(state.score, 0);
    assert.equal(state.turn, 1);
    assert.equal(state.lastTurn, null, `${id} opens replaying a turn`);
    assert.deepEqual(state.moves, [], `${id} opens with a move log`);
    // Abilities are a fifth thing to explain and §11 lists four beats.
    assert.equal(state.abilities, false);
    assert.equal(state.origin.abilities, false);
  }
});

test('AC-1206 the same beat and seed always produce the same board and tray', () => {
  for (const id of BEATS) {
    const a = beatRun(id, 'determinism');
    const b = beatRun(id, 'determinism');
    assert.deepEqual(a.animals, b.animals);
    assert.deepEqual(a.queue, b.queue);
  }
});

test('AC-1206 each beat gates on the player performing THAT action', () => {
  for (const id of BEATS) {
    let satisfied = 0;
    for (const seed of seeds(id)) {
      const before = beatRun(id, seed);
      const action = SOLUTION[id](before);
      if (action.type === ACTIONS.MOVE) {
        assert.equal(
          checkMove(before.animals, action.id, action.x, BOARD.width),
          MOVE_OK,
          `${id}/${seed}: the beat's own solution is an illegal move`,
        );
      }
      const after = reduce(before, action);
      assert.ok(BEAT[id].gate(before, after), `${id}/${seed}: the solution did not satisfy the gate`);
      satisfied += 1;
    }
    assert.equal(satisfied, SEEDS);
  }
});

/**
 * The check that found two real defects.
 *
 * The beat boards are one row from finished, so the arrival lands on them and
 * gravity packs the risen row straight back down into the gap. Over 500 seeds
 * that completed beat 2's row on 286 and shrank beat 4's buffalo on 5, with the
 * player having done nothing but press Pass. Both gates counted it, and both
 * beats therefore congratulated a player who had been shown nothing.
 *
 * The fix was to require the CLEAR_STEP in the SETTLE phase — the phase the
 * player's own move produces. This is the test that says so.
 */
test('AC-1206 no beat is satisfied by pressing Pass', () => {
  for (const id of BEATS) {
    if (id === 'tray') continue; // beat 3's action IS any turn; see below
    for (const seed of seeds(`pass-${id}`)) {
      const before = beatRun(id, seed);
      const after = reduce(before, { type: ACTIONS.PASS });
      assert.ok(
        !BEAT[id].gate(before, after),
        `${id}/${seed}: a bare Pass completed the beat`,
      );
    }
  }
});

test('AC-1206 no beat is satisfied before the player does anything', () => {
  for (const id of BEATS) {
    const state = beatRun(id, 'untouched');
    assert.ok(!BEAT[id].gate(state, state), `${id} is satisfied on arrival`);
  }
});

test('AC-1206 beat 1 wants the fox in the gap, not merely a fox that moved', () => {
  const before = beatRun('slide', 'fox');
  const fox = before.animals.find((a) => a.type === 'fox');
  for (const x of [0, 1, 2, 4, 5, 6, 7]) {
    if (checkMove(before.animals, fox.id, x, BOARD.width) !== MOVE_OK) continue;
    const after = reduce(before, { type: ACTIONS.MOVE, id: fox.id, x });
    assert.ok(!BEAT.slide.gate(before, after), `sliding the fox to ${x} completed the beat`);
  }
  const rat = before.animals.find((a) => a.type === 'rat' && a.x === 2);
  const wrongAnimal = reduce(before, { type: ACTIONS.MOVE, id: rat.id, x: 3 });
  assert.ok(!BEAT.slide.gate(before, wrongAnimal), 'moving a rat into the gap completed the beat');
});

test('AC-1206 beat 1 teaches sliding, not clearing: the move itself clears nothing', () => {
  // The board is two cells short after the fox lands, so the player's own move
  // can never complete it — 0 clears in the SETTLE phase over 500 seeds.
  //
  // The ARRIVAL phase is a different matter and deliberately not asserted: on
  // 81 seeds in 500 the batch lands, gravity packs the row and it goes, with
  // the player having done nothing. That is the game being itself, one beat
  // before the game explains it. It is a pacing question for the designer, not
  // a defect — flagged rather than suppressed, because suppressing it would
  // mean scripting the tray, and beat 3 is about the tray being unscripted.
  for (const seed of seeds('order')) {
    const before = beatRun('slide', seed);
    const after = reduce(before, SOLUTION.slide(before));
    const byPlayer = after.lastTurn.events.some(
      (e) => e.type === 'CLEAR_STEP' && e.phase === 'SETTLE' && e.clearedRows.length > 0,
    );
    assert.ok(!byPlayer, `${seed}: beat 1's own move cleared a row`);
  }
});

test('AC-1206 a gate is a fact about ONE turn, not a counter that stays risen', () => {
  // Every gate has two halves and this is what the second one buys. Beat 2's
  // counter half (`rowsCleared` went up) is monotonic and would go on reading
  // true for the rest of the beat once it had moved; its phase half is a fact
  // about the turn just resolved and goes false again immediately. Both are
  // required, so the caption cannot confirm a lesson three turns old.
  //
  // The screen holds consecutive states rather than the opening one for the
  // same reason, which with the phase half in place is defence in depth rather
  // than the thing doing the work. Both are kept: the phase half is what makes
  // the gate correct, and one guard is how this went wrong the first time.
  for (const id of ['clear', 'buffalo']) {
    const opening = beatRun(id, `sticky-${id}`);
    const solved = reduce(opening, SOLUTION[id](opening));
    assert.ok(BEAT[id].gate(opening, solved), `${id}: the solution did not fire`);
    // The counter half, on its own, is still true a turn later...
    const later = reduce(solved, { type: ACTIONS.PASS });
    assert.ok(
      later.stats.rowsCleared >= solved.stats.rowsCleared &&
        later.stats.buffaloShrinks >= solved.stats.buffaloShrinks,
      `${id}: the counters are not monotonic, so this test is checking nothing`,
    );
    // ...and the gate is not, because the phase half is about that turn.
    assert.ok(!BEAT[id].gate(solved, later), `${id}: the gate fired on a turn with no lesson`);
  }
});

test('AC-1206 beat 4 shrinks the buffalo by exactly one segment and clears no row', () => {
  for (const seed of seeds('buffalo')) {
    const before = beatRun('buffalo', seed);
    const was = before.animals.find((a) => a.type === 'buffalo');
    assert.equal(was.size, SPECIES.buffalo.size);
    const after = reduce(before, SOLUTION.buffalo(before));
    const now = after.animals.find((a) => a.type === 'buffalo');
    assert.ok(now, `${seed}: the buffalo vanished`);
    assert.equal(now.size, SPECIES.buffalo.size - 1, `${seed}: buffalo went to ${now.size}`);
    assert.equal(after.stats.buffaloShrinks, 1);
  }
});

// ---- AC-1208: the tray tells the truth ------------------------------------

test('AC-1208 beat 3 lands every silhouette in its own column, on every seed', () => {
  for (const seed of seeds('tray')) {
    const before = beatRun('tray', seed);
    assert.ok(before.queue.length > 0, `${seed}: nothing in the tray`);
    const after = reduce(before, { type: ACTIONS.PASS });
    const kept = trayKept(before.queue, after.animals);
    assert.deepEqual(kept.mismatches, [], `${seed}: the tray lied`);
    assert.ok(kept.ok);
    // ...and the beat is over precisely because that was true.
    assert.ok(BEAT.tray.gate(before, after));
  }
});

test('AC-1208 beat 3 cannot be completed by a turn in which the tray lied', () => {
  // The gate is the proof, so the proof has to be able to fail. Each of these
  // is one of the ways v1's preview broke: a different column, a different
  // footprint, a different animal, and an animal that simply did not come.
  const before = beatRun('tray', 'liar');
  const after = reduce(before, { type: ACTIONS.PASS });
  const lies = {
    'moved column': (a) => ({ ...a, x: (a.x + 1) % BOARD.width }),
    'changed footprint': (a) => ({ ...a, size: a.size + 1 }),
    'swapped species': (a) => ({ ...a, type: a.type === 'rat' ? 'fox' : 'rat' }),
    'floated off the floor': (a) => ({ ...a, y: a.y + 1 }),
  };
  for (const [name, lie] of Object.entries(lies)) {
    const [first, ...rest] = after.animals;
    const tampered = [lie(first), ...rest];
    const kept = trayKept(before.queue, tampered);
    assert.ok(!kept.ok, `trayKept accepted a board where the arrival ${name}`);
    assert.ok(kept.mismatches.length > 0, `trayKept reported no mismatch for ${name}`);
  }
  // The arrival never arriving at all is the fifth, and the one v1 shipped.
  const vanished = trayKept(before.queue, []);
  assert.ok(!vanished.ok);
  assert.equal(vanished.mismatches.length, before.queue.length);
  assert.ok(vanished.mismatches.every((m) => m.field === 'present'));
});

test('AC-1208 an empty tray is never "kept" — a vacuous pass is not a proof', () => {
  // `trayKept([], anything)` has no mismatch to report, and a check whose
  // happy path is "there was nothing to compare" is §6.2's check that cannot
  // fail. It returns false.
  assert.equal(trayKept([], []).ok, false);
});

test('AC-1208 the proof compares the BOARD, never the arrival event', () => {
  // The ARRIVAL event carries `placed`, which is `state.queue.map(...)` — the
  // queue itself. Comparing the two would always agree, whatever the board did.
  assert.ok(!/\bplaced\b/.test(code('src/ui/onboarding.js')),
    'onboarding.js reads the ARRIVAL event\'s own copy of the queue');
});

// ---- AC-1207: it runs once --------------------------------------------------

test('AC-1207 a fresh save has not been onboarded, and the flag survives a round trip', () => {
  const save = defaultSave();
  assert.equal(save.schemaVersion, SAVE_SCHEMA_VERSION);
  assert.equal(save.onboarded, false);
  const done = withOnboarded(save);
  assert.equal(done.onboarded, true);
  assert.notEqual(done, save, 'withOnboarded mutated the save');
  const roundTripped = parseSave(serialiseSave(done));
  assert.equal(roundTripped.onboarded, true);
  // Idempotent: skip-then-complete writes the same save.
  assert.equal(withOnboarded(done), done);
});

test('AC-1207 completion and skip are indistinguishable in the save', () => {
  // The save records THAT onboarding finished and not HOW, because nothing is
  // allowed to treat the two differently and a field nobody may branch on is a
  // field somebody will branch on.
  assert.ok(!/skipped|completedBeat|onboardingStep/.test(code('src/ui/progress.js')));
});

test('AC-1006/AC-1207 a version-1 save migrates to the current schema, keeping every choice', () => {
  const v1 = {
    schemaVersion: 1,
    best: defaultSave().best,
    lifetime: { ...defaultSave().lifetime, games: 12, rows: 300 },
    recent: [],
    streak: { count: 4, lastDay: '2026-09-01' },
    unlocks: { announced: ['goldenHerd'], applied: { palette: 'tundra' } },
    settings: { sizeNumerals: true, highContrast: false, reduceMotion: true },
  };
  const parsed = parseSave(JSON.stringify(v1));
  assert.ok(parsed, 'a version-1 save was discarded');
  assert.equal(parsed.schemaVersion, SAVE_SCHEMA_VERSION);
  assert.equal(parsed.onboarded, false);
  assert.equal(parsed.settings.sizeNumerals, true);
  assert.equal(parsed.settings.reduceMotion, true);
  assert.equal(parsed.settings.sound, true, 'the version-2 defaults were lost');
  assert.equal(parsed.settings.theme, DEFAULT_THEME, 'the version-4 default was lost');
  assert.equal(parsed.streak.count, 4);
  assert.equal(parsed.lifetime.games, 12);
  assert.deepEqual(parsed.unlocks.applied, { palette: 'tundra' });
});

test('AC-1006/AC-1207 a version-2 save migrates forward and keeps its settings', () => {
  const v2 = { ...defaultSave(), schemaVersion: 2, settings: { ...defaultSave().settings, sound: false } };
  delete v2.onboarded;
  delete v2.settings.theme;
  const parsed = parseSave(JSON.stringify(v2));
  assert.ok(parsed, 'a version-2 save was discarded');
  assert.equal(parsed.schemaVersion, SAVE_SCHEMA_VERSION);
  assert.equal(parsed.onboarded, false);
  assert.equal(parsed.settings.sound, false);
  assert.equal(parsed.settings.theme, DEFAULT_THEME);
});

/**
 * AC-1006b, for the field AC-1501 added.
 *
 * *An AC that has never had a second version to migrate to has not been
 * tested, only written* — and this one now has three. The planted fault is
 * step 3 -> 4 doing nothing: the blob below is EXACTLY what `migrate` would
 * hand `parseSave` if the step were missing or if it forgot the key, and the
 * save has to be discarded rather than opened with half a settings object.
 * (Verified by deleting the step from `src/ui/progress.js` and watching this
 * test and the two above fail, then restoring it from a scratchpad copy.)
 */
test('AC-1006b a version-3 save gains the theme, and a step that forgot it loses the save', () => {
  const v3 = { ...defaultSave(), schemaVersion: 3, settings: { ...defaultSave().settings } };
  delete v3.settings.theme;
  v3.lifetime = { ...v3.lifetime, games: 7 };

  const parsed = parseSave(JSON.stringify(v3));
  assert.ok(parsed, 'a version-3 save was discarded instead of migrated');
  assert.equal(parsed.schemaVersion, SAVE_SCHEMA_VERSION);
  assert.equal(parsed.lifetime.games, 7, 'the records did not survive the migration');
  // AC-1501: a player who has only ever had the dark build is moved to the
  // theme the owner chose, not left in the one that was overruled.
  assert.equal(parsed.settings.theme, DEFAULT_THEME);

  // THE PLANTED FAULT, as a value: a step that bumped the number and added
  // nothing. `parseSave` must refuse it, so the failure is "opened on
  // defaults" rather than "opened with a theme field that is not there".
  const forgot = { ...v3, schemaVersion: SAVE_SCHEMA_VERSION };
  assert.equal(parseSave(JSON.stringify(forgot)), null,
    'a save with no theme was accepted at the current schema version');

  // ...and a theme this build does not ship is refused like any other value
  // the app did not write. `__proto__` is in the list because `THEME[name]`
  // is not a membership test.
  for (const bad of ['midnight', '__proto__', 'Light', true, null, 1]) {
    const tampered = { ...defaultSave(), settings: { ...defaultSave().settings, theme: bad } };
    assert.equal(parseSave(JSON.stringify(tampered)), null,
      `theme: ${JSON.stringify(bad)} was accepted`);
  }
});

test('AC-1006 the migration runs every step in sequence, not a jump to the top', () => {
  // A 1 -> 4 that skipped a step would produce a blob with no `settings.sound`
  // or no `settings.theme`, which `parseSave` then discards — a save silently
  // lost on update. Three steps now, and the count is asserted so adding a
  // fourth without a test for it shows up here.
  const stepped = migrate({ schemaVersion: 1, settings: { sizeNumerals: true } });
  assert.equal(stepped.schemaVersion, SAVE_SCHEMA_VERSION);
  assert.equal(stepped.onboarded, false);
  assert.equal(stepped.settings.haptics, true);
  assert.equal(stepped.settings.sizeNumerals, true);
  assert.equal(stepped.settings.theme, DEFAULT_THEME);
  // A current blob is handed back untouched.
  const current = { schemaVersion: SAVE_SCHEMA_VERSION, onboarded: true };
  assert.equal(migrate(current), current);
});

test('AC-1005/AC-1207 a save whose onboarded field is not a boolean is discarded whole', () => {
  for (const bad of ['yes', 1, null, {}, []]) {
    const blob = { ...defaultSave(), schemaVersion: SAVE_SCHEMA_VERSION, onboarded: bad };
    assert.equal(parseSave(JSON.stringify(blob)), null, `onboarded: ${JSON.stringify(bad)} was accepted`);
  }
});

test('AC-1206 an existing player is not shown a tutorial by an app update', () => {
  // `onboarded` migrates in as false for everybody, because a migration cannot
  // invent a value it was never given. `hasPlayed` is the second condition.
  const fresh = defaultSave();
  assert.equal(hasPlayed(fresh), false);
  const veteran = { ...fresh, lifetime: { ...fresh.lifetime, games: 1 } };
  assert.equal(hasPlayed(veteran), true);
  const shell = read('App.js');
  assert.match(
    shell,
    /!progress\.save\.onboarded\s*&&\s*!hasPlayed\(progress\.save\)/,
    'App.js no longer gates onboarding on both conditions',
  );
});

test('AC-1207 every way out of onboarding writes the flag', () => {
  const shell = read('App.js');
  // onNext on the last beat, onSkip, and walking out through Pause -> Back to
  // home all route to the same function, and that function is the only caller
  // of `finishOnboarding`.
  const ends = (shell.match(/endTutorial/g) || []).length;
  assert.ok(ends >= 4, `only ${ends} references to endTutorial`);
  assert.match(shell, /onSkip: endTutorial/);
  assert.match(shell, /onQuit=\{endTutorial\}/);
  assert.match(shell, /last \? endTutorial : advanceTutorial/);
  assert.equal(
    (shell.match(/finishOnboarding\(\)/g) || []).length,
    1,
    'finishOnboarding is called from more than one place',
  );
});

test('AC-1207 onboarding is reachable from the Pause sheet, and not from inside itself', () => {
  assert.match(read('src/ui/screens/PauseSheet.js'), /label="How to play"/);
  assert.match(read('src/ui/screens/PauseSheet.js'), /\{onHowToPlay \?/);
  // GameScreen is given the handler only for an ordinary run: the onboarding
  // branch of App.js passes no `onHowToPlay` at all.
  const shell = read('App.js');
  const tutorialBranch = shell.slice(shell.indexOf('if (tutorial)'), shell.indexOf('if (run)'));
  assert.ok(!tutorialBranch.includes('onHowToPlay'), 'onboarding offers itself');
});

test('AC-1207 an onboarding run writes nothing to the save', () => {
  const body = code('src/ui/screens/GameScreen.js');
  // Both writes a run can make — the resume record on backgrounding and the
  // run record on game over — are guarded. A grep, because neither can be
  // reached without a renderer; the guard is one line and its absence is the
  // whole defect.
  const background = body.slice(body.indexOf('useOnBackground'), body.indexOf('const [outcome'));
  assert.match(background, /if \(onboarding\) return;/, 'the resume write is not guarded');
  assert.ok(
    body.includes('if (onboarding) return;\n    if (!over) {'),
    'the run-record write is not guarded',
  );
  assert.match(body, /run\.view\.gameOver && outcome && !onboarding/,
    'the Game Over sheet is still shown during onboarding');
});

test('AC-1206 the beats run on the shipped Game screen, not a copy of it', () => {
  const shell = read('App.js');
  assert.match(shell, /resumed=\{beatRun\(tutorial\.beat, tutorial\.seed\)\}/);
  // There is exactly one board, one tray and one action bar in this codebase,
  // and onboarding uses them by using GameScreen.
  const coach = read('src/ui/screens/OnboardingCoach.js');
  for (const forbidden of ['Board', 'Tray', 'ActionBar', 'AnimalView']) {
    assert.ok(
      !new RegExp(`from '.*${forbidden}\\.js'`).test(coach),
      `the coach renders its own ${forbidden}`,
    );
  }
});

test('AC-1206 the onboarding rules import nothing that only runs on a device', () => {
  // §6.7: anything that must be checkable off-device imports nothing native.
  // Every assertion in this file depends on it.
  const body = read('src/ui/onboarding.js');
  for (const m of body.matchAll(/from '([^']+)'/g)) {
    assert.match(m[1], /^\.\.?\//, `onboarding.js imports the package ${m[1]}`);
  }
  assert.ok(!/react|reanimated|expo/i.test(body.match(/^import[\s\S]*?;\n\n/m)[0]));
});
