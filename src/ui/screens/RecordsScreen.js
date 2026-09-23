// S8 · Records (ui.md §2, §14.1, AC-1008, AC-1008b, AC-1011b).
//
// Four things, in the order AC-1008 names:
//
//  1. **The daily streak** — the subtitle, because it is the one number that is
//     about today rather than about all time.
//  2. **Bests** — best score, best chain, longest run and most rows. ONE SET
//     (AC-320d). There is one curve, so there is one thing a best can be a best
//     at; the difficulty selector this screen used to carry went with the
//     habitats, and a "Tundra (retired)" row would have been a museum label for
//     a concept the player is being told no longer exists.
//  3. **The last ten runs** — date, score, turns, and NO habitat chip
//     (AC-1008b). A label naming a mode that no longer exists makes the older
//     entries unreadable rather than informative. It is here because AGGREGATES
//     DO NOT REPLACE IT: a lifetime total tells you that you have played a lot,
//     and a list of your last ten runs tells you whether you are improving
//     today (AC-1011b).
//  4. **Lifetime** — the aggregate totals, last, which are also the counters the
//     Collection screen's unlocks are measured against.
//
// The lifetime block used to sit ABOVE the recent runs, which was AC-1008's
// order inverted. It is fixed here rather than left, because the AC has said
// "the lifetime totals last" since before this screen existed.
//
// Nothing on this screen counts anything. Every number was folded by
// `applyRunRecord` from the engine's own `runRecord`, which was folded from the
// turn's event stream (AC-706b). A statistic computed here would be a second
// site, which is the defect §6.3 of the process doc exists to prevent.

import React from 'react';
import { Text } from 'react-native';

import { formatDay, formatScore, plural } from '../format.js';
import { useProgress, useTheme } from '../progressStore.js';
import { Card, FullScreen, Line } from './FullScreen.js';

function RunRow({ run }) {
  return (
    <Line
      caption={formatDay(run.day)}
      value={`${formatScore(run.score)} · ${plural(run.turns, 'turn')}`}
    />
  );
}

export function RecordsScreen({ onBack }) {
  const theme = useTheme();
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
      <Card title="Bests">
        <Line caption="Best score" value={formatScore(best.score)} />
        <Line caption="Best chain" value={best.chain} />
        <Line caption="Longest run" value={plural(best.turns, 'turn')} />
        <Line caption="Most rows" value={best.rows} />
      </Card>

      <Card title="Recent runs">
        {recent.length === 0 ? (
          <Text style={theme.type.body}>No runs yet. Your last ten will show up here.</Text>
        ) : (
          recent.map((run) => <RunRow key={`${run.at}.${run.score}`} run={run} />)
        )}
      </Card>

      <Card title="Lifetime">
        <Line caption="Games played" value={lifetime.games} />
        <Line caption="Turns survived" value={formatScore(lifetime.turns)} />
        <Line caption="Rows cleared" value={formatScore(lifetime.rows)} />
        <Line caption="Buffalo retired" value={lifetime.buffaloRetired} />
        <Line caption="Perfect clears" value={lifetime.perfectClears} />
      </Card>
    </FullScreen>
  );
}
