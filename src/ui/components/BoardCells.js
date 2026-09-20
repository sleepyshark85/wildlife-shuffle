// AC-836: the 150 empty cells are ONE memoized component. It re-renders only
// when the cell size changes — i.e. on a resize, never during a run, and never
// during a drag (AC-831).
//
// v1 rebuilt all 150 cell views inline inside render, on every frame of every
// animation (src/components/GameGrid.js:73-94).

import React, { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { BOARD } from '../../engine/constants.js';
import { COLS, ROWS } from '../layout.js';
import { COLORS, RADIUS } from '../theme.js';

/** ui.md §7: 45 degree hazard stripes, drawn as rotated bars inside a clip. */
function HazardStripes({ width, height, pitch, color, thickness }) {
  const bars = [];
  const span = width + height;
  for (let i = 0, x = -height; x < span; i += 1, x += pitch) {
    bars.push(
      <View
        key={i}
        style={{
          position: 'absolute',
          left: x,
          top: -height,
          width: thickness,
          height: height * 3,
          backgroundColor: color,
          transform: [{ rotate: '45deg' }],
        }}
      />,
    );
  }
  return <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>{bars}</View>;
}

function BoardCellsImpl({ cell, highContrast }) {
  const boardW = cell * COLS;
  const cells = useMemo(() => {
    const out = [];
    for (let y = 0; y < ROWS; y += 1) {
      const danger = y >= BOARD.dangerBandLow && y <= BOARD.dangerBandHigh;
      const kill = y >= BOARD.killLine;
      for (let x = 0; x < COLS; x += 1) {
        out.push(
          <View
            key={`${x}.${y}`}
            style={{
              position: 'absolute',
              left: x * cell,
              top: (ROWS - 1 - y) * cell,
              width: cell,
              height: cell,
              backgroundColor: kill ? COLORS.bg : danger ? COLORS.dangerBand : COLORS.cell,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: danger || kill
                ? COLORS.dangerCellLine
                : highContrast
                  ? COLORS.cellLineHigh
                  : COLORS.cellLine,
            }}
          />,
        );
      }
    }
    return out;
  }, [cell, highContrast]);

  return (
    <View
      style={{
        pointerEvents: 'none',
        position: 'absolute',
        left: 0,
        top: 0,
        width: boardW,
        height: cell * ROWS,
      }}
    >
      {cells}
      {/* Row 14 is a hazard, never a playable row (ui.md §7, AC-109). */}
      <View
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: boardW,
          height: cell,
          overflow: 'hidden',
          borderBottomWidth: 1.5,
          borderBottomColor: COLORS.killLine,
          borderTopLeftRadius: RADIUS.tray,
          borderTopRightRadius: RADIUS.tray,
        }}
      >
        <HazardStripes
          width={boardW}
          height={cell}
          pitch={14}
          thickness={6}
          color="rgba(224,82,96,.13)"
        />
      </View>
    </View>
  );
}

export const BoardCells = memo(BoardCellsImpl);
