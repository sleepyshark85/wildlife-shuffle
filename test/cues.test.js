// AC-11xx · sound and haptics.
//
// This is the least testable slice in the project: you cannot hear a sound in
// `node --test` and you cannot feel a haptic anywhere but a phone. So the
// question every test here answers is the one the brief asked — *what part of
// this can be made checkable?* — and the answer turns out to be most of it,
// because almost nothing about a cue is the noise itself:
//
//   * which cue fires and when is a fold of the engine's event stream;
//   * the chain's rising pitch is arithmetic;
//   * the toggles are logic;
//   * the audio session — the thing that decides whether a player's podcast
//     keeps playing — is a value, and applying it is an ORDER.
//
// What is genuinely left for a device is in the slice report. It is short, and
// it is short on purpose.
//
// Every test here was run against a planted fault before it was trusted
// (docs/development-process.md §6.2); the plant is named where it is not
// obvious. Plants were restored from a scratchpad copy, never `git checkout`
// (§6.6).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ACTIONS, createRun } from '../src/engine/engine.js';
import { BOARD, STATUS } from '../src/engine/constants.js';
import {
  AUDIO_MODE,
  CHAIN_SEMITONE,
  CUE,
  CUES,
  CUE_IDS,
  CUE_MIN_GAP_MS,
  HAPTIC,
  HAPTIC_IDS,
  REFERENCE_HZ,
  SAMPLE_RATE,
  SOUNDS,
  chainRate,
  coalesceCues,
  cueChannels,
  cuePlan,
  dueCount,
  semitone,
} from '../src/ui/cues.js';
import { makeCueEngine } from '../src/ui/cueEngine.js';
import { turnTimeline } from '../src/ui/timeline.js';
import { runReducer } from '../src/ui/useGameRun.js';
import { render, wavFile } from '../tools/make-sounds.mjs';
import { LAST, animal, fullRow, rowExcept } from './helpers.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOUND_DIR = path.join(ROOT, 'assets', 'sounds');

/** Resolve one PASS over a hand-built board; the same shape replay.test.js uses. */
function turnOn(animals, queue = []) {
  const before = { ...createRun({ seed: 'cues' }), animals, queue };
  const after = runReducer(before, { type: ACTIONS.PASS });
  return { after, plan: after.plan };
}

/**
 * A board whose SETTLE cascades in two steps.
 *
 *   row 2        . . . . . . . . R      the rider, held up by the fox
 *   row 1        R R R R R R R F F      full: this is what clears first
 *   row 0        R R R R R R R R .      one short, in the last column
 */
function cascadeBoard() {
  return [
    ...rowExcept(0, [LAST]),
    ...Array.from({ length: BOARD.width - 2 }, (_, x) => animal('rat', x, 1)),
    animal('fox', LAST - 1, 1),
    animal('rat', LAST, 2),
  ];
}

const cuesOf = (plan, id) => plan.cues.filter((c) => c.cue === id);

// ---- AC-1101 · eleven cues, and eleven different noises -------------------

test('AC-1101 every moment the criteria name has a cue, and every cue has a file', () => {
  // Restated from AC-1101 rather than derived from CUE, so that deleting a cue
  // fails here instead of quietly shrinking the thing the test iterates.
  assert.deepEqual([...CUE_IDS].sort(), [
    'chain', 'clear', 'drop', 'gameOver', 'grab', 'illegal',
    'land', 'newBest', 'perfect', 'retire', 'shrink',
  ]);

  for (const id of CUE_IDS) {
    const def = CUES[id];
    assert.ok(def, `${id} has no definition`);
    assert.equal(typeof def.sound, 'string', `${id} has no sound`);
    assert.ok(SOUNDS[def.sound], `${id}'s sound ${def.sound} is not in SOUNDS`);
    const file = path.join(SOUND_DIR, `${def.sound}.wav`);
    assert.ok(existsSync(file), `${id}'s sound file is missing: ${file}`);
    // Every haptic it asks for is one the player knows how to perform.
    for (const h of def.haptics) assert.ok(HAPTIC[h], `${id} asks for unknown haptic ${h}`);
  }
  // ...and SOUNDS carries nothing no cue asks for, which is the other half of
  // "no dead assets".
  const wanted = new Set(CUE_IDS.map((id) => CUES[id].sound));
  assert.deepEqual(Object.keys(SOUNDS).filter((s) => !wanted.has(s)), []);
});

/**
 * "Distinct" (AC-1101), as something other than an opinion about eleven files.
 *
 * Two cues on the same waveform are confusable unless they are far enough apart
 * in PITCH or far enough apart in LENGTH. Four semitones is a major third —
 * under that, two blips a quarter-second apart read as the same event mistuned.
 * A 2x length ratio is the other axis: a 45 ms tick and a 520 ms fanfare are
 * not the same cue however close their fundamentals are.
 *
 * The rule is a function so the test below can prove it fires.
 */
function confusablePairs(table) {
  const ids = Object.keys(table);
  const bad = [];
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const a = table[ids[i]];
      const b = table[ids[j]];
      if (a.wave !== b.wave) continue;
      const apart = Math.abs(semitone(a.from) - semitone(b.from));
      const ratio = Math.max(a.ms, b.ms) / Math.min(a.ms, b.ms);
      if (apart < 4 && ratio < 2) bad.push(`${ids[i]}/${ids[j]}`);
    }
  }
  return bad;
}

test('AC-1101 no two cues are the same noise', () => {
  assert.deepEqual(confusablePairs(SOUNDS), [], 'these cues are confusable');

  // The audit is only worth anything if it fires, so: prove it does. (This is
  // §6.2 inline — the first version of this test compared the whole spec
  // objects for inequality, which eleven distinct rows pass by definition and
  // which a pair differing only in `gain` would also have passed.)
  assert.deepEqual(
    confusablePairs({
      a: { wave: 'sine', from: 400, to: 500, ms: 100, gain: 0.3 },
      b: { wave: 'sine', from: 420, to: 500, ms: 110, gain: 0.9 },
    }),
    ['a/b'],
  );
  // ...and does not fire on either escape route.
  assert.deepEqual(
    confusablePairs({
      a: { wave: 'sine', from: 400, to: 500, ms: 100 },
      b: { wave: 'square', from: 400, to: 500, ms: 100 },
    }),
    [],
  );
  assert.deepEqual(
    confusablePairs({
      a: { wave: 'sine', from: 400, to: 500, ms: 100 },
      b: { wave: 'sine', from: 400, to: 500, ms: 400 },
    }),
    [],
  );
});

test('AC-1101 the shipped .wav files are exactly what SOUNDS describes', () => {
  // The fault this exists for: somebody tunes a number in SOUNDS, does not run
  // `node tools/make-sounds.mjs`, and every other test in this file goes on
  // passing while the game plays the old noise. The table would then be a
  // description of nothing, and AC-1101's "distinct" would be asserted about
  // parameters no player can hear.
  for (const [id, spec] of Object.entries(SOUNDS)) {
    const onDisk = readFileSync(path.join(SOUND_DIR, `${id}.wav`));
    const fresh = wavFile(render(spec));
    assert.ok(onDisk.equals(fresh), `assets/sounds/${id}.wav is stale — re-run tools/make-sounds.mjs`);

    // ...and it is a real, playable, audible file rather than a valid header
    // wrapped around silence. A silent cue is the failure mode that no test
    // catches and every player notices.
    assert.equal(onDisk.toString('ascii', 0, 4), 'RIFF');
    assert.equal(onDisk.toString('ascii', 8, 12), 'WAVE');
    assert.equal(onDisk.readUInt16LE(20), 1, `${id}: not PCM`);
    assert.equal(onDisk.readUInt16LE(22), 1, `${id}: not mono`);
    assert.equal(onDisk.readUInt32LE(24), SAMPLE_RATE, `${id}: wrong sample rate`);
    assert.equal(onDisk.readUInt16LE(34), 16, `${id}: not 16-bit`);
    assert.equal(onDisk.readUInt32LE(4), onDisk.length - 8, `${id}: RIFF size disagrees`);
    assert.equal(onDisk.readUInt32LE(40), onDisk.length - 44, `${id}: data size disagrees`);

    const frames = (onDisk.length - 44) / 2;
    assert.equal(frames, Math.round((spec.ms / 1000) * SAMPLE_RATE), `${id}: wrong length`);
    let peak = 0;
    for (let i = 0; i < frames; i += 1) peak = Math.max(peak, Math.abs(onDisk.readInt16LE(44 + i * 2)));
    assert.ok(peak > 0.15 * 32767, `${id} is effectively silent (peak ${peak})`);
    assert.ok(peak <= 32767 * 0.999, `${id} clips`);
  }
});

// ---- AC-1102 · which haptic, for which moment ----------------------------

test('AC-1102 each moment fires exactly the haptics the design names', () => {
  // AC-1102 verbatim, plus the two rulings that live in gameplay.md §6 prose
  // ("distinct sound, medium haptic" for a shrink; "heavy haptic" on
  // retirement). Restated here rather than read off CUES, because a test that
  // reads the table it is checking cannot fail.
  const expected = {
    grab: ['selection'],
    land: ['light'],
    clear: ['medium'],
    chain: ['medium'],
    shrink: ['medium'],
    retire: ['heavy'],
    perfect: ['heavy', 'success'],
    // AC-1102/AC-407g: the cue moved from release to CONTACT, so its haptic
    // moved with it. `notificationError` is a three-tap pattern about half a
    // second long, sized for a once-per-mistake announcement; fired mid-drag
    // it would still be playing after the player had moved on. A light impact
    // is the bump a boundary makes, and it matches `land` on purpose — a
    // contact is a landing, sideways.
    illegal: ['light'],
    gameOver: ['heavy'],
    // Specified with a sound and no feel. Flagged in the slice report rather
    // than invented.
    drop: [],
    newBest: [],
  };
  for (const [id, haptics] of Object.entries(expected)) {
    assert.deepEqual(CUES[id].haptics, haptics, `${id}'s haptics`);
    // ...and it survives the gate, which is what actually reaches the device.
    assert.deepEqual(
      cuePlan(id, { sound: true, haptics: true }).haptics,
      haptics,
      `${id}'s haptics after the gate`,
    );
  }
  // Every name in the alphabet is used by something; an unused one is a
  // mapping in cuePlayer.js nobody exercises.
  const used = new Set(Object.values(expected).flat());
  assert.deepEqual(HAPTIC_IDS.filter((h) => !used.has(h)), []);
});

// ---- AC-1103 · the ringer switch -----------------------------------------

test('AC-1103 silent mode is the audio session, and it does not reach haptics', () => {
  // There is no iOS API for the ringer switch, so this is not a branch in our
  // code and must not become one: the category below is what makes the OS
  // silence playback, and haptics never consult it.
  assert.equal(AUDIO_MODE.playsInSilentMode, false);

  // The property with teeth: `cueChannels` is a function of the two toggles and
  // of NOTHING else. Hand it a ringer state under every name somebody might
  // reach for and the answer must not move.
  const prefs = { sound: true, haptics: true };
  const base = cueChannels(CUE.grab, prefs);
  for (const extra of ['silent', 'ringer', 'muted', 'ringerSilent', 'systemSound']) {
    for (const value of [true, false]) {
      assert.deepEqual(
        cueChannels(CUE.grab, { ...prefs, [extra]: value }),
        base,
        `cueChannels started reading ${extra}`,
      );
    }
  }
  // (Planted: `haptics: Boolean(prefs.haptics) && !prefs.silent` in
  // cueChannels. The loop above caught it; the `playsInSilentMode` assertion
  // above did not, which is why both are here.)
  assert.deepEqual(base, { sound: true, haptics: true });
});

// ---- AC-1105 · somebody else's music -------------------------------------

test('AC-1105 the audio session mixes with other apps rather than taking focus', () => {
  assert.equal(AUDIO_MODE.interruptionMode, 'mixWithOthers');
  assert.equal(AUDIO_MODE.shouldPlayInBackground, false);
  assert.equal(AUDIO_MODE.allowsRecording, false);
  // Exactly these four keys: a fifth that arrived by accident would be a
  // session setting nobody decided.
  assert.deepEqual(Object.keys(AUDIO_MODE).sort(), [
    'allowsRecording', 'interruptionMode', 'playsInSilentMode', 'shouldPlayInBackground',
  ]);
});

/** An adapter that records the order of everything, in place of a phone. */
function fakeAdapter(overrides = {}) {
  const log = [];
  const players = new Map();
  return {
    log,
    players,
    adapter: {
      setAudioMode: (mode) => {
        log.push(['mode', mode]);
        return overrides.modeFails ? Promise.reject(new Error('no')) : Promise.resolve();
      },
      createPlayer: (source) => {
        log.push(['create', source]);
        const p = {
          rate: 1,
          plays: 0,
          setPlaybackRate(r) { this.rate = r; log.push(['rate', source, r]); },
          seekTo() { log.push(['seek', source]); return Promise.resolve(); },
          play() { this.plays += 1; log.push(['play', source]); },
        };
        players.set(source, p);
        return p;
      },
      sources: Object.fromEntries(Object.keys(SOUNDS).map((id) => [id, `src:${id}`])),
      haptic: (id) => {
        log.push(['haptic', id]);
        if (overrides.hapticThrows) throw new Error('refused');
      },
    },
  };
}

test('AC-1105 no player is ever created before the session category is set', () => {
  // THE ordering bug. A player opened on expo-audio's default category takes
  // audio focus, which stops the podcast the player was listening to — and it
  // is invisible to any test that only inspects AUDIO_MODE, because AUDIO_MODE
  // would still be correct. So this watches it happen.
  const { log, adapter } = fakeAdapter();
  const engine = makeCueEngine(adapter);

  // Fired before start() resolves: the haptic still goes, the sound does not,
  // because there is nothing to open it on yet.
  engine.fire(CUE.grab);
  assert.deepEqual(log.filter((e) => e[0] === 'create'), []);
  assert.deepEqual(log.filter((e) => e[0] === 'haptic'), [['haptic', 'selection']]);

  return engine.start().then(() => {
    engine.fire(CUE.grab);
    const kinds = log.map((e) => e[0]);
    const firstMode = kinds.indexOf('mode');
    const firstCreate = kinds.indexOf('create');
    assert.notEqual(firstCreate, -1, 'nothing was ever created, so nothing is proven');
    assert.ok(firstMode !== -1 && firstMode < firstCreate, 'a player was opened before the mode');
    assert.deepEqual(log[firstMode][1], AUDIO_MODE, 'the mode set is not the one specified');
  });
});

test('AC-1105 start() is idempotent, so StrictMode does not set the mode twice', () => {
  const { log, adapter } = fakeAdapter();
  const engine = makeCueEngine(adapter);
  return Promise.all([engine.start(), engine.start(), engine.start()]).then(() => {
    assert.equal(log.filter((e) => e[0] === 'mode').length, 1);
  });
});

test('AC-1105 a refused audio session costs the sound and not the haptic', () => {
  const { log, adapter } = fakeAdapter({ modeFails: true });
  const engine = makeCueEngine(adapter);
  return engine.start().then(() => {
    engine.fire(CUE.clear);
    assert.deepEqual(log.filter((e) => e[0] === 'create'), []);
    assert.deepEqual(log.filter((e) => e[0] === 'haptic'), [['haptic', 'medium']]);
  });
});

test('AC-1106 the rising pitch actually reaches the player, as a playback rate', () => {
  // The gap between "the plan carries a rate" and "the device plays at it" is
  // one line, and nothing above this test crosses it: every AC-1106 test so far
  // inspects the SCHEDULE. A `cuePlan` that returned `rate: 1` would leave a
  // cascade playing eleven identical blips with a perfect set of green tests.
  const { log, adapter, players } = fakeAdapter();
  const engine = makeCueEngine(adapter);
  return engine.start().then(() => {
    for (const step of [1, 2, 3, 4]) engine.fire(CUE.chain, chainRate(step));
    const rates = log.filter((e) => e[0] === 'rate').map((e) => e[2]);
    assert.deepEqual(rates, [1, 2, 3, 4].map(chainRate));
    assert.ok(Math.abs(players.get('src:chain').rate - chainRate(4)) < 1e-12);

    // The rate is set BEFORE the seek, because `setPlaybackRate` restarts the
    // item on some builds and a seek undone by it plays the tail of the last
    // cue at the new pitch.
    const chainLog = log.filter((e) => e[1] === 'src:chain').map((e) => e[0]);
    assert.deepEqual(chainLog.slice(0, 4), ['create', 'rate', 'seek', 'play']);
  });
});

// ---- AC-1104 · the two toggles -------------------------------------------

test('AC-1104 each toggle silences its own channel and only its own', () => {
  const cases = [
    [{ sound: true, haptics: true }, true, true],
    [{ sound: false, haptics: true }, false, true],
    [{ sound: true, haptics: false }, true, false],
    [{ sound: false, haptics: false }, false, false],
  ];
  for (const [prefs, wantSound, wantHaptic] of cases) {
    for (const id of CUE_IDS) {
      const plan = cuePlan(id, prefs);
      assert.equal(
        plan.sound !== null, wantSound && CUES[id].sound !== null,
        `${id} sound under ${JSON.stringify(prefs)}`,
      );
      assert.equal(
        plan.haptics.length > 0, wantHaptic && CUES[id].haptics.length > 0,
        `${id} haptics under ${JSON.stringify(prefs)}`,
      );
    }
  }
});

test('AC-1104 a toggle turned off is silent on the very next cue', () => {
  // "Immediately" is the word in the AC, and the way to break it is to cache a
  // decision — to resolve the plan once per turn, or to keep a muted player
  // around. So this toggles BETWEEN two cues of a turn and checks the second.
  const { log, adapter, players } = fakeAdapter();
  const engine = makeCueEngine(adapter);
  return engine.start().then(() => {
    engine.setPrefs({ sound: true, haptics: true });
    engine.fire(CUE.clear);
    const first = log.length;

    engine.setPrefs({ sound: false, haptics: true });
    engine.fire(CUE.clear);
    const second = log.slice(first);
    assert.deepEqual(second.filter((e) => e[0] === 'play'), [], 'sound kept playing');
    assert.deepEqual(second.filter((e) => e[0] === 'haptic'), [['haptic', 'medium']]);

    engine.setPrefs({ sound: true, haptics: false });
    const third = log.length;
    engine.fire(CUE.clear);
    const after = log.slice(third);
    assert.deepEqual(after.filter((e) => e[0] === 'haptic'), [], 'haptics kept firing');
    assert.equal(after.filter((e) => e[0] === 'play').length, 1);

    // The player that was already open is reused rather than re-created, which
    // is what makes the second fire cheap enough to happen mid-cascade.
    assert.equal(players.get('src:clear').plays, 2);
  });
});

test('AC-1102 a haptic that throws does not cost the one beside it, or the turn', () => {
  // `perfect` fires two haptics. A device that refuses the first must still
  // get the second, and neither may reach the caller — the caller is a gesture
  // worklet's runOnJS and a turn's animation schedule.
  const { log, adapter } = fakeAdapter({ hapticThrows: true });
  const engine = makeCueEngine(adapter);
  return engine.start().then(() => {
    assert.doesNotThrow(() => engine.fire(CUE.perfect));
    assert.deepEqual(
      log.filter((e) => e[0] === 'haptic'),
      [['haptic', 'heavy'], ['haptic', 'success']],
    );
  });
});

// ---- AC-1106 · the chain's rising pitch ----------------------------------

test('AC-1106 the chain rate rises monotonically, with no ceiling to reach', () => {
  assert.equal(chainRate(1), 1);
  let last = 0;
  for (let n = 1; n <= 32; n += 1) {
    const rate = chainRate(n);
    assert.ok(rate > last, `chainRate(${n}) = ${rate} did not rise above ${last}`);
    last = rate;
  }
  // One semitone per step, which is the thing the constant claims.
  assert.ok(Math.abs(chainRate(2) / chainRate(1) - Math.pow(2, CHAIN_SEMITONE / 12)) < 1e-12);
  // §6.1's rule: no rail. A clamp at the presentation cap would make steps 6
  // and 7 the same pitch, which is the "rail that bounded nothing" shape —
  // it looks like safety and it silently removes the thing it sits in front of.
  assert.ok(chainRate(7) > chainRate(6));
  // A3 is the reference the semitone unit is measured from.
  assert.equal(semitone(REFERENCE_HZ), 0);
  assert.equal(semitone(REFERENCE_HZ * 2), 12);
});

test('AC-1106 a real cascade plays a rising run, counted across the whole turn', () => {
  const { after, plan } = turnOn(cascadeBoard());
  const steps = after.lastTurn.events.filter((e) => e.type === 'CLEAR_STEP');
  assert.equal(steps.length, 2, 'the fixture must actually cascade');

  // Step 1 is the clear; steps 2+ are the chain climbing away from it.
  assert.equal(cuesOf(plan, CUE.clear).length, 1);
  const chain = cuesOf(plan, CUE.chain);
  assert.equal(chain.length, 1);
  assert.ok(chain[0].rate > 1, 'the second step played at the root pitch');
  assert.ok(chain[0].at > cuesOf(plan, CUE.clear)[0].at, 'the chain step came first');
});

test('AC-1106 a seven-step cascade rises every step, and never restarts at a phase', () => {
  // The bug this catches: `event.step` restarts at 1 for each phase, so a
  // cascade that spans SETTLE and ARRIVAL would drop back to the root halfway
  // through and tell the player "new chain" about one chain. The count is
  // therefore per TURN (src/ui/replay.js `turnStep`).
  const file = path.join(ROOT, 'test', 'fixtures', 'deep-board-9.json');
  const board = JSON.parse(readFileSync(file, 'utf8')).map((a, i) => ({ ...a, id: `deep-${i}` }));
  const { after, plan } = turnOn(board);
  const steps = after.lastTurn.events.filter((e) => e.type === 'CLEAR_STEP');
  assert.ok(steps.length >= 3, `the fixture must cascade deeply, got ${steps.length}`);

  const rates = cuesOf(plan, CUE.chain).map((c) => c.rate);
  assert.ok(rates.length >= 2, 'no chain steps were scheduled');
  for (let i = 1; i < rates.length; i += 1) {
    assert.ok(rates[i] > rates[i - 1], `rate ${i} (${rates[i]}) did not rise`);
  }
  // Distinct pitches, not a plateau: a repeated rate is what a per-phase or
  // clamped counter looks like from here.
  assert.equal(new Set(rates).size, rates.length);
});

test('AC-1106 a turn that clears in BOTH phases keeps climbing across the join', () => {
  // The fault this exists for escaped every other test in this file.
  //
  // `event.step` restarts at 1 for each phase, because SETTLE and ARRIVAL each
  // run their own resolution. Every cascade fixture above happens inside ONE
  // phase, so `turnStep` and `event.step` agree on all of them and a schedule
  // built from the wrong one passes. It takes a turn that clears in both to
  // tell them apart — and that turn is the COMMON one, not an exotic one: it
  // is a row completing on the board and the arriving batch completing another.
  //
  // Got wrong, the second clear of a turn plays at the root pitch, which tells
  // the player "new chain" about one chain (ui.md §8.2).
  const board = [...fullRow(0), animal('rat', 0, 5)];
  const queue = Array.from({ length: BOARD.width }, (_, x) => animal('rat', x, 0));
  const { after, plan } = turnOn(board, queue);

  const steps = after.lastTurn.events.filter((e) => e.type === 'CLEAR_STEP');
  assert.deepEqual(steps.map((e) => e.phase), ['SETTLE', 'ARRIVAL'], 'the fixture must span phases');
  assert.deepEqual(steps.map((e) => e.step), [1, 1], 'the engine no longer restarts step per phase');

  assert.equal(cuesOf(plan, CUE.clear).length, 1, 'the second clear announced itself as a first');
  const chain = cuesOf(plan, CUE.chain);
  assert.equal(chain.length, 1);
  assert.ok(chain[0].rate > 1, 'the arrival clear fell back to the root pitch');
  assert.ok(Math.abs(chain[0].rate - chainRate(2)) < 1e-12, 'it is step 2 of the turn');
});

// ---- the schedule ---------------------------------------------------------

test('AC-1101 a clear cue lands on the frame the row actually collapses', () => {
  const { after, plan } = turnOn([...fullRow(0), animal('rat', 0, 3)]);
  const timeline = turnTimeline(after.lastTurn.events, after.lastTurn.action, 0);
  const unit = timeline.units[0];
  assert.ok(unit, 'the fixture must produce an animated unit');

  const clear = cuesOf(plan, CUE.clear);
  assert.equal(clear.length, 1);
  // The same number the collapse is scheduled from, not an approximation of
  // it. A cue built from its own arithmetic is a second source (§6.3), and a
  // cue a frame off the geometry it announces sounds like a mistake.
  assert.equal(clear[0].at, unit.collapseAt);
  assert.equal(clear[0].rate, 1);
});

test('AC-1102 the land cue lands with the squash, and a busy turn is not a burst', () => {
  // Eight rats falling from row 4. AC-807 decides the squash from `landAt`;
  // the cue is built from the same value, so the thump and the squash cannot
  // come apart — and eight of them coalesce to one noise, not eight.
  const board = Array.from({ length: BOARD.width - 1 }, (_, x) => animal('rat', x, 4));
  const { plan } = turnOn(board);
  const lands = Object.values(plan.moves).map((m) => m.landAt).filter((v) => v !== null);
  assert.ok(lands.length >= 8, `the fixture must land several animals, got ${lands.length}`);

  const cues = cuesOf(plan, CUE.land);
  assert.ok(cues.length >= 1, 'nothing thumped');
  for (const cue of cues) {
    assert.ok(lands.includes(cue.at), `a land cue at ${cue.at} matches no landing`);
  }
  // No two of the same kind inside the coalescing window, anywhere in the plan.
  const byKind = new Map();
  for (const cue of plan.cues) {
    const prev = byKind.get(cue.cue);
    if (prev !== undefined) {
      assert.ok(cue.at - prev >= CUE_MIN_GAP_MS, `two ${cue.cue} cues ${cue.at - prev} ms apart`);
    }
    byKind.set(cue.cue, cue.at);
  }
  // ...and the plan is sorted, which is what `dueCount`'s cursor assumes.
  for (let i = 1; i < plan.cues.length; i += 1) {
    assert.ok(plan.cues[i].at >= plan.cues[i - 1].at, 'the cue schedule is out of order');
  }
});

test('AC-1101 a buffalo row shrinks audibly and does not sound like a clear', () => {
  // AC-506: a row containing a buffalo does not clear. It must therefore not
  // play the clear cue — the sound would be telling the player the opposite of
  // what the board is about to do.
  const buff = animal('buffalo', 0, 0);
  const rats = BOARD.width - buff.size;
  const board = [buff, ...Array.from({ length: rats }, (_, i) => animal('rat', buff.size + i, 0))];
  const { after, plan } = turnOn(board);
  const step = after.lastTurn.events.find((e) => e.type === 'CLEAR_STEP');
  assert.equal(step.clearedRows.length, 0, 'the fixture must not clear');
  assert.equal(step.shrunk.length, 1);

  assert.deepEqual(cuesOf(plan, CUE.clear), []);
  assert.deepEqual(cuesOf(plan, CUE.chain), []);
  const shrink = cuesOf(plan, CUE.shrink);
  assert.equal(shrink.length, 1);
  assert.equal(shrink[0].at, plan.shards[0].at, 'the shrink cue and its shard disagree');
});

test('AC-1101 a retiring buffalo is its own cue, not another shrink', () => {
  // A buffalo down to its last segment: the row takes it, and gameplay.md §6
  // gives that its own celebration.
  const buff = { ...animal('buffalo', 0, 0), size: 1 };
  const board = [buff, ...rowExcept(0, [0])];
  const { after, plan } = turnOn(board);
  const step = after.lastTurn.events.find((e) => e.type === 'CLEAR_STEP');
  assert.deepEqual(step.retiredIds, [buff.id], 'the fixture must retire the buffalo');

  assert.equal(cuesOf(plan, CUE.retire).length, 1);
  // It shrank to nothing, so it is a retirement and NOT a shrink: playing both
  // would announce a buffalo that is still there.
  assert.deepEqual(cuesOf(plan, CUE.shrink), []);
});

test('AC-1101/AC-1102 a perfect clear announces itself once', () => {
  const { after, plan } = turnOn(fullRow(0));
  const perfect = after.lastTurn.events.find((e) => e.type === 'PERFECT_CLEAR');
  assert.ok(perfect, 'the fixture must clear the board outright');
  assert.equal(cuesOf(plan, CUE.perfect).length, 1);
  assert.deepEqual(CUES.perfect.haptics, ['heavy', 'success']);
});

test('AC-1102 game over fires at the moment the sheet arrives, not after the lock', () => {
  // A column stacked to the kill line. The run ends on this turn, and the dim
  // and the sheet both start on the commit that applied it (ui.md §8) — so a
  // cue scheduled at the end of the animation would be a punchline told late.
  const column = Array.from({ length: BOARD.killLine + 1 }, (_, y) => animal('rat', 0, y));
  const { after, plan } = turnOn(column);
  const judge = after.lastTurn.events.find((e) => e.type === 'JUDGE');
  assert.equal(judge.gameOver, true, 'the fixture must end the run');

  const over = cuesOf(plan, CUE.gameOver);
  assert.equal(over.length, 1);
  assert.equal(over[0].at, 0);
  assert.deepEqual(CUES.gameOver.haptics, ['heavy']);
});

test('AC-1101 an ordinary quiet turn schedules no clear, chain, shrink or retirement', () => {
  // The other direction, and the one a table-driven test misses: a turn where
  // nothing happened must not announce anything. (Planted: `cues.push` for the
  // clear moved outside its `clearedRows.length > 0` guard — this is what
  // caught it, and the cascade tests above did not.)
  const { after, plan } = turnOn([animal('rat', 0, 0), animal('fox', 3, 0)]);
  assert.deepEqual(after.lastTurn.events.filter((e) => e.type === 'CLEAR_STEP'), []);
  for (const id of [CUE.clear, CUE.chain, CUE.shrink, CUE.retire, CUE.perfect, CUE.gameOver]) {
    assert.deepEqual(cuesOf(plan, id), [], `a quiet turn played ${id}`);
  }
});

// ---- coalescing and the cursor -------------------------------------------

test('coalesceCues merges a burst of one kind and never merges two kinds', () => {
  const merged = coalesceCues([
    { at: 10, cue: 'land', rate: 1 },
    { at: 12, cue: 'land', rate: 1 },
    { at: 13, cue: 'clear', rate: 1 },  // a different kind, same instant
    { at: 200, cue: 'land', rate: 1 },  // far enough to be its own event
    { at: 0, cue: 'gameOver', rate: 1 },
  ]);
  assert.deepEqual(merged, [
    { at: 0, cue: 'gameOver', rate: 1 },
    { at: 10, cue: 'land', rate: 1 },
    { at: 13, cue: 'clear', rate: 1 },
    { at: 200, cue: 'land', rate: 1 },
  ]);
  // The window is measured from the cue that was KEPT, not from the last one
  // seen: a steady drizzle 40 ms apart must not survive by hopping the gap.
  const drizzle = coalesceCues(
    Array.from({ length: 10 }, (_, i) => ({ at: i * 40, cue: 'land', rate: 1 })),
  );
  assert.deepEqual(drizzle.map((c) => c.at), [0, 80, 160, 240, 320]);
});

/**
 * THE gap that let the Slice 5 crash through, closed from the other side.
 *
 * `cues.js` imports nothing so the cue rules can be evaluated in Node — but the
 * worklet that CONSUMES them lives in `useTurnCues.js`, which imports
 * Reanimated, so nothing exercised the loop that actually runs on the UI
 * thread. That loop indexes `schedule[i]` for every `i` the cursor crosses, and
 * `schedule[i].cue` on an out-of-range index is a TypeError thrown inside the
 * display-link callback — which is an `abort()`, not a red box.
 *
 * So this drives the exact cursor walk `useTurnCues` performs, against every
 * schedule shape a real turn can actually produce, and asserts the index is
 * always in range. The worklet's three lines are restated here rather than
 * imported because importing them would import Reanimated; the hygiene test
 * `AC-1101 the cue schedule is walked the same way in both places` keeps this
 * copy and that one identical.
 */
function walkLikeTheWorklet(schedule, times) {
  const fired = [];
  let cursor = 0;
  for (const t of times) {
    const next = dueCount(schedule, cursor, t);
    assert.ok(Number.isInteger(next), `dueCount returned ${next}`);
    assert.ok(next >= cursor, `the cursor went backwards: ${cursor} -> ${next}`);
    assert.ok(
      next <= schedule.length,
      `the cursor ran past the end: ${next} > ${schedule.length}`,
    );
    if (next === cursor) continue;
    for (let i = cursor; i < next; i += 1) {
      const cue = schedule[i];
      // This is the line that aborts the process if the bound is ever wrong.
      assert.ok(cue !== undefined, `schedule[${i}] is undefined of ${schedule.length}`);
      assert.equal(typeof cue.cue, 'string', `schedule[${i}].cue is not a cue id`);
      assert.ok(Number.isFinite(cue.rate) && cue.rate > 0, `schedule[${i}].rate is ${cue.rate}`);
      fired.push(cue);
    }
    cursor = next;
  }
  return { fired, cursor };
}

test('AC-1101 the cursor stays in range on every schedule a real turn produces', () => {
  // Real plans, from real runs, rather than schedules invented to be easy: a
  // bot over three habitats and twelve seeds, plus the hand-built shapes whose
  // schedules the fixtures above already exercise.
  const schedules = [];
  {
    for (let s = 0; s < 12; s += 1) {
      let state = createRun({ seed: `cursor-${s}` });
      for (let turn = 0; turn < 40 && state.status === STATUS.READY; turn += 1) {
        state = runReducer(state, { type: ACTIONS.PASS });
        if (state.plan) schedules.push(state.plan.cues);
      }
    }
  }
  schedules.push(turnOn(cascadeBoard()).plan.cues);                      // a cascade
  schedules.push(turnOn(fullRow(0)).plan.cues);                          // a perfect clear
  schedules.push(turnOn([animal('rat', 0, 0)]).plan.cues);               // a quiet turn
  schedules.push(                                                        // game over, at t=0
    turnOn(Array.from({ length: BOARD.killLine + 1 }, (_, y) => animal('rat', 0, y))).plan.cues,
  );
  schedules.push([]);                                                    // nothing to play

  assert.ok(schedules.length > 200, `only ${schedules.length} schedules — the sweep stopped sweeping`);
  const longest = Math.max(...schedules.map((c) => c.length));
  assert.ok(longest >= 3, `the deepest schedule is ${longest}; the sweep is not reaching a cascade`);

  let walked = 0;
  for (const schedule of schedules) {
    const end = schedule.length ? schedule[schedule.length - 1].at : 0;
    // Every sampling shape a display link can deliver: every frame, a dropped
    // frame, a long stall, and one that overshoots the end of the clock.
    for (const stride of [1, 16, 17, 33, 100, 400, 2000]) {
      const times = [];
      for (let t = 0; t < end + stride; t += stride) times.push(t);
      times.push(end);            // withTiming always delivers its end value
      const { fired, cursor } = walkLikeTheWorklet(schedule, times);
      assert.equal(fired.length, schedule.length, `stride ${stride}: fired ${fired.length}`);
      assert.equal(cursor, schedule.length);
      walked += 1;
    }
  }
  assert.ok(walked > 1400, `only ${walked} walks`);
});

test('AC-1101 the cursor survives the states a re-registered reaction can leave it in', () => {
  // `useTurnCues` keeps the cursor in a shared value and the schedule in the
  // worklet's captured closure. The two are written from different places, so
  // the question is not "does the happy path work" but "is there a pairing of
  // the two that indexes out of range". There is not, and these are the ones
  // that would.
  const schedule = [
    { at: 0, cue: 'gameOver', rate: 1 },
    { at: 280, cue: 'clear', rate: 1 },
    { at: 930, cue: 'chain', rate: 1.0594630943592953 },
  ];

  // A cursor left behind by a LONGER previous turn, against a shorter schedule.
  for (const cursor of [3, 4, 99]) {
    const next = dueCount(schedule, cursor, 99999);
    assert.equal(next, cursor, 'a stale cursor must not move, so nothing is indexed');
  }
  // A cursor mid-way, against an EMPTY schedule — the shape a plan-less turn
  // leaves when the reaction has re-registered but the clock has not stopped.
  assert.equal(dueCount([], 2, 99999), 2);
  assert.equal(dueCount([], 0, 99999), 0);
  // The clock running backwards, which is what `ms.value = 0` looks like on the
  // frame a new turn starts.
  assert.equal(dueCount(schedule, 0, -1), 0);
  // ...and the ordinary case still advances, so the guards above are not
  // passing by refusing everything.
  assert.equal(dueCount(schedule, 0, 930), 3);
});

test('dueCount fires every cue exactly once and in order, however the clock is sampled', () => {
  // The clock is a linear ramp sampled once per frame, and a frame can be late.
  // What must never happen is a cue being skipped because the clock jumped past
  // it, or fired twice because two frames straddled it.
  const schedule = [0, 0, 80, 110, 310, 570, 571, 960].map((at, i) => ({ at, cue: `c${i}`, rate: 1 }));
  for (let stride = 1; stride <= 400; stride += 7) {
    const fired = [];
    let cursor = 0;
    const sample = (t) => {
      const next = dueCount(schedule, cursor, t);
      for (let i = cursor; i < next; i += 1) fired.push(schedule[i].cue);
      cursor = next;
    };
    for (let t = 0; t < 1200; t += stride) sample(t);
    // `withTiming` always delivers a final frame at exactly its end value, so
    // the last sample is the clock's own length however coarse the stride was.
    sample(1200);
    assert.deepEqual(fired, schedule.map((c) => c.cue), `stride ${stride}`);
  }
  // A cue at t=0 fires on the first sample. `<` instead of `<=` in dueCount
  // loses it entirely, and every cue in a zero-length turn is at 0.
  assert.equal(dueCount(schedule, 0, 0), 2);
  assert.equal(dueCount(schedule, 0, -1), 0);
  assert.equal(dueCount([], 0, 999), 0);
});
