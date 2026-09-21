// The persistence state layer (AC-1001 to AC-1022).
//
// It holds the loaded save and the resumable run, and it owns every write. The
// three rules it keeps, each of which is an AC:
//
//  1. **No timer, and no write from the render path** (AC-1002). v1 serialised
//     the whole board to AsyncStorage on a 1 Hz `setInterval` whose `[store]`
//     dependency rebuilt the interval on every render, for the life of the run
//     (`GameScreen.js:53-72` at v1 HEAD). There is no timer in this file, and
//     the hygiene suite asserts the app still owns exactly two, both in
//     `useGameRun.js`. Writes happen in three places and all three are event
//     handlers or an AppState transition: a run ending, a setting changing, and
//     the app going to the background.
//
//  2. **A launch is never blocked** (AC-1005). The provider renders its
//     children immediately on defaults and adopts what came off the disk when
//     it arrives. A corrupt blob, a rejected read and a read that never
//     resolves are all the same to the player: the app opens.
//
//  3. **The run record is written exactly once** (AC-1001). The run that ended
//     is identified by its own `origin` plus its final turn, and a record that
//     has already been written is not written again — StrictMode double-invokes
//     effects in development and this is the file that would double-count a
//     game if it did not say so out loud.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { BASE_COSMETICS, cosmeticsFor, pendingAnnouncements } from './cosmetics.js';
import {
  applyRunRecord,
  dayKey,
  defaultSave,
  parseSave,
  serialiseSave,
  withAnnounced,
  withApplied,
  withOnboarded,
  withSettings,
} from './progress.js';
import { atRest, buildResume, restoreResume, serialiseResume } from './session.js';
import { KEYS, readText, removeText, writeText } from './storage.js';

const EMPTY = defaultSave();

const ProgressContext = createContext({
  loaded: false,
  save: EMPTY,
  resume: null,
  finishRun: () => {},
  saveResume: () => {},
  discardResume: () => {},
  setSetting: () => {},
  announce: () => {},
  applyCosmetic: () => {},
  finishOnboarding: () => {},
});

/**
 * A second context, on purpose. The board reads the appearance and nothing
 * else, so it must not re-render because a recent-runs list changed.
 */
const CosmeticsContext = createContext(BASE_COSMETICS);

export function useProgress() {
  return useContext(ProgressContext);
}

export function useCosmetics() {
  return useContext(CosmeticsContext);
}

export function ProgressProvider({ children }) {
  const [loaded, setLoaded] = useState(false);
  const [save, setSave] = useState(EMPTY);
  /** The replayed in-progress run, or null. Replayed once, at launch. */
  const [resume, setResume] = useState(null);

  // The latest save, readable from an async callback that started before the
  // last commit. Two writes racing would otherwise resolve to whichever one
  // read `save` last, which is a lost setting or a lost record.
  const saveRef = useRef(save);
  /** Run keys already written. AC-1001, and StrictMode's double-invoke. */
  const writtenRef = useRef(new Set());

  const commit = useCallback((next) => {
    saveRef.current = next;
    setSave(next);
    // Fire and forget: nothing in the UI waits on the disk, and a failed write
    // is a write that did not happen rather than an error the player must see.
    writeText(KEYS.save, serialiseSave(next));
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [saved, pending] = await Promise.all([
        readText(KEYS.save),
        readText(KEYS.resume),
      ]);
      if (!alive) return;
      const parsed = parseSave(saved) || defaultSave();
      saveRef.current = parsed;
      setSave(parsed);
      // AC-1015/AC-1016/AC-1017: the replay is the only way a board gets in
      // here, and `restoreResume` returns null rather than throwing for every
      // form of wrong there is.
      setResume(restoreResume(pending));
      setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  /** AC-1020: a run ends, the resume is cleared and the record is written. */
  const finishRun = useCallback((record, endedAt) => {
    const key = `${record.seed}:${record.difficulty}:${record.turns}:${record.score}`;
    if (writtenRef.current.has(key)) return;
    writtenRef.current.add(key);
    removeText(KEYS.resume);
    setResume(null);
    const at = endedAt instanceof Date ? endedAt : new Date(endedAt);
    commit(applyRunRecord(saveRef.current, record, { day: dayKey(at), at: at.getTime() }));
  }, [commit]);

  /**
   * AC-1013: called from the AppState transition, and from nowhere else.
   *
   * The in-memory offer is replaced with what was just written rather than
   * cleared, so Home and the disk cannot disagree about which run is saved —
   * the two-sources shape that §6.3 of the process doc is about.
   */
  const saveResume = useCallback((state) => {
    writeText(KEYS.resume, serialiseResume(buildResume(state)));
    setResume(atRest(state));
  }, []);

  /** AC-1019: starting a new run discards the saved one, after confirmation. */
  const discardResume = useCallback(() => {
    setResume(null);
    removeText(KEYS.resume);
  }, []);

  const setSetting = useCallback((key, value) => {
    commit(withSettings(saveRef.current, key, value));
  }, [commit]);

  /** AC-1009: an unlock is announced once, and the save remembers that. */
  const announce = useCallback((ids) => {
    if (!ids.length) return;
    commit(withAnnounced(saveRef.current, ids));
  }, [commit]);

  const applyCosmetic = useCallback((slot, id) => {
    commit(withApplied(saveRef.current, slot, id));
  }, [commit]);

  /**
   * AC-1207. Completed, skipped, or abandoned by walking out of it — all three
   * end here, and the save records only that it happened. One write, from an
   * event handler, like every other write in this file.
   */
  const finishOnboarding = useCallback(() => {
    commit(withOnboarded(saveRef.current));
  }, [commit]);

  const value = useMemo(
    () => ({
      loaded,
      save,
      resume,
      finishRun,
      saveResume,
      discardResume,
      setSetting,
      announce,
      applyCosmetic,
      finishOnboarding,
    }),
    [loaded, save, resume, finishRun, saveResume, discardResume, setSetting, announce,
      applyCosmetic, finishOnboarding],
  );

  const { unlocks, lifetime, best } = save;
  const cosmetics = useMemo(
    () => cosmeticsFor({ unlocks, lifetime, best }),
    [unlocks, lifetime, best],
  );

  return (
    <ProgressContext.Provider value={value}>
      <CosmeticsContext.Provider value={cosmetics}>{children}</CosmeticsContext.Provider>
    </ProgressContext.Provider>
  );
}

/** AC-1009, as the Game Over sheet needs it: what to announce, once. */
export function useAnnouncements(save) {
  return useMemo(() => pendingAnnouncements(save), [save]);
}
