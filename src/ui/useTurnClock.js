// One clock for the board's vertical motion.
//
// The owner reported that "briefly right before a row is full and cleared, the
// animals in that row appear to be different animals". They were watching
// stacked animals cross each other.
//
// The cause was that each animal ran its own `withSequence` of delays, and
// `withDelay` anchors to the animation's OWN first frame. Building twenty of
// them straddles a vsync, so animals with byte-identical schedules started on
// different frames — measured: five animals scheduled to fall at t=110 started
// in two groups a frame apart. One frame of drift is about a quarter of a row,
// a stack has no slack at all, and the engine's no-overlap invariant is only
// preserved on screen if column-sharing animals move in lockstep.
//
// So the clock is shared and the position is arithmetic on it (motion.js
// `rowAt`). Two animals with the same schedule are now in the same place
// because they are the same function of the same number.
//
// It is one `withTiming` on the UI thread — a linear ramp of milliseconds — so
// this costs one animation for the whole board rather than one per animal, and
// no JS frames at all (AC-828, AC-833).

import { useEffect, useMemo } from 'react';
import { ReduceMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { EASE } from './motion.js';

/** No turn is playing: every animal reads its schedule as not yet started. */
const IDLE = '';

export function useTurnClock(plan) {
  const ms = useSharedValue(0);
  const key = useSharedValue(IDLE);

  useEffect(() => {
    if (!plan || plan.clockMs <= 0) {
      key.value = IDLE;
      return;
    }
    // Key first, then the ramp: an animal compares the key before it reads the
    // time, so it can never apply this turn's clock to last turn's schedule.
    key.value = plan.key;
    ms.value = 0;
    ms.value = withTiming(plan.clockMs, {
      duration: plan.clockMs,
      easing: EASE.linear,
      reduceMotion: ReduceMotion.Never,
    });
  }, [plan, ms, key]);

  return useMemo(() => ({ ms, key }), [ms, key]);
}
