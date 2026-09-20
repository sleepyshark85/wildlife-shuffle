// The small shared controls: buttons that are always at least 44 pt of touch
// target (ui.md §9, AC-114, AC-415), the streak pill, and the buffalo chip.

import React, { memo, useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { EASE, delay, timing } from '../motion.js';
import { COLORS, RADIUS, SPACE, TYPE } from '../theme.js';

/**
 * ui.md §10 / AC-910c: sheets and overlays scale fully; fixed-height chrome
 * scales only as far as its box allows. A cap is not an exemption — the text
 * still grows, it just stops before it clips, which is what AC-910 ("no text
 * anywhere is clipped or truncated") actually asks for.
 */
export const CHROME_FONT_CAP = 1.5;

const TOUCH = 44;

/**
 * AC-911: every interactive control shows a 2 pt accent ring at 2 pt offset
 * under keyboard or switch-control focus.
 *
 * It is React state rather than a shared value on purpose — focus is not a
 * gesture, it arrives at most a few times a second, and it must change a
 * *style* that the non-animated Pressable already owns.
 *
 * It does cost commits, and the honest version of that is: pressing a button
 * and then starting a drag produces two root-level commits at pointer-down, as
 * the button blurs. They land inside the pointer-down..pointer-up window. What
 * AC-831 requires is that the BOARD does not re-render mid-drag, and that
 * holds — `Board` is memoized on props none of this touches, and a
 * MutationObserver over the board subtree during a drag sees only `style`
 * writes on the dragged animal. "Zero commits" was too strong a claim for this
 * comment to be making.
 */
export function useFocusRing() {
  const [focused, setFocused] = useState(false);
  const onFocus = useCallback(() => setFocused(true), []);
  const onBlur = useCallback(() => setFocused(false), []);
  return { focused, onFocus, onBlur };
}

/**
 * `muted` is not `disabled`. AC-413 wants the control to read as unavailable and
 * to keep its place in the layout; AC-414/AC-827 want the tap to be buffered
 * rather than swallowed. So the press still fires and the caller decides.
 *
 * `maxFontScale` is set by the action bar, whose height is part of the ladder's
 * chrome budget; on a sheet it is left open (AC-910b).
 */
export const Button = memo(function Button({
  label, onPress, muted, tone = 'primary', style, testID, maxFontScale,
}) {
  const primary = tone === 'primary';
  const ring = useFocusRing();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      onFocus={ring.onFocus}
      onBlur={ring.onBlur}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(muted) }}
      hitSlop={8}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.buttonPrimary : styles.buttonSecondary,
        muted && styles.buttonMuted,
        pressed && !muted && styles.buttonPressed,
        ring.focused && styles.focusRing,
        style,
      ]}
    >
      <Text
        maxFontSizeMultiplier={maxFontScale}
        style={[TYPE.button, primary ? styles.inkOnAccent : styles.inkOnPanel, muted && styles.inkMuted]}
      >
        {label}
      </Text>
    </Pressable>
  );
});

export const IconButton = memo(function IconButton({ glyph, label, onPress, muted }) {
  const ring = useFocusRing();
  return (
    <Pressable
      onPress={onPress}
      onFocus={ring.onFocus}
      onBlur={ring.onBlur}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(muted) }}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      style={({ pressed }) => [
        styles.icon,
        pressed && !muted && styles.buttonPressed,
        ring.focused && styles.focusRing,
      ]}
    >
      <Text
        maxFontSizeMultiplier={CHROME_FONT_CAP}
        style={[styles.iconGlyph, muted && styles.inkMuted]}
      >
        {glyph}
      </Text>
    </Pressable>
  );
});

/**
 * ui.md §3.1: the pill renders streakMult, never the raw counter.
 * AC-910d: it grows with the score when the HUD drops its labels.
 */
export const StreakPill = memo(function StreakPill({ mult, large }) {
  return (
    <View style={[styles.pill, large && styles.pillLarge]}>
      <Text allowFontScaling={false} style={[styles.pillText, large && styles.pillTextLarge]}>
        {`×${mult.toFixed(1)}`}
      </Text>
    </View>
  );
});

/** The segment that is leaving: full while the body is still wide, then spent. */
const SPENT = 0.22;

const Segment = memo(function Segment({ filled, leaving, reduced, large }) {
  const on = useSharedValue(filled || Boolean(leaving) ? 1 : SPENT);
  useEffect(() => {
    if (!leaving) {
      on.value = filled ? 1 : SPENT;
      return;
    }
    // AC-509b: the chip spends its segment on the BODY's 260 ms timeline, not
    // on the React commit. Committed, the chip read "1 of 4" beside a
    // two-cell-wide body for a quarter second — the HUD contradicting the
    // board about the one fact the chip exists to report.
    on.value = 1;
    on.value = delay(leaving.at, withTiming(SPENT, timing(leaving.dur, EASE.out, reduced)));
  }, [filled, leaving, reduced, on]);
  const style = useAnimatedStyle(() => ({ opacity: on.value }));
  return <Animated.View style={[styles.bar, large && styles.barLarge, style]} />;
});

/**
 * ui.md §5.3: four bars, filled for remaining segments, 22% for spent ones.
 *
 * `size` is already the post-shrink size, because it comes off the engine's
 * settled board. `shrink` is the plan entry for the same buffalo, and it is
 * what tells the bar at index `size` that it is the one on its way out.
 */
export const BuffaloChip = memo(function BuffaloChip({ size, shrink, reduced, large }) {
  const bars = [];
  for (let i = 0; i < 4; i += 1) {
    bars.push(
      <Segment
        key={i}
        filled={i < size}
        leaving={shrink && shrink.to === size && i === size ? shrink : null}
        reduced={reduced}
        large={large}
      />,
    );
  }
  return (
    <View
      style={[styles.chip, large && styles.chipLarge]}
      accessible
      accessibilityLabel={`Buffalo, ${size} of 4 segments remaining`}
    >
      <Text allowFontScaling={false} style={[styles.chipGlyph, large && styles.chipGlyphLarge]}>
        {'\u{1F403}'}
      </Text>
      {bars}
    </View>
  );
});

/** ui.md §10: one row per toggle, label and caption on the left. */
export const Toggle = memo(function Toggle({ label, caption, value, onChange }) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleCopy}>
        <Text style={TYPE.button}>{label}</Text>
        <Text style={TYPE.body}>{caption}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityRole="switch"
        accessibilityLabel={label}
        trackColor={{ false: COLORS.hairline, true: 'rgba(255,194,75,.5)' }}
        thumbColor={value ? COLORS.accent : COLORS.inkMuted}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  focusRing: {
    outlineWidth: 2,
    outlineColor: COLORS.accent,
    outlineStyle: 'solid',
    outlineOffset: 2,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACE.lg,
    minHeight: TOUCH,
  },
  toggleCopy: { flex: 1, gap: 2 },
  button: {
    minHeight: TOUCH,
    minWidth: TOUCH,
    paddingHorizontal: SPACE.lg,
    borderRadius: RADIUS.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimary: { backgroundColor: COLORS.accent },
  buttonSecondary: {
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.hairline,
  },
  buttonMuted: { opacity: 0.38 },
  buttonPressed: { opacity: 0.74 },
  inkOnAccent: { color: '#2A1C00' },
  inkOnPanel: { color: COLORS.ink },
  inkMuted: { color: COLORS.inkMuted },
  icon: {
    width: TOUCH,
    height: TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconGlyph: { fontSize: 17, color: COLORS.inkMuted, letterSpacing: 2 },
  pill: {
    paddingHorizontal: 10,
    height: 24,
    borderRadius: RADIUS.pill,
    backgroundColor: 'rgba(255,194,75,.14)',
    borderWidth: 1,
    borderColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillLarge: { height: 30, paddingHorizontal: 12 },
  pillText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.accent,
    fontVariant: ['tabular-nums'],
  },
  pillTextLarge: { fontSize: 16 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    height: 24,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.panelSunken,
    borderWidth: 1,
    borderColor: COLORS.hairline,
  },
  chipLarge: { height: 30, paddingHorizontal: 10 },
  chipGlyph: { fontSize: 13, marginRight: 2 },
  chipGlyphLarge: { fontSize: 16 },
  bar: { width: 5, height: 12, borderRadius: 1, backgroundColor: '#E8B44A' },
  barLarge: { width: 6, height: 16 },
});
