// Onboarding — four interactive beats (gameplay.md §11, AC-1206 to AC-1208).
//
// PURE. This module imports the engine and nothing else: no React, no
// Reanimated, no storage. Everything that decides whether a beat is finished is
// a function of two engine states, so the whole of AC-1206's "each beat gates
// on the player performing the action" is executable in `node --test` with no
// renderer — which is §6.7's rule, and the reason the beat boards are built
// here rather than assembled inside a component.
//
// The beats run on the REAL board. Each one hands `GameScreen` a genuine engine
// state through the same `resumed` door a saved session comes through, so the
// tutorial is the game with a caption over it rather than a simulation of the
// game. Nothing here fakes a turn: the player's drag goes to `reduce()` exactly
// as it does in a run, and the gate reads what the engine did with it.
//
// AC-1208 is the reason beat 3 exists and is the reason this file has a
// `trayKept()`. v1's defect was that the preview was re-rolled after it was
// shown, so the beat that teaches the preview must not merely ASSERT that the
// tray tells the truth — it must check it, on the board in front of the player,
// and refuse to advance if it is ever false. The tray now paints silhouettes
// rather than species (ui.md §6.1), so what beat 3 demonstrates is exactly what
// the silhouettes state: the footprint and the columns. Those are the two
// things `trayKept` compares.

import { BOARD, PHASE, SPECIES } from '../engine/constants.js';
import { createRun } from '../engine/engine.js';

const W = BOARD.width;
const BUFFALO_SIZE = SPECIES.buffalo.size;

/** The beat ids, in order. Exported because both the store and the UI name them. */
export const BEATS = Object.freeze(['slide', 'clear', 'tray', 'buffalo']);

/**
 * Ids for the scripted animals. A distinct prefix from the engine's own
 * `runIdPrefix` (`"<runIndex>.<hash>."`), so a scripted animal can never
 * collide with one the spawner drew (AC-214).
 */
const obId = (n) => `ob.${n}`;

const at = (type, x, y) => ({ id: obId(`${type}${x}.${y}`), type, x, y, size: SPECIES[type].size });

/** Rats filling every column of row `y` except those listed. */
const ratsExcept = (y, gaps) => {
  const out = [];
  for (let x = 0; x < W; x += 1) if (!gaps.includes(x)) out.push(at('rat', x, y));
  return out;
};

// ---- the four boards ------------------------------------------------------
//
// Every one of these is derived from BOARD.width, never written at a literal
// width. The board narrowed from 10 to 9 once already and the fixtures that had
// hard-coded 9 went on passing while testing nothing (test/helpers.js, AC-126).

/**
 * Beat 1 — "Slide the fox." A two-cell gap, and a fox that can reach it.
 *
 * The fox sits two columns right of the gap with clear floor between, so the
 * slide is legal by the sweep rule (AC-407) and not merely by its destination.
 * The row is deliberately left INCOMPLETE after the move — filling a row is
 * beat 2's lesson, and a row that cleared here would teach it in the wrong
 * order and with no explanation.
 */
const GAP_X = 3;
/** The one animal beat 1 is about, named so the gate can be about it too. */
const FOX_ID = obId('fox');
function slideBoard() {
  return [
    ...[0, 1, 2].map((x) => at('rat', x, 0)),
    { id: FOX_ID, type: 'fox', x: GAP_X + 2, y: 0, size: SPECIES.fox.size },
    at('rat', W - 2, 0),
    at('rat', W - 1, 0),
  ];
}

/**
 * Beat 2 — "Fill every column." Row 0 is one cell short; a rat waits above it.
 *
 * The rat is in ROW 1, not row 0, because a row with exactly one hole in it
 * cannot be completed from inside itself — moving any of its own animals just
 * moves the hole. The lesson is the one that matters: slide it over the gap and
 * gravity does the rest.
 *
 * The second rat at the far end of row 1 is there so the clear does not empty
 * the board and fire a Perfect Clear, which is a rare event and not what this
 * beat is teaching.
 */
const HOLE_X = 4;
function clearBoard() {
  return [
    ...ratsExcept(0, [HOLE_X]),
    at('rat', 0, 1),
    at('rat', W - 1, 1),
  ];
}

/**
 * Beat 3 — "The tray is a promise." An EMPTY board, and that is the whole
 * construction rather than a stylistic choice.
 *
 * The beat has to be able to compare what the tray showed against what is on
 * the board afterwards, so the arrival must be guaranteed to survive its own
 * turn. A batch occupies at most `W - 1` columns (§5.2 invariant 1), so on an
 * empty floor it cannot complete row 0 and cannot clear — on any seed, in any
 * habitat, with no probability involved.
 *
 * The first draft of this board left three rats on row 0 and asserted the same
 * guarantee. It was false: the rats rise with the board and then GRAVITY PACKS
 * THEM BACK DOWN into whatever columns the batch left free, so a batch plus the
 * fallers can complete row 0 after all. It did, on 3 seeds in 300, and the
 * arrival the beat exists to point at was cleared away before the player could
 * look at it. The empty floor is the only version of this board with no
 * fallers, and therefore the only one where the claim above is a proof.
 */
function trayBoard() {
  return [];
}

/**
 * Beat 4 — "The buffalo doesn't clear. It shrinks."
 *
 * The buffalo takes the left of row 0, rats take the rest bar one column, and
 * the rat above slides into that column. Completing the row shrinks the buffalo
 * by one segment and clears nothing (AC-506).
 *
 * `ui.md` §11.3's copy for this beat says the chip goes "4 -> 3". The buffalo
 * is five cells wide (`gameplay.md` §5.4, reverted 11 July), so on the shipped
 * board it goes 5 -> 4. The numbers in the UI are read from the engine rather
 * than written down, so the copy cannot drift from the rule; the doc's figure
 * is stale and is flagged rather than reproduced.
 */
function buffaloBoard() {
  const gap = W - 1;
  const rats = [];
  for (let x = BUFFALO_SIZE; x < W; x += 1) if (x !== gap) rats.push(at('rat', x, 0));
  return [at('buffalo', 0, 0), ...rats, at('rat', 0, 1)];
}

// ---- the beats ------------------------------------------------------------

/**
 * `gate(before, after)` answers AC-1206's "the player performed the action".
 *
 * `before` and `after` are CONSECUTIVE engine states — the board as it stood
 * when the player's input arrived, and the board the engine produced from it —
 * not the beat's opening state and the current one. The difference matters on
 * every turn after the first: a counter compared against the beat's opening
 * value stays satisfied for the rest of the beat once it has moved, so the gate
 * would go on reporting a lesson the player learned three turns ago.
 *
 * A turn that resolved into something other than the beat's lesson leaves the
 * beat where it was. The player can take as many turns as they like, and the
 * caption stays until the thing it describes actually happens.
 */
export const BEAT = Object.freeze({
  slide: {
    id: 'slide',
    title: 'Slide the fox',
    body: `Drag the fox left into the gap. Animals only move sideways, and only through empty cells.`,
    board: slideBoard,
    gate: (before, after) => {
      const move = lastMove(after);
      return Boolean(move) && move.id === FOX_ID && move.toX === GAP_X;
    },
  },
  clear: {
    id: 'clear',
    title: 'Fill every column',
    body: `One column of the bottom row is empty. Slide a rat from the row above into it — it falls in, and the row goes.`,
    board: clearBoard,
    // The clear must be the PLAYER'S. A CLEAR_STEP in the SETTLE phase is one
    // the player's own move produced; one in the ARRIVAL phase was produced by
    // the batch landing. The first draft of this gate counted any clear, and a
    // player who pressed Pass was told they had learned the lesson — the
    // arrival lands, gravity packs the risen row back down into the hole, and
    // the row clears with no help from anybody. It did it on the very first
    // Pass. A beat that completes itself teaches nothing.
    gate: (before, after) => stepInPhase(after, PHASE.SETTLE, (e) => e.clearedRows.length > 0) &&
      after.stats.rowsCleared > before.stats.rowsCleared,
  },
  tray: {
    id: 'tray',
    title: 'The tray is a promise',
    body: `The strip under the board is the next arrival: the exact shapes, in the exact columns. Take a turn and watch them land.`,
    board: trayBoard,
    // AC-1208. The gate IS the proof — the beat cannot be completed by a turn
    // in which the tray lied, because the thing being checked is the thing
    // being taught. It compares the queue against the BOARD, never against the
    // ARRIVAL event's own `placed` list: that list is `state.queue.map(...)`,
    // so comparing the two would be a check that cannot fail (§6.2).
    gate: (before, after) => resolvedATurn(before, after) && trayKept(before.queue, after.animals).ok,
  },
  buffalo: {
    id: 'buffalo',
    title: `The buffalo doesn't clear`,
    body: `Complete the row it sits in and it loses one segment instead. ${BUFFALO_SIZE} segments, ${BUFFALO_SIZE} completed rows, and it retires for a bonus.`,
    board: buffaloBoard,
    // Same rule as beat 2, same reason: the shrink has to be the player's. On
    // 5 seeds in 500 the arrival completed the buffalo's row on its own.
    gate: (before, after) => stepInPhase(after, PHASE.SETTLE, (e) => e.shrunk.length > 0) &&
      after.stats.buffaloShrinks > before.stats.buffaloShrinks,
  },
});

/** The beat's 1-based position, for the "2 of 4" progress line. */
export const beatIndex = (id) => BEATS.indexOf(id);

/** The beat after `id`, or null when `id` is the last one. */
export function nextBeat(id) {
  const i = BEATS.indexOf(id);
  return i >= 0 && i < BEATS.length - 1 ? BEATS[i + 1] : null;
}

// ---- AC-1208, the honest-preview check ------------------------------------

/**
 * Did the batch the tray showed arrive unchanged?
 *
 * The tray states two things about each animal and only two: its FOOTPRINT
 * (`size`) and its COLUMNS (`x`). Those are what a silhouette paints and those
 * are what a player plans against, so those are what this compares — plus
 * `type`, because the buffalo's silhouette carries a gold rim and therefore
 * makes a claim about the rules as well (AC-315c).
 *
 * It returns the mismatches rather than a bare boolean so that a failure can
 * SAY what was promised and what came, which is the report v1 never produced.
 *
 * @param {Array} queue the batch as the tray painted it
 * @param {Array} animals the board after the arrival resolved
 */
export function trayKept(queue, animals) {
  const byId = new Map(animals.map((a) => [a.id, a]));
  const mismatches = [];
  for (const promised of queue) {
    const landed = byId.get(promised.id);
    if (!landed) {
      mismatches.push({ id: promised.id, field: 'present', promised: true, actual: false });
      continue;
    }
    for (const field of ['type', 'size', 'x']) {
      if (landed[field] !== promised[field]) {
        mismatches.push({ id: promised.id, field, promised: promised[field], actual: landed[field] });
      }
    }
    // The batch is placed at the floor. A landed row other than 0 would mean
    // something was already there, which is a different promise broken.
    if (landed.y !== 0) {
      mismatches.push({ id: promised.id, field: 'y', promised: 0, actual: landed.y });
    }
  }
  return { ok: mismatches.length === 0 && queue.length > 0, mismatches };
}

// ---- reading what the engine did ------------------------------------------

/** The MOVE the last resolved turn applied, or null if it was not a move. */
function lastMove(state) {
  const turn = state.lastTurn;
  if (!turn) return null;
  const event = turn.events.find((e) => e.type === 'ACTION');
  return event && event.action === 'MOVE' ? event : null;
}

/**
 * Did the last resolved turn produce a CLEAR_STEP in `phase` that `pick` likes?
 *
 * The phase is the whole point. A CLEAR_STEP in SETTLE is one the PLAYER'S move
 * produced; one in ARRIVAL was produced by the batch landing on a board that
 * gravity then packed. Beats 2 and 4 both have to tell those apart, and on the
 * scripted boards the arrival does the lesson by itself often enough that
 * ignoring the difference is not an edge case: over 500 seeds a bare Pass
 * cleared beat 2's row on 286 and shrank beat 4's buffalo on 5.
 */
function stepInPhase(state, phase, pick) {
  const turn = state.lastTurn;
  if (!turn) return false;
  return turn.events.some((e) => e.type === 'CLEAR_STEP' && e.phase === phase && pick(e));
}

/** A turn resolved between these two states — a move, a pass or an ability. */
function resolvedATurn(before, after) {
  return Boolean(after.lastTurn) && after.lastTurn !== before.lastTurn;
}

// ---- building a beat's run ------------------------------------------------

/**
 * An engine state for `beatId`, ready to hand to `GameScreen` as `resumed`.
 *
 * It is a real `createRun` with its board replaced: the PRNG, the id counter,
 * the charge ladder and — the part beat 3 turns on — the QUEUE are all the
 * engine's own. Only `animals` is scripted. So the arrival the player watches
 * in beat 3 came out of `generateBatch` exactly as it does in a run, and the
 * beat is a demonstration rather than a staged photograph.
 *
 * There is nothing left to choose a habitat with (gameplay.md §5.5b): the beat
 * boards were always scripted, so the collapse moved nothing here except the
 * name of the constant that used to say "meadow".
 *
 * `abilities: false`, because the abilities sheet is a fifth thing to explain
 * and gameplay.md §11 lists four beats.
 *
 * @param {string} beatId
 * @param {string} seed the run seed — an onboarding run is seeded like any other
 */
export function beatRun(beatId, seed) {
  const beat = BEAT[beatId];
  if (!beat) throw new Error(`Unknown onboarding beat: ${beatId}`);
  const state = createRun({ seed, abilities: false });
  return {
    ...state,
    animals: beat.board(),
    // The scripted board replaces a seeded one, so the run has no history to
    // replay and no record to write. `origin` and `moves` are what the session
    // layer would carry; they are present and empty because nothing about an
    // onboarding run is ever persisted (AC-1207 stores one boolean and no more).
    origin: { runIndex: state.runIndex, nextAnimalId: state.nextAnimalId, abilities: false },
    moves: [],
    lastTurn: null,
    lastAction: null,
  };
}
