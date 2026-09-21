// AC-10xx · the persisted save: records, stats, recent runs, the daily streak
// and the four unlocks.
//
// Storage is the one input this app did not write. So the corruption cases are
// not edge cases here, they are the main event, and they are tested by writing
// GENUINELY BAD DATA through the real parser rather than by mocking a rejected
// promise — a mocked rejection proves the catch block exists and nothing about
// what the parser does with half a JSON object.
//
// Every test here was run against a planted fault before it was trusted
// (docs/development-process.md §6.2). The plant for each is named in a comment
// where it is not obvious.

import test from 'node:test';
import assert from 'node:assert/strict';

import { DIFFICULTIES } from '../src/engine/constants.js';
import { ACTIONS, createRun, reduce, runRecord } from '../src/engine/engine.js';
import { STATUS } from '../src/engine/constants.js';
import { SPECIES_STYLE, COLORS } from '../src/ui/theme.js';
import {
  COSMETIC_SLOTS,
  RECENT_RUNS,
  SAVE_SCHEMA_VERSION,
  advanceStreak,
  applyRunRecord,
  dayKey,
  daysBetween,
  defaultSave,
  isDayKey,
  isNewBest,
  parseSave,
  serialiseSave,
  withAnnounced,
  withApplied,
  withSettings,
} from '../src/ui/progress.js';
import {
  BASE_COSMETICS,
  UNLOCKS,
  cosmeticsFor,
  pendingAnnouncements,
  unlockStatus,
  unlockedIds,
} from '../src/ui/cosmetics.js';
import { KEYS, readText, removeText, writeText } from '../src/ui/storage.js';
import { formatDay } from '../src/ui/format.js';

/** A run record shaped exactly like the engine's own selector produces. */
function record(over = {}) {
  return {
    seed: 'seed-1',
    difficulty: 'savanna',
    score: 1000,
    turns: 30,
    rowsCleared: 8,
    longestChain: 3,
    mostRowsInStep: 1,
    buffaloRetired: 0,
    perfectClears: 0,
    longestStreak: 2,
    chainGuardTrips: 0,
    ...over,
  };
}

// ---- AC-1003 / AC-1005 / AC-1006 · what comes off the disk ---------------

test('AC-1003 a save survives a round trip through the serialiser', () => {
  let save = defaultSave();
  save = applyRunRecord(save, record({ score: 4200 }), { day: '2026-09-21', at: 1 });
  save = withSettings(save, 'highContrast', true);
  save = withAnnounced(save, ['ratKing']);
  save = withApplied(save, 'theme', 'nightSavanna');

  const back = parseSave(serialiseSave(save));
  assert.deepEqual(back, save);
});

test('AC-1005 every corrupt blob parses to nothing, and none of them throws', () => {
  const good = serialiseSave(applyRunRecord(defaultSave(), record(), { day: '2026-09-21', at: 7 }));

  const bad = [
    null, undefined, 42, '', '   ',
    'not json at all',
    '{',                                       // a truncated write
    good.slice(0, Math.floor(good.length / 2)), // half a real save
    good.slice(0, good.length - 1),             // one byte short
    '[]', 'null', '"a string"', '{}',
    '{"schemaVersion":1}',
    JSON.stringify({ ...JSON.parse(good), best: null }),
    JSON.stringify({ ...JSON.parse(good), best: { savanna: { score: 1 } } }),
    JSON.stringify({ ...JSON.parse(good), lifetime: { games: -1 } }),
    JSON.stringify({ ...JSON.parse(good), recent: 'nope' }),
    JSON.stringify({ ...JSON.parse(good), streak: { count: 3, lastDay: 'yesterday' } }),
    JSON.stringify({ ...JSON.parse(good), streak: { count: 3, lastDay: null } }),
    JSON.stringify({ ...JSON.parse(good), settings: { sizeNumerals: 'yes' } }),
    JSON.stringify({ ...JSON.parse(good), unlocks: { announced: [7], applied: {} } }),
    // A score that is not a number, which is what a tampered file looks like.
    JSON.stringify({
      ...JSON.parse(good),
      best: { ...JSON.parse(good).best, tundra: { score: 'Infinity', chain: 0, turns: 0, rows: 0 } },
    }),
  ];
  for (const blob of bad) {
    assert.equal(parseSave(blob), null, `parsed something out of ${String(blob).slice(0, 40)}`);
  }
  // ...and the good one still parses, so the battery is not passing by refusing
  // everything. (Planted: `return null` at the top of parseSave — this line is
  // what caught it.)
  assert.notEqual(parseSave(good), null);
});

test('AC-1006 an older schemaVersion is discarded whole, never partially applied', () => {
  const current = JSON.parse(serialiseSave(
    applyRunRecord(defaultSave(), record({ score: 9999 }), { day: '2026-09-21', at: 1 }),
  ));
  for (const version of [0, SAVE_SCHEMA_VERSION - 1, SAVE_SCHEMA_VERSION + 1, '1', null]) {
    const stale = JSON.stringify({ ...current, schemaVersion: version });
    assert.equal(parseSave(stale), null, `version ${String(version)} was not discarded`);
  }
  // "Never partially applied" is the part with teeth: the caller opens on
  // defaults, and NOTHING from the stale blob reaches them.
  const opened = parseSave(JSON.stringify({ ...current, schemaVersion: 0 })) || defaultSave();
  assert.deepEqual(opened, defaultSave());
  assert.equal(opened.best.savanna.score, 0);
});

test('AC-1005 a run record folded into defaults is what a fresh install shows', () => {
  const save = defaultSave();
  assert.equal(save.schemaVersion, SAVE_SCHEMA_VERSION);
  assert.deepEqual(Object.keys(save.best).sort(), Object.keys(DIFFICULTIES).sort());
  for (const id of Object.keys(DIFFICULTIES)) {
    assert.deepEqual(save.best[id], { score: 0, chain: 0, turns: 0, rows: 0 });
  }
  assert.deepEqual(save.recent, []);
  assert.equal(save.streak.count, 0);
});

// ---- AC-1004 / AC-1008 / AC-1011b · what a finished run writes ------------

test('AC-1004 best scores are tracked separately per difficulty', () => {
  let save = defaultSave();
  save = applyRunRecord(save, record({ difficulty: 'meadow', score: 500 }), { day: '2026-09-21', at: 1 });
  save = applyRunRecord(save, record({ difficulty: 'tundra', score: 12000 }), { day: '2026-09-21', at: 2 });

  assert.equal(save.best.meadow.score, 500);
  assert.equal(save.best.tundra.score, 12000);
  assert.equal(save.best.savanna.score, 0, 'a habitat nobody played has no best');

  // A worse run in the same habitat does not lower the record.
  save = applyRunRecord(save, record({ difficulty: 'tundra', score: 10 }), { day: '2026-09-21', at: 3 });
  assert.equal(save.best.tundra.score, 12000);
  assert.equal(isNewBest(save, 'tundra', 12001), true);
  assert.equal(isNewBest(save, 'tundra', 12000), false, 'equalling a best is not beating it');
});

test('AC-1008 all four per-habitat records and the lifetime totals accumulate', () => {
  let save = defaultSave();
  save = applyRunRecord(save, record({
    score: 100, turns: 40, rowsCleared: 12, longestChain: 5, buffaloRetired: 2, perfectClears: 1,
  }), { day: '2026-09-21', at: 1 });
  save = applyRunRecord(save, record({
    score: 90, turns: 70, rowsCleared: 6, longestChain: 2, buffaloRetired: 1, perfectClears: 0,
  }), { day: '2026-09-21', at: 2 });

  assert.deepEqual(save.best.savanna, { score: 100, chain: 5, turns: 70, rows: 12 });
  assert.deepEqual(save.lifetime, {
    games: 2, turns: 110, rows: 18, buffaloRetired: 3, perfectClears: 1, mostRowsInStep: 1,
  });
});

test('AC-1011b the recent list is newest first and exactly ten deep', () => {
  let save = defaultSave();
  for (let i = 1; i <= RECENT_RUNS + 4; i += 1) {
    save = applyRunRecord(save, record({ score: i * 10, turns: i }), { day: '2026-09-21', at: i });
  }
  assert.equal(save.recent.length, RECENT_RUNS);
  assert.equal(save.recent[0].score, (RECENT_RUNS + 4) * 10, 'newest first');
  assert.equal(save.recent[RECENT_RUNS - 1].score, 50);
  // The aggregates do NOT replace the list: games counted every run, the list
  // kept the last ten. Both facts, from one fold.
  assert.equal(save.lifetime.games, RECENT_RUNS + 4);
  assert.deepEqual(Object.keys(save.recent[0]).sort(), ['at', 'day', 'difficulty', 'score', 'turns']);
});

test('AC-504e a run whose chain guard tripped writes no record of any kind', () => {
  let save = applyRunRecord(defaultSave(), record({ score: 500 }), { day: '2026-09-20', at: 1 });
  const before = save;

  save = applyRunRecord(save, record({
    score: 999999, turns: 400, rowsCleared: 900, buffaloRetired: 50, chainGuardTrips: 1,
  }), { day: '2026-09-21', at: 2 });

  assert.deepEqual(save.best, before.best, 'a flagged run set a high score');
  assert.deepEqual(save.recent, before.recent, 'a flagged run reached the recent list');
  assert.equal(save.lifetime.rows, before.lifetime.rows, 'a flagged run fed the unlock counters');
  assert.equal(save.lifetime.buffaloRetired, before.lifetime.buffaloRetired);
  // It WAS played, so it is counted as played and it keeps the daily streak.
  assert.equal(save.lifetime.games, before.lifetime.games + 1);
  assert.equal(save.streak.count, 2);
});

// ---- AC-1007 · the daily streak ------------------------------------------

test('AC-1007 dayKey is the device-local calendar day, not UTC', () => {
  // 23:30 local on the 21st is the 21st, whatever UTC thinks. Built with the
  // local constructor so this test says the same thing in every timezone.
  const late = new Date(2026, 8, 21, 23, 30, 0);
  assert.equal(dayKey(late), '2026-09-21');
  assert.equal(dayKey(new Date(2026, 0, 1, 0, 0, 0)), '2026-01-01');
  assert.equal(isDayKey('2026-09-21'), true);
  assert.equal(isDayKey('2026-9-21'), false);
  assert.equal(isDayKey(20260921), false);
});

test('AC-1007 days are counted as calendar labels, across months and DST', () => {
  assert.equal(daysBetween('2026-09-21', '2026-09-22'), 1);
  assert.equal(daysBetween('2026-09-30', '2026-10-01'), 1);
  assert.equal(daysBetween('2026-12-31', '2027-01-01'), 1);
  assert.equal(daysBetween('2026-02-28', '2026-03-01'), 1, 'non-leap February');
  assert.equal(daysBetween('2024-02-28', '2024-03-01'), 2, 'leap February');
  assert.equal(daysBetween('2026-09-21', '2026-09-24'), 3);

  // The timezone is SET here rather than inherited. This machine is
  // Asia/Saigon, which has had no DST since 1975, so any implementation at all
  // passes on it — a check that cannot fail where it runs (§6.2).
  //
  // The fault this catches, stated exactly: a `daysBetween` built on LOCAL
  // midnight and TRUNCATED. A spring-forward day is 23 hours, so two days
  // across it are 1.958 days and floor to 1 — the streak breaks for a player
  // who played on both. (`Math.round` over local midnights survives that,
  // which is why the plant has to be the truncating version: planting only
  // the local-midnight change is planting no fault at all, and this test
  // correctly did not fire on it.)
  const was = process.env.TZ;
  try {
    for (const zone of ['America/New_York', 'Europe/London', 'Australia/Sydney']) {
      process.env.TZ = zone;
      // Spring forward and fall back in each hemisphere: 23- and 25-hour days.
      assert.equal(daysBetween('2026-03-07', '2026-03-09'), 2, `${zone} spring`);
      assert.equal(daysBetween('2026-10-24', '2026-10-26'), 2, `${zone} autumn`);
      assert.equal(daysBetween('2026-03-28', '2026-03-29'), 1, `${zone} spring, adjacent`);
      assert.equal(daysBetween('2026-04-04', '2026-04-05'), 1, `${zone} autumn, adjacent`);
    }
  } finally {
    if (was === undefined) delete process.env.TZ;
    else process.env.TZ = was;
  }
});

test('AC-1007 the streak increments on the next day, resets after a gap', () => {
  let streak = { count: 0, lastDay: null };
  streak = advanceStreak(streak, '2026-09-21');
  assert.deepEqual(streak, { count: 1, lastDay: '2026-09-21' });

  streak = advanceStreak(streak, '2026-09-21');
  assert.deepEqual(streak, { count: 1, lastDay: '2026-09-21' }, 'a second run the same day');

  streak = advanceStreak(streak, '2026-09-22');
  assert.equal(streak.count, 2);
  streak = advanceStreak(streak, '2026-09-23');
  assert.equal(streak.count, 3);

  // One missed day resets to 1, not to 0: today still counts.
  streak = advanceStreak(streak, '2026-09-25');
  assert.deepEqual(streak, { count: 1, lastDay: '2026-09-25' });

  // No streak freeze, explicitly (gameplay.md §9).
  streak = advanceStreak({ count: 40, lastDay: '2026-01-01' }, '2026-03-01');
  assert.equal(streak.count, 1);
});

// ---- AC-1009 / AC-1010 / AC-1011 · the unlocks ---------------------------

test('AC-1009 each of the four conditions is exactly the one gameplay.md §9 states', () => {
  const at = (over) => {
    const save = defaultSave();
    return { ...save, lifetime: { ...save.lifetime, ...over.lifetime }, best: { ...save.best, ...over.best } };
  };
  assert.deepEqual(unlockedIds(defaultSave()), []);

  assert.deepEqual(unlockedIds(at({ lifetime: { buffaloRetired: 9 } })), []);
  assert.deepEqual(unlockedIds(at({ lifetime: { buffaloRetired: 10 } })), ['nightSavanna']);

  assert.deepEqual(unlockedIds(at({ best: { meadow: { score: 24999, chain: 0, turns: 0, rows: 0 } } })), []);
  assert.deepEqual(
    unlockedIds(at({ best: { meadow: { score: 25000, chain: 0, turns: 0, rows: 0 } } })),
    ['tundraPalette'],
    'scored in ANY habitat, because it is a score in a single run',
  );

  assert.deepEqual(unlockedIds(at({ lifetime: { rows: 499 } })), []);
  assert.deepEqual(unlockedIds(at({ lifetime: { rows: 500 } })), ['ratKing']);

  assert.deepEqual(unlockedIds(at({ lifetime: { mostRowsInStep: 3 } })), []);
  assert.deepEqual(unlockedIds(at({ lifetime: { mostRowsInStep: 4 } })), ['goldenHerd']);
});

test('AC-1010 every locked item carries a numeric counter toward its condition', () => {
  const save = defaultSave();
  save.lifetime.buffaloRetired = 7;
  const items = unlockStatus(save);
  assert.equal(items.length, UNLOCKS.length);

  const night = items.find((i) => i.id === 'nightSavanna');
  assert.deepEqual(
    { progress: night.progress, need: night.need, unit: night.unit, unlocked: night.unlocked },
    { progress: 7, need: 10, unit: 'buffalo retired', unlocked: false },
  );
  // Every item, locked or not, reports both numbers — an item without them is
  // the tease gameplay.md §9 refuses.
  for (const item of items) {
    assert.equal(typeof item.progress, 'number');
    assert.equal(typeof item.need, 'number');
    assert.ok(item.need > 0);
    assert.ok(item.progress <= item.need, 'progress is clamped so "12 / 10" never shows');
  }
});

test('AC-1009 an unlock is announced once and the save remembers it', () => {
  let save = defaultSave();
  save.lifetime.rows = 500;
  assert.deepEqual(pendingAnnouncements(save).map((u) => u.id), ['ratKing']);

  save = withAnnounced(save, ['ratKing']);
  assert.deepEqual(pendingAnnouncements(save), [], 'announced twice');

  // A second unlock later is still announced, and announcing is idempotent.
  save.lifetime.buffaloRetired = 10;
  assert.deepEqual(pendingAnnouncements(save).map((u) => u.id), ['nightSavanna']);
  save = withAnnounced(withAnnounced(save, ['nightSavanna']), ['nightSavanna']);
  assert.deepEqual(save.unlocks.announced.sort(), ['nightSavanna', 'ratKing']);
});

test('AC-1011 applying a cosmetic changes appearance and never writes a token', () => {
  // The fault this exists to catch: a cosmetic implemented by MUTATING the
  // shared palette, which is v1's mutable-module-global defect (A3) wearing a
  // different hat — the engine's own species table sits next to these objects.
  const speciesBefore = JSON.parse(JSON.stringify(SPECIES_STYLE));
  const colorsBefore = JSON.parse(JSON.stringify(COLORS));

  const save = defaultSave();
  save.lifetime.buffaloRetired = 10;
  save.lifetime.rows = 500;
  save.lifetime.mostRowsInStep = 4;
  save.best.tundra = { score: 25000, chain: 0, turns: 0, rows: 0 };
  const everything = {
    ...save,
    unlocks: { announced: [], applied: { theme: 'nightSavanna', palette: 'tundraPalette', animals: 'goldenHerd' } },
  };

  const skin = cosmeticsFor(everything);
  assert.notEqual(skin.colors.board, COLORS.board, 'the theme did nothing');
  assert.notEqual(skin.species.elk.fill, SPECIES_STYLE.elk.fill, 'the palette did nothing');
  assert.notEqual(skin.glyph('rat'), BASE_COSMETICS.glyph('rat'), 'the animal set did nothing');

  assert.deepEqual(SPECIES_STYLE, speciesBefore, 'cosmeticsFor wrote to SPECIES_STYLE');
  assert.deepEqual(COLORS, colorsBefore, 'cosmeticsFor wrote to COLORS');

  // ui.md §4.3 / AC-908 survive the palette: lightness still descends with size.
  const lum = (hex) => {
    const v = parseInt(hex.slice(1), 16);
    return 0.2126 * ((v >> 16) & 255) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255);
  };
  const ramp = ['rat', 'fox', 'elk', 'elephant'].map((t) => lum(skin.species[t].fill));
  for (let i = 1; i < ramp.length; i += 1) {
    assert.ok(ramp[i] < ramp[i - 1], `the tundra palette breaks the size ramp at ${i}`);
  }
});

test('AC-1011 a cosmetic the counters have not earned is ignored', () => {
  // A tampered save asking for an unlock it has not got. The disk is a request,
  // not an instruction.
  const save = {
    ...defaultSave(),
    unlocks: { announced: [], applied: { theme: 'nightSavanna', palette: 'tundraPalette' } },
  };
  const skin = cosmeticsFor(save);
  assert.equal(skin.colors.board, COLORS.board);
  assert.deepEqual(skin.species.elk, { ...SPECIES_STYLE.elk });

  // ...and an applied id that is not an unlock at all, or is in the wrong slot.
  const nonsense = {
    ...defaultSave(),
    unlocks: { announced: [], applied: { theme: 'ratKing', palette: '../../etc/passwd' } },
  };
  assert.equal(cosmeticsFor(nonsense).colors.board, COLORS.board);
  assert.equal(cosmeticsFor(nonsense).glyph('rat'), BASE_COSMETICS.glyph('rat'));
});

test('AC-1011 every unlock lands in a slot the save validator knows', () => {
  // Two sources that agree is the bug shape rather than its absence (§6.3).
  // `progress.js` refuses an unknown slot coming off the disk, so an unlock
  // declaring one would be an unlock that can never be persisted.
  for (const unlock of UNLOCKS) {
    assert.ok(COSMETIC_SLOTS.includes(unlock.slot), `${unlock.id} uses slot ${unlock.slot}`);
  }
  // ...and a slot that is not one of them never reaches the save. Written as
  // TEXT, because `{ __proto__: x }` in source sets the prototype and produces
  // no key at all — the hostile input only exists on disk.
  const smuggled = serialiseSave(defaultSave())
    .replace('"applied":{}', '"applied":{"__proto__":"nightSavanna","theme":"nightSavanna"}');
  assert.match(smuggled, /__proto__/, 'the fixture did not smuggle anything');
  assert.equal(parseSave(smuggled), null);
  // The same blob without the smuggled key is accepted, so this is refusing the
  // key and not the shape.
  assert.notEqual(
    parseSave(serialiseSave(defaultSave()).replace('"applied":{}', '"applied":{"theme":"nightSavanna"}')),
    null,
  );
});

test('AC-1011 withApplied holds one cosmetic per slot and can clear it', () => {
  let save = defaultSave();
  save = withApplied(save, 'animals', 'ratKing');
  assert.deepEqual(save.unlocks.applied, { animals: 'ratKing' });
  save = withApplied(save, 'animals', 'goldenHerd');
  assert.deepEqual(save.unlocks.applied, { animals: 'goldenHerd' }, 'two animal sets at once');
  save = withApplied(save, 'animals', null);
  assert.deepEqual(save.unlocks.applied, {});
});

// ---- the engine is the only source of the numbers ------------------------

test('AC-706b what the save records is what the engine counted, over a real run', () => {
  // Play a real run to Game Over and fold its OWN record in. Nothing in the
  // persistence layer recounts anything: if the fold drifted from the engine,
  // these four numbers would disagree.
  let state = createRun({ seed: 'persisted-run', difficulty: 'savanna' });
  let turns = 0;
  while (state.status === STATUS.READY && turns < 400) {
    state = reduce(state, { type: ACTIONS.PASS });
    turns += 1;
  }
  assert.equal(state.status, STATUS.GAME_OVER, 'the fixture run did not end');

  const finished = runRecord(state);
  const save = applyRunRecord(defaultSave(), finished, { day: '2026-09-21', at: 99 });

  assert.equal(save.best.savanna.score, state.score);
  assert.equal(save.best.savanna.rows, state.stats.rowsCleared);
  assert.equal(save.best.savanna.chain, state.stats.longestChain);
  assert.equal(save.best.savanna.turns, state.turn);
  assert.equal(save.lifetime.mostRowsInStep, state.stats.mostRowsInStep);
  assert.equal(save.recent[0].score, state.score);
});

// ---- the storage adapter -------------------------------------------------

/** An in-memory AsyncStorage. Strings in, strings out — nothing is mocked. */
function fakeStore(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    async getItem(key) { return map.has(key) ? map.get(key) : null; },
    async setItem(key, value) { map.set(key, value); },
    async removeItem(key) { map.delete(key); },
  };
}

test('AC-1003 the storage adapter round-trips a save through its two keys', async () => {
  const store = fakeStore();
  assert.equal(await readText(KEYS.save, store), null, 'a fresh install reads nothing');

  const save = applyRunRecord(defaultSave(), record({ score: 777 }), { day: '2026-09-21', at: 1 });
  assert.equal(await writeText(KEYS.save, serialiseSave(save), store), true);
  assert.deepEqual(parseSave(await readText(KEYS.save, store)), save);

  await removeText(KEYS.save, store);
  assert.equal(await readText(KEYS.save, store), null);
  assert.notEqual(KEYS.save, KEYS.resume, 'the two keys must not collide');
});

test('AC-1005 a storage backend that throws is a launch that still works', async () => {
  const hostile = {
    async getItem() { throw new Error('disk on fire'); },
    async setItem() { throw new Error('disk on fire'); },
    async removeItem() { throw new Error('disk on fire'); },
  };
  assert.equal(await readText(KEYS.save, hostile), null);
  assert.equal(await writeText(KEYS.save, '{}', hostile), false);
  assert.equal(await removeText(KEYS.save, hostile), false);

  // And a backend that hands back something that is not a string at all.
  const weird = { async getItem() { return { not: 'a string' }; } };
  assert.equal(await readText(KEYS.save, weird), null);
  assert.deepEqual(parseSave(await readText(KEYS.save, weird)) || defaultSave(), defaultSave());
});

test('AC-1011b the recent-runs list prints a date without leaning on Intl', () => {
  // Hermes' Intl varies by build. This is the Records screen's only piece of
  // arithmetic, and it lives in a module that imports nothing so it can be run
  // here rather than only looked at on a phone (§6.7).
  assert.equal(formatDay('2026-09-21'), '21 Sep');
  assert.equal(formatDay('2026-01-01'), '1 Jan');
  assert.equal(formatDay('2026-12-09'), '9 Dec');
  // A day key that should not exist is printed as-is rather than as "NaN ?".
  assert.equal(formatDay('nonsense'), 'nonsense');
  assert.equal(formatDay('2026-13-01'), '2026-13-01');
  assert.equal(formatDay('2026-09-00'), '2026-09-00');
});
