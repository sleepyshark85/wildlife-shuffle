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
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { COLORS, RADIUS, SPACE, TYPE } from '../theme.js';

const SHEET_EASING = Easing.bezier(0.22, 1, 0.36, 1);

export function Sheet({ title, subtitle, children, testID }) {
  const dim = useSharedValue(0);
  const rise = useSharedValue(1);

  useEffect(() => {
    dim.value = withTiming(1, { duration: 240, easing: SHEET_EASING });
    rise.value = withDelay(120, withTiming(0, { duration: 280, easing: SHEET_EASING }));
  }, [dim, rise]);

  const dimStyle = useAnimatedStyle(() => ({ opacity: dim.value }));
  const sheetStyle = useAnimatedStyle(() => ({
    opacity: 1 - rise.value * 0.6,
    transform: [{ translateY: rise.value * 280 }],
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View
        pointerEvents="auto"
        style={[StyleSheet.absoluteFill, styles.scrim, dimStyle]}
      />
      <Animated.View testID={testID} style={[styles.sheet, sheetStyle]}>
        <View style={styles.grabber} />
        <Text allowFontScaling={false} style={TYPE.title}>{title}</Text>
        {subtitle ? (
          <Text allowFontScaling={false} style={TYPE.body}>{subtitle}</Text>
        ) : null}
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: COLORS.scrim },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    gap: SPACE.md,
    padding: SPACE.xl,
    paddingBottom: SPACE.xxl,
    backgroundColor: COLORS.panel,
    borderTopLeftRadius: RADIUS.sheet,
    borderTopRightRadius: RADIUS.sheet,
    borderTopWidth: 1,
    borderColor: COLORS.hairline,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.hairline,
    marginBottom: SPACE.xs,
  },
});
