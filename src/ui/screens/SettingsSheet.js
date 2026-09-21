// S6 · Settings. ui.md §10's three accessibility toggles, and AC-1104's two.
//
// v1's SettingsMenu — grid-width and grid-height steppers in front of the game —
// is deleted (ui.md §2). The board is a rules parameter, not a preference.
//
// AC-906b: the three toggles are persisted now, in the same save blob as the
// records — `useSettings()` reads them from the progress context rather than
// holding a copy (src/ui/settings.js). The diagnostic log's own switch stays
// session-scoped: `diagnosticsAvailable()` removes it from a release build, so
// persisting it would persist something the player could never turn off.

import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { RADIUS, SPACE, themed } from '../theme.js';
import { useTheme } from '../progressStore.js';
import { useSettings } from '../settings.js';
import {
  clearDiagnostics,
  diagnosticsAvailable,
  diagnosticsReport,
} from '../diagnostics.js';
import { Button, Toggle } from '../components/Controls.js';
import { Sheet } from './Sheet.js';

export function SettingsSheet({ onClose }) {
  const styles = STYLES[useTheme().name];
  const settings = useSettings();
  const [leaving, setLeaving] = useState(false);
  // Read once per open/refresh rather than per render: the report is a string
  // built from the log, and building it on every render of a sheet that is not
  // showing it would be work for nothing.
  const [report, setReport] = useState(null);

  return (
    <Sheet
      testID="settings"
      title="Settings"
      subtitle="Appearance, sound and accessibility"
      reduced={settings.reduced}
      visible={!leaving}
      onClosed={onClose}
    >
      {/* AC-1104. Two toggles, two channels, and turning one off does nothing
          to the other — the gate is two independent booleans and there is no
          third term (src/ui/cues.js `cueChannels`). Neither of them is the
          device's ringer switch, which silences sound on its own and leaves
          haptics alone (AC-1103); there is no API to read it and nothing here
          tries. */}
      {/* AC-1501. The game OPENS bright — the owner did not ask for an option,
          they asked for bright — so this reads as a departure from the default
          exactly like the accessibility toggles do: off is the theme the app
          ships in. The value is a STRING in the save rather than a boolean, so
          the switch is translated here; `withSettings` refuses a coerced one
          rather than storing `true` for "light" (src/ui/progress.js). */}
      <View style={styles.rows}>
        <Toggle
          label="Dark theme"
          caption="The slate board. Off is the bright one the game opens in."
          value={settings.theme === 'dark'}
          onChange={(on) => settings.set('theme', on ? 'dark' : 'light')}
        />
      </View>
      <View style={styles.rows}>
        <Toggle
          label="Sound"
          caption="Cues for grabs, landings, clears and chains."
          value={settings.sound}
          onChange={(on) => settings.set('sound', on)}
        />
        <Toggle
          label="Haptics"
          caption="Taps you can feel when a move lands or is refused."
          value={settings.haptics}
          onChange={(on) => settings.set('haptics', on)}
        />
      </View>
      <View style={styles.rows}>
        <Toggle
          label="Size numerals"
          caption="Print each animal's size on its body."
          value={settings.sizeNumerals}
          onChange={(on) => settings.set('sizeNumerals', on)}
        />
        <Toggle
          label="High contrast"
          caption="Borders and seams in the ground's opposite."
          value={settings.highContrast}
          onChange={(on) => settings.set('highContrast', on)}
        />
        <Toggle
          label="Reduce motion"
          caption="Cross-fades instead of movement. Your device setting also turns this on."
          value={settings.reduceMotion}
          onChange={(on) => settings.set('reduceMotion', on)}
        />
      </View>
      {diagnosticsAvailable() ? (
        <View style={styles.rows}>
          <Toggle
            label="Diagnostic log"
            caption="Records what the engine decided and what the screen actually drew, so a
              report can be replayed instead of described."
            value={settings.diagnostics}
            onChange={(on) => {
              settings.set('diagnostics', on);
              setReport(null);
            }}
          />
          {settings.diagnostics ? (
            <>
              <View style={styles.actions}>
                <Button
                  label="Show log"
                  tone="secondary"
                  testID="show-log"
                  onPress={() => setReport(diagnosticsReport())}
                />
                <Button
                  label="Clear"
                  tone="secondary"
                  onPress={() => {
                    clearDiagnostics();
                    setReport(diagnosticsReport());
                  }}
                />
              </View>
              {report === null ? null : (
                <ScrollView style={styles.log} testID="diagnostic-log">
                  <Text selectable style={styles.logText}>{report}</Text>
                </ScrollView>
              )}
            </>
          ) : null}
        </View>
      ) : null}
      <Button label="Done" tone="secondary" onPress={() => setLeaving(true)} />
    </Sheet>
  );
}

const STYLES = themed((T) => StyleSheet.create({
  rows: { gap: SPACE.lg, marginVertical: SPACE.sm },
  actions: { flexDirection: 'row', gap: SPACE.sm },
  log: {
    maxHeight: 220,
    backgroundColor: T.colors.panelSunken,
    borderRadius: RADIUS.button,
    borderWidth: 1,
    borderColor: T.colors.hairline,
    padding: SPACE.md,
  },
  // Selectable so the player can long-press, copy and paste it to us; no
  // clipboard dependency, and nothing here ever reaches a console.
  logText: { ...T.type.body, fontSize: 11, lineHeight: 15, color: T.colors.ink },
}));
