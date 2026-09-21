// The abilities control and its charge pips (ui.md §13.1).
//
// WHERE IT LIVES, AND WHAT IT COST. The HUD is at its chrome budget and the
// action bar held one button, so neither could grow: the ladder's chrome
// allowance is what guarantees the board fits, and spending a point of it on
// Layer D would take a row away from the board on the devices least able to
// afford one. So nothing grew. The abilities button takes the LEFT half of the
// existing 48/44 pt action bar, Pass keeps the right, and the turn-state line
// the bar used to hold moved into the HUD's spare right-hand column beside the
// pause control — which is exactly what ui.md §13.1 specifies, and it is
// specified that way for this reason.
//
// THE FOURTH PIP IS NOT A FOURTH SLOT. Three pips are the banked cap; the
// fourth is gold-rimmed, sits at 25% while empty, and only ever fills from Last
// Stand. The reserve therefore reads as "three, plus one you have not earned"
// rather than as a four-slot bar the player is failing to fill — which would be
// the UI reporting a reserve the economy does not offer (gameplay.md §13.2a).

import React, { memo, useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { pipAlpha, pipBloomTone } from '../abilities.js';
import { plural } from '../format.js';
import { EASE, delay, sequence, timing } from '../motion.js';
import { COLORS, COPY, MOTION, RADIUS, SPACE, TYPE } from '../theme.js';
import { CHROME_FONT_CAP, useFocusRing } from './Controls.js';

const TOUCH = 44;

/**
 * One pip. `bloom` is the grant that fills it this turn, or null.
 *
 * Opacity is a RESTING property here — it says how many charges are in hand —
 * so it is asserted on every render and only the bloom lives in a branch. That
 * is the rule the owner's invisible-animals bug produced (§6.7): a value that
 * expresses state is asserted unconditionally; only a self-terminating
 * announcement may live in one arm of a conditional.
 */
const Pip = memo(function Pip({ pip, bloom, tone, reduced }) {
  // `pipAlpha` is the WHOLE composition, and the component does no arithmetic
  // on it. It used to multiply by 0.55 here, which quietly took the gold pip's
  // specified 25% down to 13.75% while the test asserting the 25% passed.
  const rest = pipAlpha(pip);
  const restFill = pip.gold ? COLORS.lastStand : pip.filled ? COLORS.pip : COLORS.pipEmpty;
  const on = useSharedValue(rest);
  // ui.md §13.1: the gold is the EVENT. It rides its own value so the pip can
  // settle back to its ordinary fill afterwards — a grant is a moment, and
  // moments are announced rather than stored.
  const gold = useSharedValue(0);

  useEffect(() => {
    on.value = rest;
    gold.value = 0;
    if (!bloom) return;
    const dur = tone === 'lastStand' ? MOTION.lastStandBloom : MOTION.pipBloom;
    on.value = 0;
    on.value = delay(bloom.at, withTiming(rest, timing(dur, EASE.out, reduced)));
    if (tone !== 'lastStand') return;
    gold.value = delay(
      bloom.at,
      sequence(
        withTiming(1, timing(dur / 2, EASE.out, reduced)),
        withTiming(0, timing(dur / 2, EASE.out, reduced)),
      ),
    );
  }, [rest, bloom, tone, reduced, on, gold]);

  const style = useAnimatedStyle(() => ({
    opacity: on.value,
    backgroundColor: interpolateColor(gold.value, [0, 1], [restFill, COLORS.lastStand]),
  }));
  return <Animated.View style={[styles.pip, pip.gold && styles.pipRim, style]} />;
});

const ChargePips = memo(function ChargePips({ pips, grants, reduced }) {
  // A grant fills the pip at the index it took the count to — WHICHEVER pip
  // that is. Last Stand at 0 charges lands on pip 1, and the gold has to go
  // with it: that player is the whole reason the grant exists.
  const bloomFor = (pip) => {
    if (!grants) return null;
    return grants.find((g) => g.charges - 1 === pip.index) || null;
  };
  return (
    <View style={styles.pips}>
      {pips.map((pip) => (
        <Pip
          key={pip.index}
          pip={pip}
          bloom={bloomFor(pip)}
          tone={pipBloomTone(pip, grants)}
          reduced={reduced}
        />
      ))}
    </View>
  );
});

/**
 * ui.md §13.1/§13.4 and AC-1415.
 *
 * At zero charges the button is muted and STILL THERE: `muted` is opacity, not
 * a conditional render, so the bar cannot reflow when the count changes. A
 * control that vanishes at zero would move Pass under the player's thumb
 * between turns, which is AC-413's principle in a different costume.
 */
export const AbilityButton = memo(function AbilityButton({
  button, grants, reduced, showLabel = true, onPress, style,
}) {
  const ring = useFocusRing();
  const lastStand = grants ? grants.find((g) => g.reason === 'lastStand') : null;

  // The single #E8B44A pulse, and the label that rises from it. Both are
  // announcements: they finish on their own and gate nothing.
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (!lastStand) return;
    pulse.value = 0;
    pulse.value = delay(
      lastStand.at,
      sequence(
        withTiming(1, timing(MOTION.lastStandBloom / 2, EASE.out, reduced)),
        withTiming(0, timing(MOTION.lastStandBloom / 2, EASE.out, reduced)),
      ),
    );
  }, [lastStand, reduced, pulse]);

  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));
  const labelStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
    transform: [{ translateY: -14 * pulse.value }],
  }));

  return (
    <View style={style}>
      {/* Rendered only while the beat is playing. It used to sit in the tree
          permanently at opacity 0, which a screen reader announces at all
          times — a run-ending warning read out on a board that is fine. */}
      {lastStand ? (
        <Animated.Text
          maxFontSizeMultiplier={CHROME_FONT_CAP}
          style={[styles.lastStand, labelStyle]}
          pointerEvents="none"
        >
          {COPY.lastStand}
        </Animated.Text>
      ) : null}
      <Pressable
        testID="abilities"
        onPress={onPress}
        onFocus={ring.onFocus}
        onBlur={ring.onBlur}
        accessibilityRole="button"
        accessibilityLabel={`Abilities, ${plural(button.charges, 'charge')}`}
        accessibilityState={{ disabled: button.muted }}
        aria-disabled={button.muted}
        hitSlop={8}
        style={({ pressed }) => [
          styles.button,
          button.muted && styles.muted,
          pressed && !button.muted && styles.pressed,
          ring.focused && styles.focusRing,
        ]}
      >
        <Animated.View style={[styles.pulse, pulseStyle]} pointerEvents="none" />
        <Text
          maxFontSizeMultiplier={CHROME_FONT_CAP}
          numberOfLines={1}
          style={[TYPE.button, styles.label, button.muted && styles.labelMuted]}
        >
          {showLabel ? COPY.abilities : COPY.abilitiesGlyph}
        </Text>
        <ChargePips pips={button.pips} grants={grants} reduced={reduced} />
      </Pressable>
    </View>
  );
});

/**
 * ui.md §13.3 — the targeting chip, which REPLACES the action bar for the
 * duration rather than sitting beside it.
 *
 * Cancel is one tap and always free (AC-1414). Nothing here spends anything:
 * the charge is spent by the engine on the ABILITY action, which this component
 * cannot dispatch.
 */
export const TargetingChip = memo(function TargetingChip({ copy, onCancel, height }) {
  return (
    <View style={[styles.chip, { height }]}>
      <Text
        testID="targeting"
        maxFontSizeMultiplier={CHROME_FONT_CAP}
        accessibilityLiveRegion="polite"
        style={[TYPE.body, styles.chipCopy]}
      >
        {copy}
      </Text>
      <Pressable
        testID="cancel-target"
        onPress={onCancel}
        accessibilityRole="button"
        accessibilityLabel={COPY.cancel}
        hitSlop={12}
        style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}
      >
        <Text maxFontSizeMultiplier={CHROME_FONT_CAP} style={[TYPE.button, styles.label]}>
          {COPY.cancel}
        </Text>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  button: {
    minHeight: TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.sm,
    paddingHorizontal: SPACE.sm,
    borderRadius: RADIUS.button,
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.hairline,
    overflow: 'hidden',
  },
  pulse: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.lastStand,
  },
  muted: { opacity: 0.38 },
  pressed: { opacity: 0.74 },
  focusRing: {
    outlineWidth: 2,
    outlineColor: COLORS.accent,
    outlineStyle: 'solid',
    outlineOffset: 2,
  },
  label: { color: COLORS.ink, fontSize: 13 },
  labelMuted: { color: COLORS.inkMuted },
  lastStand: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    color: COLORS.lastStand,
  },
  pips: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pip: { width: 7, height: 7, borderRadius: RADIUS.pill },
  /** The fourth SLOT keeps its rim: it is still reachable only by overflow. */
  pipRim: { borderWidth: 1, borderColor: COLORS.lastStand },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.hairline,
    backgroundColor: COLORS.panelSunken,
  },
  chipCopy: { color: COLORS.ink, flexShrink: 1 },
  cancel: {
    minHeight: TOUCH,
    justifyContent: 'center',
    paddingLeft: SPACE.lg,
  },
});
