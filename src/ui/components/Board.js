// The board: one memoized cell layer, one ghost, and the animals.
//
// Nothing in here re-renders during a drag (AC-831). The ghost is driven
// entirely by shared values the gesture worklet writes, so the legal/illegal
// feedback updates at touch rate with zero React involvement (AC-832).

import React, { memo, useMemo } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { BOARD } from '../../engine/constants.js';
import { COLS, ROWS } from '../layout.js';
import { COLORS, RADIUS } from '../theme.js';
import { slideRanges } from '../occupancy.js';
import { AnimalView } from './AnimalView.js';
import { BoardCells } from './BoardCells.js';

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
      pointerEvents="none"
      style={[
        {
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

function BoardImpl({ animals, cell, drag, onCommit, onIllegal }) {
  // Recomputed when the board changes — never during a drag, because a drag
  // changes no React state until release.
  const ranges = useMemo(() => slideRanges(animals, BOARD.width), [animals]);

  return (
    <View
      testID="board"
      style={{
        width: cell * COLS,
        height: cell * ROWS,
        backgroundColor: COLORS.board,
        borderRadius: RADIUS.tray,
        borderWidth: 1,
        borderColor: COLORS.hairline,
        overflow: 'hidden',
      }}
    >
      <BoardCells cell={cell} />
      <Ghost cell={cell} drag={drag} />
      {animals.map((animal) => (
        <AnimalView
          key={animal.id}
          animal={animal}
          cell={cell}
          range={ranges[animal.id]}
          drag={drag}
          onCommit={onCommit}
          onIllegal={onIllegal}
        />
      ))}
    </View>
  );
}

export const Board = memo(BoardImpl);
