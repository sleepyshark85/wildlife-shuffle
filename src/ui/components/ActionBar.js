// The action bar (ui.md §3.1, §12, §13.1). Abilities on the left, Pass on the
// right, and nothing else.
//
// The bar used to hold the turn-state line and one button. Layer D needed a
// second control and neither the bar nor the HUD could grow — the ladder's
// chrome budget is what guarantees the board fits, and a point spent here is a
// board row taken from the devices least able to spare one. So the line moved
// into the HUD's spare right-hand column (ui.md §13.1, `Hud.js`) and the bar
// spends the space it freed on the abilities button. The bar's HEIGHT is
// unchanged at every stage of the ladder.
//
// ui.md §10 / AC-910c: the bar's height is part of the ladder's chrome budget,
// so its text scales up to CHROME_FONT_CAP rather than without limit. A cap is
// not an exemption — the text still grows, it just stops before it clips, which
// is what AC-910 ("no text anywhere is clipped or truncated") asks for.
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
  chrome, screenW, resolving, gameOver, onPass, column,
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

  const abilities = ability ? (
    <AbilityButton
      button={ability}
      grants={grants}
      reduced={reduced}
      onPress={onAbilities}
      style={column ? styles.wideSlot : { width: slots.buttonW }}
    />
  ) : null;

  const pass = (
    <Button
      label={COPY.pass}
      testID="pass"
      onPress={onPass}
      muted={muted}
      maxFontScale={CHROME_FONT_CAP}
      style={column ? styles.wideButton : { width: slots.buttonW, height }}
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
          <Button label={COPY.cancel} testID="cancel-target" tone="secondary"
            onPress={onCancelTarget} style={styles.wideButton} />
        ) : (
          <Text
            testID="turn-state-rail"
            maxFontSizeMultiplier={CHROME_FONT_CAP}
            accessibilityLiveRegion="polite"
            style={TYPE.label}
          >
            {status}
          </Text>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.bar, { height: actionBarHeight(chrome), gap: slots.gap }]}>
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
});
