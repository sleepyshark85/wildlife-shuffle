// The app shell: gesture root, safe-area provider, and which screen is showing.
//
// SafeAreaProvider + useSafeAreaInsets, never the deprecated SafeAreaView from
// react-native, which handles neither the Dynamic Island nor the home indicator
// correctly (docs/v1-review.md D7, ui.md §3.3). The insets are read as numbers
// by the screens that need them and fed into the layout formula.

import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { COLORS } from './src/ui/theme.js';
import { SettingsProvider } from './src/ui/settings.js';
import { newSeed } from './src/ui/useGameRun.js';
import { HomeScreen } from './src/ui/screens/HomeScreen.js';
import { GameScreen } from './src/ui/screens/GameScreen.js';

export default function App() {
  // The seed is minted in an event handler, never during render, and is carried
  // on the run record so any run can be reproduced from a bug report (AC-1308).
  const [run, setRun] = useState(null);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <SettingsProvider>
          <StatusBar style="light" />
          {run ? (
            <GameScreen
              key={run.id}
              seed={run.seed}
              difficulty={run.difficulty}
              onQuit={() => setRun(null)}
            />
          ) : (
            <HomeScreen
              onStart={(difficulty) => setRun({ id: newSeed(), seed: newSeed(), difficulty })}
            />
          )}
        </SettingsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
});
