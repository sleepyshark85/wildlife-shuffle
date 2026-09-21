// The persisted save — records, stats, recent runs, the daily streak, the
// unlocks and the accessibility settings (gameplay.md §9, AC-1003 to AC-1011b).
//
// PURE. This module imports the engine's constants and nothing else: no React,
// no AsyncStorage, no `Date.now()`, no `Math.random()`. The calendar day is
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

import { DIFFICULTIES } from '../engine/constants.js';

/** Bumping this discards every existing save (AC-1006). */
export const SAVE_SCHEMA_VERSION = 1;

/** v1's StatsPanel.js listed ten, and ten is what AC-1011b asks for. */
export const RECENT_RUNS = 10;

const DIFFICULTY_IDS = Object.freeze(Object.keys(DIFFICULTIES));

/** The three accessibility toggles of ui.md §10. AC-906b: persisted from here. */
const SETTING_KEYS = Object.freeze(['sizeNumerals', 'highContrast', 'reduceMotion']);

/**
 * The three cosmetic slots (`src/ui/cosmetics.js`). Listed here because this is
 * the module that validates what came off the disk, and an unknown key must be
 * refused rather than assigned: `applied['__proto__'] = 'x'` on a plain object
 * is a prototype write, not a field.
 */
export const COSMETIC_SLOTS = Object.freeze(['theme', 'palette', 'animals']);

/**
 * `DIFFICULTIES[id]` is not a membership test: `DIFFICULTIES['__proto__']` is
 * `Object.prototype`, which is truthy. Every id that came off the disk goes
 * through this. (Found by the AC-1022 test, which put `__proto__` in the
 * difficulty field and watched it be accepted.)
 */
const knownDifficulty = (id) => Object.prototype.hasOwnProperty.call(DIFFICULTIES, id);

/** Per-difficulty records. AC-1008 names exactly these four. */
const BEST_KEYS = Object.freeze(['score', 'chain', 'turns', 'rows']);

/** gameplay.md §9 "Lifetime". `mostRowsInStep` is the Golden Herd condition. */
const LIFETIME_KEYS = Object.freeze([
  'games', 'turns', 'rows', 'buffaloRetired', 'perfectClears', 'mostRowsInStep',
]);

const zeros = (keys) => Object.fromEntries(keys.map((k) => [k, 0]));

export function defaultSave() {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    best: Object.fromEntries(DIFFICULTY_IDS.map((id) => [id, zeros(BEST_KEYS)])),
    lifetime: zeros(LIFETIME_KEYS),
    recent: [],
    streak: { count: 0, lastDay: null },
    unlocks: { announced: [], applied: {} },
    settings: Object.fromEntries(SETTING_KEYS.map((k) => [k, false])),
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
    if (!knownDifficulty(entry.difficulty)) return null;
    if (!isCount(entry.score) || !isCount(entry.turns) || !isCount(entry.at)) return null;
    if (!isDayKey(entry.day)) return null;
    out.push({ difficulty: entry.difficulty, day: entry.day, at: entry.at, score: entry.score, turns: entry.turns });
  }
  return out;
}

/**
 * Parse a stored save. Returns null for anything that is not exactly a save at
 * the current schema version — the caller then opens on defaults (AC-1005).
 *
 * A wrong `schemaVersion` is not an error here, it is the ordinary path for a
 * player who updated the app. There is no migration to run yet because there is
 * only one version; when there is a second, it lands as a `migrate()` step in
 * front of this function, all-or-nothing, never a field-by-field fixup.
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
  if (raw.schemaVersion !== SAVE_SCHEMA_VERSION) return null;

  if (!isObject(raw.best)) return null;
  const best = {};
  for (const id of DIFFICULTY_IDS) {
    const row = readCounts(raw.best[id], BEST_KEYS);
    if (!row) return null;
    best[id] = row;
  }

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

  if (!isObject(raw.settings)) return null;
  const settings = {};
  for (const key of SETTING_KEYS) {
    if (typeof raw.settings[key] !== 'boolean') return null;
    settings[key] = raw.settings[key];
  }

  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
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
  const difficulty = knownDifficulty(record.difficulty) ? record.difficulty : null;

  const next = {
    ...save,
    lifetime: { ...save.lifetime, games: save.lifetime.games + 1 },
    streak: advanceStreak(save.streak, day),
  };
  if (flagged || !difficulty) return next;

  const was = save.best[difficulty];
  next.best = {
    ...save.best,
    [difficulty]: {
      score: Math.max(was.score, record.score),
      chain: Math.max(was.chain, record.longestChain),
      turns: Math.max(was.turns, record.turns),
      rows: Math.max(was.rows, record.rowsCleared),
    },
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
    { difficulty, day, at, score: record.score, turns: record.turns },
    ...save.recent,
  ].slice(0, RECENT_RUNS);
  return next;
}

/** AC-707: was this run's score better than the stored best for its habitat? */
export function isNewBest(save, difficulty, score) {
  const row = knownDifficulty(difficulty) ? save.best[difficulty] : null;
  return Boolean(row) && score > row.score;
}

export function withSettings(save, key, value) {
  return { ...save, settings: { ...save.settings, [key]: Boolean(value) } };
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
