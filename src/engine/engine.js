// The rules engine: (state, action) => state.
//
// Pure. No React, no timers, no Date.now(), no Math.random(), no mutation of the
// state passed in. All randomness comes from the seeded PRNG carried in
// `state.rng`, so the same seed plus the same actions always produce a deeply
// equal result (AC-201, AC-202, AC-214, AC-314).
//
// The six-phase turn of gameplay.md §4 runs to completion inside one reducer
// call. Phase boundaries are reported as ordered events on `state.lastTurn` so
// the presentation layer can animate them; animation is never a source of truth.

import {
  BOARD,
  DEFAULT_DIFFICULTY,
  DIFFICULTIES,
  PHASE,
  SCORE,
  SEED_BATCHES,
  STATUS,
  STREAK_TURNS_AT_CAP,
} from './constants.js';
import {
  MOVE_NOOP,
  MOVE_OK,
  applyGravity,
  buffaloOnBoard,
  checkMove,
  diffRows,
  moveAnimal,
} from './board.js';
import { makeRng } from './rng.js';
import { batchCells, generateBatch } from './spawn.js';
import { resolveClears } from './resolve.js';
import { streakMult } from './scoring.js';
import { summariseEvents } from './summary.js';

export const ACTIONS = Object.freeze({
  MOVE: 'MOVE',
  PASS: 'PASS',
  RESTART: 'RESTART',
});

const EMPTY_STATS = Object.freeze({
  rowsCleared: 0,
  longestChain: 0,
  /** Widest single CLEAR_STEP — the Golden Herd unlock's condition (AC-1009). */
  mostRowsInStep: 0,
  buffaloRetired: 0,
  buffaloShrinks: 0,
  perfectClears: 0,
  longestStreak: 0,
  chainGuardTrips: 0,
});

/** Raise every animal by one row, then place the queued batch verbatim at y = 0. */
function arrive(animals, queue) {
  const risen = animals.map((animal) => ({ ...animal, y: animal.y + 1 }));
  return risen.concat(queue.map((animal) => ({ ...animal, y: 0 })));
}

/**
 * Animal ids are namespaced by the run that minted them, so two runs that are
 * alive at the same moment — a finished one still animating while a new one
 * renders — cannot collide even if the caller reaches for createRun() directly
 * instead of dispatching RESTART (AC-214).
 *
 * Two createRun() calls with the SAME seed and runIndex do produce the same ids,
 * and must: that is the same run, and AC-202/AC-314 require it to replay
 * identically.
 */
export function runIdPrefix(seed, runIndex, difficulty) {
  return `${runIndex}.${makeRng(`${difficulty}:${seed}`).toString(36)}.`;
}

/**
 * Start a run. gameplay.md §8: two arrival batches are applied in sequence so the
 * player opens on a board with something to work with (AC-313).
 *
 * `nextAnimalId` and `runIndex` are carried across restarts so that no two
 * animals in one app session ever share an id (AC-214).
 */
export function createRun({
  seed,
  difficulty = DEFAULT_DIFFICULTY,
  runIndex = 1,
  nextAnimalId = 1,
} = {}) {
  if (seed === undefined || seed === null) {
    throw new Error('createRun requires a seed: the engine has no other source of randomness');
  }
  if (!DIFFICULTIES[difficulty]) throw new Error(`Unknown difficulty: ${difficulty}`);

  const idPrefix = runIdPrefix(seed, runIndex, difficulty);
  let rng = makeRng(seed);
  let nextId = nextAnimalId;
  let animals = [];

  // Two batches, per §8 — and more only if the board would otherwise open empty.
  // Both batches completing row 0 and clearing it happens in about 1 run in 600.
  // At most one extra batch is ever needed: it lands on an empty row 0 and can
  // occupy at most 9 of 10 columns (§5.2 invariant 1), so it cannot clear.
  const maxSeedBatches = SEED_BATCHES + 1;
  for (let i = 0; i < SEED_BATCHES || (animals.length === 0 && i < maxSeedBatches); i++) {
    const generated = generateBatch({
      turn: 1,
      difficulty,
      rng,
      nextId,
      idPrefix,
      allowBuffalo: false,
    });
    rng = generated.rng;
    nextId = generated.nextId;
    animals = applyGravity(arrive(animals, generated.batch));
    // Seeding resolves clears but scores nothing: the run opens at 0 (AC-313d).
    animals = resolveClears(animals, { phase: 'SEED' }).animals;
  }

  const queued = generateBatch({
    turn: 1,
    difficulty,
    rng,
    nextId,
    idPrefix,
    hasBuffaloOnBoard: Boolean(buffaloOnBoard(animals)),
  });

  return {
    seed,
    rng: queued.rng,
    difficulty,
    runIndex,
    idPrefix,
    nextAnimalId: queued.nextId,
    turn: 1,
    status: STATUS.READY,
    animals,
    queue: queued.batch,
    score: 0,
    streak: 0,
    stats: { ...EMPTY_STATS },
    lastAction: null,
    lastTurn: null,
  };
}

function rejected(state, reason, detail) {
  return { ...state, lastAction: { type: 'REJECTED', reason, ...detail } };
}

/**
 * Run one whole turn. Phases execute in exactly this order and no other (AC-204):
 * ACTION -> SETTLE -> ARRIVAL -> JUDGE -> ADVANCE.
 */
function resolveTurn(state, action) {
  const events = [];
  // gameplay.md §7.2: the streak is incremented first and then applied, so the
  // multiplier a clear is paid at is the one that clear just earned (AC-606).
  // A turn that does not clear scores nothing, so this value is unused there.
  const clearingTurns = state.streak + 1;
  const width = BOARD.width;
  const height = BOARD.height;

  let animals = state.animals;

  // ---- PHASE 1 · ACTION -------------------------------------------------
  if (action.type === ACTIONS.MOVE) {
    const before = animals.find((a) => a.id === action.id);
    animals = moveAnimal(animals, action.id, action.x);
    events.push({
      type: 'ACTION',
      phase: PHASE.ACTION,
      action: ACTIONS.MOVE,
      id: action.id,
      fromX: before.x,
      toX: action.x,
      y: before.y,
    });
  } else {
    events.push({ type: 'ACTION', phase: PHASE.ACTION, action: ACTIONS.PASS });
  }

  // ---- PHASE 2 · SETTLE and PHASE 3 · ARRIVAL ---------------------------
  // Both phases end the same way: gravity first, then the clear loop (AC-205).
  const settle = (phase) => {
    const landed = applyGravity(animals);
    events.push({ type: 'GRAVITY', phase, moved: diffRows(animals, landed) });
    animals = landed;

    const resolution = resolveClears(animals, { phase, clearingTurns, width, height });
    animals = resolution.animals;
    events.push(...resolution.events);

    if (resolution.events.length === 0) return;
    if (animals.length === 0) {
      // gameplay.md §7.2: Perfect Clear. Flat +1000, not multiplied (AC-613).
      events.push({ type: 'PERFECT_CLEAR', phase, score: SCORE.perfectClear });
    }
  };

  settle(PHASE.SETTLE);

  const beforeArrival = animals;
  animals = arrive(animals, state.queue);
  events.push({
    type: 'ARRIVAL',
    phase: PHASE.ARRIVAL,
    risenIds: beforeArrival.map((a) => a.id),
    placed: state.queue.map((a) => ({ ...a })),
  });
  settle(PHASE.ARRIVAL);

  // ---- PHASE 4 · JUDGE --------------------------------------------------
  // The only game-over check, and the only place it happens (AC-703, D11).
  const offending = animals.filter((a) => a.y >= BOARD.killLine).map((a) => a.id);
  const gameOver = offending.length > 0;
  events.push({ type: 'JUDGE', phase: PHASE.JUDGE, gameOver, offendingIds: offending });

  // The streak rule needs two facts about this turn. They are read off the same
  // stream by the same function; the authoritative fold happens below, once the
  // ADVANCE event that carries the settled streak exists (AC-706e).
  const outcome = summariseEvents(events);
  const cleared = outcome.clearSteps > 0;
  const perfectClear = outcome.perfectClears > 0;

  // ---- PHASE 5 · ADVANCE ------------------------------------------------
  // turn++ , settle the streak, generate Q(t+1) exactly once (AC-312).
  //
  // Streak precedence, first match wins (AC-609). The streak follows the board,
  // not the input: a pass whose arrival completes a row is a clearing turn like
  // any other, which is why there is no PASS case here.
  //
  // The raw counter keeps climbing past the x3.0 cap on purpose: the pill shows
  // streakMult, the run record keeps the raw count (AC-607b/c). A Perfect Clear
  // is also a clearing turn, so rule 1 raises the streak to at least the cap
  // rather than knocking a longer streak back down to it.
  let advance = null;
  if (!gameOver) {
    let streak;
    if (perfectClear) streak = Math.max(state.streak + 1, STREAK_TURNS_AT_CAP);
    else if (cleared) streak = state.streak + 1;
    else streak = 0;

    const turn = state.turn + 1;
    const queued = generateBatch({
      turn,
      difficulty: state.difficulty,
      rng: state.rng,
      nextId: state.nextAnimalId,
      idPrefix: state.idPrefix,
      hasBuffaloOnBoard: Boolean(buffaloOnBoard(animals)),
    });

    events.push({
      type: 'ADVANCE',
      phase: PHASE.ADVANCE,
      turn,
      streak,
      queue: queued.batch,
    });

    advance = {
      turn,
      streak,
      rng: queued.rng,
      nextAnimalId: queued.nextId,
      queue: queued.batch,
    };
  }

  // ---- one source ---------------------------------------------------------
  // Score and every statistic are read back off the same events[] array
  // (gameplay.md §7.3a, AC-706b/e). Nothing above this line counts anything.
  const turnSummary = summariseEvents(events);

  const stats = {
    rowsCleared: state.stats.rowsCleared + turnSummary.rowsCleared,
    longestChain: Math.max(state.stats.longestChain, turnSummary.longestChain),
    mostRowsInStep: Math.max(state.stats.mostRowsInStep, turnSummary.mostRowsInStep),
    buffaloRetired: state.stats.buffaloRetired + turnSummary.buffaloRetired,
    buffaloShrinks: state.stats.buffaloShrinks + turnSummary.buffaloShrinks,
    perfectClears: state.stats.perfectClears + turnSummary.perfectClears,
    longestStreak: Math.max(state.stats.longestStreak, turnSummary.longestStreak),
    // A tripped crash guard means the engine is broken; the run carries the flag.
    chainGuardTrips: state.stats.chainGuardTrips + turnSummary.guardTrips,
  };

  const base = {
    ...state,
    animals,
    score: state.score + turnSummary.score,
    stats,
    lastAction: { type: action.type, ...(action.type === ACTIONS.MOVE ? { id: action.id, x: action.x } : {}) },
    lastTurn: {
      turn: state.turn,
      action: action.type,
      events,
      score: turnSummary.score,
      cleared,
      perfectClear,
      longestChain: turnSummary.longestChain,
      streakMult: cleared ? streakMult(clearingTurns) : 1,
      gameOver,
    },
  };

  if (gameOver) {
    // The queue was consumed by the Arrival phase; clearing it stops the tray
    // from re-rendering animals that are already on the board.
    return { ...base, status: STATUS.GAME_OVER, queue: [] };
  }

  return { ...base, ...advance };
}

/** The reducer. Pure: never mutates `state`, never touches anything outside it. */
export function reduce(state, action) {
  switch (action.type) {
    case ACTIONS.RESTART:
      return createRun({
        seed: action.seed !== undefined ? action.seed : state.seed,
        difficulty: action.difficulty || state.difficulty,
        runIndex: state.runIndex + 1,
        nextAnimalId: state.nextAnimalId,
      });

    case ACTIONS.PASS:
      if (state.status !== STATUS.READY) return rejected(state, 'not-ready');
      return resolveTurn(state, action);

    case ACTIONS.MOVE: {
      if (state.status !== STATUS.READY) return rejected(state, 'not-ready');
      const verdict = checkMove(state.animals, action.id, action.x, BOARD.width);
      if (verdict === MOVE_NOOP) {
        // A zero-distance drag does not consume the turn (§6.2, AC-402).
        return { ...state, lastAction: { type: 'NOOP', id: action.id, x: action.x } };
      }
      if (verdict !== MOVE_OK) {
        return rejected(state, verdict, { id: action.id, x: action.x });
      }
      return resolveTurn(state, action);
    }

    default:
      return state;
  }
}

// ---- selectors -----------------------------------------------------------

/** Total cells the tray's batch will occupy (AC-315). */
export function queueCells(state) {
  return batchCells(state.queue);
}

/** The buffalo on the board, or undefined — drives the HUD chip (AC-509/510). */
export function currentBuffalo(state) {
  return buffaloOnBoard(state.animals);
}

/** Legal-move predicate for the drag preview (AC-407/408). */
export function canMove(state, animalId, targetX) {
  return checkMove(state.animals, animalId, targetX, BOARD.width) === MOVE_OK;
}

/**
 * What the HUD pill should show. The pill renders the multiplier, never the raw
 * counter, which keeps climbing past the cap so longestStreak can record it
 * (AC-607b). Exposing both here means Slice 2 cannot conflate them.
 */
export function streakPill(state) {
  const mult = streakMult(state.streak);
  return { raw: state.streak, mult, show: mult > 1 };
}

/**
 * Everything the Game Over sheet and the run record need (AC-706, AC-1308).
 *
 * `chainGuardTrips` rides along because AC-504e refuses to persist the score of
 * a run whose crash guard fired, and the thing that decides that must be able
 * to see it without reaching past this selector into `state.stats`.
 */
export function runRecord(state) {
  return {
    seed: state.seed,
    difficulty: state.difficulty,
    score: state.score,
    turns: state.turn,
    rowsCleared: state.stats.rowsCleared,
    longestChain: state.stats.longestChain,
    mostRowsInStep: state.stats.mostRowsInStep,
    buffaloRetired: state.stats.buffaloRetired,
    perfectClears: state.stats.perfectClears,
    // The raw count of consecutive clearing turns, not the multiplier (AC-607c).
    longestStreak: state.stats.longestStreak,
    chainGuardTrips: state.stats.chainGuardTrips,
  };
}
