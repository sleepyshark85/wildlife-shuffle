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

import { ABILITIES } from '../engine/abilities.js';
import { BOARD } from '../engine/constants.js';
import { CUE, chainRate, coalesceCues } from './cues.js';
import { COPY, MOTION } from './theme.js';
import { stampedeBeats, turnTimeline } from './timeline.js';

/**
 * Turn the keys into an absolute schedule: when each one actually starts.
 *
 * A key wants to start at its own `at`, but a key cannot start before the one
 * before it has finished — the cascade pipeline overlaps STEPS, not one
 * animal's own successive moves. Resolving that here, once, is what lets every
 * animal read a single shared clock instead of each one counting from its own
 * first frame (src/ui/motion.js `rowAt`).
 */
function absolute(keys) {
  let cursor = 0;
  return keys.map((key) => {
    const start = Math.max(key.at, cursor);
    cursor = start + key.dur;
    return { ...key, start };
  });
}

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
  /** Identity for this turn: the announcement layer and the shared clock
   *  both key off it, and so does every animal's own schedule. */
  // `seq` and not `turn`: a Dart resolves up to three times inside one turn
  // (AC-1407), and this key is what the shared clock and every animal's own
  // schedule are matched against. Two resolutions sharing it would leave the
  // second reading a clock that thought it was still playing the first.
  const planKey = `${lastTurn.seq}.${lastTurn.turn}.${lastTurn.action}`;
  const timeline = turnTimeline(lastTurn.events, lastTurn.action, Math.max(0, reservedMs));
  const { scale } = timeline;
  const fallMs = MOTION.fall * scale;
  const arrivalMs = MOTION.arrival * scale;
  const shrinkMs = MOTION.buffaloShrink * scale;

  const board = new Map(prevAnimals.map((a) => [a.id, { ...a }]));
  const motion = new Map();
  const departures = [];
  const grants = [];
  const flashes = [];
  const shards = [];
  const floats = [];
  /**
   * AC-1101/AC-1102/AC-1106. The turn's cues are scheduled HERE, on the same
   * timestamps as the flashes and collapses they accompany, for the reason the
   * flashes are: a second walk of the event stream is a second source, and §6.3
   * is the incident where two sources that agreed were still the bug.
   *
   * Only the scheduled ones. Grab, drop and illegal-move belong to the gesture
   * and fire from the worklet that decides them (src/ui/components/AnimalView.js);
   * a new best is not in the event stream at all, because it is a comparison
   * against the save file (src/ui/screens/GameScreen.js).
   */
  const cues = [];
  /**
   * The cascade step the player is HEARING, counted across the whole turn.
   *
   * Not `event.step`, which the engine restarts at 1 for each phase: SETTLE and
   * ARRIVAL each run their own resolution, and a pitch that fell back to the
   * root halfway through a cascade would say "new chain" about one chain
   * (ui.md §8.2 — "the rising audio cue per step keeps the count legible").
   */
  let turnStep = 0;
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
      found = { keys: [], size: null, arrival: null, slide: null, startY };
      motion.set(id, found);
    }
    return found;
  };

  /** The ids the tray put on the board this turn: the gap is what they fill. */
  const arrived = new Set();

  /**
   * The path an animal has travelled so far, frozen at the moment it leaves.
   *
   * A departure used to be `{...animal}` and nothing else, and `ClearLayer`
   * drew it at a STATIC `rowTop(dep.y, cell)` from t=0. But `animal.y` has
   * already been moved by every phase that ran before the step that took it —
   * the ARRIVAL rise above all — so an animal about to clear was painted at
   * its POST-PUSH row for the whole 260 ms push-up while every other animal on
   * the board was still easing into position. Measured over 6,133 bot turns:
   * 33 of 327 departures and 20 of 49 shards were drawn at a row their animal
   * had not reached, and on 78 of those turns that was a 1.00-row — full cell —
   * overlap with a live animal.
   *
   * A departure is not a special case of POSITION. It is a special case of
   * ENDING: it travels the board's own trajectory, on the board's own clock,
   * and then collapses. So it carries the same two fields every live animal
   * carries — `startY` and the absolute `keys` — and `ClearLayer` reads them
   * through the same `rowAt` (src/ui/trajectory.js). One function, one clock,
   * no second opinion about where a row is (§6.3, §6.7).
   *
   * Frozen at the call, deliberately: the keys after this point belong to a
   * body that is no longer there. For a shard that is the whole point — it
   * cracks off where the buffalo IS and then falls away on its own (AC-812).
   */
  const trackAt = (id, fallbackY) => {
    const record = motion.get(id);
    if (!record) return { startY: fallbackY, keys: [], arrival: null };
    return {
      startY: record.startY,
      keys: absolute(compact(record.keys, record.startY)),
      /**
       * AC-809, carried for the two bodies this layer draws that the flight
       * layer cannot reach.
       *
       * An animal the tray placed THIS turn and the same turn's ARRIVAL
       * resolution then cleared has a flight record and no flier:
       * `ArrivalFlight` iterates `run.view.animals`, and this one is not in
       * them any more (src/ui/screens/GameScreen.js:253-261). A buffalo placed
       * this turn HAS a flier, and its board body is at opacity 0 behind it —
       * but the panel that cracks off it was being drawn on the board anyway.
       *
       * Both were sitting, opaque, in a row whose occupant had not risen out
       * of it yet, and that — not the stale row this function exists for — is
       * the larger half of the measured overlap: 64 of the 78 full-cell
       * overlaps in a 6,133-turn tundra sweep. Carrying the record lets them
       * hold at opacity 0 until the flight would have landed, which is the
       * rule `AnimalView` applies to every other arriving body.
       */
      arrival: record.arrival,
    };
  };

  const settleUnits = timeline.units.filter((u) => u.phase === 'SETTLE');
  const arrivalUnits = timeline.units.filter((u) => u.phase === 'ARRIVAL');
  let settleStep = 0;
  let arrivalStep = 0;

  for (const event of lastTurn.events) {
    switch (event.type) {
      case 'ACTION': {
        if (event.action === 'MOVE') {
          // The body is already at the target column — the gesture worklet put
          // it there on the frame the finger lifted. This only keeps the
          // replayed board honest for everything that reads a position off it
          // below.
          const mover = board.get(event.id);
          if (mover) mover.x = event.toX;
          break;
        }
        if (event.action !== 'ABILITY') break;

        // ui.md §13.4. Burrow's target dissolves; Migrate's species flashes
        // once in unison and then leaves together. Both are departures — the
        // same treatment the board already uses for an animal that leaves —
        // scheduled at the head of the turn so gravity falls into the hole
        // afterwards rather than through the animal still standing in it.
        const unison = event.ability === 'migrate' ? MOTION.lead * scale : 0;
        for (const id of event.removedIds) {
          const animal = board.get(id);
          if (!animal) continue;
          departures.push({
            ...animal,
            // The track is empty and the flight is null by construction: an
            // ability resolves at the head of the turn, before anything has
            // moved and before the tray's batch is even placed.
            ...trackAt(id, animal.y),
            flashAt: 0,
            collapseAt: unison,
            key: `${animal.id}@${event.ability}`,
          });
          board.delete(id);
          motion.delete(id);
        }

        // AC-1410c: Hold the Line's announce beat. It moves no animal, so
        // without this the only sign the ability fired is a tray that quietly
        // stopped — the player spends two charges and sees nothing happen.
        if (event.ability === ABILITIES.hold.id) {
          floats.push({
            key: `hold-${lastTurn.seq}`,
            at: 0,
            y: BOARD.dangerBandLow - 4,
            text: COPY.holdAnnounce,
            tone: 'buffalo',
          });
        }

        // Stampede: rows slide left, staggered from the bottom up. The slide is
        // HORIZONTAL, which is the one kind of motion this plan did not carry
        // before — every previous x change came from a gesture that had already
        // moved the body on the UI thread. Nothing had moved this one, so
        // without a key here the whole board would teleport left while every
        // position check still passed (§6.7).
        if (event.moved.length > 0) {
          const beats = stampedeBeats(event.moved);
          for (const slid of event.moved) {
            const animal = board.get(slid.id);
            if (!animal) continue;
            animal.x = slid.toX;
            entry(slid.id, animal.y).slide = {
              at: (beats.get(slid.y) || 0) * scale,
              dur: MOTION.snap * scale,
              fromX: slid.fromX,
              toX: slid.toX,
            };
          }
        }
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

        turnStep += 1;
        if (event.clearedRows.length > 0) {
          // AC-1101 gives a row clear and a chain step separate cues, and
          // AC-1106 gives the chain step a rising pitch. So step 1 of a turn is
          // a clear and steps 2+ are the chain climbing away from it, which is
          // what makes a cascade audibly a cascade rather than the same noise
          // three times.
          cues.push(
            turnStep === 1
              ? { at: unit.collapseAt, cue: CUE.clear, rate: 1 }
              : { at: unit.collapseAt, cue: CUE.chain, rate: chainRate(turnStep) },
          );
        }
        if (event.retiredIds.length > 0) {
          cues.push({ at: unit.collapseAt, cue: CUE.retire, rate: 1 });
        }

        const gone = event.removedIds.concat(event.retiredIds);
        for (const id of gone) {
          const animal = board.get(id);
          if (!animal) continue;
          departures.push({
            ...animal,
            // `y` stays: it is the engine's own record of the row it was taken
            // from, and the track has to end there. Nothing draws it any more.
            ...trackAt(id, animal.y),
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
          // gameplay.md §6: "Distinct sound, medium haptic." It is scheduled on
          // the collapse rather than the crack because the crack is the
          // announcement and the re-width is the event.
          cues.push({ at: unit.collapseAt, cue: CUE.shrink, rate: 1 });
          entry(shrink.id, animal.y).size = {
            at: unit.collapseAt,
            dur: shrinkMs,
            to: shrink.toSize,
          };
          // The segment that came off. It is the trailing panel, because the
          // buffalo keeps its x (AC-506).
          //
          // It is opaque from t=0 — `opacity: 1 - go.value` and `go` does not
          // leave 0 until `at` — and it is the buffalo's own colour, so before
          // the crack it is meant to read as part of the buffalo. Pinned at a
          // static `animal.y` it did the opposite: 20 of 49 shards in a
          // 6,133-turn sweep hung a buffalo-coloured cell a row away from the
          // buffalo for the whole push-up. It travels the buffalo's path up to
          // the crack, and falls away from there.
          shards.push({
            key: `${shrink.id}@${unit.phase}${unit.index}`,
            /** Whose panel it is: the buffalo's own id, which `key` mangles. */
            id: shrink.id,
            x: animal.x + shrink.toSize,
            /** The row it cracks off in: where the track has to have got to. */
            y: animal.y,
            ...trackAt(shrink.id, animal.y),
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

      case 'CHARGE': {
        // ui.md §13.4: the pip blooms, and Last Stand's blooms differently
        // because it fires at the worst moment of the run and must not read as
        // an ordinary threshold crossing.
        //
        // It is scheduled at the moment the push-up LANDS, which is also the
        // moment the danger band first lights — so "you are in trouble, here is
        // one more thing you can do about it" reads as one event rather than as
        // a reward arriving inexplicably beside a warning.
        grants.push({
          key: `charge-${lastTurn.seq}.${grants.length}`,
          at: timeline.arrivalAt + arrivalMs,
          reason: event.reason,
          charges: event.charges,
        });
        break;
      }

      case 'PERFECT_CLEAR': {
        const units = event.phase === 'SETTLE' ? settleUnits : arrivalUnits;
        const unit = units[units.length - 1];
        if (!unit) break;
        cues.push({ at: unit.fallAt, cue: CUE.perfect, rate: 1 });
        floats.push({
          key: `perfect-${unit.phase}${unit.index}`,
          at: unit.fallAt,
          y: BOARD.dangerBandLow - 4,
          text: `PERFECT  +${event.score}`,
          tone: 'perfect',
        });
        break;
      }

      case 'JUDGE': {
        // At 0, not at the end of the lock: `status` is GAME_OVER on the commit
        // that applied this turn, so the dim has already started and the sheet
        // is already sliding (ui.md §8 — both at once, done by 400 ms). A
        // heavy impact arriving after the sheet had settled would be a
        // punchline told late.
        if (event.gameOver) cues.push({ at: 0, cue: CUE.gameOver, rate: 1 });
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
    const keys = absolute(compact(record.keys, record.startY));
    const last = keys[keys.length - 1];
    // AC-807: the squash is what a FALL lands with. `applyGravity` only ever
    // moves an animal down, so a 'fall' key is a landing by construction; a
    // 'rise' is the arrival push-up, which lands on nothing and squashes on
    // nothing.
    const fell = Boolean(last) && last.kind === 'fall';
    // AC-1102's light impact, on the same value AC-807's squash is decided
    // from — so a landing that squashes is a landing that thumps, and the two
    // cannot come apart. Fifteen animals settle at once on a busy turn;
    // `coalesceCues` is what stops that being fifteen noises (src/ui/cues.js).
    if (fell && last) cues.push({ at: last.start + last.dur, cue: CUE.land, rate: 1 });
    moves[id] = {
      /** The turn these keys belong to: an animal reading the shared clock has
       *  to know whether the clock is still talking about its own schedule. */
      key: planKey,
      /** Where the animal stood when the turn began: the row every key below
       *  departs from, and without it the plan cannot be replayed on paper. */
      startY: record.startY,
      keys,
      size: record.size,
      arrival: record.arrival,
      /**
       * AC-1411's slide. Present only on a Stampede, and null everywhere else,
       * because every other x change in this game arrives already applied by
       * the gesture that caused it.
       */
      slide: record.slide,
      landAt: fell && last ? last.start + last.dur : null,
    };
  }

  // The shared clock has to outlast the last scheduled movement, or an animal
  // would freeze a few milliseconds short of where the engine put it.
  //
  // Departures and shards are counted too, now that they read the clock rather
  // than a constant. They are almost always inside the board's own span — but
  // "almost always" is how a body ends up frozen mid-rise on the one turn where
  // everything that moved also cleared, and the span is arithmetic, so there is
  // no reason to leave it to luck.
  let clockMs = 0;
  const spanOf = (keys) => {
    for (const key of keys) clockMs = Math.max(clockMs, key.start + key.dur);
  };
  for (const id of Object.keys(moves)) {
    spanOf(moves[id].keys);
    const slid = moves[id].slide;
    if (slid) clockMs = Math.max(clockMs, slid.at + slid.dur);
  }
  for (const dep of departures) spanOf(dep.keys);
  for (const shard of shards) spanOf(shard.keys);

  return {
    /** Identity for the announcement layer: a new turn is a new layer. */
    key: planKey,
    /** AC-808: one clock for the whole board, so nothing can drift (motion.js). */
    clockMs,
    lockMs: timeline.lockMs,
    reservedMs: Math.max(0, reservedMs),
    scale,
    rawMs: timeline.rawMs,
    // Everything below is keyed by the turn, so mounting it is the same React
    // commit that applied the turn. No extra render, and no timer (AC-828).
    moves,
    departures,
    /** AC-1405/AC-1408b: the charges this turn granted, and why. */
    grants,
    flashes,
    shards,
    floats,
    /** AC-1101: sorted, de-machine-gunned, and read by useTurnCues.js. */
    cues: coalesceCues(cues),
    shakeAt,
    anticipate,
    score,
  };
}
