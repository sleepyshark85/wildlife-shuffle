// Design tokens, verbatim from docs/v2/ui.md §4 and §9. Values are not
// negotiable and are not re-derived anywhere else.

export const COLORS = Object.freeze({
  bg: '#0D141B',
  panel: '#131E28',
  panelSunken: '#0F1A23',
  board: '#16212C',
  cell: '#1A2833',
  cellLine: '#223442',
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

/** ui.md §8, structural timings only. The full table lands with the motion slice. */
export const MOTION = Object.freeze({
  grab: 90,
  snap: 110,
  illegal: 260,
  fall: 200,
  clearStep: 310,
  arrival: 260,
  sheet: 280,
});

/** ui.md §12. The game never apologises and never explains twice. */
export const COPY = Object.freeze({
  idle: 'YOUR MOVE',
  resolving: 'RESOLVING…',
  blocked: 'BLOCKED',
  pass: 'Pass',
  trayLabel: 'NEXT ARRIVAL',
});
