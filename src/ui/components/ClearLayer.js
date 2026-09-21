// The clear: the one thing in this slice the owner asked for by name.
//
// ui.md §8.2a. The owner watched Slice 2 — which had no clear animation at all,
// so rows vanished between frames — and said it was "too abrupt … should be
// more natural and slower, maybe a little bit of flashing". The designer's
// answer is not simply "longer": abruptness is an attack/decay problem.
//
//   flash      320 ms, 60 ms attack and 260 ms decay, ONE flash, not a train
//   lead beat   80 ms, first step of a resolution only — announce, then go
//   collapse   110 ms, scale to 0.85 and drift 6 pt down
//   fade       runs 140 ms past the collapse, as an announcement
//
// The flash is an announcement (AC-813c), so its 320 ms costs the input-lock
// budget nothing. Only the 110 ms collapse is structural. That is the whole
// reason the flash could be more than doubled without moving AC-822 by a
// millisecond, and it is why nothing in this file may be allowed to creep into
// `timeline.js`.
//
// Everything here mounts on the same React commit that applied the turn and is
// replaced by the next turn's layer. Nothing unmounts on a timer, because there
// is no timer: each view plays its `withDelay` sequence and then sits at zero
// opacity until the plan that owns it is replaced (AC-828).

import React, { memo, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { BOARD, SPECIES } from '../../engine/constants.js';
import { ROWS } from '../layout.js';
import { EASE, delay, sequence, timing } from '../motion.js';
import { MOTION, MOTION_SIZE, RADIUS, themed } from '../theme.js';
import { useCosmetics, useTheme } from '../progressStore.js';

/**
 * Row index to pixels from the board's top.
 *
 * `'worklet'` — and the directive is the whole of the fix for the crash that
 * made the first TestFlight build unplayable.
 *
 * `Departing`, `Shard` and `Float` each call this from inside a
 * `useAnimatedStyle`, and all three exist ONLY when a row clears. Without the
 * directive this is a plain JS function, and a plain function captured by a
 * worklet is serialized to the UI runtime as a Remote Function — a stub whose
 * entire body is `throw new Error('[Worklets] Tried to synchronously call a
 * Remote Function')` (react-native-worklets/src/memory/remoteFunctionUnpacker
 * .native.ts). So the first clear threw on the UI thread, inside Reanimated's
 * CADisplayLink callback, where there is no JS frame to catch it: Hermes
 * raised a pending error, `__cxa_throw` found no handler, `std::terminate`
 * called `abort()`. SIGABRT, every time, on the first clear.
 *
 * `remoteFunctionUnpacker` has no `.web` counterpart, and that is exactly why
 * nothing we own saw it. On web a worklet is an ordinary closure on the JS
 * thread and `rowTop` is simply `rowTop`, so 375 Node tests and every browser
 * run were structurally incapable of reproducing it.
 *
 * The directive ADDS a capability and removes none, so the three render-path
 * callers below are unchanged — `formatScore` in src/ui/format.js is the same
 * pattern for the same reason.
 *
 * `test/hygiene.test.js` now audits the property this broke: every function
 * called from inside a worklet must itself be a worklet.
 */
const rowTop = (y, cell) => {
  'worklet';
  return (ROWS - 1 - y) * cell;
};
const BAND_LOW = BOARD.dangerBandLow;
const BAND_HIGH = BOARD.dangerBandHigh;

/**
 * The asymmetric flash, as one shared value driven once.
 *
 * Under Reduce Motion it becomes the ≤120 ms cross-fade of ui.md §8.4 — the
 * announcement survives, the shape of it does not.
 */
function useFlash(at, peak, reduced) {
  const flash = useSharedValue(0);
  useEffect(() => {
    flash.value = delay(
      at,
      sequence(
        withTiming(peak, timing(MOTION.flashAttack, EASE.out, reduced)),
        withTiming(0, timing(MOTION.flashDecay, EASE.inOut, reduced)),
      ),
    );
  }, [at, peak, reduced, flash]);
  return flash;
}

/**
 * One run of same-kind cells in the anticipated row. Its own component because
 * each run needs its own `useAnimatedStyle`, and a hook cannot live in a loop.
 */
const WashRun = memo(function WashRun({ wash, peak, left, width, top, height, testID }) {
  // `flashRow`, not `flash`: this sits on the BOARD GROUND rather than on a
  // body, and a white wash over bone at 0.14 announces nothing (theme.js).
  const theme = useTheme();
  const styles = STYLES[theme.name];
  const style = useAnimatedStyle(() => ({ opacity: wash.value * peak }));
  return (
    <Animated.View
      testID={testID}
      style={[
        styles.inert,
        { position: 'absolute', left, top, width, height, backgroundColor: theme.colors.flashRow },
        style,
      ]}
    />
  );
});

/** Contiguous runs of equal `occupied` value, as [{from, to, occupied}]. */
function runsOf(occupied) {
  const runs = [];
  for (let i = 0; i < occupied.length; i += 1) {
    const last = runs[runs.length - 1];
    if (last && last.occupied === occupied[i]) last.to = i + 1;
    else runs.push({ from: i, to: i + 1, occupied: occupied[i] });
  }
  return runs;
}

/**
 * AC-824d, PROVISIONAL: anticipation.
 *
 * On an ARRIVAL clear nothing is announced for 570 ms — snap, settle and the
 * push-up all happen first, and no amount of tuning the flash changes that
 * (ui.md §8.2b). But the engine resolved the whole turn before the first frame
 * played, so the presentation layer already KNOWS which row the arrival is
 * about to complete. Washing it in across the push-up puts the player's eye on
 * the row before the flash lands on it. True information shown early, in the
 * same category as the honest tray preview — not a guess.
 *
 * TWO values, not one. A row about to complete is nearly full, so a uniform
 * band renders as a lit gap whatever its nominal alpha. That is the better cue
 * — the gap is where the arriving animals are about to land — so it is asked
 * for deliberately: 0.14 on the cells the arrival fills, 0.05 on the bodies
 * already there, which keeps the gap reading as part of a row rather than as a
 * floating cell. AC-824d2: those two are separate levers and raising them
 * together is the failure that turns a focus into a smear.
 *
 * It hands over to the flash rather than adding to it: the wash fades out over
 * the flash's own attack, so the peak stays AC-813e's 0.22 rather than
 * stacking.
 */
const AnticipationRow = memo(function AnticipationRow({ row, plan, cell, reduced }) {
  const wash = useSharedValue(0);
  useEffect(() => {
    const holdFor = Math.max(0, plan.handoverAt - (plan.at + plan.dur));
    wash.value = sequence(
      delay(plan.at, withTiming(1, timing(plan.dur, EASE.inOut, reduced))),
      delay(holdFor, withTiming(0, timing(MOTION.flashAttack, EASE.out, reduced))),
    );
  }, [plan.at, plan.dur, plan.handoverAt, reduced, wash]);

  const top = rowTop(row.row, cell);
  return (
    <>
      {runsOf(row.occupied).map((run) => (
        <WashRun
          key={run.from}
          testID={`anticipate-${row.row}-${run.occupied ? 'filled' : 'gap'}`}
          wash={wash}
          peak={run.occupied ? MOTION_SIZE.anticipateFilled : MOTION_SIZE.anticipateGap}
          left={run.from * cell}
          width={(run.to - run.from) * cell}
          top={top}
          height={cell}
        />
      ))}
    </>
  );
});

/** "These rows are the ones going." Full board width, behind the bodies. */
const FlashRow = memo(function FlashRow({ row, at, cell, boardW, reduced }) {
  const theme = useTheme();
  const styles = STYLES[theme.name];
  const flash = useFlash(at, MOTION_SIZE.flashRowPeak, reduced);
  const style = useAnimatedStyle(() => ({ opacity: flash.value }));
  return (
    <Animated.View
      style={[
        styles.inert,
        {
          position: 'absolute',
          left: 0,
          top: rowTop(row, cell),
          width: boardW,
          height: cell,
          backgroundColor: theme.colors.flashRow,
        },
        style,
      ]}
    />
  );
});

/**
 * An animal that has been cleared.
 *
 * It is not in `state.animals` any more — the engine removed it before the
 * first frame played. It is drawn from the replay plan, which remembers where
 * it was standing at the step that took it (src/ui/replay.js).
 */
const Departing = memo(function Departing({ dep, cell, reduced, highContrast }) {
  const cosmetics = useCosmetics();
  const theme = useTheme();
  const styles = STYLES[theme.name];
  const style = cosmetics.species[dep.type] || cosmetics.species.rat;
  const buffalo = dep.type === SPECIES.buffalo.type;
  const flash = useFlash(dep.flashAt, MOTION_SIZE.flashPeak, reduced);
  const go = useSharedValue(0);
  const fade = useSharedValue(1);

  useEffect(() => {
    go.value = delay(dep.collapseAt, withTiming(1, timing(MOTION.collapse, EASE.collapse, reduced)));
    // AC-813d: the opacity fade runs 140 ms past the structural window. Things
    // that leave should look like they went somewhere.
    fade.value = delay(
      dep.collapseAt,
      withTiming(0, timing(MOTION.collapse + MOTION.fadePast, EASE.cubicOut, reduced)),
    );
  }, [dep.collapseAt, reduced, go, fade]);

  const bodyStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [
      { translateX: dep.x * cell },
      { translateY: rowTop(dep.y, cell) + MOTION_SIZE.collapseDrift * go.value },
      { scale: 1 - (1 - MOTION_SIZE.collapseScale) * go.value },
    ],
  }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));

  const seams = [];
  for (let i = 1; i < dep.size; i += 1) {
    seams.push(
      <View
        key={i}
        style={{
          position: 'absolute',
          left: i * cell,
          top: 4,
          bottom: 4,
          width: highContrast ? 1.5 : 1,
          backgroundColor: buffalo ? theme.seamBuffalo : theme.seam,
        }}
      />,
    );
  }

  const glyph = Math.round(cell * 0.53);
  return (
    <Animated.View
      testID={`clearing-${dep.id}`}
      style={[
        styles.inert,
        {
          position: 'absolute',
          left: 0,
          top: 0,
          width: dep.size * cell,
          height: cell,
          borderRadius: RADIUS.animal,
          backgroundColor: style.fill,
          borderWidth: highContrast ? 2.5 : buffalo ? 2 : 1.5,
          // AC-1512: the ground's opposite, so the 2.5 pt rim survives bone.
          borderColor: highContrast ? theme.colors.hcEdge : style.edge,
          alignItems: 'center',
          justifyContent: 'center',
        },
        bodyStyle,
      ]}
    >
      {seams}
      <Text
        allowFontScaling={false}
        style={{ fontSize: glyph, lineHeight: glyph * 1.2, color: style.glyph }}
      >
        {cosmetics.glyph(dep.type)}
      </Text>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: theme.colors.flash, borderRadius: RADIUS.animal },
          flashStyle,
        ]}
      />
    </Animated.View>
  );
});

/** AC-812: the segment that cracks off a shrinking buffalo, and falls. */
const Shard = memo(function Shard({ shard, cell, reduced }) {
  const theme = useTheme();
  const styles = STYLES[theme.name];
  const fill = theme.species.buffalo;
  const go = useSharedValue(0);
  useEffect(() => {
    go.value = delay(
      shard.at,
      withTiming(1, timing(MOTION.buffaloCrack + MOTION.buffaloShrink, EASE.fall, reduced)),
    );
  }, [shard.at, reduced, go]);

  const style = useAnimatedStyle(() => ({
    opacity: 1 - go.value,
    transform: [
      { translateX: shard.x * cell },
      { translateY: rowTop(shard.y, cell) + cell * 0.9 * go.value },
      { rotate: `${18 * go.value}deg` },
    ],
  }));

  return (
    <Animated.View
      style={[
        styles.inert,
        {
          position: 'absolute',
          left: 0,
          top: 0,
          width: cell,
          height: cell,
          borderRadius: RADIUS.animal,
          backgroundColor: fill.fill,
          borderWidth: 2,
          borderColor: fill.edge,
        },
        style,
      ]}
    />
  );
});

/** ui.md §8: where the points came from. 900 ms, rise 46 pt, ease-out. */
const Float = memo(function Float({ float, cell, boardW, reduced }) {
  const theme = useTheme();
  const styles = STYLES[theme.name];
  const go = useSharedValue(0);
  useEffect(() => {
    go.value = delay(float.at, withTiming(1, timing(MOTION.float, EASE.cubicOut, reduced)));
  }, [float.at, reduced, go]);

  const style = useAnimatedStyle(() => ({
    // In and out on the same curve: up fast, gone slowly.
    opacity: go.value < 0.12 ? go.value / 0.12 : 1 - (go.value - 0.12) / 0.88,
    transform: [{ translateY: rowTop(float.y, cell) - MOTION_SIZE.floatRise * go.value }],
  }));

  return (
    <Animated.View
      style={[
        styles.inert,
        { position: 'absolute', left: 0, top: 0, width: boardW, alignItems: 'center' },
        style,
      ]}
    >
      <View style={styles.floatChip}>
        <Text allowFontScaling={false} style={[styles.float, TONE[theme.name][float.tone] || null]}>
          {float.text}
        </Text>
      </View>
    </Animated.View>
  );
});

const TONE = themed((T) => ({
  score: { color: T.colors.accent },
  buffalo: { color: T.species.buffalo.edge },
  perfect: { color: T.colors.success },
}));

/**
 * The whole announcement layer for one turn.
 *
 * `key`-ed on the plan by its caller, so a new turn mounts a new layer and the
 * previous one goes with it. That is the only thing that ever removes these
 * views — no timer holds them, and no timer needs to (AC-828).
 *
 * The caller renders this only when there IS a plan; there is deliberately no
 * guard here, because a guard would be the second place that decides.
 */
function ClearLayerImpl({ plan, cell, boardW, reduced, highContrast }) {
  const styles = STYLES[useTheme().name];
  return (
    <View style={[StyleSheet.absoluteFill, styles.inert]}>
      {plan.anticipate
        ? plan.anticipate.rows.map((row) => (
          <AnticipationRow
            key={`anticipate-${row.row}`}
            row={row}
            plan={plan.anticipate}
            cell={cell}
            reduced={reduced}
          />
        ))
        : null}
      {plan.flashes.map((flash) =>
        flash.rows.map((row) => (
          <FlashRow
            key={`${flash.key}-${row}`}
            row={row}
            at={flash.at}
            cell={cell}
            boardW={boardW}
            reduced={reduced}
          />
        )),
      )}
      {plan.departures.map((dep) => (
        <Departing
          key={dep.key}
          dep={dep}
          cell={cell}
          reduced={reduced}
          highContrast={highContrast}
        />
      ))}
      {plan.shards.map((shard) => (
        <Shard key={shard.key} shard={shard} cell={cell} reduced={reduced} />
      ))}
      {plan.floats.map((float) => (
        <Float key={float.key} float={float} cell={cell} boardW={boardW} reduced={reduced} />
      ))}
    </View>
  );
}

/**
 * ui.md §7 / AC-810, AC-835: the danger band's ambient pulse.
 *
 * A `withRepeat` worklet, so an infinite loop costs zero JS frames. Driven from
 * JS it would be a permanent tax on every other animation in the game — which
 * is exactly how v1 would have written it.
 */
export const DangerPulse = memo(function DangerPulse({ cell, boardW, active, reduced }) {
  const theme = useTheme();
  const styles = STYLES[theme.name];
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (!active) {
      pulse.value = withTiming(0, timing(MOTION.reduced * 2, EASE.inOut, reduced));
      return;
    }
    if (reduced) {
      // AC-907: a static wash. No loop at all, not a slower one.
      pulse.value = withTiming(MOTION_SIZE.dangerStatic, timing(MOTION.reduced, EASE.inOut, true));
      return;
    }
    pulse.value = MOTION_SIZE.dangerPulseLow;
    pulse.value = withRepeat(
      sequence(
        withTiming(MOTION_SIZE.dangerPulseHigh, timing(MOTION.dangerPulse / 2, EASE.inOut, false)),
        withTiming(MOTION_SIZE.dangerPulseLow, timing(MOTION.dangerPulse / 2, EASE.inOut, false)),
      ),
      -1,
      false,
    );
  }, [active, reduced, pulse]);

  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return (
    <Animated.View
      testID="danger-pulse"
      style={[
        styles.inert,
        {
          position: 'absolute',
          left: 0,
          top: rowTop(BAND_HIGH, cell),
          width: boardW,
          height: (BAND_HIGH - BAND_LOW + 1) * cell,
          backgroundColor: theme.colors.dangerWash,
        },
        style,
      ]}
    />
  );
});

const STYLES = themed((T) => StyleSheet.create({
  inert: { pointerEvents: 'none' },
  /**
   * A chip rather than a text shadow. `textShadow*` is the only form RN 0.86
   * has and the form react-native-web 0.21 deprecates, so either platform gets
   * a warning; a solid ground also reads better over five saturated fills.
   */
  floatChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADIUS.pill,
    backgroundColor: T.colors.floatChip,
  },
  float: {
    fontSize: 17,
    lineHeight: 20,
    fontWeight: '800',
    letterSpacing: -0.2,
    color: T.colors.accent,
    fontVariant: ['tabular-nums'],
  },
}));

export const ClearLayer = memo(ClearLayerImpl);
