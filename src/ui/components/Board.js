// The board: one memoized cell layer, the danger pulse, the turn's clear
// announcements, one ghost, and the animals.
//
// Nothing in here re-renders during a drag (AC-831). The ghost is driven
// entirely by shared values the gesture worklet writes, so the legal/illegal
// feedback updates at touch rate with zero React involvement (AC-832).
//
// The clear layer is painted BEFORE the animals, so it sits under them: a row
// flash that outlived its own collapse must not haze over the animals falling
// through it, and a cleared body occupies a cell that is by definition now
// empty, so nothing can cover it up.

import React, { memo, useMemo } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { BOARD } from '../../engine/constants.js';
import { COLS, ROWS } from '../layout.js';
import { COLORS, RADIUS } from '../theme.js';
import { slideRanges } from '../occupancy.js';
import { inDangerBand } from '../replay.js';
import { AnimalView } from './AnimalView.js';
import { BoardCells } from './BoardCells.js';
import { ClearLayer, DangerPulse } from './ClearLayer.js';

function Ghost({ cell, drag }) {
  const style = useAnimatedStyle(() => {
    const legal = drag.ghostLegal.value === 1;
    return {
      opacity: drag.ghostVisible.value,
      width: drag.ghostSize.value * cell,
      transform: [
        { translateX: drag.ghostX.value * cell },
        { translateY: drag.ghostY.value },
      ],
      borderColor: legal ? COLORS.accent : COLORS.illegal,
      backgroundColor: legal ? COLORS.ghostFill : COLORS.illegalFill,
    };
  });

  return (
    <Animated.View
      style={[
        {
          pointerEvents: 'none',
          position: 'absolute',
          left: 0,
          top: 0,
          height: cell,
          borderWidth: 2,
          borderStyle: 'dashed',
          borderRadius: RADIUS.animal,
          zIndex: 10,
        },
        style,
      ]}
    />
  );
}

function BoardImpl({
  animals, cell, drag, clock, plan, reduced, sizeNumerals, highContrast, diagnostics,
  onCommit, onIllegal,
}) {
  // Recomputed when the board changes — never during a drag, because a drag
  // changes no React state until release.
  const ranges = useMemo(() => slideRanges(animals, BOARD.width), [animals]);
  const boardW = cell * COLS;

  return (
    <View
      testID="board"
      style={{
        width: boardW,
        height: cell * ROWS,
        backgroundColor: COLORS.board,
        borderRadius: RADIUS.tray,
        borderWidth: 1,
        borderColor: COLORS.hairline,
        overflow: 'hidden',
      }}
    >
      <BoardCells cell={cell} highContrast={highContrast} />
      <DangerPulse
        cell={cell}
        boardW={boardW}
        active={inDangerBand(animals)}
        reduced={reduced}
      />
      {plan ? (
        <ClearLayer
          key={plan.key}
          plan={plan}
          cell={cell}
          boardW={boardW}
          reduced={reduced}
          highContrast={highContrast}
        />
      ) : null}
      <Ghost cell={cell} drag={drag} />
      {animals.map((animal) => (
        <AnimalView
          key={animal.id}
          animal={animal}
          cell={cell}
          range={ranges[animal.id]}
          drag={drag}
          clock={clock}
          motion={plan ? plan.moves[animal.id] : null}
          reduced={reduced}
          sizeNumerals={sizeNumerals}
          highContrast={highContrast}
          diagnostics={diagnostics}
          onCommit={onCommit}
          onIllegal={onIllegal}
        />
      ))}
    </View>
  );
}

export const Board = memo(BoardImpl);
