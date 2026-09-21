// Easings and animation configs, in one place, because ui.md §8 specifies them
// once and a second copy is a second opinion.
//
// Reduce Motion is applied HERE rather than left to Reanimated. Reanimated's
// default `ReduceMotion.System` disables an animation by jumping it to its end
// value, which would also swallow the `withDelay` gaps that carry the cascade —
// and AC-907 is explicit that "cascade steps still play in sequence at the §8.2
// intervals so the chain remains countable". So every config below opts out of
// Reanimated's handling and we clamp the durations ourselves (ui.md §8.4).

import {
  Easing,
  ReduceMotion,
  withDelay,
  withSequence,
} from 'react-native-reanimated';

import { MOTION } from './theme.js';

export const EASE = Object.freeze({
  /** Snap to column, arrival push-up, sheets: cubic-bezier(.22,1,.36,1). */
  out: Easing.bezier(0.22, 1, 0.36, 1),
  /** Gravity fall: accelerating, so it reads as a fall. */
  fall: Easing.bezier(0.55, 0, 1, 0.45),
  /** Clear collapse: cubic-bezier(.4,0,1,.4). */
  collapse: Easing.bezier(0.4, 0, 1, 0.4),
  /** Illegal shake: cubic-bezier(.36,.07,.19,.97). */
  illegal: Easing.bezier(0.36, 0.07, 0.19, 0.97),
  /** Score count-up and the floating +N: ease-out cubic. */
  cubicOut: Easing.out(Easing.cubic),
  /** The danger pulse, and the flash's decay. */
  inOut: Easing.inOut(Easing.ease),
  /** The turn clock is a ramp of milliseconds; it must not be shaped. */
  linear: Easing.linear,
});

/** ui.md §8.4: under Reduce Motion no single transform outlives 120 ms. */
function span(ms, reduced) {
  return reduced ? Math.min(ms, MOTION.reduced) : ms;
}

/** A `withTiming` config. Never lets Reanimated apply its own Reduce Motion. */
export function timing(ms, easing, reduced) {
  return { duration: span(ms, reduced), easing, reduceMotion: ReduceMotion.Never };
}

/**
 * `withDelay` and `withSequence` with Reanimated's own Reduce Motion handling
 * turned off — and they are the reason this module exists.
 *
 * `withDelay` defaults to `ReduceMotion.System`, and its implementation reads
 * `if (now - startTime >= delayMs || animation.reduceMotion)`: with the OS
 * setting on it does not shorten the delay, it SKIPS it. Every scheduled beat
 * of a turn would then fire on the same frame — the whole cascade collapsing
 * into one instant, which is precisely what AC-907 forbids ("cascade steps
 * still play in sequence at the §8.2 intervals so the chain remains
 * countable"). Measured, not assumed: with the default the flash of a clear
 * scheduled for t=570 fired at t=0.
 *
 * Reduce Motion shortens what MOVES. It does not change WHEN things happen.
 */
export function delay(ms, animation) {
  'worklet';
  return withDelay(ms, animation, ReduceMotion.Never);
}

export function sequence(...animations) {
  'worklet';
  return withSequence(ReduceMotion.Never, ...animations);
}

/**
 * A duration-based spring.
 *
 * ui.md writes its springs as `spring(.34, 1.4, .64, 1)`, which is not
 * Reanimated's notation and whose middle terms are not in Reanimated's units —
 * a stiffness of 1.4 would not move. The duration-based form is the faithful
 * mapping: it takes the spec's millisecond figure directly as the perceptual
 * duration and the third term as the damping ratio, which is the slot that term
 * occupies in that form. The normative number stays the number in the code.
 */
export function spring(ms, dampingRatio, reduced) {
  return {
    duration: span(ms, reduced),
    dampingRatio: reduced ? 1 : dampingRatio,
    reduceMotion: ReduceMotion.Never,
  };
}

