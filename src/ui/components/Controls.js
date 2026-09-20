// The small shared controls: buttons that are always at least 44 pt of touch
// target (ui.md §9, AC-114, AC-415), the streak pill, and the buffalo chip.

import React, { memo, useCallback, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { COLORS, RADIUS, SPACE, TYPE } from '../theme.js';

const TOUCH = 44;

/**
 * AC-911: every interactive control shows a 2 pt accent ring at 2 pt offset
 * under keyboard or switch-control focus.
 *
 * It is React state rather than a shared value on purpose — focus is not a
 * gesture, it arrives at most a few times a second, and it must change a
 * *style* that the non-animated Pressable already owns. The board is not
 * involved, so AC-831's zero-commits-mid-drag is untouched.
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
 */
export const Button = memo(function Button({ label, onPress, muted, tone = 'primary', style, testID }) {
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
        allowFontScaling={false}
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
      <Text allowFontScaling={false} style={[styles.iconGlyph, muted && styles.inkMuted]}>
        {glyph}
      </Text>
    </Pressable>
  );
});

/** ui.md §3.1: the pill renders streakMult, never the raw counter. */
export const StreakPill = memo(function StreakPill({ mult }) {
  return (
    <View style={styles.pill}>
      <Text allowFontScaling={false} style={styles.pillText}>
        {`×${mult.toFixed(1)}`}
      </Text>
    </View>
  );
});

/** ui.md §5.3: four bars, filled for remaining segments, 22% for spent ones. */
export const BuffaloChip = memo(function BuffaloChip({ size }) {
  const bars = [];
  for (let i = 0; i < 4; i += 1) {
    bars.push(
      <View key={i} style={[styles.bar, i >= size && styles.barSpent]} />,
    );
  }
  return (
    <View
      style={styles.chip}
      accessible
      accessibilityLabel={`Buffalo, ${size} of 4 segments remaining`}
    >
      <Text allowFontScaling={false} style={styles.chipGlyph}>{'\u{1F403}'}</Text>
      {bars}
    </View>
  );
});

/** ui.md §10: one row per toggle, label and caption on the left. */
export const Toggle = memo(function Toggle({ label, caption, value, onChange }) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleCopy}>
        <Text allowFontScaling={false} style={TYPE.button}>{label}</Text>
        <Text allowFontScaling={false} style={TYPE.body}>{caption}</Text>
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
  pillText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.accent,
    fontVariant: ['tabular-nums'],
  },
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
  chipGlyph: { fontSize: 13, marginRight: 2 },
  bar: { width: 5, height: 12, borderRadius: 1, backgroundColor: '#E8B44A' },
  barSpent: { opacity: 0.22 },
});
