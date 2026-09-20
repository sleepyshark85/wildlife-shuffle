// S4 · Game Over. Everything on it comes from runRecord(state), which is the
// engine's own selector — nothing is counted a second time here (AC-706b).

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { DIFFICULTIES } from '../../engine/constants.js';
import { COLORS, SPACE, TYPE } from '../theme.js';
import { formatScore } from '../format.js';
import { Button } from '../components/Controls.js';
import { Sheet } from './Sheet.js';

function Stat({ caption, value }) {
  return (
    <View style={styles.stat}>
      <Text allowFontScaling={false} style={TYPE.title}>{value}</Text>
      <Text allowFontScaling={false} style={TYPE.label}>{caption}</Text>
    </View>
  );
}

export function GameOverSheet({ record, difficulty, flagged, onAgain, onQuit }) {
  const habitat = (DIFFICULTIES[difficulty] || DIFFICULTIES.savanna).label;
  return (
    <Sheet testID="game-over" title={`Run over · ${habitat}`}>
      <Text allowFontScaling={false} style={TYPE.display}>{formatScore(record.score)}</Text>
      {flagged ? (
        // AC-504e / AC-1309: the engine was in a state the rules do not
        // describe, so the score is not trustworthy enough to keep.
        <Text allowFontScaling={false} style={styles.flagged}>
          This run hit an engine fault and will not be recorded.
        </Text>
      ) : null}
      <View style={styles.stats}>
        <Stat caption="Turns" value={record.turns} />
        <Stat caption="Rows" value={record.rowsCleared} />
        <Stat caption="Best chain" value={record.longestChain} />
        <Stat caption="Streak" value={record.longestStreak} />
      </View>
      <View style={styles.actions}>
        <Button label="Play again" testID="play-again" onPress={onAgain} />
        <Button label="Back to home" tone="secondary" onPress={onQuit} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', justifyContent: 'space-between', marginTop: SPACE.sm },
  stat: { gap: 2 },
  actions: { gap: SPACE.md, marginTop: SPACE.md },
  flagged: { ...TYPE.body, color: COLORS.illegal },
});
