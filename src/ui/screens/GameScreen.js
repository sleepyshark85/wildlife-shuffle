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

import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { STAGE, WIDE_GAP, WIDE_GUTTER, boardLayout, boardTrayGap } from '../layout.js';
import { EASE, delay, sequence, timing } from '../motion.js';
import { useSettings } from '../settings.js';
import { COLORS, MOTION, MOTION_SIZE, RADIUS, SPACE, TYPE } from '../theme.js';
import { useDragShared } from '../useDragShared.js';
import { useGameRun } from '../useGameRun.js';
import { ActionBar } from '../components/ActionBar.js';
import { ArrivalFlight } from '../components/ArrivalFlight.js';
import { Board } from '../components/Board.js';
import { Hud, HudStats } from '../components/Hud.js';
import { IconButton } from '../components/Controls.js';
import { Tray } from '../components/Tray.js';
import { GameOverSheet } from './GameOverSheet.js';
import { PauseSheet } from './PauseSheet.js';

export function GameScreen({ seed, difficulty, onQuit }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [paused, setPaused] = useState(false);
  const settings = useSettings();

  const run = useGameRun({ seed, difficulty });
  const drag = useDragShared();

  // THE one call. Insets are read as numbers and fed into the formula, never
  // used as an opaque wrapper view (ui.md §3.3).
  const layout = boardLayout(width, height, insets.top, insets.bottom);
  const { stage, cell, chrome, boardW, boardH, railW } = layout;

  const wide = stage === STAGE.WIDE;
  const compact = chrome.hud === 44;
  const unsupported = stage === STAGE.UNSUPPORTED;
  const { reduced, sizeNumerals, highContrast } = settings;

  const inputOpen = !run.resolving && !run.view.gameOver && !paused && !unsupported;
  const plan = run.view.plan;

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
  const gap = wide ? SPACE.lg : boardTrayGap(chrome);
  const arrivalLandsAt = arrivals.length ? arrivals[0].plan.at + arrivals[0].plan.dur : 0;
  const board = unsupported ? null : (
    <Board
      animals={run.view.animals}
      cell={cell}
      drag={drag}
      plan={plan}
      reduced={reduced}
      sizeNumerals={sizeNumerals}
      highContrast={highContrast}
      onCommit={run.commitMove}
      onIllegal={run.markBlocked}
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
    />
  );

  let body;
  if (unsupported) {
    // AC-116: a clear message, never a clipped or overflowing board.
    body = (
      <View style={styles.unsupported}>
        <Text allowFontScaling={false} style={TYPE.title}>Screen too small</Text>
        <Text allowFontScaling={false} style={[TYPE.body, styles.unsupportedCopy]}>
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
              streak={run.view.streak}
              buffalo={run.view.buffalo}
              reduced={reduced}
              column
            />
            <IconButton glyph="❙❙" label="Pause" onPress={() => setPaused(true)} muted={!inputOpen} />
          </View>
          <View style={styles.railSpacer} />
          <ActionBar
            column
            chrome={chrome}
            blocked={run.blocked}
            resolving={run.resolving}
            gameOver={run.view.gameOver}
            onPass={run.pass}
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
          streak={run.view.streak}
          buffalo={run.view.buffalo}
          reduced={reduced}
          onPause={() => setPaused(true)}
          pauseMuted={!inputOpen}
        />
        {/* The board + tray group is a flex child centred in whatever remains. */}
        <View style={styles.centre}>
          {boardGroup}
          <View style={{ height: gap }} />
          {tray}
        </View>
        <ActionBar
          chrome={chrome}
          blocked={run.blocked}
          resolving={run.resolving}
          gameOver={run.view.gameOver}
          onPass={run.pass}
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
      {paused && !run.view.gameOver ? (
        <PauseSheet
          reduced={reduced}
          onResume={() => setPaused(false)}
          onRestart={() => {
            setPaused(false);
            run.restart(difficulty);
          }}
          onQuit={onQuit}
        />
      ) : null}
      {run.view.gameOver ? (
        <GameOverSheet
          record={run.view.record}
          difficulty={difficulty}
          flagged={Boolean(run.guardRecord)}
          reduced={reduced}
          onAgain={() => run.restart(difficulty)}
          onQuit={onQuit}
        />
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
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
    paddingHorizontal: SPACE.md,
    backgroundColor: COLORS.panel,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.hairline,
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
});
