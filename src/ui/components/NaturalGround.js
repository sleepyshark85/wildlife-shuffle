// AC-1507 to AC-1511 — the natural background, drawn.
//
// It is a leaf: it paints and it never moves (AC-1510). No shared value, no
// effect, no timer. Memoized on the three things that decide it, so during a
// run it renders once and is then a static subtree the reconciler walks past.
//
// WHERE IT SITS IS THE WHOLE DESIGN (AC-1507). On the board it is the FIRST
// child, under a cell layer that lets it through at `CELL_ALPHA` and under
// animals that are opaque. It carries no `zIndex` of its own — `Z.texture` is
// the bottom of `stacking.js`'s table and document order does the rest — and
// it is `pointerEvents: 'none'`, so it cannot take a touch either.
//
// The two grounds it can be asked to sit on are not the same colour, so they do
// not get the same ink: `THEME.texture.app` is a second pair under the same
// 1.25:1 ceiling, because the board's grain measures 1.26:1 against the app
// ground and the ceiling is the point (AC-1508).

import React, { memo, useMemo } from 'react';
import { View } from 'react-native';

import { textureFor } from '../texture.js';
import { useTheme } from '../progressStore.js';

function NaturalGroundImpl({ seed, width, height, surface = 'board', limits }) {
  const theme = useTheme();
  const ink = surface === 'app' ? theme.texture.app : theme.texture;
  // AC-1510: the run's seed, and nothing else that changes during a run.
  const { grain, tracks } = useMemo(
    () => textureFor(seed, width, height, limits || undefined),
    [seed, width, height, limits],
  );

  return (
    <View
      testID="natural-ground"
      style={{
        pointerEvents: 'none',
        position: 'absolute',
        left: 0,
        top: 0,
        width,
        height,
        overflow: 'hidden',
      }}
    >
      {grain.map((fleck) => (
        <View
          key={fleck.key}
          style={{
            position: 'absolute',
            left: fleck.x,
            top: fleck.y,
            width: fleck.width,
            height: fleck.height,
            borderRadius: fleck.height / 2,
            backgroundColor: ink.grain,
            transform: [{ rotate: `${fleck.rotate}deg` }],
          }}
        />
      ))}
      {tracks.map((print) => (
        <View
          key={print.key}
          style={{
            position: 'absolute',
            left: print.x,
            top: print.y,
            width: 0,
            height: 0,
            transform: [{ rotate: `${print.rotate}deg` }],
          }}
        >
          {print.toes.map((toe) => (
            <View
              key={toe.key}
              style={{
                position: 'absolute',
                left: toe.x - toe.size / 2,
                top: toe.y - toe.size / 2,
                width: toe.size,
                height: toe.size * 1.3,
                borderRadius: toe.size,
                backgroundColor: ink.tracks,
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

export const NaturalGround = memo(NaturalGroundImpl);
