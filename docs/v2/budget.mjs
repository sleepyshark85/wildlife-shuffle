// Wildlife Shuffle v2 — executable form of AC-820/821/822/824 (docs/v2/acceptance-criteria.md).
// Derives the input-lock figures in ui.md §8.2 from the timing constants, exhaustively over
// every legal (settle, arrival) split of animated units. §8.2 has gone stale three times from
// restating these by hand; it now cites this script instead.
// Run: node docs/v2/budget.mjs

export const SNAP = 110, SETTLE = 200, ARRIVAL = 260;   // structural, per turn
export const COLLAPSE = 110, FALL = 200, LEAD = 80;     // structural, per clear step
export const BUDGET = 1500, FLOOR = 0.55;
export const MAX_UNITS = 6;                             // AC-825: 5 separate + 1 combined, per TURN
export const interval = k => Math.max(200, 260 - 15 * (k - 1));

const step = COLLAPSE + FALL;                                   // 310
// One resolution of n animated units: the lead beat once, the gaps between starts, then the
// final unit's own structural life.
export function cascade(n) {
  if (n === 0) return 0;
  let t = LEAD;
  for (let k = 1; k < n; k++) t += interval(k);
  return t + step;
}
export const turn = (settle, arrival) =>
  SNAP + SETTLE + cascade(settle) + ARRIVAL + cascade(arrival);

// Exhaustive over every split permitted by the cap.
const splits = [];
for (let a = 0; a <= MAX_UNITS; a++)
  for (let b = 0; b + a <= MAX_UNITS; b++) splits.push([a, b]);

const scaleOf = raw => (raw > BUDGET ? BUDGET / raw : 1);
const worst = splits.reduce((w, s) => (turn(...s) > turn(...w) ? s : w), [0, 0]);

const named = [
  ['no clear',                        [0, 0]],
  ['typical: one clear step',         [1, 0]],
  ['realistic worst: 3 steps, 2/1',   [2, 1]],
  [`absolute worst: ${MAX_UNITS} units, ${worst[0]}/${worst[1]}`, worst],
];
console.log('case                                   split    raw      scale');
for (const [name, s] of named) {
  const raw = turn(...s), sc = scaleOf(raw);
  console.log(`${name.padEnd(38)} ${(s[0]+'/'+s[1]).padEnd(7)} ${(raw+' ms').padStart(8)}  ${sc === 1 ? 'none' : sc.toFixed(3) + 'x'}`);
}
const raw = turn(...worst), sc = scaleOf(raw);
console.log(`\nAC-825 cap ${MAX_UNITS} animated units/turn · AC-822 budget ${BUDGET} ms`);
console.log(`worst split ${worst[0]}/${worst[1]} = ${raw} ms -> ${sc.toFixed(3)}x  (AC-824 floor ${FLOOR}x)`);
const ok = sc >= FLOOR && splits.every(s => scaleOf(turn(...s)) >= FLOOR);
console.log(ok ? 'PASS: every legal split stays above the floor' : 'FAIL: a legal split breaches the floor');
process.exit(ok ? 0 : 1);
