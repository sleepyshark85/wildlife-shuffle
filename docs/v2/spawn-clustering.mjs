// Wildlife Shuffle v2 — executable form of AC-308d/AC-308e (docs/v2/acceptance-criteria.md).
//
// WHAT THIS MEASURES THAT species-mix.mjs CANNOT.
//
// species-mix.mjs checks the LONG-RUN mix: realised share within ~2pp of the weight
// table, mean drawn size within 0.10, over tens of thousands of batches. It passes,
// and it was always going to pass, because the draws are independent and the law of
// large numbers is not a design property. The owner's report — "sometimes, an animal
// appears much more than the others" — is about a window of ten turns, and an
// aggregate over 60,000 batches is structurally blind to it.
//
// So this file measures CLUSTERING: how far the mix inside a short window can drift
// from the table, how long a species can be absent, and how long a run of one species
// can get. Those are the quantities a player actually experiences.
//
//   node docs/v2/spawn-clustering.mjs              current generator, all difficulties
//   node docs/v2/spawn-clustering.mjs --compare    current vs the proposed bag (gameplay.md §5.8)
//   node docs/v2/spawn-clustering.mjs --selftest   proves the thresholds can FAIL (§6.2)
//
// Both generators are driven through the REAL mulberry32 in src/engine/rng.js and the
// REAL weight tables in src/engine/constants.js; "current" calls the REAL generateBatch.
// Only the species-draw rule differs between the two columns.

import { CURVE, DRAWABLE, SPECIES, meanDrawnSize } from '../../src/engine/constants.js';
import { makeRng, nextFraction, nextInt } from '../../src/engine/rng.js';
import { bandForTurn, generateBatch } from '../../src/engine/spawn.js';

// gameplay.md §5.5b: ONE curve, and its tuning row is the one previously labelled
// 'meadow'. The label is gone and so, as of this pass, are the other two rows:
// `CURVE` is now imported from the engine rather than named here, and `--all` has
// nothing left to sweep. The numbers are unchanged, which is why every figure this
// script printed before the collapse it still prints.
const WINDOW = 12;            // draws per window == the proposed bag size (§5.8)
const TURNS = 200;            // turns per seed
const SEEDS = 200;

// ---------------------------------------------------------------------------
// THE PROPOSED GENERATOR (gameplay.md §5.8): a carried-remainder bag.
//
// Per bag of BAG_SIZE draws, each species is allotted tickets proportional to its
// weight, with the fractional remainder CARRIED into the next bag, so the long-run
// share is exactly the weight table while any one bag is within a single ticket of
// its exact entitlement. The bag is then shuffled and drawn without replacement.
//
// The memory is (tickets remaining, carry) and it lives in game state beside the
// PRNG, threaded the same way — see gameplay.md §5.8.3.
// ---------------------------------------------------------------------------
export const BAG_SIZE = 12;

/** Allot BAG_SIZE tickets by weight, carrying the remainder. Pure integer maths. */
export function refillBag(rng, carry) {
  const weights = CURVE.weights;
  const total = DRAWABLE.reduce((sum, key) => sum + weights[key], 0);
  const counts = {};
  const nextCarry = {};
  let allotted = 0;
  for (const key of DRAWABLE) {
    const credit = (carry[key] || 0) + BAG_SIZE * weights[key];   // units of 1/total
    const whole = Math.floor(credit / total);
    counts[key] = whole;
    nextCarry[key] = credit - whole * total;
    allotted += whole;
  }
  // Largest-remainder top-up, deterministic: highest carry wins, DRAWABLE order breaks ties.
  while (allotted < BAG_SIZE) {
    let best = DRAWABLE[0];
    for (const key of DRAWABLE) if (nextCarry[key] > nextCarry[best]) best = key;
    counts[best] += 1;
    nextCarry[best] -= total;
    allotted += 1;
  }
  const tickets = [];
  for (const key of DRAWABLE) for (let i = 0; i < counts[key]; i += 1) tickets.push(key);
  // Fisher-Yates on the engine's own PRNG.
  let state = rng;
  for (let i = tickets.length - 1; i > 0; i -= 1) {
    const drawn = nextInt(state, 0, i);
    state = drawn.rng;
    const j = drawn.value;
    const tmp = tickets[i]; tickets[i] = tickets[j]; tickets[j] = tmp;
  }
  return { rng: state, bag: tickets, carry: nextCarry };
}

/**
 * One batch from the proposed generator. Identical to §5.2 except for the draw:
 * a ticket is taken from the bag instead of a weighted pick from the pool.
 *
 * THE SKIP RULE. A ticket whose species cannot fit (`size > CAP - filled`) is
 * PUT BACK, not discarded, and the next ticket is taken — so the hard board
 * limit delays a species by a draw instead of spending its entitlement. That is
 * what keeps AC-308b's ceiling-band drift out of the bag.
 */
export function generateBatchBag({ turn, rng, bag, carry, width = 9 }) {
  const cap = width - 1;
  let state = rng;
  let pool = bag;
  let credit = carry;

  const [low, high] = bandForTurn(turn);
  const rolled = nextInt(state, low, high);
  state = rolled.rng;
  const target = Math.max(1, Math.min(cap, rolled.value));

  const raw = target / meanDrawnSize();
  const whole = Math.floor(raw);
  const frac = nextFraction(state);
  state = frac.rng;
  const k = Math.max(1, whole + (frac.value < raw - whole ? 1 : 0));

  const chosen = [];
  let filled = 0;
  for (let i = 0; i < k; i += 1) {
    if (!DRAWABLE.some((key) => SPECIES[key].size <= cap - filled)) break;
    const held = [];
    let taken = null;
    for (;;) {
      if (pool.length === 0) {
        const refilled = refillBag(state, credit);
        state = refilled.rng; pool = refilled.bag; credit = refilled.carry;
      }
      const next = pool[pool.length - 1];
      pool = pool.slice(0, -1);
      if (SPECIES[next].size <= cap - filled) { taken = next; break; }
      held.push(next);
    }
    pool = pool.concat(held);       // put the unfittable tickets back
    chosen.push(taken);
    filled += SPECIES[taken].size;
  }
  return { rng: state, bag: pool, carry: credit, batch: chosen, target };
}

// ---------------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------------
const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

/** Collect one long draw sequence per seed, at the turn numbers a real run visits. */
function drawSequences(variant) {
  const runs = [];
  for (let seed = 1; seed <= SEEDS; seed += 1) {
    let rng = makeRng(seed * 7919 + 13);
    let bag = []; let carry = {};
    const draws = [];
    for (let turn = 1; turn <= TURNS; turn += 1) {
      if (variant === 'bag') {
        const out = generateBatchBag({ turn, rng, bag, carry });
        rng = out.rng; bag = out.bag; carry = out.carry;
        draws.push(...out.batch);
      } else {
        const out = generateBatch({ turn, rng, nextId: 1, allowBuffalo: false });
        rng = out.rng;
        draws.push(...out.batch.map((a) => a.type));
      }
    }
    runs.push(draws);
  }
  return runs;
}

function analyse(runs) {
  const weights = CURVE.weights;
  const total = DRAWABLE.reduce((s, k) => s + weights[k], 0);
  const intended = Object.fromEntries(DRAWABLE.map((k) => [k, weights[k] / total]));

  const counts = Object.fromEntries(DRAWABLE.map((k) => [k, 0]));
  let n = 0; let cells = 0;
  const gaps = Object.fromEntries(DRAWABLE.map((k) => [k, []]));
  const runLengths = [];
  const windowMaxShare = [];
  const windowAbsent = [];
  let longest = 0;

  for (const draws of runs) {
    const last = {};
    let streakKey = null; let streak = 0;
    draws.forEach((key, i) => {
      counts[key] += 1; n += 1; cells += SPECIES[key].size;
      if (last[key] !== undefined) gaps[key].push(i - last[key]);
      last[key] = i;
      if (key === streakKey) streak += 1; else { if (streak) runLengths.push(streak); streakKey = key; streak = 1; }
      if (streak > longest) longest = streak;
    });
    runLengths.push(streak);
    for (let i = 0; i + WINDOW <= draws.length; i += 1) {
      const w = draws.slice(i, i + WINDOW);
      const c = Object.fromEntries(DRAWABLE.map((k) => [k, 0]));
      for (const key of w) c[key] += 1;
      let worst = 0; let absent = 0;
      for (const key of DRAWABLE) {
        const dev = c[key] / WINDOW - intended[key];
        if (Math.abs(dev) > Math.abs(worst)) worst = dev;
        if (c[key] === 0) absent += 1;
      }
      windowMaxShare.push(worst);
      windowAbsent.push(absent > 0 ? 1 : 0);
    }
  }
  return {
    n,
    meanSize: cells / n,
    share: Object.fromEntries(DRAWABLE.map((k) => [k, counts[k] / n])),
    intended,
    longestRun: longest,
    runP99: pct(runLengths, 0.99),
    gapP50: Object.fromEntries(DRAWABLE.map((k) => [k, pct(gaps[k], 0.5)])),
    gapP99: Object.fromEntries(DRAWABLE.map((k) => [k, pct(gaps[k], 0.99)])),
    gapMax: Object.fromEntries(DRAWABLE.map((k) => [k, Math.max(...gaps[k])])),
    windowWorst: pct(windowMaxShare.map(Math.abs), 0.99),
    windowAbsentPct: mean(windowAbsent),
  };
}

function report(variant, r) {
  console.log(`\n--- the curve / ${variant} --- ${r.n.toLocaleString()} draws`);
  console.log(`  mean drawn size      ${r.meanSize.toFixed(3)}  (intent ${meanDrawnSize().toFixed(2)})`);
  console.log(`  realised share       ${DRAWABLE.map((k) => `${k} ${(r.share[k] * 100).toFixed(1)}%`).join('  ')}`);
  console.log(`  longest same-species run  ${r.longestRun}   (p99 of runs ${r.runP99})`);
  console.log(`  gap between appearances (draws)  ${DRAWABLE.map((k) => `${k} p50 ${r.gapP50[k]} p99 ${r.gapP99[k]} max ${r.gapMax[k]}`).join(' | ')}`);
  console.log(`  ${WINDOW}-draw window: p99 worst share deviation  ${(r.windowWorst * 100).toFixed(1)} pp`);
  console.log(`  ${WINDOW}-draw window: some species absent        ${(r.windowAbsentPct * 100).toFixed(1)}% of windows`);
}

// AC-308d/AC-308e thresholds. Applied to the PROPOSED generator only; the current
// one is the baseline these were chosen against and is expected to exceed them.
// AC-308d / AC-308e. Every figure is the measured bag value plus a margin, EXCEPT
// `gapMax`, which is structural: with BAG_SIZE 12 every species is allotted at least
// one ticket per bag at the curve's weights (the rarest, elephant at 10%, gets 1.2),
// so a species cannot be absent across two whole bags and the worst gap is bounded
// by 2 x BAG_SIZE. Measured 23; the limit is the bound.
export const LIMITS = {
  longestRun: 8,          // bag measures 7; the current generator measures 10
  gapMax: 2 * BAG_SIZE,   // bag measures 23; the current generator measures 88
  windowWorst: 0.26,      // bag measures 25.0pp; the current generator measures 40.0pp
  windowAbsent: 0.20,     // bag measures 13.5%; the current generator measures 33.4%
};

function check(r, failures) {
  const push = (m) => failures.push(`curve: ${m}`);
  if (r.longestRun > LIMITS.longestRun) push(`longest same-species run ${r.longestRun} > ${LIMITS.longestRun}`);
  for (const k of DRAWABLE) {
    if (r.gapMax[k] > LIMITS.gapMax) push(`${k} worst gap ${r.gapMax[k]} draws > ${LIMITS.gapMax}`);
  }
  if (r.windowWorst > LIMITS.windowWorst) push(`p99 window deviation ${(r.windowWorst * 100).toFixed(1)}pp > ${(LIMITS.windowWorst * 100).toFixed(0)}pp`);
  if (r.windowAbsentPct > LIMITS.windowAbsent) push(`windows missing a species ${(r.windowAbsentPct * 100).toFixed(1)}% > ${(LIMITS.windowAbsent * 100).toFixed(0)}%`);
  if (Math.abs(r.meanSize - meanDrawnSize()) > 0.10) push(`mean drawn size ${r.meanSize.toFixed(3)} off intent by more than 0.10`);
  for (const k of DRAWABLE) {
    if (Math.abs(r.share[k] - r.intended[k]) > 0.02) push(`${k} share ${(r.share[k] * 100).toFixed(1)}% off intent by more than 2pp`);
  }
}

const args = process.argv.slice(2);
const compare = args.includes('--compare');
const selftest = args.includes('--selftest');

if (selftest) {
  // §6.2 — a check that cannot fail is not a check. Run the CURRENT generator
  // through the thresholds written for the proposed one: it must fail, and the
  // failures must be the clustering ones rather than the aggregate ones.
  console.log('SELFTEST — the current generator measured against AC-308d/AC-308e thresholds.');
  console.log('It must FAIL on clustering while PASSING the aggregate mix, or the new');
  console.log('criteria are measuring nothing species-mix.mjs did not already measure.\n');
  const failures = [];
  check(analyse(drawSequences('current')), failures);
  failures.forEach((f) => console.log('  CAUGHT  ' + f));
  const aggregate = failures.filter((f) => /share|mean drawn size/.test(f));
  console.log(`\n${failures.length} threshold(s) exceeded by the current generator.`);
  console.log(`${aggregate.length} of them aggregate (expected 0 — species-mix.mjs already covers those).`);
  const ok = failures.length > 0 && aggregate.length === 0;
  console.log(ok ? '\nPASS — the check can fail, and it fails for the right reason.'
    : '\nFAIL — these thresholds do not discriminate; do not trust them.');
  process.exit(ok ? 0 : 1);
}

const failures = [];
console.log('\n================ THE CURVE ================');
report('current', analyse(drawSequences('current')));
if (compare) {
  const r = analyse(drawSequences('bag'));
  report(`bag(${BAG_SIZE})`, r);
  check(r, failures);
}
if (compare) {
  console.log(`\n--- AC-308d/AC-308e against the proposed bag ---`);
  failures.forEach((f) => console.log('  FAIL  ' + f));
  console.log(failures.length ? `\nFAIL — ${failures.length} violation(s)` : '\nPASS — the bag meets every clustering limit and every aggregate limit.');
  process.exit(failures.length ? 1 : 0);
}
