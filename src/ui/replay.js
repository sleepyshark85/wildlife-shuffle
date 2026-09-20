// The replay plan: what the presentation layer plays back, and when.
//
// ui.md §8.3 ¶3 — "animation is a replay of state the engine has already
// resolved, never a driver of it". This module is that sentence made into a
// data structure. It is pure, it is deterministic, and it reads nothing but the
// board the turn started on and the event stream the engine emitted.
//
// AC-834 falls out of the shape rather than out of care: nothing here is ever
// read back into the board. Stall every frame of a turn and the plan simply
// goes unwatched — the engine already finished, and `state.animals` is already
// the answer.
//
// Why the pre-turn board is needed at all: a cascade removes animals, and an
// animal that has been removed is not in `state.animals` any more. Something
// has to remember where it was standing when it went. Replaying the events over
// the board they were emitted against is the only source for that which cannot
// drift from the engine, because it IS the engine's output.

import { BOARD } from '../engine/constants.js';
import { MOTION } from './theme.js';
import { turnTimeline } from './timeline.js';

/**
 * Which columns of `row` are held by a body that was already on the board.
 *
 * Not "which columns are full" — by the time this row is examined the engine
 * has already landed the arrival, so every column of a completing row is full.
 * The question the wash asks is which of them the player is still watching
 * arrive, because that gap is what AC-824d lights at 0.14.
 */
function occupancyOf(board, row, arrived, width = BOARD.width) {
  const cells = new Array(width).fill(false);
  for (const animal of board.values()) {
    if (animal.y !== row || arrived.has(animal.id)) continue;
    for (let c = animal.x; c < animal.x + animal.size && c < width; c += 1) cells[c] = true;
  }
  return cells;
}

/**
 * Keys with the same start time collapse to the last one written, and a key
 * that lands where the animal already was is dropped.
 *
 * The second half is not tidiness. The ARRIVAL phase lifts the whole board by
 * one row and gravity immediately pulls back every column the new batch did
 * not prop up, so an animal under an empty column emits a rise and a fall to
 * the row it started on. Left in, that is a 260 ms animation to nowhere and —
 * worse — a land squash for a landing that never happened (AC-807).
 */
function compact(keys, startY) {
  const merged = [];
  for (const key of keys) {
    if (merged.length && merged[merged.length - 1].at === key.at) merged[merged.length - 1] = key;
    else merged.push(key);
  }
  const out = [];
  let at = startY;
  for (const key of merged) {
    if (key.y === at) continue;
    out.push(key);
    at = key.y;
  }
  return out;
}

/**
 * @param {object[]} prevAnimals  the board as it stood before the turn
 * @param {object} lastTurn       state.lastTurn, verbatim
 * @param {number} reservedMs     AC-824f: how much of the 1500 ms budget is
 *                                spent before the first frame can play. It
 *                                arrives on the action, measured on the
 *                                PREVIOUS turn, because the gap this turn will
 *                                cost has not happened yet when the plan is
 *                                built. The lock timer corrects the remainder
 *                                exactly, so this only has to be close.
 * @returns {object} the plan; see the shape returned at the bottom
 */
export function buildReplay(prevAnimals, lastTurn, reservedMs = 0) {
  const timeline = turnTimeline(lastTurn.events, lastTurn.action, Math.max(0, reservedMs));
  const { scale } = timeline;
  const fallMs = MOTION.fall * scale;
  const arrivalMs = MOTION.arrival * scale;
  const shrinkMs = MOTION.buffaloShrink * scale;

  const board = new Map(prevAnimals.map((a) => [a.id, { ...a }]));
  const motion = new Map();
  const departures = [];
  const flashes = [];
  const shards = [];
  const floats = [];
  let shakeAt = null;
  let anticipate = null;
  /** AC-615c: the turn's count-up spans its clear units, and there is one. */
  let firstCollapseAt = null;
  let lastCollapseAt = null;
  let floatRow = 0;

  /** `startY` is where the animal stood when the turn began: the row every
   *  key below is a departure from, and the one a no-op key returns to. */
  const entry = (id, startY) => {
    let found = motion.get(id);
    if (!found) {
      found = { keys: [], size: null, arrival: null, startY };
      motion.set(id, found);
    }
    return found;
  };

  /** The ids the tray put on the board this turn: the gap is what they fill. */
  const arrived = new Set();

  const settleUnits = timeline.units.filter((u) => u.phase === 'SETTLE');
  const arrivalUnits = timeline.units.filter((u) => u.phase === 'ARRIVAL');
  let settleStep = 0;
  let arrivalStep = 0;

  for (const event of lastTurn.events) {
    switch (event.type) {
      case 'ACTION': {
        // The body is already at the target column — the gesture worklet put it
        // there on the frame the finger lifted. This only keeps the replayed
        // board honest for everything that reads a position off it below.
        if (event.action !== 'MOVE') break;
        const mover = board.get(event.id);
        if (mover) mover.x = event.toX;
        break;
      }

      case 'GRAVITY': {
        // The ARRIVAL phase's gravity is not a separate beat: `arrive()` lifts
        // the whole board by one row and gravity immediately pulls back every
        // column the new batch did not prop up. Animating the lift and the
        // pull-back as two moves would show a bounce the player never caused,
        // so both are written at the push-up's start and the later one wins.
        const at = event.phase === 'SETTLE' ? timeline.settleFallAt : timeline.arrivalAt;
        const dur = event.phase === 'SETTLE' ? fallMs : arrivalMs;
        for (const moved of event.moved) {
          const animal = board.get(moved.id);
          if (!animal) continue;
          const record = entry(moved.id, animal.y);
          animal.y = moved.toY;
          record.keys.push({ at, dur, y: moved.toY, kind: 'fall' });
        }
        break;
      }

      case 'ARRIVAL': {
        for (const id of event.risenIds) {
          const animal = board.get(id);
          if (!animal) continue;
          const record = entry(id, animal.y);
          animal.y += 1;
          record.keys.push({ at: timeline.arrivalAt, dur: arrivalMs, y: animal.y, kind: 'rise' });
        }
        for (const placed of event.placed) {
          board.set(placed.id, { ...placed, y: 0 });
          arrived.add(placed.id);
          const record = entry(placed.id, 0);
          // AC-809: it travels from the tray strip, because it is the animal the
          // tray promised. The board coordinate it ends at is written below by
          // the ARRIVAL gravity; the flight start is the tray.
          record.arrival = { at: timeline.arrivalAt, dur: arrivalMs, trayX: placed.x };
          record.keys.push({ at: timeline.arrivalAt, dur: arrivalMs, y: 0, kind: 'rise' });
        }
        break;
      }

      case 'CLEAR_STEP': {
        const settle = event.phase === 'SETTLE';
        const step = settle ? (settleStep += 1) : (arrivalStep += 1);
        const units = settle ? settleUnits : arrivalUnits;
        if (units.length === 0) break; // cannot happen: allocateUnits keeps one
        // AC-825: steps past the cap replay folded into that phase's last unit.
        // The engine scored every one of them; this changes no points.
        const unit = units[Math.min(step, units.length) - 1];

        if (firstCollapseAt === null) {
          firstCollapseAt = unit.collapseAt;
          const rows = event.clearedRows.length ? event.clearedRows : event.rows;
          floatRow = rows.length ? Math.max(...rows) : 0;
        }
        lastCollapseAt = unit.collapseAt;

        // AC-824d: the row an ARRIVAL clear is about to complete is washed
        // while the push-up plays. Only the first such step, and only if it
        // actually clears — a buffalo row is not about to go anywhere.
        if (
          anticipate === null &&
          event.phase !== 'SETTLE' &&
          event.clearedRows.length > 0
        ) {
          anticipate = {
            at: timeline.arrivalAt,
            dur: arrivalMs,
            handoverAt: unit.flashAt,
            // AC-824d: two values, so each cell has to say which it is. A cell
            // held by a body that was already on the board is "occupied"; the
            // rest is the gap the tray's batch is landing in.
            rows: event.clearedRows.map((row) => ({
              row,
              occupied: occupancyOf(board, row, arrived),
            })),
          };
        }

        const gone = event.removedIds.concat(event.retiredIds);
        for (const id of gone) {
          const animal = board.get(id);
          if (!animal) continue;
          departures.push({
            ...animal,
            flashAt: unit.flashAt,
            collapseAt: unit.collapseAt,
            key: `${animal.id}@${unit.phase}${unit.index}`,
          });
          board.delete(id);
          // An animal that has left is not one of the board's animals any
          // more, so it must not be left behind in `moves` — an arriving
          // animal cleared by its own turn's ARRIVAL resolution would sit
          // there still holding a flight record, and anything that iterated
          // `moves` instead of the board would draw it flying in and
          // collapsing at the same time. Nothing does today; this is what
          // stops that from being one refactor away.
          motion.delete(id);
        }

        for (const shrink of event.shrunk) {
          const animal = board.get(shrink.id);
          if (!animal) continue; // retired: it left as a departure above
          animal.size = shrink.toSize;
          entry(shrink.id, animal.y).size = {
            at: unit.collapseAt,
            dur: shrinkMs,
            to: shrink.toSize,
          };
          // The segment that came off. It is the trailing panel, because the
          // buffalo keeps its x (AC-506).
          shards.push({
            key: `${shrink.id}@${unit.phase}${unit.index}`,
            x: animal.x + shrink.toSize,
            y: animal.y,
            at: unit.collapseAt,
          });
          floats.push({
            key: `shrink-${shrink.id}@${unit.phase}${unit.index}`,
            at: unit.collapseAt,
            y: animal.y,
            text: 'BUFFALO −1',
            tone: 'buffalo',
          });
        }

        if (event.clearedRows.length > 0) {
          flashes.push({
            key: `${unit.phase}${unit.index}-${step}`,
            at: unit.flashAt,
            rows: event.clearedRows.slice(),
          });
        }
        // AC-811: three or more rows in one step, and only then.
        if (event.clearedRows.length >= 3) shakeAt = unit.collapseAt;

        for (const moved of event.moved) {
          const animal = board.get(moved.id);
          if (!animal) continue;
          const record = entry(moved.id, animal.y);
          animal.y = moved.toY;
          record.keys.push({ at: unit.fallAt, dur: fallMs, y: moved.toY, kind: 'fall' });
        }
        break;
      }

      case 'PERFECT_CLEAR': {
        const units = event.phase === 'SETTLE' ? settleUnits : arrivalUnits;
        const unit = units[units.length - 1];
        if (!unit) break;
        floats.push({
          key: `perfect-${unit.phase}${unit.index}`,
          at: unit.fallAt,
          y: BOARD.dangerBandLow - 4,
          text: `PERFECT  +${event.score}`,
          tone: 'perfect',
        });
        break;
      }

      default:
        break;
    }
  }

  // ---- the turn's one score announcement (AC-615, AC-615b, AC-615c) -------
  //
  // It starts at the FIRST clear unit's collapse, never at the React commit.
  // Started at the commit it finished 233-249 ms before the row it was paying
  // for had even flashed: on an ARRIVAL clear the count-up ran 0-400 ms while
  // the flash did not begin until 570. The HUD was answering before the board
  // asked, inside the exact sequence the owner complained about.
  //
  // One count-up for the turn, not one per step: a cascade restarting the
  // counter on every step jitters, where this reads as one accumulating sweep.
  let score = null;
  if (firstCollapseAt !== null && lastTurn.score > 0) {
    score = {
      at: firstCollapseAt,
      dur: Math.max(MOTION.scoreCount, lastCollapseAt - firstCollapseAt + MOTION.scoreCount),
      gained: lastTurn.score,
      // The row to float it over: the topmost row of the first step that went.
      y: floatRow,
    };
    floats.unshift({
      key: `score-${lastTurn.turn}`,
      at: firstCollapseAt,
      y: floatRow,
      text: `+${lastTurn.score}`,
      tone: 'score',
    });
  }

  // ---- per-animal: tidy the keys and decide which landings squash ---------
  const moves = {};
  for (const [id, record] of motion) {
    const keys = compact(record.keys, record.startY);
    const last = keys[keys.length - 1];
    // AC-807: the squash is what a FALL lands with. `applyGravity` only ever
    // moves an animal down, so a 'fall' key is a landing by construction; a
    // 'rise' is the arrival push-up, which lands on nothing and squashes on
    // nothing.
    const fell = Boolean(last) && last.kind === 'fall';
    moves[id] = {
      keys,
      size: record.size,
      arrival: record.arrival,
      landAt: fell && last ? last.at + last.dur : null,
    };
  }

  return {
    /** Identity for the announcement layer: a new turn is a new layer. */
    key: `${lastTurn.turn}.${lastTurn.action}`,
    lockMs: timeline.lockMs,
    reservedMs: Math.max(0, reservedMs),
    scale,
    rawMs: timeline.rawMs,
    // Everything below is keyed by the turn, so mounting it is the same React
    // commit that applied the turn. No extra render, and no timer (AC-828).
    moves,
    departures,
    flashes,
    shards,
    floats,
    shakeAt,
    anticipate,
    score,
  };
}

/** True when any animal stands in rows 11-13, which is what the pulse tracks. */
export function inDangerBand(animals) {
  return animals.some((a) => a.y >= BOARD.dangerBandLow && a.y <= BOARD.dangerBandHigh);
}
