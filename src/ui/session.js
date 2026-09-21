// Session resume, as a REPLAY (gameplay.md §9, AC-1012 to AC-1022).
//
// PURE. Imports the engine and nothing else — no React, no AsyncStorage, no
// clock. Everything here is `(record) => state | null`, which is what lets
// `node --test` write genuinely corrupt bytes at it rather than mock a
// rejection.
//
// WHY A REPLAY AND NOT A SNAPSHOT. A replay can only ever reconstruct a legal
// board, because the engine produced it. A snapshot can inject a board the
// rules cannot reach — through corruption, a truncated write, or a tampered
// file — and AC-504b's chain guard exists to catch exactly that condition. A
// save file able to CREATE it would be self-defeating. It is also tiny (a
// 70-turn run is well under a kilobyte) and already paid for: the seeded PRNG
// was specified for reproducible bug reports, and the stored replay IS the bug
// report.
//
// WHEN IT IS WRITTEN: on `AppState` transition to inactive/background, and
// nowhere else. Not during a turn, not from the render path — AC-1002 stands
// unamended (`useAppState.js`, and the call site in `GameScreen.js`). The
// trade-off is stated in the design: a hard crash loses the run where v1's
// 1 Hz `setInterval` lost a second. That is accepted, and if it ever bites the
// fix is a write on a turn boundary after a long gap, NOT a timer.

import {
  BOARD,
  CHAIN_GUARD_STEPS,
  DIFFICULTIES,
  DRAWABLE,
  MAX_BATCH_CELLS,
  RAMP_EVERY_TURNS,
  SCORE,
  SEED_BATCHES,
  SPECIES,
  STATUS,
} from '../engine/constants.js';
import { ACTIONS, createRun, reduce } from '../engine/engine.js';

export const RESUME_SCHEMA_VERSION = 1;

/**
 * A replay longer than any real run. A run ends when an animal reaches row 14,
 * and the longest measured run is well under 300 turns; this is a bound on how
 * much work a hostile or corrupt file can ask the launch path to do, not a
 * gameplay parameter.
 */
export const MAX_REPLAY_MOVES = 5000;

/** FNV-1a, 32-bit, as an unsigned base-36 string. Cheap and stable. */
export function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Bump this when a rule changes in a way the constants below cannot see — a
 * different phase order, a different gravity, a changed streak precedence.
 */
const ENGINE_REVISION = 1;

/**
 * AC-1016, and the reason it is not a hand-maintained string.
 *
 * A replay reconstructs a run only under the rules that produced it. A tuning
 * change to bands, weights or scoring would silently rebuild a DIFFERENT run —
 * same seed, same moves, different board — and the player would resume into
 * someone else's game with no way to tell. Losing a run to an app update is
 * acceptable; silently resuming the wrong one is not.
 *
 * So the version is a fingerprint of the tuning surface itself rather than a
 * number somebody has to remember to bump. The designer is retuning the
 * difficulty bands right now: when that lands, every resume written before it
 * is discarded automatically, because `DIFFICULTIES` is in this hash.
 *
 * It also covers AC-1022's "board configuration the build no longer supports":
 * `BOARD` is in the hash, so a resume written at 10 columns cannot be replayed
 * at 9.
 */
export const TUNING_SURFACE = Object.freeze([
  BOARD, DIFFICULTIES, SCORE, SPECIES, DRAWABLE,
  RAMP_EVERY_TURNS, SEED_BATCHES, MAX_BATCH_CELLS, CHAIN_GUARD_STEPS,
]);

/**
 * Exported so the claim above can be EXECUTED rather than asserted: the test
 * retunes a difficulty band in a copy of the surface and watches the version
 * change. "This hash covers the bands" is a comment; this makes it a check.
 */
export function engineVersionFor(surface) {
  return `e${ENGINE_REVISION}.${fnv1a(JSON.stringify(surface))}`;
}

export const ENGINE_VERSION = engineVersionFor(TUNING_SURFACE);

/**
 * A cheap hash of the run's visible state: the board, the tray, the score, the
 * streak and the turn. AC-1017 compares it after the replay and discards on a
 * mismatch.
 *
 * Animal ids are deliberately NOT in it. They are a namespace (AC-214), not
 * board state, and a digest that included them would be asserting a fact the
 * player cannot see while saying nothing more about the board.
 */
export function boardDigest(state) {
  const cell = (a) => `${a.type}:${a.x}:${a.y}:${a.size}`;
  const sort = (list) => list.map(cell).sort().join('|');
  return fnv1a(
    [
      state.turn, state.score, state.streak, state.difficulty,
      sort(state.animals), sort(state.queue),
    ].join('#'),
  );
}

/** AC-1014's move encoding: one entry per RESOLVED turn, and nothing else. */
export function moveOf(action) {
  return action.type === ACTIONS.MOVE
    ? { t: 'M', id: action.id, x: action.x }
    : { t: 'P' };
}

/** Append, tolerating a state that predates the field (the tests build those). */
export function appendMove(moves, action) {
  return [...(moves || []), moveOf(action)];
}

/**
 * Open a run and stamp its `origin` — the two parameters beyond seed and
 * difficulty that `createRun` needs to reproduce it exactly.
 *
 * UNDERSPECIFIED IN THE DESIGN, and reported. gameplay.md §9 lists the record
 * as `{schemaVersion, engineVersion, seed, difficulty, moves[], digest}` with
 * `moves[] = [{t:'M', id, x}|{t:'P'}]`. That is not replayable on its own:
 * animal ids are namespaced by `runIndex` and numbered from `nextAnimalId`
 * (AC-214), both of which are carried across a RESTART, so a run reached by
 * "Play again" mints ids a fresh `createRun` cannot reproduce — and a stored
 * move would then name an animal that does not exist. `origin` is the rest of
 * the starting point, stored so the seed means what it says.
 */
export function openRun({ seed, difficulty, runIndex = 1, nextAnimalId = 1 }) {
  const state = createRun({ seed, difficulty, runIndex, nextAnimalId });
  return { ...state, origin: { runIndex, nextAnimalId }, moves: [] };
}

/**
 * A run state with the last turn's *presentation* stripped off.
 *
 * A resumed run must open at rest. An engine state carries `lastTurn` and the
 * replay `plan` built from it, and the state layer keys the input lock on
 * `lastTurn`'s identity (`useGameRun.js`) — so handing a resumed state back
 * with those still attached would replay the last turn's animation, and its
 * input lock, over a board that has already settled. The board is the same
 * either way; what changes is whether the player watches a turn that happened
 * before they closed the app.
 */
export function atRest(state) {
  const next = { ...state, lastTurn: null, lastAction: null };
  delete next.plan;
  return next;
}

/** The record written on the way out. AC-1014. */
export function buildResume(state) {
  return {
    schemaVersion: RESUME_SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    seed: state.seed,
    difficulty: state.difficulty,
    start: state.origin || { runIndex: state.runIndex, nextAnimalId: 1 },
    moves: state.moves || [],
    digest: boardDigest(state),
  };
}

export function serialiseResume(record) {
  return JSON.stringify(record);
}

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const isIndex = (v) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 1e9;

/**
 * Parse a stored resume. Returns null for anything that is not exactly a
 * resume record — it does not throw, and it does not repair.
 *
 * `engineVersion` is checked HERE, before a single turn is replayed: AC-1016
 * says discarded, NOT replayed, and "replay it and then notice" would be
 * running the wrong rules over the player's moves to find out they are wrong.
 */
export function parseResume(text) {
  if (typeof text !== 'string' || text.length === 0) return null;
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObject(raw)) return null;
  if (raw.schemaVersion !== RESUME_SCHEMA_VERSION) return null;
  if (raw.engineVersion !== ENGINE_VERSION) return null;            // AC-1016
  if (typeof raw.seed !== 'string' && typeof raw.seed !== 'number') return null;
  // Own-property, not `DIFFICULTIES[id]`: `DIFFICULTIES['__proto__']` is
  // `Object.prototype` and therefore truthy. The AC-1022 test found this by
  // putting `__proto__` in the field and watching the record be accepted.
  if (!Object.prototype.hasOwnProperty.call(DIFFICULTIES, raw.difficulty)) return null; // AC-1022
  if (!isObject(raw.start)) return null;
  if (!isIndex(raw.start.runIndex) || !isIndex(raw.start.nextAnimalId)) return null;
  if (typeof raw.digest !== 'string') return null;
  if (!Array.isArray(raw.moves) || raw.moves.length > MAX_REPLAY_MOVES) return null;

  const moves = [];
  for (const move of raw.moves) {
    if (!isObject(move)) return null;
    if (move.t === 'P') {
      moves.push({ t: 'P' });
      continue;
    }
    if (move.t !== 'M') return null;
    if (typeof move.id !== 'string' && typeof move.id !== 'number') return null;
    if (!isIndex(move.x) || move.x >= BOARD.width) return null;
    moves.push({ t: 'M', id: move.id, x: move.x });
  }

  return {
    schemaVersion: raw.schemaVersion,
    engineVersion: raw.engineVersion,
    seed: raw.seed,
    difficulty: raw.difficulty,
    start: { runIndex: raw.start.runIndex, nextAnimalId: raw.start.nextAnimalId },
    moves,
    digest: raw.digest,
  };
}

/**
 * Replay a parsed record back into an engine state, or null.
 *
 * AC-1015 is structural rather than checked: every board this can return came
 * out of `reduce()`, so it is reachable by the rules by construction. There is
 * no path in this function that writes a board.
 *
 * Every discard reason, and why each one is a discard and not a repair:
 *   - a move the engine rejects, or one that does not consume a turn: the
 *     stored run and the replayed run have diverged, so nothing after that
 *     point means anything.
 *   - the run ending mid-replay: a finished run is not a run to resume, and
 *     AC-1020 says the record is cleared when a run ends, so this file should
 *     not exist.
 *   - a digest mismatch (AC-1017).
 *   - anything at all throwing: `createRun` throws on an unknown difficulty and
 *     `moveAnimal` on a missing id, and a launch path may not be the place a
 *     bad file gets to raise.
 */
export function replayResume(record) {
  if (!record) return null;
  try {
    let state = openRun({
      seed: record.seed,
      difficulty: record.difficulty,
      runIndex: record.start.runIndex,
      nextAnimalId: record.start.nextAnimalId,
    });
    for (const move of record.moves) {
      if (state.status !== STATUS.READY) return null;
      const before = state;
      const action = move.t === 'M'
        ? { type: ACTIONS.MOVE, id: move.id, x: move.x }
        : { type: ACTIONS.PASS };
      state = reduce(state, action);
      // A rejected or zero-distance move leaves `lastTurn` alone: the turn did
      // not happen, so the replay is not the run that was saved.
      if (state.lastTurn === before.lastTurn) return null;
    }
    if (state.status !== STATUS.READY) return null;
    if (boardDigest(state) !== record.digest) return null;          // AC-1017
    return atRest({
      ...state,
      origin: { ...record.start },
      moves: record.moves.map((m) => ({ ...m })),
    });
  } catch {
    return null;
  }
}

/** Read a stored blob straight through to a resumable state, or null. */
export function restoreResume(text) {
  return replayResume(parseResume(text));
}
