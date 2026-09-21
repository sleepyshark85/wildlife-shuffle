// AC-809 / ui.md §6: "the tray's animal views visibly travel from the tray
// strip into row 0 over 260 ms."
//
// This is the tray's promise being kept in front of the player. v1 showed a row
// of flat green occupancy squares and then re-rolled the positions anyway
// (GamePreview.js:33-46, gameStore.js:101-135) — it did not show *what* was
// coming, only where, and the where was a lie. Watching the exact animals rise
// out of the exact columns the strip drew them in is the most direct possible
// demonstration that this time it is true.
//
// Why a separate layer rather than the board's own views: the board clips
// (`overflow: hidden`), and it must, or an animal mid-fall would paint over the
// kill line and outside the frame's rounded corners. The flight therefore lives
// one level up, in the board+tray group, and hands over to the board's copy at
// the instant it lands — same column, same row, same frame, so the handover has
// nothing to see. The board's copy holds `opacity: 0` until then (AnimalView).
//
// AC-315e — SHADOW BECOMES ANIMAL. The tray shows silhouettes now, so the view
// that leaves the strip has to LEAVE AS ONE: it starts in the tray's own
// shadow colours and resolves into the animal over the last 160 ms of the
// 260 ms flight — fill blooming to the species colour, seams drawing in, glyph
// fading up. That is what keeps §6's proof literal. A flight that simply began
// as a finished animal would mean the view rising out of the tray was not the
// view the tray drew, and "this exact thing, from this exact column" would go
// back to being an assertion instead of a demonstration.
//
// The resolve is an ANNOUNCEMENT, not structure: it runs inside the flight's
// own MOTION.arrival, so it costs the input-lock budget nothing (AC-820).

import React, { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { SPECIES } from '../../engine/constants.js';
import { ROWS, trayMetrics } from '../layout.js';
import { Z } from '../stacking.js';
import { EASE, timing } from '../motion.js';
import { handoverWindow } from '../timeline.js';
import { HANDOVER_MS, MOTION } from '../theme.js';
import { flightAt, handedOver } from '../trajectory.js';
import { useCosmetics, useTheme } from '../progressStore.js';

const Flier = memo(function Flier({ animal, plan, clock, planKey, solo, cell, fromTop, bodyH, reduced }) {
  const cosmetics = useCosmetics();
  const theme = useTheme();
  const shadow = theme.silhouette;
  const style = cosmetics.species[animal.type] || cosmetics.species.rat;
  const buffalo = animal.type === SPECIES.buffalo.type;
  const toTop = (ROWS - 1) * cell;

  // ---- time: the board's clock, never a second one ----------------------
  //
  // This used to be three `withDelay`s. `withDelay` anchors to its OWN
  // animation's first frame, so the flight and the board's push-up — built in
  // the same commit but by different components — started a frame or more
  // apart, and the arrival was in the air before the board had begun to make
  // room for it. That is §6.7's incident, which the board was migrated off and
  // this layer was not: the owner reported "the board reacts a little bit late
  // and there is a short overlap between them".
  //
  // Now the flight is arithmetic on the same shared clock the board reads
  // (`flightAt` in trajectory.js, which imports nothing, so `node --test`
  // sweeps the very curve the UI thread renders). Nothing about the
  // choreography moved: the times are the plan's own `at` and `dur`.
  const at = plan.at;
  const dur = plan.dur;
  // ui.md §8.4 / AC-907: Reduce Motion clamps what MOVES, exactly as `rowAt`
  // clamps the board's keys — so both sides shorten by the same rule and stay
  // in phase. The HANDOVER is not clamped; see `handedOver`.
  const cap = reduced ? MOTION.reduced : 0;
  // The last 160 ms of the flight, so it FINISHES as it lands rather than
  // finishing early and flying the rest of the way as a completed animal.
  const resolve = handoverWindow(at, dur, HANDOVER_MS);
  const resolveAt = resolve.at;
  const resolveDur = resolve.dur;

  /**
   * ms into this turn, from the clock the board is on.
   *
   * A clock talking about a different turn says nothing about this flight, and
   * a turn that moves nothing never ramps one at all — both fall back to the
   * layer's own ramp (`solo`), which is the only thing here that is still an
   * animation rather than a reading of one.
   */
  const t = useDerivedValue(
    () => (clock.key.value === planKey ? clock.ms.value : solo.value),
    [clock, planKey, solo],
  );

  /** 0 = the tray's silhouette, 1 = the animal (AC-315e). */
  const become = useDerivedValue(
    () => flightAt(resolveAt, resolveDur, t.value, cap),
    [resolveAt, resolveDur, cap, t],
  );

  const flightStyle = useAnimatedStyle(() => {
    const travel = flightAt(at, dur, t.value, cap);
    return {
      // Hand over to the board's copy, which is holding at opacity 0 until now.
      opacity: handedOver(at, dur, t.value),
      height: bodyH + (cell - bodyH) * travel,
      transform: [
        { translateX: animal.x * cell },
        { translateY: fromTop + (toTop - fromTop) * travel },
      ],
    };
  });

  // Colour is interpolated rather than cross-faded between two stacked views:
  // one view is the whole point (AC-301/AC-315e), and two would be two.
  const skinStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      become.value,
      [0, 1],
      [buffalo ? shadow.buffaloFill : shadow.fill, style.fill],
    ),
    borderColor: interpolateColor(
      become.value,
      [0, 1],
      [buffalo ? shadow.buffaloRim : shadow.edge, style.edge],
    ),
    borderWidth: shadow.buffaloRimWidth
      + ((buffalo ? 2 : 1.5) - shadow.buffaloRimWidth) * become.value,
    borderRadius: shadow.radius + (5 - shadow.radius) * become.value,
  }));

  // Seams draw in and the glyph fades up on the same curve: both are species
  // detail, and both are absent from the strip.
  const detailStyle = useAnimatedStyle(() => ({ opacity: become.value }));

  const seams = [];
  for (let i = 1; i < animal.size; i += 1) {
    seams.push(
      <Animated.View
        key={i}
        style={[
          {
            position: 'absolute',
            left: i * cell,
            top: 3,
            bottom: 3,
            width: 1,
            backgroundColor: buffalo ? theme.seamBuffalo : theme.seam,
          },
          detailStyle,
        ]}
      />,
    );
  }

  const glyph = Math.round(cell * 0.46);
  return (
    <Animated.View
      style={[
        styles.inert,
        {
          position: 'absolute',
          left: 0,
          top: 0,
          width: animal.size * cell,
          alignItems: 'center',
          justifyContent: 'center',
        },
        skinStyle,
        flightStyle,
      ]}
    >
      {seams}
      <Animated.Text
        allowFontScaling={false}
        style={[
          { fontSize: glyph, lineHeight: glyph * 1.2, color: style.glyph },
          detailStyle,
        ]}
      >
        {cosmetics.glyph(animal.type)}
      </Animated.Text>
    </Animated.View>
  );
});

/**
 * @param {object[]} arrivals  the batch that just landed, with its plan entry
 * @param {object} turn        the turn's plan: its key, and whether it ramped
 * @param {object} clock       the board's shared clock (src/ui/useTurnClock.js)
 */
function ArrivalFlightImpl({ arrivals, turn, clock, cell, boardH, gap, compact, reduced }) {
  const { labelH, stripH, bodyH } = trayMetrics(cell, compact);
  // Where the strip drew it, measured from the board's own top-left.
  const fromTop = boardH + gap + labelH + (stripH - bodyH) / 2;

  /**
   * The clock for a turn that has none.
   *
   * `useTurnClock` does not ramp when `clockMs` is 0, and it is right not to:
   * there is no board movement to interpolate. But an arrival whose batch
   * props nothing up and whose columns all fall straight back leaves exactly
   * that — no keys anywhere, `clockMs` 0 — and it still has a flight to fly.
   * Measured over 580 bot turns across the three habitats: 29 of the 573 that
   * carried an arrival, one in twenty — and only 2 of those were the empty
   * board at the start of a run.
   *
   * So the layer carries its own ramp for that case, in the same shape
   * `useTurnCues` uses for its t=0 turns. It is one `withTiming` for the batch,
   * it exists only when the shared clock does not, and nothing on the board is
   * moving for it to be out of phase with.
   */
  const solo = useSharedValue(0);
  let span = 0;
  for (const { plan } of arrivals) span = Math.max(span, plan.at + plan.dur);
  useEffect(() => {
    if (turn.clockMs > 0 || span <= 0) return;
    solo.value = 0;
    // `false`, not `reduced`: this is a ramp of MILLISECONDS, like the board's
    // clock. Reduce Motion is applied to the motion read off it (`cap`), and
    // clamping the time itself would shorten the schedule twice.
    solo.value = withTiming(span, timing(span, EASE.linear, false));
  }, [turn, span, solo]);

  return (
    <View style={[StyleSheet.absoluteFill, styles.layer]}>
      {arrivals.map(({ animal, plan }) => (
        <Flier
          key={animal.id}
          animal={animal}
          plan={plan}
          clock={clock}
          planKey={turn.key}
          solo={solo}
          cell={cell}
          fromTop={fromTop}
          bodyH={bodyH}
          reduced={reduced}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  inert: { pointerEvents: 'none' },
  // Above the tray, which is painted after it in the group's document order.
  layer: { zIndex: Z.flight, overflow: 'visible', pointerEvents: 'none' },
});

export const ArrivalFlight = memo(ArrivalFlightImpl);
