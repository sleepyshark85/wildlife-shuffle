// The turn's scheduled cues, played off the board's own clock.
//
// `buildReplay` decided which cues the turn has and when (src/ui/replay.js);
// this is the three lines that fire them. It uses the SAME shared value every
// animal's position is arithmetic on (src/ui/useTurnClock.js) rather than a
// `withDelay` per cue, for §6.7's reason: `withDelay` anchors to its own
// animation's first frame, so eleven of them built across a vsync boundary
// start up to a frame apart — and a cue that drifts off the frame it is
// announcing is a cue that sounds like a mistake.
//
// It also means no timer. AC-828's two `setTimeout`s in `useGameRun.js` are
// still the only two in the app, and the cue schedule costs zero JS frames
// until a cue is actually due.

import { useEffect } from 'react';
import { runOnJS, useAnimatedReaction, useSharedValue } from 'react-native-reanimated';

import { dueCount } from './cues.js';
import { fireCue } from './cuePlayer.js';

const NONE = Object.freeze([]);
const IDLE = '';

export function useTurnCues(plan, clock) {
  /** How many of this turn's cues have gone. Lives on the UI thread with the
   *  clock it is compared against, so advancing it costs no render. */
  const cursor = useSharedValue(0);
  /** The turn the cursor belongs to. Resetting from here rather than from a
   *  JS effect removes the ordering question entirely: the cursor cannot be
   *  stale against a clock it is reading in the same worklet call. */
  const playedKey = useSharedValue(IDLE);

  const schedule = plan ? plan.cues : NONE;
  const key = plan ? plan.key : IDLE;

  useAnimatedReaction(
    () => clock.ms.value,
    (t) => {
      'worklet';
      const running = clock.key.value;
      if (running !== playedKey.value) {
        playedKey.value = running;
        cursor.value = 0;
      }
      if (running !== key) return;
      const next = dueCount(schedule, cursor.value, t);
      if (next === cursor.value) return;
      for (let i = cursor.value; i < next; i += 1) {
        runOnJS(fireCue)(schedule[i].cue, schedule[i].rate);
      }
      cursor.value = next;
    },
  );

  /**
   * A turn that moves nothing has no clock to hang cues on.
   *
   * `useTurnClock` does not ramp when `clockMs` is 0, which is right — there is
   * nothing to interpolate. But such a turn can still END the run (Hold the
   * Line with a frozen tray, and the board already at the kill line), and the
   * one thing that must never be swallowed is the game-over cue. Every cue on
   * such a turn is at t=0 by construction, so firing the lot is not an
   * approximation of the schedule, it IS the schedule.
   */
  useEffect(() => {
    if (!plan || plan.clockMs > 0) return;
    for (const cue of plan.cues) fireCue(cue.cue, cue.rate);
  }, [plan]);
}
