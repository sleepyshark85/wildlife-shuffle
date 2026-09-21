// S4 · Game Over. Everything on it comes from runRecord(state), which is the
// engine's own selector — nothing is counted a second time here (AC-706b).
//
// Two things arrive from the persistence layer rather than the engine: the best
// score for this habitat (AC-706), and whether this run beat it (AC-707). Both
// are read from the save as it stood BEFORE this run was folded in, which is
// why they are props: by the time this renders, `applyRunRecord` has already
// made the stored best include the number the badge is comparing against.
//
// AC-1009: an unlock earned by this run is announced here, once. It is
// announced here and not on a toast because a toast needs a timer to dismiss
// itself, and this app owns exactly two timers, both in the state layer
// (AC-828). The Game Over sheet is also simply where it was earned.

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { DIFFICULTIES } from '../../engine/constants.js';
import { RADIUS, SPACE, themed } from '../theme.js';
import { useTheme } from '../progressStore.js';
import { formatScore } from '../format.js';
import { Button } from '../components/Controls.js';
import { Sheet } from './Sheet.js';

function Stat({ caption, value }) {
  const theme = useTheme();
  const styles = STYLES[theme.name];
  return (
    <View style={styles.stat}>
      <Text style={theme.type.title}>{value}</Text>
      <Text style={theme.type.label}>{caption}</Text>
    </View>
  );
}

export function GameOverSheet({
  record, difficulty, flagged, reduced, best, newBest, unlocked = [], onAgain, onQuit,
}) {
  const theme = useTheme();
  const styles = STYLES[theme.name];
  const habitat = (DIFFICULTIES[difficulty] || DIFFICULTIES.savanna).label;
  return (
    <Sheet testID="game-over" reduced={reduced} title={`Run over · ${habitat}`}>
      <Text style={theme.type.display}>{formatScore(record.score)}</Text>
      {newBest ? (
        <View style={styles.badgeRow}>
          <Text style={styles.badge} testID="new-best">NEW BEST</Text>
          <Text style={theme.type.body}>{`previous ${formatScore(best)}`}</Text>
        </View>
      ) : (
        <Text style={theme.type.body}>{`Best in ${habitat}: ${formatScore(best)}`}</Text>
      )}
      {flagged ? (
        // AC-504e / AC-1309: the engine was in a state the rules do not
        // describe, so the score is not trustworthy enough to keep.
        <Text style={styles.flagged}>
          This run hit an engine fault and will not be recorded.
        </Text>
      ) : null}
      <View style={styles.stats}>
        <Stat caption="Turns" value={record.turns} />
        <Stat caption="Rows" value={record.rowsCleared} />
        <Stat caption="Best chain" value={record.longestChain} />
        <Stat caption="Streak" value={record.longestStreak} />
      </View>
      {unlocked.length ? (
        <View style={styles.unlocks} testID="unlocked">
          <Text style={theme.type.label}>UNLOCKED</Text>
          {unlocked.map((item) => (
            <Text key={item.id} style={styles.unlockName}>
              {`${item.name} · ${item.kind.toLowerCase()} — turn it on in Collection`}
            </Text>
          ))}
        </View>
      ) : null}
      <View style={styles.actions}>
        <Button label="Play again" testID="play-again" onPress={onAgain} />
        <Button label="Back to home" tone="secondary" onPress={onQuit} />
      </View>
    </Sheet>
  );
}

const STYLES = themed((T) => StyleSheet.create({
  stats: { flexDirection: 'row', justifyContent: 'space-between', marginTop: SPACE.sm },
  stat: { gap: 2 },
  actions: { gap: SPACE.md, marginTop: SPACE.md },
  flagged: { ...T.type.body, color: T.colors.illegal },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  badge: {
    ...T.type.label,
    color: T.colors.inkOnAccent,
    backgroundColor: T.colors.accent,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  unlocks: {
    gap: SPACE.xs,
    marginTop: SPACE.sm,
    padding: SPACE.md,
    borderRadius: RADIUS.button,
    borderWidth: 1,
    borderColor: T.colors.accent,
    backgroundColor: T.colors.accentWash,
  },
  unlockName: { ...T.type.body, color: T.colors.ink },
}));
