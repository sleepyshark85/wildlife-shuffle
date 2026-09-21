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
import { CELL_ALPHA, paintedCell, texturedRow, translucent } from '../texture.js';
import { RADIUS } from '../theme.js';

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

function BoardCellsImpl({ cell, highContrast, colors }) {
  const boardW = cell * COLS;
  const cells = useMemo(() => {
    /**
     * AC-1507. The empty cells are what the natural background reads through,
     * and this is the whole of how: the cell is painted at `CELL_ALPHA` over
     * the board, in the colour that COMPOSITES BACK TO `colors.cell`. The
     * player sees the cell colour ui.md §4 specifies, before and after the
     * texture landed, and the grain shows through at half strength — which is
     * half of a ratio that was already capped at 1.25:1 (AC-1508).
     *
     * It is an rgba FILL rather than a view `opacity` on purpose: opacity
     * would fade the cell's own border with it, and the grid lines are not
     * part of the ground.
     */
    const over = translucent(paintedCell(colors.cell, colors.board), CELL_ALPHA);
    const out = [];
    for (let y = 0; y < ROWS; y += 1) {
      // ONE predicate decides both halves of AC-1511, so they cannot drift:
      // `texturedRow` is what the layer below sizes itself from, and a row it
      // says is not textured is a row that paints opaque here. `danger` is
      // then "flat, and not the kill row", rather than a second range.
      const textured = texturedRow(y);
      const kill = y >= BOARD.killLine;
      const danger = !textured && !kill;
      for (let x = 0; x < COLS; x += 1) {
        // AC-1511: the danger band and the kill row render FLAT. A texture
        // under a tint under a pulse is three things competing in the one
        // place the player most needs to read quickly, so these cells stay
        // opaque and the layer beneath them stops at the band (texture.js).
        out.push(
          <View
            key={`${x}.${y}`}
            style={{
              position: 'absolute',
              left: x * cell,
              top: (ROWS - 1 - y) * cell,
              width: cell,
              height: cell,
              backgroundColor: kill
                ? colors.bg
                : danger
                  ? colors.dangerBand
                  : over,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: danger || kill
                ? colors.dangerCellLine
                : highContrast
                  ? colors.cellLineHigh
                  : colors.cellLine,
            }}
          />,
        );
      }
    }
    return out;
    // `colors` is in the dependency list, not just read: a board theme that
    // repainted the animals but left the 135 memoized cells at the old palette
    // would be the right state rendered wrong, which is the failure shape
    // §6.7 of the process doc is about.
  }, [cell, highContrast, colors]);

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
          borderBottomColor: colors.killLine,
          borderTopLeftRadius: RADIUS.tray,
          borderTopRightRadius: RADIUS.tray,
        }}
      >
        <HazardStripes
          width={boardW}
          height={cell}
          pitch={14}
          thickness={6}
          color={colors.hazardStripe}
        />
      </View>
    </View>
  );
}

export const BoardCells = memo(BoardCellsImpl);
