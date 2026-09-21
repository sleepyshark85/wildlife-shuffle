// The ability sheet (ui.md §13.2). Five rows, in scope order.
//
// NO CHARGE IS SPENT HERE (AC-1413). Tapping a row ARMS the ability and
// dismisses the sheet; the spend happens when the engine accepts the ABILITY
// action, which is one tap later for a targeted ability and immediate for the
// three that need no target. A player who opens the sheet to read what things
// do never loses anything, which is the difference between a system that
// rewards exploring it and one that punishes it.
//
// An unaffordable row sits at 40% AND STATES ITS REASON. A greyed row with no
// reason teaches nothing about a mechanic whose whole purpose is to help.

import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SPECIES } from '../../engine/constants.js';
import { COLORS, COPY, RADIUS, SPACE, SPECIES_STYLE, TYPE } from '../theme.js';
import { Sheet } from './Sheet.js';

const TOUCH = 44;
const UNAFFORDABLE = 0.4;

const Row = memo(function Row({ row, onPick }) {
  const style = SPECIES_STYLE[row.species];
  return (
    <Pressable
      testID={`ability-${row.id}`}
      onPress={() => row.enabled && onPick(row)}
      accessibilityRole="button"
      accessibilityLabel={`${row.name}. ${row.effect}${row.enabled ? '' : ` ${row.reason}.`}`}
      accessibilityState={{ disabled: !row.enabled }}
      style={({ pressed }) => [
        styles.row,
        !row.enabled && styles.rowMuted,
        pressed && row.enabled && styles.rowPressed,
      ]}
    >
      <View style={[styles.chip, { backgroundColor: style.fill, borderColor: style.edge }]}>
        <Text style={[styles.chipGlyph, { color: style.glyph }]}>
          {SPECIES[row.species].emoji}
        </Text>
      </View>
      <View style={styles.copy}>
        <Text style={styles.name}>{row.name}</Text>
        <Text style={styles.effect}>{row.effect}</Text>
      </View>
      {row.enabled ? null : <Text style={styles.reason}>{row.reason}</Text>}
    </Pressable>
  );
});

/**
 * @param {object[]} rows      `abilityRows(state)` — the one affordability
 *                             predicate, shared with the engine. The sheet
 *                             cannot offer something `reduce()` would reject.
 * @param {Function} onPick    called with the row; the caller arms or resolves.
 * @param {Function} onClose   dismissal, which spends nothing.
 */
export const AbilitySheet = memo(function AbilitySheet({ rows, reduced, onPick, onClose }) {
  return (
    <Sheet
      testID="ability-sheet"
      title={COPY.abilitiesTitle}
      subtitle="One ability is your whole turn."
      reduced={reduced}
    >
      <View style={styles.list}>
        {rows.map((row) => <Row key={row.id} row={row} onPick={onPick} />)}
      </View>
      <Pressable
        testID="close-abilities"
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={COPY.cancel}
        style={({ pressed }) => [styles.close, pressed && styles.rowPressed]}
      >
        <Text style={[TYPE.button, styles.closeText]}>{COPY.cancel}</Text>
      </Pressable>
    </Sheet>
  );
});

const styles = StyleSheet.create({
  list: { gap: SPACE.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    minHeight: TOUCH + 8,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
    borderRadius: RADIUS.card,
    backgroundColor: COLORS.panelSunken,
    borderWidth: 1,
    borderColor: COLORS.hairline,
  },
  rowMuted: { opacity: UNAFFORDABLE },
  rowPressed: { opacity: 0.74 },
  chip: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.animal,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipGlyph: { fontSize: 17 },
  copy: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontWeight: '600', color: COLORS.ink },
  effect: { fontSize: 13, fontWeight: '400', color: COLORS.inkMuted },
  reason: { fontSize: 11, fontWeight: '600', color: COLORS.inkDim, textAlign: 'right' },
  close: {
    minHeight: TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACE.sm,
  },
  closeText: { color: COLORS.inkMuted },
});
