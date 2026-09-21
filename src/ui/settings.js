// The three accessibility toggles of ui.md §10, plus the OS Reduce Motion
// setting they sit beside.
//
// AC-906b: they are persisted, and they are persisted in the save blob rather
// than in a second store, so there is one file and one schema version to get
// right. That also means this provider holds no copy of them — it reads the
// three values straight off `useProgress()` and writes through `setSetting`.
// Two sources that agree is the bug shape rather than its absence
// (docs/development-process.md §6.3).
//
// The diagnostic log's switch is the exception and stays session-scoped: it is
// a development tool that `diagnosticsAvailable()` removes from a release
// build entirely, so persisting it would be persisting something the player
// can never turn back off.
//
// `reduced` is the OR of the OS setting and the in-app toggle, because AC-907
// is about the OS setting and the §10 toggle is a manual override of it, not a
// replacement for it.

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

import { diagnosticsAvailable, setDiagnosticsEnabled } from './diagnostics.js';
import { useProgress } from './progressStore.js';

const DEFAULTS = Object.freeze({
  sizeNumerals: false,
  highContrast: false,
  reduceMotion: false,
  diagnostics: false,
  reduced: false,
  set: () => {},
});

const SettingsContext = createContext(DEFAULTS);

export function useSettings() {
  return useContext(SettingsContext);
}

export function SettingsProvider({ children }) {
  const { save, setSetting } = useProgress();
  const [diagnostics, setDiagnostics] = useState(false);
  const [systemReduce, setSystemReduce] = useState(false);

  useEffect(() => {
    let alive = true;
    const apply = (value) => {
      if (alive) setSystemReduce(Boolean(value));
    };
    Promise.resolve()
      .then(() => AccessibilityInfo.isReduceMotionEnabled())
      .then(apply)
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', apply);
    return () => {
      alive = false;
      if (subscription && typeof subscription.remove === 'function') subscription.remove();
    };
  }, []);

  // The log's own switch is module state, because the thing that writes to it
  // is the state layer's lock callback rather than a component. Mirroring it
  // here keeps one source: the toggle sets it, and nothing else reads it to
  // decide whether to record.
  useEffect(() => {
    setDiagnosticsEnabled(diagnostics);
  }, [diagnostics]);

  const prefs = save.settings;
  const value = useMemo(
    () => ({
      ...prefs,
      diagnostics: diagnostics && diagnosticsAvailable(),
      reduced: prefs.reduceMotion || systemReduce,
      set: (key, on) => {
        if (key === 'diagnostics') setDiagnostics(Boolean(on));
        else setSetting(key, on);
      },
    }),
    [prefs, diagnostics, systemReduce, setSetting],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}
