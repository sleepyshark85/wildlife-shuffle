// The persisted save — records, stats, recent runs, the daily streak, the
// unlocks and the accessibility settings (gameplay.md §9, AC-1003 to AC-1011b).
//
// PURE. This module imports the engine's constants and the theme's own list of
// theme names, and nothing else: no React, no AsyncStorage, no `Date.now()`, no
// `Math.random()`. `theme.js` is a leaf Node can load, and the names are
// imported rather than retyped so a persisted `theme` cannot name a theme this
// build does not have. The calendar day is
// passed in as a string and the wall clock as a number, because a rule that
// reads its own clock cannot be tested against a day boundary — and the daily
// streak is exactly a day-boundary rule.
//
// Why so much validation. Storage is the one part of this app whose input was
// not produced by this app: a blob survives the process, the app update and the
// player's file system. AC-1005 (corrupt) and AC-1006 (old schema) are the main
// event here rather than edge cases, so every field that comes back off the
// disk is checked, and a blob that fails ANY check is discarded whole. "Never
// partially applied" is the AC's own wording, and half a save is worse than no
// save: it is a save that looks trustworthy.

import { DEFAULT_THEME, isThemeName } from './theme.js';

/**
 * AC-1006. Version 2 added the sound and haptics preferences; version 3 added
 * `onboarded`; version 4 added `settings.theme` (AC-1501); version 5 collapsed
 * the three per-habitat record sets into one and dropped `difficulty` from the
 * recent-runs list (AC-320d). `migrate()` below carries an older blob forward
 * rather than discarding it, which is the half of AC-1006 that had never been
 * exercised — and AC-1006b is why every step ships with a test that plants a
 * fault in it and watches the save be discarded rather than half-applied.
 */
export const SAVE_SCHEMA_VERSION = 5;

/** v1's StatsPanel.js listed ten, and ten is what AC-1011b asks for. */
export const RECENT_RUNS = 10;

/**
 * Every persisted preference, with the value a player who has never opened
 * Settings gets. AC-906b persists the three accessibility toggles of ui.md §10;
 * AC-1104 adds Sound and Haptics.
 *
 * The defaults are not uniform any more, and that is the point: the three
 * accessibility toggles are departures from the default presentation and start
 * OFF, while Sound and Haptics are the game working normally and start ON. A
 * game that shipped silent until the player found a switch would read as broken
 * rather than as considerate.
 *
 * AC-1501 adds `theme`, and it is the first preference that is not a boolean.
 * Its default is LIGHT: the owner did not ask for an option, they asked for
 * bright, so the game opens bright and dark is the setting.
 */
export const SETTING_DEFAULTS = Object.freeze({
  sizeNumerals: false,
  highContrast: false,
  reduceMotion: false,
  sound: true,
  haptics: true,
  theme: DEFAULT_THEME,
});

const SETTING_KEYS = Object.freeze(Object.keys(SETTING_DEFAULTS));

/**
 * What each preference is allowed to be, off the disk.
 *
 * A table rather than `typeof value === 'boolean'` for all of them: `theme` is
 * a string that names one of exactly two themes, and a blob claiming
 * `theme: "__proto__"` or `theme: "midnight"` must be refused like any other
 * value this app did not write. A key with no entry here is refused too, which
 * is what stops a new default being added without a rule for reading it back.
 */
const isBoolean = (v) => typeof v === 'boolean';
/**
 * `SETTING_IS_VALID[key]` is not a membership test, for the reason AC-1022's
 * `__proto__` case recorded: `SETTING_IS_VALID['__proto__']` is
 * `Object.prototype`, which is truthy and is not a function. Found by the
 * AC-1501 test putting `__proto__` in `withSettings`, where it threw rather
 * than being refused.
 */
const settingRule = (key) =>
  (Object.prototype.hasOwnProperty.call(SETTING_IS_VALID, key) ? SETTING_IS_VALID[key] : null);
const SETTING_IS_VALID = Object.freeze({
  sizeNumerals: isBoolean,
  highContrast: isBoolean,
  reduceMotion: isBoolean,
  sound: isBoolean,
  haptics: isBoolean,
  theme: isThemeName,
});

/**
 * The three cosmetic slots (`src/ui/cosmetics.js`). Listed here because this is
 * the module that validates what came off the disk, and an unknown key must be
 * refused rather than assigned: `applied['__proto__'] = 'x'` on a plain object
 * is a prototype write, not a field.
 */
export const COSMETIC_SLOTS = Object.freeze(['theme', 'palette', 'animals']);

/**
 * ONE record set. AC-1008 names exactly these four, and AC-320d is why there is
 * one of them: there is one curve, so there is one thing a best can be a best
 * at.
 */
const BEST_KEYS = Object.freeze(['score', 'chain', 'turns', 'rows']);

/** gameplay.md §9 "Lifetime". `mostRowsInStep` is the Golden Herd condition. */
const LIFETIME_KEYS = Object.freeze([
  'games', 'turns', 'rows', 'buffaloRetired', 'perfectClears', 'mostRowsInStep',
]);

const zeros = (keys) => Object.fromEntries(keys.map((k) => [k, 0]));

export function defaultSave() {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    /**
     * AC-1207. One boolean, in the save the player already has, rather than a
     * second store beside it: onboarding runs once, and "has it run?" is a fact
     * about this player's progress like every other fact in here. A parallel
     * key would be a second source for one truth (§6.3) and would survive a
     * "clear my data" that this one does not.
     *
     * It is set on completion AND on skip, because AC-1207 names both and
     * because a tutorial that reappears after you dismissed it is worse than
     * one that never ran.
     */
    onboarded: false,
    best: zeros(BEST_KEYS),
    lifetime: zeros(LIFETIME_KEYS),
    recent: [],
    streak: { count: 0, lastDay: null },
    unlocks: { announced: [], applied: {} },
    settings: { ...SETTING_DEFAULTS },
  };
}

// ---- reading what came off the disk --------------------------------------

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const isCount = (v) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 1e15;

/** `YYYY-MM-DD`, and nothing else. A day key is compared, never parsed loosely. */
export function isDayKey(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function readCounts(raw, keys) {
  if (!isObject(raw)) return null;
  const out = {};
  for (const key of keys) {
    if (!isCount(raw[key])) return null;
    out[key] = raw[key];
  }
  return out;
}

function readRecent(raw) {
  if (!Array.isArray(raw) || raw.length > RECENT_RUNS) return null;
  const out = [];
  for (const entry of raw) {
    if (!isObject(entry)) return null;
    if (!isCount(entry.score) || !isCount(entry.turns) || !isCount(entry.at)) return null;
    if (!isDayKey(entry.day)) return null;
    // No `difficulty` (AC-320c/AC-1008b). A label naming a mode that no longer
    // exists makes the older entries unreadable rather than informative, so it
    // is dropped on the way in as well as on the way out — a field nobody may
    // branch on is a field that will be branched on.
    out.push({ day: entry.day, at: entry.at, score: entry.score, turns: entry.turns });
  }
  return out;
}

/**
 * Bring an older blob up to the current schema, or hand it back untouched.
 *
 * Four steps now, applied IN SEQUENCE rather than as a switch on the stored
 * version: a version-1 blob has to become a version-2 blob, then a version-3
 * one, then a version-4 one, then a version-5 one, and a `if (v === 1) return
 * {...v5}` would have to know about every future step at once. Each step below
 * knows only about its own, which is what made adding the fifth a short
 * change.
 *
 * Step 1 -> 2 added `settings.sound` and `settings.haptics` (AC-1104). Step
 * 3 -> 4 added `settings.theme`, and it takes the DEFAULT rather than `dark`:
 * every stored save predates the light theme, so its owner is not somebody who
 * chose dark, only somebody who was never offered anything else. The owner
 * overruled dark-only having played it, and an update that kept existing
 * players in the theme that was overruled would be honouring the old ruling.
 * Step 2 -> 3 added `onboarded`, and it is FALSE for an existing player on purpose:
 * somebody who has been playing since version 1 has demonstrably worked the
 * game out, and a four-beat tutorial dropped in front of them by an update
 * would be the app explaining what they already know. `migrate` cannot see
 * their records from here, so `parseSave`'s caller decides — see `hasPlayed`.
 *
 * It never validates. It produces a candidate and `parseSave` judges it, so a
 * migration that produced nonsense discards the save exactly as a corrupt one
 * does — there is no path on which half of a migration is written back.
 */
const STEPS = [
  // 1 -> 2
  (raw) => ({
    ...raw,
    schemaVersion: 2,
    settings: { ...SETTING_DEFAULTS, ...(isObject(raw.settings) ? raw.settings : {}) },
  }),
  // 2 -> 3
  (raw) => ({ ...raw, schemaVersion: 3, onboarded: false }),
  // 3 -> 4
  (raw) => ({
    ...raw,
    schemaVersion: 4,
    settings: {
      ...(isObject(raw.settings) ? raw.settings : {}),
      theme: SETTING_DEFAULTS.theme,
    },
  }),
  // 4 -> 5. One curve, one record set (gameplay.md §9a, AC-320d).
  //
  // MERGE BY MAXIMUM, per stat. Not reset — deleting somebody's high score
  // because we changed our minds about difficulty is the app punishing the
  // player for our decision. Not the default habitat's alone, which would
  // silently destroy the Meadow best that is almost certainly their largest
  // number. And it is honest to take the maximum in this direction because the
  // curve's band table IS the Meadow row, the easiest of the three: a merged
  // best is a best the player can beat again on the same terms. It would not
  // be honest the other way round, and that asymmetry is why this is a decision
  // rather than a coin toss.
  //
  // It reads whatever shape it finds rather than naming meadow/savanna/tundra:
  // the habitat ids are gone from this build, and a migration that named them
  // would be carrying the concept it exists to remove. A blob whose `best` was
  // already flat migrates to itself.
  (raw) => ({
    ...raw,
    schemaVersion: 5,
    best: mergeBests(raw.best),
    // The four fields `readRecent` keeps, named rather than spread-minus-one:
    // a blob off the disk may carry anything, and copying "everything except
    // difficulty" would carry the anything too.
    recent: Array.isArray(raw.recent)
      ? raw.recent.map((entry) => (isObject(entry)
        ? { day: entry.day, at: entry.at, score: entry.score, turns: entry.turns }
        : entry))
      : raw.recent,
  }),
];

/**
 * Fold any number of stored record sets into one by taking the maximum of each
 * stat. Used only by step 4 -> 5.
 *
 * `migrate` never validates (see below), so this may be handed anything: a flat
 * record set, a map of three, a map of one, or nonsense. It produces a
 * candidate and `parseSave` judges it — a non-numeric field survives as a
 * non-numeric field and the save is then discarded whole rather than
 * half-applied.
 */
function mergeBests(raw) {
  if (!isObject(raw)) return raw;
  // Already flat: a version-4 blob written by a build that had one curve.
  if (BEST_KEYS.some((key) => typeof raw[key] === 'number')) return raw;
  const out = zeros(BEST_KEYS);
  for (const row of Object.values(raw)) {
    if (!isObject(row)) return raw;
    for (const key of BEST_KEYS) {
      if (typeof row[key] !== 'number') return raw;
      out[key] = Math.max(out[key], row[key]);
    }
  }
  return out;
}

export function migrate(raw) {
  if (!isObject(raw)) return raw;
  let out = raw;
  while (
    typeof out.schemaVersion === 'number' &&
    out.schemaVersion >= 1 &&
    out.schemaVersion < SAVE_SCHEMA_VERSION
  ) {
    out = STEPS[out.schemaVersion - 1](out);
  }
  return out;
}

/**
 * Parse a stored save. Returns null for anything that is not exactly a save at
 * the current schema version — the caller then opens on defaults (AC-1005).
 *
 * A wrong `schemaVersion` is not an error here, it is the ordinary path for a
 * player who updated the app. `migrate()` runs in front of the validation,
 * all-or-nothing, and whatever it produces still has to survive every check
 * below — so a migration that got it wrong discards the save rather than
 * half-applying it (AC-1006).
 */
export function parseSave(text) {
  if (typeof text !== 'string' || text.length === 0) return null;
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObject(raw)) return null;
  raw = migrate(raw);
  if (raw.schemaVersion !== SAVE_SCHEMA_VERSION) return null;

  const best = readCounts(raw.best, BEST_KEYS);
  if (!best) return null;

  const lifetime = readCounts(raw.lifetime, LIFETIME_KEYS);
  if (!lifetime) return null;

  const recent = readRecent(raw.recent);
  if (!recent) return null;

  if (!isObject(raw.streak)) return null;
  if (!isCount(raw.streak.count)) return null;
  if (raw.streak.lastDay !== null && !isDayKey(raw.streak.lastDay)) return null;
  if (raw.streak.count > 0 && raw.streak.lastDay === null) return null;

  if (!isObject(raw.unlocks) || !Array.isArray(raw.unlocks.announced)) return null;
  if (!raw.unlocks.announced.every((id) => typeof id === 'string')) return null;
  if (!isObject(raw.unlocks.applied)) return null;
  const applied = {};
  for (const [slot, id] of Object.entries(raw.unlocks.applied)) {
    if (!COSMETIC_SLOTS.includes(slot) || typeof id !== 'string') return null;
    applied[slot] = id;
  }

  if (typeof raw.onboarded !== 'boolean') return null;

  if (!isObject(raw.settings)) return null;
  const settings = {};
  for (const key of SETTING_KEYS) {
    const valid = settingRule(key);
    if (!valid || !valid(raw.settings[key])) return null;
    settings[key] = raw.settings[key];
  }

  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    onboarded: raw.onboarded,
    best,
    lifetime,
    recent,
    streak: { count: raw.streak.count, lastDay: raw.streak.lastDay },
    unlocks: { announced: [...raw.unlocks.announced], applied },
    settings,
  };
}

export function serialiseSave(save) {
  return JSON.stringify(save);
}

// ---- the daily streak (AC-1007) ------------------------------------------

/**
 * The device's LOCAL calendar day as `YYYY-MM-DD`.
 *
 * Built from the Date's local getters rather than `toISOString()`, which is UTC
 * — a run finished at 23:30 in London in July would be filed under the next day
 * and could break a streak the player did not break.
 */
export function dayKey(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Whole days from `from` to `to`, both `YYYY-MM-DD`.
 *
 * Compared at UTC midnight on purpose: these are calendar labels, not instants,
 * so a DST boundary between them must not make two adjacent days 0.96 days
 * apart and round to 0.
 */
export function daysBetween(from, to) {
  const at = (key) => {
    const [y, m, d] = key.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((at(to) - at(from)) / 86400000);
}

/**
 * AC-1007: +1 on the next calendar day, back to 1 after a gap, unchanged on a
 * second run the same day. A "streak freeze" is explicitly out of scope
 * (gameplay.md §9).
 */
export function advanceStreak(streak, today) {
  if (!isDayKey(today)) return streak;
  if (streak.lastDay === today) return streak;
  if (streak.lastDay && daysBetween(streak.lastDay, today) === 1) {
    return { count: streak.count + 1, lastDay: today };
  }
  return { count: 1, lastDay: today };
}

// ---- writing a finished run ----------------------------------------------

/**
 * Fold a finished run's record into the save (AC-1001, AC-1004, AC-1007).
 *
 * `record` is the engine's own `runRecord(state)` — nothing here recounts
 * anything the engine already counted (AC-706b).
 *
 * **AC-504e.** A run whose chain guard tripped is counted as played and counts
 * toward the daily streak, because it *was* played, and nothing else: no high
 * score, no lifetime aggregate, no entry in the recent list. The guard means
 * the engine was in a state the rules do not describe, so the run's numbers are
 * not trustworthy enough to become records — and the lifetime totals feed the
 * unlock conditions, so letting them through would buy an unlock with them.
 *
 * @param {object} save
 * @param {object} record `runRecord(state)`
 * @param {{ day: string, at: number }} when the local calendar day and the wall
 *        clock, both supplied by the caller — see the module comment.
 */
export function applyRunRecord(save, record, when) {
  const { day, at } = when;
  const flagged = record.chainGuardTrips > 0;

  const next = {
    ...save,
    lifetime: { ...save.lifetime, games: save.lifetime.games + 1 },
    streak: advanceStreak(save.streak, day),
  };
  if (flagged) return next;

  const was = save.best;
  next.best = {
    score: Math.max(was.score, record.score),
    chain: Math.max(was.chain, record.longestChain),
    turns: Math.max(was.turns, record.turns),
    rows: Math.max(was.rows, record.rowsCleared),
  };
  next.lifetime = {
    games: next.lifetime.games,
    turns: save.lifetime.turns + record.turns,
    rows: save.lifetime.rows + record.rowsCleared,
    buffaloRetired: save.lifetime.buffaloRetired + record.buffaloRetired,
    perfectClears: save.lifetime.perfectClears + record.perfectClears,
    mostRowsInStep: Math.max(save.lifetime.mostRowsInStep, record.mostRowsInStep),
  };
  // Newest first, ten deep. AC-1011b: the aggregates do not replace this,
  // because a list of your last ten runs is what shows whether you are
  // improving today (ported from v1's StatsPanel.js).
  next.recent = [
    { day, at, score: record.score, turns: record.turns },
    ...save.recent,
  ].slice(0, RECENT_RUNS);
  return next;
}

/** AC-707: was this run's score better than the stored best? */
export function isNewBest(save, score) {
  return score > save.best.score;
}

/**
 * AC-1207. Onboarding is finished — completed or skipped, the save does not
 * record which, because nothing downstream is allowed to treat them
 * differently and a field nobody may branch on is a field that will be
 * branched on.
 */
export function withOnboarded(save) {
  return save.onboarded ? save : { ...save, onboarded: true };
}

/**
 * Has this player played before?
 *
 * AC-1206 says onboarding runs on "a first launch with no stored data", and a
 * migrated version-1 save is stored data. `lifetime.games` is the count the
 * engine wrote, so a returning player is one who has finished at least one run
 * — which is exactly who must not be shown a tutorial by an app update.
 */
export function hasPlayed(save) {
  return save.lifetime.games > 0;
}

/**
 * Write one preference.
 *
 * `Boolean(value)` used to be the whole of this, and it was right while every
 * preference was a switch. `theme` is not, and coercing it would have stored
 * `true` for "light" — the setting saved, the save valid, and the theme wrong
 * on the next launch. An unknown key or an unacceptable value is refused
 * rather than coerced, because the alternative is writing a save this app's
 * own parser would throw away.
 */
export function withSettings(save, key, value) {
  const valid = settingRule(key);
  if (!valid || !valid(value)) return save;
  return { ...save, settings: { ...save.settings, [key]: value } };
}

export function withAnnounced(save, ids) {
  const announced = new Set(save.unlocks.announced);
  for (const id of ids) announced.add(id);
  return { ...save, unlocks: { ...save.unlocks, announced: [...announced] } };
}

export function withApplied(save, slot, id) {
  const applied = { ...save.unlocks.applied };
  if (id === null) delete applied[slot];
  else applied[slot] = id;
  return { ...save, unlocks: { ...save.unlocks, applied } };
}
