// S6 · Settings. ui.md §10: three toggles, and nothing else.
//
// v1's SettingsMenu — grid-width and grid-height steppers in front of the game —
// is deleted (ui.md §2). The board is a rules parameter, not a preference.
//
// The toggles are session-scoped in this slice. Persisting them is AsyncStorage,
// which is AC-10xx and lands with Slice 4; §10 says "all persisted" and that is
// the one part of the sentence this slice does not keep yet.

import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { COLORS, RADIUS, SPACE, TYPE } from '../theme.js';
import { useSettings } from '../settings.js';
import {
  clearDiagnostics,
  diagnosticsAvailable,
  diagnosticsReport,
} from '../diagnostics.js';
import { Button, Toggle } from '../components/Controls.js';
import { Sheet } from './Sheet.js';

export function SettingsSheet({ onClose }) {
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
      subtitle="Accessibility"
      reduced={settings.reduced}
      visible={!leaving}
      onClosed={onClose}
    >
      <View style={styles.rows}>
        <Toggle
          label="Size numerals"
          caption="Print each animal's size on its body."
          value={settings.sizeNumerals}
          onChange={(on) => settings.set('sizeNumerals', on)}
        />
        <Toggle
          label="High contrast"
          caption="White borders and brighter seams."
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

const styles = StyleSheet.create({
  rows: { gap: SPACE.lg, marginVertical: SPACE.sm },
  actions: { flexDirection: 'row', gap: SPACE.sm },
  log: {
    maxHeight: 220,
    backgroundColor: COLORS.panelSunken,
    borderRadius: RADIUS.button,
    borderWidth: 1,
    borderColor: COLORS.hairline,
    padding: SPACE.md,
  },
  // Selectable so the player can long-press, copy and paste it to us; no
  // clipboard dependency, and nothing here ever reaches a console.
  logText: { ...TYPE.body, fontSize: 11, lineHeight: 15, color: COLORS.ink },
});
