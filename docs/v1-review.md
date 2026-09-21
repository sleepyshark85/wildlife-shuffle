# Wildlife Shuffle v1 — Engineering Review

Reviewed at commit `1f6f9c3`. 1,877 lines across 9 source files, Expo SDK 56 / RN 0.85 / React 19.
This document is the squad's input: it records what v1 got wrong so v2 does not repeat it.

---

## CORRECTION — this review was written against a stale commit

**Added 2026-09-20.** The review below was written against `1f6f9c3`, taken from a
session-start git snapshot. `origin/main` was **7 commits ahead** (work dated 11–16 July,
897 insertions across 14 files). The correct HEAD is `01c247e`.

The architectural findings survive. **The feature inventory does not.** Corrections:

| Section | Original claim | Corrected |
|---|---|---|
| **C2** | The next-row preview re-rolls spawn columns, so it lies | **FIXED in v1.** The reposition loop is gone from `gameStore.js`. |
| **D5** | Every animal is the same blue block | **PARTLY FIXED.** Buffalo is now red `#e74c3c`; all four other species remain `#2255dd`. Size is still not legible. |
| **D6** | `console.log` on every render in three components | **PARTLY FIXED.** `GameGrid` and `GamePreview` are clean; `GameScreen` still has two. |
| **E** | "No score" | **WRONG.** v1 has a score, a persisted high score, and session history (`StatsPanel.js`). |
| **E** | "Nothing is persisted; settings reset on every launch" | **WRONG.** `src/hooks/useLocalStorage.js` persists high score and supports **session resume** — a mid-run game survives a relaunch. |
| **E** | "No sound" | **WRONG.** `src/hooks/useSoundManager.js` provides haptics via `expo-haptics`. |
| **E** | "`@react-native-async-storage/async-storage` is unused" | **WRONG.** It is used by `useLocalStorage`. `expo-sqlite` and `react-native-url-polyfill` remain unused. |
| **D1** | Two disagreeing cell-size formulas | **Understated — there are three.** `GameScreen.js:41` sizes on width only; `GameGrid.js:30` and `GamePreview.js:14` on `min(w,h)`. |

**Re-verified as still present at `01c247e`**, by execution or direct inspection:
A1 (turn resolution inside `setState` updaters), B1 (the conditional hook in
`GamePreview.js:7-9`, byte-identical), C1 (`Math.ceil(1.5)` at `gameLogic.js:72` — Normal
and Hard remain identical), C4, C5, D3 (`PanResponder`, 10 occurrences), D4 (`dropping: {}`
is still an empty style object), D7 (deprecated `SafeAreaView`), and the absence of both
`assets/` and `babel.config.js`.

**Consequence for v2.** Session resume is a real v1 feature with no equivalent anywhere in
the v2 design, and it is the one most likely to be missed. Score, high score and haptics are
covered by Layers A and B but were specified as new work rather than as ports.

**Process rule adopted:** `git fetch` and compare against `origin/<branch>` before reviewing
anything. See `docs/development-process.md` §6.4.

---

## A. State-management defects (the root cause of most gameplay bugs)

**A1 — Side effects inside `setState` updaters.** `gameStore.js:170-250` runs the entire
turn resolution inside a `setAnimals(prev => ...)` updater: `setClearingRows`, `setTurn`,
`setNextAnimals`, `setTimeout`, and the `onMoveComplete` callback all fire from within it.
`executeChainClear` (`:52-66`) does the same, including a recursive self-call. React
updaters must be pure. Under React 19 StrictMode dev these run **twice**, so every turn
double-increments the counter and spawns two batches of animals. This is the single
largest source of "it behaves randomly."

**A2 — Effect fires on every render.** `useGameStore` calls `validateConfig(config)` during
render (`:24`), producing a fresh object identity each time. The turn-0 auto-clear effect
(`:272-296`) lists `gameConfig` in its dependency array, so it re-runs every render and can
schedule its 1200 ms timeout repeatedly.

**A3 — Mutable module globals for grid size.** `gameLogic.js:2-8` keeps `GRID_WIDTH` /
`GRID_HEIGHT` as mutable module state, written by `setGridDimensions` **during render**
(`gameStore.js:27`). `canMoveAnimal` and `checkGameOver` read these globals rather than the
config passed to them, so they silently disagree with the rest of the system.

**A4 — No timer ownership.** Nine bare `setTimeout` calls, one of which is tracked by a ref.
Nothing is cleared on unmount, and `resetGame` (`:253-259`) does not cancel in-flight
timers — so a previous game's pending callbacks mutate the new game's state. `resetGame`
also declares `[]` dependencies while closing over `gameConfig`, making it stale.

**A5 — ID collisions.** `nextId` is module-global; `resetAnimalsCounter()` rewinds it to 1
while animals from the prior game may still be referenced by pending timers, producing
duplicate React keys.

---

## B. Rules-of-Hooks violation

**B1 — Conditional hook.** `GamePreview.js` returns `null` at line 7, then calls
`useWindowDimensions()` at line 9. When `nextAnimals` flips between empty and non-empty the
hook order changes. This is a crash, not a warning.

---

## C. Gameplay / rules defects

**C1 — Normal and Hard difficulty are identical.** `animalsPerTurn` is `1.5` for Normal and
`2` for Hard, but `generateAnimalsForTurn` does `Math.ceil(animalsPerTurn)` — both yield 2.
Verified by direct execution. Three difficulty buttons, two actual difficulties.

**C2 — The "next row" preview is a lie.** `executeTurnSequence` (`gameStore.js:101-135`)
re-rolls a random column for every incoming animal at spawn time. The `validNextAnimals`
array computed immediately above (`:80-89`) is **never used** — dead code. So the occupancy
bar the player plans against rarely matches what spawns. For a puzzle game this breaks the
core contract with the player.

**C3 — Undocumented 1-column spawn buffer starves row clears.** Both spawn paths require a
free column on each side of every placement. Measured over 2,000 batches at width 10, a
batch can occupy at most 8 of 10 columns. The rule is not in `spec.md` and materially
changes pacing.

**C4 — Game-over is checked in the wrong place.** `checkGameOver` runs only in
`moveSelectedAnimal`, never after `executeTurnSequence`'s grid advancement. Animals advance
past the top silently — verified reaching `y = 20` on a 20-row grid, where `getFilledRows`
stops counting them and `GameGrid` renders them at a negative offset, outside the grid.
The player gets a free extra turn, and a full grid with no legal move soft-locks.

**C5 — Rejected moves fail silently.** The drag preview clamps to grid bounds only
(`GameGrid.js:44`); it never checks collisions. `moveSelectedAnimal` then rejects the move
via `canMoveAnimal` and returns early — no turn, no animation, no feedback. The player sees
a legal-looking target and nothing happens.

**C6 — Turn counter is stale at spawn time.** `generateAnimalsForTurn(turn + 1, ...)` is
called from two places for the same upcoming turn using a captured `turn`, so the batch is
generated twice and buffalo's "every 10 turns" cadence is unreliable.

**C7 — Inconsistent clear timings.** `spec.md` specifies 1200 ms. The code uses 1000 ms
(`:67`), 500 ms (`:152`) and 1200 ms (`:234`), and the turn-sequence path flashes twice in
a row (500 ms, then `executeChainClear` re-flashes for 1000 ms).

---

## D. Rendering, layout and input

**D1 — Two different cell sizes.** `GameScreen.js:14` sizes cells on **width only**;
`GameGrid.js:27` sizes on `min(width, height)`. The container and the grid it holds
disagree whenever the grid is tall, so the board sits off-centre in its own frame.

**D2 — The board can overflow the screen.** Both formulas floor at `Math.max(24, ...)`.
At width 15 that is 360 px of grid inside a 343 px content area on a 6.1" iPhone; at
height 25 it is 600 px of board plus header, with no scroll container and no clipping
strategy. The advertised 15×25 configuration does not fit on the target device.

**D3 — A PanResponder per animal, per render.** `GameGrid.js:106` calls
`createPanResponder` inside the render map, allocating fresh responders every frame.
`dragStartXRef` is a **single shared ref** across all animals, so multi-touch corrupts the
drag origin.

**D4 — The drop animation does not exist.** `Animal.js:51` — `dropping: {}` is an empty
style object. The README advertises "scale + shadow." Separately, the effect at `:12-19`
only calls `setPrevY` on the non-drop branch, so after the first drop `prevY` is
permanently stale and the animation state triggers arbitrarily.

**D5 — All animals look the same.** Every animal renders as the same blue block
(`Animal.js:31`); only the emoji and width distinguish an elk from a fox. Size is the
central mechanic and it is the least legible thing on screen.

**D6 — `console.log` in the render path.** `GameGrid.js:22,70` and `GamePreview.js:18` log
on every render, plus a per-animal loop in a `GameScreen` effect and two in `gameLogic`.
These ship in release builds.

**D7 — Deprecated `SafeAreaView`.** Imported from `react-native`, which does not handle the
Dynamic Island or the home indicator correctly. `react-native-safe-area-context` is already
in the tree as a transitive dependency.

---

## E. Project hygiene / ship-blockers

- **No `assets/` directory**, but `app.json` references `./assets/favicon.png`. No app icon
  and no splash screen are configured — this fails App Store submission as-is.
- **No `babel.config.js` and no `metro.config.js`.** `react-native-reanimated` is installed
  and requires its Babel plugin.
- **Four unused dependencies**: `expo-sqlite`, `@react-native-async-storage/async-storage`,
  `react-native-reanimated`, `react-native-url-polyfill`. Nothing is persisted despite
  AsyncStorage being present — settings reset on every launch.
- **Dead code**: `AnimalCell.js` (never imported), `generateAnimal` (imported, never
  called), `BASE_CELL_SIZE` in three files, `styles.footer` / `styles.instructions`,
  and the `waitingForPlayer` / `initialized` state in `GameScreen`.
- **No tests, no linter, no CI.** Zero automated verification on a game whose rules engine
  is its entire value.
- **No score.** "Turn" is the only progress metric, which is a clock, not an achievement.
- **No accessibility**: no labels, no roles, emoji-only semantics, unverified contrast.

---

## F. What v1 got right — keep this

**Amended 2026-09-21.** This section was originally three lines about *code*, and that was the
wrong shape for it. The review catalogued v1 as a list of defects and only incidentally as a
list of **affordances** — things v1 did for the player that v2 would silently drop unless
someone named them. Two were missed that way and both reached the design late, as owner
requests rather than as inputs:

| Affordance | How it surfaced | Now specified in |
|---|---|---|
| **Session resume** — a mid-run game survives relaunch (`useLocalStorage.js`) | Found only when the stale-commit correction was written | `gameplay.md` §9 |
| **Origin ghost** — the dragged animal's starting position stays marked (`spec.md`, "Original Position Ghost") | Reported by the owner as costing them turns | `ui.md` §5.5 |

Both are small, both were shipped, and both would have been regressions. **When reviewing a
predecessor, list what it does for the player as deliberately as what it does wrong** — a
defect list is a description of the code, and the thing being replaced is the experience.

### The code and mechanics worth keeping

- The `{id, type, x, y, size}` animal model is the correct data structure. Keep it.
- `applyGravity` is genuinely correct: bottom-to-top ordering, no tunnelling. Verified.
- The core loop — rows rise, drag to pack, fill a row to clear it — is a real game, and
  the buffalo-shrinks-instead-of-clearing twist is a good idea that v1 never showcased.
- `spec.md` exists and is detailed. It drifted from the code, but the instinct was right.

### The affordances worth keeping

- **Session resume.** `useLocalStorage.js` persists the in-progress run; a relaunch resumes it.
  The 1 Hz `setInterval` that saves it is wrong, the feature is right.
- **The origin ghost.** A bright orange dashed outline marks where a dragged animal started,
  making a drag cancellable. With one move per turn and no undo, this is what lets a player
  explore a move before paying for it.
- **Score, high score and session history** (`StatsPanel.js`), including the **last-ten-runs
  list** — aggregates do not replace it.
- **Haptics** (`useSoundManager.js`), already wired to clear, high-score, spawn and game-over.

---

## G. Verdict

The rules engine is ~80% sound; the **state layer around it is what's broken**. Roughly
three quarters of the defects above trace to one decision: resolving turns inside React
`setState` updaters with ad-hoc `setTimeout`s instead of running a deterministic, pure
reducer and treating animation as a separate presentation concern.

v2 should keep the animal model, the gravity function and the core loop, and rebuild the
turn resolution as a pure, testable state machine.
