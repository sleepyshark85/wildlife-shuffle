// The edge: the only file in the project that talks to `expo-audio` or
// `expo-haptics`, and the only one that names a .wav.
//
// Everything above it is checkable in Node — `src/ui/cues.js` decides what
// fires and when, `src/ui/cueEngine.js` decides how, against an injected
// adapter. What is left here is a table of eleven `require`s and a mapping from
// our six haptic names onto the SDK's constants, which is exactly the part a
// test could only ever restate.
//
// Module-level, not a context, for `src/ui/diagnostics.js`'s reason: `fireCue`
// has to be callable from a gesture worklet's `runOnJS` at `onBegin`
// (ui.md §5.4 — "the selection haptic fires with it"), and a stable plain
// function that touches no React state is what keeps AC-831's "zero re-renders
// mid-drag" true while it does.

import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import {
  ImpactFeedbackStyle,
  NotificationFeedbackType,
  impactAsync,
  notificationAsync,
  selectionAsync,
} from 'expo-haptics';

import { makeCueEngine } from './cueEngine.js';

/**
 * AC-1101's eleven cues, rendered from `SOUNDS` by `tools/make-sounds.mjs`.
 * Keyed by `CUES[x].sound`; `test/cues.test.js` asserts the two agree, because
 * a cue whose file is missing is a cue that silently never plays.
 */
const SOURCES = {
  grab: require('../../assets/sounds/grab.wav'),
  drop: require('../../assets/sounds/drop.wav'),
  land: require('../../assets/sounds/land.wav'),
  illegal: require('../../assets/sounds/illegal.wav'),
  clear: require('../../assets/sounds/clear.wav'),
  chain: require('../../assets/sounds/chain.wav'),
  shrink: require('../../assets/sounds/shrink.wav'),
  retire: require('../../assets/sounds/retire.wav'),
  perfect: require('../../assets/sounds/perfect.wav'),
  newBest: require('../../assets/sounds/newBest.wav'),
  gameOver: require('../../assets/sounds/gameOver.wav'),
};

/**
 * AC-1102's vocabulary, mapped onto UIKit's.
 *
 * Each returns a promise nobody awaits, so each swallows its own rejection: an
 * unhandled rejection from a decoration would be a crash report about a noise.
 */
const HAPTICS = {
  selection: () => selectionAsync(),
  light: () => impactAsync(ImpactFeedbackStyle.Light),
  medium: () => impactAsync(ImpactFeedbackStyle.Medium),
  heavy: () => impactAsync(ImpactFeedbackStyle.Heavy),
  success: () => notificationAsync(NotificationFeedbackType.Success),
  error: () => notificationAsync(NotificationFeedbackType.Error),
};

const engine = makeCueEngine({
  setAudioMode: (mode) => setAudioModeAsync(mode),
  createPlayer: (source) => createAudioPlayer(source),
  sources: SOURCES,
  haptic: (id) => {
    const run = HAPTICS[id];
    if (!run) return;
    const done = run();
    if (done && typeof done.catch === 'function') done.catch(() => {});
  },
});

/** Configure the audio session, once, before anything can open a player. */
export const startCues = engine.start;

/** AC-1104. Written from the settings provider's effect; read at every cue. */
export const setCuePrefs = engine.setPrefs;

/** One cue. Safe from a worklet's `runOnJS`, safe from an effect, never throws. */
export const fireCue = engine.fire;
