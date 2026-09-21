// Where an animal is drawn, as arithmetic.
//
// This module imports NOTHING. That is the point: `rowAt` is both a Reanimated
// worklet and a plain function, so `node --test` can sweep the very trajectory
// the UI thread renders (test/overlap.test.js). Importing Reanimated here would
// make it unloadable in Node, and the rendered path would go back to being
// something only a device could contradict — which is how two animals came to
// be crossing each other on screen with every test green.
//
// It lives apart from motion.js for exactly that reason, and motion.js must
// not be given anything that belongs here.

/**
 * cubic-bezier(x1,y1,x2,y2) evaluated at `p`, as CSS and Reanimated define it.
 *
 * A `'worklet'` and a plain function at once, so the UI thread and `node --test`
 * evaluate the SAME curve. `Easing.bezier` cannot do that: it is a Reanimated
 * object that only exists inside a `withTiming` config, which is precisely why
 * the rendered trajectory used to be untestable off a device.
 */
export function bezierAt(x1, y1, x2, y2, p) {
  'worklet';
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  let t = p;
  for (let i = 0; i < 8; i += 1) {
    const x = ((ax * t + bx) * t + cx) * t - p;
    if (x > -1e-6 && x < 1e-6) break;
    const d = (3 * ax * t + 2 * bx) * t + cx;
    if (d > -1e-6 && d < 1e-6) break;
    t -= x / d;
  }
  return ((ay * t + by) * t + cy) * t;
}

/**
 * Where an animal is rendered at `t` ms into the turn — THE one definition.
 *
 * Every animal reads the same clock, so two animals with the same schedule are
 * at the same place by arithmetic rather than by both happening to have been
 * started on the same frame. They were not: five animals with byte-identical
 * key schedules were measured starting on two different frames, because
 * `withDelay` anchors to each animation's own first frame and building twenty
 * of them straddles a vsync. One frame of drift is a quarter of a row, and a
 * stack has no slack at all — so the animals visibly crossed each other, which
 * is what the owner saw as "they appear to be different animals".
 *
 * @param {number} startY where the animal stood when the turn began
 * @param {object[]} keys `{start, dur, y, kind}` from the replay plan
 * @param {number} t      ms since the turn's animation began
 * @param {number} cap    Reduce Motion's per-transform ceiling, or 0 for none
 */
export function rowAt(startY, keys, t, cap) {
  'worklet';
  let y = startY;
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    const dur = cap > 0 && key.dur > cap ? cap : key.dur;
    if (t <= key.start) return y;
    if (t >= key.start + dur) {
      y = key.y;
      continue;
    }
    const p = (t - key.start) / dur;
    // ui.md §8: gravity accelerates, everything else decelerates.
    const e = key.kind === 'fall'
      ? bezierAt(0.55, 0, 1, 0.45, p)
      : bezierAt(0.22, 1, 0.36, 1, p);
    return y + (key.y - y) * e;
  }
  return y;
}

