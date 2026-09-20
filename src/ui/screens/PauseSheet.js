// S3 · Pause. Offered only while input is open, so there is no animation or
// timer to suspend — the sheet cannot appear mid-resolution.

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { SPACE } from '../theme.js';
import { Button } from '../components/Controls.js';
import { Sheet } from './Sheet.js';

export function PauseSheet({ onResume, onRestart, onQuit }) {
  return (
    <Sheet title="Paused">
      <View style={styles.actions}>
        <Button label="Resume" onPress={onResume} />
        <Button label="Restart run" tone="secondary" onPress={onRestart} />
        <Button label="Back to home" tone="secondary" onPress={onQuit} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  actions: { gap: SPACE.md, marginTop: SPACE.sm },
});
