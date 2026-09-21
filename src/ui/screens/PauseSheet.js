// S3 · Pause. Offered only while input is open, so there is no animation or
// timer to suspend — the sheet cannot appear mid-resolution.
//
// It owns its own exit (ui.md §8: sheet out, 220 ms). The chosen action is held
// until the slide finishes, so the player sees the sheet leave rather than
// blink out. The wait is Reanimated's completion callback, not a timer.

import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SPACE } from '../theme.js';
import { Button } from '../components/Controls.js';
import { Sheet } from './Sheet.js';

export function PauseSheet({ reduced, onResume, onRestart, onSettings, onQuit }) {
  const [leaving, setLeaving] = useState(null);
  const leave = (run) => () => setLeaving({ run });

  return (
    <Sheet
      title="Paused"
      reduced={reduced}
      visible={leaving === null}
      onClosed={() => leaving && leaving.run()}
    >
      <View style={styles.actions}>
        <Button label="Resume" onPress={leave(onResume)} />
        {/* The tester's D8: Settings was reachable only from Home, so the
            accessibility toggles and the diagnostic log could not be turned on
            while the thing you wanted to look at was on screen. */}
        <Button label="Settings" tone="secondary" testID="pause-settings" onPress={onSettings} />
        <Button label="Restart run" tone="secondary" onPress={leave(onRestart)} />
        <Button label="Back to home" tone="secondary" onPress={leave(onQuit)} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  actions: { gap: SPACE.md, marginTop: SPACE.sm },
});
