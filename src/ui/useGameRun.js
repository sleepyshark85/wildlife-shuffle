// The React state layer.
//
// It holds engine state, dispatches actions, and owns every timer with explicit
// cleanup on unmount and on restart. Updaters stay pure: the engine's reduce()
// IS the reducer, unchanged, so React 19 StrictMode's double-invocation is a
// no-op rather than a second turn (AC-203). v1 resolved the whole turn inside a
// setAnimals() updater with setTimeouts fired from inside it
// (docs/v1-review.md A1-A4).
//
// There are exactly two timers in the app and both live here:
//   1. the input lock, which ends the turn's structural timeline (AC-413)
//   2. the BLOCKED announcement, which clears the action bar's label (AC-406)
// Neither drives an animation frame — every transform is a worklet (AC-828) —
// and both are cleared by their effect's own cleanup, on unmount and on
// restart alike (AC-211, AC-212).
//
// `lockedRef` rather than the `resolving` state is the authority on whether
// input is open, because it is written synchronously. Reading a state variable
// there would leave a one-commit window in which two fingers releasing together
// could both commit (AC-409).

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';

import {
  ACTIONS,
  createRun,
  currentBuffalo,
  queueCells,
  reduce,
  runRecord,
  streakPill,
} from '../engine/engine.js';
import { STATUS } from '../engine/constants.js';
import { inspectChainGuard } from './chainGuard.js';
import { recordTurn } from './diagnostics.js';
import { buildReplay } from './replay.js';
import { lockDelay } from './timeline.js';
import { MOTION } from './theme.js';

/**
 * A monotonic millisecond clock. `performance.now()` rather than `Date.now()`
 * because this measures a duration, and because a harness that freezes the
 * wall clock to make seeds reproducible must not also silently freeze the
 * budget correction into a no-op.
 */
function now() {
  return typeof performance !== 'undefined' && performance.now
    ? performance.now()
    : Date.now();
}

/** A commit gap this long is a debugger, not a device. Do not learn from it. */
const MAX_LEARNED_GAP_MS = 300;

/**
 * The engine's `reduce()` IS the reducer — unchanged, and still the only thing
 * that decides what the board becomes. This wrapper adds one derived field and
 * decides nothing: the replay plan for the turn that just resolved (ui.md §8.3
 * ¶3, AC-833/AC-834).
 *
 * It has to happen here, and not in a `useMemo` further down, for one reason:
 * building the plan needs the board as it stood BEFORE the turn, and a cascade
 * has already deleted the animals whose departure has to be drawn. This is the
 * only place both boards exist at once. It is pure, so React 19 StrictMode's
 * double-invocation remains a no-op (AC-203).
 */
export function runReducer(state, action) {
  const next = reduce(state, action);
  if (next !== state && next.lastTurn && next.lastTurn !== state.lastTurn) {
    // `action.reservedMs` is AC-824f's correction, carried on the action so
    // the impurity stays in the event handler where the seeds already live.
    return {
      ...next,
      plan: buildReplay(state.animals, next.lastTurn, action.reservedMs || 0),
    };
  }
  return next;
}

/** A run seed. Called from event handlers only, never during render. */
export function newSeed() {
  return `${Date.now().toString(36)}.${Math.floor(Math.random() * 0xffffffff).toString(36)}`;
}

export function useGameRun({ seed, difficulty }) {
  const [state, dispatch] = useReducer(runReducer, { seed, difficulty }, createRun);

  const [resolving, setResolving] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [blockTick, setBlockTick] = useState(0);
  const [guardRecord, setGuardRecord] = useState(null);

  const lockedRef = useRef(false);
  const stateRef = useRef(state);
  /**
   * AC-824f. `fingerUpRef` is when the player let go; `gapRef` is how long the
   * last turn took to get from there to a committed board, which is what the
   * next turn reserves out of its budget before scaling.
   */
  const fingerUpRef = useRef(null);
  const gapRef = useRef(0);
  // Buffered input. Nothing in this game ever swallows a touch (AC-414/827).
  const bufferedRef = useRef(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // ---- the input lock ---------------------------------------------------
  // Keyed on lastTurn's identity: a new object means a turn actually resolved.
  // A rejected or zero-distance move leaves it alone, so nothing is scheduled.
  useEffect(() => {
    const turn = state.lastTurn;
    if (!turn) {
      // createRun() — including RESTART — clears lastTurn, which lands here and
      // releases the previous run's lock on the way in (AC-212).
      lockedRef.current = false;
      setResolving(false);
      return undefined;
    }

    // AC-216's other half: the engine emits, and this is what makes somebody
    // responsible for it being seen (AC-1309). It throws in development.
    const guard = inspectChainGuard(turn.events, { seed: state.seed, turn: turn.turn });
    if (guard) setGuardRecord(guard);

    lockedRef.current = true;
    setResolving(true);

    // AC-824f: the budget is measured from finger-up, so the time the engine
    // and React have already spent comes out of the lock. `reservedMs` was
    // taken out of the ceiling when the plan was scaled; the rest is charged
    // here, which makes the guarantee exact rather than approximately right.
    const elapsed = fingerUpRef.current === null ? 0 : now() - fingerUpRef.current;
    if (elapsed > 0) gapRef.current = Math.min(elapsed, MAX_LEARNED_GAP_MS);
    const wait = lockDelay(state.plan.lockMs, state.plan.reservedMs, elapsed);

    const timer = setTimeout(() => {
      lockedRef.current = false;
      setResolving(false);
      // The lock ending is the moment the structural animation has finished,
      // which is the only moment at which "rendered disagrees with engine" is
      // a real disagreement rather than a frame of animation. Costs one
      // boolean when the log is off (src/ui/diagnostics.js).
      recordTurn({
        turn: turn.turn,
        action: turn.action,
        seed: state.seed,
        difficulty: state.difficulty,
        score: stateRef.current.score,
        gained: turn.score,
        lockMs: wait,
        animals: stateRef.current.animals,
      });
      const buffered = bufferedRef.current;
      bufferedRef.current = null;
      if (buffered && stateRef.current.status === STATUS.READY) {
        fingerUpRef.current = now();
        dispatch({ ...buffered, reservedMs: gapRef.current });
      }
    }, wait);
    return () => clearTimeout(timer);
  }, [state.lastTurn, state.seed, state.difficulty, state.plan]);

  // ---- the BLOCKED announcement ----------------------------------------
  useEffect(() => {
    if (!blocked) return undefined;
    const timer = setTimeout(() => setBlocked(false), MOTION.illegal);
    return () => clearTimeout(timer);
  }, [blocked, blockTick]);

  const isOpen = () => !lockedRef.current && stateRef.current.status === STATUS.READY;

  // ---- the three things the player can do -------------------------------
  const commitMove = useCallback((id, x) => {
    // AC-413: a drag that lands during a resolution is ignored, not queued —
    // the board it was aimed at no longer exists. Taps are what get buffered.
    if (!isOpen()) return;
    // AC-824f starts the clock here. This runs from the gesture's own
    // runOnJS, so it is one scheduling hop after the finger actually lifted —
    // a sub-frame difference, well inside the AC's own 16 ms tolerance, and
    // measuring it in the worklet instead would put a clock call on the UI
    // thread for no gain.
    fingerUpRef.current = now();
    lockedRef.current = true; // synchronous: closes the two-finger window
    dispatch({ type: ACTIONS.MOVE, id, x, reservedMs: gapRef.current });
  }, []);

  const markBlocked = useCallback(() => {
    setBlocked(true);
    setBlockTick((tick) => tick + 1);
  }, []);

  const pass = useCallback(() => {
    if (stateRef.current.status !== STATUS.READY) return;
    if (!isOpen()) {
      bufferedRef.current = { type: ACTIONS.PASS }; // AC-414, AC-827
      return;
    }
    fingerUpRef.current = now();
    lockedRef.current = true;
    dispatch({ type: ACTIONS.PASS, reservedMs: gapRef.current });
  }, []);

  const restart = useCallback((nextDifficulty) => {
    bufferedRef.current = null;
    lockedRef.current = false;
    fingerUpRef.current = null;
    setBlocked(false);
    setGuardRecord(null);
    dispatch({ type: ACTIONS.RESTART, seed: newSeed(), difficulty: nextDifficulty });
  }, []);

  // ---- derived, all straight off the engine's own selectors --------------
  const view = useMemo(
    () => ({
      animals: state.animals,
      plan: state.plan || null,
      queue: state.queue,
      queueCells: queueCells(state),
      score: state.score,
      streak: streakPill(state),
      buffalo: currentBuffalo(state),
      turn: state.turn,
      gameOver: state.status === STATUS.GAME_OVER,
      record: runRecord(state),
    }),
    [state],
  );

  return {
    state,
    view,
    resolving,
    blocked,
    guardRecord,
    commitMove,
    markBlocked,
    pass,
    restart,
  };
}
