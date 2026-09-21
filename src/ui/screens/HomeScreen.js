// S1 · Home. v1's SettingsMenu — grid-width and grid-height steppers in front of
// the game — is deleted. The board is fixed at 9 x 15 (gameplay.md §3) and
// difficulty lives here, as one row of three habitats (ui.md §2, §12).
//
// AC-1018: with a saved run present, Home LEADS with Resume — showing that
// run's score and turn — and offers New Run second. AC-1019: starting a new run
// asks first, because it discards the saved one, and a destructive action that
// does not ask is a trap.

import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DEFAULT_DIFFICULTY, DIFFICULTIES } from '../../engine/constants.js';
import { COLORS, RADIUS, SPACE, TYPE } from '../theme.js';
import { formatScore } from '../format.js';
import { Button, IconButton, useFocusRing } from '../components/Controls.js';
import { useProgress } from '../progressStore.js';
import { useSettings } from '../settings.js';
import { Sheet } from './Sheet.js';
import { SettingsSheet } from './SettingsSheet.js';

const HABITATS = ['meadow', 'savanna', 'tundra'];

/** Habitats, not Easy/Normal/Hard: "Hard" judges the player, a habitat
 *  describes the place — and Tundra is where the big animals live. */
const BLURB = {
  meadow: 'Small herds. Room to think.',
  savanna: 'The standard run.',
  tundra: 'Big animals, fast.',
};

/** One habitat choice. Its own component so it can own its focus ring. */
function Habitat({ id, selected, onSelect }) {
  const ring = useFocusRing();
  return (
    <Pressable
      onPress={() => onSelect(id)}
      onFocus={ring.onFocus}
      onBlur={ring.onBlur}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${DIFFICULTIES[id].label}. ${BLURB[id]}`}
      style={[styles.choice, selected && styles.choiceSelected, ring.focused && styles.focusRing]}
    >
      <Text style={[TYPE.button, selected && styles.choiceInkSelected]}>
        {DIFFICULTIES[id].label}
      </Text>
    </Pressable>
  );
}

export function HomeScreen({ onStart, onResume, onRecords, onCollection }) {
  const insets = useSafeAreaInsets();
  const progress = useProgress();
  const settings = useSettings();
  const [difficulty, setDifficulty] = useState(DEFAULT_DIFFICULTY);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const resume = progress.resume;
  const streak = progress.save.streak;

  const start = () => {
    if (resume) progress.discardResume();
    onStart(difficulty);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + SPACE.xxl, paddingBottom: insets.bottom + SPACE.xl }]}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={TYPE.display}>Wildlife{'\n'}Shuffle</Text>
          <IconButton glyph="⚙" label="Settings" onPress={() => setSettingsOpen(true)} />
        </View>
        <Text style={TYPE.body}>
          Animals rise. Drag them sideways to pack a row. A full row clears.
        </Text>
        {streak.count > 0 ? (
          // gameplay.md §9: consecutive calendar days with at least one
          // completed run. A raw count, and never a promise about tomorrow.
          <Text style={styles.streak} accessibilityLabel={`${streak.count} day streak`}>
            {`\u{1F525} ${streak.count} day streak`}
          </Text>
        ) : null}
      </View>

      <View style={styles.choices}>
        <Text style={TYPE.label}>HABITAT</Text>
        <View style={styles.row}>
          {HABITATS.map((id) => (
            <Habitat
              key={id}
              id={id}
              selected={id === difficulty}
              onSelect={setDifficulty}
            />
          ))}
        </View>
        <Text style={TYPE.body}>{BLURB[difficulty]}</Text>
      </View>

      <View style={styles.actions}>
        {resume ? (
          <Button
            label={`Resume · ${formatScore(resume.score)} · turn ${resume.turn}`}
            testID="resume"
            onPress={() => onResume(resume)}
          />
        ) : null}
        <Button
          label={resume ? 'New run' : 'Start run'}
          testID="start"
          tone={resume ? 'secondary' : 'primary'}
          onPress={() => (resume ? setConfirming(true) : start())}
        />
        <View style={styles.row}>
          <Button label="Records" testID="records" tone="secondary" style={styles.half} onPress={onRecords} />
          <Button label="Collection" testID="collection" tone="secondary" style={styles.half} onPress={onCollection} />
        </View>
      </View>

      {confirming ? (
        <Sheet
          testID="confirm-new-run"
          title="Start a new run?"
          subtitle={`Your saved run — ${formatScore(resume ? resume.score : 0)} on turn ${resume ? resume.turn : 0} — will be discarded.`}
          reduced={settings.reduced}
        >
          <View style={styles.confirmActions}>
            <Button
              label="Discard and start"
              testID="confirm-new-run-yes"
              onPress={() => {
                setConfirming(false);
                start();
              }}
            />
            <Button label="Keep it" tone="secondary" onPress={() => setConfirming(false)} />
          </View>
        </Sheet>
      ) : null}
      {settingsOpen ? <SettingsSheet onClose={() => setSettingsOpen(false)} /> : null}
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
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  streak: { ...TYPE.button, color: COLORS.accent },
  focusRing: {
    outlineWidth: 2,
    outlineColor: COLORS.accent,
    outlineStyle: 'solid',
    outlineOffset: 2,
  },
  choices: { gap: SPACE.md },
  row: { flexDirection: 'row', gap: SPACE.sm },
  half: { flex: 1 },
  actions: { gap: SPACE.sm },
  confirmActions: { gap: SPACE.md, marginTop: SPACE.md },
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
