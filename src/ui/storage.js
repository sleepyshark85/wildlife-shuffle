// The only module in the app that talks to AsyncStorage.
//
// It is three lines of work wrapped in try/catch, and it is its own file for
// two reasons. One: everything else in the persistence layer — the schema, the
// migration, the replay, the unlock arithmetic — stays a pure function of a
// string, which is what lets `node --test` throw genuinely corrupt bytes at it
// instead of mocking a rejection (docs/development-process.md §6.7). Two: a
// hygiene test can then assert that exactly one module imports this one, which
// is how AC-1002 — no storage write during a turn or from the render path — is
// kept checkable as the app grows.
//
// `store` is a parameter with a default rather than module state, exactly as
// `diagnostics.js` injects `__DEV__`: the tests drive the real code path with a
// real in-memory backend, and nothing anywhere can swap the shipped one.
//
// Every call resolves. A rejected read is a read that returned nothing, and a
// rejected write is a write that did not happen — a launch must never hang or
// crash on storage (AC-1005), and a player who cannot write their save should
// still get to play.

import AsyncStorage from '@react-native-async-storage/async-storage';

/** gameplay.md §9: two keys, each one JSON object carrying a schemaVersion. */
export const KEYS = Object.freeze({
  save: 'ws.save.v1',
  resume: 'ws.resume.v1',
});

export async function readText(key, store = AsyncStorage) {
  try {
    const value = await store.getItem(key);
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}

export async function writeText(key, text, store = AsyncStorage) {
  try {
    await store.setItem(key, text);
    return true;
  } catch {
    return false;
  }
}

export async function removeText(key, store = AsyncStorage) {
  try {
    await store.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
