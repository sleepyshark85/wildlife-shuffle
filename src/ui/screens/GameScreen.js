// The Game screen (S2). It owns the layout, the run, and nothing else.
//
// Cell size is computed here, once, by the one sizing function, and passed down
// as a prop. No child derives its own (AC-107). It is derived fresh from the
// current dimensions on every render and is never cached in state or in a
// module global (AC-118) — which is also what makes a fold, an unfold or a
// Display Zoom change a re-render rather than a special case (AC-127, AC-133).
//
// The turn's replay plan arrives here the same way: already built, on the
// commit that applied the turn, and handed down as a prop. This screen schedules
// exactly one thing of its own — the screen shake (AC-811) — and it schedules it
// as a worklet, not as a timer.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { needsTarget, targetOf, targetingChip, turnStatus } from '../abilities.js';
import { BEAT } from '../onboarding.js';
import { stripRows } from '../buffaloStrip.js';
import { CUE } from '../cues.js';
import { fireCue } from '../cuePlayer.js';
import {
  GUTTER, RAIL_PAD, STAGE, WIDE_GAP, WIDE_GUTTER, boardLayout, boardTrayGap, railSlots,
} from '../layout.js';
import { EASE, delay, sequence, timing } from '../motion.js';
import { useAnnouncements, useProgress, useTheme } from '../progressStore.js';
import { useSettings } from '../settings.js';
import { useOnBackground } from '../useAppState.js';
import { MOTION, MOTION_SIZE, RADIUS, SPACE, themed } from '../theme.js';
import { useDragShared } from '../useDragShared.js';
import { useGameRun } from '../useGameRun.js';
import { useTurnClock } from '../useTurnClock.js';
import { useTurnCues } from '../useTurnCues.js';
import { ActionBar } from '../components/ActionBar.js';
import { ArrivalFlight } from '../components/ArrivalFlight.js';
import { Board } from '../components/Board.js';
import { BuffaloStrip, Hud, HudStats } from '../components/Hud.js';
import { IconButton } from '../components/Controls.js';
import { Tray } from '../components/Tray.js';
import { GameOverSheet } from './GameOverSheet.js';
import { OnboardingCoach } from './OnboardingCoach.js';
import { PauseSheet } from './PauseSheet.js';
import { SettingsSheet } from './SettingsSheet.js';
import { AbilitySheet } from './AbilitySheet.js';

/**
 * `onboarding` is S7 (AC-1206): `{ beat, onNext, onSkip, onRestart }`, or null
 * for an ordinary run. It changes three things and nothing else — a caption
 * layer goes on top, the run writes nothing to disk, and the Game Over sheet is
 * replaced by restarting the beat. Everything below it is the shipped screen,
 * because a tutorial that runs on a special screen has taught the special
 * screen (gameplay.md §11).
 */
export function GameScreen({ seed, resumed = null, onboarding = null, onHowToPlay = null, onQuit }) {
  const theme = useTheme();
  const styles = STYLES[theme.name];
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [paused, setPaused] = useState(false);
  // Settings sits ON TOP of Pause rather than replacing it, so closing it
  // returns to the sheet the player opened it from.
  const [settingsOpen, setSettingsOpen] = useState(false);
  /**
   * The abilities flow, and BOTH halves of it live here rather than in the
   * engine, deliberately (AC-1413/AC-1414).
   *
   * `sheetOpen` is reading the menu; `armed` is having chosen a targeted
   * ability and not yet picked a target. Neither has spent anything — the only
   * thing that spends is `run.useAbility`, which dispatches to the reducer. So
   * "cancel is always one tap and always free" is not a rule anybody has to
   * remember: there is nothing to refund, because nothing was taken.
   */
  const [sheetOpen, setSheetOpen] = useState(false);
  const [armed, setArmed] = useState(null);
  const settings = useSettings();

  const run = useGameRun({ seed, resumed });
  const drag = useDragShared();
  const progress = useProgress();
  const announcements = useAnnouncements(progress.save);

  /**
   * AC-1013 / AC-1002: the ONE moment the in-progress run reaches the disk.
   * Not per turn, not on a timer, not from the render path — the callback runs
   * from an AppState transition, which is neither (src/ui/useAppState.js).
   */
  useOnBackground(() => {
    // An onboarding run is scripted, so it must never become the run the player
    // is offered on the way back in (AC-1012): its board was not produced by
    // replaying moves through the engine, and Resume promises one that was.
    if (onboarding) return;
    if (!run.view.gameOver) progress.saveResume(run.state);
  });

  /**
   * AC-1001 / AC-1020: a run ends, the record is written exactly once and the
   * resume record is cleared. The previous best is captured BEFORE the write,
   * because AC-707's badge compares against the best this run had to beat and
   * one line later the stored best includes this run.
   *
   * Keyed on `runIndex` so Play Again — which restarts in place rather than
   * remounting — gets its own write, and StrictMode's re-run of a mount effect
   * does not get a second one.
   */
  const [outcome, setOutcome] = useState(null);
  const writtenRef = useRef(null);
  const runIndex = run.state.runIndex;
  const over = run.view.gameOver;
  const record = run.view.record;
  const finishRun = progress.finishRun;
  const bestNow = progress.save.best.score;
  const bestRef = useRef(bestNow);
  useEffect(() => {
    if (!over) bestRef.current = bestNow;
  }, [over, bestNow]);
  // An armed ability cannot survive the board it was armed against.
  useEffect(() => {
    if (over) {
      setArmed(null);
      setSheetOpen(false);
    }
  }, [over, runIndex]);

  const onboardingRestart = onboarding ? onboarding.onRestart : null;
  useEffect(() => {
    // A player who passes fifteen times during a beat fills the scripted board
    // and reaches Game Over on a run that has no record to write and no score
    // to show. The beat starts again rather than dead-ending on a sheet whose
    // every button is about a run that did not happen.
    if (onboardingRestart && over) onboardingRestart();
  }, [onboardingRestart, over]);

  useEffect(() => {
    // AC-1207's other half: nothing about an onboarding run reaches the save.
    // Not the record, not the streak, not the lifetime totals that buy unlocks.
    if (onboarding) return;
    if (!over) {
      writtenRef.current = null;
      setOutcome(null);
      return;
    }
    // The write happens in the effect body and the updater gets a value, never
    // a side effect. That is the whole architectural rule of this project
    // (docs/v1-review.md A1): v1 fired its persistence and its timeouts from
    // inside a setState updater, which React 19 StrictMode runs twice.
    if (writtenRef.current === runIndex) return;
    writtenRef.current = runIndex;
    const was = bestRef.current;
    finishRun(record, Date.now());
    // AC-504e: a run whose chain guard tripped sets no record, so it can
    // show no badge either.
    const newBest = record.chainGuardTrips === 0 && record.score > was;
    setOutcome({ runIndex, best: was, newBest });
    // AC-1101's eleventh cue, and the only one that is not in the plan: a new
    // best is not a fact about the turn, it is a comparison against the save
    // file, and `buildReplay` has never seen the save file. It fires from the
    // same line that decides the badge, so the sound and the badge cannot
    // disagree about whether this was a record.
    if (newBest) fireCue(CUE.newBest, 1);
  }, [onboarding, over, runIndex, record, finishRun]);

  /**
   * AC-1206 — the beat's gate, evaluated on CONSECUTIVE engine states.
   *
   * `prevStateRef` holds the board the player's input arrived at, never the
   * board the beat opened on: a gate that compares a counter against the
   * opening value goes on reporting true for the rest of the beat once it has
   * moved, and the caption would then confirm a lesson three turns old.
   *
   * The ref is written before the comparison can fire twice, so React 19
   * StrictMode's double-invoked effect compares a state against itself and does
   * nothing the second time.
   */
  const beatId = onboarding ? onboarding.beat : null;
  const [beatDone, setBeatDone] = useState(false);
  const prevStateRef = useRef(run.state);
  useEffect(() => {
    if (!beatId) return;
    const before = prevStateRef.current;
    const after = run.state;
    prevStateRef.current = after;
    if (before !== after && BEAT[beatId].gate(before, after)) setBeatDone(true);
  }, [beatId, run.state]);

  // THE one call. Insets are read as numbers and fed into the formula, never
  // used as an opaque wrapper view (ui.md §3.3).
  const layout = boardLayout(width, height, insets.top, insets.bottom);
  const { stage, cell, chrome, boardW, boardH, railW } = layout;

  const wide = stage === STAGE.WIDE;
  const compact = chrome.hud === 44;
  const unsupported = stage === STAGE.UNSUPPORTED;
  const { reduced, sizeNumerals, highContrast, diagnostics } = settings;

  // A targeting state suspends the drag: the tap the player is about to make
  // means "this one", not "move this one", and leaving the pan armed would let
  // a slightly slurred tap commit a move instead of a burrow.
  const inputOpen = !run.resolving && !run.view.gameOver && !paused && !unsupported && !armed;
  const plan = run.view.plan;
  // AC-808: one clock for every animal's vertical motion, so a stack cannot
  // drift apart and cross itself (src/ui/useTurnClock.js).
  const clock = useTurnClock(plan);
  // AC-1101: the turn's cues, played off that same clock so a cue lands on the
  // frame it is announcing rather than a frame either side of it
  // (src/ui/useTurnCues.js). The schedule was built with the flashes, in the
  // plan (src/ui/replay.js).
  useTurnCues(plan, clock);

  // A layout change — or a board change — invalidates any drag in flight: the
  // columns under the finger have changed meaning, so committing would apply a
  // move the player did not choose (AC-129, AC-409). Bumping the epoch is what
  // the worklet checks, and it is checked on the UI thread, so the cancellation
  // costs no render.
  useEffect(() => {
    drag.epoch.value += 1;
    drag.ghostVisible.value = 0;
    drag.blockedId.value = ''; // AC-130: reset cleanly, ready for the next drag
  }, [cell, stage, run.view.animals, drag]);

  useEffect(() => {
    drag.inputOpen.value = inputOpen ? 1 : 0;
  }, [inputOpen, drag]);

  // AC-811: three or more rows in one step, 4 pt, 180 ms, decaying. An
  // announcement — it gates nothing, and it is disabled outright under Reduce
  // Motion (AC-907).
  const shake = useSharedValue(0);
  useEffect(() => {
    if (!plan || plan.shakeAt === null || reduced) return;
    const beat = timing(MOTION.shake / 5, EASE.inOut, false);
    const amp = MOTION_SIZE.shakeAmplitude;
    shake.value = delay(
      plan.shakeAt,
      sequence(
        withTiming(amp, beat),
        withTiming(-amp * 0.75, beat),
        withTiming(amp * 0.5, beat),
        withTiming(-amp * 0.25, beat),
        withTiming(0, beat),
      ),
    );
  }, [plan, reduced, shake]);
  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shake.value }, { translateY: shake.value * 0.4 }],
  }));

  // AC-809: the batch that just landed, with the flight each one is owed.
  const arrivals = useMemo(() => {
    if (!plan) return [];
    const out = [];
    for (const animal of run.view.animals) {
      const motion = plan.moves[animal.id];
      if (motion && motion.arrival) out.push({ animal, plan: motion.arrival });
    }
    return out;
  }, [plan, run.view.animals]);

  // The wide stage spaces the group by hand; every other stage uses the ladder's
  // own gap. The flight has to start from whichever one is on screen.
  // AC-615 / AC-509b: the HUD's two schedules come off the same plan the board
  // is playing, so the chip and the score cannot disagree with the animals.
  const count = plan ? plan.score : null;
  // AC-509/509b: one chip per buffalo, bottom row first, and a retired one
  // keeps its chip until the plan has finished taking it off the board
  // (src/ui/buffaloStrip.js). The strip and the board read the same plan.
  const stripChips = stripRows(run.view.buffaloes, plan);

  // One status line for the whole screen (src/ui/abilities.js), so the HUD and
  // the rail cannot disagree about what the player is being asked to do.
  const status = turnStatus({
    gameOver: run.view.gameOver,
    resolving: run.resolving,
    arming: Boolean(armed),
    dart: run.view.charges.dart,
  });
  const targeting = armed ? targetingChip(armed) : null;
  const grants = plan ? plan.grants : null;

  /** A row of the sheet was tapped. NOTHING is spent by this function. */
  const pickAbility = (row) => {
    setSheetOpen(false);
    // ui.md §13.3: Stampede, Dart and Hold the Line resolve immediately on
    // arming; Burrow and Migrate go to the board and wait for a target.
    if (needsTarget(row.id)) setArmed(row.id);
    else run.useAbility(row.id);
  };

  const gap = wide ? SPACE.lg : boardTrayGap(chrome);
  const arrivalLandsAt = arrivals.length ? arrivals[0].plan.at + arrivals[0].plan.dur : 0;
  const board = unsupported ? null : (
    <Board
      animals={run.view.animals}
      cell={cell}
      // AC-1510: the ground is drawn from the RUN's seed, so each run's board
      // is its own and fixed for the whole of it.
      seed={seed}
      drag={drag}
      clock={clock}
      plan={plan}
      reduced={reduced}
      sizeNumerals={sizeNumerals}
      highContrast={highContrast}
      diagnostics={diagnostics}
      onCommit={run.commitMove}
      arming={armed}
      onTarget={(target) => {
        const ability = armed;
        setArmed(null);
        run.useAbility(ability, targetOf(ability, target));
      }}
      onCancelTarget={() => setArmed(null)}
    />
  );
  // The board and its flight layer are one stacking context: the flight is
  // positioned from the board's own top-left and overhangs it downward, which
  // is where the tray is.
  const boardGroup = unsupported ? null : (
    <View style={{ width: boardW, height: boardH }}>
      {board}
      {arrivals.length ? (
        <ArrivalFlight
          key={plan.key}
          arrivals={arrivals}
          // AC-808/AC-809: the flight reads the SAME clock the board's push-up
          // reads, so the arrival and the room being made for it cannot come
          // apart by a frame (src/ui/trajectory.js `flightAt`).
          turn={plan}
          clock={clock}
          cell={cell}
          boardH={boardH}
          gap={gap}
          compact={compact}
          reduced={reduced}
        />
      ) : null}
    </View>
  );
  const tray = unsupported ? null : (
    <Tray
      queue={run.view.queue}
      cells={run.view.queueCells}
      cell={cell}
      boardW={boardW}
      compact={compact}
      revealAt={arrivalLandsAt}
      reduced={reduced}
      frozen={run.view.charges.frozen}
    />
  );

  let body;
  if (unsupported) {
    // AC-116: a clear message, never a clipped or overflowing board.
    body = (
      <View style={styles.unsupported}>
        <Text style={theme.type.title}>Screen too small</Text>
        <Text style={[theme.type.body, styles.unsupportedCopy]}>
          Wildlife Shuffle needs a taller window to show all fifteen rows. Resize
          the window, or turn off Display Zoom, and the board will come back.
        </Text>
      </View>
    );
  } else if (wide) {
    // Stage W (AC-120-AC-122): the same components, rearranged into a rail.
    body = (
      <View style={styles.wideRow}>
        <View style={styles.wideBoard}>
          {boardGroup}
          <View style={{ height: gap }} />
          {tray}
        </View>
        <View style={[styles.rail, { width: railW }]}>
          <View style={styles.railTop}>
            <HudStats
              score={run.view.score}
              count={count}
              streak={run.view.streak}
              reduced={reduced}
              column
            />
            {/* AC-121: the rail carries the SAME components, rearranged — so
                the strip comes with the HUD rather than staying behind in a
                vertical stack that stage W does not have. It is sized against
                the rail's content width, because a rail is a width (AC-126). */}
            <BuffaloStrip
              chrome={chrome}
              rows={stripChips}
              countdown={run.view.buffaloIn}
              contentW={railSlots(railW).content}
              reduced={reduced}
              column
            />
            <IconButton glyph="❙❙" label="Pause" onPress={() => setPaused(true)} muted={!inputOpen} />
          </View>
          <View style={styles.railSpacer} />
          <ActionBar
            column
            chrome={chrome}
            screenW={railW}
            resolving={run.resolving}
            gameOver={run.view.gameOver}
            onPass={run.pass}
            ability={run.view.ability}
            grants={grants}
            reduced={reduced}
            targeting={targeting}
            status={status}
            onAbilities={() => setSheetOpen(true)}
            onCancelTarget={() => setArmed(null)}
          />
        </View>
      </View>
    );
  } else {
    body = (
      <>
        <Hud
          chrome={chrome}
          score={run.view.score}
          count={count}
          streak={run.view.streak}
          reduced={reduced}
          onPause={() => setPaused(true)}
          pauseMuted={!inputOpen}
        />
        {/* ui.md §7.1. Its height is reserved in the chrome budget whether or
            not it is showing (src/ui/layout.js CHROME), so a buffalo landing
            never moves the board under the player's finger. */}
        <BuffaloStrip
          chrome={chrome}
          rows={stripChips}
          countdown={run.view.buffaloIn}
          contentW={Math.max(0, width - GUTTER)}
          reduced={reduced}
        />
        {/* The board + tray group is a flex child centred in whatever remains. */}
        <View style={styles.centre}>
          {boardGroup}
          <View style={{ height: gap }} />
          {tray}
        </View>
        <ActionBar
          chrome={chrome}
          screenW={width}
          resolving={run.resolving}
          gameOver={run.view.gameOver}
          onPass={run.pass}
          ability={run.view.ability}
          grants={grants}
          reduced={reduced}
          targeting={targeting}
          status={status}
          onAbilities={() => setSheetOpen(true)}
          onCancelTarget={() => setArmed(null)}
        />
      </>
    );
  }

  return (
    <Animated.View
      style={[
        styles.screen,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
        shakeStyle,
      ]}
    >
      {body}
      {beatId ? (
        <OnboardingCoach
          beat={BEAT[beatId]}
          satisfied={beatDone}
          // Below the HUD in every stage that has one at the top; in stage W
          // the HUD is in the side rail and there is nothing above the board.
          top={insets.top + (wide ? 0 : chrome.hud + chrome.strip)}
          onNext={onboarding.onNext}
          onSkip={onboarding.onSkip}
        />
      ) : null}
      {paused && !settingsOpen && !run.view.gameOver ? (
        <PauseSheet
          reduced={reduced}
          onResume={() => setPaused(false)}
          onSettings={() => setSettingsOpen(true)}
          onHowToPlay={onHowToPlay}
          onRestart={() => {
            setPaused(false);
            run.restart();
          }}
          onQuit={onQuit}
        />
      ) : null}
      {settingsOpen ? <SettingsSheet onClose={() => setSettingsOpen(false)} /> : null}
      {sheetOpen && !paused && !run.view.gameOver ? (
        <AbilitySheet
          rows={run.view.abilityRows}
          reduced={reduced}
          onPick={pickAbility}
          onClose={() => setSheetOpen(false)}
        />
      ) : null}
      {run.view.gameOver && outcome && !onboarding ? (
        <GameOverSheet
          record={run.view.record}
          flagged={Boolean(run.guardRecord)}
          reduced={reduced}
          best={outcome.best}
          newBest={outcome.newBest}
          unlocked={announcements}
          onAgain={() => {
            progress.announce(announcements.map((u) => u.id));
            run.restart();
          }}
          onQuit={() => {
            progress.announce(announcements.map((u) => u.id));
            onQuit();
          }}
        />
      ) : null}
    </Animated.View>
  );
}

const STYLES = themed((T) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.colors.bg },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  wideRow: {
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: WIDE_GUTTER,
    gap: WIDE_GAP,
    alignItems: 'center',
  },
  wideBoard: { alignItems: 'flex-start', justifyContent: 'center' },
  rail: {
    alignSelf: 'stretch',
    justifyContent: 'center',
    gap: SPACE.lg,
    paddingVertical: SPACE.xl,
    // The rail's content width is what its controls have to fit in, and
    // `railSlots` is what reads it, so the padding is ITS constant (AC-126).
    paddingHorizontal: RAIL_PAD,
    backgroundColor: T.colors.panel,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: T.colors.hairline,
  },
  railTop: { gap: SPACE.md, alignItems: 'flex-start' },
  railSpacer: { flex: 1 },
  unsupported: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACE.xl,
    gap: SPACE.md,
  },
  unsupportedCopy: { textAlign: 'center' },
}));
