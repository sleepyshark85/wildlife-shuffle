// The action bar (ui.md §3.1, §12, §13.1). Turn state, abilities, Pass.
//
// THREE SLOTS, NOT TWO, and the deviation from the drawn design is recorded in
// `layout.js` beside `actionBarSlots` along with the arithmetic that forced it.
// The short version: ui.md §13.1 moves the turn-state line into "the HUD's
// spare right-hand column" and gives the bar two 150 pt buttons. The HUD has no
// spare column — the line over the pause button is 58 pt inside a 44 pt compact
// budget — and 150 pt is a reference-device figure that overflows at the 248 pt
// the viewport sweep supports. So the line stays here, where it already worked,
// and the abilities control is icon-sized: the bolt and its four pips, which
// ui.md §13.1 itself calls "the whole status, so it needs no label".
//
// NO CHROME HEIGHT MOVED. That is the part that matters: the ladder's chrome
// budget is what guarantees the board fits, and a point spent here is a board
// row taken from the devices least able to spare one.
//
// ui.md §10 / AC-910c: the bar's height is part of that budget, so its text
// scales up to CHROME_FONT_CAP rather than without limit. A cap is not an
// exemption — the text still grows, it just stops before it clips.
//
// The bar is laid out at `height + HAIRLINE`, not at `height`. React Native is
// border-box: a 44 pt box with a 1 pt top rule has a 43 pt content box, and the
// 44 pt button then overhangs it by a point and the page picks up a point of
// scroll (AC-103). Adding the rule on top keeps the CONTENT box equal to the
// chrome budget, and costs nothing, because the board/tray group above is a
// flex child that absorbs it.

import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { actionBarHeight, actionBarSlots, passButtonHeight } from '../layout.js';
import { COLORS, COPY, SPACE, TYPE } from '../theme.js';
import { AbilityButton, TargetingChip } from './AbilityButton.js';
import { Button, CHROME_FONT_CAP } from './Controls.js';

export const ActionBar = memo(function ActionBar({
  chrome, screenW, blocked, resolving, gameOver, onPass, column,
  ability, grants, reduced, targeting, onAbilities, onCancelTarget, status,
}) {
  const muted = resolving || gameOver;
  const slots = actionBarSlots(screenW || 0);
  const height = passButtonHeight(chrome);

  // AC-1414: while an ability is armed the bar IS the chip, so Cancel is always
  // exactly one tap away and can never be the second thing the player has to
  // find. Nothing about the chip spends a charge — only the engine does that,
  // and only on the ABILITY action a target produces.
  if (targeting && !column) {
    return (
      <TargetingChip
        copy={targeting}
        onCancel={onCancelTarget}
        height={actionBarHeight(chrome)}
      />
    );
  }

  const statusText = (
    <Text
      testID="turn-state"
      maxFontSizeMultiplier={CHROME_FONT_CAP}
      accessibilityLiveRegion="polite"
      numberOfLines={1}
      style={[TYPE.label, blocked && styles.blocked]}
    >
      {status}
    </Text>
  );

  const abilities = ability ? (
    <AbilityButton
      button={ability}
      grants={grants}
      reduced={reduced}
      showLabel={column || slots.showAbilityLabel}
      onPress={onAbilities}
      style={column ? styles.wideSlot : { width: slots.abilityW }}
    />
  ) : null;

  const pass = (
    <Button
      label={COPY.pass}
      testID="pass"
      onPress={onPass}
      muted={muted}
      maxFontScale={CHROME_FONT_CAP}
      style={column ? styles.wideButton : { width: slots.passW, height }}
    />
  );

  if (column) {
    return (
      <View style={styles.column}>
        {targeting ? (
          <Text testID="targeting" style={[TYPE.body, styles.chipCopy]}>{targeting}</Text>
        ) : null}
        {abilities}
        {pass}
        {targeting ? (
          <Button
            label={COPY.cancel}
            testID="cancel-target"
            tone="secondary"
            onPress={onCancelTarget}
            style={styles.wideButton}
          />
        ) : statusText}
      </View>
    );
  }

  return (
    <View style={[styles.bar, { height: actionBarHeight(chrome), gap: slots.gap }]}>
      {slots.showStatus ? (
        <View style={{ width: slots.statusW }}>{statusText}</View>
      ) : null}
      {abilities}
      {pass}
    </View>
  );
});

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.hairline,
  },
  column: { gap: SPACE.md, alignItems: 'stretch' },
  wideButton: { height: 48 },
  wideSlot: { alignSelf: 'stretch' },
  chipCopy: { color: COLORS.ink },
  blocked: { color: COLORS.illegal },
});
