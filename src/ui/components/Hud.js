// The HUD (ui.md §3.1). Score, streak multiplier, buffalo chip, pause.
// The same components appear in the stage-W rail, rearranged (AC-121).
//
// The score counts up over 400 ms (ui.md §8) and it does it on the UI thread,
// like everything else. A digit is not a transform, so this is the one place
// that needs `useAnimatedProps` rather than `useAnimatedStyle`: Reanimated can
// drive the `text` prop of a TextInput from a worklet, and cannot drive the
// children of a <Text> from one. Driving it from JS would mean a timer and a
// re-render per frame, which is exactly what AC-828 forbids.
//
// The visible number is therefore the (read-only, non-focusable) input; the
// <Text> behind it is transparent and exists to give the input a content-sized
// box, because a web <input> does not size to its content and a score that
// reflows as it ticks looks broken (ui.md §9). The Text also keeps the testID
// and the true value, so anything reading the DOM reads the engine's number
// rather than a frame of the animation.

import React, { memo, useEffect } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { hudHeight } from '../layout.js';
import { EASE, timing } from '../motion.js';
import { COLORS, MOTION, SPACE, TYPE } from '../theme.js';
import { formatScore } from '../format.js';
import { BuffaloChip, IconButton, StreakPill } from './Controls.js';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

const ScoreValue = memo(function ScoreValue({ score, reduced }) {
  const shown = useSharedValue(score);
  useEffect(() => {
    shown.value = withTiming(score, timing(MOTION.scoreCount, EASE.cubicOut, reduced));
  }, [score, reduced, shown]);

  const animatedProps = useAnimatedProps(() => ({
    text: formatScore(shown.value),
    // react-native-web maps `text` onto the input's value; `value` keeps the
    // native path in sync too, so neither platform needs a special case.
    value: formatScore(shown.value),
  }));

  return (
    <View
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={`Score ${score}`}
    >
      <Text
        allowFontScaling={false}
        testID="hud-score"
        style={[TYPE.score, styles.scoreBox]}
      >
        {formatScore(score)}
      </Text>
      <AnimatedTextInput
        editable={false}
        focusable={false}
        allowFontScaling={false}
        importantForAccessibility="no-hide-descendants"
        animatedProps={animatedProps}
        style={[TYPE.score, styles.scoreInk]}
      />
    </View>
  );
});

export const HudStats = memo(function HudStats({ score, streak, buffalo, reduced, column }) {
  return (
    <View style={column ? styles.stack : styles.row}>
      <View>
        <Text allowFontScaling={false} style={TYPE.label}>SCORE</Text>
        <ScoreValue score={score} reduced={reduced} />
      </View>
      <View style={column ? styles.badgesColumn : styles.badgesRow}>
        {streak.show ? <StreakPill mult={streak.mult} /> : null}
        {buffalo ? <BuffaloChip size={buffalo.size} /> : null}
      </View>
    </View>
  );
});

export const Hud = memo(function Hud({
  chrome, score, streak, buffalo, reduced, onPause, pauseMuted,
}) {
  return (
    <View style={[styles.hud, { height: hudHeight(chrome) }]}>
      <HudStats score={score} streak={streak} buffalo={buffalo} reduced={reduced} />
      <IconButton glyph="❙❙" label="Pause" onPress={onPause} muted={pauseMuted} />
    </View>
  );
});

const styles = StyleSheet.create({
  hud: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.hairline,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.lg, flex: 1 },
  stack: { gap: SPACE.md },
  badgesRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  badgesColumn: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  /** Sizes the box and carries the true value; never seen. */
  scoreBox: { opacity: 0 },
  scoreInk: {
    pointerEvents: 'none',
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    padding: 0,
    margin: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
});
