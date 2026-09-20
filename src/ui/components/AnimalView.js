// One animal: the drag, and the replay of everything the engine did to it.
//
// v1's drag felt dead because PanResponder -> setState -> re-render means the
// piece CHASES your thumb by a frame or more instead of tracking it
// (docs/v1-review.md D3, ui.md §8.3 ¶2). Here the gesture is a Gesture.Pan()
// writing to Reanimated shared values on the UI thread. React learns the result
// on release only, through one runOnJS call carrying the final column (AC-830,
// AC-831). The legal/illegal ghost is computed in the gesture worklet from an
// occupancy snapshot taken at gesture start (AC-832).
//
// The motion half is the same principle from the other side. `motion` is this
// animal's slice of the turn plan (src/ui/replay.js) — a list of already-decided
// positions with already-decided start times. It is fed to withSequence /
// withDelay / withTiming once, on the commit that applied the turn, and then the
// UI thread owns it (AC-828, AC-833). No frame of it is load-bearing: the board
// is `state.animals` and was correct before the first frame played (AC-834).

import React, { memo, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { BOARD, SPECIES } from '../../engine/constants.js';
import { COLS, ROWS, hitSlopFor } from '../layout.js';
import { EASE, delay, sequence, spring, timing } from '../motion.js';
import {
  COLORS, MOTION, MOTION_SIZE, RADIUS, SEAM, SEAM_BUFFALO, SPECIES_STYLE, brighten,
} from '../theme.js';

/**
 * Grab lift: 90 ms, `spring(.34, 1.4, .64, 1)` (ui.md §8, AC-818). See
 * motion.js `spring()` for why the middle terms are not carried across.
 *
 * These are module constants because the gesture worklet closes over them, and
 * a worklet may only capture values that are stable — rebuilding the gesture to
 * change an easing would drop a drag already in flight. None of them is longer
 * than the 120 ms Reduce Motion ceiling, so none of them needs a reduced twin.
 */
const grabConfig = spring(MOTION.grab, 0.64, false);
const snapConfig = timing(MOTION.snap, EASE.out, false);
const shakeIn = timing(MOTION.illegal / 6, EASE.illegal, false);
const shakeMid = timing(MOTION.illegal / 3, EASE.illegal, false);
/** AC-907: Reduce Motion replaces the shake with a static 400 ms red rim. */
const REJECT_RIM_REDUCED = 400;
/** The rim is a state, not a movement: it switches, it does not travel. */
const rimOn = timing(1, EASE.out, false);

/** ui.md §5.2 cue 2: the body counts out its own footprint in `size` panels. */
function Panels({ size, cell, buffalo, highContrast }) {
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
          width: highContrast ? 1.5 : 1,
          backgroundColor: highContrast
            ? 'rgba(255,255,255,.55)'
            : buffalo
              ? SEAM_BUFFALO
              : SEAM,
        }}
      />,
    );
  }
  return <>{seams}</>;
}

function AnimalViewImpl({
  animal, cell, range, drag, motion, reduced, sizeNumerals, highContrast, onCommit, onIllegal,
}) {
  const { id, type, x, y, size } = animal;
  const style = SPECIES_STYLE[type] || SPECIES_STYLE.rat;
  const buffalo = type === SPECIES.buffalo.type;
  const width = size * cell;
  const edgeLit = useMemo(() => brighten(style.edge, MOTION_SIZE.edgeBrighten), [style.edge]);

  // ---- shared values: the only things that move -------------------------
  const tx = useSharedValue(x * cell);
  const ty = useSharedValue((ROWS - 1 - y) * cell);
  const homeX = useSharedValue(x * cell);
  const homeCol = useSharedValue(x);
  const grab = useSharedValue(0);
  const shake = useSharedValue(0);
  const squash = useSharedValue(0);
  const reject = useSharedValue(0);
  const bodyW = useSharedValue(width);
  // AC-809: an arriving animal is in flight over the tray until it lands; the
  // board's copy of it is invisible until the flight hands over (ArrivalFlight).
  const alpha = useSharedValue(motion && motion.arrival ? 0 : 1);

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
    tx.value = withTiming(x * cell, timing(MOTION.snap, EASE.out, reduced));

    const keys = motion ? motion.keys : null;
    if (!keys || keys.length === 0) {
      ty.value = withTiming((ROWS - 1 - y) * cell, timing(MOTION.fall, EASE.fall, reduced));
    } else {
      // One sequence, built once, handed to the UI thread. The gaps are
      // `withDelay`, never a chained timer (AC-828): a step that is scheduled
      // 260 ms after the one before it waits on the UI thread's own clock.
      const steps = [];
      let cursor = 0;
      for (const key of keys) {
        const dur = reduced ? Math.min(key.dur, MOTION.reduced) : key.dur;
        const gap = Math.max(0, key.at - cursor);
        const ease = key.kind === 'fall' ? EASE.fall : EASE.out;
        steps.push(delay(gap, withTiming((ROWS - 1 - key.y) * cell, timing(dur, ease, reduced))));
        cursor = key.at + dur;
      }
      ty.value = steps.length === 1 ? steps[0] : sequence(...steps);

      // AC-807: it has weight, and it has stopped. Announcement only — this is
      // allowed to still be playing when the next turn's input opens.
      if (motion.landAt !== null && !reduced) {
        squash.value = delay(
          motion.landAt,
          sequence(
            withTiming(1, timing(MOTION.squash * 0.3, EASE.out, reduced)),
            withSpring(0, spring(MOTION.squash * 0.7, 0.5, reduced)),
          ),
        );
      }
      if (motion.arrival) {
        // The flight owns the animal until it lands; then this one takes over
        // at the identical coordinate, so the handover has no visible seam.
        alpha.value = delay(motion.arrival.at + motion.arrival.dur, withTiming(1, timing(1, EASE.out, reduced)));
      }
    }

    // AC-508/AC-812: the body springs to its new width. The panel count is
    // already the new one; the segment that left is drawn by the shard layer.
    const resize = motion ? motion.size : null;
    if (resize) {
      bodyW.value = delay(
        resize.at,
        withSpring(resize.to * cell, spring(MOTION.buffaloShrink, 0.62, reduced)),
      );
    } else {
      bodyW.value = width;
    }
  }, [
    x, y, cell, width, range, motion, reduced,
    homeX, homeCol, tx, ty, squash, bodyW, alpha,
  ]);

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

          grab.value = withSpring(1, grabConfig);
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
          grab.value = withSpring(0, grabConfig);
          drag.ghostVisible.value = 0;
          drag.blockedId.value = '';

          // AC-129/AC-130: the board or the layout moved under the finger, so
          // the drag is cancelled, not committed. No turn is consumed.
          if (startEpoch.value !== drag.epoch.value) {
            tx.value = withTiming(homeX.value, snapConfig);
            return;
          }

          let col = Math.round(tx.value / cell);
          if (col < 0) col = 0;
          if (col > COLS - size) col = COLS - size;

          if (col === homeCol.value) {
            tx.value = withTiming(homeX.value, snapConfig);
            return;
          }
          if (col >= sMin.value && col <= sMax.value) {
            tx.value = withTiming(col * cell, snapConfig);
            runOnJS(onCommit)(id, col); // the one runOnJS (AC-831)
            return;
          }
          // AC-406/AC-819: 3 x 6 pt shake, 260 ms. Pure announcement — it locks
          // nothing, so the next drag can begin on the following frame.
          tx.value = withTiming(homeX.value, snapConfig);
          // AC-907: Reduce Motion replaces the shake with a static red rim,
          // held for 400 ms instead of the shake's 260.
          reject.value = sequence(
            withTiming(1, rimOn),
            delay(reduced ? REJECT_RIM_REDUCED : MOTION.illegal, withTiming(0, rimOn)),
          );
          if (!reduced) {
            shake.value = sequence(
              withTiming(-MOTION_SIZE.illegalShake, shakeIn),
              withTiming(MOTION_SIZE.illegalShake, shakeMid),
              withTiming(-MOTION_SIZE.illegalShake, shakeMid),
              withTiming(0, shakeIn),
            );
          }
          runOnJS(onIllegal)(id);
        }),
    [
      cell, size, id, reduced, onCommit, onIllegal, drag, armed, startPx, startEpoch,
      sMin, sMax, sLeft, sRight, rangeMin, rangeMax, blockLeft, blockRight,
      grab, shake, reject, tx, ty, homeX, homeCol,
    ],
  );

  // ---- animated styles: all read on the UI thread ------------------------
  const bodyStyle = useAnimatedStyle(() => {
    // AC-407 mid-drag, ui.md §5.4 on release — both without a render.
    const blocked = drag.blockedId.value === id || reject.value > 0.5;
    const rim = highContrast ? 2.5 : buffalo ? 2 : 1.5;
    return {
      width: bodyW.value,
      opacity: alpha.value,
      transform: [
        { translateX: tx.value + shake.value },
        { translateY: ty.value - MOTION_SIZE.grabLift * grab.value },
        { scaleX: 1 + (MOTION_SIZE.grabScale - 1) * grab.value },
        {
          scaleY:
            (1 + (MOTION_SIZE.grabScale - 1) * grab.value) *
            (1 - (1 - MOTION_SIZE.squashScaleY) * squash.value),
        },
      ],
      zIndex: grab.value > 0.01 ? 20 : 1,
      borderWidth: blocked ? 2 : rim,
      borderColor: blocked
        ? COLORS.illegal
        : highContrast
          ? '#FFFFFF'
          : interpolateColor(grab.value, [0, 1], [style.edge, edgeLit]),
    };
  });

  // AC-805. The shadow is its own layer with an animated opacity rather than an
  // animated `shadowOpacity`, because react-native-web has deprecated the
  // `shadow*` props and does not fold an animated `shadowOpacity` into the
  // `boxShadow` it actually renders — so on web the specified shadow resolved
  // to `rgba(0,0,0,0) 0px 0px 0px`, i.e. nothing. `boxShadow` is the one form
  // RN 0.86 and react-native-web 0.21 both honour.
  const shadowStyle = useAnimatedStyle(() => ({ opacity: grab.value }));

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
          },
          // ui.md §5.3: the buffalo glows faintly from within, and is the only
          // piece on the board that does.
          buffalo && styles.buffaloGlow,
          danger && styles.danger,
          bodyStyle,
        ]}
      >
        <Animated.View style={[styles.shadow, { borderRadius: RADIUS.animal }, shadowStyle]} />
        <Panels size={size} cell={cell} buffalo={buffalo} highContrast={highContrast} />
        <Text
          allowFontScaling={false}
          style={{ fontSize: glyph, lineHeight: glyph * 1.2, color: style.glyph }}
        >
          {(SPECIES[type] || SPECIES.rat).emoji}
        </Text>
        {sizeNumerals ? (
          // ui.md §10, AC-905: the optional fifth size cue.
          <Text allowFontScaling={false} style={[styles.numeral, { color: style.glyph }]}>
            {size}
          </Text>
        ) : null}
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
  buffaloGlow: { boxShadow: 'inset 0px 0px 12px rgba(232,180,74,0.14)' },
  shadow: {
    pointerEvents: 'none',
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    boxShadow: '0px 6px 16px rgba(0,0,0,0.45)',
  },
  numeral: {
    position: 'absolute',
    right: 3,
    bottom: 1,
    fontSize: 10,
    lineHeight: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    opacity: 0.85,
  },
});

export const AnimalView = memo(AnimalViewImpl);
