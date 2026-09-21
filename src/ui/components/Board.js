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
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { inDangerBand } from '../../engine/abilities.js';
import { BOARD } from '../../engine/constants.js';
import { isTarget, targetingChip } from '../abilities.js';
import { COLS, ROWS } from '../layout.js';
import { Z } from '../stacking.js';
import { COLORS, RADIUS, RECESS } from '../theme.js';
import { slideRanges } from '../occupancy.js';
import { useCosmetics } from '../progressStore.js';
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
          zIndex: Z.ghost,
        },
        style,
      ]}
    />
  );
}

/**
 * ui.md §5.5 — the origin recess: a hole in the board where the dragged animal
 * came from.
 *
 * The owner's report: *"when I'm dragging an animal out of its original
 * location, keep the preview of the original location until I actually place
 * it. Else I need to remember where it's originally been, which can cost me a
 * turn."* A move is the scarcest thing in the game — one per turn, no undo —
 * so losing track of the origin means either committing a move you did not
 * mean or spending the next one putting it back. This is what makes a drag
 * cancellable.
 *
 * WHY IT IS NOT AN OUTLINE, and AC-419 says any change that makes it one is a
 * defect. Mid-drag the board carries three things at three different points in
 * time — the origin (past), the body (present), the destination (future) — and
 * giving them three dashed outlines in three colours turns the board into a
 * diagram. So they get three different KINDS of treatment instead: recessed,
 * solid, outlined. Only one of the three is an outline, and it is the loud one,
 * because the destination is the thing that happens if you let go. The origin
 * reads as absence, which is semantically exact: it is the shape of where
 * something is not.
 *
 * The darkening is an overlay rather than a colour so it is automatically
 * right over the danger band's #2A1D24 as well as the normal #1A2833 — the
 * recess never has to know which ground it is standing on (AC-418).
 *
 * A low-contrast treatment is enough because the cue is carried by SIZE: a
 * 4-wide elephant leaves a 4-wide hole, 156 pt of shape at a 39 pt cell.
 *
 * AC-425: High Contrast trades the register deliberately. A recess is a
 * low-contrast device by nature, so it becomes an outline there — which does
 * put three on the board, but High Contrast has already changed the vocabulary
 * and legibility beats elegance for the player who turned it on.
 */
function OriginRecess({ cell, drag, highContrast }) {
  const frame = useAnimatedStyle(() => ({
    opacity: drag.originAlpha.value,
    width: drag.originSize.value * cell,
    transform: [
      { translateX: drag.originX.value * cell },
      { translateY: drag.originY.value },
    ],
  }));
  // The species tint is real work, not ornament: it is what ties the hole to
  // the piece in your hand.
  const tint = useAnimatedStyle(() => ({ backgroundColor: drag.originFill.value }));

  if (highContrast) {
    return (
      <Animated.View
        style={[
          {
            pointerEvents: 'none',
            position: 'absolute',
            left: 0,
            top: 0,
            height: cell,
            borderWidth: RECESS.highContrastWidth,
            borderStyle: 'dashed',
            borderColor: RECESS.highContrastEdge,
            borderRadius: RADIUS.animal,
            zIndex: Z.recess,
          },
          frame,
        ]}
      />
    );
  }

  return (
    <Animated.View
      style={[
        {
          pointerEvents: 'none',
          position: 'absolute',
          left: 0,
          top: 0,
          height: cell,
          backgroundColor: RECESS.darken,
          // 1 pt along the TOP of the footprint only. This is the whole of
          // what makes it read as pressed in rather than merely dark.
          borderTopWidth: RECESS.topEdgeWidth,
          borderTopColor: RECESS.topEdge,
          overflow: 'hidden',
          zIndex: Z.recess,
        },
        frame,
      ]}
    >
      <Animated.View
        style={[
          { ...StyleSheet.absoluteFillObject, opacity: RECESS.tintAlpha },
          tint,
        ]}
      />
    </Animated.View>
  );
}

function BoardImpl({
  animals, cell, drag, clock, plan, reduced, sizeNumerals, highContrast, diagnostics,
  onCommit, onIllegal, arming = null, onTarget, onCancelTarget,
}) {
  // Recomputed when the board changes — never during a drag, because a drag
  // changes no React state until release.
  const ranges = useMemo(() => slideRanges(animals, BOARD.width), [animals]);
  const boardW = cell * COLS;
  // AC-1011: a board theme repaints the ground and nothing else. `colors` is
  // the base palette with at most three keys replaced (src/ui/cosmetics.js).
  const { colors } = useCosmetics();

  return (
    <View
      testID="board"
      style={{
        width: boardW,
        height: cell * ROWS,
        backgroundColor: colors.board,
        borderRadius: RADIUS.tray,
        borderWidth: 1,
        borderColor: COLORS.hairline,
        overflow: 'hidden',
      }}
    >
      <BoardCells cell={cell} highContrast={highContrast} colors={colors} />
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
      {/* ui.md §13.3: the ground dims behind the targeting state, and the dim
          IS the cancel affordance — "a tap outside any valid target also
          cancels" (AC-1414).

          IT SHIPPED AT zIndex 2 OVER ANIMALS AT 1, with a comment claiming the
          opposite, and that made Burrow and Migrate unreachable by touch: the
          scrim won every hit test, so tapping a valid target cancelled. The
          z now comes from `src/ui/stacking.js`, where `Z.animal > Z.targetScrim`
          is arithmetic a test can read, and this sits after the ground layers
          (so it dims them) and before the animals (so it does not). */}
      {arming ? (
        <Pressable
          testID="target-scrim"
          onPress={onCancelTarget}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          style={[StyleSheet.absoluteFill, styles.scrim]}
        />
      ) : null}
      {/* Painted before the animals: the body starts ON TOP of its own recess
          and uncovers it as the drag moves off (AC-420). */}
      <OriginRecess cell={cell} drag={drag} highContrast={highContrast} />
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
          targeting={
            arming
              ? { valid: isTarget(arming, animal), copy: targetingChip(arming) }
              : null
          }
          onTarget={onTarget}
          onCancelTarget={onCancelTarget}
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

const styles = StyleSheet.create({
  /** The ground at 45%, which is `ui.md` §13.3's dim expressed as a scrim. */
  scrim: { backgroundColor: 'rgba(13,20,27,.55)', zIndex: Z.targetScrim },
});

export const Board = memo(BoardImpl);
