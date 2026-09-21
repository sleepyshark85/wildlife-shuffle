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

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { COLORS } from './src/ui/theme.js';
import { BEATS, ONBOARDING_DIFFICULTY, beatRun, nextBeat } from './src/ui/onboarding.js';
import { hasPlayed } from './src/ui/progress.js';
import { ProgressProvider, useProgress } from './src/ui/progressStore.js';
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
  const progress = useProgress();

  /**
   * S7 · onboarding. `{ beat, seed }`, or null.
   *
   * The seed is here and not inside the beat because restarting a beat has to
   * produce a different tray — a beat the player has already watched arrive
   * should not arrive identically the second time, and beat 3's whole subject
   * is what the tray says.
   */
  const [tutorial, setTutorial] = useState(null);

  /**
   * AC-1206: a first launch with no stored data. Two conditions, and the second
   * is not redundant. `onboarded` is false for everyone who installed before
   * schema 3 existed, because a migration cannot invent a value it was never
   * given (src/ui/progress.js) — so `hasPlayed` is what keeps an app update
   * from putting a tutorial in front of somebody with a high score.
   *
   * `startedRef` is belt and braces against the one commit between finishing
   * onboarding and the save reporting it. Every exit writes `onboarded`, so the
   * condition below is false forever afterwards; the ref means "forever" does
   * not depend on that write having landed yet.
   */
  const startedRef = useRef(false);
  const firstLaunch = progress.loaded && !progress.save.onboarded && !hasPlayed(progress.save);
  useEffect(() => {
    if (!firstLaunch || startedRef.current) return;
    startedRef.current = true;
    setTutorial({ beat: BEATS[0], seed: newSeed() });
  }, [firstLaunch]);

  const finishOnboarding = progress.finishOnboarding;
  /** AC-1207: completed, skipped or walked out of — one exit, one write. */
  const endTutorial = useCallback(() => {
    setTutorial(null);
    finishOnboarding();
  }, [finishOnboarding]);
  const advanceTutorial = useCallback(() => {
    setTutorial((was) => {
      if (!was) return was;
      const next = nextBeat(was.beat);
      return next ? { beat: next, seed: newSeed() } : was;
    });
  }, []);
  const restartBeat = useCallback(() => {
    setTutorial((was) => (was ? { ...was, seed: newSeed() } : was));
  }, []);

  if (tutorial) {
    const last = nextBeat(tutorial.beat) === null;
    return (
      <GameScreen
        // A beat is a new run, so it is a new mount: the scripted board arrives
        // through the lazy initialiser, exactly as a resumed run does.
        key={`${tutorial.beat}:${tutorial.seed}`}
        seed={tutorial.seed}
        difficulty={ONBOARDING_DIFFICULTY}
        resumed={beatRun(tutorial.beat, tutorial.seed)}
        onboarding={{
          beat: tutorial.beat,
          onNext: last ? endTutorial : advanceTutorial,
          onSkip: endTutorial,
          onRestart: restartBeat,
        }}
        onQuit={endTutorial}
      />
    );
  }

  if (run) {
    return (
      <GameScreen
        key={run.id}
        seed={run.seed}
        difficulty={run.difficulty}
        resumed={run.resumed}
        onHowToPlay={() => {
          setRun(null);
          setTutorial({ beat: BEATS[0], seed: newSeed() });
        }}
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
