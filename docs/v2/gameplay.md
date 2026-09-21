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

**One board size: 9 columns × 15 rows.** Fixed.

*(Was 10 × 15. Narrowed on owner request, landing together with the elephant/buffalo size
revert and the species-mix fix — see §5.6, which re-derives all three at once because each
one alone would have forced the bands to be re-derived anyway.)*

- Columns `x = 0..8` (left to right). Rows `y = 0..14`, **row 0 is the bottom**.
- Row 14 is the **kill line**: any animal occupying row 14 at the end of a turn ends the run.
  Usable stack height is therefore 14.
- Rows 11–13 are the **danger band**, tinted and pulsing (see `ui.md` §7).

**Everything in this document derives width from one constant.** `BOARD.width` is the single
source; no rule, band, invariant or layout figure may hard-code 9. This is the AC-126 lesson
applied to the board itself, and it is what made this change a constant edit rather than a
rewrite.

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
"chain step". The loop runs until no row is complete — it is **not** capped at a step count,
because every step that resolves must also score (§7.2). Termination is guaranteed by the mass
argument below, and `assert step <= 32` is a crash guard, not a cutoff.

```
resolveClears(board):
  step = 0
  events = []
  loop:
    filled = rows where all 10 columns are occupied
    if filled is empty: break
    step += 1
    assert step <= 32                     // crash guard, NOT a scoring cutoff — see below
    events.push(scoreStep(filled, step))  // see §7; every step that resolves, scores
    for each row r in filled:
      remove every non-buffalo animal whose y == r
      for each buffalo with y == r:  size -= 1  (trailing edge)
                                     if size == 0: remove, mark retired
    board = applyGravity(board)
  return { board, events, steps: step }
```

**The loop terminates without needing a counter.** Every cell of a completed row belongs to an
animal sitting in that row, so clearing it removes `(10 − b)` cells outright and takes one
more off the buffalo, where `b` is the buffalo's size if one is in the row and 0 otherwise:

```
mass removed per step = (10 − b) + 1 = 11 − b        →  minimum 7, when b = 4
live board holds at most 14 rows (row 14 is the kill line)   →  140 cells
an arrival adds at most 9                                    →  149 cells per turn
```

The naive division gives `149 / 7 = 21` steps, but **the true bound is tighter, and the reason
is easy to miss**: only one buffalo may be on the board (§5.4) and it has only four segments,
so **at most four steps in an entire run can ever be cheapened**. Every other step removes a
full 10. That gives `4 × 7 + 121/10` → **15 steps per turn, worst case**. Mass never increases
during a resolution, so the loop is bounded by construction and the counter proves nothing the
mass argument does not already prove.

**Steps are not events.** A *step* is one iteration of this loop. An *event* is what the
presentation layer receives, and a single step may emit more than one — a clear plus a buffalo
shrink plus a retirement. Worst case is therefore ~15 steps and **~19 events** per turn. Two
independent derivations of this bound landed on 15 and 25 during Slice 1 review; they differ
only in whether shrinks are counted separately and whether the one-buffalo limit is applied,
and **neither figure is normative**. The only normative numbers are `assert step <= 32` (§4)
and the 6-animated-unit ceiling (`ui.md` §8.2). Anything that consumes this stream must
**assume no small number** — see AC-825b.

`assert step <= 32` is a **crash guard against a bug**, not a gameplay parameter. Thirty-two
is more than twice the mass bound, so tripping it means the engine is broken — gravity is not
settling, or a clear is not removing.

**The engine cannot report it directly.** §4's own purity rule forbids `console` in engine
files, so on trip the engine emits a **`CHAIN_GUARD` event**, increments
`stats.chainGuardTrips`, and stops the loop. Diagnostics leave the engine the way scores do —
as data on the event stream — and the presentation layer throws on it in development and
records it in release (AC-216, AC-1309). A run that trips the guard **does not write a high
score** (AC-504e): the engine was in a state the rules do not describe, so its score is not
trustworthy enough to keep. What the guard must never do is silently alter scoring or board
state, which is exactly what the superseded 8-step rail did.

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
  W    = BOARD.width                       // 9
  CAP  = W - 1                             // a batch may never fill the row
  target = clamp(rng.int(band.low, band.high), 1, CAP)

  // 1. HOW MANY animals, from the cell target and the difficulty's mean drawn size.
  //    Stochastic rounding, so the expected cell count equals the target exactly.
  raw = target / meanDrawnSize(difficulty)
  k   = floor(raw) + (rng.float() < raw - floor(raw) ? 1 : 0)
  k   = max(1, k)

  // 2. WHICH animals: k draws from the FULL weighted pool. Nothing is excluded for
  //    fitting reasons, which is what makes the realised mix match the table.
  batch = []; filled = 0
  if isBuffaloTurn(turn) and no buffalo is on the board:
      batch.push(Buffalo, size 5); filled = 5          // scheduled, outside the k draws
  for i in 1..k:
      pool = species whose size <= CAP - filled        // the ONLY exclusion, and it is a
      if pool is empty: break                          // hard board limit, not a fit heuristic
      s = weighted draw from pool (§5.4)
      batch.push(s); filled += s.size

  // 3. WHERE: pack contiguously from x=0, then scatter the (W - filled) free columns
  //    at random among the batch's k+1 gap slots. Placement can never fail.
  return distributeGaps(shuffle(batch), W - filled)
```

**Count first, then species — the inversion is the fix.** The approved algorithm chose species
against a *shrinking* candidate pool: a species stayed eligible only while enough room
remained for it, so every draw after the first was biased small and the realised mix diverged
badly from §5.4's table. Measured over 3,000 turns per difficulty on the old board, Savanna
drew 44.5% rats against a weight of 25, and 7.1% elephants against 20 — a realised mean size
of 1.97 against a specified 2.62. Every difficulty ran about 0.7 of a cell lighter than
written, which is why the owner said the game felt easy. They were reporting a defect.

**My first diagnosis was wrong and the measurement corrected it.** I assumed the bias came
from *fragmentation* — large animals excluded because placement had chopped the row into short
free runs — which is what the interleaving introduced. So I tested a variant that removes
fragmentation entirely by choosing the whole composition before placing any of it. It moved
Savanna's mean from 1.79 to 1.81. Essentially nothing.

The real cause is **capacity exclusion**: with a target of 4 or 5 cells, the remaining capacity
after one or two draws is smaller than an elephant, so the largest species is shut out of the
*last* draw of nearly every batch — and batches are only two or three animals long, so most
draws are last-ish. No amount of smarter placement touches that, because it is not a placement
problem.

Fixing it requires breaking the dependency in the other direction: **stop deriving the animal
count from the cell target one draw at a time, and derive it up front.** Then every species
draw sees the full pool. Measured over 60,000 batches per band:

| Savanna | intent | approved algorithm | this algorithm |
|---|---:|---:|---:|
| rat | 25.0% | 48.9% | **25.8%** |
| fox | 28.0% | 27.7% | **28.4%** |
| elk | 27.0% | 16.8% | **26.2%** |
| elephant | 20.0% | 6.6% | **19.7%** |
| mean drawn size | 2.42 | 1.81 | **2.40** |
| cells per turn | 4.0 | 4.01 | **3.94** |

**The band becomes a control on the mean, not a per-batch guarantee.** This is the one property
the change costs. `k` is a whole number of animals, so a batch's cell total scatters around
the rolled target instead of hitting it exactly; stochastic rounding keeps the *expectation*
on target (within 0.1 of the band mean at every band except the two highest, where the cap
bites). AC-306, AC-307 and AC-307b asserted exact equality and are amended accordingly — and
the realised species distribution is now asserted by **AC-308b**, which nothing did before,
and which is why this defect survived every previous round of verification.

**Three invariants, all guaranteed by construction rather than checked afterwards:**

1. **At most `W − 1` columns**, i.e. 8 of 9. A batch that filled the row would clear it on
   arrival with no player involvement, making the turn meaningless. Expressed against the
   width constant, never as a literal.
2. **Placement can never fail.** Step 3 packs contiguously and then scatters the free columns,
   so there is nothing to retry and no fallback path. A fallback in this function signals a
   broken invariant, not a safety net.
3. **The realised species mix matches §5.4's table**, because the only exclusion left is the
   hard board limit `size ≤ CAP − filled`, which bites rarely. AC-308b measures it.

### 5.3 Decision: the 1-column spawn buffer is removed

v1's generator required a free column on each side of every placement
(`src/data/gameLogic.js:66-80`). I measured it over 5,000 batches at width 10: **maximum 8
columns occupied, mean 6.0.** It is undocumented, it is not in `spec.md`, and it silently
caps arrival pressure regardless of the difficulty setting.

**Removed.** It is replaced by the explicit `target` band, which is the same lever made
visible and tunable. Rationale: the buffer was an accidental difficulty setting. Arrivals may
now be adjacent — that is fine, because an animal boxed in by neighbours can still be freed
by the stack shifting after a clear, and because the ≤9 invariant preserves the one thing the
buffer actually guaranteed (that the herd cannot clear a row for you — now the `W − 1` cap).

### 5.4 The animal set

| Species | Size | Draw weight — Meadow | Savanna | Tundra |
|---|---:|---:|---:|---:|
| Rat 🐀 | 1 | 35 | 25 | 15 |
| Fox 🦊 | 2 | 30 | 28 | 25 |
| Elk 🦌 | 3 | 25 | 27 | 30 |
| Elephant 🐘 | **4** | 10 | 20 | 30 |
| **Buffalo 🐃** | **5** | scheduled only — never drawn | | |

**Elephant is 4 and buffalo is 5** — reverted to the owner's 11 July values (`2ff0eab`). v2
inherited 5/4 from two stale sources at once: a review written against a pre-revert commit,
and a `spec.md` that still documents the superseded 8 July swap.

Intended mean drawn size: Meadow **2.10**, Savanna **2.42**, Tundra **2.75**. §5.2's generator
is required to realise these, not merely to aim at them — see AC-308b.

**This tidies the lightness ramp rather than disturbing it.** The four drawable species now
run 1, 2, 3, 4 contiguously, so §4.3's size→lightness mapping covers an unbroken sequence with
buffalo alone off it at 5. Under the old sizes elephant (5) was larger than buffalo (4) yet
lighter, which quietly worked against the "lightness is weight" reading.

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
| Band ceiling | **4–6** | **5–7** | **6–8** |
| Ramp | +1 to both ends every **12 turns**, until the ceiling | | |
| Species weights | small-heavy | balanced | large-heavy |
| Mean arrival | 3.0 → 5.0 cells/turn | 4.0 → 6.0 | 5.0 → 7.0 |
| **as a fraction of the 9-wide row** | **33% → 56%** | **44% → 67%** | **56% → 78%** |
| Buffalo every | 12 turns | 10 turns | 8 turns |

Ramp schedule, explicitly:

```
Meadow    t1: 2–4   t13: 3–5   t25: 4–6 (ceiling)
Savanna   t1: 3–5   t13: 4–6   t25: 5–7 (ceiling)
Tundra    t1: 4–6   t13: 5–7   t25: 6–8 (ceiling)
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
skyline, so ≈45 turns at ~4 s/turn ≈ **3 minutes**.

### 5.6 Deriving the bands for a 9-wide row

Three changes landed together — the board narrowed to 9, elephant and buffalo swapped sizes,
and the species-mix defect was fixed — and **the bands were re-derived from scratch rather
than adjusted three times**, because each change alone would have forced a re-derivation
anyway and the intermediate states are not worth measuring.

**The quantity that sets difficulty is the fraction of a row arriving per turn**, not the raw
cell count, so that is what was held constant from the approved 10-wide design. A 0.9 rescale
would not have done this: `round(0.4 × 9) = 4` happens to agree here, but the ceilings do not,
and the relationship between band and row width is the whole difficulty feel.

| | 10-wide design | → 9-wide bands | realised fraction |
|---|---|---|---|
| Meadow | 30% → 60% | 2–4 → 4–6 | 33% → 56% |
| Savanna | 40% → 70% | 3–5 → 5–7 | 44% → 67% |
| Tundra | 50% → 80% | 4–6 → 6–8 | 56% → 78% |

**Tundra's ceiling drops from 7–9 to 6–8 for a hard reason, not a soft one.** The cap is
`W − 1` = 8, so a band reaching 9 would demand batches the invariant forbids; and at 8 of 9 a
single arrival already leaves one free column, which is as close to a self-completing row as
the design permits. 6–8 is the highest band the invariant admits.

**Net difficulty across the three changes, and why it must be measured rather than argued:**

| change | direction | why |
|---|---|---|
| Species-mix fix (§5.2) | **harder**, substantially | The same cells arrive as fewer, larger pieces — Savanna's mean drawn size goes 1.81 → 2.40. Harder to pack. |
| Elephant 5 → 4 | easier | The largest drawable animal is smaller and more flexible. |
| Row 10 → 9 | **both** | A row needs one less column to complete, which is easier; but buffalo is now 55% of a row and elephant 44%, which is much less room to manoeuvre. |

These do not cancel in any way I can compute, which is exactly why the pacing numbers are a
measurement request rather than a prediction. The owner's report that the game felt easy is
addressed principally by the first row of that table, which is a defect fix and not a tuning
change.

### 5.7 What the developer should measure

Run the existing bot harness (AC-318) **after all three changes are in, not between them**:

1. **Realised species mix per difficulty**, 3,000+ turns each, against §5.4's table. This is
   the regression that matters most — it is the one that went unnoticed. Tolerance ±2
   percentage points per species and ±0.10 on mean drawn size. **(AC-308b)**
2. **Mean cells per turn per band**, against the band mean. Tolerance ±0.15 for every band
   except the two highest per difficulty, where the `W − 1` cap legitimately pulls it low;
   record those rather than tuning them away. **(AC-306)**
3. **Turns per run**, 30 seeds × 3 difficulties, against the AC-318 ranges. **Expect the
   approved ranges to move** — they were measured on a 10-wide board with the biased mix.
   Report the numbers before changing any band.
4. **Maximum batch occupancy**, to confirm 8 of 9 is reachable at Tundra's ceiling and 9 never
   is. **(AC-309)**
5. **Score distribution per difficulty** — median and 90th percentile of final score. Nothing
   needs it yet, but the ability thresholds in §13 must be priced against measured scores
   rather than guessed, and this is the run that produces them.

**Tune in this order if the ranges are missed:** bands first, ramp interval second, species
weights last. The weights now do exactly what they say, so changing them changes the game's
character rather than just its pace.

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
have already set up. Passing is not free — it costs you your move, the scarcest resource in
the game — but it does **not** by itself break the score streak. A passing turn whose arrival
completes a row is a clearing turn like any other (§7.2).

### 6.4 Buffalo, finally made visible

The mechanic v1 had and never showed. When a row containing a buffalo completes:

1. Every non-buffalo animal in that row is removed, as normal.
2. The buffalo **loses one segment from its trailing edge**: `size -= 1`, `x` unchanged.
3. The row does **not** clear. The buffalo is still standing there, one cell narrower.
4. At `size == 0` the buffalo is **retired** — it leaves the board and scores +650.

A buffalo starts at size 5 and therefore costs you **five row completions** to remove, during
which it occupies **55% of a 9-wide row**. It is the only thing in the
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
stepScore = ( rowValue(n) + 50 × shrinks + 500 × retired )   // a retiring completion is
                                                            // BOTH: 50 + 500 = 550
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

**Every step that resolves, scores. There is no depth past which clearing stops paying.**

The superseded 8-step rail confiscated the score for steps 9 and beyond while still clearing
their rows. That is now removed, against the developer's, the tester's and the coordinator's
shared recommendation, because the reason all three gave — *"paying past the rail means
extending `chainMult` past the very thing the rail exists to bound"* — does not survive
contact with the table directly above. **`chainMult` is already flat at ×5 from step 5.**
Paying step 11 at `chainMult(11)` pays it at ×5, which is precisely what step 5 pays. There
was nothing left to bound: the multiplier caps itself, termination comes from the mass
argument in §4, animation length is bounded separately by the 5-step animation cap and the
1500 ms budget (`ui.md` §8.2), and total score is bounded by board mass.

So the rail bounded nothing and cost this, measured on the committed 10-step fixture at
streak 5:

```
paid       7,350
earned    17,100        — 9,750 points silently confiscated, most of it one buffalo retirement
```

Over half the score of the best play in the game, and the missing half is mostly the single
loudest scoring event in it. A player who builds an eleven-step cascade has done something
extraordinary; the correct response is to pay them, not to decline at step nine.

**And it was reachable.** The tester constructed seven independent boards at depths 9–11. A
rail that play can reach is not a safety rail — it is a gameplay parameter, and this one was
never designed as such. `assert step <= 32` (§4) keeps the engine from hanging, which was the
rail's only legitimate job.

**`streakMult` — consecutive *clearing turns*.** A lookup table, not a formula:

| consecutive clearing turns | 1 | 2 | 3 | 4 | 5 | 6+ |
|---|---:|---:|---:|---:|---:|---:|
| × | 1.0 | 1.3 | 1.6 | 2.0 | 2.5 | 3.0 (cap) |

**The streak is incremented first, then applied — the multiplier shown is the one the clear
just earned, not the one the next clear will earn.** The approved draft's formula was
ambiguous about this and the linear `0.2` step made it worse: applied the other way round,
the first *two* clearing turns both paid ×1.0, so the mechanic did nothing at all until the
third consecutive clear. A multiplier meant to reward consistency has to pay out on the
second clear, which is the moment the player discovers it exists.

The table also replaces the `0.2` step, which reached the ×3.0 cap only at eleven consecutive
clearing turns — unreachable in a 40–70 turn run, so the top of the mechanic was dead. Six
consecutive clearing turns is a genuine achievement and an achievable one.

Displayed as a pill in the HUD whenever it exceeds ×1.0, appearing in the same moment as the
score it multiplied, so cause and effect land together.

**Streak precedence — evaluated in this order at the end of every turn, first match wins:**

| # | Condition | Effect on the streak |
|---|---|---|
| 1 | The board is empty (Perfect Clear) | Set straight to the ×3.0 cap |
| 2 | At least one clear step occurred, in Phase 2 **or** Phase 3 | Increment by 1 |
| 3 | Otherwise | Reset to 0 |

**The streak follows the board, not the input.** A passing turn whose *arrival* completes a
row is a clearing turn, exactly like any other. The approved draft said "passing always
resets it", which contradicted rule 2 for every pass that cleared — not only the
pass-into-Perfect-Clear case, which is merely the loudest instance of a conflict that was
already there.

The rationale for the original carve-out was that passing should never be free. It isn't:
passing costs you your move, which is the scarcest resource in the game, and a player who
passes repeatedly buries themselves within a few turns. Punishing a pass that the player
*correctly* judged would let the incoming herd complete a row is punishing good play.

**Buffalo terms:** each shrink is +50 and counts toward the chain depth, but a buffalo row
does *not* count toward `n` in `rowValue` — it did not clear.

**The completion that retires a buffalo pays both terms: 50 + 650 = 700** (before
multipliers). Taking the last segment is still taking a segment, so it still earns the shrink;
retirement is a bonus *on top*, not a replacement. The alternative — excluding the final
shrink — would need a carve-out ("shrinks that reduce the size to 0 do not count as shrinks")
that serves no design purpose and that every reader would have to remember. One uniform rule:
**every buffalo row completion pays 50; the fourth pays 500 more.**

A buffalo is therefore worth 50×4 + 700 = **900** across its life, against the 500 those five
rows would have paid as ordinary clears. **That +400 premium is deliberate, and the bonus rose
from 500 to 650 to keep it so.** At size 5 the buffalo costs a fifth completion and blocks 55%
of the row rather than 40%; if the reward had stayed flat while the imposition grew, the
incentive in §6.4 — that the buffalo should be something the player *wants* to see — would
have quietly inverted.

**`rowValue` is unchanged at 9 columns.** 100 points was priced against filling ten columns
and now buys nine. With a single board configuration the absolute scale is arbitrary — what
matters is that every threshold priced *in* score (unlocks, and the §13 ability charges) is
calibrated against **measured** score distributions rather than against a theory of what a row
is worth. §5.7 ¶5 is the run that produces them.

**Perfect Clear:** if the board is completely empty after a resolution, +1000, and the streak
**multiplier** jumps straight to its ×3.0 cap while the **raw counter** rises to at least the
cap index but never falls — `max(streak + 1, 6)` — so a player already 13 clears deep goes to
14, not backwards to 6 (AC-609e). Multiplier and counter are separate quantities here and the
distinction matters only to `longestStreak`; AC-609 tabulates both. v1 detected an empty grid and quietly ran an extra turn
(`src/data/gameStore.js:262-269`); v2 treats it as the best thing that can happen to you and
says so.

### 7.3 Worked example

Turn 22 on Savanna. The player cleared on each of the previous three turns, so this clear is
their **4th consecutive clearing turn — `streakMult = 2.0`** (incremented first, then
applied). Their slide completes two rows at once; the collapse drops a stack that completes a
third row containing the buffalo.

```
step 1: rowValue(2) = 300 ; chainMult 1 ; streak 2.0   →  300 × 1 × 2.0  =  600
step 2: rowValue(0) = 0, one buffalo shrink = 50 ; chainMult 2 ; streak 2.0
                                                        →   50 × 2 × 2.0  =  200
                                                                    total =  800
```

The HUD ticks 800 upward over 400 ms; `+600` floats off the first pair of rows, `+200` and
`BUFFALO −1` off the third, and the pill reads ×2.0 as it happens.

Had that third row retired the buffalo instead of merely shrinking it, step 2 would have paid
`(50 + 500) × 2 × 2.0 = 2200`.

### 7.3a Stats and score are derived from the same event stream

The swept-rows defect surfaced as three Game Over stats disagreeing with the score above them
— `rowsCleared` 6 against 5 paid, `longestChain` 8 against a true depth of 10,
`buffaloRetired` 1 against a paid 0. Removing the scoring cutoff resolves all three, because
there is no longer a category of step that resolves without paying.

But the *shape* of that bug is worth closing permanently, because it will otherwise recur the
next time any rule makes score and board state diverge:

> **Every run statistic is derived from the same `events[]` array that the score is summed
> from. No statistic is counted independently, anywhere.**

`rowsCleared` is the sum of `n` across clear events; `longestChain` is the highest `step` in
any clear event; `buffaloRetired` is the count of events carrying a retirement; and
`longestStreak` is the highest `streak` across `ADVANCE` events. Computed this way they
**cannot** disagree with the score — not because someone remembered to keep them in sync, but
because there is only one source. A statistic incremented at a second site is a defect even
while it happens to agree.

`longestStreak` is the one that tests the rule, because a streak is a *turn*-level fact and no
clear event carries it. The answer is to **put `streak` on the `ADVANCE` event** (AC-706e), not
to carve out an exception: one exception is all it takes to need a sync rule again, and the
sync rule is the thing that fails.

This is the same principle as the engine/presentation split (`ui.md` §8.3 ¶3): one authority
per fact, and everything else reads from it.

### 7.4 What is deliberately not scored

- **No points for surviving turns.** Turn count is shown as a secondary stat and recorded in
  the run record, but it is not score. Rewarding the clock rewards passing.
- **No combo for "moves without a mistake"** — there are no mistakes to make, only
  suboptimal packing.
- **No negative score.** Nothing subtracts. The punishment for a bad turn is a worse board.

---

## 8. Run lifecycle and game over

**Run start.** The board is seeded with **two arrival batches applied in sequence** (generate,
place at row 0, gravity, resolve clears; repeat) so the player opens on a board with something
to work with rather than an empty grid. Three rules the approved draft left unstated:

- **Both seeding batches use turn 1's band** for the chosen difficulty. They are the opening
  position, not turns, so the ramp has not started.
- **Neither may contain a buffalo.** §5.4 already excludes turn 0, and a buffalo the player
  never saw arrive — sitting on the board before their first move — is an obstacle with no
  explanation.
- **Seeding resolves clears but scores nothing.** If the two batches happen to complete a row
  it clears normally, because opening on a completed row that would vanish on the first
  resolution anyway is just confusing. But the run opens at **score 0** (AC-601) with the
  streak at 0 and no clearing turn recorded: the player has not played yet, so they have not
  earned anything.

Then `turn = 1`, `score = 0`, streak 0, `Q(1)` shown in the tray.

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

Reasons to reopen the app.

> **These are ports, not inventions.** The v1 review's feature inventory was written against a
> stale commit (see its CORRECTION section). v1 **already has** a score, a persisted high
> score, session history in `StatsPanel.js`, and haptics in `useSoundManager.js`, all built on
> `useLocalStorage.js` over AsyncStorage. v2 rebuilds them against a fixed board and an honest
> scoring model, which is still the right call — but the work is porting and improving
> behaviour that players already have, not adding something new. Treat any v1 behaviour not
> contradicted below as worth preserving.

**Carried over from v1 deliberately:** *recent runs*. `StatsPanel.js` lists the last ten runs
with difficulty, date, score and turns. Aggregate lifetime totals do not replace that — a
list of your last ten runs is the thing that shows whether you are improving today. Records
shows both.

**Persisted records**
- Best score, best chain, longest run (turns), most rows in one run — **per difficulty**.
- Lifetime: games played, total turns, total rows cleared, buffalo retired, perfect clears.
- **`longestStreak` records the raw count of consecutive clearing turns, not the multiplier.**
  ×3.0 tops out and stops being interesting; "14 clears in a row" keeps meaning something.
  The raw counter keeps counting past the cap for this reason — but it is never displayed
  during a run (`ui.md` §5.5).
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

### Session resume — ported, as a replay

**v1 persists the in-progress run and a mid-run game survives a relaunch.** Nothing in the v2
design had an equivalent, which made v2 a **regression against shipped behaviour**: a player
who backgrounds the app loses their run. On a phone, backgrounding is not an edge case — it is
what happens every time someone reads a message. **Ported.**

**What v1 does, and what not to copy.** `GameScreen.js:53-72` serialises the entire board to
AsyncStorage on a **1 Hz `setInterval`**, with `[store]` as its dependency array, so the
interval is town down and rebuilt on every render for the life of the run. The feature is
right; the implementation is precisely what AC-1002 forbids.

**v2 stores a replay, not a board:**

```
ws.resume.v1 = { schemaVersion, engineVersion, seed, difficulty, moves[], digest }
              moves[] = [{ t: 'M', id, x } | { t: 'P' }, ...]     // one per turn
```

Resume re-runs the engine from turn 1, applying each move. Three reasons this beats a
snapshot, and the first is the one that decides it:

1. **A replay can only ever reconstruct a legal board**, because the engine produces it. A
   snapshot can inject a board the rules cannot reach — from corruption, a truncated write, or
   a tampered file — and the whole design rests on the engine only ever being in reachable
   states. AC-504b's chain guard exists to catch exactly that; a save file that can create it
   would be self-defeating.
2. **It is tiny.** A move is a handful of bytes; a 70-turn run is well under a kilobyte.
3. **It is already paid for.** The seeded PRNG (§5.2) was specified for reproducible bug
   reports and a future Daily Challenge. Resume is a third use of the same property, and the
   stored replay *is* the bug report.

**Versioning is mandatory, not optional.** A replay reconstructs a run only under the rules
that produced it, so a tuning change to bands, weights or scoring would silently rebuild a
*different* run. On any `engineVersion` mismatch the resume is **discarded, not replayed**.
The `digest` — a cheap hash of the reconstructed board — is checked after replay; a mismatch
also discards. Losing a run to an app update is acceptable; silently resuming the wrong one is
not.

**When it is written:** on `AppState` transition to `inactive`/`background`, and nowhere else.
That is neither during a turn nor in the render path, so AC-1002 stands unamended. Moves are
appended in memory as they happen and serialised once, on the way out.

**The trade-off, stated plainly.** A hard crash mid-run loses the run, where v1's 1 Hz timer
would have lost at most a second. I am taking that: backgrounding is constant and crashing is
rare, and the alternative is writing to disk forever during play to insure against something
that should not happen. If crash-loss shows up in real use, the fix is to also write on the
turn boundary after a long gap — not to reinstate a 1 Hz timer.

**Resume UX.** With a saved run present, Home leads with **Resume** (showing its score and
turn) and offers **New Run** second. Starting a new run discards the saved one and asks first,
because it is destructive. The resume is cleared when a run ends. A resumed run is an ordinary
run in every other respect, including writing its record and its high score.

**Storage.** Two AsyncStorage keys — `ws.save.v1` for records and settings, `ws.resume.v1` for
the in-progress replay — each holding one JSON object with a
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
  clearing turn of 960 ms and 570 ms for a turn with no clear. A tap during the lock is
  buffered and applied at the next Phase 0, not dropped.
- **All animation runs on the UI thread as Reanimated worklets**, and the drag is a
  gesture-handler pan writing to a shared value. Nothing is driven by `setState` or
  `setTimeout`. This is a hard contract, not a preference — `ui.md` §8.3.
- **`expo-haptics` is already a dependency and already in use** (`useSoundManager.js`), so
  haptics are a port and an expansion, not new work. **`expo-audio` must still be added** —
  despite its name `useSoundManager` plays no audio whatsoever, only haptics. `expo-sqlite`
  and `react-native-url-polyfill` remain genuinely unused and should be removed.

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
| D38 | The origin of a drag is marked as a **recess**, not a third outline | Past/present/future get three visual registers — recessed, solid, outlined — so only one of the three is an outline and the board does not read as a diagram (`ui.md` §5.5). |
| D33 | Board narrowed to 9 columns; elephant 4 / buffalo 5; species mix fixed — bands re-derived from scratch | Each change alone forces a re-derivation, so three sequential adjustments cost more than one derivation and the intermediate states are not worth measuring (§5.6). |
| D34 | The band controls the MEAN cells/turn, not each batch's total | §5.2 draws a whole number of animals so the realised mix can match §5.4; per-batch exactness was what biased the mix (§5.2). |
| D35 | Buffalo retirement bonus 500 → 650 | The buffalo costs a fifth completion and blocks 55% of the row; a flat reward against a growing imposition inverts §6.4's incentive (§7.2). |
| D36 | The tray shows silhouettes, not species | Less specific is not less true — footprint and columns are exact, and footprint is the plan-relevant information. Buffalo keeps its rim because it changes the rules (`ui.md` §6.1). |
| D37 | Abilities are gates on score, never purchases — spending costs no score | If spending deducted score, the leaderboard would reward never using the mechanic (§13.2). |
| D31 | Text scaling is three-way: flag on HUD and board, `maxFontSizeMultiplier` on fixed-height chrome, unlimited elsewhere | A cap is not an exemption — capped text still scales, it just stops before it clips. AC-910c had no vocabulary for the middle case (`ui.md` §10). |
| D32 | The anticipation cue lights the completing row's **gap**, not the row uniformly | A row about to complete is nearly full, so a uniform wash lights the gap anyway; specifying it deliberately points at where the arrivals land and ties the cue to the tray (`ui.md` §8.2b). |
| D29 | The input-lock clock starts at finger-up, and the implementation subtracts the commit gap before scaling | The budget is a promise about what the player feels, and that starts when they let go (`ui.md` §8.2). |
| D30 | Size numerals sit on a solid chip rather than inheriting the species glyph colour | Fixes contrast at 16.7:1 by construction instead of requiring five correct per-species choices; three of five were failing (`ui.md` §5.2). |
| D27 | Dynamic Type: sheets and overlays scale fully; the HUD keeps its height and trades labels for value size at xxLarge+ | AC-910 as approved was unsatisfiable against the ladder's fixed chrome. Letting the HUD grow spends board rows on chrome for the players least able to lose them (`ui.md` §10). |
| D28 | The score count-up starts at the first clear unit's `collapseAt`, not the React commit | The HUD must not announce a clear before the board does; measured at 400 ms vs a 570 ms flash (`ui.md` §8.2a). |
| D26 | The clear flash goes 140 → 320 ms, with an 80 ms leading beat on a resolution's first step, and cascades slow rather than accelerate | First real owner viewing called the clear "too abrupt". The flash is an announcement, so its length was free — 140 ms was a leftover from when it gated input (`ui.md` §8.2a). |
| D24 | Session resume is ported from v1, stored as a seed + move list rather than a board snapshot | v2 without it is a regression against shipped behaviour. A replay can only reconstruct a legal board; a snapshot can inject an unreachable one (§9). |
| D25 | The resume is written on `AppState` background only, never per turn | Keeps AC-1002 intact. v1's 1 Hz `setInterval` write is the thing AC-1002 forbids (§9). |
| D23 | `streak` rides the `ADVANCE` event so `longestStreak` is event-derived like every other stat | Keeps AC-706b absolute. A carve-out for one field reintroduces the sync rule that AC-706b exists to eliminate (§7.3a). |
| D22 | A Perfect Clear raises the streak counter to at least the cap index but never lowers it | Rule 1 is a floor on the multiplier, not an assignment to the counter; the best turn in the game must not be the one that sends a streak backwards (§7.2). |
| D20 | The 8-step chain rail is removed as a scoring cutoff; `assert step <= 32` replaces it as a crash guard | `chainMult` is already flat at ×5 from step 5, so the rail bounded nothing — it silently confiscated 9,750 of 17,100 points on the committed fixture, and play reached it on seven constructed boards (§7.2). |
| D21 | Every run statistic is derived from the score's own event stream | Stats and score cannot then disagree by construction, rather than by remembering to sync them (§7.3a). |
| D15 | Buffalo retirement pays 550 (50 shrink + 500 bonus) | One uniform rule beats a carve-out; makes a buffalo worth +300 over four ordinary clears, which is what makes it wanted (§7.2). |
| D16 | Streak increments before it is applied, and uses a shaped table not a linear step | The multiplier must pay out on the *second* clear, and the ×3.0 cap must be reachable inside a 40–70 turn run (§7.2). |
| D17 | The streak follows the board, not the input — a pass that clears is a clearing turn | Removes the AC-609/613 conflict at its root rather than ordering it; punishing a correctly-judged pass punishes good play (§7.2). |
| D18 | Spawn selection and placement interleave | Separate passes deadlock on {1,3,5}; interleaving also makes the cell bands exact (§5.2). |
| D19 | Meadow ceiling raised 4–6 → 5–7 | Measured 240 bot-turns against a 100–150 target; at a 4–6 ceiling the board was indefinitely holdable (§5.5). |
| D14 | All animation is a UI-thread Reanimated worklet; the drag is a gesture-handler pan | v1 drove animation through `setState` on `setTimeout`, which cannot hold 60 fps and is why its drag chases the thumb — `ui.md` §8.3. |
| D13 | Seeded PRNG per run, seed recorded | Reproducible bug reports now; Daily Challenge becomes a config change later. |

---

## 13. Layer D — Special abilities

**Status: structure decided, numbers pending measurement.** The economy is priced in score,
and score distributions on a 9-wide board with a corrected species mix do not exist yet
(§5.7 ¶5 / AC-318b). Every threshold below is marked accordingly. **This layer does not block
Slices 4–6.**

The owner's framing: *"The game is all about increased entropy over time, where players can
use some helps. Score thresholds where players are able to use a special ability from any
animal of choice."*

That framing is worth building on, because it makes three existing systems pay for each
other: **score stops being only a record and becomes a currency**, the species set **gains a
second axis of meaning beyond size**, and a losing board becomes recoverable **by skill rather
than luck**. It is the first mechanic proposed that pushes back against the entropy the rest
of the game is built on — and a game that only ever gets worse needs something that does.

### 13.1 The five abilities

| Species | Size | Ability | Effect |
|---|---:|---|---|
| Rat 🐀 | 1 | **Burrow** | Remove one animal of your choice from the board |
| Fox 🦊 | 2 | **Dart** | This turn, make up to **three** moves instead of one |
| Elk 🦌 | 3 | **Migrate** | Remove **every** animal of one species you choose |
| Elephant 🐘 | 4 | **Stampede** | Left-pack every row, closing all gaps within each row, then gravity |
| Buffalo 🐃 | 5 | **Hold the Line** | **No arrivals for 3 turns** |

**Scope scales with size, and that is the design.** Rat acts on one animal, fox on one turn's
actions, elk on one species, elephant on the board's whole layout, buffalo on time itself. The
game's central claim is that size is what matters; the abilities restate it in a second
language rather than introducing an unrelated one.

Notes on the two that need them. **Stampede does not complete rows** — a row with seven cells
occupied still has seven after packing — it consolidates fragmented gaps into one usable gap
per row, which is a large help without being a win button. **Hold the Line** is the owner's
first example and belongs to the buffalo because the buffalo is the thing that stands in the
herd's way; it is thematically exact.

**Abilities are always available.** They are not gated on that species being on the board.
"From any animal of choice" reads as *choose whichever ability you want*, and gating would
mean sometimes being unable to use the one you need. The alternative is in `open-questions.md`.

### 13.2 The economy

**Charges are earned by crossing score thresholds, and spending one costs no score.** This is
the ruling that protects the existing model. §7.4 says score rewards packing skill and nothing
else; if spending *deducted* score, the leaderboard would reward never using the system, and
the best scores would come from ignoring the mechanic. **Thresholds are gates, not purchases.**
Your score never goes down.

- Charges accumulate; **at most 3 may be held**, so they cannot be hoarded and dumped.
- Thresholds **escalate**, so early charges teach the system and late ones are earned:
  roughly 1,500 / 4,000 / 8,000 / 14,000 / 22,000 / 32,000. **All six numbers are provisional
  pending AC-318b** — they are placed against a guess at the score curve, and a guess is not
  good enough for the mechanic's entire pacing.
- **Using an ability is your action for the turn** — move, pass, or ability. The one-action
  rule (§6.2) is a Layer F invariant and abilities do not get an exemption. Fox's Dart is
  consistent with this: your action *is* the ability, and the ability happens to be moves.
- **Clears caused by an ability score normally.** The feedback loop — ability → clears → score
  → charge — is bounded by the escalating thresholds and the 3-charge cap. A player who uses
  Stampede to set up a triple clear has done exactly what score is for.

### 13.3 What it does to the difficulty curve

§5.5's ramp guarantees every run ends, and **Hold the Line attacks that guarantee directly**.
It survives, for a reason worth stating because it is not obvious:

> **The economy is self-limiting. Charges are earned by score, score is earned by clearing,
> and clearing requires arrivals.** A player cannot freeze their way to an unbounded run,
> because freezing stops the supply of the thing that buys freezes.

With escalating thresholds and a 3-charge cap, a strong run might spend 9–12 frozen turns in
total. That extends a run; it does not make one unbounded. **Runs still always end.**

The pacing ranges in **AC-318** are measured with abilities disabled. They describe the difficulty
curve, and a curve measured with an optional player-controlled intervention in it is not a
curve. Abilities get their own measurement (AC-1404).

### 13.4 Layer and dependencies

**Layer D, its own layer.** It depends on Layer F (engine, scoring) and touches Layer A
(charges must survive a resume). It ships after F, A and B, and blocks nothing.

Resume is nearly free: `moves[]` already records one entry per turn (§9), so an ability use is
a third move type — `{ t: 'A', ability, target }` — and the replay reconstructs charges by
re-running the score. Nothing new is persisted.

---
