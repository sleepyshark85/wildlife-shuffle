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

**Buffalo is scheduled, never random.** It arrives on a fixed schedule of turn numbers,
listed in §5.5b. It is never drawn from the weight table and never appears off schedule.

> **SUPERSEDED — "only one buffalo may be on the board at a time".** The approved rule
> skipped a scheduled buffalo whenever one was still alive, and called two buffalo "an
> unrecoverable board". **The owner overruled it**, having played it: *"we can have multiple
> buffalo, the player need to try to clear it as soon as possible."* The gate is gone. See
> §6.4a for what that changes and AC-311 for the do-not-restore clause.

**Why this was the right call, in numbers.** The gate was not a rare safety valve, it was the
normal case. Over 150 bot runs on the approved build a buffalo was on the board **77% of all
turns**, the schedule was suppressed **3.63 times per run**, and the player saw **1.13
buffalo in a whole run** against a cadence that should have delivered five. The mechanic
§6.4 is built around was firing about once per run. The owner asking for it "more regularly"
was a defect report about a gate, not a request for a smaller number.

### 5.5 Difficulty — what it actually varies

v1 had three buttons and two difficulties: `animalsPerTurn` was `1.5` and `2` for Normal and
Hard, and `generateAnimalsForTurn` applied `Math.ceil` to both (`docs/v1-review.md` C1).

v2's difficulty varies **three** things, and the game also **ramps within a run**, which v1
did not do at all.

| | **Meadow** (easy) | **Savanna** (default) | **Tundra** (hard) |
|---|---|---|---|
| Starting cell band | 2–4 | **2–4** | **3–5** |
| Band ceiling | **3–5** | **4–6** | **5–7** |
| Ramp | +1 to both ends every **12 turns**, until the ceiling | | |
| Species weights | small-heavy | balanced | large-heavy |
| Mean arrival | 3.0 → 4.0 cells/turn | 3.1 → 4.9 | 3.9 → 5.8 |
| **as a fraction of the 9-wide row** | **33% → 44%** | **33% → 56%** | **44% → 67%** |
| Buffalo every | 12 turns | 10 turns | 8 turns |

Ramp schedule, explicitly:

```
Meadow    t1: 2–4   t13: 3–5 (ceiling)
Savanna   t1: 2–4   t13: 3–5   t25: 4–6 (ceiling)
Tundra    t1: 3–5   t13: 4–6   t25: 5–7 (ceiling)
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

### 5.5b ONE CURVE — the habitats are removed

**The owner's decision:** *"I think we probably don't need to provide 'levels' concept.
Buffalo appears each 12 turns for 2-3 times then reduced to 10, to 8 … and probably stop at
that. The game gets harder overtime instead of having a fix level concept."*

Meadow, Savanna and Tundra stop being a choice. There is **one game, one curve**.

**Why this is right and not merely accepted.** `tools/play.mjs --pacing` prints its own
caveat: across ten independent 30-seed blocks the Meadow/Savanna run-length ratio ranged
**1.15–1.62**. A separation that wanders that far is not reliably perceptible — two of those
blocks would tell a player that Meadow and Savanna are the same game. Three labels promising
three experiences that our own measurement cannot distinguish is worse than one curve that is
honest about what it is. And a difficulty picker asks the player to answer a question at the
exact moment they have the least information with which to answer it.

**The tuning is not invented — it is repurposed.** 12 / 10 / 8 were already the three
habitats' `buffaloEvery` values. They become three *phases of one run*.

#### The buffalo schedule

```
buffalo  1   2   3      4   5   6      7   8   9  10  …
turn    12  24  36     46  56  66     74  82  90  98  …
         └── every 12 ──┘   └ every 10 ┘   └─ every 8, for ever ─┘
```

Three buffalo at a 12-turn cadence, three at 10, then 8 for the rest of the run. Expressed as
a pure function of the turn number:

```
isBuffaloTurn(turn):
  turn <= 36  ->  turn % 12 == 0
  turn <= 66  ->  (turn - 36) % 10 == 0
  otherwise   ->  (turn - 66) %  8 == 0
```

**This schedule is exact, and that is the whole point of it.** With the one-at-a-time gate
removed there is *nothing left that can suppress a scheduled buffalo* — the only other
condition in the approved generator, `SPECIES.buffalo.size <= cap`, is `5 <= 8`, which is a
constant true and has never once blocked anything. So the skip-versus-defer question the
owner's first request raised **dissolves**: there is no skip to defer, the list above is the
list, and turn 46 is turn 46 in every run that reaches it.

That makes the owner's "fixed turns" request literally true for the first time, and it makes
a **countdown in the HUD honest** — `ui.md` §7 specifies it. A preview the player can rely on
is the same contract §5.1 makes for the tray, applied to the one arrival that matters most.

**No `buffaloDue` state, no deferral memory, no per-run buffalo counter.** The schedule is a
function of `turn`, which is already in state.

#### The band ramp, and why it does *not* share the buffalo's schedule

One curve needs one band progression. It is the row previously labelled **Meadow**:

| | value |
|---|---|
| Starting band | **2–4** |
| Ramp | **+1 to both ends every 12 turns** |
| Ceiling band | **3–5**, reached at turn 13 |
| Species weights | rat 35, fox 30, elk 25, elephant 10 — mean drawn size **2.10** |

**The two ramps are deliberately separated in time rather than run together.**

```
turn   1 ──────── 13 ─────────────── 37 ──────── 67 ─────────►
band   2-4        3-5 (ceiling, flat for the rest of the run)
buff             12    12    12      10  10  10   8  8  8  8 …
       │ band owns │        buffalo owns the mid and late game │
```

The band ramp finishes at turn 13. The buffalo cadence does not tighten until turn 37. Between
them sits turns 13–36, where nothing escalates except the board the player has built. So at
every point in a run there is **one dominant cause of the difficulty changing**, which is the
whole of §5.7's ordering rule applied to the design itself instead of to the changelog. Had
the band ramp traced Meadow → Savanna → Tundra alongside the buffalo cadence, a pacing
measurement could not attribute a shift to either.

**Why this table and not one of the other two.** It is the only one of the three whose
measured run length lands inside §0's stated 3–5 minute window once buffalo accumulate — see
§5.9. It is a *selection among already-measured tables*, not a new tuning: no band value in
this document is a number nobody has run.

**The ceiling is flat from turn 13, and that is the design, not an oversight.** §5.5 argued
that without a ramp "the difficulty of turn 5 equals the difficulty of turn 90". That is still
true and it is still answered — but the answer is now the buffalo, not the band. Arrivals
plateau at ~4 cells a turn; what escalates is the number of five-cell blocks standing on the
board because the player did not clear them. **The escalation is responsive to how well they
are playing rather than imposed on a timer**, which is what the owner asked for and is a
better curve than a band that grows whatever you do.

#### One weight table

**The species mix does not shift as the run progresses.** One table, fixed for the whole run:
the Meadow row, rat 35 / fox 30 / elk 25 / elephant 10, mean drawn size **2.10**.

A mix that drifted from rat-heavy to elephant-heavy would be a second escalating lever
layered on the buffalo's, and §5.7 exists so an effect can be attributed to a cause. It is
also unnecessary: the large-piece pressure in this design comes from the buffalo, which is
size 5 and arrives on a schedule. **The drawn mix is the packing puzzle; the buffalo is the
weight.** Splitting those two jobs between two objects is clearer than having the drawn mix do
both badly.

The cost is that elephant is only 10% of draws, which is the *worst* table for the clustering
problem §5.8 fixes — at these weights the current generator can go **88 consecutive draws**
without an elephant. That is an argument for §5.8, not against this table.

#### What the removal costs

| Was | Becomes |
|---|---|
| `DIFFICULTIES` — three rows | one tuning row; `DEFAULT_DIFFICULTY` and `knownDifficulty` go with it |
| Home's habitat picker, three blurbs | a single Play button (`ui.md` §2) |
| `save.best[difficulty]` — three record sets | **one** record set (§9a) |
| `recent[].difficulty` per entry | dropped on migration (§9a) |
| `runRecord.difficulty`, diagnostics `difficulty` line | dropped; the seed alone reproduces a run |
| `ONBOARDING_DIFFICULTY = 'meadow'` | the curve; onboarding's boards are scripted, so nothing else moves |
| "Night Savanna", "Tundra" cosmetics | **names survive unchanged.** They were always names of *looks*, never of places you could play, and no unlock is gated on a habitat (`src/ui/cosmetics.js:36-76` — the four conditions are buffalo retired, best score, rows cleared, and rows in one step) |

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

### 5.6a The first measurement, and the retune

The bands in §5.5 are the **second** set. The first were a hypothesis derived from
fraction-of-row, and the bot falsified them:

| | Meadow | Savanna | Tundra |
|---|---:|---:|---:|
| hypothesis | 100–150 | 60–90 | 35–55 |
| measured median | **73** | **35.5** | **27** |
| measured mean / min / max | 84.2 / 31 / 282 | 43.0 / 21 / 90 | 28.1 / 19 / 43 |

**All three short, and Savanna worst at −41%.** The ordering held, so the shape was right and
the magnitude was not. The owner's original complaint was that the game felt *easy*; the
species-mix fix corrected that defect and the three changes together **overshot**. These are
also optimistic numbers — the bot has perfect information, so a human does worse.

**The retune, and why it is not uniform.** Every ceiling drops by 1. Savanna's and Tundra's
starting bands drop by 1. **Meadow's starting band does not**, and that is a finding rather
than a choice:

> **A band cannot ask for less than one animal.** §5.2 draws `k ≥ 1`, so the minimum arrival
> is a single animal — 2.10 cells on Meadow, 2.42 on Savanna, 2.75 on Tundra. A band of 1–3
> has a mean of 2.0, **below Meadow's floor**, and measures 2.41 cells/turn rather than 2.0.
> **No band's low may be below 2**, at any difficulty, and a band whose mean sits under the
> difficulty's mean animal size is not a band, it is a rounding artefact.

That floor is new to this document and is now AC-306b.

**Consequence to watch: Meadow and Savanna now share a starting band** (2–4). For the first
twelve turns they differ only in species mix — real, since Savanna's arrivals come in fewer,
chunkier pieces (3.01 vs 3.12 cells/turn in 1.43 vs 1.29 animals) — but it is a subtler
distinction than two different bands. If the difficulty choice feels indistinct early, the
fix is to restore Savanna to 3–5 and take the magnitude back out of its **ramp interval**
instead, not to re-lower Meadow past its floor.

### 5.6b WITHDRAWN — the shape diagnosis was made on noise

**This section previously argued that the difficulties were badly spaced and queued a
per-difficulty ramp change to fix it. Both the diagnosis and its stated mechanism were wrong.**

**The diagnosis was a 30-seed artefact.** AC-318 mandated seeds 1–30. Across ten independent
30-seed blocks of the same table, Meadow/Savanna ranged **1.15–1.62** and Savanna/Tundra
**1.32–1.78** — and seeds 1–30 is the highest block on both. At **300 seeds** the pre-retune
table gives **1.59 / 1.44**, not the 2.06 / 1.31 I diagnosed from. The true shape was already
near target and the compression was about half the size recorded.

**The mechanism was backwards.** I wrote that *"a slower ramp stretches long runs much more
than short ones"*. It is the opposite, and the arithmetic is not subtle — a delayed ramp step
is a large fraction of a short run and a small fraction of a long one:

| | run length | ramp 12 | ramp 20 | Δ cells/turn |
|---|---:|---:|---:|---:|
| Meadow | 69 | 3.78 | 3.67 | **−0.11** |
| Savanna | 47 | 4.22 | 3.74 | −0.48 |
| Tundra | 31 | 4.74 | 4.30 | −0.44 |

So the ramp is the **weakest** lever on the difficulty I proposed it for, and my suggested
assignment — Meadow 16 / Savanna 12 / Tundra 10 — pointed the weak end at the difficulty that
needed most help. **For a long run the ceiling sets the length; the ramp only shapes the
opening.**

**What survives:** the structural claim that equal cell-spacing produces unequal run-length
spacing. The developer separated that from the confound by measurement rather than argument —
running a genuinely uniform ceiling-only easing through the real code path left the ratios
unchanged (2.06 / 1.31 → 2.15 / 1.47) exactly as predicted, with Meadow identical in both as
an internal control. The claim is sound; it just was not the problem here.

### 5.6c The targets were the stale thing, not the bands

The queued ramp change would now be justified on **magnitude** rather than shape: at 300 seeds
the medians are **69 / 47 / 31** against targets of 110 / 60 / 38, and Meadow's bands are
exhausted — its start is pinned at the AC-306b floor and its ceiling is one ramp step above.

**I am not making that change, because the target it is measured against was never derived
from the design's actual goal.** §0 states the intent in **minutes**: *"Target session: 3–5
minutes."* The 110 / 60 / 38 turn counts came from a chain of reasoning about a 10-wide board
and were never re-derived against it. Converting at ~4 s per turn:

| | measured | as minutes | target 110/60/38 as minutes |
|---|---:|---:|---:|
| Meadow | 69 | **4.6** | 7.3 — **outside §0's 3–5** |
| Savanna | 47 | **3.1** | 4.0 |
| Tundra | 31 | **2.1** | 2.5 |

**Chasing Meadow to 110 turns would take it to 7.3 minutes and overshoot the stated design
goal.** The shipped build already sits inside §0's window on Meadow and Savanna, and Tundra at
2.1 minutes matches §5.5's original "≈2 minutes" intent for a short, tense difficulty.

So the honest conclusion is that **the turn-count targets, not the bands, are what needs
correcting** — and the correct unit is the one §0 already uses. The pacing gate becomes
minutes, which requires measuring real per-turn duration rather than assuming 4 s.

**No further band, ramp or weight change until that measurement exists.** This would have been
my fourth consecutive attempt to predict pacing from reasoning; the first three were wrong,
and the fourth would have been chasing a target that contradicts the goal above it.

### 5.8 The species draw gets a memory — a carried-remainder bag

**The owner's second report:** *"Sometimes, an animal appears much more than the others. How
about having a balancing algorithm?"*

#### 5.8.1 They are right, and the existing check could never have told us

`docs/v2/species-mix.mjs` verifies the realised share lands within ~2 pp of the weight table
and the mean drawn size within 0.10, over tens of thousands of batches. It passes. It was
always going to pass, because the draws are independent weighted picks (`src/engine/rng.js`
`weightedPick`, called at `src/engine/spawn.js:190`) and the law of large numbers is not a
design property. **The owner is describing a window of ten turns; an aggregate over 60,000
batches is structurally blind to one.**

So I built the check that is not blind to it: `docs/v2/spawn-clustering.mjs`, run against the
**real** `generateBatch` and the **real** mulberry32, 200 seeds × 200 turns ≈ 75,000 draws.
On the curve's weight table:

| measured over 75,109 draws | current generator |
|---|---:|
| realised share (rat/fox/elk/elephant) | 35.6 / 30.1 / 24.6 / 9.8 % — **on target** |
| mean drawn size | 2.085 vs 2.10 — **on target** |
| longest run of one species | **10 in a row** |
| worst gap between elephants | **88 draws** — about 60 turns, a whole run |
| worst gap between elk / fox | 41 / 34 draws |
| 12-draw window, p99 worst share deviation | **40.0 pp** |
| 12-draw window, some species absent entirely | **33.4% of windows** |

One window in three contains only three of the four species, and the p99 window is 40
percentage points off the table — on a 12-draw window that is eight rats where the table asks
for four. **The two rows the existing check measures are green and the four rows underneath
them are the game the owner played.** That is the whole finding: this was never a tuning
disagreement, it was an unmeasured property.

I considered leaving it alone on the grounds that a run of rats is an easy patch and a run of
elephants is a crisis, and that removing both flattens the game's texture. I am not
recommending that, for one reason: **an 88-draw elephant drought is not texture, it is a
different game.** A player who never sees the piece the board was built to need cannot plan,
and §5.1 already commits this design to the position that the information needed to plan must
be visible and must be true. A generator that can withhold a whole species for a whole run
breaks that contract from the other side.

#### 5.8.2 The mechanism

A **carried-remainder bag** — the Tetris 7-bag shape, adapted to non-uniform weights.

```
BAG_SIZE = 12

refill(carry):
  for each drawable species s:
      credit[s] = carry[s] + BAG_SIZE * weight[s]      # integer, in units of 1/100
      tickets[s] = floor(credit[s] / totalWeight)
      carry[s]   = credit[s] - tickets[s] * totalWeight
  while sum(tickets) < BAG_SIZE:                        # largest remainder, deterministic
      give one ticket to the species with the largest carry (DRAWABLE order breaks ties)
  bag = shuffle(the multiset of tickets)                # Fisher-Yates on the run's PRNG

draw(room):
  take tickets off the bag until one fits (size <= room); refill if the bag empties
  PUT THE UNFITTABLE TICKETS BACK and return the one that fit
```

Three properties, and each one answers something:

1. **The long-run share is exactly the weight table**, because the fractional remainder is
   carried rather than rounded away. A plain 12-ticket bag would ship the *rounded* share and
   drift fox by 2 pp for ever; this does not. AC-308b is preserved by construction rather
   than by measurement.
2. **Every species is allotted at least one ticket in every bag** at the curve's weights — the
   rarest, elephant at 10%, gets 1.2 — so no species can be absent across two consecutive
   bags, and the worst possible gap is bounded by **2 × BAG_SIZE**. The 88-draw drought
   becomes structurally impossible, not merely unlikely.
3. **The skip rule spends nothing.** A ticket whose species cannot fit the remaining capacity
   is *put back*, not discarded, so the hard board limit delays a species by a draw instead of
   costing it its entitlement. Without this the bag would reintroduce AC-308b's ceiling-band
   drift, which is the exact defect §5.2 was written to remove.

**Why 12.** It is the largest bag at which every species still clears one ticket at the
curve's weights (elephant 12 × 0.10 = 1.2; at BAG_SIZE 8 it is 0.8 and the guarantee in
property 2 collapses). It is also ≈ 8 turns of draws, so a "hand" is about the length of one
buffalo cycle — the player experiences roughly one bag between buffalo.

**Why not a pity/deficit weighting.** A deficit-weighted pick is mean-reverting but unbounded:
it makes a drought *less likely* without making it impossible, so property 2 would become a
percentile rather than a guarantee and AC-308e could only ever be a soft assertion. The bag
gives a bound, and a bound is testable.

#### 5.8.3 Where the memory lives — determinism

> **The bag is state, and it is seeded state.** `{ bag: string[], carry: {species: int} }`
> lives on the run state beside `rng`, is threaded in and out of `generateBatch` exactly as
> `rng` is, and is initialised empty by `createRun`. The shuffle draws from the run's own
> PRNG. **No module-scope variable, no lazy singleton.**

That is what keeps session resume working. Resume is a *replay* of `{seed, difficulty, start,
moves[], digest}` (`src/ui/session.js:163`), not a snapshot: it re-runs `createRun` and every
stored move, so the bag is rebuilt from the seed along with everything else. The replay record
does **not** need a new field, and `boardDigest` does not need to include the bag — a
divergent bag produces a divergent board within two turns and AC-1017 already catches that.

A module-level bag would break replay silently and only on the second run of an app session,
which is the worst class of bug this project has shipped (see `docs/development-process.md`
§6.9). The AC is written so the hygiene grep can find it: **AC-319d**.

#### 5.8.4 What it measures, after

| 75,000 draws, the curve's weights | current | bag(12) | limit |
|---|---:|---:|---:|
| mean drawn size (intent 2.10) | 2.085 | **2.101** | ±0.10 |
| realised share, worst species error | 0.6 pp | **0.1 pp** | ±2 pp |
| longest run of one species | 10 | **7** | ≤ 8 |
| worst gap, elephant | 88 | **23** | ≤ 24 |
| worst gap, elk / fox / rat | 41 / 34 / 19 | **17 / 16 / 16** | ≤ 24 |
| 12-draw window, p99 share deviation | 40.0 pp | **25.0 pp** | ≤ 26 pp |
| 12-draw window, a species absent | 33.4% | **13.5%** | ≤ 20% |

**The bag is a texture change, not a difficulty change, and that is measured rather than
asserted:** 300 bot runs on the full proposed curve give a median of **57 turns with the bag
and 58 without** (§5.9). It costs 1 turn in 58. What the owner gives up is genuine and small:
the lucky run of four rats and the unlucky run of three elephants both get rarer. What they
gain is that no species can vanish for a run.

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
4. **Maximum batch occupancy**, split by **buffalo turns and ordinary turns**, to confirm 8 of 9 is
   reached and 9 never is. Measured on this curve: **8 on both**, and the `W − 1` cap **binds on 66%
   of buffalo turns** — it is load-bearing now, not headroom. **(AC-309)**
5. **Score distribution per difficulty** — median and 90th percentile of final score. Nothing
   needs it yet, but the ability thresholds in §13 must be priced against measured scores
   rather than guessed, and this is the run that produces them.

**Tune in this order if the ranges are missed:** bands first, ramp interval second, species
weights last. The weights now do exactly what they say, so changing them changes the game's
character rather than just its pace.

> **§5.5 through §5.7 describe three habitats. There are no longer three habitats.** §5.5b
> replaces the difficulty table with a single curve; §5.8 replaces the species draw; §5.9
> re-measures the pacing; §5.10 is the order the two changes must land in. Everything above
> this line stands as the reasoning that produced the numbers §5.5b keeps — it is history,
> not instruction.

---

### 5.9 Run length, measured

One curve gives one run length, so the number has to be right rather than bracketed by three.
300 seeds, the greedy bot in `tools/bot.mjs`, abilities off, the 12/10/8 buffalo schedule with
the gate removed.

| band table | p10 | **median** | mean | p90 | max | median @ 4 s/turn |
|---|---:|---:|---:|---:|---:|---:|
| **Meadow row — the curve** | 37 | **58** | 62.4 | 91 | 161 | **3.9 min** |
| Savanna row | 33 | 44 | 46.9 | 65 | 120 | 2.9 min |
| Tundra row | 23 | 32 | 32.6 | 44 | 66 | 2.1 min |
| *the curve, with §5.8's bag* | 38 | *57* | *61.8* | *95* | *183* | *3.8 min* |

§0 asks for a **3–5 minute** session. Only the Meadow row's median lands inside it, and its
p10–p90 spread of 2.5–6.1 minutes brackets the window about as well as a single distribution
can. The Savanna row's 2.9-minute median is *under* the floor before a human ever touches it —
and these are optimistic numbers, because the bot sees the whole board and never misdrags.

**This is a selection, not a tuning.** AC-318h forbids inventing new band, ramp or weight
values until a real per-turn duration has been measured on a device, and nothing here invents
one: all three rows above are values that already shipped and were already measured. AC-318h
is amended to say exactly that, so it keeps its teeth where they belong.

**The pacing lever, if the device measurement moves the target.** It is **not** the band any
more — it is the buffalo phase lengths. "2–3 times then reduced to 10" is the owner's own
dial, and lengthening or shortening the 12-turn phase moves run length without touching a
single band value. Use it first.

#### What removing the one-at-a-time gate actually did

| 150 bot runs | gate on (shipped) | gate off, 12/10/8 curve |
|---|---:|---:|
| buffalo arrivals per run | 1.13 – 1.26 | **5.45** |
| buffalo shrinks per run | 2.0 – 2.6 | **9.3** |
| buffalo **retired** per run | 0.13 – 0.26 | **0.58** |
| most buffalo on the board at once | 1 | mean **4.9**, worst **11** |
| buffalo cells still standing at game over | 3.7 of 135 | **17.9**, p90 25 |
| median run length | 70 (Meadow row) | **58** |

**The difficulty this hits is the long run, not the short one.** On the shipped build the
gate's cost scaled with run length — a Tundra run ended before buffalo could accumulate, a
Meadow run lost whole cycles to one immortal buffalo. Removing it therefore takes 12 turns off
a Meadow-length run and about 1 off a Tundra-length one. **The curve does not become
unsurvivable; it becomes steeper the longer you last**, which is precisely the escalation the
owner described.

**The servicing gap is real and it is the mechanic now.** A buffalo costs five row completions
through its own row to retire. At the 12/10/8 schedule about 27 segments of work arrive per
run and the bot delivers about 9 — a **34% servicing rate**. Buffalo are therefore a ratchet:
~18 cells (13% of the board) are still standing when the run ends. **I am not proposing a
population cap.** I measured caps of 2 and 3 and they work (median 62/62 turns, worst case
bounded), but a cap would blunt exactly the thing the owner asked for — *"the player need to
try to clear it as soon as possible"* only means something if not trying has a cost that
keeps growing. The cap is recorded in `open-questions.md` Q3 as the lever to reach for if the
device round says the late game is hopeless rather than hard.

> **CORRECTION — the worst case is ELEVEN buffalo on the board at once, not ten**, measured over
> 300 seeds and reproduced three independent ways; the per-run mean of those peaks is 4.9, not
> 4.7. The figure was under-reported here, in §6.4a and in `ui.md` §7.1, and the HUD's chip row
> was sized for ten. All three are corrected, and AC-509d now names eleven.
>
> The worst **locked** case is separately worth having, because it is what Stand Down converts:
> peak `Σ(size − 1)` over the herd reaches **25 segments** in the worst run, median **13**
> (§13.2f-ii).
>
> **Stand Down (§13.2f) is the answer to the servicing gap, and it does not close it.** At cost
> 3 it takes buffalo cells still standing at game over from 17.9 to **14.3** and retirements from
> 0.60 to **2.04**, on a median run 5% longer. The ratchet is slowed by a fifth. It is still a
> ratchet, which is the point — *"as soon as possible"* still has to mean something.

#### The ability ladder must be re-derived

`ABILITY_THRESHOLDS` is three ladders because the three medians differed by 1.68× and 1.84×.
One curve, one ladder. `ABILITY_PERCENTILES` already states that each rung is a percentile of
the measured final-score distribution, so this is a re-derivation and not a retune. Measured
on the full proposed configuration (curve + multiple buffalo + bag), 300 seeds:

| rung | p35 | p50 | p75 | p90 | p90×1.6 | p90×2.4 |
|---|---:|---:|---:|---:|---:|---:|
| measured | 1,695 | 2,120 | 3,650 | 6,515 | — | — |
| **ladder** | **1,700** | **2,150** | **3,650** | **6,500** | **10,400** | **15,600** |

Re-measure after the build and move these to whatever that run says; the percentiles are the
specification, the integers are only their current value.

### 5.10 These changes must not land in one pass

Three things are changing at once and §5.7's ordering rule exists so a measurement can
attribute an effect to a cause. **Land them in this order, re-measuring between each.**

| pass | change | expected effect on the median | why it is separable |
|---|---|---|---|
| **1** | Remove the one-at-a-time gate; replace `buffaloEvery` with the 12/10/8 schedule; collapse the three habitats to the one curve | **70 → 58 turns** (−17%) | This is the big one and it is the owner's headline decision. Everything downstream (records, ladder, Home, save migration) is in this pass because a half-collapsed difficulty model is worse than either end. |
| **2** | The §5.8 bag | **58 → 57 turns** (−2%) | Predicted to be inside the noise. If pass 2's measurement moves the median by more than ~3 turns, the bag is doing something it was not designed to do and that is the finding. |

Pass 1 changes the *amount* of difficulty; pass 2 changes its *distribution*. Landing them
together would leave a −18% median with no way to say which lever produced it — and the
predicted split, 17 points to one and 1 to the other, is precisely the kind of claim that is
only worth making if it can be falsified.

**`engineVersion` moves in both passes, and it should.** It is an FNV-1a fingerprint over
`TUNING_SURFACE` (`src/ui/session.js:104`), which already contains `DIFFICULTIES`, `SPECIES`
and `ABILITY_THRESHOLDS` — so pass 1 invalidates every stored resume automatically. Pass 2
does **not** change any constant in that list, so it must bump `ENGINE_REVISION` (currently 1)
and add `BAG_SIZE` to the surface. That is what `ENGINE_REVISION`'s comment already describes:
*"a rule changes in a way the constants below cannot see"*.

**The cost is one interrupted run per player per pass, and there is no migration that could be
correct.** A resume replays `{seed, moves[]}` under the rules that produced it; replaying an
old run under the new spawn rebuilds a *different board* from the same inputs. AC-1016
discards it deliberately and silently resumes nothing. The alternative — replaying it anyway —
is the failure AC-1016 was written to prevent. **No migration. The save (records, unlocks,
settings) is a separate blob and is migrated normally: see §9a.**

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

**And since the owner's device review, the gesture enforces it rather than reporting it.** The
dragged body is clamped to the swept-legal range, so a piece cannot be *dragged* across a
neighbour either, not even for the frames before a release that would have been refused
(`ui.md` §5.6, AC-407). The rule is unchanged; what changed is that the finger now meets it.
One consequence belongs here rather than in the UI document: **a drag released past a blocker
commits the packed-against move and spends the turn**, where it used to be rejected for free.
Cancelling a drag means releasing it back on its origin (AC-402).

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
- On retirement: a full-board celebration — gold burst, `+650`, heavy haptic. *(The doc said `+500`
  in two places after the premium rose with the buffalo's size; the code was always right —
  `theme.js:831` derives the label as `` `BUFFALO DOWN  +${SCORE.buffaloRetire}` ``.)*
- A persistent **buffalo chip** sits in the HUD whenever one is on the board, showing its
  remaining segments, so the player is never surprised by which row will refuse to clear.

---

### 6.4a Buffalo become a herd — what multiple buffalo change

The owner overruled the one-at-a-time rule: *"we can have multiple buffalo, the player need to
try to clear it as soon as possible."* §5.4 and §5.5b carry the schedule. This section is what
else moves, and it is deliberately a list of things that **do not** move, because the shrink
mechanic turns out to survive intact.

#### WITHDRAWN — "at most one buffalo per row" is false, and the arithmetic that proved it was incomplete

The approved text read: *"`2 × 5 > 9`. Two buffalo cannot share a row on a 9-wide board."*

**That is true of two *full* buffalo and of nothing else. A buffalo shrinks.** A size-4 and a
size-5 buffalo are **4 + 5 = 9 cells and fit a 9-wide row exactly**, and the mechanic that
produces a size-4 buffalo is the one this section is about. Measured over 18,712 settled bot
boards on 300 seeds:

| | measured |
|---|---:|
| settled boards with **≥ 2 buffalo in one row** | **2,840 of 18,712 = 15.2%** |
| most buffalo ever in one row | **4** (sizes 3/2/2/1, and 3+2+2+1 = 8 ≤ 9) |
| clear steps that shrank **more than one** buffalo | 257 of 6,595 |
| most buffalo shrunk in a single step | **3** |

It was never a rare edge: **one settled board in seven has a doubled row.**

**Every rule in §6.4 still survives, and the correction is to the count rather than to the
mechanic.** A completed row containing *n* buffalo removes every non-buffalo animal in it and
shrinks **each** of those *n* buffalo by one segment; the row does not clear; each shrink pays
+50 and each buffalo reaching 0 retires for +650. `resolveClears` (`resolve.js:74-101`) already
iterates every animal in every filled row and does exactly that, so the **code is correct and
was correct** — what was wrong is the comment above it and the AC that licensed it.

#### 6.4b The termination floor is 2, not 4 — and the crash guard must move

`resolveClears`' termination argument has now been wrong twice: once as *"ten cells, at most four
of them the single permitted buffalo"*, and once as AC-504's amendment, *"9 cells, at most 5 of
them buffalo, so every step removes at least 4."* **The second is wrong for the same reason the
first was: it assumes one buffalo.**

Re-derived properly. A completed row is `width` cells. Let *B* be the buffalo cells in it and
*n* the number of buffalo. Every non-buffalo cell leaves and every buffalo spends exactly one
segment, so the cells that leave are `(width − B) + n = width − (B − n)`, and `B − n` is
`Σ(size − 1)` over those buffalo. Maximise that subject to `Σ size ≤ 9` and `size ≤ 5`: the pair
**5 + 4** gives `4 + 3 = 7`. So

> **at least `width − 7` = 2 cells leave the board on every clear step.**

Measured, and the worst case is reachable rather than theoretical: *a step that removed no
animal at all and shrank two buffalo, on a row that was nothing but buffalo.*

**The consequence for `CHAIN_GUARD_STEPS`, and this is the design decision.** Two cells a step
against a board holding at most `9 × 15 = 135` bounds a cascade at **67 steps**. The guard is
**32**, which is now *below* the bound — so *"32 is more than twice the mass bound"* (AC-504b) is
false, and there exists a legal resolution the guard would abort. That matters because a tripped
guard may leave a completed row standing and **discards the run's score entirely** (AC-504e). A
crash guard that can fire on legal play is not a crash guard.

> **Decision: `CHAIN_GUARD_STEPS` becomes 68, and it is derived rather than written:**
> `Math.floor(BOARD.width * BOARD.height / 2) + 1`.

- **It restores the guard's only useful property**, which is that reaching it *proves* the engine
  is broken. At 32 it proved nothing; at 68 it is unreachable by any legal cascade, so the
  `CHAIN_GUARD` event, the `stats.chainGuardTrips` counter and AC-504e's refusal to persist the
  run all mean what they say again.
- **Raising it costs nothing.** A broken engine loops 68 times instead of 32 and is still
  bounded; the deepest cascade ever measured is **4 steps**, against a committed 7-step fixture.
- **It is derived from the constants**, so narrowing the board or changing the buffalo's size
  moves it automatically — the AC-126 rule applied to the one constant that had escaped it. The
  literal `32` was what let the bound and the guard drift apart in the first place.
- **The cost is one bumped `ENGINE_VERSION`**, since `CHAIN_GUARD_STEPS` is in `TUNING_SURFACE`.
  This pass discards resumes anyway (§13.4a), so it is free to take now and would not be later.

AC-504 and AC-504b are both amended; AC-311b is withdrawn and replaced.

#### What actually breaks

| Thing | State | What it needs |
|---|---|---|
| `resolveClears` (`resolve.js:74-101`) | **correct already** — it iterates every animal in every filled row and shrinks each buffalo it finds | nothing but the comment above |
| `buffaloOnBoard` (`board.js:88-90`) | `.find` — returns *a* buffalo. Its comment says *"At most one exists (D10)"* | becomes `buffaloesOnBoard` returning all of them; the spawn-gate caller disappears entirely |
| `currentBuffalo` (`engine.js:667-669`) | singular, drives the HUD chip | becomes plural; `ui.md` §7 specifies the chip |
| HUD buffalo chip (AC-509/510) | shows one buffalo's remaining segments | **a design question, and the answer is: one chip per buffalo, ordered by row, plus the countdown.** A single chip showing one of four buffalo would be the tray's broken-preview defect in miniature — information on screen that is true of something other than what the player is looking at |
| tray silhouette (AC-315c) | a batch can contain at most one buffalo, since it is scheduled once per turn | unchanged |
| `SEAM_BUFFALO` / segment seams (`ui.md` §5.3) | per-animal, driven by `animal.size` | unchanged |
| Hold the Line (`abilities.js:56`, `species: 'buffalo'`) | freezes arrivals; a frozen turn generates no batch (`engine.js:407`), so it skipped a scheduled buffalo outright | **withdrawn entirely** (§13.2g). Its slot on the buffalo's card now holds **Stand Down** (§13.2f), which is retrospective rather than prospective — it moves the buffalo already on the board rather than deferring the next one |
| Migrate / Burrow (`abilities.js:234-250`, AC-1412/1412b) | buffalo is not a Migrate target and no ability removes a buffalo | **unchanged, and now load-bearing.** With one buffalo the rule was flavour; with a herd, a Burrow that removed a buffalo would delete five clears of work for one charge and would be the dominant play every time. Stand Down does not breach it: it removes nothing (§13.2f-i) |
| `CHAIN_GUARD_STEPS = 32` | crash guard, justified as *"more than twice the mass bound"* | **32 → 68, derived** — the mass floor is 2 cells a step, not 4, so the bound is 67 and 32 was *below* it. §6.4b |
| Burrow's new left-pack (§13.2e) | new | the row it packs may contain a buffalo; the buffalo packs like any other body — its `x` may move, its `size` may not |

#### The pressure is now legible or it is not fair

With one buffalo the player could simply look at it. With up to **eleven** — the measured worst
case over 300 seeds, reproduced three independent ways — three things must be on screen and true
(`ui.md` §7): **how many buffalo, how much is left of each, and how many turns until the next
one.** The third is only possible because §5.5b's schedule has nothing left
that can suppress it — which is the same contract §5.1 makes for the tray, applied to the one
arrival the player most needs to plan around.

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

**Every unlock carries the evidence that it is reachable, the unit it was priced in, and the
measurement it was priced against** — not only the ones priced in score:

| Unlock | Requirement | Unit | Evidence, as of the 300-seed / 900-run measurement on the shipped bands |
|---|---|---|---|
| **Night Savanna** board theme | Retire 10 buffalo | cumulative, buffalo | ≈6–10 runs. A Savanna run meets ≈4 buffalo and retires 1–2. **Reachable.** |
| **Tundra** palette | **Score 2,500 in one Tundra run** | **p92, Tundra scores** | Tundra p90 = 2,260, max 5,930. **Reachable, a strong run.** |
| **Rat King** animal set | Clear 500 rows lifetime | cumulative, rows | ≈40 runs at ≈12 rows per Savanna run. **Reachable, a long goal.** |
| **Golden Herd** animal set | Clear 4 rows in a single step | single event | **Unmeasurable by this harness** — see below. |

The rule in **AC-1405f** applies to all four, and I had applied it to one. The rule says score-priced
content carries its percentile and its "as of" measurement; I repriced the Tundra palette and
left the other three, because they are priced in *buffalo* and *rows* rather than points. That
was the wrong reading of my own rule — **a cumulative condition can be unreachable too**, and
"500 rows" is a number that means nothing until someone knows how many rows a run clears. The
rule is now about **evidence of reachability in whatever unit the condition uses**, which is
what it should have said.

**Tundra palette was repriced from 25,000, which was unreachable.** Over 900 bot runs on the
shipped bands — perfect information, so a human does worse — the best single run anywhere was
**18,995**, on *Meadow*. On Tundra, whose palette it is, the best run scored **5,930**: a
4.2× shortfall. The condition could not be met by anyone.

It is now **Tundra-specific**, which it thematically always should have been — it is the one
unlock that sends you to the hard difficulty — and 2,500 sits near p92 of Tundra's measured
distribution: a genuinely strong run rather than a grind.

> **All score-priced content is specified as a percentile of the measured distribution for its
> difficulty, with the absolute figure recorded "as of" a named measurement.** A retune then
> re-derives it instead of silently stranding it. This is AC-1405b's rule, which I wrote for
> the ability thresholds and failed to apply to the unlocks already priced in the same
> currency.

**Golden Herd cannot be priced by measurement and must not be lowered on the strength of one.**
It was never observed — best 2 rows — but the greedy bot **takes every clear the moment it is
available**, so it structurally cannot stack rows for a simultaneous clear. The harness is
**blind** to this condition, not reporting it as hard. It needs a human or a stacking-policy
bot before ship; if that shows 4 is genuinely impossible on a 9×15 board, lower it to 3 — but
not on evidence that cannot see it.

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
ws.resume.v1 = { schemaVersion, engineVersion, seed, difficulty,
                 start: { runIndex, nextAnimalId },     // see below
                 moves[], digest }
              moves[] = [{ t: 'M', id, x } | { t: 'P' }, ...]     // one per turn
```

**`start` is not optional bookkeeping.** Animal ids are namespaced by `runIndex` and numbered
from `nextAnimalId`, and both **carry across a restart** so that no two animals in an app
session ever share an id (AC-214). A run reached through **Play Again** therefore mints ids
that a fresh `createRun(seed, difficulty)` cannot reproduce, and every stored move then names
an animal that does not exist. The rule the omission broke:

> **The record must carry every input `createRun` consumes**, not only the ones that feel like
> a seed. Carried state is invisible until something carries it, so a resume test that only
> ever exercises the first run of a session cannot catch this — AC-1014c exercises Play Again
> specifically.

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

**When it is written:** **whenever the player leaves the run, by any route** — `AppState`
going to `inactive`/`background`, *and* quitting to Home. Never per turn, never on a timer,
never from the render path, so AC-1002 stands unamended: its prohibition is about writing
during a turn or from render, and a deliberate quit is neither.

*(An earlier draft said "on backgrounding, and nowhere else". Read literally that means a
player who quits to Home without ever backgrounding gets no resume offer at all — the feature
silently not working for anyone who plays that way. The intent was "don't write per turn"; I
expressed it by naming the single trigger I happened to have in mind.)*

**One truth.** The offer on Home reflects exactly what is on disk — the in-memory record is a
cache of what was written, never a second source — so the two can never disagree. Moves are
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

### 9a. Records, once the habitats are gone

`src/ui/progress.js:133` keys bests per difficulty and AC-1008 *"names exactly these four"*
(`score`, `chain`, `turns`, `rows`). An existing player has three sets of four. One curve
needs one set.

**Decision: merge by taking the maximum, and say so once.** `best = { score: max over the
three, chain: max, turns: max, rows: max }`, as save-schema step 4 → 5.

- **Not reset.** Deleting somebody's high score because we changed our minds about difficulty
  is the app punishing the player for our decision.
- **Not kept as three sets of history.** A Records screen with a "Tundra (retired)" row is a
  museum label for a concept the player is being told no longer exists, and it would make
  every future record ambiguous — is this a new best, or only a new best on the curve?
- **Maximum, not the default habitat's.** Taking Savanna's alone would silently destroy a
  Meadow best that is almost certainly the player's largest number, and score is the one
  record people remember.

**It is honest to take the maximum because the curve is easier than two of the three rows it
replaces.** The curve's band table *is* the Meadow row, which produced the highest scores of
the three; a merged best is therefore a best the player can beat again on the same terms. It
would not be honest the other way round, and that asymmetry is why this is a decision rather
than a coin toss.

**`recent[]` keeps its entries and loses its `difficulty` field** (`progress.js:170`). The
last ten runs are there to show whether you are improving today, and a label naming a mode
that no longer exists makes the older entries unreadable rather than informative.
`progressStore.js:147`'s dedupe key `${seed}:${difficulty}:${turns}:${score}` drops the
difficulty segment; seed plus turns plus score is already unique in practice and the key only
has to be stable, not meaningful.

**Lifetime totals, unlocks, the daily streak and settings are untouched.** None of them was
ever per-habitat: the four unlock conditions are buffalo retired, best score, rows cleared and
most rows in one step (`src/ui/cosmetics.js:36-76`). One of them reads `save.best` as a map —
`Math.max(...Object.values(save.best).map((b) => b.score), 0)` at `cosmetics.js:55` — and must
become `save.best.score` in the same pass, or Tundra's palette unlocks at `NaN`.

**One unlock gets materially easier, and it should.** Night Savanna needs 10 buffalo retired.
At the shipped 0.26 retirements per run that was about 38 runs; on the curve it is 0.69, about
15. The goal was priced against a mechanic that was firing once per run — see §5.4. **With Stand
Down (§13.2f) a run that spends its reserve on it retires 2.04**, so the same unlock is about 5
runs for a player who uses the ability and about 15 for one who does not. That spread is
acceptable — it is a cosmetic, and the ability is the thing the condition is now measuring.

#### 9a-i The app says the records merged — one line, once

**Decision (Q12's open half, which the owner answered only as to the merge rule).** Records
carries a single dismissible line above the four values, the first time it is opened after the
migration:

> **`Habitats are gone. Your best from any habitat is now just your best.`**

- 13/400 `ink-muted`, full content width, with a 28 pt tappable **×** at the right (AC-1414's
  target-size rule applies to a dismiss as much as to a Cancel). Dismissal is persisted in
  `save.settings`, so it appears exactly once per install.
- It appears **only if the migration actually ran** — a save written at schema 5 or later never
  shows it, so a new player never reads an apology for something that did not happen to them.
- **Not a modal, not on Home, not on the Game Over sheet.** It belongs on the screen showing the
  number that changed, at the moment the player looks at it, and nowhere that interrupts play.

**Why not silence**, which was the defensible alternative: the numbers only go up, so nobody is
worse off — but the number that changed is the one people remember, and a player who had a
Tundra best and now sees a different figure on a screen that never explains itself will conclude
the app lost their data. One line of copy is cheaper than one support email, and much cheaper
than the review it would otherwise become.

---

## 10. Layer B — Polish

Full motion spec in `ui.md` §8, **sound in §15**, haptics in §15.5 and AC-1102. *(This pointer
read "§8–§9" for months; §9 is Typography and no sound section existed at all.)* The gameplay-relevant decisions:

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
| D58 | Dark-only is superseded; both themes ship | The owner saw it on a real phone — evidence none of us had. §1's argument was correct and was overtaken (`ui.md` §1, §16). |
| D59 | The size→lightness ramp keeps its direction on light; the **edge** carries the contrast floor | The ramp is an ordering and orderings are ground-independent — what breaks is the rat's absolute contrast, which is a narrower and cheaper problem. Inverting would keep monotonicity and discard the meaning (`ui.md` §16.1). |
| D60 | The background is visible only through empty cells; animals are opaque | Satisfies the owner's constraint by construction rather than restraint — no future alpha change can put texture behind an animal (`ui.md` §16.3). |
| D55 | The audio identity is struck wood, with metal reserved for the buffalo and no music at all | Pitch falls as size rises, so the audio carries the same property the whole visual system exists to make legible (`ui.md` §15). |
| D56 | Cascades ascend a pentatonic scale, not chromatically | A chromatic run is sour by six steps; the rare deep cascade is the best thing that happens in the game and should not be when the audio turns dissonant (`ui.md` §15.4). |
| D57 | A new best suppresses the game-over cue | They land within one commit and read as a mess; the dominant fact is the best, and the sheet already says the run is over (`ui.md` §15.6). |
| D52 | Abilities cost 1–3 charges, priced from measured value | At one flat price the value spread was 24× and Stampede made the other four irrelevant. Scope follows size, price follows value — two ladders, forcing them to agree would be dishonest (§13.2d). |
| D53 | Burrow is repriced first and its effect change is named but not applied | Two simultaneous changes make the next measurement unattributable. If it is still least-picked at 1 charge, it gains row left-packing (§13.2e). |
| D54 | The gold pip marks the Last Stand *event*, not a slot | At 0 charges the grant landed on pip 1 and was indistinguishable from an ordinary charge — absent exactly for the player it was invented for (`ui.md` §13.1). |
| D49 | No ability targets the buffalo — Burrow excluded as well as Migrate | The rule is per-object, not per-ability: the buffalo is a different kind of object, and letting rat's "one animal" reach it inverts §13.1's scope ladder and makes §6.4's premium optional (AC-1412b). |
| D50 | Hold the Line's freeze starts immediately — three arrivals including the one being stopped | Sparing the current turn lets the batch already in the tray land, which is the batch the player pressed the button to stop (AC-1410). |
| D51 | The `engineVersion` fingerprint covers anything that can change the meaning of a stored move, not just tuning constants | Changing what an ability does replays every move *successfully* into a different board — worse than a failed replay, because nothing reports it (AC-1016). |
| D46 | §5.6b's shape diagnosis withdrawn; its ramp mechanism was backwards | 30 seeds cannot carry a ratio — ten blocks spanned 1.15–1.62 and the mandated block was the highest. The ramp is the *weakest* lever on the longest runs, not the strongest (§5.6b). |
| D47 | Pacing is gated in minutes, not turns; no further tuning until per-turn duration is measured | The 110/60/38 turn targets imply 7.3 minutes on Meadow against §0's stated 3–5, so they contradict the goal they serve (§5.6c). |
| D48 | Tundra palette repriced 25,000 → 2,500 and made Tundra-specific | Unreachable: best of 900 bot runs was 18,995, and 5,930 on Tundra itself (§9). |
| D44 | The resume record carries `start: {runIndex, nextAnimalId}` | Ids carry across a restart, so a run reached by Play Again cannot be reproduced from seed and difficulty alone. The record must carry every input `createRun` consumes (§9). |
| D45 | The resume record is written whenever the player leaves the run, including quitting to Home | "Only on backgrounding" read literally means the feature never works for a player who quits instead (§9). |
| D42 | The 3-charge cap is justified as the recovery/reset dial, not as burst prevention | Bursting is already impossible — an ability is the turn's action — so the approved rationale credited the cap for the one-action rule's work, and framed as a failure mode the behaviour the owner asked for (§13.2a). |
| D43 | Last Stand: one charge on first entering the danger band, ignoring the cap, once per run | Charges come from clearing and a struggling player is not clearing, so the score ladder cannot reach the player who most needs help. Without it the assist mechanic is rich-get-richer (§13.2b). |
| D39 | Bands retuned down after the first bot measurement; ramp left alone deliberately | All three medians came in short. Bands are the first lever and moving two at once would make the next measurement unattributable (§5.6a). |
| D40 | No band's low may be below 2 | `k ≥ 1` means the minimum arrival is one animal, so a band under the difficulty's mean animal size cannot be delivered (§5.6a, AC-306b). |
| D41 | VoiceOver names species although the silhouette hides it | Parity is about what a player can act on, not about matching the quantity of information on screen (AC-902b). |
| D61 | **Hold the Line is withdrawn.** Its slot on the buffalo's card becomes **Stand Down** | The owner reports it is indistinguishable from Dart, and the measurement is harsher: it is the only arm with a negative p90 (−5%) at the second-highest price. The anti-buffalo ability belongs on the buffalo's card, and that card was Hold's (§13.2g). Largest departure from approved design in this pass — `open-questions.md` Q14. |
| D62 | **Stand Down: every buffalo loses all but one segment.** Shrink, not clear | Measured a factor of two apart: shrinking pays §6.4's premium **3.4× more often** (2.04 retirements a run against 0.60), clearing pays it **less** often than not using an ability at all (0.51), and clearing *one* buffalo for a whole reserve measures −7% at p90 (§13.2f). |
| D71 | **Stand Down leaves the charge economy. It is earned by breaking 10 buffalo segments through play.** | The owner made it the late-game balance lever, and charges cannot fund one: score per turn falls **33%** from mid-run to the last fifteen turns while buffalo segments broken per turn rise **48%**, and against a full roster a 3-charge ability measures **0.01 uses a run** — dropping it to 2 measures the same. The currency has to be generated by the problem it solves (§13.2f-ii). |
| D72 | **The meter is 10, stops at 10, and Stand Down's own shrinks do not fill it** | 10 fires once in a run that reached the late game and moves median run length by **+3%** — the buffalo become tractable without the curve flattening (cells at game over −21%, retirements 1.03 → 3.79). Banking a second use would be a reset rather than a recovery, and would create the one hoarding incentive §13.2f-iii cannot argue away (§13.2f-ii, §13.2f-v). |
| D73 | **Nothing costs 3 charges any more, and the cap stays at 3** | The cap bounds how many turns of intervention you walk into a crisis holding, which is independent of whether anything is priced at its ceiling. A rung nobody can reach is worse than no rung (§13.2d). |
| D74 | **The silhouette follows the ramp in force, not the theme** | Third instance of the same hole: light theme + Night Savanna flies a bone shadow at **dE 63.80** over a ground whose faintest animal is 28.82 — a "shadow" 2.2× more prominent than any animal. §16.4's rule is restated over *everything* drawn on a board ground rather than enumerated per element, with an inventory a test can check (`ui.md` §16.6). |
| D63 | AC-1412b is **kept unamended** and bounded to removal | Both of its objections are objections to a *cheap removal*. Stand Down removes nothing, waives nothing, sits at the top of the price ladder and reaches only buffalo — so neither the scope ladder nor §6.4's premium is touched (§13.2f-i). |
| D64 | **Stampede 3 → 2** | The +194% that bought it the top price does not reproduce on this curve: +5% median, +51% p90, and *identical at both prices* because a one-ply bot cannot value a repack. The measurement that justified 3 is falsified, and the top rung now has a tenant that needs it (§13.2d). |
| D65 | **Dart stays at 1**, and the "move it to 2" pre-commitment is discharged | A bot that plays all three moves now measures Dart at +70% p90 — so the pre-commitment's trigger fired. At 2 it measures +6%/+11%, which would make it *the worst row at that price*: its value is volume, not power per use, and doubling the price halves the volume (§13.2d). |
| D66 | **Burrow's second lever is applied: remove one animal, then left-pack its row** | The revisit condition has now been met twice by two measurements on two curves, and the reprice did not fix it. At 1 charge the lever gives +26% median against the shipped +9%, which is right for the rung 34% of runs never leave (§13.2e). |
| D67 | **"At most one buffalo per row" is withdrawn** | True of two *full* buffalo only. 4 + 5 = 9 fits a 9-wide row exactly, and **15.2% of settled boards** have a doubled row, worst case **four** in one row (§6.4a). |
| D68 | **`CHAIN_GUARD_STEPS` 32 → 68, derived from the constants** | The mass floor per clear step is 2 cells, not 4, so the cascade bound is 67 — *above* the guard. A crash guard reachable by legal play can abort a legal resolution and discard the run's score (AC-504e). At 68 it proves what it claims again (§6.4b). |
| D69 | **The danger rows are part of the board theme, and the band is a ground** | A cosmetic supplying a ground supplied the cells and not the band, so Night Savanna repainted the ordinary rows and left the hazard in the base theme's colours. Two measured failures fell out of extending the rule, both pre-existing (`ui.md` §16.5). |
| D70 | Records shows **one dismissible line** explaining the merged bests | The number that changed is the one people remember, and a support email about a "lost" high score costs more than one line of copy. Q12's open half, decided (§9a). |
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
| D22 | **The three habitats are removed. One game, one curve.** | Our own measurement could not reliably distinguish them — the Meadow/Savanna ratio ranged 1.15–1.62 across ten blocks — and a picker asks the player a question when they have least information (§5.5b). Owner's decision. |
| D23 | **The buffalo cadence is the difficulty curve**: 12 × 3, then 10 × 3, then 8 for ever | Repurposes the three habitats' own `buffaloEvery` values from a choice into a progression; no new tuning (§5.5b). Owner's decision. |
| D24 | **D10 is overruled: multiple buffalo may share the board**, and none is ever suppressed | The one-at-a-time gate was the normal case, not a safety valve — 77% board occupancy suppressed 3.6 schedule firings a run and delivered 1.13 buffalo per run against a cadence of five (§5.4). Owner's decision. |
| D25 | The band ramp finishes at turn 13; the buffalo cadence starts tightening at turn 37 | Two escalating levers on one schedule make a pacing measurement unattributable (§5.7). Separated in time, each phase of a run has one dominant cause (§5.5b). |
| D26 | One weight table, fixed for the run — no drifting mix | The buffalo is the large-piece pressure; the drawn mix is the packing puzzle. A drifting mix would be a second lever doing the first one's job badly (§5.5b). |
| D27 | The species draw gets a carried-remainder bag of 12 | Independent draws let a species vanish for 88 consecutive draws while every aggregate check stayed green; a generator that can withhold a whole species for a whole run breaks §5.1's contract from the other side (§5.8). |
| D28 | Per-habitat records merge by taking the maximum | Resetting punishes the player for our decision; keeping three sets is a museum label for a concept we just deleted (§9a). |
| D29 | No population cap on buffalo | "Clear it as soon as possible" only means something if not trying has a cost that keeps growing. Caps of 2 and 3 are measured and recorded as the lever if the device round says hopeless rather than hard (§5.9, `open-questions.md` Q3). |

---

## 13. Layer D — Special abilities

**Status: shipped, played, and revised once on the owner's report.** The superseded status line said
*"numbers pending measurement"* — they are measured now, on this curve, and the roster was revised
after the owner played build 5. **§13.5 is the index to that revision**, §13.1 is the current roster,
§13.2d carries the pricing evidence, and §13.2c is kept as history rather than as specification.

The owner's framing: *"The game is all about increased entropy over time, where players can
use some helps. Score thresholds where players are able to use a special ability from any
animal of choice."*

That framing is worth building on, because it makes three existing systems pay for each
other: **score stops being only a record and becomes a currency**, the species set **gains a
second axis of meaning beyond size**, and a losing board becomes recoverable **by skill rather
than luck**. It is the first mechanic proposed that pushes back against the entropy the rest
of the game is built on — and a game that only ever gets worse needs something that does.

### 13.1 The five abilities

*(Revised after the owner played build 5 — see §13.5. Hold the Line is gone, Stampede is
repriced, Burrow gains its named second lever, and the buffalo's slot now holds the one thing
in the game that can move a buffalo.)*

| Species | Size | Ability | Effect | **Cost** |
|---|---:|---|---|---:|
| Rat 🐀 | 1 | **Burrow** | Remove one animal of your choice, then **left-pack the row it was in** | **1** |
| Fox 🦊 | 2 | **Dart** | This turn, make up to **three** moves instead of one | **1** |
| Elk 🦌 | 3 | **Migrate** | Remove **every** animal of one species you choose | **2** |
| Elephant 🐘 | 4 | **Stampede** | Left-pack every row, closing all gaps within each row, then gravity | **2** |
| Buffalo 🐃 | 5 | **Stand Down** | **Every buffalo on the board loses all but one segment** | **not charges — 10 broken segments** |

**Stand Down is not bought with charges.** It is bought with **the herd**: every buffalo segment
you break by completing a row fills one notch of a 10-notch meter, and a full meter spends itself.
§13.2f is why, and the reason is measured rather than aesthetic — the charge economy **cannot** fund
a late-game tool, because score per turn falls by a third in exactly the phase the tool is for.

**Costs are priced from measurement, not from size** — §13.2d. Scope scales with size; price
scales with measured value, and the two ladders deliberately do not agree.

**Scope scales with size, and the ordinal is "what nothing smaller can reach."** Rat acts on
one animal, fox on one turn's actions, elk on one species, elephant on the board's whole
layout, buffalo on **the one object the rules make permanent**. That last rung used to read
"time itself", which was Hold the Line's freeze; it now reads as the exception to every other
rule in the game, and that is a strictly larger reach than Migrate's, not a collision with it.
Migrate touches four species, none of which is the obstacle. Stand Down touches the one species
that is, and it is the only thing in the game other than a completed row that can.

The ordinal is deliberately **not** about cell count — Stampede touches all 135 cells and
changes nothing's identity, Stand Down touches at most 11 animals and changes what they are.
Reach is "what would otherwise be impossible", and a test asserts `scope` equals the species'
own size so the claim stays a number rather than a sentence.

Notes on the ones that need them. **Stampede does not complete rows** — a row with seven cells
occupied still has seven after packing — it consolidates fragmented gaps into one usable gap
per row, which is a large help without being a win button. **Stand Down does not clear a
buffalo and does not score** (§13.2f): the buffalo stays on the board, still refuses to clear,
and must still be retired by completing its row. It changes the price of a buffalo from five
row completions to one; it does not waive the bill.

**Abilities are always available.** They are not gated on that species being on the board.
"From any animal of choice" reads as *choose whichever ability you want*, and gating would
mean sometimes being unable to use the one you need. The alternative is in `open-questions.md`.

### 13.2 The economy

**Charges are earned by crossing score thresholds, and spending one costs no score.** This is
the ruling that protects the existing model. §7.4 says score rewards packing skill and nothing
else; if spending *deducted* score, the leaderboard would reward never using the system, and
the best scores would come from ignoring the mechanic. **Thresholds are gates, not purchases.**
Your score never goes down.

- Charges accumulate; **at most 3 may be held** — see §13.2a for why 3, and why the reason I
  first gave for it was wrong.
- Thresholds **escalate**, so early charges teach the system and late ones are earned. They
  are **priced from measured score percentiles, per difficulty** — the full ladder is §13.2c.
- **Using an ability is your action for the turn** — move, pass, or ability. The one-action
  rule (§6.2) is a Layer F invariant and abilities do not get an exemption. Fox's Dart is
  consistent with this: your action *is* the ability, and the ability happens to be moves.
- **Clears caused by an ability score normally.** The feedback loop — ability → clears → score
  → charge — is bounded by the escalating thresholds and the 3-charge cap. A player who uses
  Stampede to set up a triple clear has done exactly what score is for.

### 13.2a Why the cap is 3 — and a correction

The approved text said the cap existed *"so they cannot be hoarded and dumped."* **That
rationale was wrong, and it also contradicted the owner's reason for wanting accumulation at
all** — *"so that the players can save up abilities for dangerous situations"*, which is
hoarding, deployed at the moment of need. Same behaviour, called the failure mode in one
document and the point in the other.

**Dumping is already impossible, and not because of the cap.** An ability *is* your action for
the turn (§13.2, two bullets below the one that claimed otherwise). A player holding three
charges can spend **one per turn**, so three charges are three turns of intervention spread
across at least three turns. There is no burst to prevent. The one-action rule does that job,
and the cap was being credited for it.

**What the cap actually bounds is the size of the reserve** — how many turns of intervention
you may walk into a crisis already holding. Three is chosen against the owner's intent, not
against a risk:

- **Three is a genuine rescue.** *(Revised for §13.1's roster.)* One Stand Down to break the
  herd, or Stampede plus a Burrow to repack and then pick a hole, or three Burrows spent on
  three rows — any of those takes a nearly-dead board back to playable. A reserve that cannot
  save you is not a reserve, and "save up for dangerous situations" requires that saving up be
  *worth* it. Measured, the strongest single play a full reserve can buy takes buffalo cells at
  game over from 17.9 to 14.3 and retirements from 0.60 to 2.04 (§13.2f-ii).
- **Four begins to be a reset.** Past three, the reserve stops being a recovery from a bad
  position and becomes an undo of it, which removes the consequence of having played badly —
  and the player holding four has, by construction, been clearing well enough not to need
  them.
- **Saturation is a feature, not a side effect.** At three, the ladder pauses (below), and the
  game is saying *you have enough help — go use some*. That is the right pressure for an
  assist mechanic: it should push you to spend, not to admire the stack.

**For a future reader deciding whether to move it:** the cap is the dial between *recovery*
and *reset*. **Raise it only if measurement shows crises are routinely unsurvivable with three
charges in hand; lower it only if runs are routinely rescued from positions that should have
ended.** Do not move it to prevent bursting — bursting is not possible.

**The ladder pauses at the cap; charges are never lost.** Crossing a threshold while holding
three does not waste it: the ladder stops advancing and the next charge arrives the moment a
slot frees. Losing progress for banking would punish exactly the behaviour the owner asked
for. Score keeps accumulating for the record throughout — it simply stops buying charges
while you are full, which is the pressure described above.

### 13.2b The Last Stand charge — fixing a rich-get-richer curve

**Charges come from clearing, and a player in trouble is by definition not clearing well.**
So the economy as approved helps the player who banked early and reaches a crisis with three
in hand, and does nothing for the player who has struggled all run and reaches the danger band
with none. That is a rich-get-richer curve on **the one mechanic intended to soften entropy**,
and the owner's framing — *"players can use some helps"* — is assistive language that asks for
the opposite.

This is a defect in the economy rather than in its wording, so it gets a fix:

> **Last Stand.** The first time in a run that any animal enters the danger band (row 11 or
> above), **one charge is granted immediately** — regardless of score, and **regardless of the
> cap**. Once per run.

- **It fires exactly when help is needed**, which is what "a dangerous situation" means, and it
  is the only grant in the economy that does not ask how well you have been playing.
- **It cannot be farmed.** Entering the danger band means being one to three rows from death;
  doing it deliberately to collect a single once-per-run charge is a terrible trade, and the
  danger is real whether or not the charge was the motive.
- **It ignores the cap deliberately**, so the grant always does something. That gives the cap
  a cleaner story than it had: **three is what you can bank by playing well, and the fourth
  exists only because you are in trouble.**
- It does not threaten §13.3's guarantee. One extra charge per run does not make the economy
  less self-limiting.
- Resume needs nothing new: whether Last Stand has fired is reconstructible from the replay,
  since the engine knows when the band was first entered.

### 13.2c The threshold ladder — priced *(SUPERSEDED by §5.9 and §13.2h)*

> **This section is kept as history, not as specification.** It prices three ladders against
> three habitats, and the habitats are gone (§5.5b). The shipped ladder is **one** array —
> `[1700, 2300, 3600, 5800, 9200, 13900]` — derived in §5.9 and re-confirmed unchanged by
> §13.2h. Everything below about *how* a rung is priced (a percentile of the measured
> abilities-off distribution, re-derived on a retune rather than stranded) is still the rule.

Measured over 300 bot runs per difficulty on the shipped bands. **Each charge is a percentile
of that difficulty's own final-score distribution**, so a retune re-derives the ladder rather
than stranding it (AC-1405b).

| charge | percentile | **Meadow** | **Savanna** | **Tundra** |
|---|---|---:|---:|---:|
| 1 | p35 | 2,100 | 1,200 | 600 |
| 2 | p50 | 2,600 | 1,550 | 840 |
| 3 | p75 | 4,500 | 2,550 | 1,500 |
| 4 | p90 | 6,100 | 3,500 | 2,250 |
| 5 | p90 × 1.6 | 9,800 | 5,600 | 3,600 |
| 6 | p90 × 2.4 | 14,700 | 8,400 | 5,400 |

*Absolute figures as of the 300-seed measurement on the shipped bands. Charges 5–6 extrapolate
past the measured range because p90 is the last percentile with enough runs behind it to be
worth quoting.*

**What the ladder produces, by design:**

- A **median run earns two charges** (p35, p50), plus Last Stand if it reaches the danger
  band — so a typical run uses the mechanic two or three times and never bumps the cap.
- A **p90 run earns four** and therefore **must spend to keep earning**, which is exactly the
  pressure §13.2a describes. Saturation is reachable by good play and unreachable by average
  play, which is the right way round.
- **Six charges is near the observed maximum** — Tundra's best run across 900 was 5,930 against
  a sixth charge at 5,400 — so the top of the ladder is a genuine rarity rather than dead
  content.
- Charges 1 and 2 are **deliberately close**; the gaps then widen sharply. Early charges exist
  to teach the mechanic, and a player who has never seen an ability fire cannot plan around
  one.

**Three ladders, not one.** The medians are 2,655 / 1,580 / 860 — ratios of **1.68 and 1.84**.
That is much closer than the 4.7× AC-1405b recorded when the only data came from the
pre-retune bands, but it is still far too wide to share a ladder: a single table priced for
Meadow would put the first charge beyond a median Tundra run entirely.

### 13.2d Abilities cost different amounts — priced from measurement

**The diagnosis is about price, so the fix is about price.** The original pricing was measured
on **Savanna**, over 120 identical seeds per arm, at one flat charge each:

| ability | species | scope | measured | cost then |
|---|---|---|---:|---:|
| **Stampede** | elephant | the board's layout | +194% | 3 |
| **Migrate** | elk | one species | +115% | 2 |
| **Hold the Line** | buffalo | time | +16% turns, +4% score | 2 |
| **Burrow** | rat | one animal | +11% | 1 |
| **Dart** | fox | one turn's actions | +8% (a floor) | 1 |

**Those numbers are superseded and one of them is falsified.** They were taken on the
three-habitat build, at **1.13 buffalo per run**. This curve delivers **5.45**, and the whole
shape of a board changed with it. §13.2da re-measures every arm on the shipped curve.

#### 13.2da The re-measurement, on this curve

200 identical seeds per arm. Two changes to the method, both of which matter:

- **The ability is offered to the bot as one more one-ply candidate**, taken only when the
  resulting board beats the best ordinary move. The old arms spent the charge the instant it
  was affordable, which measured charge *income* more than it measured the ability — at a flat
  cost of 1 the old policy fired Stampede **27.8 times a run**, which is not a use pattern any
  player has.
- **Each arm is priced at its candidate cost**, so charges are genuinely scarce and `uses/run`
  is a number about the economy rather than about the harness.

Control: abilities on, nothing spent. **Median score 2,312 · p90 6,165 · median 59 turns ·
0.60 buffalo retired per run · 17.9 buffalo cells still standing at game over.**

| ability | cost | uses/run | Δ median score | Δ p90 score | Δ turns | retired/run | buffalo cells at end |
|---|---:|---:|---:|---:|---:|---:|---:|
| **Burrow** *(+ left-pack)* | **1** | 2.98 | **+26%** | +23% | +20% | 0.79 | 19.4 (+9%) |
| **Dart** | **1** | 2.71 | +10% | **+70%** | +6% | 1.05 | 18.8 (+5%) |
| **Migrate** | **2** | 1.13 | +13% | +36% | +19% | 1.00 | 21.1 (+18%) |
| **Stampede** | **2** | 0.57 | +5% | +51% | +8% | 1.22 | 19.7 (+10%) |
| *Stand Down, priced at 3 charges — see below* | *3* | *0.55* | *+4%* | *+75%* | *+5%* | *2.04* | *14.3 (−20%)* |
| *Burrow, as it shipped* | *1* | *2.73* | *+9%* | *+12%* | *+12%* | *0.73* | *19.9* |
| *Hold the Line — withdrawn* | *2* | *0.98* | *+2%* | *−5%* | *+8%* | *0.60* | *18.4* |

**Two orderings, and they are almost inverted.** On Δ median per charge the order is Burrow,
Migrate, Stampede, Dart, Stand Down. On Δ p90 per charge it is Stand Down, Stampede, Dart,
Migrate, Burrow. That is not noise and it is not a defect:

> **The cheap abilities pay a median player. The dear ones pay a p90 player.**

Which is the correct shape for an economy whose income scales with score, and it is the honest
answer to *"3 points is a little bit costly"*: **a 3-charge ability is a p90 instrument by
construction.** §13.2f measures exactly how few players reach it and names the lever.

#### What moved, and why

**Stampede 3 → 2.** The +194% that bought it the top price **does not reproduce**: on this
curve it measures +5% median and +51% p90, and it measures *identically at cost 2 and cost 3*
because the binding constraint on a one-ply bot is usefulness rather than affordability. That
caveat cuts both ways and I am not claiming Stampede is weak — a one-ply search cannot value a
repack it will only cash in two turns later, the same blindness §13.2d already conceded for
Dart. What I am claiming is narrower and sufficient: **the specific measurement that justified
3 has been falsified, the argument that Stampede "made the other four irrelevant" is no longer
true of any column in the table, and the top rung now has a tenant that needs it.** At 2,
Stampede sits beside Migrate (+13%/+36% against +5%/+51%) — different jobs, comparable worth.

**Dart stays at 1, and the pre-commitment is discharged rather than ignored.** The superseded
text promised that *"if human play shows Dart is strong, it moves to 2 before anything else
changes"*, and a bot that actually plays out all three moves now shows it is: +70% at p90, the
second-best in the table, at the cheapest price. **It still stays at 1**, for a reason the
pre-commitment could not have known: repricing it to 2 puts it at +6% median and +11% p90 —
which would make Dart *the worst row at that price*, recreating in one move the exact defect
§13.2d was written to fix. Dart's value comes from **volume** (2.71 uses a run), not from power
per use, and doubling its price halves the volume and throws away the value. The spread at rung
1 is now 3× (Burrow's +23% p90 against Dart's +70%), against the 8× §13.2d accepted across the
whole set.

**Burrow gains its second lever** — §13.2e's condition was already met and the re-measurement
met it again. See §13.2e.

#### 13.2db The arm table measures one ability at a time, and that is its limit

Every row above was measured with **that ability alone** available. That is the right way to
price an ability against a control and the wrong way to ask whether a player will ever pick it.
Re-measured with the **whole roster** available and every ability offered to the bot as a
candidate, 200 seeds:

| roster | uses/run, per ability | median | p90 | turns |
|---|---|---:|---:|---:|
| Burrow 1, Dart 1, Migrate 2, Stampede 2, **Stand Down 3** | burrow **1.51**, dart **1.41**, migrate 0.08, stampede 0.00, **standDown 0.01** | 2,962 | 9,435 | 68 |
| the same with **Stand Down at 2** | burrow 1.51, dart 1.40, migrate 0.08, **standDown 0.01** | 2,962 | 9,765 | 68 |

> **Priced in charges, Stand Down is never taken — 0.01 times a run — and dropping it to 2 does
> not change that.**

Two things cause it and only one of them is the bot:

- **A 3-cost ability competes with three 1-cost purchases for a reserve that refills slowly.** The
  bot spends on Burrow and Dart the moment it can and therefore never banks to 3. A human would bank
  deliberately — but *deliberately refusing help for ten turns to afford the late-game lever* is
  exactly the feeling the owner reported about Stampede at 3.
- **A one-ply search cannot value Stand Down**, whose payoff is *"every buffalo is now one completion
  from +650"* — two or more turns away. Same blindness as Stampede's. So 0.01 is a floor, not a
  verdict, and the single-ability arm (+75% p90, 2.04 retirements) is the honest measure of the
  *effect*.

**Both point the same way, and neither is fixed by a price.** §13.2f prices it in a different
currency instead.

#### The reserve, after the repricing

```
1 charge   Burrow, Dart
2 charges  + Migrate, Stampede
3 charges  Stampede and change, or three Burrows
```

**Nothing costs 3 any more, and that is deliberate.** The superseded ladder had Stampede alone at 3
and Hold the Line as a trap at 2; this one has no trap and no unreachable top. The cap stays at 3
(§13.2a) because it still bounds how many turns of intervention you may walk into a crisis holding —
and Stand Down's absence from this ladder is the point of §13.2f, not an omission from it.

### 13.2e Burrow — the revisit condition is already met

AC-1412c said that if Burrow proved dead weight without the buffalo, the fix was to strengthen
Burrow rather than let it eat the buffalo. **The measurement met that condition on evidence
that predates the ruling** — Burrow reached only +11% *with* the buffalo in its target set, so
it was never the buffalo carrying it. The tester's summary is the right one: *"the row you
pick once and never again."*

Two findings, and they are separable:

1. **Excluding the buffalo cost nothing.** 1,640 with it against 1,680 without, which is
   noise. The semantics ruling in AC-1412b was free, which is the best available outcome for
   an argument made on consistency rather than on balance.
2. **Burrow is weak on its own terms**, and repricing it to 1 charge does not fix that — at 11
   per charge it is still the worst in the set.

**So repricing was the first lever and not the last.** One change was applied and the second
was named rather than doing both, because two simultaneous changes make the next measurement
unattributable — the discipline §5.7 sets and that §5.6b was written for ignoring.

> **If Burrow is still the least-picked ability at 1 charge in human play, it gains gap
> closing: *remove one animal, and left-pack the row it was in.*** That is Stampede's effect —
> the one the measurement shows is most valuable — at the smallest possible scope, one row of
> the player's choosing. Precision against breadth, which is what rat against elephant should
> mean.

**A caveat on Burrow's number that the tester's does not cover.** A one-ply bot evaluates
*"what does removing this animal gain me now"* perfectly and *"what does removing this animal
let me set up in two turns"* not at all. That is the same blindness the tester correctly
identifies for Dart, and it may understate Burrow too. It is not a reason to ignore +11%, but
it is a reason to weigh human play more heavily than the sweep before applying the second
lever.

#### 13.2e · THE SECOND LEVER IS NOW APPLIED

The condition has been met **a second time, on a second curve, by a second measurement**, and
the reprice did not fix it: at 1 charge on this curve, Burrow-as-shipped is **+9% median and
+12% p90** — still last in the set on both, and still *"the row you pick once and never
again."* One reprice, one re-measurement, one lever each: the ordering discipline is satisfied.

> **Burrow is now: remove one animal of your choice, then left-pack the row it was in.**

Measured at 1 charge, 200 seeds: **+26% median, +23% p90, 2.98 uses per run.** That is the
highest *median* delta in the set at the lowest price, which is exactly right for the rung that
34% of runs never leave (§13.2f). It does not threaten anything above it — at 2 charges the
same effect collapses to +11% median and **−7% p90**, because its value is volume, so it is
priced at 1 and can only ever be priced at 1.

**Three things it deliberately does not become.**

- **Not a second Stampede.** One row, of the player's choosing, and only the row the removed
  animal was standing in. A player who wants a different row must spend a different charge.
- **Not a row-completer.** Left-packing a row is a permutation of that row's occupancy
  (AC-1411's argument, applied to one row): a row that was two cells short is two cells short
  afterwards. Burrow's *removal* is what changes occupancy, and it changes it by exactly one
  animal, as it always did.
- **Not a buffalo tool.** The row it packs may contain a buffalo, and the buffalo packs with it
  like any other body — its `x` may move, its `size` may not. AC-1412b is untouched: Burrow
  still cannot target a buffalo and still cannot remove one.

### 13.2f Stand Down — the buffalo's own counter

**The owner, after build 5:** *"We need to have a mean to deal with buffalo, probably 3 points
ability is for that. Either clear them or shrink them to 1."* And then, on what it is for: *"yea,
having a solution to deal with buffalo is a way I think to balance the late game."*

> **Stand Down.** Every buffalo on the board loses all but one segment: each buffalo's `size`
> becomes **1**, its `x` unchanged. Gravity then settles as it does after any action. No buffalo is
> removed, nothing is retired, and **no score is awarded** (§13.2f-iv).
>
> **It costs no charge.** It is earned by breaking **10 buffalo segments** through play, on a meter
> the herd itself fills (§13.2f-ii).

**Two decisions, and both are measured rather than argued.** §13.2f-ii is the price — *why the
charge economy cannot fund a late-game tool at any price*. This section is the effect: **shrink, not
clear**, and they are not alternatives but a factor of two apart. The owner offered both; over 200
identical seeds they separate decisively:

| the effect, measured at a fixed price | Δ median | Δ p90 | **buffalo retired / run** | buffalo cells at game over |
|---|---:|---:|---:|---:|
| control (nothing spent) | — | — | 0.60 | 17.9 |
| **shrink every buffalo to 1** | +4% | **+75%** | **2.04** | 14.3 (−20%) |
| clear every buffalo | +6% | +2% | **0.51** | 13.5 (−25%) |
| clear one buffalo | −0% | −7% | 0.61 | 16.8 (−6%) |

**Clearing them forfeits §6.4's premium and the measurement shows it going backwards.**
Retirements *fall below control* — 0.51 against 0.60 — because a buffalo deleted is a buffalo
that can never be retired, and the +650 goes with it. It clears the board a little better and
pays 2% at p90 against shrink's 75%. **Clearing one buffalo for three charges is actively bad
play**: −7% at p90, which is what spending your entire reserve to delete one +650 looks like.

So: **shrink to 1.** The owner's instinct held and their own second option was the better one.

#### 13.2f-i Why this does not overrule AC-1412b

AC-1412b forbids any ability reaching the buffalo, on two grounds. Read closely, **both are
objections to *removal*, and both are priced in charges** — which is why a 3-charge shrink
threads them rather than breaking them.

| AC-1412b's objection | Why Stand Down does not raise it |
|---|---|
| *"If rat's one animal may be the largest obstacle in the game, the weakest ability quietly becomes the strongest single play"* — **the scope ladder inverts** | Stand Down is not the weakest ability. It is the **buffalo's own**, at scope 5, at the **top of the price ladder**, and it reaches **nothing but buffalo**. The ladder is not inverted; it is completed — the one rung whose object nothing else could touch now has an ability that touches it, and it costs the most. Burrow still cannot target a buffalo and still cannot remove one. |
| *"The buffalo is worth 900 against 500 for five clean rows **because** you commit to it. One charge that deletes it makes taking the premium optional and never costly"* — **the premium stops being a decision** | Stand Down **removes nothing and waives nothing.** The buffalo stays on the board, still refuses to clear, still has to be retired by completing its row, and still pays +650 when it is. The commitment is reduced from five completions to one; it is not skipped. The measurement is the proof: the premium gets **paid 3.4× more often** with Stand Down than without it (2.04 retirements against 0.60), where clearing them pays it **less** often (0.51). An ability that makes a premium get collected is not an ability that makes it optional. |

**So AC-1412b survives unamended in its own terms and gains a stated boundary:** the rule is
*no ability **removes** a buffalo*, and it is per-object. Stand Down is the one ability that may
**change** one, and it changes the only field of it that the rules already change — `size`, by
the only mechanism the rules already use, a decrement. It does not invent a new relationship
with the buffalo; it buys the one the game already has, in bulk, once.

#### 13.2f-ii It is not bought with charges. It is bought with the herd.

**The owner has given this ability a job:** *"yea, having a solution to deal with buffalo is a way I
think to balance the late game."* That is them choosing a **tool** over a population cap, having
already refused a cap with the worst case in front of them — and the reasoning is right. A cap is
the game protecting the player, so past the third buffalo ignoring them stops costing anything, and
*"clear it as soon as possible"* means nothing. A tool keeps the ratchet and makes spending against
it a decision.

**Which is exactly why it cannot be priced in charges.** Charges are earned by score and score is
earned by clearing rows, and *the late game is the phase in which the player stops clearing rows* —
that is what makes it the late game. Measured over 262 runs of 40+ turns:

| phase of the run | clearing turns | **score per turn** | locked buffalo segments |
|---|---:|---:|---:|
| first 15 turns | 25.6% | 38 | 0.9 |
| the middle | 38.2% | **51** | 5.8 |
| **last 15 turns** | 29.8% | **34** | **11.2** |

**Score per turn falls 33% from the middle of a run to its last fifteen turns, while the herd's
locked load doubles.** So a charge-priced anti-buffalo tool is at its dearest, in real terms, at the
exact moment the owner wants it used. §13.2db then shows the other half: even when it *is*
affordable, a 3-cost ability never gets taken over three 1-cost ones — **0.01 uses a run.**

Repricing does not fix either half. **A different currency does**, and the buffalo is holding it:

> **Stand Down is earned, not bought. Every buffalo segment broken by a completed row fills one
> notch of a 10-notch meter. At 10, Stand Down is available and costs no charge; using it empties
> the meter.** Only play fills it — Stand Down's own shrinks never do, or it would refill itself.

**The currency is generated by the problem it solves, which is the whole argument.** Measured over
the same 262 runs, the two currencies move in **opposite directions** across a run:

| | early half | late half | change |
|---|---:|---:|---:|
| **score** per turn | 38 → 51 (peak) | **34** | **−33%** from the peak |
| **buffalo segments broken** per turn | 0.128 | **0.189** | **+48%** |

A board crowded with buffalo is a board where most completed rows contain one, so **the meter fills
faster the worse the board gets.** That is the exact property the score ladder lacks, and it is why
this is a second currency rather than a discount on the first.

**Why 10.** Measured with the full roster available, 200 seeds, against a control of median 2,962 /
p90 9,435 / 68 turns / 1.03 buffalo retired / 20.1 buffalo cells standing at game over:

| meter | uses/run | Δ median | Δ p90 | **Δ turns** | retired/run | cells at end |
|---:|---:|---:|---:|---:|---:|---:|
| 9 | 1.13 | +24% | +99% | **+6%** | 3.93 | 14.9 (−26%) |
| **10** | **0.98** | **+11%** | **+97%** | **+3%** | **3.79** | **15.8 (−21%)** |
| 11 | 0.81 | +2% | +89% | +3% | 3.37 | 16.7 |
| 12 | 0.69 | +2% | +67% | **0%** | 3.04 | 16.7 (−17%) |
| 16 | 0.42 | 0% | +72% | 0% | 2.48 | 18.1 |
| *priced at 3 charges instead* | *0.01* | *0%* | *0%* | *0%* | *1.05* | *20.1* |

**10 fires once in a run that reached the late game, and barely moves how long a run lasts.** Median
run length goes 68 → 70, **+3%** — so the tool is not a survivability handout; what it moves is the
buffalo specifically, taking cells still standing at game over down **21%** and retirements up from
1.03 to **3.79**. p90 nearly doubles. That is *survivable by skilful play, not flat*: the average
game is the same length, the buffalo become tractable, and the skilled run is rewarded.

**And 10 has a symmetry worth stating rather than a round-number defence:** the median run's worst
herd locks **13** segments (§5.9). So a median run's own buffalo debt pays for **exactly one** Stand
Down, with change. The herd charges you thirteen and hands you the tool at ten.

> **The levers, named in advance.** Too dear → **9** (1.13 uses, +6% turns). Too generous → **12**
> (0.69 uses, **0%** turns, cells still −17%). Do not reach for a charge price: §13.2db measured
> both 3 and 2 at **0.01 uses a run**.

#### 13.2f-ii-b Does it reach the drowning player, or only the one doing well?

**This is the question a charge price failed.** Bucketing 300 runs by the worst herd they ever
carried, and asking whether the tool was available to them:

| peak locked segments | runs | **meter fires ≥ once** | charges ≥ 3 at the crisis *(the superseded model)* | median lifetime charges |
|---:|---:|---:|---:|---:|
| 5–9 | 56 | **13%** | 8% | 1 |
| **10–14** *(the modal crisis)* | **175** | **26%** | **34%** | **2** |
| 15–19 | 63 | **24%** | 81% | 3 |
| 20+ | 6 | **33%** | 100% | 4 |

**Read the shape, not the level.** Charge availability climbs 8 → 34 → 81 → 100%: it concentrates
the tool in the runs that need it least. The meter runs 13 → 26 → 24 → 33%: **flat to rising,
because it does not ask how well you have been scoring.** That is Last Stand's principle
(§13.2b, AC-1408e) expressed as a currency instead of as a one-off grant — and unlike Last Stand it
is not capped at once per run, because the buffalo are not capped either.

*(The levels in that column are measured with Stand Down as the **only** ability available, so runs
are shorter and the meter fills less often than in the full-roster measurement above; 0.33 uses a run
there against 0.98. The comparison between columns is the finding; the absolute level is the
roster-free floor.)*

#### 13.2f-iii It does not reward hoarding buffalo, and that was measured before it was claimed

The obvious objection, and the meter makes it sharper than a charge price did: an ability whose
value scales with the herd, **paid for by the herd**, looks like it teaches the player to *let the
herd grow* — the exact opposite of the owner's *"the player need to try to clear it as soon as
possible."*

**It does not, and the meter is the reason.** The meter fills **only from segments broken through
play**. A player who lets the herd grow and does not grind it is a player whose meter does not fill:
**ignoring buffalo is the one strategy that cannot buy the anti-buffalo tool.** The currency is not
the herd's *size*, it is the *work already done against it* — which is "as soon as possible" written
as an economy rather than as an instruction.

Measured, 200 seeds, varying the size of herd a policy waits for before firing:

| fires when ≥ n buffalo have segments to lose | uses/run | segments per use | Δ p90 score | buffalo cells at end |
|---:|---:|---:|---:|---:|
| **1** (fire at the first opportunity) | 0.63 | 9.9 | **+79%** | 13.8 |
| 2 | 0.63 | 10.0 | +80% | 13.9 |
| 3 | 0.63 | 10.8 | +80% | 13.7 |
| 5 | 0.47 | 13.5 | +52% | 13.7 |
| 7 | 0.15 | 16.8 | +41% | 16.1 |

**Waiting converts more per use and scores less.** At a gate of 7 it converts 70% more segments
each time and gives up half the p90 gain, and the ratchet barely moves (16.1 against 13.8). The
second reason is structural and needs no balancing: the run ends when it ends, so **a run spent
waiting for an eleven-buffalo board is a run that ends on an eleven-buffalo board.** The greedy read
— fire it when it helps — is also the correct one.

*(That table was measured against the superseded charge price. It is kept because the property it
tests — does waiting pay? — belongs to the **effect** rather than to the price, and the meter can
only strengthen the answer: under the meter, waiting also stops the currency arriving.)*

#### 13.2f-iv Four rules the implementation must not get wrong

1. **It scores nothing.** Not +50 per segment, not +650 per buffalo, not anything. AC-1403 says
   spending costs no score; this says spending *earns* none either. The shrink path inside
   `resolveClears` pays 50 a segment because it was bought with a completed row; a button is not
   a completed row, and wiring Stand Down through that path would pay up to 500 for one tap.
2. **A buffalo already at size 1 is untouched**, and is not a reason to refuse the ability.
3. **With no buffalo on the board the ability is unavailable** — the sheet row is disabled with the
   reason shown and an armed use is rejected. **The meter is not emptied**, which is AC-1414's rule
   in the second currency: a full meter that evaporates for nothing is the opposite of an assist.
4. **It is the turn's action**, like every other ability (AC-1406). Gravity settles, the arrival
   lands, the board is judged. Freeing up to 44 cells in one ACTION phase is the largest single
   structural change the engine can be asked to make, and it resolves through exactly the same
   SETTLE → ARRIVAL → JUDGE path as a one-cell drag.

#### 13.2f-v The meter, specified

| | |
|---|---|
| **unit** | one buffalo **segment** removed by a completed row — the same event that pays +50 (§7.2) and the same event `stats.buffaloShrinks` already counts |
| **full at** | **10**. `STAND_DOWN_SEGMENTS`, and it joins `TUNING_SURFACE` |
| **a retirement** | a buffalo going from size 1 to retired is **one** segment and fills **one** notch. It is the last segment, not a bonus |
| **Stand Down's own shrinks** | fill **nothing**. Otherwise the ability refills itself and the meter is not a cost |
| **spending** | using Stand Down empties the meter to **0**. It does not carry a remainder |
| **overflow** | the meter **stops at 10** and does not bank past it. A player sitting on a full meter is a player the game is telling to use it, which is §13.2a's saturation pressure applied to the second currency |
| **persistence** | reconstructed by replay like everything else (§13.4a). `buffaloShrinks` is already in the event stream, so nothing new is stored |
| **no buffalo on the board** | the meter still fills and still holds; the **ability** is unavailable because it has no target (§13.2f-iv rule 3) |

**Why the meter stops at 10 rather than banking two uses.** A banked second use is a reset rather
than a recovery — §13.2a's dial, applied to the second currency, and the same reasoning that caps
charges at 3. It also removes the only version of the hoarding incentive §13.2f-iii could not
argue away: if the meter banked, a player would have a reason to grind buffalo *without spending*,
and grinding without spending is the behaviour that leaves the board locked.

#### 13.2f-vi Two currencies, and why that is a simplification rather than an addition

The economy now has two, and they do not touch:

| | **charges** | **the meter** |
|---|---|---|
| earned by | crossing score thresholds; plus Last Stand | breaking buffalo segments by play |
| earned fastest | mid-run, when clearing is easiest | **late**, when the board is crowded (+48% per turn) |
| buys | Burrow, Dart, Migrate, Stampede | Stand Down, and nothing else |
| held | 3, plus a crisis slot | 10 notches, no bank |
| the problem it answers | *"I cannot see a move"* | *"the herd has taken the board"* |

**One currency was doing two jobs badly.** The score ladder is a fine instrument for *"help me play
better"* — it rewards the clearing it is earned by, and §13.2's ruling that spending costs no score
keeps the leaderboard honest. It is the wrong instrument for *"help me with the thing that is
stopping me clearing"*, because it is downstream of the blockage. Splitting them means neither has
to compromise: the charge ladder does not need a special rung, Stand Down does not need a price, and
the two never compete for the same reserve — which is what §13.2db measured going wrong.

**What it costs.** One new constant, one new HUD element on a strip that already exists (`ui.md`
§7.1), and a second thing for a new player to learn. The last is real, and it is paid for by the
onboarding beat that already teaches the buffalo: the meter is taught by the same board that teaches
what a buffalo is, because it is the same fact — *breaking a buffalo is progress, and it is counted.*

### 13.2g Hold the Line is withdrawn

**The owner:** *"`Hold the line` and `Dart` are basically the same thing."*

**They are right about the feel, and the mechanisms really are different.** Dart keeps the turn
open: the turn number, the streak, the queue and the PRNG all stand still while the board and
the score move (`engine.js:445-457`). Hold suppressed the arrival on N turns that otherwise ran
normally (`frozen`, `engine.js:180`). But over the window a player experiences them in, the
ratio they change is the same one:

| | moves | arrivals | turns |
|---|---:|---:|---:|
| an ordinary turn, ×3 | 3 | 3 | 3 |
| **Dart** | 3 | 1 | 1 |
| **Hold the Line** | 3 | 0 | 3 |

**Both are "board work without the board filling", and one cost 1 while the other cost 2** — so
the dearer one looked strictly worse unless the difference was legible, and the owner reports it
is not. The measurement agrees and is blunter than the owner was: Hold is the **only arm in the
table with a negative p90** (−5%), at the second-highest price, and the sweep that was built to
defend it found it spends 0.98 charges a run to achieve +2% median.

**So it is Hold that goes, and the choice between the two is structurally forced rather than a
judgement about which I liked more.** The anti-buffalo ability belongs on the buffalo's card —
the buffalo is the obstacle, so the buffalo's ability should be the thing that moves it — and
the buffalo's card is the one Hold was on. Dart survives on its own merits besides: it is the
one ability that does nothing *for* the player and instead lets them do more, so its ceiling
rises with skill, and a one-ply bot that plays all three moves already measures it second-best
at p90.

**Recorded honestly: Hold the Line was the owner's own first example of an ability** (§13.1 said
so), and deleting it is the largest departure from approved design in this pass. It is
`open-questions.md` **Q14** for that reason, with my recommendation being to delete it.

**What goes with it, and it is a real simplification.** `HOLD_TURNS`, the `frozen` state, the
`arrivalSkipped` branch in ADVANCE (`engine.js:400`), the tray's second state (`FROZEN · n`,
`frozenLabel`, `FROZEN_STRIP_OPACITY`, `trayStripOpacity`), `format.js`'s frozen accessibility
sentence, and `AC-1410`/`1410b`/`1410c`/`1410d` in their entirety. After it, **nothing in the
game can suppress an arrival** — which makes §5.5b's *"there is nothing left that can suppress a
scheduled buffalo"* true of the abilities too, and turns §13.3's self-limiting argument from a
piece of reasoning into a structural fact. The tray has one state again.

**One loss to name:** a frozen turn used to skip a scheduled buffalo outright (§6.4a), so Hold
was a weak, prospective anti-buffalo tool. Stand Down replaces a prospective one with a
retrospective one, which is the right way round — the buffalo the player needs help with is the
one already standing on their board, not the one on the countdown.

### 13.3 What it does to the difficulty curve

§5.5's ramp guarantees every run ends, and **Hold the Line was the only ability that attacked
that guarantee.** With Hold withdrawn (§13.2g) the guarantee stops needing an argument:

> **No ability can suppress an arrival.** Every turn, however it is spent, delivers its batch.
> The economy's self-limiting property — charges come from score, score from clearing, clearing
> from arrivals — is now a *consequence* of that rather than a defence against a counterexample.

The measurement is still worth keeping, because it is what retires the worry rather than
restating it: with every remaining ability available and a policy that spends everything it
earns, **zero of 200 runs per arm failed to end**, and the longest arm moved the median run from
59 turns to 62 (+5%, Stand Down). **Runs still always end**, and now by construction.

**Stand Down is the ability a future reader will suspect of this**, so: it frees up to 44 cells at
once and moves median run length by **+3%** at its shipped 10-segment meter (68 → 70 turns). It buys
score, not time — §13.2f-ii.

The pacing ranges in **AC-318** are measured with abilities disabled. They describe the difficulty
curve, and a curve measured with an optional player-controlled intervention in it is not a
curve. Abilities get their own measurement (AC-1404).

### 13.4 Layer and dependencies

**Layer D, its own layer — and it stays a layer rather than becoming a numbered slice.** It
depends on Layer F (engine, scoring) and touches Layer A (charges must survive a resume). It
blocks nothing.

It shipped **out of order relative to slices 5 and 6, and that is the layer model working
rather than a problem with it.** Layers are defined by independence; a numbered slice implies
a sequence this work never had. The fact that the owner could pull it forward without
disturbing anything is the evidence that the boundary was drawn in the right place.

Resume is nearly free: `moves[]` already records one entry per turn (§9), so an ability use is
a third move type — `{ t: 'A', ability, target }` — and the replay reconstructs charges by
re-running the score. Nothing new is persisted.

### 13.4a What the revised roster costs stored runs

**Every stored resume written before this pass is discarded, and that is correct rather than
unfortunate.** `ABILITIES` and `HOLD_TURNS` are both members of `TUNING_SURFACE`
(`src/ui/session.js:101`), which is FNV-1a hashed into `ENGINE_VERSION`. Five of this pass's
changes touch it:

| change | in the fingerprint via |
|---|---|
| `hold` removed, `standDown` added | `ABILITIES` |
| `STAND_DOWN_SEGMENTS = 10` added | a new member of the surface |
| `stampede.cost` 3 → 2 | `ABILITIES` |
| Burrow's effect gains the left-pack | `ABILITIES` *(a `packs: true` field — see below)* |
| `HOLD_TURNS` deleted | the surface loses a member |
| `CHAIN_GUARD_STEPS` 32 → 68 (§6.4b) | `CHAIN_GUARD_STEPS` |

So `ENGINE_VERSION` changes, and AC-1016 discards every stored resume without replaying it.
**That is the only correct outcome**: a replay of `{seed, moves[]}` under this roster rebuilds a
different board from the same inputs — a stored `{t:'A', ability:'hold'}` names an ability that
no longer exists, and a stored `{t:'A', ability:'stampede'}` replays into a different charge
count. Same ruling as §5.10: **no migration, one interrupted run per player, silence.**

**The developer must not add a tolerant replay.** Skipping an unknown ability, or defaulting its
cost, is replaying a run under rules that did not produce it — the precise failure AC-1016
exists to prevent. The version check is the whole mechanism and it must stay the only one.

**Burrow's change must be visible to the fingerprint**, and a `cost` that did not move will not
make it so. `ABILITIES.burrow` therefore carries the behaviour as data — a `packs: true` field
alongside `scope`, `cost` and `target` — so the hash sees an effect change the way it already
sees a price change. A behaviour change invisible to `TUNING_SURFACE` is the one shape of this
bug the surface cannot catch, and §5.10's `ENGINE_REVISION` bump exists for exactly the cases
where that cannot be arranged. Here it can be, so it is.

**The save is untouched.** Records, lifetime totals, unlocks, the daily streak and settings are
a separate blob, and none of the four unlock conditions references an ability
(`src/ui/cosmetics.js:36-76`). No migration step is needed for this pass.

**The meter costs the resume nothing.** `stats.buffaloShrinks` is already folded from the event
stream (`engine.js:477`), and the meter is a function of that stream plus the turns Stand Down was
used on — both of which a replay reproduces. **Nothing new is persisted**, exactly as for charges
(AC-1416). The one thing the replay must get right is rule 2 of §13.2f-v: a shrink caused by Stand
Down does not fill the meter, so the fold has to distinguish a shrink that came from a completed row
from one that came from the ability. The event stream already carries the phase, so it can.

---

### 13.2h The threshold ladder does not move, and this is why

The natural worry about a repricing is that it strands the ladder. **It cannot, and the reason
is structural: AC-1404 requires the score distribution the ladder is priced from to be measured
with abilities *disabled*.** The ladder is therefore a function of the **curve**, not of the
roster. Pass 1 re-derived it because the curve moved (median score 2,655 → 2,325); nothing in
this pass touches a band, a weight, a phase or the scoring table.

Re-derived independently over 300 abilities-off seeds while checking this, and reproduced
exactly:

| rung | p35 | p50 | p75 | p90 | p90×1.6 | p90×2.4 |
|---|---:|---:|---:|---:|---:|---:|
| measured raw | 1,750 | 2,335 | 3,635 | 5,870 | — | — |
| **ladder, floored to 100** | **1,700** | **2,300** | **3,600** | **5,800** | **9,200** | **13,900** |

which is `ABILITY_THRESHOLDS` as it ships. **No change, and the confirmation is worth as much as
the change would have been.**

**What the income actually is, measured**, because §13.2f's pricing argument rests on it — rungs
crossed plus Last Stand, over the same 300 seeds:

| charges earned in a run | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---:|---:|---:|---:|---:|---:|---:|
| runs | 102 | 42 | 79 | 47 | 23 | 6 | 1 |

Median **3**, mean 2.56, p90 **5**. **52% of runs can afford a 3-charge ability at some point;
2% can afford two.** AC-1405e asked for "a median run earns two, a p90 run earns four" and the
curve delivers three and five — one rung generous of specification, in the player's favour, and
not worth retuning for.

---

## 13.5 The build-5 report, and what each half of it became

The owner played build 5 and reported three things. They are recorded here together because two
of the three turned out to be the same defect seen from different sides.

| what they said | what it was | where it went |
|---|---|---|
| *"`Hold the line` and `Dart` are basically the same thing"* | True of the felt effect, and the measurement is harsher than the report: Hold is the only arm with a **negative p90**, at the second-highest price | §13.2g — Hold withdrawn; the buffalo's slot freed |
| *"Stampede is good, but 3 points is a little bit costly"* | True, and the price rested on a **falsified** measurement: the +194% that bought it 3 was taken at 1.13 buffalo a run and measures +5%/+51% here | §13.2d — Stampede to 2 |
| *"We need to have a mean to deal with buffalo, probably 3 points ability is for that. Either clear them or shrink them to 1"* | The expected consequence of their own uncapped-herd decision (§5.9), not a reversal of it. Their two variants are **a factor of two apart** and the second is the better one | §13.2f — Stand Down, on the slot Hold vacated |
| *"yea, having a solution to deal with buffalo is a way I think to balance the late game"* | This makes it a **balance lever**, not a convenience — and a lever the charge economy **cannot fund**: score per turn falls 33% in the late game while buffalo work rises 48%, and a 3-cost ability measures **0.01 uses a run** against a full roster | §13.2f-ii — it leaves the charge economy for a meter the herd fills |

**The four fit together into one change rather than four patches**, and that is the reason to land
them at once: the redundancy freed the buffalo's slot, the anti-buffalo tool needed a currency, the
currency the roster had could not reach the late game, and the rung it would have sat on had a
tenant on a falsified price. Fixing any one alone leaves the roster worse shaped than fixing all
four.

**What this does not change.** The charge cap is still 3 (§13.2a), Last Stand is unchanged
(§13.2b), the threshold ladder is unchanged and does not need re-deriving (§13.2h), spending
still costs no score (§13.2), and an ability is still the turn's action.

**And the thing it does not do, because the owner chose against it twice:** there is still **no
population cap on buffalo** (§5.9, `open-questions.md` Q3). A cap is the game protecting the player,
so past the third buffalo ignoring them would stop costing anything and *"clear it as soon as
possible"* would mean nothing. A tool keeps the ratchet and makes spending against it a decision —
and the meter makes that decision sharper still, because the only way to earn the tool is to have
been doing the work.
