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
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { SPECIES } from '../../engine/constants.js';
import { ROWS, trayMetrics } from '../layout.js';
import { EASE, delay, timing } from '../motion.js';
import { handoverWindow } from '../timeline.js';
import { HANDOVER_MS, SEAM, SEAM_BUFFALO, SILHOUETTE } from '../theme.js';
import { useCosmetics } from '../progressStore.js';

const Flier = memo(function Flier({ animal, plan, cell, fromTop, bodyH, reduced }) {
  const cosmetics = useCosmetics();
  const style = cosmetics.species[animal.type] || cosmetics.species.rat;
  const buffalo = animal.type === SPECIES.buffalo.type;
  const toTop = (ROWS - 1) * cell;

  const travel = useSharedValue(0);
  const alpha = useSharedValue(1);
  /** 0 = the tray's silhouette, 1 = the animal (AC-315e). */
  const become = useSharedValue(0);

  useEffect(() => {
    travel.value = delay(plan.at, withTiming(1, timing(plan.dur, EASE.out, reduced)));
    // Hand over to the board's copy, which is holding at opacity 0 until now.
    alpha.value = delay(plan.at + plan.dur, withTiming(0, timing(1, EASE.out, reduced)));
    // The last 160 ms of the flight, so it FINISHES as it lands rather than
    // finishing early and flying the rest of the way as a completed animal.
    const resolve = handoverWindow(plan.at, plan.dur, HANDOVER_MS);
    become.value = delay(resolve.at, withTiming(1, timing(resolve.dur, EASE.out, reduced)));
  }, [plan.at, plan.dur, reduced, travel, alpha, become]);

  const flightStyle = useAnimatedStyle(() => ({
    opacity: alpha.value,
    height: bodyH + (cell - bodyH) * travel.value,
    transform: [
      { translateX: animal.x * cell },
      { translateY: fromTop + (toTop - fromTop) * travel.value },
    ],
  }));

  // Colour is interpolated rather than cross-faded between two stacked views:
  // one view is the whole point (AC-301/AC-315e), and two would be two.
  const skinStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      become.value,
      [0, 1],
      [buffalo ? SILHOUETTE.buffaloFill : SILHOUETTE.fill, style.fill],
    ),
    borderColor: interpolateColor(
      become.value,
      [0, 1],
      [buffalo ? SILHOUETTE.buffaloRim : SILHOUETTE.edge, style.edge],
    ),
    borderWidth: SILHOUETTE.buffaloRimWidth
      + ((buffalo ? 2 : 1.5) - SILHOUETTE.buffaloRimWidth) * become.value,
    borderRadius: SILHOUETTE.radius + (5 - SILHOUETTE.radius) * become.value,
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
            backgroundColor: buffalo ? SEAM_BUFFALO : SEAM,
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
 */
function ArrivalFlightImpl({ arrivals, cell, boardH, gap, compact, reduced }) {
  const { labelH, stripH, bodyH } = trayMetrics(cell, compact);
  // Where the strip drew it, measured from the board's own top-left.
  const fromTop = boardH + gap + labelH + (stripH - bodyH) / 2;
  return (
    <View style={[StyleSheet.absoluteFill, styles.layer]}>
      {arrivals.map(({ animal, plan }) => (
        <Flier
          key={animal.id}
          animal={animal}
          plan={plan}
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
  layer: { zIndex: 5, overflow: 'visible', pointerEvents: 'none' },
});

export const ArrivalFlight = memo(ArrivalFlightImpl);
