// S1 · Home. v1's SettingsMenu — grid-width and grid-height steppers in front of
// the game — is deleted. The board is fixed at 10 x 15 (gameplay.md §3) and
// difficulty lives here, as one row of three habitats (ui.md §2, §12).

import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DEFAULT_DIFFICULTY, DIFFICULTIES } from '../../engine/constants.js';
import { COLORS, RADIUS, SPACE, TYPE } from '../theme.js';
import { Button } from '../components/Controls.js';

const HABITATS = ['meadow', 'savanna', 'tundra'];

/** Habitats, not Easy/Normal/Hard: "Hard" judges the player, a habitat
 *  describes the place — and Tundra is where the big animals live. */
const BLURB = {
  meadow: 'Small herds. Room to think.',
  savanna: 'The standard run.',
  tundra: 'Big animals, fast.',
};

export function HomeScreen({ onStart }) {
  const insets = useSafeAreaInsets();
  const [difficulty, setDifficulty] = useState(DEFAULT_DIFFICULTY);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + SPACE.xxl, paddingBottom: insets.bottom + SPACE.xl }]}>
      <View style={styles.header}>
        <Text allowFontScaling={false} style={TYPE.display}>Wildlife{'\n'}Shuffle</Text>
        <Text allowFontScaling={false} style={TYPE.body}>
          Animals rise. Drag them sideways to pack a row. A full row clears.
        </Text>
      </View>

      <View style={styles.choices}>
        <Text allowFontScaling={false} style={TYPE.label}>HABITAT</Text>
        <View style={styles.row}>
          {HABITATS.map((id) => {
            const selected = id === difficulty;
            return (
              <Pressable
                key={id}
                onPress={() => setDifficulty(id)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`${DIFFICULTIES[id].label}. ${BLURB[id]}`}
                style={[styles.choice, selected && styles.choiceSelected]}
              >
                <Text
                  allowFontScaling={false}
                  style={[TYPE.button, selected && styles.choiceInkSelected]}
                >
                  {DIFFICULTIES[id].label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text allowFontScaling={false} style={TYPE.body}>{BLURB[difficulty]}</Text>
      </View>

      <Button label="Start run" testID="start" onPress={() => onStart(difficulty)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
    paddingHorizontal: SPACE.xl,
    justifyContent: 'space-between',
  },
  header: { gap: SPACE.md },
  choices: { gap: SPACE.md },
  row: { flexDirection: 'row', gap: SPACE.sm },
  choice: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.button,
    borderWidth: 1,
    borderColor: COLORS.hairline,
    backgroundColor: COLORS.panel,
  },
  choiceSelected: { borderColor: COLORS.accent, backgroundColor: 'rgba(255,194,75,.12)' },
  choiceInkSelected: { color: COLORS.accent },
});
