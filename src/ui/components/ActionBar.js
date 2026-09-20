// The action bar (ui.md §3.1, §12). Turn state on the left, Pass on the right.
//
// At compact chrome the bar is 44 pt and the Pass button fills it, so every
// touch target survives the ladder (AC-114).

import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { COLORS, COPY, SPACE, TYPE } from '../theme.js';
import { Button } from './Controls.js';

export function statusCopy({ blocked, resolving, gameOver }) {
  if (gameOver) return 'RUN OVER';
  if (blocked) return COPY.blocked;
  if (resolving) return COPY.resolving;
  return COPY.idle;
}

export const ActionBar = memo(function ActionBar({
  height, blocked, resolving, gameOver, onPass, column,
}) {
  const text = statusCopy({ blocked, resolving, gameOver });
  const muted = resolving || gameOver;
  const button = (
    <Button
      label={COPY.pass}
      testID="pass"
      onPress={onPass}
      muted={muted}
      style={column ? styles.wideButton : { height: Math.max(44, height - 4) }}
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
    <View style={[styles.bar, { height }]}>
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
