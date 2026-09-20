# Wildlife Shuffle v2 — Gameplay Design

Status: **for owner review.** Nothing is built until this is approved.
Input: `docs/v1-review.md`, plus direct verification against `src/` at commit `1f6f9c3`.

---

## 0. Layers

The owner can approve or defer each layer independently. Later layers depend on earlier
ones; earlier layers do not depend on later ones.

| Layer | Contents | Ships without the next layer? |
|---|---|---|
| **F — Foundation** | Board geometry, turn structure, spawn + honest preview, movement, clearing, buffalo, difficulty, scoring, game-over | Yes. This is a complete, playable, shippable game. |
| **A — Meta progression** | High scores, stats, daily streak, unlocks, persistence | Yes |
| **B — Polish** | Sound, haptics, juice | Yes |
| **C — Store readiness** | Icon, splash, onboarding, screenshots, privacy | Required to ship to the App Store; not required to play |

Everything in sections 1–10 is Layer F unless marked otherwise.

---

## 1. The game in one paragraph

Animals of different widths arrive on the bottom row of a 10×15 grid. Anything sitting
above an arrival is pushed up. You get **one action per turn**: slide one animal
horizontally, or pass. Animals fall to the lowest free row after every action. Fill all ten
columns of a single row and that row clears — unless a buffalo is standing in it, in which
case everything else in the row is swept away and the buffalo loses one segment instead. The
run ends when any animal reaches the top row. You are always losing; the game is how long
and how elegantly you delay it.

**Target session:** 3–5 minutes, 40–70 turns for a competent player on the default
difficulty. **A run feels good when** the player sets up a two-row clear, or grinds a
buffalo down to nothing, and the score jumps by a visible multiple.

---

## 2. What survives from v1, and one correction

### Survives unchanged
- The `{id, type, x, y, size}` animal model.
- `applyGravity`'s bottom-to-top algorithm (`src/data/gameLogic.js:119-155`). Verified correct.
- Rows rise, drag to pack, a full row clears.
- **Buffalo shrinks by 1 instead of clearing.** v1's best idea. v2 makes it visible (§6).

### One correction to the brief's premise

The brief lists "rows rise each turn" as settled. **In v1 that is not what happens.** I ran
v1's `advanceGrid` followed by `applyGravity` directly:

```
Stack at cols 0-1 (y=0, y=1). Spawn lands at cols 5-6.
→ after rise + spawn + gravity: stack is back at y=0 and y=1. It did not rise.

Same stack. Spawn lands at col 1 (under it).
→ after rise + spawn + gravity: stack is at y=1 and y=2. It rose.
```

`advanceGrid` adds 1 to every `y`, and `applyGravity` immediately pulls everything back down
except where a new arrival now blocks the floor. So the real v1 rule is:

> **New animals arrive on the bottom row. Whatever sits above them is pushed up. Everywhere
> else, the pile settles back to where it was.**

**Decision: keep this behaviour and describe it honestly.** It is a better rule than a
literal global rise — it means *where* the herd arrives is what raises your stack, which
makes the preview strategically meaningful rather than decorative, and it gives wide animals
a natural danger premium (an elephant rises if any one of its five columns is blocked). v2
drops the misleading `advanceGrid` framing and specifies the step as **Arrival** (§4, Phase
3). The implementation may still be `advanceGrid` + `applyGravity`; the *documentation* and
the *animation* must describe what actually happens.

---

## 3. Board

**One board size: 10 columns × 15 rows.** Fixed.

- Columns `x = 0..9` (left to right). Rows `y = 0..14`, **row 0 is the bottom**.
- Row 14 is the **kill line**: any animal occupying row 14 at the end of a turn ends the run.
  Usable stack height is therefore 14.
- Rows 11–13 are the **danger band**, tinted and pulsing (see `ui.md` §7).

### Decision: the board is not configurable, and v1's settings sliders are removed

v1 let the player pick 5–15 wide and 10–25 tall (`src/data/gameConfig.js:14-19`). Per
`docs/v1-review.md` D2, the advertised 15×25 does not fit a 6.1" iPhone at all. More
importantly, a variable board makes scores incomparable and difficulty unknowable — it was a
settings menu standing in for game design.

**One board. 10×15.** Rationale: a single geometry is the precondition for a high-score
table that means anything, and it is the only way the difficulty numbers in §5 can be tuned
rather than guessed. The layout engine is still written generically (`W × H`), so a future
"Tall" or "Wide" mode costs a config constant, not a rewrite.

Cell size is derived from the device and is a *presentation* value only — it never affects
rules. See `ui.md` §3 for the formula and the per-device table.

---

## 4. Turn structure

The turn is a **pure reducer**. No timers inside it, no React state, no randomness beyond a
seeded PRNG. Animation is a separate presentation layer that plays *after* each phase
commits. This is the direct fix for `docs/v1-review.md` A1–A4.

```
        ┌──────────────────────────────────────────────────┐
        │  PHASE 0 · READY                                 │
        │  Input enabled. Tray shows queue Q(t).           │
        └────────────────────┬─────────────────────────────┘
                             │  player: MOVE(id, targetX)  or  PASS
        ┌────────────────────▼─────────────────────────────┐
        │  PHASE 1 · ACTION                                │
        │  Apply the move. Input locks.                    │
        └────────────────────┬─────────────────────────────┘
        ┌────────────────────▼─────────────────────────────┐
        │  PHASE 2 · SETTLE                                │
        │  applyGravity → resolveClears() loop             │
        └────────────────────┬─────────────────────────────┘
        ┌────────────────────▼─────────────────────────────┐
        │  PHASE 3 · ARRIVAL                               │
        │  y += 1 for all → place Q(t) verbatim at y=0     │
        │  → applyGravity → resolveClears() loop           │
        └────────────────────┬─────────────────────────────┘
        ┌────────────────────▼─────────────────────────────┐
        │  PHASE 4 · JUDGE                                 │
        │  any animal at y ≥ 14 ?  → GAME_OVER             │
        └────────────────────┬─────────────────────────────┘
        ┌────────────────────▼─────────────────────────────┐
        │  PHASE 5 · ADVANCE                               │
        │  turn++ · settle streak · generate Q(t+1)        │
        └────────────────────┬─────────────────────────────┘
                             └──► back to PHASE 0
```

### Decisions embedded here

**The player acts before the arrival, not after.** You move, you see the consequence, *then*
the previewed herd walks in. This is the order that makes the preview a planning tool: at
Phase 0 you can see both the board and exactly what is coming, and your one move is your
answer to it.

**Game-over is checked once, in Phase 4, after everything has settled.** v1 checked only
inside `moveSelectedAnimal` and never after the advance (`docs/v1-review.md` C4), so animals
walked past the top silently. One check, one place.

**`resolveClears()` is a loop, not a recursive call into `setState`.** Each iteration is a
"chain step". The loop is capped at 8 steps as a safety rail (a board of 15 rows cannot
legitimately produce more).

```
resolveClears(board):
  step = 0
  events = []
  loop:
    filled = rows where all 10 columns are occupied
    if filled is empty: break
    step += 1
    if step > 8: break                    // safety rail; log, do not crash
    events.push(scoreStep(filled, step))  // see §7
    for each row r in filled:
      remove every non-buffalo animal whose y == r
      for each buffalo with y == r:  size -= 1  (trailing edge)
                                     if size == 0: remove, mark retired
    board = applyGravity(board)
  return { board, events, steps: step }
```

**Buffalo shrinks from its trailing (right) edge:** `x` is unchanged, `size` decreases. This
keeps the buffalo visually anchored so the player can see exactly which segment was taken.

---

## 5. Spawning, the preview contract, and difficulty

### 5.1 The contract

> **What the tray shows is exactly what arrives, in exactly those columns.**

This is the single most important fix in v2. v1 computed a preview and then threw it away:
`executeTurnSequence` re-rolled a random column for every incoming animal at spawn time
(`src/data/gameStore.js:101-135`), and `validNextAnimals` computed immediately above at
`:80-89` was dead code (`docs/v1-review.md` C2).

**v2: the batch is generated once, at Phase 5, frozen into `queue`, rendered in the tray,
and applied verbatim at Phase 3.** There is no re-roll, no collision fallback, no filtering.

There cannot be a collision to defend against: Phase 3 increments every `y` *before* placing
the queue, so row 0 is provably empty at placement time. v1's re-roll code was guarding
against a situation that cannot occur, and that guard is what broke the contract.

### 5.2 The spawn algorithm

Deterministic given the run seed. Runs use a seeded PRNG (mulberry32); the seed is recorded
in the run record so any run can be reproduced from a bug report, and so a Daily Challenge
is later a config change rather than a redesign.

```
generateBatch(turn, difficulty, rng):
  1. target = rng.int(band.low, band.high)          // cells to occupy this turn
     clamp target to [1, 9]
  2. if isBuffaloTurn(turn) and no buffalo on board:
       batch = [Buffalo(size 4)]; target = max(target, 4); filled = 4
     else
       batch = []; filled = 0
  3. while filled < target:
       candidates = species whose size ≤ (target - filled)
                    and ≤ the largest remaining free run in row 0
       if candidates is empty: break
       s = weighted draw from candidates (see 5.4)
       batch.push(s); filled += s.size
  4. shuffle(batch)
  5. for each animal in batch:
       valid = every x where all of the animal's cells are free in row 0
       animal.x = rng.pick(valid)
       mark those cells occupied
  6. return batch          // total occupied columns ≤ 9, always
```

**Hard invariant: a batch may occupy at most 9 of 10 columns.** A batch that filled all ten
would clear row 0 on arrival with no player involvement, which makes the turn meaningless.

### 5.3 Decision: the 1-column spawn buffer is removed

v1's generator required a free column on each side of every placement
(`src/data/gameLogic.js:66-80`). I measured it over 5,000 batches at width 10: **maximum 8
columns occupied, mean 6.0.** It is undocumented, it is not in `spec.md`, and it silently
caps arrival pressure regardless of the difficulty setting.

**Removed.** It is replaced by the explicit `target` band, which is the same lever made
visible and tunable. Rationale: the buffer was an accidental difficulty setting. Arrivals may
now be adjacent — that is fine, because an animal boxed in by neighbours can still be freed
by the stack shifting after a clear, and because the ≤9 invariant preserves the one thing the
buffer actually guaranteed (that the herd cannot clear a row for you).

### 5.4 The animal set

| Species | Size | Draw weight — Meadow | Savanna | Tundra |
|---|---:|---:|---:|---:|
| Rat 🐀 | 1 | 35 | 25 | 15 |
| Fox 🦊 | 2 | 30 | 28 | 25 |
| Elk 🦌 | 3 | 25 | 27 | 30 |
| Elephant 🐘 | 5 | 10 | 20 | 30 |
| **Buffalo 🐃** | **4** | scheduled only — never drawn | | |

Mean drawn size: Meadow **2.20**, Savanna **2.62**, Tundra **3.05**.

**Buffalo is scheduled, never random.** It arrives on turn `n × buffaloEvery` (never turn 0),
and **only one buffalo may be on the board at a time**. If the schedule fires while a buffalo
is still alive, that cycle is skipped and the next scheduled turn is used. Rationale: two
buffalo simultaneously is an unrecoverable board, and the buffalo is meant to be an event,
not attrition.

### 5.5 Difficulty — what it actually varies

v1 had three buttons and two difficulties: `animalsPerTurn` was `1.5` and `2` for Normal and
Hard, and `generateAnimalsForTurn` applied `Math.ceil` to both (`docs/v1-review.md` C1).

v2's difficulty varies **three** things, and the game also **ramps within a run**, which v1
did not do at all.

| | **Meadow** (easy) | **Savanna** (default) | **Tundra** (hard) |
|---|---|---|---|
| Starting cell band | 2–4 | 3–5 | 4–6 |
| Band ceiling | 4–6 | 6–8 | 7–9 |
| Ramp | +1 to both ends every **12 turns**, until the ceiling | | |
| Species weights | small-heavy | balanced | large-heavy |
| Mean arrival | ~3.0 → 4.5 cells/turn | ~4.0 → 7.0 | ~5.0 → 8.0 |
| Buffalo every | 12 turns | 10 turns | 8 turns |

Ramp schedule, explicitly:

```
Meadow    t1: 2–4   t13: 3–5   t25: 4–6 (ceiling)
Savanna   t1: 3–5   t13: 4–6   t25: 5–7   t37: 6–8 (ceiling)
Tundra    t1: 4–6   t13: 5–7   t25: 6–8   t37: 7–9 (ceiling)
```

**Why a ramp at all.** Without it the game has no arc: the difficulty of turn 5 equals the
difficulty of turn 90, and the only thing that changes is how full your board is. The ramp
guarantees every run ends, and it makes the late game feel like pressure rather than
bookkeeping.

**Why the ceilings differ.** If all three converged on the same endgame, the difficulty
choice would only affect the first two minutes. Meadow tops out at a pace a careful player
can sustain almost indefinitely; Tundra tops out at a pace nobody can.

**Pacing arithmetic.** A row clear removes 10 cells. On Savanna at 4 cells/turn, a player who
clears a row every 5 turns nets +2 cells/turn. Top-out needs roughly 90 cells of ragged
skyline, so ≈45 turns at ~4 s/turn ≈ **3 minutes**. Meadow ≈ 6 minutes, Tundra ≈ 2 minutes.
These are the numbers to playtest against; if real runs come in far off, move the bands
first, the weights second, and the ramp interval last.

---

## 6. Movement, and the buffalo

### 6.1 Movement is a slide, not a teleport

v1's `canMoveAnimal` (`src/data/gameLogic.js:236-259`) checks only the *destination* for
overlap. I verified: a rat at `x=0` with another rat at `x=2` can legally move to `x=4` — it
passes straight through. That is not what a drag looks like.

**v2: the swept path must be clear.** Moving from `x0` to `x1` is legal only if every
intermediate position is also unobstructed in that row. Concretely: the animal may not cross
any other animal in its own row. Rationale: the gesture is a drag, so the rule must be the
one the gesture implies; a piece that tunnels through its neighbours makes the board
unreadable.

### 6.2 The move rules

- **One action per turn.** Move exactly one animal, or pass. Any animal on the board may be
  chosen, at any height.
- **Horizontal only, within its own row.** Vertical position is gravity's business.
- **Bounds:** `0 ≤ newX` and `newX + size ≤ 10`.
- **Path:** swept-clear as above.
- **Zero-distance drags do not consume the turn** and do not advance the game.
- After the move, gravity applies — so sliding a piece over a hole is how you drop it. This
  is the core skill expression and it should be taught in beat 2 of onboarding.

### 6.3 Decision: Pass is always available

v1 had no pass. If the board reached a state with no legal move, the game soft-locked
(`docs/v1-review.md` C4). v2 adds an explicit **Pass** button in the action bar, always
enabled.

This does three things at once: it removes the soft-lock class of bug entirely, it makes "no
legal move" an ordinary game state rather than a failure mode, and it is a real strategic
choice — sometimes the correct play is to take the arrival without disturbing a packing you
have already set up. Passing breaks the score streak (§7), so it is never free.

### 6.4 Buffalo, finally made visible

The mechanic v1 had and never showed. When a row containing a buffalo completes:

1. Every non-buffalo animal in that row is removed, as normal.
2. The buffalo **loses one segment from its trailing edge**: `size -= 1`, `x` unchanged.
3. The row does **not** clear. The buffalo is still standing there, one cell narrower.
4. At `size == 0` the buffalo is **retired** — it leaves the board and scores +500.

A buffalo therefore costs you **four row completions** to remove. It is the only thing in the
game that punishes a completed row, and it is the only thing that rewards persistence.

**Making it legible** (full spec in `ui.md` §5.3):
- The buffalo is the only animal rendered in ox-blood with a gold rim — unmistakable at a glance.
- Its body is drawn as `size` discrete segments with visible seams, so its remaining health is
  countable without reading a number.
- On shrink: the trailing segment cracks and falls away (120 ms), the body springs to its new
  width, and a `BUFFALO −1` label rises from it. Distinct sound, medium haptic.
- On retirement: a full-board celebration — gold burst, `+500`, heavy haptic.
- A persistent **buffalo chip** sits in the HUD whenever one is on the board, showing its
  remaining segments, so the player is never surprised by which row will refuse to clear.

---

## 7. Scoring

v1 had no score at all. "Turn" was the only progress metric, and a turn counter is a clock,
not an achievement (`docs/v1-review.md` E).

### 7.1 What score is for

Score must reward **packing skill**, not survival time. A player who survives 90 turns by
passing should score far less than one who dies at turn 40 having set up three double-clears.
Every term below is therefore paid on *clears*, never on turns elapsed.

### 7.2 The formula

Score is awarded per **chain step** inside `resolveClears()`.

```
stepScore = ( rowValue(n) + 50 × shrinks + 500 × retired )
            × chainMult(step)
            × streakMult
        (floored to an integer)
```

**`rowValue(n)` — n rows completing in the same step:**

| n | 1 | 2 | 3 | 4 | 5+ |
|---|---:|---:|---:|---:|---:|
| value | 100 | 300 | 600 | 1000 | 1000 + 400×(n−4) |

Super-linear on purpose: a double clear is worth more than two singles, so setting one up is
worth the risk.

**`chainMult(step)` — cascade depth within one resolution:**

| step | 1 | 2 | 3 | 4 | 5+ |
|---|---:|---:|---:|---:|---:|
| ×  | 1 | 2 | 3 | 4 | 5 (cap) |

**`streakMult` — consecutive *clearing turns*:**

```
streakMult = min(3.0, 1.0 + 0.2 × (consecutiveClearingTurns − 1))
```

A *clearing turn* is any turn in which at least one clear step occurred, in Phase 2 or Phase
3. A turn with no clear resets the streak to 0. **Passing always resets it.** Displayed as a
pill in the HUD whenever it exceeds ×1.0.

**Buffalo terms:** each shrink is +50 and counts toward the chain depth, but a buffalo row
does *not* count toward `n` in `rowValue` — it did not clear. Retirement is +500.

**Perfect Clear:** if the board is completely empty after a resolution, +1000 and the streak
is set straight to its ×3.0 cap. v1 detected an empty grid and quietly ran an extra turn
(`src/data/gameStore.js:262-269`); v2 treats it as the best thing that can happen to you and
says so.

### 7.3 Worked example

Turn 22 on Savanna. The player is on a 4-turn clearing streak (`streakMult = 1.6`). Their
slide completes two rows at once; the collapse drops a stack that completes a third row
containing the buffalo.

```
step 1: rowValue(2) = 300 ; chainMult 1 ; streak 1.6   →  300 × 1 × 1.6  =  480
step 2: rowValue(0) = 0, one buffalo shrink = 50 ; chainMult 2 ; streak 1.6
                                                        →   50 × 2 × 1.6  =  160
                                                                    total =  640
```

The HUD ticks 640 upward over 400 ms; `+480` floats off the first pair of rows, `+160` and
`BUFFALO −1` off the third.

### 7.4 What is deliberately not scored

- **No points for surviving turns.** Turn count is shown as a secondary stat and recorded in
  the run record, but it is not score. Rewarding the clock rewards passing.
- **No combo for "moves without a mistake"** — there are no mistakes to make, only
  suboptimal packing.
- **No negative score.** Nothing subtracts. The punishment for a bad turn is a worse board.

---

## 8. Run lifecycle and game over

**Run start.** Board is seeded with **two arrival batches applied in sequence** (generate,
place at row 0, gravity; repeat) so the player opens on a board with something to work with
rather than an empty grid. `turn = 1`, `score = 0`, streak 0, `Q(1)` shown in the tray.

**Game over — the only condition:** at Phase 4, any animal occupies `y ≥ 14`.

There is no other loss state. Deadlock is not a loss (Pass exists, §6.3). A spawn can never
fail (row 0 is empty by construction, §5.1).

**The game-over sequence** (timings in `ui.md` §8):
1. Board dims to 40% over 240 ms and the topping-out animal flashes red.
2. Overlay slides up over 280 ms, starting at t=120 ms so the dim and the slide overlap — the
   player reaches their score 400 ms after the run ends. It shows: **final score** (large), best score for this
   difficulty with a `NEW BEST` badge if beaten, and four run stats — turns survived, rows
   cleared, longest chain, buffalo retired.
3. Buttons: **Play Again** (primary, same difficulty), **Change Difficulty**, **Home**.
4. The run record is written to storage here (Layer A) — once, not per turn.

**Pause** (any time during Phase 0): sheet with Resume, Restart, Sound/Haptics toggles, How
to Play, Home. Pausing does not affect score. Pause is unavailable during Phases 1–4; the
button is disabled rather than hidden, so the layout never reflows.

---

## 9. Layer A — Meta progression

Reasons to reopen the app. AsyncStorage is already a dependency and currently entirely unused
(`docs/v1-review.md` E).

**Persisted records**
- Best score, best chain, longest run (turns), most rows in one run — **per difficulty**.
- Lifetime: games played, total turns, total rows cleared, buffalo retired, perfect clears.
- Daily streak: consecutive calendar days (device local time) with at least one *completed*
  run. Shown on Home as `🔥 4 day streak`. Breaks after a missed day; a "streak freeze" is
  explicitly out of scope.

**Unlocks.** Four, cosmetic only, no gameplay effect. Kept deliberately small — four things
that certainly ship beats twelve that half-ship.

| Unlock | Requirement |
|---|---|
| **Night Savanna** board theme | Retire 10 buffalo |
| **Tundra** palette | Score 25,000 in a single run |
| **Rat King** animal set | Clear 500 rows lifetime |
| **Golden Herd** animal set | Clear 4 rows in a single step |

Progress toward every unlock is visible on the Collection screen with an explicit counter
(`7 / 10 buffalo retired`) — a locked item that does not tell you how close you are is not a
goal, it is a tease.

**Storage.** One AsyncStorage key, `ws.save.v1`, holding one JSON object with a
`schemaVersion` field. Written on game over and on settings change only — **never per turn
and never in the render path.** Reads happen once at app launch. A corrupt or unreadable blob
falls back to defaults silently; it must never block launch.

---

## 10. Layer B — Polish

Full motion, sound and haptic specs live in `ui.md` §8–§9. The gameplay-relevant decisions:

- **Cascade steps pipeline rather than queue.** v1 used 1000/500/1200 ms inconsistently and
  double-flashed the same rows (`docs/v1-review.md` C7); a 5-step chain at those timings locks
  input for six seconds. In v2 a step's flash overlays its collapse, and step *n+1* begins
  while step *n* is still falling. Full spec and arithmetic in `ui.md` §8.2.
- **Maximum input lock per turn is 1500 ms, guaranteed by construction**, against a typical
  clearing turn of 880 ms and 570 ms for a turn with no clear. A tap during the lock is
  buffered and applied at the next Phase 0, not dropped.
- **All animation runs on the UI thread as Reanimated worklets**, and the drag is a
  gesture-handler pan writing to a shared value. Nothing is driven by `setState` or
  `setTimeout`. This is a hard contract, not a preference — `ui.md` §8.3.
- Haptics require adding `expo-haptics`; sound requires `expo-audio` (SDK 56's replacement
  for `expo-av`). Neither is currently a dependency.

---

## 11. Layer C — App Store readiness

`assets/` does not exist, and `app.json` references `./assets/favicon.png`, which does not
exist (`docs/v1-review.md` E). Asset specs are in `ui.md` §11. Gameplay-side requirements:

**Onboarding — four interactive beats, on the real board, skippable, replayable from Pause.**
Not a wall of text. Each beat gates on the player performing the action.

1. *"Slide the fox."* — a two-cell gap is pre-built; the player drags the fox into it.
2. *"Fill all ten columns."* — one cell missing; the player completes it and watches it clear.
3. *"The tray is a promise."* — the tray highlights; the arrival lands exactly where shown.
   This beat exists specifically because it is the contract v1 broke.
4. *"Buffalo doesn't clear — it shrinks."* — a buffalo is placed, a row is completed on it,
   the player sees the segment break off and the `4 → 3` chip update.

**Privacy:** no data collected, no network calls, no analytics SDK, no tracking. App Privacy
declaration is "Data Not Collected". Age rating 4+. This is a deliberate choice, not an
oversight — see `open-questions.md` Q5 for the leaderboard implication.

---

## 12. Decision log

| # | Decision | Why |
|---|---|---|
| D1 | Keep v1's real "arrival pushes up" rule; drop the "global rise" framing | It is the better rule and it is what the code already does. Verified by execution. |
| D2 | One fixed board, 10×15 | Comparable scores and tunable difficulty. v1's 15×25 does not fit the target device. |
| D3 | Preview is generated once and applied verbatim | The core broken contract of v1 (C2). |
| D4 | Remove the 1-column spawn buffer | Measured max 8/10, undocumented accidental difficulty setting. Replaced by an explicit band. |
| D5 | Batch may never occupy all 10 columns | A self-clearing arrival makes the turn meaningless. |
| D6 | Movement is swept, not destination-only | v1's rule let animals tunnel through neighbours. Verified. |
| D7 | Add Pass, always enabled | Kills the soft-lock class of bug and adds a real choice. |
| D8 | Difficulty varies band + weights + buffalo cadence, and ramps in-run | v1's Normal and Hard were literally identical (C1). |
| D9 | Score rewards clears only, never elapsed turns | Rewarding the clock rewards passing. |
| D10 | Buffalo is scheduled, capped at one on board, retirement worth +500 | Makes it an event and gives the player a reason to want it. |
| D11 | One game-over check, in Phase 4 | v1 checked in the wrong place and let animals walk off the top (C4). |
| D12 | Cascade steps pipeline; input lock capped at 1500 ms | v1's 1200 ms-per-step would lock input for six seconds on a long chain (C7). Revised down from the approved draft's 3.2 s — `ui.md` §8.2. |
| D14 | All animation is a UI-thread Reanimated worklet; the drag is a gesture-handler pan | v1 drove animation through `setState` on `setTimeout`, which cannot hold 60 fps and is why its drag chases the thumb — `ui.md` §8.3. |
| D13 | Seeded PRNG per run, seed recorded | Reproducible bug reports now; Daily Challenge becomes a config change later. |
