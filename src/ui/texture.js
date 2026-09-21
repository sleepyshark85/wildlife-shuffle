// ui.md §16.3 — the natural background, as arithmetic.
//
// The owner: *"probably some natural background (don't make the background too
// strong that make it hard to see the animals)"*. §16.3 answers the second half
// structurally rather than by restraint, and this module is where the structure
// lives:
//
//   > The texture lives on the BOARD GROUND. Empty cells are semi-transparent
//   > so it reads through them. ANIMALS ARE FULLY OPAQUE. The background
//   > therefore cannot be behind an animal, and "too strong to see the animals"
//   > is not a thing a future change can reintroduce by nudging an alpha.
//
// That is AC-1507, and it is a LAYERING claim, not a number. The texture is
// painted once, under the cell layer; the cell layer is what became
// translucent; the animals were opaque already and the species table has no
// alpha in it to change. So there is no alpha anywhere on the path between the
// texture and a player's view of an animal — not a small one, not a
// well-chosen one, none.
//
// THE CELL KEEPS ITS COLOUR. Making the cells translucent would ordinarily
// change what the player sees the cells as, which is the right state rendered
// wrong (§6.7). `paintedCell` solves for the colour that, composited over the
// board at CELL_ALPHA, IS the specified cell colour — so adding the texture
// moved no design value. A test runs the composite back.
//
// AC-1511: the texture stops at the danger band. Rows 11-14 render flat,
// because a texture under a tint under a pulse is three things competing in the
// one place the player most needs to read quickly, and where warmth and urgency
// conflict, urgency wins. One constant decides both the layer's height and the
// cells' opacity, so the two cannot drift apart.
//
// PURE, and it imports only the engine's constants and its PRNG — both of which
// are themselves pure. Nothing here can load a renderer, for `trajectory.js`'s
// reason (§6.7): a claim about what is on the screen that only a device can
// evaluate is a claim nobody checks.

import { BOARD } from '../engine/constants.js';
import { makeRng, nextFraction } from '../engine/rng.js';

/**
 * AC-1511. The texture covers rows 0 to `dangerBandLow - 1` and stops.
 *
 * ONE source: the layer's height is `TEXTURE_ROWS * cell` and the cells' own
 * opacity is `texturedRow(y)`, and both read this. A number typed in two
 * places is the sync rule that §6.3 is about.
 */
export const TEXTURE_ROWS = BOARD.dangerBandLow;

/** Does this row sit over the texture, or is it flat danger-band ground? */
export function texturedRow(y) {
  return y < TEXTURE_ROWS;
}

/**
 * How much of the board ground an empty cell lets through.
 *
 * Half. High enough that the cell still reads as a cell rather than as a
 * window, low enough that a 1.11:1 grain is not attenuated into nothing. It is
 * the only alpha in the stack and it is on the CELL — the layer above the
 * texture, never the layer above an animal.
 */
export const CELL_ALPHA = 0.5;

const channels = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (rgb) =>
  `#${rgb.map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('')}`;

/**
 * The colour to PAINT a cell so that, seen at `alpha` over `ground`, it is
 * exactly `target`.
 *
 * This is what keeps AC-1507 from costing anything: the cell colours in
 * `ui.md` §4 are what the player sees, before and after the texture landed.
 * Solving it rather than eyeballing it also means a board theme (AC-1011)
 * repaints correctly with no second table — `#151026` gets its own answer.
 *
 * A channel can solve out of range when the target is far from the ground; it
 * clamps, and the test reports the residual rather than pretending there is
 * none. The test composites the answer back with ITS OWN arithmetic rather
 * than one exported from here — a check that calls the function it is checking
 * is the function agreeing with itself (§6.2).
 */
export function paintedCell(target, ground, alpha = CELL_ALPHA) {
  const t = channels(target);
  const g = channels(ground);
  return toHex(t.map((c, i) => (c - g[i] * (1 - alpha)) / alpha));
}

/** `hex` as an `rgba()` string at `alpha`. The one alpha in the stack. */
export function translucent(hex, alpha) {
  return `rgba(${channels(hex).join(',')},${alpha})`;
}

// ---- the grain and the tracks --------------------------------------------

/** One fleck per this many square points, so density is the same everywhere. */
const GRAIN_AREA = 3200;
/** One set of tracks per this many, which is a great deal sparser. */
const TRACK_AREA = 26000;
const TOES = 4;
/** Half a turn, in degrees. A print may point anywhere, so it draws twice. */
const HALF_TURN = 180;

const clampCount = (area, per, cap) => Math.max(1, Math.min(cap, Math.round(area / per)));

/**
 * AC-1510: a run's ground is drawn from the RUN'S SEED and is fixed within the
 * run. No motion, ever — the only animated thing on the board is the game.
 *
 * Returns plain numbers. Turning them into views is the component's job, and
 * keeping the arithmetic on this side is what lets `node --test` assert that
 * two boards with the same seed have the same ground and two with different
 * seeds do not.
 *
 * @param {number|string} seed the run's seed
 * @param {number} width  the region's width in points
 * @param {number} height the region's height in points
 * @param {{grainCap?: number, trackCap?: number}} [limits]
 * @returns {{grain: object[], tracks: object[]}}
 */
export function textureFor(seed, width, height, limits = {}) {
  const { grainCap = 96, trackCap = 7 } = limits;
  if (!(width > 0) || !(height > 0)) return { grain: [], tracks: [] };
  const area = width * height;

  let rng = makeRng(`ground:${seed}`);
  const draw = () => {
    const step = nextFraction(rng);
    rng = step.rng;
    return step.value;
  };

  const grain = [];
  const flecks = clampCount(area, GRAIN_AREA, grainCap);
  for (let i = 0; i < flecks; i += 1) {
    // Long, thin and tilted: dry earth and paper fibre are directional, and a
    // field of round dots reads as noise rather than as a surface.
    const length = 5 + draw() * 13;
    grain.push({
      key: `g${i}`,
      x: draw() * width,
      y: draw() * height,
      width: length,
      height: 1 + draw() * 1.5,
      rotate: Math.round(draw() * HALF_TURN - HALF_TURN / 2),
    });
  }

  const tracks = [];
  const sets = clampCount(area, TRACK_AREA, trackCap);
  for (let i = 0; i < sets; i += 1) {
    const x = draw() * width;
    const y = draw() * height;
    const rotate = Math.round((draw() * 2 - 1) * HALF_TURN);
    const size = 2.5 + draw() * 2;
    const toes = [];
    for (let t = 0; t < TOES; t += 1) {
      // Three toes over a pad: a print, not a constellation.
      const angle = t < 3 ? (t - 1) * 0.9 : 0;
      const reach = t < 3 ? size * 2.1 : 0;
      toes.push({
        key: `t${t}`,
        x: Math.sin(angle) * reach,
        y: -Math.cos(angle) * reach,
        size: t < 3 ? size : size * 1.5,
      });
    }
    tracks.push({ key: `p${i}`, x, y, rotate, toes });
  }

  return { grain, tracks };
}
