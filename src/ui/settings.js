// The three accessibility toggles of ui.md §10, plus the OS Reduce Motion
// setting they sit beside.
//
// They are NOT persisted yet: AsyncStorage is AC-10xx and lands with Slice 4.
// ui.md §10 says "all persisted", and this is the one part of that sentence
// this slice does not keep. Everything else about them — what they change, and
// that the OS setting alone is enough to get the Reduce Motion path — is here.
//
// `reduced` is the OR of the OS setting and the in-app toggle, because AC-907
// is about the OS setting and the §10 toggle is a manual override of it, not a
// replacement for it.

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

import { diagnosticsAvailable, setDiagnosticsEnabled } from './diagnostics.js';

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
  const [prefs, setPrefs] = useState({
    sizeNumerals: false,
    highContrast: false,
    reduceMotion: false,
    diagnostics: false,
  });
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
  // here keeps one source: the toggle sets it, and nothing else reads `prefs`
  // to decide whether to record.
  useEffect(() => {
    setDiagnosticsEnabled(prefs.diagnostics);
  }, [prefs.diagnostics]);

  const value = useMemo(
    () => ({
      ...prefs,
      diagnostics: prefs.diagnostics && diagnosticsAvailable(),
      reduced: prefs.reduceMotion || systemReduce,
      set: (key, on) => setPrefs((previous) => ({ ...previous, [key]: on })),
    }),
    [prefs, systemReduce],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}
