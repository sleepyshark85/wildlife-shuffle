// The bottom sheet both S3 (Pause) and S4 (Game Over) are built from.
//
// ui.md §8: the dim and the slide overlap — the dim starts at t=0 and the sheet
// at t=120, both done by 400 ms, so the player reaches their score in 400 ms
// rather than 580. Both are Reanimated worklets; the dim is an opacity-animated
// overlay view, never an animated filter, because RN cannot drive a filter from
// the UI thread (ui.md §8.1).

import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { EASE, delay, timing } from '../motion.js';
import { MOTION, RADIUS, SPACE, themed } from '../theme.js';
import { useTheme } from '../progressStore.js';

const SHEET_RISE = 280;

/**
 * `visible === false` plays the 220 ms exit and then calls `onClosed`. The
 * callback rides Reanimated's own completion callback through one `runOnJS`,
 * so the sheet's dismissal is still not a timer (AC-828) — nothing in this app
 * waits on `setTimeout` except the input lock and the BLOCKED label.
 */
export function Sheet({ title, subtitle, children, reduced, visible = true, onClosed, testID }) {
  const theme = useTheme();
  const styles = STYLES[theme.name];
  const dim = useSharedValue(0);
  const rise = useSharedValue(1);

  useEffect(() => {
    if (visible) {
      dim.value = withTiming(1, timing(MOTION.dim, EASE.out, reduced));
      rise.value = delay(
        reduced ? 0 : MOTION.sheetDelay,
        withTiming(0, timing(MOTION.sheet, EASE.out, reduced)),
      );
      return;
    }
    const done = onClosed;
    dim.value = withTiming(0, timing(MOTION.sheetOut, EASE.out, reduced));
    rise.value = withTiming(1, timing(MOTION.sheetOut, EASE.out, reduced), (finished) => {
      'worklet';
      if (finished && done) runOnJS(done)();
    });
  }, [dim, rise, reduced, visible, onClosed]);

  const dimStyle = useAnimatedStyle(() => ({ opacity: dim.value }));
  const sheetStyle = useAnimatedStyle(() => ({
    opacity: 1 - rise.value * 0.6,
    transform: [{ translateY: rise.value * SHEET_RISE }],
  }));

  return (
    <View style={[StyleSheet.absoluteFill, styles.passthrough]}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, dimStyle]} />
      <Animated.View testID={testID} style={[styles.sheet, sheetStyle]}>
        <View style={styles.grabber} />
        <Text style={theme.type.title}>{title}</Text>
        {subtitle ? (
          <Text style={theme.type.body}>{subtitle}</Text>
        ) : null}
        {children}
      </Animated.View>
    </View>
  );
}

const STYLES = themed((T) => StyleSheet.create({
  // The sheet and the scrim take touches; the gap above them does not.
  passthrough: { pointerEvents: 'box-none' },
  scrim: { backgroundColor: T.colors.scrim, pointerEvents: 'auto' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    gap: SPACE.md,
    padding: SPACE.xl,
    paddingBottom: SPACE.xxl,
    backgroundColor: T.colors.panel,
    borderTopLeftRadius: RADIUS.sheet,
    borderTopRightRadius: RADIUS.sheet,
    borderTopWidth: 1,
    borderColor: T.colors.hairline,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: RADIUS.pill,
    backgroundColor: T.colors.hairline,
    marginBottom: SPACE.xs,
  },
}));
