// The HUD (ui.md §3.1). Score, streak multiplier, buffalo chip, pause.
// The same components appear in the stage-W rail, rearranged (AC-121).
//
// Two things here are not obvious.
//
// **The count-up runs on the UI thread** (ui.md §8, 400 ms). A digit is not a
// transform, so this is the one place that needs `useAnimatedProps` rather than
// `useAnimatedStyle`: Reanimated can drive the `text` prop of a TextInput from
// a worklet and cannot drive the children of a <Text> from one. Driving it from
// JS would mean a timer and a re-render per frame, which AC-828 forbids. The
// visible number is therefore the (read-only, non-focusable) input; the <Text>
// behind it is transparent, gives the input a content-sized box — a web <input>
// does not size to its content, and a score that reflows as it ticks looks
// broken (AC-616) — and keeps the testID and the engine's true value, so
// anything reading the DOM reads the score rather than a frame of animation.
//
// **It starts when the board says so, not when React does** (AC-615). Keyed on
// the commit it finished 233-249 ms before the row it was paying for had even
// flashed: on an ARRIVAL clear the count-up ran 0-400 ms while the flash did
// not begin until 570. The HUD was answering before the board asked. The plan
// carries the start and the span (AC-615c: one sweep for the turn, never one
// per cascade step, which would restart the counter and jitter).
//
// ui.md §10 / AC-910d: at Dynamic Type xxLarge and above the HUD keeps its
// height and trades its labels for its values. The 10 pt uppercase labels are
// simultaneously the part that fails an accessibility size and the expendable
// part. VoiceOver is unaffected — the names are on `accessibilityLabel`
// (AC-910f), never on the visible label.

import React, { memo, useEffect } from 'react';
import { StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { hudHeight } from '../layout.js';
import { EASE, delay, timing } from '../motion.js';
import { COLORS, SPACE, TYPE, hudScale } from '../theme.js';
import { formatScore } from '../format.js';
import { BuffaloChip, IconButton, StreakPill } from './Controls.js';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

const ScoreValue = memo(function ScoreValue({ score, count, reduced, fontSize }) {
  const shown = useSharedValue(score);

  useEffect(() => {
    if (!count) {
      // No clear this turn — a restart, or the first render. Nothing to sweep.
      shown.value = score;
      return;
    }
    shown.value = delay(
      count.at,
      withTiming(score, timing(count.dur, EASE.cubicOut, reduced)),
    );
  }, [score, count, reduced, shown]);

  // `text` only, never `value`. Putting `value` in animatedProps makes the
  // input CONTROLLED, and React then re-renders it once a turn with no `value`
  // prop of its own and blanks it — measured as the score dropping to 0 and
  // sweeping up from there on every clearing turn, 18 times in a 45-turn run.
  // `defaultValue` keeps it uncontrolled, so React leaves the DOM value alone
  // between renders and Reanimated owns it.
  const animatedProps = useAnimatedProps(() => ({
    text: formatScore(shown.value),
  }));

  const type = [TYPE.score, { fontSize, lineHeight: fontSize }];
  return (
    <View
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={`Score ${score}`}
    >
      <Text allowFontScaling={false} testID="hud-score" style={[type, styles.scoreBox]}>
        {formatScore(score)}
      </Text>
      <AnimatedTextInput
        editable={false}
        focusable={false}
        allowFontScaling={false}
        importantForAccessibility="no-hide-descendants"
        defaultValue={formatScore(score)}
        animatedProps={animatedProps}
        style={[type, styles.scoreInk]}
      />
    </View>
  );
});

export const HudStats = memo(function HudStats({
  score, count, streak, buffalo, buffaloShrink, reduced, compact, column,
}) {
  // AC-910d: one Dynamic Type decision, made by a pure function in theme.js.
  const { fontScale } = useWindowDimensions();
  const { large, score: scoreSize } = hudScale(fontScale, compact);
  return (
    <View style={column ? styles.stack : styles.row}>
      <View>
        {large ? null : (
          <Text allowFontScaling={false} style={TYPE.label}>SCORE</Text>
        )}
        <ScoreValue score={score} count={count} reduced={reduced} fontSize={scoreSize} />
      </View>
      <View style={column ? styles.badgesColumn : styles.badgesRow}>
        {streak.show ? <StreakPill mult={streak.mult} large={large} /> : null}
        {buffalo ? (
          <BuffaloChip
            size={buffalo.size}
            shrink={buffaloShrink}
            reduced={reduced}
            large={large}
          />
        ) : null}
      </View>
    </View>
  );
});

export const Hud = memo(function Hud({
  chrome, score, count, streak, buffalo, buffaloShrink, reduced, onPause, pauseMuted,
}) {
  return (
    <View style={[styles.hud, { height: hudHeight(chrome) }]}>
      <HudStats
        score={score}
        count={count}
        streak={streak}
        buffalo={buffalo}
        buffaloShrink={buffaloShrink}
        reduced={reduced}
        compact={chrome.hud === 44}
      />
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
