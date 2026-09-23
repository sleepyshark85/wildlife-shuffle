// S1 · Home. v1's SettingsMenu — grid-width and grid-height steppers in front of
// the game — is deleted. The board is fixed at 9 x 15 (gameplay.md §3).
//
// THE HABITAT PICKER IS DELETED TOO (AC-320b, ui.md §2). Its row of three
// choices and its blurb asked the player to choose between three experiences at
// the moment they knew least about any of them — and our own measurement could
// not reliably tell the three apart. Play is now the only primary action on the
// screen, and the vertical space the picker gave up is spent on the gap above
// it rather than on a new element: Home earns its pixels by having fewer.
//
// AC-1018: with a saved run present, Home LEADS with Resume — showing that
// run's score and turn — and offers New Run second. AC-1019: starting a new run
// asks first, because it discards the saved one, and a destructive action that
// does not ask is a trap.

import React, { useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SPACE, themed } from '../theme.js';
import { formatScore } from '../format.js';
import { Button, IconButton } from '../components/Controls.js';
import { NaturalGround } from '../components/NaturalGround.js';
import { useProgress, useTheme } from '../progressStore.js';
import { useSettings } from '../settings.js';
import { Sheet } from './Sheet.js';
import { SettingsSheet } from './SettingsSheet.js';

/**
 * ui.md §16.3 reaches Home as well as the board — the owner asked for the
 * texture in both places, at the same ceiling.
 *
 * A CONSTANT seed, because Home is not a run and AC-1510's "the run's seed" has
 * nothing to name here. The property that matters is the same one: it is fixed,
 * so the ground does not reshuffle itself every time the player comes back.
 */
const HOME_GROUND = 'home';

export function HomeScreen({ onStart, onResume, onRecords, onCollection }) {
  const theme = useTheme();
  const styles = STYLES[theme.name];
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const progress = useProgress();
  const settings = useSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const resume = progress.resume;
  const streak = progress.save.streak;

  const start = () => {
    if (resume) progress.discardResume();
    onStart();
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + SPACE.xxl, paddingBottom: insets.bottom + SPACE.xl }]}>
      {/* First child, and nothing above it is translucent: Home's panels are
          opaque. `surface="app"` is what keeps it under the 1.25:1 ceiling on
          a ground that is not the board's (AC-1508). */}
      <NaturalGround seed={HOME_GROUND} width={width} height={height} surface="app" />
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={theme.type.display}>Wildlife{'\n'}Shuffle</Text>
          <IconButton glyph="⚙" label="Settings" onPress={() => setSettingsOpen(true)} />
        </View>
        <Text style={theme.type.body}>
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

const STYLES = themed((T) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: T.colors.bg,
    paddingHorizontal: SPACE.xl,
    justifyContent: 'space-between',
  },
  header: { gap: SPACE.md },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  streak: { ...T.type.button, color: T.colors.accent },
  row: { flexDirection: 'row', gap: SPACE.sm },
  half: { flex: 1 },
  actions: { gap: SPACE.sm },
  confirmActions: { gap: SPACE.md, marginTop: SPACE.md },
}));
