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

/** Keys with the same start time collapse to the last one written. */
function compact(keys) {
  const out = [];
  for (const key of keys) {
    if (out.length && out[out.length - 1].at === key.at) out[out.length - 1] = key;
    else out.push(key);
  }
  return out;
}

/**
 * @param {object[]} prevAnimals  the board as it stood before the turn
 * @param {object} lastTurn       state.lastTurn, verbatim
 * @returns {object} the plan; see the shape returned at the bottom
 */
export function buildReplay(prevAnimals, lastTurn) {
  const timeline = turnTimeline(lastTurn.events, lastTurn.action);
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

  const entry = (id) => {
    let found = motion.get(id);
    if (!found) {
      found = { keys: [], size: null, arrival: null };
      motion.set(id, found);
    }
    return found;
  };

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
          animal.y = moved.toY;
          entry(moved.id).keys.push({ at, dur, y: moved.toY, kind: 'fall' });
        }
        break;
      }

      case 'ARRIVAL': {
        for (const id of event.risenIds) {
          const animal = board.get(id);
          if (!animal) continue;
          animal.y += 1;
          entry(id).keys.push({ at: timeline.arrivalAt, dur: arrivalMs, y: animal.y, kind: 'rise' });
        }
        for (const placed of event.placed) {
          board.set(placed.id, { ...placed, y: 0 });
          const record = entry(placed.id);
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
        }

        for (const shrink of event.shrunk) {
          const animal = board.get(shrink.id);
          if (!animal) continue; // retired: it left as a departure above
          animal.size = shrink.toSize;
          entry(shrink.id).size = { at: unit.collapseAt, dur: shrinkMs, to: shrink.toSize };
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

        if (event.score > 0) {
          const rows = event.clearedRows.length ? event.clearedRows : event.rows;
          floats.push({
            key: `score-${unit.phase}${unit.index}-${step}`,
            at: unit.collapseAt,
            y: Math.max(...rows),
            text: `+${event.score}`,
            tone: 'score',
          });
        }

        for (const moved of event.moved) {
          const animal = board.get(moved.id);
          if (!animal) continue;
          animal.y = moved.toY;
          entry(moved.id).keys.push({ at: unit.fallAt, dur: fallMs, y: moved.toY, kind: 'fall' });
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

  // ---- per-animal: tidy the keys and decide which landings squash ---------
  const moves = {};
  for (const [id, record] of motion) {
    const keys = compact(record.keys);
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
  };
}

/** True when any animal stands in rows 11-13, which is what the pulse tracks. */
export function inDangerBand(animals) {
  return animals.some((a) => a.y >= BOARD.dangerBandLow && a.y <= BOARD.dangerBandHigh);
}
