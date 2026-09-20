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

import React, { memo, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { SPECIES } from '../../engine/constants.js';
import { ROWS, trayMetrics } from '../layout.js';
import { EASE, delay, timing } from '../motion.js';
import { SEAM, SEAM_BUFFALO, SPECIES_STYLE } from '../theme.js';

const Flier = memo(function Flier({ animal, plan, cell, fromTop, bodyH, reduced }) {
  const style = SPECIES_STYLE[animal.type] || SPECIES_STYLE.rat;
  const buffalo = animal.type === SPECIES.buffalo.type;
  const toTop = (ROWS - 1) * cell;

  const travel = useSharedValue(0);
  const alpha = useSharedValue(1);

  useEffect(() => {
    travel.value = delay(plan.at, withTiming(1, timing(plan.dur, EASE.out, reduced)));
    // Hand over to the board's copy, which is holding at opacity 0 until now.
    alpha.value = delay(plan.at + plan.dur, withTiming(0, timing(1, EASE.out, reduced)));
  }, [plan.at, plan.dur, reduced, travel, alpha]);

  const flightStyle = useAnimatedStyle(() => ({
    opacity: alpha.value,
    height: bodyH + (cell - bodyH) * travel.value,
    transform: [
      { translateX: animal.x * cell },
      { translateY: fromTop + (toTop - fromTop) * travel.value },
    ],
  }));

  const seams = [];
  for (let i = 1; i < animal.size; i += 1) {
    seams.push(
      <View
        key={i}
        style={{
          position: 'absolute',
          left: i * cell,
          top: 3,
          bottom: 3,
          width: 1,
          backgroundColor: buffalo ? SEAM_BUFFALO : SEAM,
        }}
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
          borderRadius: 5,
          borderWidth: buffalo ? 2 : 1.5,
          borderColor: style.edge,
          backgroundColor: style.fill,
          alignItems: 'center',
          justifyContent: 'center',
        },
        flightStyle,
      ]}
    >
      {seams}
      <Text
        allowFontScaling={false}
        style={{ fontSize: glyph, lineHeight: glyph * 1.2, color: style.glyph }}
      >
        {(SPECIES[animal.type] || SPECIES.rat).emoji}
      </Text>
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
