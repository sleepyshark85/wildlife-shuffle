// The action bar (ui.md §3.1, §12). Turn state on the left, Pass on the right.
//
// At compact chrome the bar is 44 pt and the Pass button fills it, so every
// touch target survives the ladder (AC-114).
//
// The bar is laid out at `height + HAIRLINE`, not at `height`. React Native is
// border-box: a 44 pt box with a 1 pt top rule has a 43 pt content box, and the
// 44 pt button then overhangs it by a point and the page picks up a point of
// scroll (AC-103). Adding the rule on top keeps the CONTENT box equal to the
// chrome budget, and costs nothing, because the board/tray group above is a
// flex child that absorbs it.

import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { actionBarHeight, passButtonHeight } from '../layout.js';
import { COLORS, COPY, SPACE, TYPE } from '../theme.js';
import { Button } from './Controls.js';

function statusCopy({ blocked, resolving, gameOver }) {
  if (gameOver) return 'RUN OVER';
  if (blocked) return COPY.blocked;
  if (resolving) return COPY.resolving;
  return COPY.idle;
}

export const ActionBar = memo(function ActionBar({
  chrome, blocked, resolving, gameOver, onPass, column,
}) {
  const text = statusCopy({ blocked, resolving, gameOver });
  const muted = resolving || gameOver;
  const button = (
    <Button
      label={COPY.pass}
      testID="pass"
      onPress={onPass}
      muted={muted}
      style={column ? styles.wideButton : { height: passButtonHeight(chrome) }}
    />
  );
  const status = (
    <Text
      testID="turn-state"
      allowFontScaling={false}
      accessibilityLiveRegion="polite"
      style={[TYPE.label, blocked && styles.blocked]}
    >
      {text}
    </Text>
  );

  if (column) {
    return (
      <View style={styles.column}>
        {button}
        {status}
      </View>
    );
  }
  return (
    <View style={[styles.bar, { height: actionBarHeight(chrome) }]}>
      {status}
      {button}
    </View>
  );
});

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.hairline,
  },
  column: { gap: SPACE.md, alignItems: 'stretch' },
  wideButton: { height: 48 },
  blocked: { color: COLORS.illegal },
});
