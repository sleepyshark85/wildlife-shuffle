// The Game screen (S2). It owns the layout, the run, and nothing else.
//
// Cell size is computed here, once, by the one sizing function, and passed down
// as a prop. No child derives its own (AC-107). It is derived fresh from the
// current dimensions on every render and is never cached in state or in a
// module global (AC-118) — which is also what makes a fold, an unfold or a
// Display Zoom change a re-render rather than a special case (AC-127, AC-133).

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { STAGE, WIDE_GAP, WIDE_GUTTER, boardLayout, boardTrayGap } from '../layout.js';
import { COLORS, RADIUS, SPACE, TYPE } from '../theme.js';
import { useDragShared } from '../useDragShared.js';
import { useGameRun } from '../useGameRun.js';
import { ActionBar } from '../components/ActionBar.js';
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

  const run = useGameRun({ seed, difficulty });
  const drag = useDragShared();

  // THE one call. Insets are read as numbers and fed into the formula, never
  // used as an opaque wrapper view (ui.md §3.3).
  const layout = boardLayout(width, height, insets.top, insets.bottom);
  const { stage, cell, chrome, boardW, railW } = layout;

  const wide = stage === STAGE.WIDE;
  const compact = chrome.hud === 44;
  const unsupported = stage === STAGE.UNSUPPORTED;

  const inputOpen = !run.resolving && !run.view.gameOver && !paused && !unsupported;

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

  const board = unsupported ? null : (
    <Board
      animals={run.view.animals}
      cell={cell}
      drag={drag}
      onCommit={run.commitMove}
      onIllegal={run.markBlocked}
    />
  );
  const tray = unsupported ? null : (
    <Tray
      queue={run.view.queue}
      cells={run.view.queueCells}
      cell={cell}
      boardW={boardW}
      compact={compact}
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
          {board}
          <View style={{ height: SPACE.lg }} />
          {tray}
        </View>
        <View style={[styles.rail, { width: railW }]}>
          <View style={styles.railTop}>
            <HudStats
              score={run.view.score}
              streak={run.view.streak}
              buffalo={run.view.buffalo}
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
          onPause={() => setPaused(true)}
          pauseMuted={!inputOpen}
        />
        {/* The board + tray group is a flex child centred in whatever remains. */}
        <View style={styles.centre}>
          {board}
          <View style={{ height: boardTrayGap(chrome) }} />
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
    <View
      style={[
        styles.screen,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
      {body}
      {paused && !run.view.gameOver ? (
        <PauseSheet
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
          onAgain={() => run.restart(difficulty)}
          onQuit={onQuit}
        />
      ) : null}
    </View>
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
