// S9 · Collection (ui.md §2, AC-1009, AC-1010, AC-1011).
//
// Four items, cosmetic only. Every locked one shows an explicit numeric counter
// toward its condition — `7 / 10 buffalo retired` — because a locked item that
// does not tell you how close you are is not a goal, it is a tease
// (gameplay.md §9, AC-1010).
//
// AC-1011: applying one changes appearance and nothing else. That is
// structural rather than promised — `src/ui/cosmetics.js` is the only module
// that knows what an unlock looks like, the engine has no import path to it,
// and a hygiene test asserts both.
//
// One applied item per slot, so the two animal sets cannot both be on. A
// second tap on an applied item turns it off, which is what makes "try it"
// safe.

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { RADIUS, SPACE, themed } from '../theme.js';
import { formatScore } from '../format.js';
import { unlockStatus } from '../cosmetics.js';
import { useProgress, useTheme } from '../progressStore.js';
import { useFocusRing } from '../components/Controls.js';
import { Card, FullScreen } from './FullScreen.js';

function Item({ item, onToggle }) {
  const theme = useTheme();
  const styles = STYLES[theme.name];
  const ring = useFocusRing();
  const counter = `${formatScore(item.progress)} / ${formatScore(item.need)} ${item.unit}`;
  const label = item.unlocked
    ? `${item.name}, ${item.kind}, unlocked${item.applied ? ', applied' : ''}`
    : `${item.name}, ${item.kind}, locked. ${counter}`;

  const body = (
    <>
      <View style={styles.head}>
        <Text style={[theme.type.button, !item.unlocked && styles.lockedInk]}>{item.name}</Text>
        <Text style={theme.type.label}>{item.kind}</Text>
      </View>
      <Text style={[theme.type.body, !item.unlocked && styles.lockedInk]}>{item.blurb}</Text>
      {/* AC-1010: the counter is always present, and it is a NUMBER. A bar on
          its own says "some progress"; the number says which run to play. */}
      <Text style={item.unlocked ? styles.earned : styles.counter}>
        {item.unlocked ? 'Unlocked' : counter}
      </Text>
      <View style={styles.track}>
        <View style={[styles.fill, { flex: item.progress }]} />
        <View style={{ flex: Math.max(item.need - item.progress, 0) }} />
      </View>
    </>
  );

  if (!item.unlocked) {
    return (
      <View style={[styles.item, styles.locked]} accessible accessibilityLabel={label}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      testID={`unlock-${item.id}`}
      onPress={() => onToggle(item)}
      onFocus={ring.onFocus}
      onBlur={ring.onBlur}
      accessibilityRole="switch"
      accessibilityState={{ checked: item.applied }}
      accessibilityLabel={label}
      style={[
        styles.item,
        item.applied && styles.applied,
        ring.focused && styles.focusRing,
      ]}
    >
      {body}
      <Text style={styles.action}>{item.applied ? 'Tap to turn off' : 'Tap to apply'}</Text>
    </Pressable>
  );
}

export function CollectionScreen({ onBack }) {
  const styles = STYLES[useTheme().name];
  const { save, applyCosmetic } = useProgress();
  const items = unlockStatus(save);
  const earned = items.filter((i) => i.unlocked).length;

  return (
    <FullScreen
      testID="collection"
      title="Collection"
      subtitle={`${earned} of ${items.length} unlocked. Looks only — none of these change the rules.`}
      onBack={onBack}
    >
      <Card>
        <View style={styles.items}>
          {items.map((item) => (
            <Item
              key={item.id}
              item={item}
              onToggle={(it) => applyCosmetic(it.slot, it.applied ? null : it.id)}
            />
          ))}
        </View>
      </Card>
    </FullScreen>
  );
}

const STYLES = themed((T) => StyleSheet.create({
  items: { gap: SPACE.md },
  item: {
    gap: SPACE.xs,
    padding: SPACE.md,
    borderRadius: RADIUS.button,
    borderWidth: 1,
    borderColor: T.colors.hairline,
    backgroundColor: T.colors.panelSunken,
    minHeight: 44,
  },
  locked: { opacity: 0.66 },
  applied: { borderColor: T.colors.accent, backgroundColor: T.colors.accentWash },
  focusRing: {
    outlineWidth: 2,
    outlineColor: T.colors.accent,
    outlineStyle: 'solid',
    outlineOffset: 2,
  },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: SPACE.sm },
  lockedInk: { color: T.colors.inkDim },
  counter: { ...T.type.body, color: T.colors.inkMuted, fontVariant: ['tabular-nums'] },
  earned: { ...T.type.body, color: T.colors.success },
  action: { ...T.type.label, color: T.colors.labelOnWash },
  track: {
    flexDirection: 'row',
    height: 4,
    borderRadius: RADIUS.pill,
    backgroundColor: T.colors.hairline,
    overflow: 'hidden',
  },
  fill: { backgroundColor: T.colors.accent },
}));
