// Design tokens, verbatim from docs/v2/ui.md §4 and §9. Values are not
// negotiable and are not re-derived anywhere else.

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
 * `flash` is written as attack + decay rather than as its total because the
 * asymmetry IS the specification (ui.md §8.2a): the fast attack announces and
 * the slow decay is what stops the row reading as abrupt. A single total would
 * lose the only property that matters about it.
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
  flash: FLASH_ATTACK + FLASH_DECAY,
  /** The collapse's opacity fade outlives the structural window (AC-813d). */
  fadePast: 140,
  buffaloCrack: 120,
  scoreCount: 400,
  float: 900,
  shake: 180,

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
  /** The flash's peak opacity on the body, and on the row behind it. */
  flashPeak: 0.92,
  flashRowPeak: 0.22,
  floatRise: 46,
  shakeAmplitude: 4,
  illegalShake: 6,
  dangerPulseLow: 0.05,
  dangerPulseHigh: 0.13,
  /** AC-907: Reduce Motion replaces the pulse with a static wash. */
  dangerStatic: 0.1,
});

/** ui.md §12. The game never apologises and never explains twice. */
export const COPY = Object.freeze({
  idle: 'YOUR MOVE',
  resolving: 'RESOLVING…',
  blocked: 'BLOCKED',
  pass: 'Pass',
  trayLabel: 'NEXT ARRIVAL',
  buffaloShrink: 'BUFFALO −1',
  buffaloDown: 'BUFFALO DOWN  +500',
  perfect: 'PERFECT  +1000',
});
