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

**AC-101** *(amended — board narrowed to 9 on owner request)* Given the app is running on any
supported iPhone, When the Game screen is shown, Then the board is exactly **9 columns by 15
rows**.

**AC-101b** Given the source tree, Then board width is read from **one constant**
(`BOARD.width`) everywhere — in the engine, the bands, the spawn cap, the layout formula and
the tests. **A hard-coded 9 or 10 anywhere is a defect.** *(This is AC-126's rule applied to
the board itself, and it is what made narrowing the board a constant edit rather than a
rewrite.)*

**AC-102** *(amended)* Given the Game screen on iPhone 15 (393 × 852 pt), Then the cell size
is **39 pt** and the board measures **351 × 585 pt**.

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

**AC-301 — THE PREVIEW CONTRACT.** Given the tray displays a batch at specific columns, When
the Arrival phase places that batch, Then every animal arrives with **exactly the species,
size and `x` the tray depicted** — the silhouette's footprint and columns are exact even
though its species is not shown (AC-315), with no exceptions and no re-rolling.
*(v1 C2: `gameStore.js:101-135` re-rolled every column at spawn time; `validNextAnimals` at
`:80-89` was dead code.)*

**AC-302** Given 200 consecutive turns are played, Then AC-301 holds on all 200. Zero
tolerance.

**AC-303** *(amended)* Given a batch is generated, Then it occupies **at most `BOARD.width − 1`**
columns — 8 of 9. Expressed against the constant, never as a literal.

**AC-304** Given a batch is generated, Then no two animals in it overlap.

**AC-305** Given a batch is generated, Then every animal is fully within bounds:
`0 ≤ x` and `x + size ≤ BOARD.width`.

**AC-306** *(amended — the band is a control on the MEAN, no longer a per-batch equality; see
`gameplay.md` §5.2)* Given difficulty Savanna, Then the rolled target lies in **3–5** at turn
1, **4–6** from turn 13 and **5–7** from turn 25, which is its ceiling; and over 3,000+ turns
the **mean cells per turn is within ±0.15 of the band mean**, except at a difficulty's two
highest bands where the `W − 1` cap legitimately pulls it low — record those rather than
tuning them away.

**AC-307** *(amended for the 9-wide board)* Given difficulty Meadow, Then the target lies in
**2–4** at turn 1, **3–5** from turn 13 and **4–6** from turn 25, its ceiling. Given Tundra,
**4–6** at turn 1, **5–7** from turn 13 and **6–8** from turn 25, its ceiling.

**AC-307b** *(amended — exact equality no longer holds and this is deliberate)* Given any
batch, Then its cell total scatters around the rolled target rather than matching it, because
§5.2 draws a whole number of animals. **Stochastic rounding keeps the expectation on target**;
a batch that misses the target is not a defect, a *mean* that misses it is.

**AC-307c** Given any batch, Then it never exceeds `BOARD.width − 1` cells regardless of how
the rounding falls.

**AC-308b — THE REALISED SPECIES MIX.** Given 3,000+ generated turns per difficulty, Then the
**realised** share of each species is within **±2 percentage points** of its weight in
`gameplay.md` §5.4, and the realised **mean drawn size** within **±0.10** of the intended
2.10 / 2.42 / 2.75.

*(Nothing asserted this before, which is why the defect survived every prior round: AC-306–308
checked cell totals and band membership, never the mix. The approved algorithm drew Savanna at
48.9% rats against a weight of 25 and 6.6% elephants against 20 — mean drawn size 1.81 against
2.42, every difficulty about 0.7 of a cell lighter than specified. **The owner reporting that
the game "felt easy" was a defect report, not a tuning preference.**)*

**AC-308c** Given the generator, Then **no species is ever excluded from a draw for fitting
reasons** — the only permitted exclusion is the hard board limit `size ≤ CAP − filled`. A
candidate pool filtered by largest-free-run is the specific mistake AC-308b exists to catch.

**AC-308** Given Meadow, Savanna and Tundra are each played for 50 turns, Then the three runs
produce measurably different mean cells-per-turn. *(v1 C1: Normal and Hard were identical
because `Math.ceil(1.5) === Math.ceil(2)`.)*

**AC-309** *(amended — the old wording demanded a 9-column batch "at any difficulty", which is
unachievable by design: only Tundra's band reaches a high of 9, and only from turn 37.)*
Given 500 batches generated at **Tundra's ceiling band (6–8, turn 25+)**, Then at least one
occupies **8** columns — `BOARD.width − 1`, the maximum the invariant permits — and **none ever
occupies 9**, which would be a self-clearing arrival. *(v1 C3: the 1-column buffer capped every batch at 8 of 10 and averaged 6.0.)*

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

**AC-315** *(amended — the tray now shows silhouettes; see `ui.md` §6)* Given the tray, Then it
renders the batch as **silhouettes** at the board's cell width, in their exact spawn columns,
with no glyph, no panel seams and no species colour, and displays the batch's total cell count.

**AC-315b — PER-ANIMAL OUTLINES.** Given two adjacent arrivals, Then their silhouettes are
**visibly separate** — a fox at column 3 and two rats at columns 3 and 4 produce different
shapes, one 2-wide shadow against two 1-wide ones. *(Size is the only property that affects
how a piece behaves, so footprint is the plan-relevant information. A merged shadow would lose
it and would cross from "less specific" into misleading.)*

**AC-315c** Given a buffalo in the batch, Then its silhouette **keeps its gold rim**. A buffalo
behaves differently — it refuses to clear — so hiding it would withhold *mechanical* rather
than cosmetic information. The line: hide what is cosmetic, keep what changes the rules.

**AC-315d** Given the tray, Then the strip is **18 pt** tall and the tray block **31 pt**,
returning 14 pt to the board (`ui.md` §3.2).

**AC-315e — SHADOW BECOMES ANIMAL.** Given the arrival push-up, Then the **same views** travel
from the strip into row 0 and resolve from silhouette to animal as they cross — fill blooming
to the species colour, seams drawing in, glyph fading up, over the last 160 ms of the 260 ms
flight. AC-301's proof is unaffected: it is still literally the same view arriving where the
tray said it would.

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

**AC-318 — PACING, RE-MEASUREMENT REQUIRED.** Given 30 seeds per difficulty played by the
deterministic greedy bot with perfect information, Then median turns-per-run are **measured
and reported before any band is changed**. The previously approved ranges — Meadow 100–150,
Savanna 60–90, Tundra 35–55 — were measured on a **10-wide board with the biased species
mix** and both of those premises are now false, so they are a starting hypothesis rather than
an acceptance gate until re-measured.

**Measure after all three changes are in, never between them** (`gameplay.md` §5.7): the
species-mix fix makes the game substantially harder, elephant 5→4 makes it easier, and the
narrower row does both. They do not cancel in any computable way.

**AC-318b — THE MEASUREMENT SET.** Given the re-measurement run, Then it reports, per
difficulty: realised species mix (AC-308b), mean cells per turn per band (AC-306), turns per
run, maximum batch occupancy (AC-309), and the **median and 90th-percentile final score** —
the last of which nothing needs yet, but which is what the §13 ability thresholds must be
priced against rather than guessed.

**AC-318c** Given the pacing ranges are missed, Then tuning proceeds **bands first, ramp
interval second, species weights last**. The weights now do exactly what they say
(AC-308b), so changing them alters the game's character rather than its pace. *(v1 rendered flat green
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

### The origin recess *(a v1 affordance v2 had dropped)*

**AC-416 — THE ORIGIN IS MARKED FOR THE WHOLE DRAG.** Given the player is dragging an animal,
Then the cells it started in render as a **recess** for the entire drag, so the player never
has to remember where the piece began. *(v1 shipped this as the "Original Position Ghost";
v2's design dropped it. The owner's stated cost is concrete: a move is one per turn with no
undo, so losing the origin means either committing an unintended move or spending the next
action putting it back.)*

**AC-417** Given the origin recess, Then it renders as the cell ground **darkened 55%** plus
the dragged animal's species fill at **12%**, with a 1 pt `rgba(255,255,255,0.06)` inner top
edge — **no outline, no dashes, and no `accent` colour**, which the destination ghost owns.

**AC-418** Given an animal is dragged within the danger band, Then the recess darkens the
band's own `#2A1D24` ground rather than painting a fixed colour, so it reads correctly on
either ground.

**AC-419 — THREE REGISTERS, ONE OUTLINE.** Given a drag in progress, Then the board shows the
origin **recessed**, the body **solid** and the destination **outlined** — three different
kinds of treatment, not three outlines in different colours. Any change that gives the origin
a second dashed outline in the default theme is a defect.

**AC-420** Given a drag begins, Then the recess appears in the same `onBegin` worklet frame as
the grab lift, and **is not suppressed at zero displacement** — the body simply covers it and
uncovers it as the drag moves off.

**AC-421** Given a drag ends by any route — accepted, rejected, or cancelled — Then the recess
fades over **110 ms**, tracking the body.

**AC-422** Given a move is **rejected** (AC-406), Then the recess fades over the same 110 ms as
the body's return, so the two converge to nothing together, and the shake plays on the body
alone. The recess **does not outlive the shake**. *(A recess under a body that has come home
marks "where this came from" as the place it now is, and reads as a second piece.)*

**AC-423** Given a drag is in progress, Then the recess costs **zero** React commits: its
origin is fixed at gesture start and written once as a shared value in `onBegin`. AC-831 is
unaffected.

**AC-424** Given Reduce Motion is enabled, Then the origin recess is **still shown**. It is a
static state rather than motion, and only its 110 ms fade is animated, which already sits
inside the ≤120 ms cross-fade budget.

**AC-425** Given High Contrast is enabled, Then the origin instead takes a **2 pt dashed
`#FFFFFF` outline at 70%** with no fill, dashed **6 on / 4 off** against the destination
ghost's 3 on / 3 off so the two remain distinguishable by rhythm. *(A recess is a low-contrast
device by nature; High Contrast trades the register deliberately.)*

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

**AC-506 — BUFFALO SHRINK.** Given a row is complete and contains a buffalo of size `n > 1`
(buffalo spawns at **size 5**),
When the clear resolves, Then every non-buffalo animal in the row is removed, the buffalo's
size becomes `n − 1`, the buffalo's `x` is unchanged, and **the row does not clear**.

**AC-507** Given a row is complete and contains a buffalo of size 1, When the clear resolves,
Then the buffalo is removed from the board and marked retired.

**AC-508** Given a buffalo shrinks, Then its rendered body loses exactly one panel and the
panel count equals the new size.

**AC-509** Given a buffalo is on the board, Then the HUD buffalo chip is visible with **five**
segments, showing its remaining segments filled and its spent segments dimmed.

**AC-509b** Given a buffalo shrinks, Then the chip's segment fades on the **same 260 ms
timeline as the body's shrink**, not on the React commit. *(Slice 3 measured the chip reading
"1 of 4" beside a two-cell-wide body for a quarter second — the HUD contradicting the board
about the one fact the chip exists to report.)*

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

**AC-611** *(amended twice — both terms, and the bonus rose with the buffalo's size)* Given
the row completion that retires a buffalo, Then the score increases by **700** before
multipliers — 50 for the shrink plus **650** for the retirement. Taking the last segment is still taking a
segment.

**AC-611b** *(amended for buffalo size 5)* Given a buffalo is carried from size **5** to
retirement with every completion at chain depth 1 and streak ×1.0, Then it has paid exactly
**900** in total (50 × 4 + 700) across **five** row completions, against the 500 those rows
would have paid as ordinary clears. *(The +400 premium is deliberate: the bonus rose 500 → 650
because a size-5 buffalo costs a fifth completion and blocks 55% of a 9-wide row rather than
40% of a 10-wide one. A flat reward against a growing imposition would invert §6.4's
incentive.)*

**AC-612** Given a buffalo row resolves, Then that row does **not** count toward `n` in the
simultaneous-rows table.

**AC-613** Given a Perfect Clear, Then the score increases by 1000 and the streak multiplier
is set to 3.0. Precedence against every other streak rule is AC-609.

**AC-614** Given any number of turns elapse with no clears, Then the score does not change.
Turns are never worth points.

**AC-615** *(amended — see `ui.md` §8.2a)* Given the score changes, Then the HUD count-up and
the floating `+N` both **start at the turn's first clear unit's `collapseAt`** — never at the
React commit. The order the player sees is flash → collapse → score.

**AC-615b** Given an ARRIVAL-phase clear, Then the score does **not** reach its final value
before the flash begins. *(Slice 3 measured the count-up finishing at 400 ms while the flash
started at 570 ms — the HUD answering before the board asked.)*

**AC-615c** Given a cascade, Then there is **one** count-up for the turn, of duration
`max(400, lastClearUnit.collapseAt − firstClearUnit.collapseAt + 400)`, targeting the turn's
final score — one accumulating sweep, not a counter that restarts on every step.

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

**AC-813e** Given any clear step, Then the flash peaks at **0.92** on the animal body and
**0.22** on the row's background cells, reached at the end of the attack.

**AC-813f** Given any clear step, Then the flash is an **additive overlay, never a fill swap**:
the body keeps its species colour and panel seams underneath throughout, and they resurface
through the decay. *(A fill swap would destroy §5.2's size cues rather than briefly
overwhelming them.)*

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

**AC-823b** Given a cascade, Then step *n+1* begins at **75%** through step *n*'s fall, which
follows from AC-823's interval (collapse 0–110 ms, fall 110–310 ms, 260 ms interval →
(260−110)/200). *(§8.2's prose said 60%; it had been stale since before §8.2a.)*

**AC-824d — ANTICIPATION, PROVISIONAL.** *(amended — the approved "0.10 row wash" assumed a
uniform band; a row about to complete is nearly full, so what renders is a lit **gap**. That
is the better cue and is now the specified intent rather than a side effect.)* Given an
ARRIVAL-phase clear, Then the row the arrival is about to complete washes in across the 260 ms
push-up at **0.14 on its unoccupied cells** — the gap the arrival fills — and **0.05 on its
occupied cells**, so the gap is the primary read and still belongs to a row.

**AC-824d2** Given the anticipation wash needs adjusting on device, Then the **occupied** alpha
is the lever for row-level presence and the unoccupied alpha for gap presence. Raising both
together is a defect in judgement, not a tuning step: a uniform increase makes the empty part
shout, which is the failure mode that turns a focus into a smear.

**AC-824e — DERIVED, NOT RESTATED.** Given `node docs/v2/budget.mjs` is run, Then it exits 0
and its printed table **matches the figures in `ui.md` §8.2 exactly**. The absolute worst case
is a **3/3 split of 6 animated units = 2360 ms → 0.636×**, and every one of the 882 legal
`(settle, arrival)` splits stays above the 0.55× floor. *(A figure in §8.2 has gone stale
behind its own ACs three times — 0.78×, 0.71×, and "60% through the fall" — every time because
prose restated an arithmetic result. It is now computed.)*

**AC-824f — THE CLOCK STARTS AT FINGER-UP.** Given AC-820, AC-821 and AC-822, Then their
budgets are measured from **finger-up**, not from the React commit, and the presentation layer
subtracts `commitTime − fingerUpTime` from the budget before scaling the timeline. *(Slice 3
measured that gap at a median of 61 ms, p90 94, max 114 in a dev web bundle, which put a real
single-clear turn at ~1021 ms against AC-821's 960. A release iOS build will be far smaller
but not zero.)* Where the measured gap is under one frame (≈16 ms) the correction may be
skipped. **The gap must be measured on device** as part of the AC-824c review.

**AC-824c — PROVISIONAL / THE DEVICE REVIEW LIST.** Given the §8.2a clear timings (flash
320 ms, lead beat 80 ms, interval 260→200 ms), Then they are **reviewed against a real build
before being locked**, together with everything else that cannot be settled off-device:

| | what to look for |
|---|---|
| §8.2a clear timings | does the clear still read as abrupt? |
| Flash peak 0.92 (AC-813e) | does a **multi-row** clear read as one event, or as a white band? If it flattens, lower the body peak before touching the duration. |
| Anticipation wash (AC-824d) | focus, or smear? If smear, drop it and accept the 570 ms. |
| Commit gap (AC-824f) | measure `commitTime − fingerUpTime` on a release build. |
| Screen shake (AC-811) | never occurred in ~250 bot turns; the trigger is proved at the plan layer but nobody has watched it render. |
| A rendered 2-step cascade | real but rare — max depth 2 across 111 clearing turns. |
| Anticipation wash (AC-824d) | gap cue, or too quiet to register on a full board at arm's length? Lever in AC-824d2. |
| **The whole Dynamic Type group** (AC-910b–g) | **unverifiable off-device.** `react-native-web` hard-codes `fontScale: 1` (`Dimensions/index.js:17`) and ignores both `allowFontScaling` and `maxFontSizeMultiplier`, so Tier 2 can only source-audit plus unit-test `hudScale(fontScale, compact)`. Needs an iOS device. |


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

**AC-905** *(amended — the approved spec said "10 pt / 600 mono" and nothing about colour, so
the numeral inherited the species glyph style and three of five species failed AC-909: fox
4.46, elk 3.92, elephant 3.47)* Given the Size Numerals toggle is on, Then every animal
displays its size digit at 10 pt / 600 mono in `ink` **`#EFF4F8`** at **full opacity**, on a
**solid `#0D141B` chip** — radius 3, 2 pt horizontal padding, inset 3 pt from the bottom-right
corner.

**AC-905b** Given the size numeral on **any** species, Then its contrast is **16.7:1**, fixed
by the chip rather than dependent on the fill beneath it. An accessibility aid that itself
fails contrast is worse than no aid.

**AC-906** Given the High Contrast toggle is on, Then animal borders are 2.5 pt white and
seams are 1.5 pt white at 55%.

**AC-906b** Given the three accessibility toggles, Then persistence is **Layer A (Slice 4)**;
until AsyncStorage lands under AC-10xx they are session-scoped, which is a deliberate deferral
rather than an omission.

**AC-907** Given OS Reduce Motion is enabled, Then every transform animation becomes a
≤120 ms cross-fade, the illegal-move shake becomes a static 400 ms red rim, the danger pulse
becomes a static wash, and screen shake is disabled.

**AC-908** Given a deuteranopia or protanopia simulation, Then every animal's size remains
determinable from width and panel count alone.

**AC-908b** Given Brettel/Viénot simulation over the §4.3 palette, Then the worst pairs are
recorded accurately: **deuteranopia** closest pair **fox/elk** at RGB distance 53;
**protanopia** fox/elk at distance **20** (`#9b9b48` vs `#9e9e5c`). Both are acceptable — fox
and elk are adjacent in size and therefore adjacent on the lightness ramp, so the collision is
the ramp working as designed. **Do not separate fox and elk in hue to fix it**: that breaks
the size→lightness mapping to rescue a species distinction the game does not use.

**AC-909** Given every text/background pair in the app, Then contrast is at least 4.5:1,
except `ink-dim` which is used only at 10 pt / 600 uppercase and always paired with an
`ink`-weight value.

**AC-910** *(amended — the approved wording was unsatisfiable; see `ui.md` §10)* Given Dynamic
Type is set to any size, Then the **board never scales**, and no text anywhere is clipped or
truncated.

**AC-910b** Given Dynamic Type at any size up to `AccessibilityExtraExtraExtraLarge`, Then all
**sheet and overlay** text — Pause, Game Over, Settings, Records, How to Play — scales fully,
scrolling where needed.

**AC-910c** *(amended — the approved wording said "only on HUD text", which taken literally
also stripped the board, contradicting AC-910, and stripped the action bar and tray labels,
producing the clipping AC-910 forbids)*. Given the source tree, Then text scaling follows a
**three-way** split:

| Surface | Treatment |
|---|---|
| **HUD and board** | `allowFontScaling={false}` — the board is spatial, the HUD trades labels for values (AC-910d) |
| **Fixed-height chrome** — action bar, tray label row | `maxFontSizeMultiplier` **1.5** and **1.3** |
| **Everything else** — sheets, overlays | scales without limit (AC-910b) |

**A cap is not an exemption.** Capped text still scales with the player's setting; it stops
before it clips. That is a different thing from refusing to scale, and the approved AC had no
vocabulary for it. *(At AccessibilityXXXL a 16 pt Pass label is ~50 pt inside a 44 pt button;
capped at 1.5× it is 24 pt and fits.)*

**AC-910g** Given the hygiene audit, Then it encodes this three-way split, so a tester greps
the audit rather than parsing prose.

**AC-910h** Given Tier 2 (web) verification, Then AC-910b–g are **not observable there at
all**: `react-native-web` hard-codes `fontScale: 1` (`Dimensions/index.js:17`) and ignores both
`allowFontScaling` and `maxFontSizeMultiplier`. Tier 2 may verify them only by source audit
plus a pure-function test of `hudScale(fontScale, compact)`; behavioural verification requires
an iOS device and belongs to the AC-824c review.

**AC-910d** Given Dynamic Type at `xxLarge` or above, Then the HUD **keeps its fixed height**
and instead drops its 10 pt uppercase labels and grows its values into the freed space: the
score goes to 40 pt in a 52 pt HUD and 34 pt in a 44 pt compact HUD, with the streak pill and
buffalo chip scaling to match.

**AC-910e** Given any Dynamic Type size, Then the HUD's height is unchanged and the board's
cell size is unaffected. *(The ladder's chrome budget is what guarantees the board fits;
letting the HUD grow would spend board rows on chrome for the players least able to afford
losing them.)*

**AC-910f** Given VoiceOver at any Dynamic Type size, Then every HUD value is still announced
with its name, because the names live on `accessibilityLabel` rather than on the visible
labels that AC-910d hides.

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

---

## AC-14xx · Special abilities (Layer D)

Structure per `gameplay.md` §13 and `ui.md` §13. **Every threshold is provisional pending
AC-318b** — the economy is priced in score and the score distribution for a 9-wide board with
a corrected species mix does not exist yet. This group **blocks nothing in Slices 4–6.**

**AC-1401** Given a run, Then five abilities exist, one per species: Rat **Burrow** (remove one
animal), Fox **Dart** (three moves this turn), Elk **Migrate** (remove every animal of one
species), Elephant **Stampede** (left-pack every row, then gravity), Buffalo **Hold the Line**
(no arrivals for 3 turns).

**AC-1402** Given any ability, Then it is available regardless of whether that species is on
the board.

**AC-1403 — SPENDING COSTS NO SCORE.** Given a charge is spent, Then the player's score is
**unchanged**. Thresholds are gates, not purchases. *(If spending deducted score, the
leaderboard would reward never using the mechanic.)*

**AC-1404** Given AC-318's pacing measurement, Then it is run with **abilities disabled** —
they describe the difficulty curve, and a curve containing an optional player intervention is
not a curve. Abilities are measured separately.

**AC-1405** Given a player crosses a score threshold, Then one charge is granted, **at most 3
are held at once**, and thresholds escalate. *(Provisional: 1,500 / 4,000 / 8,000 / 14,000 /
22,000 / 32,000 — to be re-priced against AC-318b's measured score distribution.)*

**AC-1406** Given a turn, Then using an ability **is the player's action** for that turn. Move,
pass, or ability — the one-action rule (`gameplay.md` §6.2) admits no exemption.

**AC-1407** Given Fox's Dart, Then the player may make up to three moves that turn, and the
turn resolves after the third or when they choose to end it early.

**AC-1408** Given clears caused by an ability, Then they score normally. *(The ability → clears
→ score → charge loop is bounded by the escalating thresholds and the 3-charge cap.)*

**AC-1409 — RUNS STILL ALWAYS END.** Given unlimited skilled play with abilities, Then a run
still terminates. *(The economy is self-limiting: charges come from score, score from
clearing, clearing from arrivals. A player cannot freeze their way to an unbounded run because
freezing stops the supply of the thing that buys freezes.)*

**AC-1410** Given Hold the Line, Then no arrival occurs for the next 3 turns, and the tray
greys out and displays `FROZEN · n` counting down. *(The tray's contract is that it shows what
is coming; when nothing is coming it must say so, or the contract reads as broken.)*

**AC-1411** Given Stampede, Then every row's animals slide left to close gaps **within** that
row, then gravity applies. It never completes a row by itself — a seven-cell row still holds
seven cells afterwards.

**AC-1412** Given Migrate, Then every animal of the chosen species leaves the board, and
buffalo is **not** a selectable target.

**AC-1413** Given an ability is armed, Then **no charge is spent until the player confirms**;
opening the sheet and reading it costs nothing.

**AC-1414 — CANCEL IS ALWAYS ONE TAP AND ALWAYS FREE.** Given a targeting state, Then Cancel,
or a tap outside any valid target, returns to `YOUR MOVE` **without spending the charge**. *(A
player who arms the wrong ability and cannot back out has been punished for exploring the
system, which is the opposite of what an assist mechanic is for.)*

**AC-1415** Given zero charges, Then the abilities button is disabled but **still visible**, and
the action bar does not reflow.

**AC-1416** Given a resume, Then charges are reconstructed by replaying the run: an ability use
is a third move type `{ t: 'A', ability, target }` in `moves[]` and nothing new is persisted.

**AC-1417** Given any ability resolves, Then the input-lock budget (AC-822) still holds — every
ability animation in `ui.md` §13.4 is an announcement over an ordinary structural resolution.
