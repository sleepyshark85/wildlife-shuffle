# Wildlife Shuffle — Slices

The v2 rebuild ships in slices. Each is designed, built, independently verified, and gated on
the owner. This file records what each one contains and what is actually true of it.

Companion documents: `docs/development-process.md` (how the squad works),
`docs/v2/acceptance-criteria.md` (the 266 numbered criteria), `docs/v1-review.md` (why v2
exists).

---

## Status

| # | Slice | ACs | State |
|---|---|---|---|
| **0** | Squad and approved design | — | **Merged** · PR #1 |
| **1** | Rules engine, headless | 2xx–7xx | **Merged** · PR #2, re-landed #3 |
| **2** | React state layer and board | 1xx, 4xx, 13xx | **Merged** · PR #5 |
| **3** | Motion, visual states, accessibility | 5xx, 8xx, 9xx | **Merged** · PR #9 |
| **4** | Meta progression and persistence | 10xx | **Merged** · PR #18 |
| **D** | Abilities — a layer, not a slice | 14xx | **Merged** · PR #22, #25 |
| **5** | Polish — sound, haptics | 11xx | **Merged** · PR #27, spec #28 |
| **6** | App Store readiness | 12xx | **Code merged** · PR #29, #30, #31 · *needs a human, see below* |

Slices 1–3 are a complete, shippable game. 4–6 are layers the owner can approve or defer
independently (`docs/v2/gameplay.md` §0).

**All slices are merged.** `npm test` on `main` is **431 passing**. What remains is not
slices — it is the things only the owner can do. The light-theme round landed as PR #36.

Out-of-band work merged alongside: PR #4 (process doc, v1 review correction), PR #6 (Expo
SDK 57 — Expo Go for iOS only ships the latest SDK, so SDK 56 could not run on a phone),
PR #7 (README rewrite), PR #8 (clear timing revised after the owner's first viewing),
PR #32 (pluralisation and the rail label), PR #33 (the light theme design),
**PR #34 (the worklet crash — see `docs/development-process.md` §6.9)**.

---

## Why the slices are cut this way

**The engine comes first because it is the only part that can be proved correct.** Roughly
75% of v1's defects lived in its state layer, not its rules. Building the engine headless,
with no rendering to hide behind, meant 162,611 fuzzed turns could run against it before a
single pixel existed. A feature-vertical slice would have buried engine bugs under rendering
bugs — which is exactly how v1 accumulated twelve commits named "fix bugs" and "fix syntax
issue".

Each slice's gate is the thing that would actually embarrass the game if it were wrong:

| Slice | Gate |
|---|---|
| 1 | Same seed replays identically, and 100k+ fuzzed turns violate no invariant |
| 2 | **The game plays.** Pick a habitat, drag, resolve, reach Game Over |
| 3 | The clear animation reads, and a dropped frame cannot corrupt the board |

---

## Slice 0 — Squad and approved design

Three agents in `.claude/agents/` with enforced separation: the designer writes no code, the
developer cannot redefine acceptance criteria, the tester cannot fix what it finds.

Produced `docs/v2/` — gameplay, UI, acceptance criteria, open questions — and
`docs/v1-review.md`.

---

## Slice 1 — Rules engine

`src/engine/`: `constants`, `rng`, `board`, `spawn`, `scoring`, `resolve`, `summary`,
`engine`. A pure reducer with no React, no timers, no `Date.now()`, no `Math.random()`.
Randomness comes only from a seeded PRNG carried in the state.

**Evidence**
- 162,611 fuzzed turns, zero invariant violations
- Determinism held under seeded replay hashing, cross-process agreement, and ten poisoned
  globals (2,486 turns, zero trips)
- 118 tests

**Three defects found by execution, not reading**

| | Before | After |
|---|---|---|
| A run could open on an empty board | ~1 in 600 | 0 in 60,000 |
| The 8-step chain rail was reachable, and capping left a completed row on the board | 7 boards at depths 9–11 | resolves at every depth |
| Two `createRun` calls shared animal ids | 5 shared | 0, replay still identical |

**The chain rail was then removed entirely.** All three parties had accepted that paying past
it would extend `chainMult` beyond what the rail bounded. Nobody had checked. `chainMult` is
flat at ×5 from step 5, so paying step 11 pays what step 5 pays — it bounded nothing, while
confiscating 9,750 of 17,100 points on the test fixture.

---

## Slice 2 — State layer and board

v1's nine source files deleted. `src/ui/`: React state layer, presentation, one pure layout
function.

**Evidence**
- 296 turns replayed against the engine across three runs to Game Over — zero divergences in
  board, score, tray, buffalo chip or streak pill
- **Zero React commits mid-drag**, across all 296 drags, measured with a devtools-hook stub
- Tracking is 1:1 to two decimals: pointer +71 → body +71.00
- 682,290 viewport combinations, zero overflowing
- 161 tests, lint included

**What changed architecturally.** The drag is a `Gesture.Pan()` writing Reanimated shared
values; React learns the result on release through one `runOnJS`. `PanResponder` is banned
outright. `babel.config.js` did not exist in this repo at all, so Reanimated had been silently
doing nothing.

**v1's worst bug, closed with a measurement.** AC-203 was proved live rather than assumed, by
counting `Math.imul` calls against a Node baseline: `createRun` 86→172, `reduce` 12→24.
StrictMode really does double-invoke the reducer, and each action still produces exactly one
turn.

**Three defects found and fixed**: a multi-touch case where presentation silently disagreed
with state; a 44 pt button in a 43 pt border-box; and a test that could not fail.

---

## Slice 3 — Motion, visual states, accessibility

*Merged.* The motion table, clearing and buffalo visual states, accessibility, and
Reduce Motion. New: `src/ui/replay.js` — a pure function from pre-turn board plus the turn's
event stream to an animation schedule.

**The clear animation is the headline.** The owner played Slice 2 and said the row
disappearing was "too abrupt" — while seeing no clear animation at all, since the motion table
was out of that slice's scope. That found a real defect anyway: the flash had gone
1200 → 400 → 140 ms across three revisions, every cut argued from input-lock arithmetic, and
after it was reclassified as an announcement — at which point it stopped costing budget —
nobody revisited the number.

Now 320 ms, shaped 60 ms attack and 260 ms decay. *Abruptness is an attack/decay problem, not
only a duration problem.*

**Measured** (page rAF clock, against AC-814's 30 ms tolerance): flash onset 583 vs 570, lead
beat 83 vs 80, collapse 101 vs 110, input reopened 955 vs a 960 budget.

**A real Reanimated defect found**: `withDelay` under Reduce Motion does not shorten a delay,
it *skips* it — every scheduled beat of a turn would have fired on one frame.

**Bugs found by measuring rather than assuming**: the score count-up finished 233–249 ms
*before* the row flashed; the displayed score dropped to zero on every clearing turn (18
backwards steps in 45 turns — `animatedProps` had made the input controlled); the first
clock-origin fix passed its unit test and changed nothing; and a new audit found
`MOTION.flash` read by no shipped code.

**Dynamic Type was unsatisfiable as specified** and is now split by surface — board never
scales, sheets scale freely, the HUD trades labels for values, fixed-height chrome caps
rather than pins. *A cap is not an exemption.* It is **not observable at Tier 2 at all**:
`react-native-web` hard-codes `fontScale: 1` (AC-910h).

**The anticipation wash is the clearest case of implementation correcting design.** The spec
asked for a uniform row wash; building it revealed that a row about to be completed is by
definition nearly full, so what actually lights is the remaining *gap* — the columns the
arrival is about to fill. Now specified deliberately at 0.14 on the gap and 0.05 on the
bodies, with the levers written as a judgement rule rather than a tuning step.

Tests 161 → 194. The clear timings and the wash remain **provisional** pending a device
viewing (AC-824c carries the full list).

---

## Slice 4 — Meta progression and persistence

*Built by the developer; **not yet independently verified**.* AsyncStorage returns
(`@react-native-async-storage/async-storage`, added with `npx expo install`), and with it high
scores per habitat, lifetime stats, the last-ten-runs list, the daily streak, four cosmetic
unlocks, the Records and Collection screens, and session resume.

**New modules.** `src/ui/progress.js` (the save schema, its validator, the daily streak),
`src/ui/session.js` (the resume replay), `src/ui/cosmetics.js` (the four unlocks),
`src/ui/storage.js` (the only module that imports AsyncStorage), `src/ui/progressStore.js`
(the React layer that owns every write), `src/ui/useAppState.js`, and the two screens.

**Session resume is a replay, not a snapshot.** `{schemaVersion, engineVersion, seed,
difficulty, start, moves[], digest}` — under a kilobyte for a 30-turn run — reconstructed by
re-running the engine from turn 1. *A replay can only ever reconstruct a legal board, because
the engine produced it.* A snapshot could inject a board the rules cannot reach, which is the
exact condition AC-504b's chain guard exists to catch. A 3,000-mutation fuzz asserts that
every tampered blob is either discarded or replays to a board that satisfies the engine's own
invariants.

**`engineVersion` is a fingerprint of the tuning surface, not a hand-maintained string.** It
is `fnv1a` over `BOARD`, `DIFFICULTIES`, `SCORE`, `SPECIES` and the ramp constants, so the
band retune now sitting in `docs/v2/` invalidates every replay written before it the moment it
reaches `constants.js` — automatically, with nobody to remember. AC-1016 is the load-bearing
clause: losing a run to an app update is acceptable, silently resuming the wrong one is not.

**The design was underspecified in one place, and it matters.** gameplay.md §9 lists the
record as `{schemaVersion, engineVersion, seed, difficulty, moves[], digest}` with
`moves[] = [{t:'M', id, x}|{t:'P'}]`. That is not replayable on its own: animal ids are
namespaced by `runIndex` and numbered from `nextAnimalId` (AC-214), both carried across a
RESTART, so a run reached by **Play Again** mints ids a fresh `createRun` cannot reproduce and
a stored move names an animal that does not exist. The record carries a `start:
{runIndex, nextAnimalId}` field for that. Planting the design's literal shape and watching the
Play Again test fail is in the developer's report.

**Two defects the tests found while being written**, both in code written the same hour:
`DIFFICULTIES[id]` is not a membership test — `DIFFICULTIES['__proto__']` is
`Object.prototype` and truthy, so a tampered save could name it; and a `daysBetween` built on
local midnight and truncated breaks a streak across a 23-hour spring-forward day. This
machine is `Asia/Saigon`, which has had no DST since 1975, so that test sets its own timezone.

**AC-1002 is kept structural.** AsyncStorage is reachable from exactly one module, that module
from exactly one more, and the in-progress run is written from exactly one call site inside the
`AppState` transition. The app still owns exactly two timers, both in `useGameRun.js`. v1
serialised the whole board on a 1 Hz `setInterval` whose `[store]` dependency rebuilt the
interval on every render (`GameScreen.js:53-72`); the trade-off taken instead is that a hard
crash loses the run, which the design states and accepts.

Tests 220 → 263 (43 new). 50 planted faults, all caught.

---

## Layer D — Abilities

*Merged.* Five abilities, one per species, **scope scaling with size**: rat acts on one animal,
fox on one turn's actions, elk on one species, elephant on the board's layout, buffalo on time.
It shipped out of order relative to Slices 5 and 6, which is the layer model working rather
than a problem with it — layers are defined by independence, and pulling this forward without
disturbing anything is the evidence the boundary was drawn correctly.

**Two rules are structural rather than remembered.** An ability runs inside the ACTION phase,
of which there is exactly one, so it can never be taken *as well as* a move. And `score` is
written in exactly one place — the fold of the event stream — so spending cannot deduct it, a
property a hygiene grep enforces by auditing every score write for a subtraction.

**The self-limiting guarantee is measured, not argued.** 270 runs across three spending
policies: zero failed to end. A freeze-abusing bot gains **+16% turns and +4% score** — it buys
survival and not points, which is the whole property.

**Abilities cost 1–3 charges, priced from measured value**, after a flat price let Stampede
(+194%) dominate Burrow (+11%) at 24× the value for the same cost. *Scope follows size; price
follows value — two ladders, and forcing them to agree would be dishonest.* Hold the Line has
the largest scope in the set and the smallest score effect, because it buys turns not points.

**Last Stand** grants one charge the first time an animal enters the danger band — regardless of
score, regardless of the cap, once per run. It exists because the score ladder structurally
cannot reach the player who needs help: charges come from clearing, and a player in trouble is
not clearing.

**The defect worth remembering**: the cancel scrim sat above the animals in z-order, so tapping
a valid target read as "tapped outside, cancel" and **two of the five abilities could not be
used at all** — with a code comment four lines above asserting the opposite. It shipped through
327 passing tests. The fix gave z-order one owner and added a hit-test check; fixing it then
exposed a second defect, because an invalid target that no longer falls through *swallows* the
tap instead.

---

## Slices 5–6, merged

| | Contents |
|---|---|
| **5 — Polish** | Sound and haptics. Eleven generated WAVs (`tools/make-sounds.mjs`), an injectable cue engine so `node --test` can watch the audio session get configured before any player exists, and cues fired off the board's own clock rather than a timer. |
| **6 — Store readiness** | Icon, splash, onboarding, `store/metadata.md`, and the EAS project. |

**Q1 is settled.** The bundle identifier is **`com.sleepyshark.wildlifeshuffle`** and it is
now **permanent** — the first TestFlight build has been submitted under it. The Expo *slug*
is `wildlife-shuffle`; slugs are immutable too, but they are cosmetic. Do not confuse the
two (PR #30, #31).

### What is actually left

| | |
|---|---|
| **~~The light theme~~** | **Done** — PR #36. AC-1501–1522. Light default, persisted, paper-grain texture, per-ramp cosmetics. |
| **The device review** | AC-824c. Owed since Slice 3 and still owed. Only the owner can do it. |
| **Store assets from a device** | Real screenshots, icon sign-off, support and privacy URLs. |

**The first TestFlight build crashed** on the very first row clear, every time — a plain
function called from three worklets (PR #34). It is fixed on `main`. The owner needs to
rebuild and confirm, and that build is also the first time anyone will *hear* Slice 5.

---

## What is verifiable, and what is not

| Tier | Method | Proves |
|---|---|---|
| 1 · Engine | `node --test` plus seeded invariant fuzzing | Rules, scoring, determinism |
| 2 · End-to-end | Expo web plus Playwright at iPhone viewport | The full loop: input → state → render |
| 3 · Layout | Arithmetic over the continuous viewport sweep | Device fit, including hardware that has not shipped |
| 4 · On device | The owner, on a real iPhone | Feel, haptics, true touch, performance |

Only tier 4 proves iOS. Tier 2 runs `react-native-web` on synthetic events: a failure there is
real, a pass is a strong signal and not proof.

**Known to need a device:** `hitSlop` is ignored entirely by react-native-web, so touch targets
are untested on iOS; real safe-area insets (everything has been measured at 0/0); the snap;
the grabbed state; and the provisional clear timings.

**And one class of defect no tier below 4 can even represent.** Anything that differs between
a `.native` and a `.web` module — worklet serialization above all — cannot fail on web,
because on web a worklet is an ordinary closure. That is how the first TestFlight build
shipped a guaranteed crash past 375 green tests. Such properties are now audited
*structurally* in Tier 1 (`AC-828 a worklet calls only worklets`); see
`docs/development-process.md` §6.9 before assuming a green suite means a working build.

---

## Resuming this project in a fresh session

Read this first if you are picking this up with no conversation history.

### 1. Find out where things actually are

```bash
git fetch && git status && git log --oneline -5
gh pr list --state open
npm test                          # expect green; the count tells you which slice landed
node docs/v2/check-ac-refs.mjs    # must PASS
node docs/v2/layout-sweep.mjs     # must be 0 overflowing
```

**`git fetch` before trusting anything.** A session-start snapshot is a snapshot, not the
truth — `docs/development-process.md` §6.4 records the time that cost a whole review.

Test counts locate the slice: **118** = Slice 1, **161** = Slice 2, **194** = Slice 3,
**263** = Slice 4, **344** = Layer D, **431** = the worklet audit that came out of the crash
(§6.9), **448** = the light theme, **475** = the first device round (PRs #38-#41).

### 2. Know the shape of the work

- `CLAUDE.md` — ground truth, repo map, the architectural rule
- `docs/development-process.md` — the squad, the pipeline, and §6, the incidents and the rule
  each produced. **Read §6 before writing a test or trusting a green check.**
- `docs/v2/acceptance-criteria.md` — the contract. Work is done when its ACs pass.
- `docs/v2/open-questions.md` — decisions the owner still owes.
- This file — what each slice contains.

### 3. How work moves

Design → owner approves → build → independently verify → fix → PR → merge.

Three agents in `.claude/agents/`, invoked by name (`game-designer`, `game-developer`,
`game-tester`). **They are registered from disk at session start**, so a fresh session can use
them directly. Their boundaries are the point: the designer writes no code, the developer
cannot redefine ACs, the tester cannot fix what it finds and does not read the developer's
tests before writing its own.

**Agents do not commit. The orchestrator does.** Branch each slice from `main`, stage
explicitly — never `git add -A` — and verify the code reached `main` after merging.

**Verify every agent claim** against the files and by execution before acting on it or relaying
it to the owner. In Slice 1 that caught two ACs reported as added that did not exist, and a
table reported as reworded that was unchanged.

### 4. Standing rules that are easy to violate

- **A check that cannot fail is not a check.** Before trusting a new test, lint or harness,
  inject the fault it exists to catch and watch it fail. Two defects in this project were
  checks that could only pass.
- **A clean console proves nothing.** v1's drag failed silently with no error. Watch the thing
  move.
- **Measure, don't assert.** Every pacing, layout and timing claim in `docs/v2/` has a harness
  behind it.
- **Kill any dev server you start.** Leftovers have blocked the owner's port twice.
- Animation is a replay of state the engine already resolved, never a driver of it.

### 5. What the owner has delegated

Merging is authorised: *"when I say go for it, you can merge it yourself."* Still open the PR
and report what is in it. Everything else — scope, design departures, anything outward-facing
beyond this repo — goes to them.

### 6. What needs a human, and cannot be worked around

`hitSlop` is ignored by react-native-web, so iOS touch targets are untested. Safe-area insets
have only ever been measured at 0/0. The clear timings (AC-824c) and the anticipation wash
(AC-824d) are explicitly provisional pending a device viewing — the AC ends *"watch them and
adjust; do not defend them."*

Run it on a phone with `npx expo start`, scan with Expo Go. No Expo account is needed for a
local dev server. Machine LAN address at time of writing: `192.168.1.150`.
