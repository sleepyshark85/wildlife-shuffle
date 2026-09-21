// Sound and haptics, as decisions rather than as effects.
//
// This module IMPORTS NOTHING, for the reason `src/ui/trajectory.js` imports
// nothing (docs/development-process.md §6.7): a cue is the least testable thing
// in the project — you cannot hear one in `node --test` and you cannot feel one
// anywhere but a phone — so everything about a cue that is *not* the noise
// itself is pulled in here where it can be swept off-device.
//
// What that turns out to be is most of it:
//
//   * WHICH cue fires and WHEN is a fold of the engine's event stream, exactly
//     as `summariseEvents` and `buildReplay` are. The schedule is built in
//     `buildReplay` beside the flashes it accompanies and asserted the same way.
//   * AC-1106's rising chain pitch is arithmetic (`chainRate`).
//   * AC-1103/AC-1104's gating is logic (`cueChannels`).
//   * AC-1105 is a *value* — the audio session category — and a value can be
//     asserted even though applying it is a platform call (`AUDIO_MODE`).
//   * Whether a cue is audibly DISTINCT from every other one (AC-1101) is a
//     property of `SOUNDS`, which is also the table `tools/make-sounds.mjs`
//     renders the .wav files from. One source: the synthesis parameters.
//
// What is left for the device is the list in the slice report, and it is short
// on purpose.

// ---- the vocabulary -------------------------------------------------------

/** AC-1101's eleven moments. Nothing outside this set may make a noise. */
export const CUE = Object.freeze({
  grab: 'grab',
  drop: 'drop',
  land: 'land',
  illegal: 'illegal',
  clear: 'clear',
  chain: 'chain',
  shrink: 'shrink',
  retire: 'retire',
  perfect: 'perfect',
  newBest: 'newBest',
  gameOver: 'gameOver',
});

export const CUE_IDS = Object.freeze(Object.keys(CUE));

/**
 * The haptic alphabet, named here rather than as `expo-haptics` symbols.
 *
 * `src/ui/cuePlayer.js` is the only file that knows what these map to, which
 * is what lets this module — and therefore AC-1102 — be checked in Node at all.
 */
export const HAPTIC = Object.freeze({
  selection: 'selection',
  light: 'light',
  medium: 'medium',
  heavy: 'heavy',
  success: 'success',
});

export const HAPTIC_IDS = Object.freeze(Object.keys(HAPTIC));

/**
 * AC-1102, and the two rulings that live in prose rather than in it.
 *
 * AC-1102 enumerates grab / land / row clear / perfect clear / illegal move /
 * game over. Two more are specified in `gameplay.md` §6: the buffalo shrink is
 * "distinct sound, medium haptic" and a retirement is a "heavy haptic". They
 * are here because they are specified, not because they seemed nice.
 *
 * `chain` carries the clear's medium impact because a chain step IS a row
 * clear — AC-1102 says row clears fire medium, and a cascade is rows clearing.
 *
 * `illegal` fires at CONTACT now rather than on release (AC-407g/AC-1101e), so
 * its haptic dropped from `notificationError` to a light impact: a three-tap
 * pattern half a second long was sized for a once-per-mistake announcement and
 * would still be playing after a player who had already moved on. It matches
 * `land` on purpose — a contact is a landing, sideways. Nothing asks for
 * `notificationError` any longer, so the name is gone from the alphabet rather
 * than left in it for a caller that does not exist.
 *
 * `drop` and `newBest` carry no haptic. AC-1101 gives them a sound and AC-1102
 * does not give them a feel, and inventing one is exactly the silent
 * reinterpretation the developer brief forbids. Both are flagged in the report.
 */
export const CUES = Object.freeze({
  grab: Object.freeze({ sound: 'grab', haptics: Object.freeze([HAPTIC.selection]) }),
  drop: Object.freeze({ sound: 'drop', haptics: Object.freeze([]) }),
  land: Object.freeze({ sound: 'land', haptics: Object.freeze([HAPTIC.light]) }),
  illegal: Object.freeze({ sound: 'illegal', haptics: Object.freeze([HAPTIC.light]) }),
  clear: Object.freeze({ sound: 'clear', haptics: Object.freeze([HAPTIC.medium]) }),
  chain: Object.freeze({ sound: 'chain', haptics: Object.freeze([HAPTIC.medium]) }),
  shrink: Object.freeze({ sound: 'shrink', haptics: Object.freeze([HAPTIC.medium]) }),
  retire: Object.freeze({ sound: 'retire', haptics: Object.freeze([HAPTIC.heavy]) }),
  perfect: Object.freeze({
    sound: 'perfect',
    haptics: Object.freeze([HAPTIC.heavy, HAPTIC.success]),
  }),
  newBest: Object.freeze({ sound: 'newBest', haptics: Object.freeze([]) }),
  gameOver: Object.freeze({ sound: 'gameOver', haptics: Object.freeze([HAPTIC.heavy]) }),
});

// ---- the sounds themselves ------------------------------------------------

/**
 * Every cue's waveform, in the only form that can be checked without ears.
 *
 * There is no sound designer on this project and no licensed sample library, so
 * the cues are synthesised: `tools/make-sounds.mjs` renders `assets/sounds/*.wav`
 * from exactly this table. That is deliberate rather than a compromise — it
 * makes "each cue is DISTINCT" (AC-1101) a property of five numbers instead of
 * an opinion about eleven files, and `test/cues.test.js` asserts it.
 *
 * `from`/`to` sweep linearly in Hz across `ms`. `gain` is the peak amplitude
 * before a 4 ms attack and an exponential decay to silence, which is what stops
 * a square wave clicking at either end.
 *
 * Whether any of it sounds GOOD is a device question and is on the list.
 */
export const SOUNDS = Object.freeze({
  grab: Object.freeze({ wave: 'sine', from: 880, to: 880, ms: 45, gain: 0.25 }),
  drop: Object.freeze({ wave: 'sine', from: 520, to: 415, ms: 70, gain: 0.28 }),
  land: Object.freeze({ wave: 'triangle', from: 220, to: 165, ms: 90, gain: 0.35 }),
  illegal: Object.freeze({ wave: 'square', from: 200, to: 140, ms: 160, gain: 0.22 }),
  clear: Object.freeze({ wave: 'sine', from: 784, to: 1175, ms: 180, gain: 0.38 }),
  chain: Object.freeze({ wave: 'sine', from: 988, to: 1318, ms: 150, gain: 0.36 }),
  shrink: Object.freeze({ wave: 'triangle', from: 300, to: 180, ms: 220, gain: 0.34 }),
  retire: Object.freeze({ wave: 'triangle', from: 392, to: 784, ms: 420, gain: 0.42 }),
  perfect: Object.freeze({ wave: 'sine', from: 1046, to: 1568, ms: 520, gain: 0.45 }),
  newBest: Object.freeze({ wave: 'sine', from: 659, to: 1318, ms: 600, gain: 0.40 }),
  gameOver: Object.freeze({ wave: 'triangle', from: 262, to: 98, ms: 700, gain: 0.40 }),
});

/** Mono, 16-bit. 22.05 kHz is ample for a blip and halves the bundle. */
export const SAMPLE_RATE = 22050;

/**
 * Semitones above A3, rounded — the unit "are these two the same note?" uses.
 *
 * A3 and not the conventional A4 for a silly but real reason: 440 is also the
 * logical width of an iPhone 17 Pro Max, and AC-126's audit greps the source
 * for device dimensions and cannot tell a tuning fork from a screen. It is
 * right not to try, so this reference is an octave down and `SOUNDS` carries no
 * 440 either. Every interval below is unchanged.
 */
export const REFERENCE_HZ = 220;

export function semitone(hz) {
  return Math.round(12 * (Math.log(hz / REFERENCE_HZ) / Math.log(2)));
}

// ---- AC-1106: the chain's rising pitch ------------------------------------

/**
 * The playback rate for cascade step `n`, counted across the whole turn.
 *
 * One semitone per step. It is a rate rather than a second sample because a
 * rate is arithmetic and a sample is a file nobody can compare, and because
 * AC-1106 asks for a *monotonic rise*, which is a statement about a sequence of
 * numbers.
 *
 * There is deliberately no ceiling. A clamp would be a rail, and §6.1 is the
 * incident where a rail that play reaches turned out to bound nothing while
 * quietly confiscating the thing it sat in front of. The presentation cap
 * (AC-825, six animated units) is what keeps the real range at 1.00–1.33; the
 * function stays strictly increasing to the engine's own 32-step assert so that
 * "monotonic" is true of the function and not only of the cases we expect.
 */
export const CHAIN_SEMITONE = 1;

export function chainRate(step) {
  'worklet';
  return Math.pow(2, (CHAIN_SEMITONE * (step - 1)) / 12);
}

// ---- AC-1103 / AC-1105: the audio session ---------------------------------

/**
 * The audio session, as a value.
 *
 * This is the whole of AC-1103 and AC-1105, and neither of them is a branch in
 * our code — which is the point, because a branch on "is the ringer silent?"
 * cannot be written: iOS exposes no such API. What it exposes is a category,
 * and the category below is `ambient`:
 *
 *   * `playsInSilentMode: false` — the ringer switch silences playback, done by
 *     the OS. AC-1103's second half ("haptics are unaffected") is then true by
 *     construction: nothing here or in `cueChannels` consults a ringer state,
 *     and `UIFeedbackGenerator` does not look at one either.
 *   * `interruptionMode: 'mixWithOthers'` — AC-1105. We take no audio focus, so
 *     a podcast or a playlist neither stops nor ducks. Getting this wrong is
 *     invisible in every test we can run and is a one-star review.
 *   * `shouldPlayInBackground: false` and `allowsRecording: false` — this game
 *     has nothing to say when it is not on screen and never listens.
 *
 * `expo-audio`'s defaults are `playsInSilentMode: true` and
 * `interruptionMode: 'mixWithOthers'`, so the first line is the one that has to
 * be written and the second is written anyway rather than inherited.
 */
export const AUDIO_MODE = Object.freeze({
  playsInSilentMode: false,
  interruptionMode: 'mixWithOthers',
  shouldPlayInBackground: false,
  allowsRecording: false,
});

// ---- AC-1104: the two toggles ---------------------------------------------

/**
 * Which channels a cue is allowed to use, given the player's preferences.
 *
 * Two independent booleans and no third term. AC-1104 is "that channel is
 * silent immediately", and "immediately" is a property of there being exactly
 * one gate: `src/ui/cuePlayer.js` calls this and holds no cached decision, so
 * turning a toggle off cannot leave a queued cue behind it.
 *
 * Note what is NOT a parameter: the ringer switch. See AUDIO_MODE.
 */
export function cueChannels(cue, prefs) {
  const def = CUES[cue];
  if (!def) return { sound: false, haptics: false };
  return {
    sound: Boolean(prefs && prefs.sound) && def.sound !== null,
    haptics: Boolean(prefs && prefs.haptics) && def.haptics.length > 0,
  };
}

/**
 * Everything the player needs to execute one cue, decided here.
 *
 * `cuePlayer.js` looks up a file and calls two SDK functions; every choice it
 * would otherwise make is already made in this return value, which is what
 * keeps the device-only half of this slice down to an adapter.
 */
export function cuePlan(cue, prefs, rate = 1) {
  const def = CUES[cue];
  if (!def) return { sound: null, rate: 1, haptics: [] };
  const channels = cueChannels(cue, prefs);
  return {
    sound: channels.sound ? def.sound : null,
    rate: rate > 0 ? rate : 1,
    haptics: channels.haptics ? def.haptics : [],
  };
}

// ---- the schedule ---------------------------------------------------------

/**
 * Two cues of the same kind closer together than this are one cue.
 *
 * A turn drops up to fifteen animals and every one of them lands. Without this
 * a settle reads as a burst of static rather than as a board coming to rest,
 * and the haptic engine simply drops requests it cannot keep up with — which
 * would make the LAND cue unreliable precisely on the busiest turns. Coalescing
 * in the plan rather than in the player keeps it checkable (test/cues.test.js).
 *
 * 60 ms is a little under four frames: two landings that far apart are one
 * event to a player, and a cascade's own 200 ms floor (ui.md §8.2) is never
 * touched by it.
 */
export const CUE_MIN_GAP_MS = 60;

/**
 * Drop cues that arrive on top of one of their own kind, and sort by time.
 *
 * Different kinds are never merged: a clear and a shrink land together on a
 * buffalo row and the player is entitled to hear both.
 */
export function coalesceCues(cues, minGap = CUE_MIN_GAP_MS) {
  const sorted = cues
    .map((c, i) => ({ c, i }))
    .sort((a, b) => a.c.at - b.c.at || a.i - b.i)
    .map(({ c }) => c);
  const last = new Map();
  const out = [];
  for (const cue of sorted) {
    const seen = last.get(cue.cue);
    if (seen !== undefined && cue.at - seen < minGap) continue;
    last.set(cue.cue, cue.at);
    out.push(cue);
  }
  return out;
}

/**
 * The cues of `schedule` that have come due at `t`, given how many already went.
 *
 * A `'worklet'` and a plain function at once, for `trajectory.js`'s reason: the
 * UI thread advances the cursor against the turn's shared clock
 * (`useTurnClock.js`) and `node --test` advances it against a list of numbers,
 * and both must be the same rule. Firing cues off the same clock the animals
 * read is what keeps a cue on the frame it is announcing — the alternative,
 * a `withDelay` per cue, anchors to each animation's own first frame and is
 * exactly the drift §6.7 records.
 *
 * Returns the new cursor. The caller fires `schedule[i]` for `i` in
 * `[cursor, next)`.
 */
export function dueCount(schedule, cursor, t) {
  'worklet';
  let next = cursor;
  while (next < schedule.length && schedule[next].at <= t) next += 1;
  return next;
}
