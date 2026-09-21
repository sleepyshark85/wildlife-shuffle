// Where a dragged body is allowed to be, as arithmetic.
//
// THIS FILE IMPORTS NOTHING, for `src/ui/trajectory.js`'s reason
// (docs/development-process.md §6.7): anything that must be checkable
// off-device must import nothing that only runs on-device. Reanimated cannot
// load in Node, so a single import here would move the one function that
// decides where a dragged animal may be drawn out of `node --test`'s reach and
// into the hands of a human holding a phone. It is a `'worklet'` AND a plain
// function at once, which is what lets the sweep in test/presentation.test.js
// run the very code the gesture runs on the UI thread every touch frame.
//
// WHY IT IS NOT IN occupancy.js. `slideRange` is React-thread code: it reads
// the animals array and is recomputed when the board changes. This runs in the
// gesture worklet at touch rate and takes every value it needs as an argument,
// so it can never read anything that moved after the gesture started (AC-832).
//
// WHY IT IS NOT IN trajectory.js. A drag is not a trajectory. `rowAt` answers
// "where is this animal at time t"; this answers "where may the finger put it",
// and mixing the two would put the clamp behind the trajectory's clock.
//
// The strong claim, AC-407c: no column this function can produce is one the
// engine's `checkMove` would reject. The clamp and `slideRange` must agree with
// the engine exactly — a clamp that stopped the body one column short of what
// the engine accepts would leave the player shoving against nothing, and one
// column long would silently do nothing on release, which is v1's C5 defect
// wearing this design's clothes.

/**
 * AC-407e: how far past a limit the *unclamped* finger must push before
 * contact engages, and how far back it must come before contact releases.
 *
 * Two numbers rather than one because one number flutters: a finger resting
 * exactly on the boundary crosses a single threshold several times a second,
 * which would strobe the blocker's rim and machine-gun the contact cue. The
 * 4 pt band is what makes "pushing" a different thing from "arriving".
 */
export const CONTACT_ENGAGE = 6;
export const CONTACT_RELEASE = 2;

/**
 * The body's position, its destination column, and which limit the finger is
 * pushing past — AC-407b, AC-407c, AC-407d, AC-407e.
 *
 * `minX`/`maxX` are columns from the gesture-start occupancy snapshot
 * (`slideRange`), which already initialises them to `0` and `width - size`. So
 * the board edges and the neighbours are ONE clamp: AC-404 is true by the same
 * arithmetic that makes AC-403 true, and there is no second bounds clamp
 * anywhere (AC-407b).
 *
 * `wasPressed` is the previous frame's `pressed`, which is what makes the
 * hysteresis a function of the state rather than of a timer.
 *
 * @param {number} startPx       the body's pixel x when the gesture began
 * @param {number} translationX  the gesture's translation, unclamped
 * @param {number} cell          pixels per column
 * @param {number} minX          leftmost legal column
 * @param {number} maxX          rightmost legal column
 * @param {number} wasPressed    -1, 0 or +1 from the previous frame
 * @returns {{px:number, col:number, pressed:number}}
 */
export function clampDrag(startPx, translationX, cell, minX, maxX, wasPressed) {
  'worklet';
  const minPx = minX * cell;
  const maxPx = maxX * cell;
  // The finger, before anything is done to it. Both the clamp and the contact
  // test are derived from this one value, which is why they cannot disagree
  // about whether the body is at a limit (AC-407d).
  const raw = startPx + translationX;

  let px = raw;
  if (px < minPx) px = minPx;
  if (px > maxPx) px = maxPx;

  // Rounded from the CLAMPED position, then re-clamped: rounding at a limit
  // can only land on the limit itself, and the second clamp makes that a
  // guarantee instead of a consequence of the first one.
  let col = Math.round(px / cell);
  if (col < minX) col = minX;
  if (col > maxX) col = maxX;

  let side = 0;
  let over = 0;
  if (raw > maxPx) {
    side = 1;
    over = raw - maxPx;
  } else if (raw < minPx) {
    side = -1;
    over = minPx - raw;
  }
  // A side the finger is already pressing holds on the release threshold; any
  // other side — including a flip straight from one limit to the other — has
  // to earn the full engage distance.
  const threshold = side === wasPressed ? CONTACT_RELEASE : CONTACT_ENGAGE;
  const pressed = side !== 0 && over >= threshold ? side : 0;

  return { px, col, pressed };
}
