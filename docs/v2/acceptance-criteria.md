# Wildlife Shuffle v2 — Acceptance Criteria

Status: **for owner review.** Normative once approved.

**How to use this document.** Every criterion is numbered, independently observable, and
written so a tester can execute it without asking the designer a question. Developer and
tester both cite by number (`AC-312`). Where an AC exists because v1 got something wrong, the
`docs/v1-review.md` reference is given so the tester knows what regression to watch for.

**Grouping**

| Range | Area | Layer |
|---|---|---|
| AC-1xx | Board, layout, device fit | F |
| AC-2xx | Turn structure & rules engine | F |
| AC-3xx | Spawning & the preview contract | F |
| AC-4xx | Movement & input | F |
| AC-5xx | Clearing, chains, buffalo | F |
| AC-6xx | Scoring | F |
| AC-7xx | Run lifecycle & game over | F |
| AC-8xx | Visual states & motion | F |
| AC-9xx | Accessibility | F |
| AC-10xx | Meta progression & persistence | A |
| AC-11xx | Polish — sound, haptics, juice | B |
| AC-12xx | App Store readiness | C |
| AC-13xx | Engineering hygiene | F |

A build **passes Layer F** when AC-1xx through AC-9xx and AC-13xx all pass. Layers A, B and C
are verified independently and do not gate Layer F.

---

## AC-1xx · Board, layout, device fit

**AC-101** Given the app is running on any supported iPhone, When the Game screen is shown,
Then the board is exactly 10 columns by 15 rows.

**AC-102** Given the Game screen on iPhone 15 (393 × 852 pt), Then the cell size is 36 pt and
the board measures 360 × 540 pt.

**AC-103** *(amended — a device list cannot cover hardware that has not shipped; see AC-119)*
Given **any** supported viewport, When the Game screen is shown, Then the entire board, HUD,
tray and action bar are visible simultaneously with **no scrolling and no clipping of any
element**. *(v1 D2: 15×25 did not fit at all.)*

**AC-104** Given the Game screen, Then the HUD's top edge sits at or below the top safe-area
inset, and no content is obscured by the Dynamic Island. *(v1 D7.)*

**AC-105** Given the Game screen, Then the action bar's bottom edge sits at or above the
bottom safe-area inset, and no content is obscured by the home indicator.

**AC-106** Given the Game screen, Then the board is horizontally centred within the screen,
with equal left and right gutters to within 1 pt. *(v1 D1: two disagreeing cell-size formulas
put the board off-centre inside its own frame.)*

**AC-107** Given the codebase, Then cell size is computed in exactly **one** place and passed
to all consumers as a prop; no other component derives it. *(v1 D1.)*

**AC-108** *(amended — the approved floor was an overflow, not a safety net)* Given any
viewport, Then the cell size is produced by the four-stage ladder in `ui.md` §3.2 and the
board **never exceeds the screen in either axis**. The approved single-clamp formula raised a
too-small cell back to 28 and then overflowed silently; that behaviour is a defect.

**AC-109** Given the Game screen, Then rows 11–13 render with the danger-band ground
`#2A1D24`, and row 14 renders with the kill-line hazard stripe treatment.

**AC-110** Given the device is rotated to landscape, Then the app remains in portrait
(orientation is locked to portrait).

**AC-111** Given any screen, Then no horizontal scrolling is possible anywhere in the app.

### Layout ladder *(Finding 1)*

**AC-112** Given a viewport where a 30 pt cell fits with the full 177 pt chrome, Then stage
**0 — comfortable** is used: HUD 52, action bar 48, tray 45.

**AC-113** Given a viewport where stage 0 would yield a cell below 30 pt, Then stage
**1 — compact** is used: chrome drops to 144 pt (HUD 44, action bar 44, tray 36) and the cell
is recomputed. **Chrome yields before the board does.**

**AC-114** Given compact chrome, Then every touch target is still at least 44 × 44 pt — the
Pass button fills the 44 pt action bar.

**AC-115** Given a viewport where stage 1 would still yield a cell below 30 pt, Then stage
**2 — minimum** is used and the cell may fall as low as **24 pt**, but no lower.

**AC-116** Given a viewport where even a 24 pt cell with compact chrome will not fit, Then
stage **3 — unsupported**: the app shows a clear message and **does not render a clipped or
overflowing board**. *(Reachable only below 504 pt of height, or 597 pt with 59/34 insets, or
272 pt of width — no iPhone has ever shipped such a viewport at any zoom level.)*

**AC-117** Given Display Zoom is enabled or the largest accessibility text size is set, and
the logical viewport shrinks as a result, Then the ladder engages and the board still fits.
*(e.g. a 393 × 852 device at Display Zoom reports ~320 × 693 and must render at stage 2.)*

**AC-118** Given any viewport, Then cell size is derived fresh from the current dimensions and
is **never cached in component state or a module global**. *(v1 A3 held grid dimensions in
mutable module state written during render.)*

**AC-119 — THE SWEEP.** Given the sizing function is run across the continuous space — widths
272–900 and heights 480–1200 in 2 pt steps, against inset profiles 0/0, 20/0, 44/34, 59/34,
62/34 and 70/40 (682,290 combinations) — Then **zero** combinations overflow: for every
non-stage-3 result, `cell × 15 + chrome + insetTop + insetBottom ≤ screenH` and
`cell × 10 ≤ screenW − 32`. This is the standing layout test and it **replaces** any fixed
device list, so that hardware which has not yet shipped is covered by construction. Re-run it
after any change to chrome heights, cell bounds or the breakpoint.

### Wide viewports and the iPhone Duo *(Finding 2)*

**AC-120** Given a viewport 600 pt wide or wider, Then stage **W — wide** is used: the HUD and
action bar move into a right-hand rail, vertical chrome drops to 77 pt, and the cell ceiling
rises to 48 pt.

**AC-121** Given stage W, Then the rail is at least 96 pt wide and contains the score, streak
pill, buffalo chip, pause control, Pass button and turn state — the same components as the
narrow layout, rearranged, with no element added or removed.

**AC-122** Given stage W, Then no more than 20% of the screen width is inert gutter. *(The
approved layout left 43% on a wide foldable — a phone app handed a bigger canvas and doing
nothing with it.)*

**AC-123** Given the iPhone Duo in its **folded** state, Then the board renders with no
overflow and no clipping.

**AC-124** Given the iPhone Duo in its **unfolded** state, Then the board renders in stage W
with no overflow and no clipping.

**AC-125** Given any stage including unfolded, Then orientation remains locked to portrait.

**AC-126** Given the Duo's real point dimensions differ from the estimates in `ui.md` §3.2,
Then **no code change is required** — the ladder is dimension-driven, and AC-119 is what
guarantees it. A hard-coded Duo dimension anywhere in the source is a defect.

### Runtime viewport change *(Finding 2)*

The device changes size **while the game is running**. This is the same class of requirement
as AC-834: the layout is presentation, and presentation must never be load-bearing.

**AC-127** Given a run is in progress, When the device folds or unfolds, Then the board
re-lays out to the new stage and **the game state is unchanged** — same animals, same
positions, same score, same streak, same turn, same queued batch.

**AC-128** Given a fold or unfold, Then the re-layout completes without dropping a frame and
without a visible flash of an unstyled or mis-sized board.

**AC-129 — MID-DRAG RESIZE.** Given the player is mid-drag, When the device folds or unfolds,
Then the drag is **cancelled, not committed**: the animal returns to its origin column, no
turn is consumed, and no move is applied. *(The columns under the finger change meaning when
the cell size changes, so committing would apply a move the player did not choose.)*

**AC-130** Given the player is mid-drag and the device resizes, Then the gesture's shared
values are reset cleanly and a new drag can begin immediately on the new layout.

**AC-131** Given a cascade is animating, When the device folds or unfolds, Then the
resolution still completes and the resulting board state is identical to the same turn
resolved without the resize.

**AC-132** Given the device resizes during the input lock, Then the lock still ends within its
budget (AC-822) and buffered input is still honoured.

**AC-133** Given the device is folded or unfolded while the app is backgrounded, When the app
returns to the foreground, Then the board re-lays out to the current viewport with the run
intact.

---

## AC-2xx · Turn structure & rules engine

**AC-201** Given the rules engine module, Then it exports pure functions that take state and
return new state, contain no React imports, no `setTimeout`, and no side effects.
*(v1 A1: turn resolution ran inside `setAnimals` updaters.)*

**AC-202** Given the same input state and the same PRNG seed, When a turn is resolved twice,
Then the two output states are deeply equal.

**AC-203** Given the app runs under React 19 StrictMode in development, When the player takes
one action, Then the turn counter increments by exactly 1 and exactly one arrival batch is
placed. *(v1 A1: StrictMode double-invocation double-incremented and double-spawned.)*

**AC-204** Given a turn resolves, Then the phases execute in this order and no other:
ACTION → SETTLE (gravity, clears) → ARRIVAL (push up, place queue, gravity, clears) →
JUDGE → ADVANCE.

**AC-205** Given the player's action is applied, Then gravity runs before any clear check in
that phase.

**AC-206** Given an animal at `y = n` with nothing occupying any of its columns at `y < n`,
When gravity runs, Then the animal moves to `y = 0`. No animal ever passes through another
(no tunnelling).

**AC-207** Given gravity runs, Then animals are processed bottom-to-top so that lower animals
settle before the animals resting on them.

**AC-208** Given the Arrival phase, Then every animal's `y` increases by 1 before the queued
batch is placed at `y = 0`.

**AC-209** Given no arrival lands beneath a given stack of animals, When the Arrival phase
completes, Then that stack is back at its pre-arrival `y` positions. *(This is the real rule;
see `gameplay.md` §2.)*

**AC-210** Given an arrival lands beneath a stack, When the Arrival phase completes, Then
every animal in that stack has risen by exactly 1 row.

**AC-211** Given the game is running, Then no `setTimeout` outside the presentation layer
mutates game state, and every timer the presentation layer creates is cleared on unmount.
*(v1 A4: nine bare `setTimeout`s, none cleared.)*

**AC-212** Given a game is restarted while animations from the previous game are still
running, Then no callback from the previous game mutates the new game's state. *(v1 A4.)*

**AC-213** Given the game is running, Then no grid dimension is held in mutable module-level
state; width and height are read from config on every call. *(v1 A3.)*

**AC-214** Given any number of games are played in one app session, Then no two animals ever
share an `id`. *(v1 A5: `resetAnimalsCounter()` rewound a module-global counter.)*

**AC-215** Given the app is running, Then no React hook is called conditionally in any
component. *(v1 B1: `GamePreview.js` returned `null` at line 7 before calling
`useWindowDimensions()` at line 9.)*

**AC-216** Given the engine detects a condition it cannot describe — the AC-504b chain guard
being the only one currently defined — Then it **emits an event and returns**. The engine never
calls `console`, never throws, and never performs I/O. Diagnostics leave the engine the same
way scores do: as data on the event stream. *(This is what makes AC-201's purity ban
compatible with a guard that has to tell somebody.)*

**AC-217** Given a `CHAIN_GUARD` event is emitted, Then it carries enough context to diagnose
the fault without a debugger: the step count reached, the run seed, and the turn number.

---

## AC-3xx · Spawning & the preview contract

**AC-301 — THE PREVIEW CONTRACT.** Given the tray displays a batch of animals at specific
columns, When the Arrival phase places that batch, Then every animal arrives with **exactly
the species and exactly the `x` shown in the tray**, with no exceptions and no re-rolling.
*(v1 C2: `gameStore.js:101-135` re-rolled every column at spawn time; `validNextAnimals` at
`:80-89` was dead code.)*

**AC-302** Given 200 consecutive turns are played, Then AC-301 holds on all 200. Zero
tolerance.

**AC-303** Given a batch is generated, Then it occupies **at most 9** of the 10 columns.

**AC-304** Given a batch is generated, Then no two animals in it overlap.

**AC-305** Given a batch is generated, Then every animal is fully within bounds:
`0 ≤ x` and `x + size ≤ 10`.

**AC-306** *(amended — now an equality)* Given difficulty Savanna, Then the batch occupies
**exactly** the turn's rolled target, and that target lies in 3–5 at turn 1, 4–6 from turn 13,
5–7 from turn 25, and 6–8 from turn 37. *(Guaranteed by §5.2 invariant 3; a batch short of its
target is a defect, not a tolerance.)*

**AC-307** *(amended)* Given difficulty Meadow, Then the target lies in 2–4 at turn 1, 3–5 from
turn 13, 4–6 from turn 25 and **5–7 from turn 37**, which is its ceiling. Given Tundra, 4–6 at
turn 1, rising to a 7–9 ceiling. In both cases the batch occupies exactly the target.

**AC-307b** Given any batch at any difficulty and turn, Then the number of columns it occupies
equals the rolled target exactly — never fewer, never more.

**AC-308** Given Meadow, Savanna and Tundra are each played for 50 turns, Then the three runs
produce measurably different mean cells-per-turn. *(v1 C1: Normal and Hard were identical
because `Math.ceil(1.5) === Math.ceil(2)`.)*

**AC-309** *(amended — the old wording demanded a 9-column batch "at any difficulty", which is
unachievable by design: only Tundra's band reaches a high of 9, and only from turn 37.)*
Given 500 batches generated at **Tundra, turn 37 or later**, Then at least one occupies 9
columns. *(v1 C3: the 1-column buffer capped every batch at 8 of 10 and averaged 6.0.)*

**AC-309b** Given 500 batches generated at any difficulty and turn, Then no batch occupies 10
columns, and the distribution of occupied-column counts matches the rolled targets exactly
— which is the general proof that the buffer is gone.

**AC-310** Given difficulty Savanna, Then a buffalo is queued on turns 10, 20, 30 … and on no
other turn.

**AC-311** Given a buffalo is already on the board when its scheduled turn arrives, Then no
second buffalo is queued, and the schedule fires again at the next scheduled turn after the
board is clear of buffalo.

**AC-312** Given the turn advances, Then the next batch is generated **exactly once**.
*(v1 C6: `generateAnimalsForTurn(turn + 1, …)` was called from two places for the same turn.)*

**AC-313** *(amended)* Given a run begins, Then two arrival batches have already been applied
and the board is non-empty, `turn` is 1, and the tray shows the batch for turn 1.

**AC-313b** Given a run begins, Then both seeding batches were generated using **turn 1's
band** for the chosen difficulty.

**AC-313c** Given a run begins, Then **neither seeding batch contains a buffalo**, regardless
of difficulty.

**AC-313d** Given the two seeding batches happen to complete a row, Then that row clears
normally, **but the run still opens at score 0**, with streak 0 and no clearing turn recorded.

**AC-314** Given the same run seed, When the run is replayed with the same player inputs,
Then every batch generated is identical.

**AC-315** Given the tray, Then it renders the batch as animal bodies in species colours at
their real columns, and displays the batch's total cell count.

**AC-316 — INTERLEAVED GENERATION.** Given a batch is generated, Then each species is chosen
against the free column runs that actually remain at that moment and is placed immediately
before the next is chosen. Selection and placement are one loop, not two passes.

**AC-317** Given a rolled target of 9 that would be satisfied by sizes {1, 3, 5}, Then
generation never deadlocks and never produces a short batch. *(The approved two-pass algorithm
did: rat at `x=1` then elk at `x=4` leaves no 5-wide run for the elephant, and no fallback was
specified.)*

**AC-317b** Given the source tree, Then the batch generator contains **no retry loop, no
backtracking and no placement-failure fallback** — `validStarts` is provably non-empty
whenever it is called, because a species only becomes a candidate once a free run long enough
to hold it exists (`gameplay.md` §5.2 invariant 2). A fallback path in this function is a sign
the invariant was broken, not a safety net.

**AC-317c** Given the draw-count property, Then it is proven **exactly at `width: 40`**, and
`width: 10` — the shipped width — is covered by a **one-sided bound**: over 72,000 batches the
count never *exceeds* the single-pass bound. The exact equality does not hold at width 10
because a forced placement consumes no draw when `nextInt` short-circuits a degenerate range.
**Do not "fix" this test to run at width 10** — it will fail, and the failure is in the
expectation, not the generator. One-sided at the shipped width is the direction that matters.

**AC-318 — PACING.** Given 30 seeds per difficulty played by the deterministic greedy bot with
perfect information, Then median turns-per-run fall in these ranges:

| | Meadow | Savanna | Tundra |
|---|---:|---:|---:|
| Acceptance range | 100–150 | 60–90 | 35–55 |

*(Measured against the approved bands: Meadow 240 — out of range, which is why its ceiling
moved to 5–7; Savanna 75.5 and Tundra 48.2 — both in range and unchanged.)* Re-run this after
any band, weight or ramp change. *(v1 rendered flat green
occupancy squares that said nothing about what was coming.)*

---

## AC-4xx · Movement & input

**AC-401** Given the player drags an animal and releases it at a different column, Then
exactly one turn resolves.

**AC-402** Given the player drags an animal and releases it at its starting column, Then no
turn resolves and the board is unchanged.

**AC-403 — SWEPT PATH.** Given an animal at `x = 0` and another animal in the same row at
`x = 2`, When the player attempts to move the first animal to `x = 4`, Then the move is
rejected. *(v1's `canMoveAnimal`, `src/data/gameLogic.js:236-259`, checked only the
destination, so animals tunnelled through their neighbours. Verified by execution.)*

**AC-404** Given an animal, When the player attempts to move it so that `x < 0` or
`x + size > 10`, Then the move is rejected.

**AC-405** Given an animal, Then it can only be moved horizontally; its `y` is never changed
by a player action.

**AC-406 — ILLEGAL MOVE FEEDBACK.** Given the player releases a drag on an illegal target,
Then the animal shakes (3 × 6 pt, 260 ms), shows a 2 pt red rim, fires an error haptic, and
the action bar reads `BLOCKED`. The turn does not advance. *(v1 C5: rejected moves produced
no feedback of any kind.)*

**AC-407** Given the player is dragging toward an illegal target, Then **before release** the
destination ghost is red and the obstructing animal is outlined in red. *(v1's drag preview
clamped to bounds only and never checked collisions, so an illegal target looked legal.)*

**AC-408** Given the player is dragging toward a legal target, Then the destination ghost is
an accent dashed outline at those exact columns.

**AC-409** Given two fingers drag two different animals simultaneously, Then neither drag's
origin is corrupted and at most one move is committed. *(v1 D3: `dragStartXRef` was a single
ref shared across all animals.)*

**AC-410** Given the board is rendering, Then a pan responder is created once per animal and
is not reallocated on every render. *(v1 D3: `createPanResponder` was called inside the
render map.)*

**AC-411 — PASS.** Given the Game screen is in the READY phase, Then the Pass button is
enabled, and tapping it advances the turn without moving any animal.

**AC-412** Given a board state in which no legal move exists, Then the game does not
soft-lock: Pass is available and advances the turn. *(v1 C4.)*

**AC-413** Given a turn is resolving (any phase other than READY), Then animal drags are
ignored and the Pass button is disabled but still visible, so the layout does not reflow.

**AC-414** Given the player taps during a resolving turn, Then that tap is buffered and
applied at the next READY phase, or discarded if it is no longer valid — it is never silently
dropped mid-resolution.

**AC-415** Given any animal on any device, Then its touch target is at least 44 × 44 pt,
achieved with `hitSlop` where the rendered body is smaller.

---

## AC-5xx · Clearing, chains, buffalo

**AC-501** Given all 10 columns of a row are occupied and no buffalo is in that row, When the
clear resolves, Then every animal in that row is removed.

**AC-502** Given a row clears, Then gravity is applied afterwards and every animal above
settles to its lowest non-colliding position.

**AC-503** Given clearing one row causes another row to become complete, Then that row also
clears in a subsequent chain step, and the process repeats until no row is complete.

**AC-504** *(amended — the 8-step rail is removed as a scoring cutoff)* Given a resolution,
Then the chain loop runs until no row is complete, however many steps that takes, and
**terminates by construction**: every step removes at least one completed row, so board mass
strictly decreases by at least one cell per step from a maximum of 150.

**AC-504b** *(amended — the engine cannot log; AC-201 forbids it and a test enforces it)*
Given a resolution, Then `assert step <= 32` holds. This is a **crash guard against an engine
bug**, not a gameplay parameter: 32 is more than twice the mass bound, so tripping it means
gravity is not settling or a clear is not removing. On trip the engine **emits a `CHAIN_GUARD`
event, increments `stats.chainGuardTrips`, and stops the loop** — it does not call `console`,
does not throw, and does not silently alter scoring. Reporting is a presentation obligation
(AC-216, AC-1309).

It **may leave the board unresolved**, with a completed row still standing — it is a crash
guard, not a recovery path. That is acceptable precisely because it is only reachable once the
engine is already broken, and it is why AC-504e refuses to persist such a run's score. What
the guard must not do is alter scoring, or fail to announce itself.

**AC-504e** Given a run in which `stats.chainGuardTrips > 0`, Then that run's score is **not
written to the high-score table**. The guard means the engine was in a state the rules do not
describe, so its score is not trustworthy enough to persist as a record.

**AC-504c — EVERY STEP THAT RESOLVES, SCORES.** Given a cascade of any depth, Then every step
that clears a row awards its score. There is no depth past which clearing stops paying.
*(The superseded 8-step rail cleared steps 9+ without paying them: on the committed 10-step
fixture at streak 5 it paid 7,350 of 17,100 and silently swallowed a buffalo retirement.)*

**AC-504d** Given the committed 10-step fixture resolved with **`state.streak === 5` entering
the turn** (not "the 5th consecutive clearing turn", which would score 14,250), Then the score
awarded is **17,100**, `stats.rowsCleared` is 6, `stats.longestChain` is 10, and
`stats.buffaloRetired` is 1 — with the +500 retirement visible in the score.

**AC-505** Given two rows complete in the same step, Then both clear in that single step (not
sequentially).

**AC-506 — BUFFALO SHRINK.** Given a row is complete and contains a buffalo of size `n > 1`,
When the clear resolves, Then every non-buffalo animal in the row is removed, the buffalo's
size becomes `n − 1`, the buffalo's `x` is unchanged, and **the row does not clear**.

**AC-507** Given a row is complete and contains a buffalo of size 1, When the clear resolves,
Then the buffalo is removed from the board and marked retired.

**AC-508** Given a buffalo shrinks, Then its rendered body loses exactly one panel and the
panel count equals the new size.

**AC-509** Given a buffalo is on the board, Then the HUD buffalo chip is visible and shows its
remaining segments filled and its spent segments dimmed.

**AC-510** Given a buffalo is retired, Then the HUD chip disappears.

**AC-511** Given a clear step occurs, Then its flash-and-collapse animation plays exactly
once. *(v1 C7: the turn path flashed at 500 ms then `executeChainClear` re-flashed for
1000 ms — the same rows flashed twice.)*

**AC-512** *(amended twice — see `ui.md` §8.2a)* Given a clear step, Then its flash runs
**320 ms** (60 ms attack, 260 ms decay), its collapse runs **110 ms**, and its animals settle
over 200 ms. The **first** step of a resolution additionally plays an **80 ms leading beat**
before the collapse begins; steps 2+ of the same cascade begin their collapse concurrently
with their flash. Cascade step intervals and the overall
budget are AC-820..825.

**AC-513** Given the board becomes completely empty after a resolution, Then a Perfect Clear
is registered and the run continues normally on the next turn — it does not silently trigger
an extra turn. *(v1 `gameStore.js:262-269`.)*

---

## AC-6xx · Scoring

**AC-601** Given a new run, Then the score starts at 0 and is displayed in the HUD.

**AC-602** Given one row clears in a step with chain multiplier 1 and streak multiplier 1.0,
Then the score increases by exactly 100.

**AC-603** Given 2 / 3 / 4 rows clear in the same step at chain 1 and streak 1.0, Then the
score increases by exactly 300 / 600 / 1000 respectively.

**AC-604** Given 5 rows clear in one step at chain 1 and streak 1.0, Then the score increases
by exactly 1400 (`1000 + 400 × 1`).

**AC-605** Given a chain reaches step 2, 3, 4 and 5, Then that step's score is multiplied by
2, 3, 4 and 5 respectively. Given step 6 or later, the multiplier remains 5.

**AC-606** *(amended — replaces the linear formula, and fixes the off-by-one)* Given a clear
occurs, Then the streak is **incremented first and then applied**, so the multiplier shown and
used is the one this clear earned. The value is a lookup, not a formula:

| consecutive clearing turns | 1 | 2 | 3 | 4 | 5 | 6+ |
|---|---:|---:|---:|---:|---:|---:|
| × | 1.0 | 1.3 | 1.6 | 2.0 | 2.5 | 3.0 |

**AC-606b** Given three consecutive turns that each clear exactly one row at chain depth 1,
Then the score increases by 100, 130 and 160 — total **390**. *(Under the approved draft's
reading this was 100 + 100 + 120 = 320, because the mechanic paid nothing until the third
clear.)*

**AC-606c** Given six consecutive clearing turns, Then the multiplier reaches ×3.0 and does
not rise further.

**AC-607b** Given the HUD, Then the streak pill renders `streakMult` and **never** the raw
`state.streak` counter, which keeps counting past the ×3.0 cap by design so `longestStreak`
can record it. *(Observed at 7 and 8 after eight consecutive clears; rendered raw it would
read `streak 23 · ×3.0`.)*

**AC-607c** Given a run ends, Then `longestStreak` records the **raw count** of consecutive
clearing turns, not the multiplier — ×3.0 tops out, "14 in a row" does not.

**AC-607** Given the streak multiplier exceeds 1.0, Then it is displayed in the HUD as a pill
(e.g. `×2.0`). Reachable values are exactly 1.3, 1.6, 2.0, 2.5 and 3.0.

**AC-608** Given a turn passes with no clear in either phase, Then the streak resets to 0 and
the pill disappears.

**AC-609 — STREAK PRECEDENCE** *(amended — replaces "a pass resets the streak", which
contradicted AC-606 for every pass that cleared, of which the AC-613 Perfect Clear case was
only the loudest instance)*. Given the end of any turn, Then the streak is updated by the
first matching rule:

| # | Condition | Multiplier | Raw counter |
|---|---|---|---|
| 1 | The board is empty (Perfect Clear) | jumps to its ×3.0 cap | `max(streak + 1, STREAK_TURNS_AT_CAP)` |
| 2 | At least one clear step occurred, in Phase 2 **or** Phase 3 | per the AC-606 table | `streak + 1` |
| 3 | Otherwise | ×1.0 | `0` |

**Two columns, because they are two different things.** Every round of confusion over this
rule came from one phrase — "set to the ×3.0 cap" — having to mean both, so the table now
separates them structurally rather than explaining the distinction in a footnote.

*(The original wording said "Set to the ×3.0 cap", which read literally as `streak = 6` and
would have moved a player on a raw streak of 13 **backwards** to 6 — destroying exactly what
AC-607c preserves. It was written before AC-607c separated the counter from the multiplier;
afterwards "the cap" meant two things and rule 1 kept pointing at the wrong one.)*

**The two readings are indistinguishable in play**, which is why this survived several passes:
verified across 5,001 entering streak values, `streakMult` is identical under both, because
both land at or above the cap index and the AC-606 table is flat from 6. They diverge **only**
in the raw counter, and only for an entering streak ≥ 6 — which is invisible during a run and
shows up solely in `longestStreak` on the Game Over sheet.

**AC-609b** Given the player taps Pass and the resulting arrival completes a row, Then that
turn **increments** the streak — the streak follows the board, not the input method.

**AC-609c** Given the player taps Pass and no row clears, Then the streak resets to 0 by rule
3 — the same outcome as any other non-clearing turn, and for the same reason.

**AC-609d** Given the player taps Pass and the resulting arrival empties the board, Then rule
1 wins: the multiplier is ×3.0, the counter rises per AC-609e, and the Perfect Clear bonus is
awarded.

**AC-609e** Given a Perfect Clear, Then the raw streak counter **never decreases**. From a
streak of 1 it jumps to 6; from 13 it goes to 14, not back to 6. A Perfect Clear is a clearing
turn — the best one — and must not be the single event in the game that sends a streak
backwards.

**AC-609f** Given any turn, Then the raw streak counter is monotonic across every clearing
turn: it strictly increases under rules 1 and 2, and **only rule 3 ever lowers it**.

**AC-610** Given a buffalo shrinks, Then the score increases by 50 (before multipliers) and
that step counts toward chain depth.

**AC-611** *(amended — the approved wording read as 500 flat; it is both terms)* Given the row
completion that retires a buffalo, Then the score increases by **550** before multipliers —
50 for the shrink plus 500 for the retirement. Taking the last segment is still taking a
segment.

**AC-611b** Given a buffalo is carried from size 4 to retirement with every completion at
chain depth 1 and streak ×1.0, Then it has paid exactly **700** in total (50 + 50 + 50 + 550).

**AC-612** Given a buffalo row resolves, Then that row does **not** count toward `n` in the
simultaneous-rows table.

**AC-613** Given a Perfect Clear, Then the score increases by 1000 and the streak multiplier
is set to 3.0. Precedence against every other streak rule is AC-609.

**AC-614** Given any number of turns elapse with no clears, Then the score does not change.
Turns are never worth points.

**AC-615** Given the score changes, Then the HUD counts up to the new value over 400 ms and a
floating `+N` rises from the affected row.

**AC-616** Given the score is displayed anywhere, Then it uses tabular figures and does not
reflow as it ticks.

**AC-617** *(amended for the new streak table)* Given the worked example in `gameplay.md`
§7.3 is reproduced — a 4th consecutive clearing turn, two rows in step 1, one buffalo shrink
in step 2 — Then the score increases by exactly **800** (600 + 200).

**AC-617b** Given that same example except that step 2 *retires* the buffalo rather than
shrinking it, Then step 2 pays `(50 + 500) × 2 × 2.0 =` **2200**.

---

## AC-7xx · Run lifecycle & game over

**AC-701** Given any animal occupies `y ≥ 14` at the end of the JUDGE phase, Then the run
ends.

**AC-702** Given an animal is pushed above `y = 14`, Then the run has already ended — no
animal is ever rendered at a negative screen offset or outside the board.
*(v1 C4: animals reached `y = 20` on a 20-row grid and rendered outside the grid.)*

**AC-703** Given the run ends, Then game-over is detected exactly once, in the JUDGE phase,
and never from inside the move handler. *(v1 C4: checked only in `moveSelectedAnimal`.)*

**AC-704** Given no animal occupies `y ≥ 14`, Then the run continues regardless of how full
the board is.

**AC-705** *(amended)* Given the run ends, Then the board dims over 240 ms and the Game Over
sheet slides up over 280 ms starting at t=120 ms, so the two overlap. See AC-816, AC-817.

**AC-706** Given the Game Over sheet, Then it displays the final score, the best score for
that difficulty, and four run stats: turns survived, rows cleared, longest chain, buffalo
retired.

**AC-706b — ONE SOURCE.** Given any run, Then every statistic on the Game Over sheet is
derived from **the same `events[]` array the score is summed from**:

| statistic | derivation |
|---|---|
| `rowsCleared` | sum of `n` across clear events |
| `longestChain` | highest `step` in any clear event |
| `buffaloRetired` | count of events carrying a retirement |
| `longestStreak` | highest `streak` across **`ADVANCE` events** |

**AC-1011b** Given the Records screen, Then it shows the **last ten runs** — difficulty, date,
score, turns — alongside the lifetime aggregates. *(Ported from v1's `StatsPanel.js`;
aggregates do not replace it, because a list of your recent runs is what shows whether you are
improving today.)*

**A statistic incremented at a second site is a defect even while it happens to agree with the
score.**

**AC-706e** Given the `ADVANCE` event, Then it **carries the turn's `streak` value**. A streak
is a turn-level fact rather than a clear-level one, so without this the stream cannot express
it and `longestStreak` has to be folded from state — which is a second site, and re-opens
exactly the divergence AC-706b exists to close. *(Slice 1 folded it from per-turn state; the
value was correct in all 150 verified runs, but the stated mechanism was not. The fix is to
make the mechanism true, not to carve out an exception: an absolute rule is what makes the
structural guarantee hold, and one exception is all it takes to need a sync rule again.)*

**AC-706c** Given any run, Then no Game Over statistic can report an event the score was not
paid for, and none can under-report one that was. *(The defect this closes: `buffaloRetired`
reading 1 with no +500 anywhere in the score — retirement is the loudest scoring event in the
game and §6.4 promises a full-board celebration for it.)*

**AC-706d** Given `longestChain`, Then it reports the true cascade depth. *(It reported 8 for
a 10-step cascade under the superseded rail.)*

**AC-707** Given the final score exceeds the stored best for that difficulty, Then a
`NEW BEST` badge is shown with the previous best.

**AC-708** Given the Game Over sheet, When the player taps Play Again, Then a new run starts
at the same difficulty with score 0 and a fresh board, and no state carries over.

**AC-709** Given a run is in the READY phase, When the player taps pause, Then the Pause sheet
opens and the score is unaffected.

**AC-710** Given a run is resolving, Then the pause button is disabled.

**AC-711** Given the player backgrounds the app mid-run and returns, Then the board is in
exactly the state it was left in and no phase has advanced.

---

## AC-8xx · Visual states & motion

**AC-801** Given five animals of different species on the board, Then each renders in its own
species fill and edge per `ui.md` §4.3, and no two species share a fill.
*(v1 D5: every animal rendered `#2255dd`.)*

**AC-802** Given an animal of size `n`, Then its body displays exactly `n` panels separated by
`n − 1` seams, and each seam aligns with a grid column boundary to within 0.5 pt.

**AC-803** Given an animal of size `n`, Then its rendered width equals `n × cell` exactly.

**AC-804** Given a buffalo, Then it renders with a 2 pt `#E8B44A` rim and an inner glow, and
is visually distinguishable from every other species at arm's length.

**AC-805** Given the player grabs an animal, Then it scales to 1.04 and gains a drop shadow
within one frame. *(v1 D4: `dropping: {}` was an empty style object; the advertised drag
feedback did not exist.)*

**AC-806** *(amended)* Given the player drags an animal, Then the body follows the finger
with no visible lag and snaps to the nearest column over **110 ms** on release.

**AC-807** *(amended)* Given an animal falls under gravity, Then it animates over **200 ms**
with accelerating easing and plays a 140 ms land squash on arrival. The squash is an
announcement and does not gate input.

**AC-808** Given an animal's drop animation runs, Then it runs once per drop and is not
retriggered spuriously on later renders. *(v1 D4: `setPrevY` was only called on the non-drop
branch, so `prevY` went permanently stale after the first drop.)*

**AC-809** *(amended)* Given the Arrival phase, Then the tray's animal views visibly travel
from the tray strip into row 0 over **260 ms**.

**AC-810** Given any animal occupies rows 11–13, Then the danger band pulses on a 1200 ms
loop; given the band is empty, the pulse stops.

**AC-811** Given 3 or more rows clear in one step, Then the screen shakes 4 pt for 180 ms.
Given 1 or 2 rows, it does not.

**AC-812** Given a buffalo shrinks, Then a segment visibly cracks off and falls, the body
springs to its new width, and a `BUFFALO −1` label rises.

**AC-813** *(amended — see `ui.md` §8.2a)* Given the **first** clear step of a resolution,
Then an 80 ms leading beat plays before the collapse begins — the row is announced, then goes.
Given any **subsequent** step of the same cascade, Then its collapse begins concurrently with
its flash. In no case do the same rows flash twice.

**AC-813b** Given any clear step, Then its flash lasts **320 ms** with a **60 ms attack and a
260 ms decay** — deliberately asymmetric, because the fast attack is what announces and the
slow decay is what stops it reading as abrupt. It is a single flash, not a pulse train.

**AC-813c** Given any clear step, Then the flash **does not gate input**: it may still be
playing when the next turn's input opens (AC-826). Its length costs the AC-822 budget nothing.

**AC-813d** Given a clear step, Then the cleared animals scale to **0.85** and drift **6 pt
downward** as they go, within the unchanged 110 ms structural collapse, with the opacity fade
continuing **140 ms past** it as an announcement. Things that leave should look like they went
somewhere.

**AC-814** Given the app is running, Then every duration and easing observed matches the
table in `ui.md` §8 to within 30 ms.

**AC-815** Given the app is running on a supported device, Then all animations hold 60 fps
with no dropped-frame warnings in the profiler.

**AC-816** Given the run ends, Then the board dim and the Game Over sheet slide **overlap**,
and the sheet is fully presented within 400 ms of the run ending.

**AC-817** Given the app is running, Then the board dim is an opacity-animated overlay view
and no animated `filter` property is used anywhere in the app.

**AC-818** Given an animal is grabbed, Then the lift animation begins on the same frame as the
touch-down event and completes over 90 ms.

**AC-819** Given the player releases a drag on an illegal target, Then input is **not** locked:
a new drag may begin on the next frame, while the shake is still playing.

### Input-lock budget *(Revision 2)*

**AC-820** Given a turn in which no row clears, Then input reopens no later than **570 ms**
after finger-up. *(Unchanged by §8.2a — no clear, no lead beat.)*

**AC-821** *(amended — §8.2a added the 80 ms lead beat)* Given a turn in which exactly one
clear step occurs, Then input reopens no later than **960 ms** after finger-up.

**AC-822 — THE BUDGET.** Given **any** turn, including the deepest cascade the engine can
produce, Then input reopens no later than **1500 ms** after finger-up. This is a hard
guarantee, not a target. *(The approved draft accepted ~3.2 s.)*

**AC-823** *(amended — §8.2a)* Given a cascade of 2 or more steps, Then step *n+1*'s flash and
collapse begin while step *n*'s animals are still falling, and the interval between
consecutive step starts follows `max(200, 260 − 15 × (k − 1))` ms before any time-scaling.
*(Was `max(150, 250 − 20 × (k − 1))`. The chain still gathers pace, but gently: the old curve
was dramatically correct and legibly wrong, overlapping later steps so heavily they stopped
reading as discrete events.)*

**AC-824** *(unchanged in rule; its worked numbers moved with §8.2a)* Given a resolution
timeline whose natural length exceeds 1500 ms, Then it is **uniformly** time-scaled to fit —
every step remains individually visible, the sequence keeps its shape, and no step is skipped.
The scale applied is never below 0.55×; the absolute worst case needs **0.71×**.

**AC-824b** Given the realistic worst case — a 3-step cascade split 2/1, the deepest ever
observed — Then its natural length is 1610 ms and it compresses by **0.93×**. *(Before §8.2a
this case was 1440 ms and needed no compression. That property was traded deliberately for a
visibly better clear on every turn: "never compresses in practice" was an observation, the
1500 ms guarantee is the promise, and a 7% speed-up on the rarest turn in the game is not
perceptible.)*

**AC-824c — PROVISIONAL.** Given the §8.2a clear timings (flash 320 ms, lead beat 80 ms,
interval 260→200 ms), Then they are **reviewed against a real build before being locked**.
They are a considered response to one sentence of owner feedback given while watching a build
that had *no* clear animation at all, so they are the first of these numbers anyone has
actually seen move. Watch them and adjust; do not defend them.

**AC-825** *(amended — the cap is per turn, not per resolution)* Given a turn producing 6 or
more cascade steps **across both the SETTLE and ARRIVAL phases combined**, Then at most 5 are
animated separately and the remainder replay as one combined final step — at most **6 animated
units per turn** — **and the score awarded is identical to a fully-animated replay** of the
same cascade. The presentation cap must not change a single point. *(Per-phase capping would
allow 12 units and break the AC-822 budget: 3290 ms uncompressed needs 0.46×, below the 0.55×
floor.)*

**AC-825b** Given the cascade pipeline, Then it makes **no assumption about the number of
`CLEAR_STEP` events a turn can deliver**. The count is bounded by board mass (≈15 worst case,
3 observed across 45,504 fuzzed turns), not by a step counter, and both phases feed the same
turn. What the pipeline may rely on is AC-825's 6-animated-unit ceiling.

**AC-826** Given input is locked, Then the lock ends at the end of the *structural* timeline
and does **not** wait for announcement animations. Floating `+N` labels, the score count-up,
screen shake and particle bursts may still be playing when the next turn's input is accepted.

**AC-827** Given a tap arrives during the input lock, Then it is buffered and applied at the
next READY phase if still valid, and is never silently swallowed.

### UI-thread contract *(Revision 1)*

**AC-828 — NO JS-DRIVEN ANIMATION.** Given the source tree, Then **no `setTimeout`,
`setInterval`, `requestAnimationFrame` or `setState` call drives any animation frame**. Every
transform in the `ui.md` §8 table is a Reanimated worklet reading shared values through
`useAnimatedStyle`, and sequencing uses `withSequence` / `withDelay` / `withTiming`, not
chained timers. *(v1 A1/A4: nine bare `setTimeout`s driving `setState`.)*

**AC-829** Given the repository, Then `babel.config.js` exists, includes
`react-native-reanimated/plugin`, and that plugin is the **last** entry in the plugin list.
*(There is no `babel.config.js` in the repo today, so Reanimated silently does nothing — no
error, no warning.)* Deliberately duplicates AC-1304; a tester checking motion should not have
to read AC-13xx to find it.

**AC-830** Given the source tree, Then `PanResponder` is not imported anywhere, and the drag
is implemented with `Gesture.Pan()` from `react-native-gesture-handler`. *(v1: `App.js:18`
mounted `GestureHandlerRootView` and `GameGrid.js:30` used `PanResponder` anyway.)*

**AC-831** Given the player is mid-drag, Then **zero** React re-renders of the board occur;
React learns the outcome on release only, through a single `runOnJS` call carrying the final
column.

**AC-832** Given the player is mid-drag, Then the legal/illegal destination ghost updates at
touch rate, computed in the gesture worklet from an occupancy snapshot taken at gesture start.

**AC-833** Given a turn is animating, Then the JS thread performs no work beyond scheduling —
the reducer has already resolved the entire turn before the first frame plays.

**AC-834 — FRAMES ARE NOT LOAD-BEARING.** Given frames are deliberately dropped during a turn
(for example under an induced stall), Then the resulting board state is identical to the same
turn resolved without the stall and the turn still completes. Animation replays resolved
state; it never drives it.

**AC-835** Given the danger band is pulsing, Then the pulse is a `withRepeat` worklet and the
JS thread is idle while it runs.

**AC-836** Given a run is in progress, Then the 150 empty board cells are rendered by one
memoized component that does not re-render, and animals are the board's only dynamic children.
*(v1: `GameGrid.js:73-94` rebuilt all 150 cell views inside render.)*

---

## AC-9xx · Accessibility

**AC-901** Given VoiceOver is active, Then every animal exposes a label of the form
`"Fox, size 2, row 4, columns 3 to 4"`.

**AC-902** Given VoiceOver is active, Then the tray exposes a label naming each incoming
animal, its columns, and the total cell count.

**AC-903** Given VoiceOver is active and a clear occurs, Then the score change is announced
via a polite live region.

**AC-904** Given VoiceOver is active, Then every button exposes a role and an accessible name,
and no control is reachable only by an emoji glyph.

**AC-905** Given the Size Numerals toggle is on, Then every animal displays its size digit.

**AC-906** Given the High Contrast toggle is on, Then animal borders are 2.5 pt white and
seams are 1.5 pt white at 55%.

**AC-907** Given OS Reduce Motion is enabled, Then every transform animation becomes a
≤120 ms cross-fade, the illegal-move shake becomes a static 400 ms red rim, the danger pulse
becomes a static wash, and screen shake is disabled.

**AC-908** Given a deuteranopia or protanopia simulation, Then every animal's size remains
determinable from width and panel count alone.

**AC-909** Given every text/background pair in the app, Then contrast is at least 4.5:1,
except `ink-dim` which is used only at 10 pt / 600 uppercase and always paired with an
`ink`-weight value.

**AC-910** Given Dynamic Type is set to AccessibilityLarge, Then all HUD, sheet and overlay
text scales and no text is clipped or truncated. The board does not scale.

**AC-911** Given keyboard or switch-control focus, Then every interactive control shows a 2 pt
accent focus ring at 2 pt offset.

---

## AC-10xx · Meta progression & persistence (Layer A)

**AC-1001** Given a run ends, Then the run record is written to AsyncStorage exactly once.

**AC-1002** Given the app is running, Then no storage write occurs during a turn or from the
render path. *(v1 serialised the whole board to AsyncStorage on a 1 Hz `setInterval` at
`GameScreen.js:53-72`, with `[store]` as its dependency array so the interval was rebuilt on
every render.)*

### Session resume *(ported from v1 — Layer A)*

**AC-1012 — NO REGRESSION.** Given a run is in progress, When the app is backgrounded and
later relaunched from cold, Then the run resumes at exactly the state it was left in: same
board, same score, same streak, same turn, same queued batch. *(v1 shipped this; v2 without it
would be a regression against behaviour players already have.)*

**AC-1013** Given a run is in progress, Then the resume record is written **only** on
`AppState` transition to `inactive` or `background` — never per turn, never on a timer, never
from the render path. AC-1002 is unamended by this feature.

**AC-1014** Given the resume record, Then it stores a **replay** — `{ schemaVersion,
engineVersion, seed, difficulty, moves[], digest }` — and **not a board snapshot**. Resume
re-runs the engine from turn 1 applying each move.

**AC-1015** Given any resume record, however corrupt or tampered with, Then the board it
produces is **reachable by the rules**, because the engine produced it. A save file must not
be able to create a state the engine could not reach on its own.

**AC-1016** Given a resume record whose `engineVersion` does not match the running build, Then
it is **discarded, not replayed**. *(A replay only reconstructs a run under the rules that
produced it; a tuning change to bands, weights or scoring would silently rebuild a different
run. Losing a run to an app update is acceptable; silently resuming the wrong one is not.)*

**AC-1017** Given a replay completes, Then the reconstructed board's `digest` is compared with
the stored one and the resume is discarded on mismatch.

**AC-1018** Given a saved run exists at launch, Then Home leads with **Resume**, showing that
run's score and turn, and offers **New Run** second.

**AC-1019** Given a saved run exists, When the player starts a new run, Then they are asked to
confirm first, because it discards the saved run.

**AC-1020** Given a run ends, Then the resume record is cleared and the run record is written
(AC-1001).

**AC-1021** Given a resumed run, Then it behaves as an ordinary run in every respect — it
writes its run record, it can set a high score, and it counts toward the daily streak.

**AC-1022** Given a resume record for a difficulty or board configuration the build no longer
supports, Then it is discarded cleanly and the app launches normally.

**AC-1003** Given the app is force-quit and relaunched, Then best score, all stats and all
unlocks are restored. *(v1: AsyncStorage was a dependency and was never used; settings reset
on every launch.)*

**AC-1004** Given best scores, Then they are tracked separately per difficulty.

**AC-1005** Given the stored blob is corrupt or unparseable, Then the app launches normally
with default values and does not crash or hang.

**AC-1006** Given the stored blob has an older `schemaVersion`, Then it is migrated or
discarded cleanly, never partially applied.

**AC-1007** Given a run is completed on a new calendar day following a day with a completed
run, Then the daily streak increments by 1. Given a day is skipped, it resets to 1.

**AC-1008** Given the Records screen, Then it shows best score, best chain, longest run and
most rows for each difficulty, plus the lifetime totals.

**AC-1009** Given each of the four unlock conditions is met, Then that unlock becomes
available and a notification is shown once.

**AC-1010** Given the Collection screen, Then every locked item shows an explicit numeric
progress counter toward its condition.

**AC-1011** Given an unlock is applied, Then it changes only appearance and has no effect on
any rule, spawn, or score.

---

## AC-11xx · Polish (Layer B)

**AC-1101** Given sound is enabled, Then each of these has a distinct cue: grab, drop, land,
illegal move, row clear, chain step (rising pitch per step), buffalo shrink, buffalo retired,
perfect clear, new best, game over.

**AC-1102** Given haptics are enabled, Then grab fires selection, land fires light impact, row
clear fires medium impact, perfect clear fires heavy impact plus notification-success,
illegal move fires notification-error, and game over fires heavy impact.

**AC-1103** Given the device ringer switch is set to silent, Then no sound plays and haptics
are unaffected.

**AC-1104** Given the Sound or Haptics toggle is turned off, Then that channel is silent
immediately and the preference persists across launches.

**AC-1105** Given background audio is playing from another app, Then launching and playing
Wildlife Shuffle does not interrupt or duck it.

**AC-1106** Given a chain of `n` steps, Then the chain cue pitch rises monotonically with the
step index.

---

## AC-12xx · App Store readiness (Layer C)

**AC-1201** Given the repository, Then `assets/` exists and contains `icon.png`,
`adaptive-icon.png`, `splash.png` and `favicon.png` at the sizes in `ui.md` §11.1.

**AC-1202** Given `assets/icon.png`, Then it is 1024 × 1024, has no alpha channel, and has
square (unrounded) corners.

**AC-1203** Given `app.json`, Then every asset path it references resolves to a file that
exists. *(v1 referenced `./assets/favicon.png` with no `assets/` directory at all.)*

**AC-1204** Given `app.json`, Then `ios.supportsTablet` is present and `supportsTabletMode`
(an invalid key) is absent.

**AC-1205** Given a production build, Then a splash screen is shown on launch with background
`#0D141B` and no white flash between splash and first frame.

**AC-1206** Given a first launch with no stored data, Then the four-beat onboarding runs on
the real board, each beat gates on the player performing the action, and it is skippable.

**AC-1207** Given onboarding has been completed or skipped, Then it does not run again, and it
is reachable from the Pause sheet.

**AC-1208** Given onboarding beat 3, Then it explicitly demonstrates that the tray's contents
arrive unchanged.

**AC-1209** Given the app is running, Then it makes zero network requests.

**AC-1210** Given the App Store listing, Then five screenshots exist for both the 6.9" and
6.5" display sizes, matching the shot list in `ui.md` §11.3.

**AC-1210b** Given the App Store listing, Then the iPhone Duo set includes at least one folded
and one unfolded shot, the unfolded one showing the stage-W rail layout, captured from the
Xcode 27.1 simulator rather than from the estimated dimensions in `ui.md` §3.2.

**AC-1211** Given `app.json`, Then `userInterfaceStyle` is `"dark"` and the app renders
identically regardless of the OS appearance setting.

---

## AC-13xx · Engineering hygiene

**AC-1301** Given a release build, Then no `console.log` executes in any render path.
*(v1 D6: `GameGrid.js:22,70`, `GamePreview.js:18`, a per-animal loop in a `GameScreen`
effect, and two in `gameLogic`.)*

**AC-1302** Given `package.json`, Then every dependency listed is imported somewhere in the
source. *(v1 had four unused: `expo-sqlite`, `@react-native-async-storage/async-storage`,
`react-native-reanimated`, `react-native-url-polyfill`.)*

**AC-1303** Given the source tree, Then there is no unreferenced module, no unused export and
no unused style. *(v1: `AnimalCell.js` never imported, `generateAnimal` imported but never
called, `BASE_CELL_SIZE` duplicated in three files, `styles.footer` / `styles.instructions`,
`waitingForPlayer` / `initialized`.)*

**AC-1304** Given the repository, Then `babel.config.js` exists and lists the
`react-native-reanimated` plugin last. Same check as AC-829.

**AC-1305** Given the rules engine, Then it has unit tests covering: gravity, swept movement,
clear detection, buffalo shrink and retirement, chain resolution, spawn invariants
(AC-303/304/305) and the scoring formula.

**AC-1306** Given the test suite, Then AC-301 (the preview contract) is covered by an
automated property test over at least 200 generated turns.

**AC-1307** Given the repository, Then a lint step runs clean and there are no unused
variables or unreachable code.

**AC-1308** Given any run, Then the run's PRNG seed is recorded in the run record so the run
can be reproduced from a bug report.

**AC-1309** Given a `CHAIN_GUARD` event reaches the presentation layer, Then in development
builds it **throws**, surfacing immediately as a redbox; and in release builds it is recorded
in the run record and the run is flagged, without interrupting the player. The engine emits it
(AC-216); **this AC is what makes someone responsible for it being seen.** A guard nobody
reads is not a guard.

**AC-1310 — THE DOCUMENTS LINT.** Given `node docs/v2/check-ac-refs.mjs` is run, Then it exits
0: **every acceptance criterion cited anywhere in `docs/v2/` is defined, and none is defined
twice.** A referenced-but-undefined AC is silently unverifiable — the developer builds to it
and the tester verifies it by number, and neither discovers it is missing. *(This AC exists
because AC-609e and AC-609f were cited from two documents for a full review cycle before they
were written.)* Re-run it after any edit to `docs/v2/`.
