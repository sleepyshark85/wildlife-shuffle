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
  chargeState,
  currentBuffalo,
  queueCells,
  reduce,
  runRecord,
  streakPill,
} from '../engine/engine.js';
import { ABILITIES } from '../engine/abilities.js';
import { abilityButton, abilityRows } from './abilities.js';
import { STATUS } from '../engine/constants.js';
import { inspectChainGuard } from './chainGuard.js';
import { recordTurn } from './diagnostics.js';
import { buildReplay } from './replay.js';
import { appendMove, openRun } from './session.js';
import { lockDelay } from './timeline.js';

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
 * that decides what the board becomes. This wrapper adds two derived fields and
 * decides nothing: the replay plan for the turn that just resolved (ui.md §8.3
 * ¶3, AC-833/AC-834), and the move log the session resume is built from
 * (AC-1014).
 *
 * The plan has to happen here, and not in a `useMemo` further down, for one
 * reason: building it needs the board as it stood BEFORE the turn, and a
 * cascade has already deleted the animals whose departure has to be drawn.
 * This is the only place both boards exist at once.
 *
 * The move log has to happen here for a different one: an input is appended
 * only when the engine ACCEPTED it. A rejected move, a zero-distance drag and
 * a buffered tap that arrived too late all leave the board alone, and a replay
 * that recorded them would reconstruct a different run. `actionSeq` is the only
 * thing that knows the difference, and the reducer is where it changes.
 *
 * Both are pure — a new array, never a push — so React 19 StrictMode's
 * double-invocation remains a no-op (AC-203).
 */
export function runReducer(state, action) {
  const next = reduce(state, action);
  if (next !== state && action.type === ACTIONS.RESTART) {
    // A restart is a new run with a new id namespace. `origin` is what makes it
    // reproducible: `runIndex` and the id counter it inherited (AC-214) are as
    // much a part of the starting point as the seed (src/ui/session.js).
    // AC-1014b: EVERY input `createRun` consumed, not only the ones that feel
    // like a seed. `abilities` is one of them, and it is carried across a
    // RESTART by the reducer — so a record written after a Play Again that
    // omitted it would replay the wrong run, and AC-1014c is why a resume test
    // that only ever exercises the first run of a session cannot see that.
    return {
      ...next,
      origin: {
        runIndex: next.runIndex,
        nextAnimalId: state.nextAnimalId,
        abilities: next.abilities,
      },
      moves: [],
    };
  }
  // ONE rule, and `actionSeq` is what makes it one: the log appends on every
  // ACCEPTED input, and the plan is built for every input that RESOLVED a turn.
  //
  // Those used to be the same set, so `lastTurn`'s identity could stand for
  // both. Layer D separates them: arming a Dart is an accepted input that
  // resolves no turn (AC-1407), and a log that skipped it would replay into a
  // run holding one more charge and three fewer moves in that turn.
  if (next !== state && next.actionSeq !== state.actionSeq) {
    const logged = { ...next, moves: appendMove(state.moves, action) };
    if (next.lastTurn === state.lastTurn) return logged;
    // `action.reservedMs` is AC-824f's correction, carried on the action so
    // the impurity stays in the event handler where the seeds already live.
    return { ...logged, plan: buildReplay(state.animals, next.lastTurn, action.reservedMs || 0) };
  }
  return next;
}

/** A run seed. Called from event handlers only, never during render. */
export function newSeed() {
  return `${Date.now().toString(36)}.${Math.floor(Math.random() * 0xffffffff).toString(36)}`;
}

/**
 * `resumed` is an engine state already reconstructed by replaying a stored
 * session (AC-1012). It arrives as the lazy initialiser's argument rather than
 * through an effect, so a resumed run never renders the board it is about to
 * replace — and AC-1021 falls out of it: from this line down there is no
 * difference at all between a resumed run and a fresh one.
 */
export function useGameRun({ seed, difficulty, resumed = null }) {
  const [state, dispatch] = useReducer(
    runReducer,
    { seed, difficulty, resumed },
    (init) => init.resumed || openRun({ seed: init.seed, difficulty: init.difficulty }),
  );

  const [resolving, setResolving] = useState(false);
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

  /**
   * AC-1406/AC-1413: the one place a charge is spent, and it spends it by
   * asking the engine. Arming, reading the sheet and cancelling all happen in
   * the screen's own state and never reach this function, which is why
   * AC-1414's "cancel is always free" is structural rather than remembered.
   *
   * It takes the lock exactly as a move does, because an ability IS the turn's
   * action — except for Dart, whose arming resolves no turn and therefore
   * schedules no lock (the effect below keys on `lastTurn`).
   */
  const useAbility = useCallback((ability, target) => {
    if (!isOpen()) return;
    fingerUpRef.current = now();
    // Dart is the one ability that resolves no turn, so it schedules no lock —
    // and must not take one, because the lock is released by the effect that
    // watches `lastTurn`, and arming a Dart does not change it. Closing input
    // here would leave the board dead holding three moves it could not make.
    if (ability !== ABILITIES.dart.id) lockedRef.current = true;
    dispatch({ type: ACTIONS.ABILITY, ability, target, reservedMs: gapRef.current });
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
      // Layer D. One selector off the engine, one derivation off that: the
      // action bar, the sheet, the board's targeting dim and the tray all read
      // these rather than each deciding affordability for themselves (§6.3).
      charges: chargeState(state),
      ability: abilityButton(state),
      abilityRows: abilityRows(state),
    }),
    [state],
  );

  return {
    state,
    view,
    resolving,
    guardRecord,
    commitMove,
    pass,
    useAbility,
    restart,
  };
}
