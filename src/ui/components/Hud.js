// The HUD (ui.md §3.1). Score, streak multiplier, buffalo chip, pause.
// The same components appear in the stage-W rail, rearranged (AC-121).

import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { COLORS, SPACE, TYPE } from '../theme.js';
import { formatScore } from '../format.js';
import { BuffaloChip, IconButton, StreakPill } from './Controls.js';

export const HudStats = memo(function HudStats({ score, streak, buffalo, column }) {
  return (
    <View style={column ? styles.stack : styles.row}>
      <View>
        <Text allowFontScaling={false} style={TYPE.label}>SCORE</Text>
        <Text
          allowFontScaling={false}
          testID="hud-score"
          accessibilityLiveRegion="polite"
          accessibilityLabel={`Score ${score}`}
          style={TYPE.score}
        >
          {formatScore(score)}
        </Text>
      </View>
      <View style={column ? styles.badgesColumn : styles.badgesRow}>
        {streak.show ? <StreakPill mult={streak.mult} /> : null}
        {buffalo ? <BuffaloChip size={buffalo.size} /> : null}
      </View>
    </View>
  );
});

export const Hud = memo(function Hud({ height, score, streak, buffalo, onPause, pauseMuted }) {
  return (
    <View style={[styles.hud, { height }]}>
      <HudStats score={score} streak={streak} buffalo={buffalo} />
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
});
