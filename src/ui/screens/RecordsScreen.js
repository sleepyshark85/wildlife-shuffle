// S8 · Records (ui.md §2, AC-1008, AC-1011b).
//
// Three things, in this order:
//
//  1. **Per difficulty** — best score, best chain, longest run and most rows,
//     tracked separately because a Meadow score and a Tundra score are not the
//     same achievement (AC-1004).
//  2. **Lifetime** — the aggregate totals, which are also the counters the
//     Collection screen's unlocks are measured against.
//  3. **The last ten runs** — difficulty, date, score, turns. Ported from v1's
//     `StatsPanel.js`, and it is here because AGGREGATES DO NOT REPLACE IT: a
//     lifetime total tells you that you have played a lot, and a list of your
//     last ten runs tells you whether you are improving today (AC-1011b).
//
// Nothing on this screen counts anything. Every number was folded by
// `applyRunRecord` from the engine's own `runRecord`, which was folded from the
// turn's event stream (AC-706b). A statistic computed here would be a second
// site, which is the defect §6.3 of the process doc exists to prevent.

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { DIFFICULTIES } from '../../engine/constants.js';
import { SPACE, themed } from '../theme.js';
import { formatDay, formatScore, plural } from '../format.js';
import { useProgress, useTheme } from '../progressStore.js';
import { Card, FullScreen, Line } from './FullScreen.js';

function RunRow({ run }) {
  const habitat = (DIFFICULTIES[run.difficulty] || DIFFICULTIES.savanna).label;
  return (
    <Line
      caption={`${habitat} · ${formatDay(run.day)}`}
      value={`${formatScore(run.score)} · ${plural(run.turns, 'turn')}`}
    />
  );
}

export function RecordsScreen({ onBack }) {
  const theme = useTheme();
  const styles = STYLES[theme.name];
  const { save } = useProgress();
  const { best, lifetime, recent, streak } = save;

  return (
    <FullScreen
      testID="records"
      title="Records"
      subtitle={
        streak.count > 0
          ? `\u{1F525} ${streak.count} day streak`
          : 'Finish a run to start a daily streak.'
      }
      onBack={onBack}
    >
      {Object.keys(DIFFICULTIES).map((id) => (
        <Card key={id} title={DIFFICULTIES[id].label}>
          <Line caption="Best score" value={formatScore(best[id].score)} />
          <Line caption="Best chain" value={best[id].chain} />
          <Line caption="Longest run" value={plural(best[id].turns, 'turn')} />
          <Line caption="Most rows" value={best[id].rows} />
        </Card>
      ))}

      <Card title="Lifetime">
        <Line caption="Games played" value={lifetime.games} />
        <Line caption="Turns survived" value={formatScore(lifetime.turns)} />
        <Line caption="Rows cleared" value={formatScore(lifetime.rows)} />
        <Line caption="Buffalo retired" value={lifetime.buffaloRetired} />
        <Line caption="Perfect clears" value={lifetime.perfectClears} />
      </Card>

      <Card title="Recent runs">
        {recent.length === 0 ? (
          <Text style={theme.type.body}>No runs yet. Your last ten will show up here.</Text>
        ) : (
          recent.map((run) => <RunRow key={`${run.at}.${run.score}`} run={run} />)
        )}
      </Card>

      <View style={styles.footnote}>
        <Text style={styles.footnoteInk}>
          Best scores are kept per habitat, because a Meadow run and a Tundra run
          are not the same achievement.
        </Text>
      </View>
    </FullScreen>
  );
}

const STYLES = themed((T) => StyleSheet.create({
  footnote: { paddingHorizontal: SPACE.xs },
  footnoteInk: { ...T.type.body, color: T.colors.inkDim },
}));
