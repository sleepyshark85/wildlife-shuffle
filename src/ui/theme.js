// Design tokens, verbatim from docs/v2/ui.md §4, §9 and §16. Values are not
// negotiable and are not re-derived anywhere else.
//
// THERE ARE TWO OF EVERYTHING NOW (ui.md §16, AC-1501). The owner played the
// TestFlight build and overruled §1's dark-only ruling — "Should have more
// bright theme. Dark is … dark." — so every ground-dependent token is a pair
// and `THEME.light` / `THEME.dark` are the only two objects that hold one.
//
// The shape of the pair matters more than the values:
//
//   **The fill carries the size encoding; the edge carries the visibility
//   floor** (AC-1502/AC-1503). Fill lightness descends with size in BOTH
//   themes, because the ramp is an ordering and an ordering is
//   ground-independent — "heavier is darker" is why it reads at all. What a
//   light ground breaks is narrower: the rat's absolute contrast, 1.68:1 on
//   its fill and 4.05:1 on its edge. So the ≥3:1 floor (WCAG 1.4.11, the
//   non-text floor — these are solid shapes, not glyphs) is specified against
//   the BETTER of the two, and the edge is what pays it.
//
//   Inverting the ramp on light would keep the monotonicity and throw the
//   meaning away. `docs/v2/theme-contrast.mjs` is the executable form of all
//   of this and `test/theme.test.js` asserts that what is below is what that
//   script checks — otherwise the script would be the design agreeing with
//   itself while the app shipped something else.
//
// HOW A COMPONENT USES THIS. Nothing reads a palette at module scope any more.
// `themed()` builds a component's stylesheet ONCE PER THEME at module load —
// there are exactly two and they are static, so this costs nothing at runtime
// and keeps `StyleSheet.create` out of the render path — and the component
// picks one with `useTheme()`. A mutable "current theme" module global was the
// other option and it is v1's defect (docs/v1-review.md A3) wearing a hat.

import { SCORE } from '../engine/constants.js';
import { HOLD_TURNS } from '../engine/abilities.js';
// The one place a count is made to agree with its noun (src/ui/format.js).
// It imports nothing, so this stays a leaf that Node can load.
import { plural } from './format.js';

/**
 * AC-1501. Light is FIRST and light is the default: the owner did not ask for
 * an option, they asked for bright, and a bright theme behind a toggle is not
 * the thing that was asked for. Dark is the setting.
 */
const THEME_NAMES = Object.freeze(['light', 'dark']);
export const DEFAULT_THEME = 'light';

/** Is this a theme this build ships? The save's `theme` field is checked with it. */
export function isThemeName(value) {
  return THEME_NAMES.includes(value);
}

/**
 * ui.md §4.3 and §16.2 — the species ramp, per ground.
 *
 * `glyph` is the ink of the emoji and is decorative by design (§5.2 cue 4);
 * the size NUMERAL does not borrow it, and that is AC-905b's whole point.
 * It flips with the fill's lightness rather than with the theme: on light the
 * rat and the fox are still pale blocks and take dark ink, while the elk,
 * elephant and buffalo have descended past the point where dark ink reads.
 */
const SPECIES_DARK = Object.freeze({
  rat:      Object.freeze({ fill: '#FFD166', edge: '#D9A83C', glyph: '#4A3708' }),
  fox:      Object.freeze({ fill: '#F58A47', edge: '#C96A2C', glyph: '#46200A' }),
  elk:      Object.freeze({ fill: '#5FA45C', edge: '#427A40', glyph: '#0F2D10' }),
  elephant: Object.freeze({ fill: '#5B6E88', edge: '#3F4F66', glyph: '#DCE6F2' }),
  buffalo:  Object.freeze({ fill: '#8C3B4A', edge: '#E8B44A', glyph: '#FFE3B0' }),
});

/**
 * AC-1505: the buffalo's rim is repriced, not dropped. `#E8B44A` on bone is
 * 1.9:1 and would look like a smudge; `#9C6D14` holds 3.44:1 and is still
 * unmistakably metal. It stays the ONLY rimmed piece in either theme, and that
 * — not the specific yellow — is what carries "a different kind of object".
 */
const SPECIES_LIGHT = Object.freeze({
  rat:      Object.freeze({ fill: '#D8A63A', edge: '#8A6416', glyph: '#3A2A06' }),
  fox:      Object.freeze({ fill: '#D4712F', edge: '#94430F', glyph: '#361804' }),
  elk:      Object.freeze({ fill: '#3F7A3E', edge: '#284E27', glyph: '#EFF4EA' }),
  elephant: Object.freeze({ fill: '#3E4F66', edge: '#26303F', glyph: '#DCE6F2' }),
  buffalo:  Object.freeze({ fill: '#7A2E3C', edge: '#9C6D14', glyph: '#FFE3B0' }),
});

const COLORS_DARK = Object.freeze({
  bg: '#0D141B',
  panel: '#131E28',
  panelSunken: '#0F1A23',
  board: '#16212C',
  cell: '#1A2833',
  cellLine: '#223442',
  /** ui.md §10: the High Contrast toggle brightens every cell line to this. */
  cellLineHigh: '#33475A',
  hairline: '#24333F',

  ink: '#EFF4F8',
  inkMuted: '#8DA0B0',
  inkDim: '#5E7183',
  accent: '#FFC24B',
  /** The ink a primary button's label takes ON the accent, never off it. */
  inkOnAccent: '#2A1C00',
  /** The accent at ~12%: selected cards, the streak pill, an applied unlock. */
  accentWash: 'rgba(255,194,75,.12)',
  /**
   * AC-1517: the ink of a LABEL sitting on a washed card.
   *
   * On slate the accent clears 9:1 on its own wash and reads as the card's
   * own voice. On bone it is 4.13:1 — over the 3:1 a mark or a numeral needs
   * and under the 4.5:1 a label needs — so the label becomes `ink` there and
   * the wash keeps saying "selected" on its own. One token rather than a
   * branch inside a component, because the answer depends only on the ground.
   */
  labelOnWash: '#FFC24B',
  /** The same accent as a switch's live track, and as the tray's hazard rule. */
  accentTrack: 'rgba(255,194,75,.5)',
  hazardRule: 'rgba(255,194,75,.45)',
  success: '#6FD08C',
  illegal: '#FF5C5C',
  killLine: '#E05260',
  /** ui.md §7: the kill row's 45° stripes, and §5.4's outline on a body in it. */
  hazardStripe: 'rgba(224,82,96,.13)',
  dangerOutline: 'rgba(224,82,96,.4)',
  dangerBand: '#2A1D24',
  dangerCellLine: 'rgba(107,47,58,.55)',
  ghostFill: 'rgba(255,194,75,.10)',
  // ui.md §8.2a: the clear flash. White, because it has to read on five
  // saturated species fills at once and nothing else on the board is white.
  flash: '#FFFFFF',
  /**
   * The ROW behind the bodies, which is a different problem from the bodies.
   * On slate a white row wash reads at 0.22; on bone a white wash over a bone
   * board is 1.1:1 and would announce nothing, so light's row flash is the
   * accent. Two tokens because they sit on two different grounds, not because
   * anybody wanted two.
   *
   * The light accent is `#975C0F` rather than §16.2's first `#B06B12`: that
   * one measured 3.63:1 on bone and could not carry a 4.5:1 button label in
   * ANY ink (4.36 was the ceiling). `docs/v2/theme-contrast.mjs` now asserts
   * the accent's seven duties directly, and `#975C0F` carries a white label at
   * 5.45:1 and clears 4.5:1 as text on every surface it appears on.
   */
  flashRow: '#FFFFFF',
  dangerWash: '#E05260',
  illegalFill: 'rgba(255,92,92,.10)',
  scrim: 'rgba(5,9,13,.72)',
  /** ui.md §13.3's dim of the board ground under a targeting state. */
  targetScrim: 'rgba(13,20,27,.55)',
  /** The chip a floating score sits on, so it reads over five fills. */
  floatChip: 'rgba(8,13,18,.82)',
  /**
   * AC-1512: High Contrast takes THE GROUND'S OPPOSITE. 2.5 pt white borders
   * vanish on bone, so the one thing that must not be a constant is the white.
   */
  hcEdge: '#FFFFFF',
  hcSeam: 'rgba(255,255,255,.55)',
  /**
   * ui.md §13.1/§13.4 — the gold of the fourth charge pip and of the LAST
   * STAND pulse. The same ink as the buffalo's rim, and deliberately: both say
   * "this one is not like the others". On light that ink is AC-1505's
   * repriced `#9C6D14`, and this follows it rather than keeping a yellow the
   * bone ground would swallow.
   */
  lastStand: '#E8B44A',
  /** ui.md §5.3: the buffalo glows faintly from within, and only it does. */
  buffaloGlow: 'rgba(232,180,74,0.14)',
  /** AC-805: the lift shadow under a grabbed body. */
  grabShadow: 'rgba(0,0,0,0.45)',
  /** The three banked pips, lit and unlit. */
  pip: '#FFC24B',
  pipEmpty: '#2C3A47',
});

/**
 * ui.md §16.2's light surfaces. `#F2EDE3` is warm bone rather than white,
 * because "natural" starts there and white is not a colour found outdoors.
 *
 * `panel` is LIGHTER than the app ground and `panelSunken` is darker, which is
 * the dark theme's relationship reflected rather than copied: raised catches
 * the light, sunken does not, whichever way up the ground is.
 */
const COLORS_LIGHT = Object.freeze({
  bg: '#F2EDE3',
  panel: '#FAF6EC',
  panelSunken: '#E4DDCE',
  board: '#E6DFD2',
  cell: '#DDD5C6',
  cellLine: '#CBC1AE',
  cellLineHigh: '#9A8F79',
  hairline: '#C2B7A2',

  ink: '#1C2A22',
  inkMuted: '#5A6A5E',
  inkDim: '#7D8C81',
  accent: '#975C0F',
  inkOnAccent: '#FFFFFF',
  accentWash: 'rgba(151,92,15,.10)',
  labelOnWash: '#1C2A22',
  accentTrack: 'rgba(151,92,15,.45)',
  hazardRule: 'rgba(151,92,15,.40)',
  success: '#276A3C',
  illegal: '#B3282E',
  killLine: '#A32B36',
  hazardStripe: 'rgba(163,43,54,.14)',
  dangerOutline: 'rgba(163,43,54,.45)',
  dangerBand: '#EBD3CE',
  dangerCellLine: 'rgba(163,43,54,.45)',
  ghostFill: 'rgba(151,92,15,.14)',
  flash: '#FFFFFF',
  flashRow: '#975C0F',
  dangerWash: '#A32B36',
  illegalFill: 'rgba(179,40,46,.12)',
  scrim: 'rgba(40,33,22,.42)',
  targetScrim: 'rgba(40,33,22,.38)',
  floatChip: 'rgba(255,250,240,.92)',
  hcEdge: '#14201A',
  hcSeam: 'rgba(20,32,26,.55)',
  lastStand: '#9C6D14',
  buffaloGlow: 'rgba(156,109,20,0.18)',
  grabShadow: 'rgba(60,48,28,0.30)',
  pip: '#975C0F',
  pipEmpty: '#D3C9B6',
});

/**
 * ui.md §16.3 — the natural background, at AC-1508's ≤ 1.25:1 ceiling.
 *
 * `board` is the pair the ground under the board uses and the pair the script
 * asserts; `app` is a SECOND pair, because Home's ground is the app ground and
 * the board's grain measures 1.26:1 against it — over the ceiling. Same
 * texture, same ceiling, different ground, so different numbers.
 */
const TEXTURE_DARK = Object.freeze({
  grain: '#1B2733',
  tracks: '#1E2B38',
  app: Object.freeze({ grain: '#151F28', tracks: '#17222C' }),
});
const TEXTURE_LIGHT = Object.freeze({
  grain: '#DCD4C5',
  tracks: '#D5CBB8',
  app: Object.freeze({ grain: '#EBE5D8', tracks: '#E7DFCF' }),
});

/**
 * AC-905b: the size numeral sits on its own chip.
 *
 * It used to inherit the species' emoji ink at 0.85 opacity, which failed
 * 4.5:1 on three of the five fills (fox 4.46, elk 3.92, elephant 3.47). Emoji
 * ink is chosen to sit ON an emoji and is decorative by design (§5.2 cue 4,
 * "nothing may depend on it alone"); a numeral cannot borrow that, because the
 * numeral IS the information and it is the affordance somebody turned on
 * because they needed help reading size.
 *
 * Tuning five inks would have needed five correct answers, of which three were
 * already wrong. A chip needs none: the ink on the chip is 16.74:1 on dark and
 * 12.82:1 on light whatever is underneath it, by construction. An
 * accessibility aid that itself fails contrast is worse than no aid.
 *
 * AC-1512: on light it flips to a bone chip with dark ink. Same construction,
 * opposite ground.
 */
const NUMERAL_METRICS = Object.freeze({ size: 10, weight: '600' });
const NUMERAL_DARK = Object.freeze({ ...NUMERAL_METRICS, ink: '#EFF4F8', chip: '#0D141B' });
const NUMERAL_LIGHT = Object.freeze({ ...NUMERAL_METRICS, ink: '#1C2A22', chip: '#F2EDE3' });

/**
 * ui.md §5.5 — the origin recess.
 *
 * AC-1506, and it is CONFIRMED rather than assumed: `darken` is expressed as an
 * OVERLAY rather than as a colour, so "the origin's cells take their existing
 * ground darkened by 55%" is exactly black at 0.55 over whatever is there. The
 * arithmetic is in `test/theme.test.js` — on bone the hole lands at 4.30:1
 * against its own cell and on slate at 1.25:1, so it is a hole in both, and
 * rather more of one on light.
 *
 * `topEdge` is the one part that does NOT survive the flip. A 6% white line
 * along the top reads as a catch of light on slate and as nothing at all on
 * bone, so on light it becomes a shadow — which is the same statement about
 * where the light is coming from, made in the only ink the ground leaves.
 */
const RECESS_DARK = Object.freeze({
  darken: 'rgba(0,0,0,.55)',
  tintAlpha: 0.12,
  topEdge: 'rgba(255,255,255,0.06)',
  topEdgeWidth: 1,
  /** AC-425/AC-1512: High Contrast trades the register for the ground's opposite. */
  highContrastEdge: 'rgba(255,255,255,0.7)',
  highContrastWidth: 2,
});
const RECESS_LIGHT = Object.freeze({
  darken: 'rgba(0,0,0,.55)',
  tintAlpha: 0.12,
  topEdge: 'rgba(0,0,0,0.10)',
  topEdgeWidth: 1,
  highContrastEdge: 'rgba(20,32,26,0.75)',
  highContrastWidth: 2,
});

/**
 * ui.md §6.2 — the tray's silhouettes.
 *
 * A silhouette is LESS SPECIFIC than the animal, not less true (§6.1): it
 * states the footprint and the columns exactly, which is the whole of what a
 * player can plan against, because size is the only property that changes how
 * a piece behaves. The two rules that follow from that are both here rather
 * than in the component:
 *
 *   - `gap` is why AC-315b holds. Two 1-wide shadows side by side must not
 *     paint as one 2-wide shadow, or the preview would be stating a footprint
 *     the batch does not have, which is misrepresentation rather than
 *     withholding.
 *   - buffalo keeps its rim, because a buffalo refuses to clear and hiding
 *     that withholds a RULE rather than a flavour (AC-315c).
 *
 * A shadow is darker than its ground on slate and lighter would be wrong on
 * bone for the same reason the recess is: a silhouette reads as a hole in the
 * light, so it darkens on both.
 */
const SILHOUETTE_METRICS = Object.freeze({
  radius: 3,
  /** 1 pt of daylight between adjacent animals, so outlines never merge. */
  gap: 1,
  buffaloRimWidth: 1.5,
});
const SILHOUETTE_DARK = Object.freeze({
  ...SILHOUETTE_METRICS,
  fill: '#2C3A47',
  edge: '#3C4C5B',
  buffaloRim: 'rgba(232,180,74,.6)',
  /** The faint ox-blood tint that says "this one is different". */
  buffaloFill: '#3A2E38',
});
const SILHOUETTE_LIGHT = Object.freeze({
  ...SILHOUETTE_METRICS,
  fill: '#D3C9B6',
  edge: '#BCB09A',
  buffaloRim: 'rgba(156,109,20,.6)',
  buffaloFill: '#E0CFC9',
});

/** ui.md §9. Nothing off this scale. */
export const SPACE = Object.freeze({ xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 });
export const RADIUS = Object.freeze({
  animal: 6, tray: 6, button: 12, card: 14, sheet: 22, pill: 999,
});

/**
 * ui.md §9's type scale. The METRICS are one object because they do not depend
 * on the ground; only the ink does, and `typeFor` is where the two meet.
 *
 * Line heights are explicit throughout: the compact HUD is 44 pt and must hold
 * a 30 pt score over a 10 pt label (ui.md §3.2), which only works if the
 * platform's default leading is not allowed to have an opinion.
 */
const TYPE_METRICS = Object.freeze({
  display: { fontSize: 34, lineHeight: 38, fontWeight: '800', letterSpacing: -0.7, ink: 'ink' },
  score:   { fontSize: 30, lineHeight: 30, fontWeight: '800', letterSpacing: -0.6, ink: 'accent',
             fontVariant: ['tabular-nums'] },
  title:   { fontSize: 22, lineHeight: 26, fontWeight: '700', letterSpacing: -0.2, ink: 'ink' },
  button:  { fontSize: 16, lineHeight: 20, fontWeight: '600', ink: 'ink' },
  body:    { fontSize: 15, lineHeight: 20, fontWeight: '400', ink: 'inkMuted' },
  label:   { fontSize: 10, lineHeight: 12, fontWeight: '600', letterSpacing: 1.4, ink: 'inkDim',
             textTransform: 'uppercase' },
});

function typeFor(colors) {
  const out = {};
  for (const [name, { ink, ...rest }] of Object.entries(TYPE_METRICS)) {
    out[name] = Object.freeze({ ...rest, color: colors[ink] });
  }
  return Object.freeze(out);
}

/**
 * The two grounds, and the only two objects a component may read a colour from.
 *
 * `name` is on the theme because it is the key `themed()` picks a stylesheet
 * with, and because a component that has to ask "which theme is this" must get
 * the answer from the theme rather than from a second source.
 */
export const THEME = Object.freeze({
  light: Object.freeze({
    name: 'light',
    colors: COLORS_LIGHT,
    species: SPECIES_LIGHT,
    texture: TEXTURE_LIGHT,
    numeral: NUMERAL_LIGHT,
    recess: RECESS_LIGHT,
    silhouette: SILHOUETTE_LIGHT,
    seam: 'rgba(0,0,0,.22)',
    seamBuffalo: 'rgba(156,109,20,.75)',
    type: typeFor(COLORS_LIGHT),
  }),
  dark: Object.freeze({
    name: 'dark',
    colors: COLORS_DARK,
    species: SPECIES_DARK,
    texture: TEXTURE_DARK,
    numeral: NUMERAL_DARK,
    recess: RECESS_DARK,
    silhouette: SILHOUETTE_DARK,
    seam: 'rgba(0,0,0,.22)',
    seamBuffalo: 'rgba(232,180,74,.5)',
    type: typeFor(COLORS_DARK),
  }),
});

/** The theme a stored preference names, or the default for anything else. */
export function themeFor(name) {
  return THEME[name] || THEME[DEFAULT_THEME];
}

/**
 * A component's stylesheet, built once for each theme at module load.
 *
 * There are exactly two themes and both are static, so building both up front
 * costs one extra `StyleSheet.create` per component file and nothing at all
 * per render — and it keeps `StyleSheet.create` out of the render path, which
 * is where a naive `useMemo(() => StyleSheet.create(...), [theme])` would put
 * it. The component then picks with `styles[theme.name]`.
 *
 * `themed` itself imports no renderer: the factory is the component's, so
 * theme.js stays a module `node --test` can load (§6.7).
 */
export function themed(factory) {
  return Object.freeze({ light: factory(THEME.light), dark: factory(THEME.dark) });
}

/**
 * Relative luminance, WCAG 2.1 §1.4.3, and the contrast ratio built on it.
 *
 * `contrast` is exported so AC-905b and AC-909 can be *computed* in the tests
 * rather than
 * asserted as a hex code somebody eyeballed. The size numeral's old ink passed
 * review and failed the arithmetic on three species out of five.
 */
function luminance(hex) {
  const value = parseInt(hex.slice(1), 16);
  const channel = (c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel((value >> 16) & 255) +
    0.7152 * channel((value >> 8) & 255) +
    0.0722 * channel(value & 255)
  );
}

/** WCAG contrast ratio between two opaque colours. */
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**

/**
 * ui.md §5.4: the grabbed edge brightens 12%.
 *
 * It lives with the tokens rather than with the component because it produces a
 * token — the lit twin of a species edge — and because a worklet may only read
 * values that were computed before it ran, so the result has to be a constant
 * by the time the gesture starts.
 */
export function brighten(hex, amount) {
  const value = parseInt(hex.slice(1), 16);
  const lift = (channel) => Math.min(255, Math.round(channel * (1 + amount)));
  const r = lift((value >> 16) & 255);
  const g = lift((value >> 8) & 255);
  const b = lift(value & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}


/**
 * AC-315e: the last 160 ms of the 260 ms arrival, in which the same view
 * resolves from silhouette to animal. It is not a duration the budget owns —
 * the flight already costs `MOTION.arrival` and this runs inside it.
 */
export const HANDOVER_MS = 160;

/**
 * ui.md §5.4's 12% lift on the grabbed edge, in the direction the ground
 * allows.
 *
 * Brightening is not the property; SEPARATING FROM THE GROUND is. On slate the
 * edges are lighter than the board and 12% brighter is 12% further away from
 * it. On bone the edges are the darkest thing in the frame, so brightening
 * them would walk the lit edge TOWARDS the ground and the one piece of
 * feedback that says "this is the one in your hand" would fade as it lifted.
 * Same 12%, same statement, opposite sign.
 *
 * It lives with the tokens rather than with the component because it produces
 * a token — the lit twin of a species edge — and because a worklet may only
 * read values that were computed before it ran, so the result has to be a
 * constant by the time the gesture starts. The 12% itself is passed in rather
 * than read from `MOTION_SIZE` here, so the normative number stays one a
 * COMPONENT reads and the AC-814 audit can still see it.
 */
export function edgeLit(edge, theme, amount) {
  return brighten(edge, theme.name === 'light' ? -amount : amount);
}


/**
 * ui.md §8 — the whole motion table, and the only copy of it.
 *
 * Every value here is read by something. A normative duration sitting in this
 * object unused would mean the spec's number and the shipped number are free to
 * disagree, which is the failure mode §8 exists to prevent.
 *
 * The flash is here as attack and decay, and NOT as the 320 ms total the ACs
 * quote. Two reasons. The asymmetry is the specification (ui.md §8.2a) — the
 * fast attack announces, the slow decay is what stops the row reading as
 * abrupt — so a single total loses the only property that matters. And the
 * total is a consequence of two numbers that do ship, which means it cannot
 * disagree with them; a third copy could. The AC-814 audit found it sitting
 * here read by nothing, which is exactly what that audit is for.
 */
const FLASH_ATTACK = 60;
const FLASH_DECAY = 260;

export const MOTION = Object.freeze({
  // --- structural: these gate input (ui.md §8.1) ------------------------
  snap: 110,
  fall: 200,
  /** The leading beat, first clear step of a resolution only (AC-813). */
  lead: 80,
  collapse: 110,
  /** collapse + fall: what one cascade step costs the budget. */
  clearStep: 310,
  arrival: 260,
  buffaloShrink: 260,

  // --- announcements: these never gate input ---------------------------
  grab: 90,
  illegal: 260,
  squash: 140,
  flashAttack: FLASH_ATTACK,
  flashDecay: FLASH_DECAY,
  /** The collapse's opacity fade outlives the structural window (AC-813d). */
  fadePast: 140,
  buffaloCrack: 120,
  scoreCount: 400,
  float: 900,
  shake: 180,

  // --- Layer D, special abilities (ui.md §13.4) -------------------------
  // All four are ANNOUNCEMENTS over an ordinary structural resolution, which
  // is why none of them appears in the §8.2 input-lock budget (AC-1417): the
  // turn they decorate is a turn the engine already resolved, and the lock is
  // scaled from the clears, the arrival and the falls exactly as before.
  /** The burrowed animal dissolves downward — the rat's own vanishing act. */
  burrow: 260,
  /** Rows slide left in a stagger from the bottom up, one row per beat. */
  stampedeStagger: 120,
  /** A pip fills with a bloom when a threshold is crossed. */
  pipBloom: 300,
  /** Last Stand's is slower and its own, because it is not a reward. */
  lastStandBloom: 400,

  // --- ambient ----------------------------------------------------------
  dangerPulse: 1200,

  // --- sheets -----------------------------------------------------------
  sheet: 280,
  sheetOut: 220,
  dim: 240,
  sheetDelay: 120,

  /**
   * ui.md §8.4. Reduce Motion turns every transform into a cross-fade of at
   * most this long. It is a CEILING applied to each duration, not a
   * replacement for the schedule: cascade steps keep their §8.2 start times so
   * the chain stays countable.
   */
  reduced: 120,
});

/** ui.md §8: the geometry the numbers above move, kept beside them. */
export const MOTION_SIZE = Object.freeze({
  grabScale: 1.04,
  grabLift: 2,
  /** ui.md §5.4: the grabbed edge brightens by this fraction. */
  edgeBrighten: 0.12,
  squashScaleY: 0.86,
  /** AC-813d: cleared animals scale to this and drift this far down. */
  collapseScale: 0.85,
  collapseDrift: 6,
  /** AC-813e: the flash's peak opacity on the body, and on the row behind it. */
  flashPeak: 0.92,
  flashRowPeak: 0.22,
  /**
   * AC-824d, PROVISIONAL: the row an ARRIVAL clear is about to complete washes
   * in across the push-up, so the flash lands somewhere the player is already
   * looking. The engine resolved the turn before the first frame played, so
   * this is true information shown early, not a guess.
   *
   * TWO values, chosen rather than composited. A row about to complete is by
   * definition nearly full, so a uniform band renders as a lit gap whatever
   * its nominal alpha — and the gap IS the better cue, because it is where the
   * arriving animals are about to land. Asking for it deliberately means the
   * gap can be brighter than a 0.10 composite gave while the occupied cells
   * still read as part of one row rather than as floating cells.
   *
   * AC-824d2, and it is a judgement rule rather than a tuning range: `filled`
   * is the lever for row-level presence and `gap` for gap presence. Raising
   * both together makes the empty part shout, which is the failure that turns
   * a focus into a smear.
   */
  anticipateGap: 0.14,
  anticipateFilled: 0.05,
  floatRise: 46,
  shakeAmplitude: 4,
  illegalShake: 6,
  dangerPulseLow: 0.05,
  dangerPulseHigh: 0.13,
  /** AC-907: Reduce Motion replaces the pulse with a static wash. */
  dangerStatic: 0.1,
});

/**
 * ui.md §10 / AC-910d: the HUD keeps its height and trades labels for values.
 *
 * At `xxLarge` and above the 10 pt uppercase labels go — they are the part
 * that fails an accessibility text size AND the expendable part, since a large
 * number under a tiny word reading "SCORE" carries very little — and the
 * values grow into the freed space. VoiceOver is unaffected: the names live on
 * `accessibilityLabel`, never on the visible label (AC-910f).
 *
 * The step is the iOS content-size ladder: body 17 pt goes 17 / 19 / 21 at
 * L / xL / xxL, so xxLarge lands at a font scale of about 1.235.
 */
const HUD_LARGE_STEP = 1.2;
const HUD_SCORE = Object.freeze({ base: 30, large: 40, largeCompact: 34 });

/**
 * AC-910d/AC-910e, as arithmetic rather than as a branch buried in a component.
 *
 * react-native-web hard-codes `fontScale: 1` and ignores `allowFontScaling`
 * entirely, so none of this is observable in the browser — which is exactly
 * why it is a pure function with a test rather than something only a device
 * could ever contradict.
 *
 * @returns {{large:boolean, score:number}} whether the labels go, and the size
 *          the score grows into the space they leave. The HUD's HEIGHT is not
 *          in the answer, because it never changes: the ladder's chrome budget
 *          is what guarantees the board fits, and letting the HUD grow would
 *          spend board rows on chrome for the players least able to afford it.
 */
export function hudScale(fontScale, compact) {
  const large = (fontScale || 1) >= HUD_LARGE_STEP;
  if (!large) return { large: false, score: HUD_SCORE.base };
  return { large: true, score: compact ? HUD_SCORE.largeCompact : HUD_SCORE.large };
}

/** ui.md §12. The game never apologises and never explains twice. */
export const COPY = Object.freeze({
  idle: 'YOUR MOVE',
  resolving: 'RESOLVING…',
  blocked: 'BLOCKED',
  pass: 'Pass',
  trayLabel: 'NEXT ARRIVAL',
  buffaloShrink: 'BUFFALO −1',
  /** Derived: the retirement bonus rose 500 -> 650 and this said 500. */
  buffaloDown: `BUFFALO DOWN  +${SCORE.buffaloRetire}`,
  perfect: 'PERFECT  +1000',

  // ui.md §13. The count of pips is the whole status, so the button needs no
  // label beyond its name.
  abilities: '\u26A1 ABILITIES',
  /** The same control where the bar is too narrow for the word (layout.js). */
  abilitiesGlyph: '\u26A1',
  abilitiesTitle: 'Abilities',
  cancel: 'Cancel',
  lastStand: 'LAST STAND',
  /**
   * AC-1410c. The announce says what was BOUGHT and the tray's counter says
   * what is LEFT, and they are in different units on purpose: `HOLD THE LINE ·
   * 3 TURNS` beside `FROZEN · 2` cannot be read as an off-by-one, where "3"
   * beside "2" in the same unit certainly could. The 3 is derived from
   * HOLD_TURNS so the copy cannot drift from the rule.
   */
  holdAnnounce: `HOLD THE LINE \u00B7 ${plural(HOLD_TURNS, 'TURN', 'TURNS')}`,
});
