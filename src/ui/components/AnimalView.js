// One animal, and the drag.
//
// This is the component the whole slice is about. v1's drag felt dead because
// PanResponder -> setState -> re-render means the piece CHASES your thumb by a
// frame or more instead of tracking it (docs/v1-review.md D3, ui.md §8.3 ¶2).
//
// Here the gesture is a Gesture.Pan() writing to Reanimated shared values. It
// runs on the UI thread. React learns the result on release only, through one
// runOnJS call carrying the final column (AC-830, AC-831). The legal/illegal
// ghost is computed in the gesture worklet from an occupancy snapshot taken at
// gesture start (AC-832) — computed in React it would lag the body by a render
// and the feedback would actively lie mid-drag.

import React, { memo, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { BOARD, SPECIES } from '../../engine/constants.js';
import { COLS, ROWS, hitSlopFor } from '../layout.js';
import { COLORS, MOTION, RADIUS, SEAM, SEAM_BUFFALO, SPECIES_STYLE } from '../theme.js';

const SNAP_EASING = Easing.bezier(0.22, 1, 0.36, 1);
const FALL_EASING = Easing.bezier(0.55, 0, 1, 0.45);

/**
 * Grab lift: 90 ms, `spring(.34, 1.4, .64, 1)` (ui.md §8, AC-818).
 *
 * That notation is not Reanimated's, and its middle terms are not in
 * Reanimated's units — a stiffness of 1.4 would not move. Reanimated's
 * duration-based spring is the faithful mapping: it takes the spec's 90 ms
 * directly as the perceptual duration, and `dampingRatio` 0.64 is the spec's
 * third term, which is the damping-ratio slot in that form. So the normative
 * number is the number in the code, rather than a hand-tuned mass/stiffness
 * pair that merely looks about right.
 */
const GRAB_SPRING = { duration: MOTION.grab, dampingRatio: 0.64 };

/** ui.md §5.2 cue 2: the body counts out its own footprint in `size` panels. */
function Panels({ size, cell, buffalo }) {
  const seams = [];
  for (let i = 1; i < size; i += 1) {
    seams.push(
      <View
        key={i}
        style={{
          position: 'absolute',
          left: i * cell,
          top: 4,
          bottom: 4,
          width: 1,
          backgroundColor: buffalo ? SEAM_BUFFALO : SEAM,
        }}
      />,
    );
  }
  return <>{seams}</>;
}

function AnimalViewImpl({ animal, cell, range, drag, onCommit, onIllegal }) {
  const { id, type, x, y, size } = animal;
  const style = SPECIES_STYLE[type] || SPECIES_STYLE.rat;
  const buffalo = type === SPECIES.buffalo.type;
  const width = size * cell;

  // ---- shared values: the only things that move -------------------------
  const tx = useSharedValue(x * cell);
  const ty = useSharedValue((ROWS - 1 - y) * cell);
  const homeX = useSharedValue(x * cell);
  const homeCol = useSharedValue(x);
  const grab = useSharedValue(0);
  const shake = useSharedValue(0);

  // The snapshot, mirrored onto the UI thread. The worklet takes its own copy
  // at gesture start, so nothing can move the goalposts mid-drag.
  const rangeMin = useSharedValue(range ? range.minX : 0);
  const rangeMax = useSharedValue(range ? range.maxX : COLS - size);
  const blockLeft = useSharedValue(range ? range.leftBlockerId : '');
  const blockRight = useSharedValue(range ? range.rightBlockerId : '');

  // Per-drag state. Per animal, never shared — v1 kept one dragStartXRef for the
  // whole board, so two fingers corrupted each other's origin (AC-409, D3).
  const armed = useSharedValue(0);
  const startPx = useSharedValue(0);
  const startEpoch = useSharedValue(0);
  const sMin = useSharedValue(0);
  const sMax = useSharedValue(0);
  const sLeft = useSharedValue('');
  const sRight = useSharedValue('');

  // ---- engine -> presentation, never the other way (ui.md §8.3 ¶3) ------
  //
  // `range` is in the dependency list on purpose, even though the body's
  // position does not read it: Board recomputes it from the animals array, so
  // it changes identity exactly when the board does. That makes this effect
  // RE-ASSERT the engine's position after every board change, not merely track
  // this animal's own x and y.
  //
  // Without that, a release whose commit the state layer declines — a second
  // finger arriving after the first has already taken the turn (AC-409) — would
  // leave the body parked at the column the worklet optimistically snapped it
  // to, with x and y both unchanged and nothing to bring it home. Presentation
  // would then disagree with state, silently, which is the whole class of bug
  // this rewrite exists to kill.
  useEffect(() => {
    homeX.value = x * cell;
    homeCol.value = x;
    tx.value = withTiming(x * cell, { duration: MOTION.snap, easing: SNAP_EASING });
    ty.value = withTiming((ROWS - 1 - y) * cell, { duration: MOTION.fall, easing: FALL_EASING });
  }, [x, y, cell, range, homeX, homeCol, tx, ty]);

  useEffect(() => {
    rangeMin.value = range ? range.minX : 0;
    rangeMax.value = range ? range.maxX : COLS - size;
    blockLeft.value = range ? range.leftBlockerId : '';
    blockRight.value = range ? range.rightBlockerId : '';
  }, [range, size, rangeMin, rangeMax, blockLeft, blockRight]);

  // ---- the gesture ------------------------------------------------------
  // Built once per animal per layout, never inside the render map (AC-410).
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .onBegin(() => {
          'worklet';
          if (drag.inputOpen.value !== 1) {
            armed.value = 0;
            return;
          }
          armed.value = 1;
          startPx.value = tx.value;
          startEpoch.value = drag.epoch.value;
          // THE SNAPSHOT (AC-832).
          sMin.value = rangeMin.value;
          sMax.value = rangeMax.value;
          sLeft.value = blockLeft.value;
          sRight.value = blockRight.value;

          grab.value = withSpring(1, GRAB_SPRING);
          drag.ghostSize.value = size;
          drag.ghostY.value = ty.value;
          drag.ghostX.value = homeCol.value;
          drag.ghostLegal.value = 1;
          drag.ghostVisible.value = 1;
        })
        .onUpdate((event) => {
          'worklet';
          if (armed.value !== 1) return;
          if (startEpoch.value !== drag.epoch.value) return; // AC-129
          // The body is clamped to the board: a slide is along a row, and a
          // piece that visibly leaves its own board reads as a bug. Collisions
          // are NOT clamped — pushing into a neighbour is how the player finds
          // out it is there, and the red ghost says why (AC-407).
          const maxPx = (COLS - size) * cell;
          let px = startPx.value + event.translationX;
          if (px < 0) px = 0;
          if (px > maxPx) px = maxPx;
          tx.value = px;

          // 0 ms smoothing: the ghost is decided by the same UI-thread frame
          // that delivered the touch.
          let col = Math.round(px / cell);
          if (col < 0) col = 0;
          if (col > COLS - size) col = COLS - size;
          const legal = col >= sMin.value && col <= sMax.value;
          drag.ghostX.value = col;
          drag.ghostLegal.value = legal ? 1 : 0;
          drag.blockedId.value = legal ? '' : col < sMin.value ? sLeft.value : sRight.value;
        })
        .onFinalize(() => {
          'worklet';
          if (armed.value !== 1) return;
          armed.value = 0;
          grab.value = withSpring(0, GRAB_SPRING);
          drag.ghostVisible.value = 0;
          drag.blockedId.value = '';

          // AC-129/AC-130: the board or the layout moved under the finger, so
          // the drag is cancelled, not committed. No turn is consumed.
          if (startEpoch.value !== drag.epoch.value) {
            tx.value = withTiming(homeX.value, { duration: MOTION.snap, easing: SNAP_EASING });
            return;
          }

          let col = Math.round(tx.value / cell);
          if (col < 0) col = 0;
          if (col > COLS - size) col = COLS - size;

          if (col === homeCol.value) {
            tx.value = withTiming(homeX.value, { duration: MOTION.snap, easing: SNAP_EASING });
            return;
          }
          if (col >= sMin.value && col <= sMax.value) {
            tx.value = withTiming(col * cell, { duration: MOTION.snap, easing: SNAP_EASING });
            runOnJS(onCommit)(id, col); // the one runOnJS (AC-831)
            return;
          }
          // AC-406: 3 x 6 pt shake, 260 ms. Pure announcement — it locks nothing.
          tx.value = withTiming(homeX.value, { duration: MOTION.snap, easing: SNAP_EASING });
          shake.value = withSequence(
            withTiming(-6, { duration: 43 }),
            withTiming(6, { duration: 87 }),
            withTiming(-6, { duration: 87 }),
            withTiming(0, { duration: 43 }),
          );
          runOnJS(onIllegal)(id);
        }),
    [
      cell, size, id, onCommit, onIllegal, drag, armed, startPx, startEpoch,
      sMin, sMax, sLeft, sRight, rangeMin, rangeMax, blockLeft, blockRight,
      grab, shake, tx, ty, homeX, homeCol,
    ],
  );

  // ---- animated styles: all read on the UI thread ------------------------
  const bodyStyle = useAnimatedStyle(() => {
    const blocked = drag.blockedId.value === id; // AC-407, without a render
    return {
      transform: [
        { translateX: tx.value + shake.value },
        { translateY: ty.value - 2 * grab.value },
        { scale: 1 + 0.04 * grab.value },
      ],
      zIndex: grab.value > 0.01 ? 20 : 1,
      borderWidth: blocked ? 2 : buffalo ? 2 : 1.5,
      borderColor: blocked ? COLORS.illegal : style.edge,
      shadowOpacity: 0.45 * grab.value,
    };
  });

  const danger = y >= BOARD.dangerBandLow;
  const glyph = Math.round(cell * 0.53);

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        testID={`animal-${id}`}
        hitSlop={hitSlopFor(width, cell)}
        accessibilityRole="button"
        accessibilityLabel={label(type, size, y, x)}
        accessibilityHint="Double tap and hold, then drag left or right"
        style={[
          {
            position: 'absolute',
            left: 0,
            top: 0,
            width,
            height: cell,
            borderRadius: RADIUS.animal,
            backgroundColor: style.fill,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#000',
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 6 },
          },
          danger && styles.danger,
          bodyStyle,
        ]}
      >
        <Panels size={size} cell={cell} buffalo={buffalo} />
        <Text
          allowFontScaling={false}
          style={{ fontSize: glyph, lineHeight: glyph * 1.2, color: style.glyph }}
        >
          {(SPECIES[type] || SPECIES.rat).emoji}
        </Text>
      </Animated.View>
    </GestureDetector>
  );
}

/** AC-901's shape, built here because row/column are a presentation transform. */
function label(type, size, y, x) {
  const name = type.charAt(0).toUpperCase() + type.slice(1);
  const columns = size === 1 ? `column ${x + 1}` : `columns ${x + 1} to ${x + size}`;
  return `${name}, size ${size}, row ${y + 1}, ${columns}`;
}

const styles = StyleSheet.create({
  // ui.md §5.4: anything in rows 11-13 wears the kill line at 40%.
  danger: { outlineWidth: 1, outlineColor: 'rgba(224,82,96,.4)', outlineStyle: 'solid' },
});

export const AnimalView = memo(AnimalViewImpl);
