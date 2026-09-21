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
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { BOARD, SPECIES } from '../../engine/constants.js';
import { CUE } from '../cues.js';
import { fireCue } from '../cuePlayer.js';
import { registerProbe, releaseProbe } from '../diagnostics.js';
import { COLS, ROWS, hitSlopFor } from '../layout.js';
import { EASE, delay, sequence, spring, timing } from '../motion.js';
import { TARGET_DIM } from '../abilities.js';
import { Z } from '../stacking.js';
import { rowAt } from '../trajectory.js';
import { useCosmetics, useTheme } from '../progressStore.js';
import { MOTION, MOTION_SIZE, RADIUS, edgeLit, themed } from '../theme.js';

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
  const theme = useTheme();
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
          // AC-1512: High Contrast takes the ground's opposite, so a seam
          // that was white on slate is near-black on bone.
          backgroundColor: highContrast
            ? theme.colors.hcSeam
            : buffalo
              ? theme.seamBuffalo
              : theme.seam,
        }}
      />,
    );
  }
  return <>{seams}</>;
}

function AnimalViewImpl({
  animal, cell, range, drag, clock, motion, reduced, sizeNumerals, highContrast,
  diagnostics, onCommit, onIllegal, targeting = null, onTarget, onCancelTarget,
}) {
  const { id, type, x, y, size } = animal;
  // AC-1011: an applied unlock substitutes the species' appearance here and
  // changes nothing else. The value is a stable object from one context, so
  // reading it costs no commit during a drag (src/ui/progressStore.js).
  const cosmetics = useCosmetics();
  const theme = useTheme();
  const styles = STYLES[theme.name];
  const style = cosmetics.species[type] || cosmetics.species.rat;
  const buffalo = type === SPECIES.buffalo.type;
  const width = size * cell;
  // ui.md §5.4's 12%, away from the ground rather than always upward: on bone
  // a brighter edge is a edge closer to the board (theme.js `edgeLit`).
  const lifted = useMemo(
    () => edgeLit(style.edge, theme, MOTION_SIZE.edgeBrighten),
    [style.edge, theme],
  );
  // Captured for the worklets below, which may only read what already existed.
  const illegalEdge = theme.colors.illegal;
  const hcEdge = theme.colors.hcEdge;
  /**
   * Captured for the gesture worklet, which cannot look a species up: the
   * recess is tinted 12% toward the piece in the player's hand.
   */
  const speciesFill = style.fill;
  /** Which turn this animal's schedule belongs to; see `ty` below. */
  const trackKey = motion ? motion.key : '';

  // ---- shared values: the only things that move -------------------------
  const tx = useSharedValue(x * cell);
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

  // ---- vertical position: derived, never assigned ------------------------
  //
  // `ty` used to be a shared value carrying its own `withSequence` of delays.
  // That made every animal count from ITS OWN first frame, and building twenty
  // of them straddles a vsync: five animals with byte-identical schedules were
  // measured starting on two different frames. One frame of drift is a quarter
  // of a row, a stack has no slack, and the animals visibly crossed — which is
  // what the owner saw as "they appear to be different animals".
  //
  // Now there is ONE clock for the board and position is arithmetic on it, so
  // two animals with the same schedule are in the same place because they are
  // the same function, not because they were lucky. `rowAt` is a plain tested
  // function as well as a worklet, so `node --test` sweeps the very trajectory
  // the UI thread renders (test/overlap.test.js).
  const track = useMemo(
    () => ({
      startY: motion && motion.startY !== undefined ? motion.startY : y,
      keys: motion ? motion.keys : [],
    }),
    [motion, y],
  );
  const cap = reduced ? MOTION.reduced : 0;
  const ty = useDerivedValue(() => {
    // A clock talking about a different turn says nothing about this animal's
    // schedule, so the schedule is read as not yet started — `-1`, which puts
    // the animal exactly where its keys begin, which is where the previous
    // turn left it. That is the state for the one commit between a new plan
    // arriving and the clock being restarted.
    const t = clock.key.value === trackKey ? clock.ms.value : -1;
    return (ROWS - 1 - rowAt(track.startY, track.keys, t, cap)) * cell;
  }, [track, cap, cell, trackKey, clock]);

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
    // AC-1411's slide, and the reason it needs a schedule at all.
    //
    // Every other x change in this game arrives ALREADY APPLIED: the gesture
    // worklet moved the body on the frame the finger lifted, and this line only
    // re-asserts it. A Stampede moves animals nobody touched, so without a
    // start time the whole board would jump to its packed columns on the commit
    // — the state right, the board right, and the herd teleporting. That is
    // §6.7's question asked before the fact rather than after it.
    //
    // `tx` is still ASSERTED on every path: the slide only changes WHEN it
    // arrives, never whether it does.
    const slide = motion ? motion.slide : null;
    if (slide) {
      tx.value = delay(slide.at, withTiming(x * cell, timing(slide.dur, EASE.out, reduced)));
    } else {
      tx.value = withTiming(x * cell, timing(MOTION.snap, EASE.out, reduced));
    }

    // Vertical position is derived from the shared clock above, not assigned
    // here: that is what stops two animals in a stack from drifting apart.
    // The land squash still belongs to the animal, because it is an
    // announcement rather than a position (AC-807), and it is allowed to be
    // still playing when the next turn's input opens.
    if (motion && motion.landAt !== null && !reduced) {
      squash.value = delay(
        motion.landAt,
        sequence(
          withTiming(1, timing(MOTION.squash * 0.3, EASE.out, reduced)),
          withSpring(0, spring(MOTION.squash * 0.7, 0.5, reduced)),
        ),
      );
    }

    // AC-809, and the reason this is OUT here rather than in the branch above.
    //
    // Visibility is a RESTING property — "is this animal on the board" — so it
    // is re-asserted on every board change, exactly like the position two
    // statements up. It used to be restored inside the `else`, which meant an
    // arriving animal that landed and then did not move had no keys, took the
    // `if`, and never got its alpha back. Invisible for the rest of the run,
    // and on every later turn `motion.arrival` is null so nothing could ever
    // restore it. Every test we had compared positions, and the positions were
    // right: the board filled with correctly-placed invisible animals.
    //
    // The rule the bug is an instance of: a value that expresses engine state
    // is asserted unconditionally; only a self-terminating announcement (the
    // land squash, the shake) may live in one arm.
    if (motion && motion.arrival) {
      // The flight owns the animal until it lands; then this one takes over at
      // the identical coordinate, so the handover has no visible seam. The
      // explicit 0 matters when the effect re-runs mid-flight — a resize, say —
      // because `delay` holds whatever the value currently is.
      alpha.value = 0;
      alpha.value = delay(
        motion.arrival.at + motion.arrival.dur,
        withTiming(1, timing(1, EASE.out, reduced)),
      );
    } else {
      alpha.value = 1;
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
    x, cell, width, range, motion, reduced,
    homeX, homeCol, tx, squash, bodyW, alpha,
  ]);

  // The diagnostic log asks each animal what it actually RENDERED, so a
  // divergence from the engine shows up as two columns that disagree rather
  // than as a symptom the player has to describe. Registered from an effect,
  // never from render, and only while the log is on.
  useEffect(() => {
    if (!diagnostics) return undefined;
    registerProbe(id, () => ({
      col: Math.round(tx.value / cell),
      row: ROWS - 1 - Math.round(ty.value / cell),
      cells: Math.round(bodyW.value / cell),
      alpha: alpha.value,
      // The flight hands over at the very END of the turn's timeline, while
      // AC-824f deliberately ends the LOCK early by the commit gap — so the
      // log samples an arriving animal a few tens of ms before its handover
      // fires, and would otherwise cry wolf on every arrival. Saying it is
      // arriving costs nothing: the fault this log exists for is an alpha that
      // never comes back, and by the next turn `arriving` is false.
      arriving: Boolean(motion && motion.arrival),
    }));
    return () => releaseProbe(id);
  }, [diagnostics, id, cell, motion, tx, ty, bodyW, alpha]);

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
          // AC-1101/AC-1102 and ui.md §5.4 — "the selection haptic fires with
          // it". With the LIFT, in the same worklet frame as the touch, which
          // is the only place it can be: React never learns a drag began.
          //
          // AC-831 survives this hop because `fireCue` is a module-level plain
          // function over module-level state (src/ui/cuePlayer.js), exactly as
          // `recordTurn` is — it renders nothing, so "zero re-renders of the
          // board mid-drag" stays literally true.
          runOnJS(fireCue)(CUE.grab, 1);
          drag.ghostSize.value = size;
          drag.ghostY.value = ty.value;
          drag.ghostX.value = homeCol.value;
          drag.ghostLegal.value = 1;
          drag.ghostVisible.value = 1;

          // THE ORIGIN RECESS (ui.md §5.5, AC-420/AC-423). Written once, here,
          // in the same worklet frame as the lift — and deliberately NOT
          // suppressed at zero displacement. The body starts on top of it and
          // uncovers it as the drag moves off, which is the animal walking off
          // its own footprint; gating that would be a rule for hiding
          // something already hidden.
          drag.originX.value = homeCol.value;
          drag.originY.value = ty.value;
          drag.originSize.value = size;
          drag.originFill.value = speciesFill;
          drag.originAlpha.value = 1;
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
          // AC-421/AC-422: ONE rule for all three outcomes — accepted,
          // rejected, cancelled — and it is the body's own 110 ms, so the two
          // converge to nothing together. On a rejection it must not outlive
          // the shake: a recess still showing under a body that has come home
          // marks "where this came from" as the place it now is, which is
          // meaningless and reads as a second piece. The shake then plays on
          // the body alone.
          //
          // Reduce Motion keeps it (AC-424). Only the fade is motion, and
          // 110 ms is already inside the 120 ms cross-fade ceiling — so
          // `snapConfig` is right for both, and the affordance that prevents a
          // wasted turn is the last thing that should go when everything else
          // has been made quieter.
          drag.originAlpha.value = withTiming(0, snapConfig);

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
            runOnJS(fireCue)(CUE.drop, 1);
            runOnJS(onCommit)(id, col); // the one that carries the column (AC-831)
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
          // ui.md §8's motion table names the haptic on this row explicitly:
          // `notificationError` (AC-1102).
          runOnJS(fireCue)(CUE.illegal, 1);
          runOnJS(onIllegal)(id);
        }),
    [
      cell, size, id, reduced, onCommit, onIllegal, drag, armed, startPx, startEpoch,
      sMin, sMax, sLeft, sRight, rangeMin, rangeMax, blockLeft, blockRight,
      grab, shake, reject, tx, ty, homeX, homeCol, speciesFill,
    ],
  );

  // ---- animated styles: all read on the UI thread ------------------------
  const dim = targeting && !targeting.valid ? TARGET_DIM : 1;
  const bodyStyle = useAnimatedStyle(() => {
    // AC-407 mid-drag, ui.md §5.4 on release — both without a render.
    const blocked = drag.blockedId.value === id || reject.value > 0.5;
    const rim = highContrast ? 2.5 : buffalo ? 2 : 1.5;
    return {
      width: bodyW.value,
      // ui.md §13.3: in a targeting state everything that is not a valid target
      // dims. `dim` is 1 the rest of the time, so the resting property is still
      // asserted on every path and nothing can leave an animal faded.
      opacity: alpha.value * dim,
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
      zIndex: grab.value > 0.01 ? Z.grabbed : Z.animal,
      borderWidth: blocked ? 2 : rim,
      borderColor: blocked
        ? illegalEdge
        : highContrast
          ? hcEdge
          : interpolateColor(grab.value, [0, 1], [style.edge, lifted]),
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
          {cosmetics.glyph(type)}
        </Text>
        {targeting ? (
          // AC-1414, and EVERY animal gets one — valid or not.
          //
          // The first version gave the overlay only to valid targets and let
          // the rest fall through to the scrim. That was correct only while
          // the scrim was (wrongly) on top: now that the animals sit above it,
          // an invalid target with no overlay would swallow the tap into its
          // own suspended pan gesture, and the player would be stuck in a
          // targeting state that no longer cancels. So an invalid target
          // cancels, which is exactly what "a tap outside any valid target"
          // means to the player standing on one.
          <Pressable
            testID={targeting.valid ? `target-${id}` : `not-target-${id}`}
            onPress={targeting.valid ? () => onTarget(animal) : onCancelTarget}
            accessibilityRole="button"
            accessibilityLabel={targeting.valid ? targeting.copy : 'Cancel'}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        {sizeNumerals ? (
          // ui.md §10, AC-905 / AC-905b: the optional fifth size cue, on its
          // own chip so its contrast does not depend on the fill beneath it.
          <View style={styles.numeralChip}>
            <Text allowFontScaling={false} style={styles.numeral}>{size}</Text>
          </View>
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

const STYLES = themed((T) => StyleSheet.create({
  // ui.md §5.4: anything in rows 11-13 wears the kill line at 40%.
  danger: { outlineWidth: 1, outlineColor: T.colors.dangerOutline, outlineStyle: 'solid' },
  buffaloGlow: { boxShadow: `inset 0px 0px 12px ${T.colors.buffaloGlow}` },
  shadow: {
    pointerEvents: 'none',
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    boxShadow: `0px 6px 16px ${T.colors.grabShadow}`,
  },
  numeralChip: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    minWidth: 13,
    paddingHorizontal: 2,
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: T.numeral.chip,
  },
  numeral: {
    fontSize: T.numeral.size,
    lineHeight: T.numeral.size + 3,
    fontWeight: T.numeral.weight,
    color: T.numeral.ink,
    fontVariant: ['tabular-nums'],
  },
}));

export const AnimalView = memo(AnimalViewImpl);
