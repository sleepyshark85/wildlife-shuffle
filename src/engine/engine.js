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
  ABILITY_CHARGE_CAP,
  ABILITY_THRESHOLDS,
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
  ABILITIES,
  DART_MOVES,
  HOLD_TURNS,
  abilityFault,
  applyAbility,
  inDangerBand,
} from './abilities.js';
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
  /** Layer D. Using one IS the turn's action, never an extra (AC-1406). */
  ABILITY: 'ABILITY',
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
  /** Layer D, folded off the same event stream as everything else (§7.3a). */
  abilitiesUsed: 0,
  chargesEarned: 0,
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
 *
 * `abilities` is AC-1404's explicit switch. The pacing measurement runs with it
 * OFF, because a difficulty curve containing an optional player intervention is
 * not a curve. It used to hold by construction — there was no ability code —
 * and "by construction" stops being a guarantee the moment the code exists, so
 * it is a parameter the measurement passes and a test asserts it passes.
 *
 * It is an input to createRun, which means AC-1014b applies: the resume record
 * carries it (src/ui/session.js `openRun`/`buildResume`), because the record
 * must carry EVERY input createRun consumes and not only the ones that feel
 * like a seed.
 */
export function createRun({
  seed,
  difficulty = DEFAULT_DIFFICULTY,
  runIndex = 1,
  nextAnimalId = 1,
  abilities = true,
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

    // ---- Layer D (gameplay.md §13) ------------------------------------
    /** AC-1404's switch, carried on the run so nothing can read it globally. */
    abilities,
    /** Charges in hand. At most ABILITY_CHARGE_CAP banked; Last Stand may add. */
    charges: 0,
    /**
     * How far up the threshold ladder this run has been paid. It advances only
     * when a charge is actually GRANTED, which is the whole of AC-1405c: cross
     * a threshold while full and the ladder pauses here rather than consuming
     * the rung, so the charge arrives the moment a slot frees.
     */
    ladder: 0,
    /** AC-1408b: once per run, and reconstructed by replay, never stored. */
    lastStand: false,
    /** Turns of suppressed arrival remaining (AC-1410). */
    frozen: 0,
    /** Moves left in a Dart turn; 0 means no Dart is in progress (AC-1407). */
    dart: 0,
    /** Whether any segment of the turn in progress has cleared (Dart only). */
    turnCleared: false,
    turnPerfect: false,
    /**
     * Inputs consumed. It advances on every ACCEPTED action and on nothing
     * else, which is what the session log appends against: keying that on
     * `lastTurn` identity was right while every accepted action resolved a
     * turn, and Dart's arming is an accepted action that resolves none.
     */
    actionSeq: 0,
  };
}

function rejected(state, reason, detail) {
  return { ...state, lastAction: { type: 'REJECTED', reason, ...detail } };
}

/**
 * Grant whatever the ladder and Last Stand owe, as events.
 *
 * Both grants are EVENTS rather than counters, for §7.3a's reason: the HUD's
 * pip bloom, the run's `chargesEarned` statistic and the charge itself all read
 * the same stream, so there is no second place a charge could come from and no
 * sync rule to get wrong.
 *
 * AC-1405c: the `while` stops at the cap WITHOUT advancing `ladder`, so a
 * threshold crossed while full is not consumed — it is still owed, and it is
 * paid the moment a charge is spent. AC-1405d: `score` is not touched here at
 * all, so it keeps accumulating for the record while it stops buying charges.
 *
 * AC-1408b: Last Stand ignores both the score and the cap, once per run, the
 * first time any animal is in the danger band. It is the only grant in the
 * economy that does not ask how well the player has been playing (AC-1408e).
 */
function grantCharges(state, score, animals, events) {
  // AC-1404. The switch gates the GRANTS, not only the spending: Last Stand
  // arrives without being asked, so a measurement run with abilities "off"
  // that still banked charges would have the layer in it after all.
  if (!state.abilities) {
    return { charges: state.charges, ladder: state.ladder, lastStand: state.lastStand };
  }
  const thresholds = ABILITY_THRESHOLDS[state.difficulty];
  let charges = state.charges;
  let ladder = state.ladder;
  let lastStand = state.lastStand;

  while (charges < ABILITY_CHARGE_CAP && ladder < thresholds.length
         && score >= thresholds[ladder]) {
    charges += 1;
    ladder += 1;
    events.push({
      type: 'CHARGE', phase: PHASE.JUDGE, reason: 'ladder',
      threshold: thresholds[ladder - 1], rung: ladder, charges,
    });
  }

  if (!lastStand && inDangerBand(animals)) {
    lastStand = true;
    charges += 1;   // AC-1408c: deliberately past the cap, so it always does something
    events.push({ type: 'CHARGE', phase: PHASE.JUDGE, reason: 'lastStand', charges });
  }

  return { charges, ladder, lastStand };
}

/**
 * Run one turn. Phases execute in exactly this order and no other (AC-204):
 * ACTION -> SETTLE -> ARRIVAL -> JUDGE -> ADVANCE.
 *
 * `complete` is false for the first two moves of a Dart turn (AC-1407). A Dart
 * is still ONE turn — one arrival, one JUDGE, one ADVANCE — so its first two
 * moves run ACTION and SETTLE and stop. Settling between them is what keeps a
 * move meaning the same thing each time: the player's second move is made on
 * the board the first move actually left, not on a board with an animal still
 * hanging where its support used to be.
 */
function resolveTurn(state, action, complete = true) {
  const events = [];
  // gameplay.md §7.2: the streak is incremented first and then applied, so the
  // multiplier a clear is paid at is the one that clear just earned (AC-606).
  // A turn that does not clear scores nothing, so this value is unused there.
  const clearingTurns = state.streak + 1;
  const width = BOARD.width;
  const height = BOARD.height;

  let animals = state.animals;
  let frozen = state.frozen;

  // ---- PHASE 1 · ACTION -------------------------------------------------
  if (action.type === ACTIONS.ABILITY) {
    // AC-1413: the charge is spent HERE, on confirmation, and nowhere earlier.
    // Arming and reading the sheet reach this line only when the player
    // commits, so exploring the system costs nothing.
    const applied = applyAbility(animals, action.ability, action.target);
    animals = applied.animals;
    // AC-1410. The freeze starts NOW rather than next turn: the ability is the
    // rescue you press when the batch in the tray is the one that kills you,
    // and a freeze that lets that batch land has not rescued anything. Three
    // turns arrive with nothing — this one and the two after it.
    if (action.ability === ABILITIES.hold.id) frozen = HOLD_TURNS;
    events.push({
      type: 'ACTION',
      phase: PHASE.ACTION,
      action: ACTIONS.ABILITY,
      ability: action.ability,
      target: action.target === undefined ? null : action.target,
      removedIds: applied.removedIds,
      moved: applied.moved,
      frozen,
    });
  } else if (action.type === ACTIONS.MOVE) {
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

  // A Dart's first two moves stop here: one turn, one arrival, one JUDGE.
  if (!complete) return partialTurn(state, action, events, animals, clearingTurns);

  // AC-1410: a frozen turn has no ARRIVAL phase at all — the board does not
  // rise and the tray's batch is HELD rather than discarded, so the preview
  // contract (AC-301) still holds when the freeze lifts: the batch the tray
  // promised is the batch that eventually lands.
  const arrivalSkipped = frozen > 0;
  const beforeArrival = animals;
  if (arrivalSkipped) {
    frozen -= 1;
    events.push({
      type: 'ARRIVAL',
      phase: PHASE.ARRIVAL,
      frozen: true,
      remaining: frozen,
      risenIds: [],
      placed: [],
    });
  } else {
    animals = arrive(animals, state.queue);
    events.push({
      type: 'ARRIVAL',
      phase: PHASE.ARRIVAL,
      frozen: false,
      remaining: 0,
      risenIds: beforeArrival.map((a) => a.id),
      placed: state.queue.map((a) => ({ ...a })),
    });
  }
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
  // A Dart is one turn, so the streak asks whether THE TURN cleared, not
  // whether its last segment did. `turnCleared` carries the earlier segments.
  const cleared = state.turnCleared || outcome.clearSteps > 0;
  const perfectClear = state.turnPerfect || outcome.perfectClears > 0;

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
    // A frozen turn consumed no batch, so it generates none: the queue, the
    // PRNG and the id counter all stand still. Drawing a replacement would
    // burn the batch the tray is still promising and advance the spawner
    // through turns the board never saw (AC-301, AC-312).
    const queued = arrivalSkipped
      ? { batch: state.queue, rng: state.rng, nextId: state.nextAnimalId }
      : generateBatch({
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
      frozen,
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
  //
  // The charge grant is here, between the two folds, because it needs the
  // turn's score and because the charges it grants are EVENTS the second fold
  // then counts. A run that has just ended grants nothing: the score is already
  // in the record, and a LAST STAND bloom behind the Game Over sheet would be
  // the HUD offering help to a run that cannot use it.
  const granted = gameOver
    ? { charges: state.charges, ladder: state.ladder, lastStand: state.lastStand }
    : grantCharges(state, state.score + outcome.score, animals, events);

  return commit({
    state, action, events, animals, clearingTurns, cleared, perfectClear,
    gameOver, advance, frozen, dart: 0, granted,
  });
}

/**
 * A Dart's first two moves: the turn stays open, so nothing advances and
 * nothing arrives. The board, the score and the ladder all move; the turn
 * number, the streak, the queue and the PRNG do not.
 */
function partialTurn(state, action, events, animals, clearingTurns) {
  const outcome = summariseEvents(events);
  const cleared = state.turnCleared || outcome.clearSteps > 0;
  const perfectClear = state.turnPerfect || outcome.perfectClears > 0;
  const granted = grantCharges(state, state.score + outcome.score, animals, events);
  return commit({
    state, action, events, animals, clearingTurns, cleared, perfectClear,
    gameOver: false, advance: null, frozen: state.frozen, dart: state.dart - 1,
    granted, partial: true,
  });
}

/**
 * Fold the events into the next state. The single place a turn — whole or
 * partial — becomes a value, so the two paths cannot drift apart.
 */
function commit({
  state, action, events, animals, clearingTurns, cleared, perfectClear,
  gameOver, advance, frozen, dart, granted, partial = false,
}) {
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
    abilitiesUsed: state.stats.abilitiesUsed + turnSummary.abilitiesUsed,
    chargesEarned: state.stats.chargesEarned + turnSummary.chargesEarned,
  };

  const base = {
    ...state,
    animals,
    score: state.score + turnSummary.score,
    stats,
    lastAction: {
      type: action.type,
      ...(action.type === ACTIONS.MOVE ? { id: action.id, x: action.x } : {}),
      ...(action.type === ACTIONS.ABILITY
        ? { ability: action.ability, target: action.target === undefined ? null : action.target }
        : {}),
    },
    lastTurn: {
      turn: state.turn,
      action: action.type,
      // AC-1403, and it is structural rather than promised: `score` above is
      // `state.score + turnSummary.score`, the fold of the event stream, and no
      // event in the stream carries a negative. Spending a charge writes to
      // `charges` and cannot write to `score` because it never touches it.
      events,
      score: turnSummary.score,
      cleared,
      perfectClear,
      longestChain: turnSummary.longestChain,
      streakMult: cleared ? streakMult(clearingTurns) : 1,
      gameOver,
      /**
       * The input this resolution belongs to. A Dart resolves up to three times
       * inside one turn, so `turn` alone no longer identifies a resolution —
       * and the replay plan keys its shared clock off exactly that identity. A
       * duplicate key would have left the second and third moves of every Dart
       * reading a clock that thought it was still playing the first.
       */
      seq: state.actionSeq + 1,
      partial,
    },
    charges: granted.charges,
    ladder: granted.ladder,
    lastStand: granted.lastStand,
    frozen,
    dart,
    // The accumulators only mean anything inside a Dart; a finished turn
    // clears them so nothing can leak into the next one.
    turnCleared: partial ? cleared : false,
    turnPerfect: partial ? perfectClear : false,
    actionSeq: state.actionSeq + 1,
  };

  if (gameOver) {
    // The queue was consumed by the Arrival phase; clearing it stops the tray
    // from re-rendering animals that are already on the board.
    return { ...base, status: STATUS.GAME_OVER, queue: [], dart: 0, frozen: 0 };
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
        // AC-1404's switch is a property of the session, not of the run: a
        // measurement harness that restarts must not silently turn abilities
        // back on halfway through its sample.
        abilities: state.abilities,
      });

    case ACTIONS.PASS:
      if (state.status !== STATUS.READY) return rejected(state, 'not-ready');
      // AC-1407: Pass while a Dart is open ends it early and resolves the turn.
      return resolveTurn(state, action);

    case ACTIONS.ABILITY: {
      if (state.status !== STATUS.READY) return rejected(state, 'not-ready');
      const fault = abilityFault(state, action.ability, action.target);
      if (fault) return rejected(state, fault, { ability: action.ability });

      // The charge is spent on confirmation and in exactly one place (AC-1413).
      // AC-1403 is what is NOT here: nothing touches `score`.
      const spent = { ...state, charges: state.charges - 1 };

      if (action.ability === ABILITIES.dart.id) {
        // Dart resolves no turn. The player's action for this turn IS the three
        // moves, so the turn stays open and the next MOVE carries it forward.
        return {
          ...spent,
          dart: DART_MOVES,
          turnCleared: false,
          turnPerfect: false,
          lastAction: { type: ACTIONS.ABILITY, ability: action.ability, target: null },
          actionSeq: state.actionSeq + 1,
        };
      }
      return resolveTurn(spent, action);
    }

    case ACTIONS.MOVE: {
      if (state.status !== STATUS.READY) return rejected(state, 'not-ready');
      const verdict = checkMove(state.animals, action.id, action.x, BOARD.width);
      if (verdict === MOVE_NOOP) {
        // A zero-distance drag does not consume the turn (§6.2, AC-402), and it
        // does not consume a Dart move either — the same rule, same reason.
        return { ...state, lastAction: { type: 'NOOP', id: action.id, x: action.x } };
      }
      if (verdict !== MOVE_OK) {
        return rejected(state, verdict, { id: action.id, x: action.x });
      }
      // Inside a Dart, only the LAST of the three moves closes the turn.
      return resolveTurn(state, action, state.dart === 0 || state.dart === 1);
    }

    default:
      return state;
  }
}

// ---- selectors -----------------------------------------------------------

/**
 * Everything the abilities UI reads, in one selector (AC-1415, AC-1410).
 *
 * The HUD, the action bar, the sheet and the tray all take their answer from
 * here, so "how many charges do I have" has one definition in the app rather
 * than four that agree until one of them does not (§6.3).
 */
export function chargeState(state) {
  return {
    enabled: Boolean(state.abilities),
    charges: state.charges,
    cap: ABILITY_CHARGE_CAP,
    /** AC-1408b/c: the fourth pip, which only ever fills from Last Stand. */
    lastStand: state.lastStand,
    /** Turns of suppressed arrival still to come; 0 when the tray is live. */
    frozen: state.frozen,
    /** Moves left in an open Dart turn; 0 when no Dart is in progress. */
    dart: state.dart,
    /** The next rung, or null at the top of the ladder. */
    nextThreshold: state.ladder < ABILITY_THRESHOLDS[state.difficulty].length
      ? ABILITY_THRESHOLDS[state.difficulty][state.ladder]
      : null,
  };
}

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
    abilitiesUsed: state.stats.abilitiesUsed,
    chargesEarned: state.stats.chargesEarned,
  };
}
