// Design tokens, verbatim from docs/v2/ui.md §4 and §9. Values are not
// negotiable and are not re-derived anywhere else.

import { SCORE } from '../engine/constants.js';
import { HOLD_TURNS } from '../engine/abilities.js';
// The one place a count is made to agree with its noun (src/ui/format.js).
// It imports nothing, so this stays a leaf that Node can load.
import { plural } from './format.js';

export const COLORS = Object.freeze({
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
  success: '#6FD08C',
  illegal: '#FF5C5C',
  killLine: '#E05260',
  dangerBand: '#2A1D24',
  dangerCellLine: 'rgba(107,47,58,.55)',
  ghostFill: 'rgba(255,194,75,.10)',
  // ui.md §8.2a: the clear flash. White, because it has to read on five
  // saturated species fills at once and nothing else on the board is white.
  flash: '#FFFFFF',
  dangerWash: '#E05260',
  illegalFill: 'rgba(255,92,92,.10)',
  scrim: 'rgba(5,9,13,.72)',
  /**
   * ui.md §13.1/§13.4 — the gold of the fourth charge pip and of the LAST
   * STAND pulse. The same ink as the buffalo's rim, and deliberately: both say
   * "this one is not like the others".
   */
  lastStand: '#E8B44A',
  /** The three banked pips, lit and unlit. */
  pip: '#FFC24B',
  pipEmpty: '#2C3A47',
});

/** ui.md §4.3. Lightness descends with size; buffalo is deliberately off the ramp. */
export const SPECIES_STYLE = Object.freeze({
  rat:      Object.freeze({ fill: '#FFD166', edge: '#D9A83C', glyph: '#4A3708' }),
  fox:      Object.freeze({ fill: '#F58A47', edge: '#C96A2C', glyph: '#46200A' }),
  elk:      Object.freeze({ fill: '#5FA45C', edge: '#427A40', glyph: '#0F2D10' }),
  elephant: Object.freeze({ fill: '#5B6E88', edge: '#3F4F66', glyph: '#DCE6F2' }),
  buffalo:  Object.freeze({ fill: '#8C3B4A', edge: '#E8B44A', glyph: '#FFE3B0' }),
});

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
 * already wrong. A chip needs none: `ink` on `bg` is 16.74:1 whatever is
 * underneath it, by construction. An accessibility aid that itself fails
 * contrast is worse than no aid.
 */
export const NUMERAL = Object.freeze({
  size: 10,
  weight: '600',
  ink: '#EFF4F8',
  chip: '#0D141B',
});

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
 */
export const SILHOUETTE = Object.freeze({
  fill: '#2C3A47',
  edge: '#3C4C5B',
  radius: 3,
  /** 1 pt of daylight between adjacent animals, so outlines never merge. */
  gap: 1,
  buffaloRim: 'rgba(232,180,74,.6)',
  buffaloRimWidth: 1.5,
  /** The faint ox-blood tint that says "this one is different". */
  buffaloFill: '#3A2E38',
});

/**
 * AC-315e: the last 160 ms of the 260 ms arrival, in which the same view
 * resolves from silhouette to animal. It is not a duration the budget owns —
 * the flight already costs `MOTION.arrival` and this runs inside it.
 */
export const HANDOVER_MS = 160;

/**
 * ui.md §5.5 — the origin recess.
 *
 * Expressed as an OVERLAY rather than as a colour, deliberately: "the origin's
 * cells take their existing ground darkened by 55%" is exactly black at 0.55
 * over whatever is there, which is what keeps it correct over the danger
 * band's #2A1D24 as well as the normal #1A2833 without the component ever
 * having to know which one it is standing on.
 */
export const RECESS = Object.freeze({
  /** The ground, darkened by 55%. */
  darken: 'rgba(0,0,0,.55)',
  /** The dragged animal's species fill, at 12%: what ties the hole to the hand. */
  tintAlpha: 0.12,
  /** 1 pt along the top of the footprint: what makes it read as pressed in. */
  topEdge: 'rgba(255,255,255,0.06)',
  topEdgeWidth: 1,
  /** AC-425: High Contrast trades the register for an outline it can see. */
  highContrastEdge: 'rgba(255,255,255,0.7)',
  highContrastWidth: 2,
});

export const SEAM = 'rgba(0,0,0,.22)';
export const SEAM_BUFFALO = 'rgba(232,180,74,.5)';

/** ui.md §9. Nothing off this scale. */
export const SPACE = Object.freeze({ xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 });
export const RADIUS = Object.freeze({
  animal: 6, tray: 6, button: 12, card: 14, sheet: 22, pill: 999,
});

export const TYPE = Object.freeze({
  // Line heights are explicit throughout: the compact HUD is 44 pt and must
  // hold a 30 pt score over a 10 pt label (ui.md §3.2), which only works if the
  // platform's default leading is not allowed to have an opinion.
  display: { fontSize: 34, lineHeight: 38, fontWeight: '800', letterSpacing: -0.7,
             color: COLORS.ink },
  score:   { fontSize: 30, lineHeight: 30, fontWeight: '800', letterSpacing: -0.6,
             color: COLORS.accent, fontVariant: ['tabular-nums'] },
  title:   { fontSize: 22, lineHeight: 26, fontWeight: '700', letterSpacing: -0.2,
             color: COLORS.ink },
  button:  { fontSize: 16, lineHeight: 20, fontWeight: '600', color: COLORS.ink },
  body:    { fontSize: 15, lineHeight: 20, fontWeight: '400', color: COLORS.inkMuted },
  label:   { fontSize: 10, lineHeight: 12, fontWeight: '600', letterSpacing: 1.4,
             color: COLORS.inkDim, textTransform: 'uppercase' },
});

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
