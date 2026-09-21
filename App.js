// The app shell: gesture root, safe-area provider, persistence, and which
// screen is showing.
//
// SafeAreaProvider + useSafeAreaInsets, never the deprecated SafeAreaView from
// react-native, which handles neither the Dynamic Island nor the home indicator
// correctly (docs/v1-review.md D7, ui.md §3.3). The insets are read as numbers
// by the screens that need them and fed into the layout formula.
//
// `ProgressProvider` sits OUTSIDE `SettingsProvider` because the three
// accessibility toggles are persisted in the same save blob as the records
// (AC-906b), so the settings context reads them from the progress context
// rather than keeping a second copy. It renders its children immediately on
// defaults rather than waiting for the disk: a launch must never be blocked by
// storage (AC-1005).

import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { COLORS } from './src/ui/theme.js';
import { ProgressProvider } from './src/ui/progressStore.js';
import { SettingsProvider } from './src/ui/settings.js';
import { newSeed } from './src/ui/useGameRun.js';
import { CollectionScreen } from './src/ui/screens/CollectionScreen.js';
import { HomeScreen } from './src/ui/screens/HomeScreen.js';
import { GameScreen } from './src/ui/screens/GameScreen.js';
import { RecordsScreen } from './src/ui/screens/RecordsScreen.js';

function Shell() {
  // The seed is minted in an event handler, never during render, and is carried
  // on the run record so any run can be reproduced from a bug report (AC-1308).
  const [run, setRun] = useState(null);
  /** 'home' | 'records' | 'collection'. Only meaningful while `run` is null. */
  const [screen, setScreen] = useState('home');

  if (run) {
    return (
      <GameScreen
        key={run.id}
        seed={run.seed}
        difficulty={run.difficulty}
        resumed={run.resumed}
        onQuit={() => setRun(null)}
      />
    );
  }
  if (screen === 'records') return <RecordsScreen onBack={() => setScreen('home')} />;
  if (screen === 'collection') return <CollectionScreen onBack={() => setScreen('home')} />;
  return (
    <HomeScreen
      onStart={(difficulty) => setRun({ id: newSeed(), seed: newSeed(), difficulty, resumed: null })}
      // AC-1012: the state handed over here was reconstructed by REPLAYING the
      // stored moves through the engine, so it is a board the rules produced.
      // A snapshot could hand over one they could not reach (src/ui/session.js).
      onResume={(state) =>
        setRun({ id: newSeed(), seed: state.seed, difficulty: state.difficulty, resumed: state })}
      onRecords={() => setScreen('records')}
      onCollection={() => setScreen('collection')}
    />
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ProgressProvider>
          <SettingsProvider>
            <StatusBar style="light" />
            <Shell />
          </SettingsProvider>
        </ProgressProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
});
