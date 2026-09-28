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
import { COPY, RADIUS, SPACE, themed } from '../theme.js';
import { useTheme } from '../progressStore.js';
import { StandDownMeter } from '../components/Controls.js';
import { Sheet } from './Sheet.js';

const TOUCH = 44;
const UNAFFORDABLE = 0.4;

const Row = memo(function Row({ row, onPick, reduced }) {
  const theme = useTheme();
  const styles = STYLES[theme.name];
  const style = theme.species[row.species];
  return (
    <Pressable
      testID={`ability-${row.id}`}
      onPress={() => row.enabled && onPick(row)}
      accessibilityRole="button"
      // Built by `abilityRows`, not here: a label is a claim about what is on
      // screen, and a claim that can only be read off a device is a claim
      // nobody checks (§6.7). It is also where the price knows its own unit.
      accessibilityLabel={row.spoken}
      accessibilityState={{ disabled: !row.enabled }}
      aria-disabled={!row.enabled}
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
        {/* ui.md §13.2/§13.3: Stand Down replaces THE EFFECT LINE with its
            reason, because both of its unavailable states need a sentence and
            the two say different things about what to do next — `6 of 10
            buffalo segments` means keep breaking them, `No buffalo on the
            board` means ready, nothing to use it on. */}
        <Text style={styles.effect}>{row.line}</Text>
      </View>
      {/* AC-1405j. The cost is shown on EVERY row, affordable or not, and it
          renders as pips rather than a numeral so the player compares two rows
          of dots — this against the reserve on the button — instead of a
          number against a number (ui.md §13.2). A dimmed row with no price
          looks broken; a dimmed row showing ●●● looks expensive.

          STAND DOWN'S COST COLUMN IS THE METER, at the same geometry as the
          strip's, so the sheet and the strip show one object rather than two
          readings of it. Round pips for charges, square ticks for the meter:
          the two vocabularies are deliberately different shapes, because a
          player who could not tell them apart would save charges for an
          ability charges cannot buy (gameplay.md §13.2f-vi). */}
      <View style={styles.right}>
        {row.meter ? (
          <StandDownMeter
            ticks={row.meter.ticks}
            gold={row.meter.gold}
            label={row.meter.label}
            plan={null}
            reduced={reduced}
            // §7.1's 10 pt clearance belongs to the STRIP, where the meter sits
            // between the chips and the countdown. In the sheet's right-hand
            // column it would break the alignment the pips above it keep.
            clear={0}
          />
        ) : (
          <View testID={`cost-${row.id}`} style={styles.costPips}>
            {row.costPips.map((i) => <View key={i} style={styles.costPip} />)}
          </View>
        )}
        {row.enabled || !row.note ? null : <Text style={styles.reason}>{row.note}</Text>}
      </View>
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
  const theme = useTheme();
  const styles = STYLES[theme.name];
  return (
    <Sheet
      testID="ability-sheet"
      title={COPY.abilitiesTitle}
      subtitle="One ability is your whole turn."
      reduced={reduced}
    >
      <View style={styles.list}>
        {rows.map((row) => (
          <Row key={row.id} row={row} onPick={onPick} reduced={reduced} />
        ))}
      </View>
      <Pressable
        testID="close-abilities"
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={COPY.cancel}
        style={({ pressed }) => [styles.close, pressed && styles.rowPressed]}
      >
        <Text style={[theme.type.button, styles.closeText]}>{COPY.cancel}</Text>
      </Pressable>
    </Sheet>
  );
});

const STYLES = themed((T) => StyleSheet.create({
  list: { gap: SPACE.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    minHeight: TOUCH + 8,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
    borderRadius: RADIUS.card,
    backgroundColor: T.colors.panelSunken,
    borderWidth: 1,
    borderColor: T.colors.hairline,
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
  right: { alignItems: 'flex-end', gap: 4 },
  costPips: { flexDirection: 'row', gap: 4 },
  costPip: { width: 7, height: 7, borderRadius: RADIUS.pill, backgroundColor: T.colors.pip },
  name: { fontSize: 16, fontWeight: '600', color: T.colors.ink },
  effect: { fontSize: 13, fontWeight: '400', color: T.colors.inkMuted },
  reason: { fontSize: 11, fontWeight: '600', color: T.colors.inkDim, textAlign: 'right' },
  close: {
    minHeight: TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACE.sm,
  },
  closeText: { color: T.colors.inkMuted },
}));
