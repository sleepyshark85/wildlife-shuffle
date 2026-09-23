// The four unlocks (gameplay.md §9, AC-1009 to AC-1011).
//
// PURE, and deliberately downstream of everything: this module imports the
// theme tokens and the engine's species table, and NOTHING imports it except
// the presentation layer. That is how AC-1011 — "changes only appearance and
// has no effect on any rule, spawn, or score" — is made structural rather than
// promised. The engine cannot see a cosmetic because the engine has no path to
// this file, and a hygiene test asserts that.
//
// `cosmeticsFor` returns a NEW object every time and never writes to the theme
// tokens it reads. A cosmetic that mutated `THEME.dark.species` would be a global
// the engine's own species table sits next to, which is v1's mutable-module-
// global defect wearing a different hat (docs/v1-review.md A3). A test plants
// exactly that mutation.
//
// Four, kept deliberately small: four things that certainly ship beats twelve
// that half-ship (gameplay.md §9).

import { DRAWABLE, SPECIES } from '../engine/constants.js';
import { DEFAULT_THEME, THEME, themeFor } from './theme.js';

// A slot holds at most one applied cosmetic, so two animal sets cannot both be
// on: `theme` repaints the board, `palette` the species ramp, `animals` the
// glyphs. They are applied in that order, which is why an animal set may set an
// edge without the palette and the set fighting over one value.

/**
 * AC-1010: every locked item shows an explicit numeric counter toward its
 * condition. `progress` and `need` are what the Collection screen prints —
 * "7 / 10 buffalo retired" — because a locked item that does not tell you how
 * close you are is not a goal, it is a tease (gameplay.md §9).
 *
 * Every counter comes off the persisted save, which comes off the engine's own
 * `runRecord`. Nothing here counts anything itself (AC-706b).
 */
export const UNLOCKS = Object.freeze([
  Object.freeze({
    id: 'nightSavanna',
    name: 'Night Savanna',
    kind: 'Board theme',
    slot: 'theme',
    need: 10,
    unit: 'buffalo retired',
    blurb: 'The board after dark.',
    progress: (save) => save.lifetime.buffaloRetired,
  }),
  Object.freeze({
    id: 'tundraPalette',
    name: 'Tundra',
    kind: 'Palette',
    slot: 'palette',
    need: 25000,
    unit: 'best score in one run',
    blurb: 'One cold hue, size still the only thing that changes.',
    /**
     * AC-320e. This read `Math.max(...Object.values(save.best).map((b) =>
     * b.score), 0)` while `best` was a map of three habitats. Against the
     * single record set of AC-320d that is `Math.max(NaN, NaN, NaN, NaN, 0)` —
     * `NaN` — so the Collection screen would have shown a progress counter that
     * is not a number and this palette would silently never have unlocked.
     *
     * It is a reminder that a shape change has consumers a grep for the type's
     * NAME does not find: nothing here said "difficulty".
     */
    progress: (save) => save.best.score,
  }),
  Object.freeze({
    id: 'ratKing',
    name: 'Rat King',
    kind: 'Animal set',
    slot: 'animals',
    need: 500,
    unit: 'rows cleared',
    blurb: 'Every animal is a rat. Some rats are very large.',
    progress: (save) => save.lifetime.rows,
  }),
  Object.freeze({
    id: 'goldenHerd',
    name: 'Golden Herd',
    kind: 'Animal set',
    slot: 'animals',
    need: 4,
    unit: 'rows in a single step',
    blurb: 'Gilded edges, and everyone is an elk.',
    progress: (save) => save.lifetime.mostRowsInStep,
  }),
]);

const BY_ID = Object.freeze(Object.fromEntries(UNLOCKS.map((u) => [u.id, u])));

/**
 * ui.md §4.3's rule survives every palette: lightness descends with size, and
 * the buffalo stays off the ramp. AC-908 asks that size remain determinable
 * from width and panel count alone, so a palette may not encode size in hue —
 * this one uses a single hue and nothing else, which is that rule taken to its
 * conclusion rather than an exception to it.
 *
 * ONE VALUE PER RAMP, since ui.md §16.4. This shipped as a single table over a
 * single ground, and a second ground is a ground nobody measured against: the
 * dark table on bone left the rat at 1.13:1 on fill and 1.29:1 on edge, which
 * is under the floor on both and is a rat nobody can see. The values are
 * `docs/v2/theme-contrast.mjs`'s, which sweeps every cosmetic against every
 * ground a player can assemble; `test/theme.test.js` sweeps the same product
 * through THIS function, so the table and the sweep cannot part company.
 *
 * `glyph` is the exception and stays one value per species: it is emoji ink,
 * it is decorative by design (§5.2 cue 4), and the only TEXT on an animal is
 * the size numeral, which AC-905b put on its own solid chip precisely so it
 * stops depending on the fill beneath it.
 */
const PALETTES = Object.freeze({
  tundraPalette: Object.freeze({
    dark: Object.freeze({
      rat: Object.freeze({ fill: '#E4EEFA', edge: '#B4C8DE', glyph: '#22303F' }),
      fox: Object.freeze({ fill: '#A8C4E0', edge: '#7B9DBE', glyph: '#1B2836' }),
      elk: Object.freeze({ fill: '#6C90B2', edge: '#4C6C8C', glyph: '#0E1A26' }),
      elephant: Object.freeze({ fill: '#5C77A7', edge: '#455D85', glyph: '#DCE6F2' }),
    }),
    light: Object.freeze({
      rat: Object.freeze({ fill: '#8CB0DE', edge: '#2963AB', glyph: '#22303F' }),
      fox: Object.freeze({ fill: '#6190BE', edge: '#2D5781', glyph: '#1B2836' }),
      elk: Object.freeze({ fill: '#4D7192', edge: '#2E4963', glyph: '#EFF4EA' }),
      elephant: Object.freeze({ fill: '#3A4F6D', edge: '#263851', glyph: '#DCE6F2' }),
    }),
  }),
});

/**
 * A board theme repaints the ground the animals stand on and nothing else.
 *
 * `ramp` is the one thing it also carries, and it is not decoration: AC-1503
 * asks that every species clear 3:1 against THE GROUND IT IS STANDING ON, and
 * a board theme is what changes that ground. Night Savanna is a dark ground by
 * definition — "the board after dark" — so the animals on it are the dark
 * ramp whichever theme the rest of the app is wearing. Measured, with the
 * light ramp on `#151026`: elephant 1.79:1 on fill and 1.15:1 on edge, which
 * is an elephant nobody can see. It names an existing ramp rather than a new
 * palette, so this is a wiring decision and not a colour one.
 */
const BOARD_THEMES = Object.freeze({
  nightSavanna: Object.freeze({
    board: '#151026',
    cell: '#1B1533',
    cellLine: '#2A2047',
    ramp: 'dark',
  }),
});

/**
 * An animal set changes the glyph, and may gild the edge. Nothing else.
 *
 * The gild is the THEME'S gold rather than a literal, for AC-1505's reason
 * exactly: `#E8B44A` on bone is 1.9:1, so a Golden Herd applied in the light
 * theme would have replaced every edge — the thing carrying the visibility
 * floor for the rat and the fox — with one that does not pay it. `lastStand`
 * is already the token that means "this gold, on this ground".
 */
const ANIMAL_SETS = Object.freeze({
  ratKing: Object.freeze({ glyph: SPECIES.rat.emoji, gild: false }),
  goldenHerd: Object.freeze({ glyph: SPECIES.elk.emoji, gild: true }),
});

/** AC-1009: which of the four the save's counters have earned. */
export function unlockedIds(save) {
  return UNLOCKS.filter((u) => u.progress(save) >= u.need).map((u) => u.id);
}

/** AC-1010: the four, each with its counter, for the Collection screen. */
export function unlockStatus(save) {
  const applied = save.unlocks.applied;
  return UNLOCKS.map((u) => {
    const progress = Math.min(u.progress(save), u.need);
    return {
      id: u.id,
      name: u.name,
      kind: u.kind,
      slot: u.slot,
      blurb: u.blurb,
      need: u.need,
      unit: u.unit,
      progress,
      unlocked: progress >= u.need,
      applied: applied[u.slot] === u.id,
    };
  });
}

/** AC-1009: earned but never shown. The Game Over sheet announces these once. */
export function pendingAnnouncements(save) {
  const announced = new Set(save.unlocks.announced);
  return unlockedIds(save).filter((id) => !announced.has(id)).map((id) => BY_ID[id]);
}

/**
 * The appearance the presentation layer should draw with.
 *
 * A cosmetic the save claims is applied but the counters have not earned is
 * ignored — the save is the one input to this app that the app did not write,
 * so a tampered `applied` must buy nothing. Same reasoning as the resume
 * replay: what comes off the disk is a request, not an instruction.
 *
 * @returns {{theme: object, colors: object, species: object, glyph: function}}
 *          a fresh object, except `theme`, which is one of the two frozen
 *          singletons on purpose — every consumer of `useTheme()` reads it by
 *          identity, so a new object per save would re-render the whole app
 *          every time a record changed. The frozen tokens are never written to.
 */
export function cosmeticsFor(save) {
  const earned = new Set(unlockedIds(save));
  const pick = (slot) => {
    const id = save.unlocks.applied[slot];
    return id && earned.has(id) && BY_ID[id] && BY_ID[id].slot === slot ? id : null;
  };

  // AC-1501. The theme is a PREFERENCE and the board theme is an UNLOCK, and
  // they compose in that order: the theme decides every surface in the app,
  // and the board theme then repaints three of them.
  const theme = themeFor(save.settings ? save.settings.theme : undefined);
  const board = BOARD_THEMES[pick('theme')] || null;
  const palette = PALETTES[pick('palette')] || null;
  const set = ANIMAL_SETS[pick('animals')] || null;

  // §16.4: the RAMP IN FORCE is what a cosmetic is chosen against, and a board
  // theme is what can change it. One name, read twice — once for the species
  // table and once for the palette's variant — so a palette can never be the
  // one that was measured against the other ground.
  const rampName = board && board.ramp ? board.ramp : theme.name;
  const ramp = THEME[rampName].species;
  const tuning = palette ? palette[rampName] : null;
  const gild = set && set.gild ? THEME[rampName].colors.lastStand : null;
  const species = {};
  for (const type of Object.keys(ramp)) {
    const base = ramp[type];
    const tuned = tuning && tuning[type] ? tuning[type] : base;
    species[type] = gild ? { ...tuned, edge: gild } : { ...tuned };
  }

  const glyphs = {};
  for (const type of Object.keys(SPECIES)) {
    // The buffalo keeps its own glyph: it is the one species whose identity is
    // a rule (§6.4), and an animal set that hid it would be changing what the
    // player can read off the board rather than how it looks.
    glyphs[type] = set && DRAWABLE.includes(type) ? set.glyph : SPECIES[type].emoji;
  }

  return {
    theme,
    colors: board
      ? { ...theme.colors, board: board.board, cell: board.cell, cellLine: board.cellLine }
      : theme.colors,
    species,
    glyph: (type) => glyphs[type] || glyphs.rat,
  };
}

/** The appearance with nothing applied — the value the provider starts at. */
export const BASE_COSMETICS = cosmeticsFor({
  lifetime: { buffaloRetired: 0, rows: 0, mostRowsInStep: 0 },
  best: {},
  unlocks: { announced: [], applied: {} },
  settings: { theme: DEFAULT_THEME },
});
