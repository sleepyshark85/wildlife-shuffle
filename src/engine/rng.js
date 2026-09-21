// Seeded PRNG (mulberry32), written as pure functions over an integer state.
//
// The engine never calls Math.random(). The PRNG state is carried in the game
// state and threaded through every call, so a run is fully reproducible from its
// seed (gameplay.md §5.2, D13; AC-202, AC-314, AC-1308).
//
// Every function takes the current state and returns { rng, value } — the caller
// must use the returned rng for its next draw.

/** Normalise any seed (number or string) to a uint32 PRNG state. */
export function makeRng(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    return seed >>> 0;
  }
  const text = String(seed);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** One mulberry32 step. Returns the next state and a float in [0, 1). */
export function nextFraction(rng) {
  const next = (rng + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { rng: next, value: ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
}

/** Integer in [min, max] inclusive. Returns min if the range is empty. */
export function nextInt(rng, min, max) {
  if (max <= min) return { rng, value: min };
  const { rng: next, value } = nextFraction(rng);
  return { rng: next, value: min + Math.floor(value * (max - min + 1)) };
}

// `pick` (uniform choice from an array) lived here until the count-first
// generator landed. Its only caller was the old interleaved placement step,
// which chose a landing spot from a list of candidate runs; placement is
// arithmetic now, so nothing calls it. Kept as a note rather than as an unused
// export, because AC-1303 counts dead exports as a defect.

/**
 * Weighted pick. `weights[i]` is the weight of `items[i]`; weights must be
 * non-negative and sum to more than zero.
 */
export function weightedPick(rng, items, weights) {
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (items.length === 0 || total <= 0) return { rng, value: undefined };
  const { rng: next, value } = nextFraction(rng);
  let roll = value * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i];
    if (roll < 0) return { rng: next, value: items[i] };
  }
  return { rng: next, value: items[items.length - 1] };
}

/** Fisher-Yates. Returns a new array; the input is not mutated. */
export function shuffle(rng, items) {
  const out = items.slice();
  let state = rng;
  for (let i = out.length - 1; i > 0; i--) {
    const drawn = nextInt(state, 0, i);
    state = drawn.rng;
    const j = drawn.value;
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return { rng: state, value: out };
}
