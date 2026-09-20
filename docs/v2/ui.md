# Wildlife Shuffle v2 — UI & Visual Design

Status: **for owner review.** Companion to `gameplay.md`.

> ## → [Interactive visual system](https://claude.ai/artifact/VyhrjkWARs2nj4dwBrxHYT)
>
> The board rendered at 1:1 on a 393×852 pt iPhone frame, with toggles for **v1 vs v2**,
> the accessibility aids, and every feedback state played at its specified timing.
> Open it alongside this document — §5 and §8 below are much easier to judge there than
> in prose. Every hex code and duration on that page is normative and matches this spec.

---

## 1. Design position

**The board is the screen.** Every other element has to justify its pixels against the board
it is stealing them from. The HUD is 52 pt, the tray is 44 pt, the action bar is 48 pt, and
that is the entire chrome budget.

**Size is the mechanic, so size must be the loudest property on screen.** v1 drew every
animal as the same `#2255dd` rectangle (`src/components/Animal.js:31`), distinguished only
by an emoji and its width. v2 encodes size **four** ways, redundantly (§5.2).

**Dark only.** `userInterfaceStyle: "dark"` in `app.json`. A dark ground is what lets five
saturated species fills separate at a 36 pt cell, and a light theme would double the visual
QA surface for no gameplay gain. This is a decision, not an omission.

---

## 2. Screen inventory

| # | Screen | Type | Layer |
|---|---|---|---|
| S1 | **Home** | Full screen | F |
| S2 | **Game** | Full screen | F |
| S3 | **Pause** | Bottom sheet over S2 | F |
| S4 | **Game Over** | Bottom sheet over S2 | F |
| S5 | **How to Play** | Full screen, from S1 or S3 | F |
| S6 | **Settings** | Bottom sheet from S1 | F |
| S7 | **Onboarding** | Overlay on S2, first run only | C |
| S8 | **Records** | Full screen from S1 | A |
| S9 | **Collection** (unlocks) | Full screen from S1 | A |

v1's `SettingsMenu` (grid-width and grid-height steppers) is **deleted**. The board is fixed
at 10×15 (`gameplay.md` §3); difficulty selection moves onto Home where it belongs, as one
row of three choices rather than a settings gate in front of the game.

---

## 3. Layout & geometry

### 3.1 The reference device — 6.1" iPhone, 393 × 852 pt

```
┌─────────────────────────────────────────────┐  ← 393 pt
│ ░░░░░░░░░░░░░ safe area top 59 ░░░░░░░░░░░░ │     (Dynamic Island lives here)
├─────────────────────────────────────────────┤
│  SCORE                     ×2.4  🐃▌▌▌  ❙❙  │  52   HUD
│  12,480                                      │
├─────────────────────────────────────────────┤
│                  ↕ flex                      │
│      ┌───────────────────────────────┐      │
│      │ ╱╱╱╱╱ KILL LINE  row 14 ╱╱╱╱╱ │      │ 36
│      │ · · · danger band  11–13 · · · │      │108
│      │                               │      │
│      │                               │      │ 540  BOARD
│      │            ▓▓▓                │      │      10 × 15
│      │        ▓▓▓▓▓▓▓▓▓              │      │      @ 36 pt
│      │   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓          │      │
│      │  🐘🐘🐘🐘🐘 🦌🦌🦌 🦊🦊        │      │ 36   row 0
│      └───────────────────────────────┘      │
│              ← 360 pt, 16.5 gutters →       │
│                     16 gap                   │
│      NEXT ARRIVAL                  6 CELLS  │ 14
│      ▐🐀▌ ▐🦊🦊▌   ▐🦌🦌🦌▌              │ 28   TRAY
│      ╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱      │  3   hazard rule
│                  ↕ flex                      │
├─────────────────────────────────────────────┤
│        YOUR MOVE        [    Pass    ]      │ 48   ACTION BAR
├─────────────────────────────────────────────┤
│ ░░░░░ safe area bottom 34 (home indicator) ░ │
└─────────────────────────────────────────────┘  ← 852 pt
```

Fixed heights: HUD 52, tray block 45 (14 label + 28 strip + 3 rule), action bar 48.
The HUD pins under the top safe inset, the action bar pins above the bottom safe inset, and
the **board + tray group is a flex child centred in whatever remains**. That rule is what
makes the layout survive every device without per-device special cases.

### 3.2 The cell-size formula

v1 had *two* disagreeing formulas — `GameScreen.js:14` sized on width only, `GameGrid.js:27`
on `min(width, height)` — so the board sat off-centre in its own frame
(`docs/v1-review.md` D1). **There is exactly one formula in v2**, computed once in the Game
screen and passed down as a prop. No component computes its own.

```js
const chrome = 52 /*hud*/ + 48 /*action*/ + 45 /*tray*/ + 32 /*min gaps*/;
const availH = screenH - insetTop - insetBottom - chrome;
const cell   = clamp(Math.floor(Math.min((screenW - 32) / 10, availH / 15)), 28, 44);
```

| Device | pt | insets | cell | board | verdict |
|---|---|---|---|---:|---|
| iPhone SE (3rd gen) | 375 × 667 | 20 / 0 | **30** | 300 × 450 | fits, 37.5 gutters |
| iPhone 13 mini | 375 × 812 | 50 / 34 | **30** | 300 × 450 | fits |
| **iPhone 15 / 16 (target)** | 393 × 852 | 59 / 34 | **36** | 360 × 540 | fits, 16.5 gutters |
| iPhone 15/16 Plus | 430 × 932 | 59 / 34 | **39** | 390 × 585 | fits |
| iPhone 16 Pro Max | 440 × 956 | 62 / 34 | **40** | 400 × 600 | fits |

Clamp floor 28 pt, ceiling 44 pt. The ceiling stops the board ballooning on large phones;
the floor is the point below which the glyphs stop reading, and no supported iPhone hits it.

**iPad is out of scope.** `app.json` currently has `"supportsTabletMode": true` — which is
not a valid Expo key at all (the real one is `ios.supportsTablet`). Set
`"supportsTablet": false`. Supporting iPad means designing a second layout and shooting a
second screenshot set for a phone game.

### 3.3 Safe area

`SafeAreaView` from `react-native` is deprecated and handles neither the Dynamic Island nor
the home indicator correctly (`docs/v1-review.md` D7). Use `SafeAreaProvider` +
`useSafeAreaInsets` from `react-native-safe-area-context`, which is already in the tree.
Insets are read as numbers and fed into the layout formula above — never as an opaque
wrapper view, because the formula needs the values.

---

## 4. Colour

Full swatch set with hex codes in the [visual system](https://claude.ai/artifact/VyhrjkWARs2nj4dwBrxHYT) §02.

### 4.1 Surfaces

| Token | Hex | Use |
|---|---|---|
| `bg` | `#0D141B` | App ground |
| `panel` | `#131E28` | Sheets, cards, buttons |
| `panel-sunken` | `#0F1A23` | Tray strip, stat tiles |
| `board` | `#16212C` | Board frame |
| `cell` | `#1A2833` | Empty cell |
| `cell-line` | `#223442` | 0.5 pt inset cell border |
| `hairline` | `#24333F` | All 1 pt dividers and control borders |

### 4.2 Ink & semantics

| Token | Hex | Contrast on `bg` | Use |
|---|---|---:|---|
| `ink` | `#EFF4F8` | 15.3:1 | Primary text, scores |
| `ink-muted` | `#8DA0B0` | 6.4:1 | Body copy, secondary stats |
| `ink-dim` | `#5E7183` | 3.4:1 | Uppercase labels ≥ 10 pt 600 only |
| `accent` | `#FFC24B` | 10.6:1 | Score, primary button, streak pill |
| `success` | `#6FD08C` | 8.4:1 | New best, chain multiplier |
| `illegal` | `#FF5C5C` | 5.4:1 | Rejected move rim |
| `kill-line` | `#E05260` | 4.5:1 | Top-row hazard rule |
| `danger-band` | `#2A1D24` | — | Rows 11–13 tint |

`ink-dim` is below 4.5:1 and is therefore **restricted to 10 pt / 600 uppercase labels**,
which qualify as large text under WCAG only in combination with the surrounding structure.
Where a dim label carries information a player needs (stat captions), it is always paired
with an `ink`-weight value directly above it.

### 4.3 Species

| Species | Size | Fill | Edge | Glyph ink | L* |
|---|---:|---|---|---|---:|
| Rat 🐀 | 1 | `#FFD166` | `#D9A83C` | `#4A3708` | 86 |
| Fox 🦊 | 2 | `#F58A47` | `#C96A2C` | `#46200A` | 69 |
| Elk 🦌 | 3 | `#5FA45C` | `#427A40` | `#0F2D10` | 61 |
| Elephant 🐘 | 5 | `#5B6E88` | `#3F4F66` | `#DCE6F2` | 46 |
| **Buffalo 🐃** | 4 | `#8C3B4A` | `#E8B44A` (2 pt) | `#FFE3B0` | 36 |

**Lightness descends monotonically with size** for the four ordinary species, so a heavier
animal is literally a heavier-looking block. Buffalo is deliberately **off the ramp**: it is
not a bigger animal, it is a different *kind* of object — the only piece that refuses to
clear — so the ox-blood fill and 2 pt gold rim mark it as special rather than as "size 4".

---

## 5. The animal component

### 5.1 Geometry

```
left   = x * cell            width  = size * cell
top    = (15 - 1 - y) * cell height = cell
radius = 6                   border = 1.5 pt solid `edge`   (buffalo: 2 pt `#E8B44A`)
glyph  = round(cell * 0.53) pt, centred     // 19 pt at cell 36
```

Row 0 is the bottom, so `top` inverts `y`. This is a *presentation* transform and must live
in the renderer, never in the rules engine.

### 5.2 The four size cues

The point of §5 is this list. Any one of these can be missed; all four cannot.

1. **Width.** `size × cell` pt. The primary cue, and the one v1 had.
2. **Panels.** The body is divided into **exactly `size` panels** by 1 pt seams at
   `rgba(0,0,0,.22)`, inset 4 pt top and bottom, placed at `i × cell` for `i = 1..size-1`.
   Because the seams land on real column boundaries, the body does not merely *suggest* its
   footprint — it counts it out, and the player can see exactly which columns it occupies.
   This is the single highest-value addition in the visual system.
3. **Lightness.** Descends with size (§4.3).
4. **Glyph.** The emoji. Decorative reinforcement only — it is the *least* reliable cue
   (emoji render differently across OS versions) and nothing may depend on it alone.

Optional fifth: **Size numerals**, an accessibility toggle (§10) that prints the size digit
bottom-right of each body at 10 pt / 600 mono.

### 5.3 Buffalo

The buffalo's panels double as its health bar: a size-3 buffalo shows three panels, and each
shrink visibly removes one. Additional treatment:

- 2 pt `#E8B44A` gold rim plus `inset 0 0 12px rgba(232,180,74,.14)` — it glows faintly from
  within, and is the only piece on the board that does.
- Its seams are gold (`rgba(232,180,74,.5)`), not black, so the panel count reads as segments
  of a thing rather than shading.
- **HUD chip.** Whenever a buffalo is on the board, a chip sits in the HUD: the glyph plus
  four 5 × 12 pt bars, filled for remaining segments and at 22% opacity for spent ones. The
  player should never have to hunt the board to find out how much buffalo is left.

### 5.4 Animal states

| State | Treatment |
|---|---|
| **Rest** | As specified above. |
| **Grabbed** | Scale 1.04, `shadow 0 6px 16px rgba(0,0,0,.45)`, edge brightens 12%, 2 pt lift, over 90 ms. Driven from the gesture's `onBegin` worklet, so the lift lands on the same frame as the touch; the selection haptic fires with it. |
| **Dragging** | Follows the finger with **0 ms** smoothing — positioned by the same UI-thread frame that delivers the touch (§8.3) — and snaps to the nearest column over 110 ms. v1 had an empty `dropping: {}` style object (`src/components/Animal.js:51`) while the README advertised "scale + shadow" — there was no drag feedback at all. |
| **Drop target — legal** | A 2 pt `accent` dashed ghost at the destination columns, fill `rgba(255,194,75,.10)`. |
| **Drop target — illegal** | The ghost turns `illegal` red and the **swept path is shown blocked**: the obstructing animal gets a 2 pt red rim. The player sees *why* before releasing. This is the fix for v1's silent rejection (`docs/v1-review.md` C5). |
| **Illegal release** | Shake + red rim, §8. Pure announcement — it locks nothing, so the next drag can begin on the following frame. |
| **Clearing** | White flash then collapse, §8. |
| **Danger** | Any animal in rows 11–13 gets a 1 pt `kill-line` outer rim at 40%. |

---

## 6. The tray — the preview contract, made visible

This is the component that carries v2's central promise, so it is designed to *look* like a
promise rather than like a decoration.

v1 rendered the preview as a row of flat green occupancy squares (`GamePreview.js:33-46`) —
and then re-rolled the positions anyway (`gameStore.js:101-135`). Two failures: it did not
show *what* was coming, only *where*, and the where was a lie.

**v2 renders the actual animals** at the same cell width as the board, in their exact spawn
columns, in their exact species colours, with their exact panel counts.

```
NEXT ARRIVAL                                     6 CELLS
┌──────────────────────────────────────────────────────┐
│   ▐🐀▌  ▐🦊 |🦊▌      ▐🦌 |🦌 |🦌▌               │  28 pt strip
└──────────────────────────────────────────────────────┘
╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱   3 pt hazard rule
```

- Strip is 360 × 28 pt (`cell` wide, `0.78 × cell` tall), ground `panel-sunken`, 1 pt
  `hairline` border, radius 6.
- Animals render at 26 pt tall, radius 4, glyph 15 pt — flattened versions of their board
  selves, so the shape reads as the same object arriving.
- The **hazard rule** beneath the strip (3 pt, 45° `accent` stripes at 45%) reads as "these
  push up from here", which is what actually happens (`gameplay.md` §2).
- Right-hand counter shows the batch's total footprint (`6 CELLS`) so the player can judge
  arrival pressure numerically as well as spatially.

**During the arrival animation, the tray animals physically travel from the strip into row 0
over 260 ms.** They are the same views. That is the most direct possible demonstration that
the tray was telling the truth, and it should be the first thing beat 3 of onboarding points at.

---

## 7. Board chrome

**Kill line — row 14.** 36 pt tall, 45° hazard stripes at `rgba(224,82,96,.13)` on a 14 pt
pitch, with a 1.5 pt solid `kill-line` bottom border. Reaching this row ends the run, so it
is drawn as a hazard, never as a playable row.

**Danger band — rows 11–13.** Ground shifts to `danger-band` `#2A1D24`, cell borders to
`rgba(107,47,58,.55)`. When any animal occupies the band, a `kill-line` wash pulses over it
at 5%↔13% opacity on a 1200 ms ease-in-out loop. It is a `withRepeat` worklet on the UI
thread (§8.3), so an infinite ambient loop costs zero JS frames — driven from JS it would be a
permanent tax on every other animation in the game. The pulse is the only ambient animation
here and it exists solely to raise the player's pulse; it stops the moment the band is clear.

**Cells.** `cell` fill with a 0.5 pt inset `cell-line` border. Inset, not outset — an outset
border at 0.5 pt produces seams that shift by a fraction of a pixel across the board. All 150
cells are one memoized component that never re-renders during a run (§8.3 ·6); animals are the
board's only dynamic children.

---

## 8. Motion

Every value below is played back at spec timing in the
[visual system](https://claude.ai/artifact/VyhrjkWARs2nj4dwBrxHYT) §03.

The **Gates input** column is normative and is the most important column in the table. It is
what separates an animation the player must wait out from one that is allowed to finish in
its own time while they carry on playing. See §8.1.

| Moment | Duration | Easing | Gates input | What it communicates |
|---|---:|---|:---:|---|
| Grab lift | 90 ms | `spring(.34,1.4,.64,1)` | no | The piece is yours now |
| Drag follow | 0 ms | — | — | The piece is under your thumb |
| Snap to column | 110 ms | `cubic-bezier(.22,1,.36,1)` | **yes** | The move committed to a column |
| Illegal move | 260 ms | `cubic-bezier(.36,.07,.19,.97)` | no | 3 × 6 pt shake + 2 pt red rim + `notificationError` haptic |
| Gravity fall | 200 ms | `cubic-bezier(.55,0,1,.45)` | **yes** | Accelerating — it *fell* |
| Land squash | 140 ms | `spring(.34,1.56,.64,1)` | no | It has weight and has stopped |
| Clear flash | 140 ms | linear in, ease out | no | *These* rows are the ones going |
| Clear collapse | 110 ms | `cubic-bezier(.4,0,1,.4)` | **yes** | That row is gone |
| Cascade step interval | 250 ms → 150 ms | see §8.2 | **yes** | A chain reaction, accelerating |
| Buffalo shrink | 260 ms | 120 crack + 260 respring | **yes** | The row did **not** clear |
| Arrival push-up | 260 ms | `cubic-bezier(.22,1,.36,1)` | **yes** | The tray told the truth |
| Score count-up | 400 ms | ease-out cubic | no | The size of what happened |
| Floating `+N` | 900 ms | rise 46 pt, ease-out | no | Where the points came from |
| Screen shake | 180 ms | 4 pt, decaying | no | Three or more rows at once |
| Danger pulse | 1200 ms loop | ease-in-out | no | You are three rows from dead |
| Game over | 240 + 280 ms, overlapped | dim, then slide | — | The board is finished |
| Sheet in / out | 280 / 220 ms | `cubic-bezier(.22,1,.36,1)` | — | — |

### 8.1 Three classes of animation

Every animation in the table belongs to exactly one of these, and the class determines
whether the player has to wait for it.

**Structural** — anything that moves an animal to a different cell: snap, fall, collapse,
buffalo re-width, arrival push-up. These gate input, because letting the player act on a
board whose pieces are mid-flight is unfair. Structural time is the only thing that counts
toward the budget in §8.2.

**Announcement** — flash, floating `+N`, score count-up, screen shake, land squash, particle
burst, buffalo crack shard, the illegal-move shake. These **never** gate input and are
explicitly allowed to outlive the lock and to be still playing when the next turn begins. A
new player action does not cancel them; they simply finish.

**Ambient** — the danger-band pulse. Gates nothing, runs on a `withRepeat` worklet, costs
zero JS frames, and stops the moment the band is clear.

Two consequences worth stating plainly, because both are fluidity wins the naive reading of
the old table would have missed:

- **The clear flash overlays the collapse, it does not precede it.** v1 flashed and *then*
  removed. Flashing concurrently with the collapse is both faster and more legible — the
  accent lands on the rows as they go, rather than on rows that then sit there.
- **An illegal move locks nothing.** The shake is pure announcement. The player can start
  their next drag on the very next frame, which is exactly what someone who has just been
  told "no" wants to do.
- **Game over dims and slides at the same time**, not one after the other. The dim starts at
  t=0 and the sheet at t=120, both done by 400 ms, so the player reaches their score in 400 ms
  rather than 580. The dim is an opacity-animated overlay view, **never** an animated
  `filter: saturate()` — RN cannot drive a filter from the UI thread, so the approved draft's
  "desaturate" would have janked at the one moment the player is definitely watching.

### 8.2 The input-lock budget

> **Worst case, from finger-up to input reopening: 1500 ms. Typical clearing turn: 880 ms.
> Turn with no clear: 570 ms.**

This replaces the ~3.2 s figure in the approved draft. A three-second lockout is the opposite
of fluid however good the frames inside it are, and a long cascade is precisely the moment a
player most wants to keep acting.

**Where the old 3.2 s went.** Three changes, in order of how much they bought:

1. **Cascade steps pipeline instead of queueing.** Step *n+1*'s flash and collapse begin
   while step *n*'s animals are still falling — at 60% through their fall, where the
   destination is already unambiguous. The engine has already resolved the whole cascade, so
   the presentation layer knows the entire timeline up front and can overlap it. This is not
   a shortcut: a chain reaction that visibly overlaps reads *more* like a chain reaction than
   a sequence of discrete slides, and the rising audio cue per step keeps the count legible.
2. **The flash moved from serial to concurrent** with the collapse (§8.1), removing 220 ms
   from every step.
3. **Per-turn animations got tighter.** Arrival push-up 340 → 260 ms, gravity fall 220 →
   200 ms, snap 120 → 110 ms. The arrival plays on *every single turn*, so it is the highest
   leverage number in the whole spec.

**Step interval.** The gap between the start of cascade step *k* and step *k+1*:

```
interval(k) = max(150, 250 − 20 × (k − 1))     // 250, 230, 210, 190, 170, 150 …
```

It tightens as the chain deepens, which is both faster and dramatically correct — a cascade
should feel like it is accelerating.

**At most 5 cascade steps are animated separately.** Steps 6 and beyond are replayed as one
combined final step. Nobody can read eight discrete cascade steps; past five the drama is in
the total, not the enumeration, and a six-step cascade on a 15-row board is close to
theoretical. The engine still resolves all of them and still scores every one — this is a
presentation cap only, and it must not change a single point of score.

**The arithmetic.**

```
No clear        snap 110 + settle 200 + arrival 260                      =  570 ms
Typical clear   snap 110 + settle 200 + 1 step 310 + arrival 260         =  880 ms

Absolute worst  the 5 animated steps split 3 / 2 across Phase 2 and 3,
                which costs more than 5 in one phase because each phase
                pays its own final settle:
                  Phase-2 cascade  250 + 230 + 310                       =   790
                  Phase-3 cascade  250 + 310                             =   560
                  snap 110 + settle 200 + arrival 260                    =   570
                                                                   total = 1920 ms
```

**The guarantee.** The presentation layer lays the timeline out from the target timings
above, then **uniformly time-scales it so it never exceeds 1500 ms**. Uniform scaling is the
readability-preserving form of compression: every step stays distinct, the sequence keeps its
shape, everything simply plays faster. Worst case needs 1500 / 1920 = **0.78×**, which is
imperceptible. The scale floor is 0.55×, below which motion stops reading; the 5-step cap
above is what guarantees the floor is never reached.

Input reopens at the end of the *structural* timeline, which is the guaranteed ≤ 1500 ms —
not when the last announcement animation finishes. A tap during the lock is **buffered and
applied at the next READY phase**, never dropped. Nothing in this game ever swallows a touch.

### 8.3 UI-thread implementation contract

**This subsection is normative.** The timings above are unimplementable on this stack if
animation is driven the way v1 drove it, and a developer reading only the table could
reasonably rebuild v1's approach.

v1 animated by calling `setState` from `setTimeout` timers, which routes every animation
frame through the JS thread alongside game logic and React reconciliation. That cannot hold
60 fps. It is also the specific reason v1's drag feels dead: the
`PanResponder` → `setState` → re-render round trip means the piece *chases* the thumb by a
frame or more instead of tracking it.

Both libraries needed to do this properly are **already in `package.json` and both are
effectively unused**: `App.js:18` mounts `GestureHandlerRootView` and then `GameGrid.js:30`
uses `PanResponder` anyway.

The contract:

1. **Every transform in the table above runs on the UI thread as a Reanimated worklet.**
   No animation may be driven by `setState`, by `setTimeout`, or by a React re-render.
   Positions, scales, opacities and colours animate from shared values via
   `useAnimatedStyle`; sequencing uses `withSequence` / `withDelay` / `withTiming`, not
   chained timers. The danger pulse is a `withRepeat` worklet, so an infinite ambient loop
   costs zero JS frames.

2. **The drag is a `Gesture.Pan()` from `react-native-gesture-handler` writing to a shared
   value.** React learns the result **on release only**, through one `runOnJS` call carrying
   the final column. This is what makes "drag follow: 0 ms" literally true rather than
   aspirational — the body is positioned by the same UI-thread frame that delivers the touch.
   The legal/illegal destination ghost is likewise computed in the worklet from a snapshot of
   the row's occupancy taken at gesture start, so it updates at touch rate without a single
   render.

3. **Animation is a replay of state the engine has already resolved, never a driver of it.**
   The reducer resolves the entire turn synchronously before the first frame plays; the
   presentation layer receives the finished timeline and plays it back. If frames drop, the
   board is still correct and the turn still resolved — the player sees a stutter, not a
   different game. This is the same engine/presentation separation the tester depends on for
   determinism (`AC-201`, `AC-202`), stated from the animation side.

4. **`babel.config.js` with `react-native-reanimated/plugin` listed last is a precondition
   for any animation work.** There is no `babel.config.js` in the repo at all today, so
   Reanimated would silently do nothing — no error, no warning, just an app where none of
   this section happens. This is the first file of Slice 1.

5. **The board background does not re-render.** The 150 empty cells are a single memoized
   component with no props that change during a run; animals are the only dynamic children
   of the board. v1 rebuilt all 150 cell views inline inside render
   (`src/components/GameGrid.js:73-94`) on every frame of every animation.

6. **The JS thread stays free during a turn's animation.** The engine has already finished;
   the only JS work between finger-up and input reopening is scheduling. Anything else found
   on the JS thread during that window is a defect.

### 8.4 Reduce Motion

When `AccessibilityInfo.isReduceMotionEnabled` is true: every transform becomes a ≤ 120 ms
cross-fade, the illegal-move shake becomes a static 400 ms red rim, the danger pulse becomes
a static 10 % wash, and screen shake is disabled. Cascade steps still play in sequence at the
§8.2 intervals so the chain remains countable. No information is carried by motion alone, so
nothing is lost — and the input-lock budget only ever gets shorter.

---

## 9. Typography & spacing

System font (SF Pro). No bundled face — it costs nothing, it is the right face for iOS, and
it gets correct Dynamic Type behaviour for free.

| Role | Size / weight | Tracking | Use |
|---|---|---|---|
| Display | 34 / 800 | −0.02em | Final score, Home title |
| Score | 30 / 800 tabular | −0.02em | HUD running score |
| Title | 22 / 700 | −0.01em | Sheet and screen headings |
| Button | 16 / 600 | 0 | All primary actions |
| Body | 15 / 400 | 0 | Stats, tutorial copy |
| Label | 10 / 600 uppercase | 0.14em | `SCORE`, `NEXT ARRIVAL`, stat captions |

Any element showing digits that change or align gets `fontVariant: ['tabular-nums']` — the
HUD score, the streak pill, every stat tile. A score that reflows as it ticks looks broken.

**Spacing scale:** 4 · 8 · 12 · 16 · 24 · 32. Nothing off-scale.
**Radii:** animal 6 · tray strip 6 · button 12 · card 14 · sheet 22 (top corners only) · pill 999.
**Touch targets:** 44 pt minimum, always. At the 30 pt cell of an iPhone SE a rat is
30 × 30 pt, so **every animal carries `hitSlop` padding it out to 44 pt on all four sides**,
computed as `(44 - dimension) / 2`.

---

## 10. Accessibility

v1 had none — no labels, no roles, emoji-only semantics, unverified contrast
(`docs/v1-review.md` E).

**Labels.** Every animal:
`accessibilityLabel="Fox, size 2, row 4, columns 3 to 4"`, `accessibilityRole="button"`,
`accessibilityHint="Double tap and hold, then drag left or right"`.
The tray: `"Next arrival: rat at column 1, fox at columns 3 to 4, elk at columns 6 to 8. Six cells."`
The HUD score has `accessibilityLiveRegion="polite"` so a clear is announced.

**Colour independence.** Size never depends on hue: width, panel count and optional numerals
all carry it. A deuteranope loses the rat/fox distinction by colour and keeps it three other
ways. Buffalo is identified by its gold rim and glow, not its redness.

**Three toggles in Settings**, all persisted:

| Toggle | Effect |
|---|---|
| **Size numerals** | Prints the size digit bottom-right of every body, 10 pt / 600 mono |
| **High contrast** | Animal borders go to 2.5 pt `#FFFFFF`; seams to 1.5 pt `rgba(255,255,255,.55)`; cell lines brighten to `#33475A` |
| **Reduce motion** | Forces the Reduce Motion path regardless of the OS setting |

**Dynamic Type.** HUD, sheets and all overlays scale up to the `AccessibilityLarge` step. The
**board does not scale** — it is spatial, not textual, and scaling it would break the layout
formula. The HUD reserves 2 lines of vertical headroom for the enlarged score.

**Focus.** Every interactive control has a visible focus ring: 2 pt `accent`, 2 pt offset.

---

## 11. Layer C — App Store assets

`assets/` does not exist, and `app.json` points at `./assets/favicon.png`, which does not
exist (`docs/v1-review.md` E). This currently fails submission outright.

### 11.1 Files to create in `assets/`

| File | Size | Spec |
|---|---|---|
| `icon.png` | 1024 × 1024 | **No alpha, no rounded corners, no transparency** — iOS rounds it. Ground `#16212C`; three stacked animal bodies (elephant `#5B6E88`, elk `#5FA45C`, fox `#F58A47`) as panelled bars forming a rising staircase; no text. |
| `adaptive-icon.png` | 1024 × 1024 | Android foreground; the same bars inset to the 66% safe circle, background `#16212C` |
| `splash.png` | 1284 × 2778 | The three bars centred at 42% of height on `#0D141B`; `resizeMode: "contain"`, `backgroundColor: "#0D141B"` |
| `favicon.png` | 48 × 48 | The single elephant bar |

The icon must read at 60 × 60. Three coloured bars of different widths do; a detailed animal
illustration does not — and it also *is* the game's thesis, which is the right thing for an
icon to be.

### 11.2 `app.json` changes

```jsonc
"icon": "./assets/icon.png",
"userInterfaceStyle": "dark",
"splash": { "image": "./assets/splash.png",
            "resizeMode": "contain",
            "backgroundColor": "#0D141B" },
"ios": {
  "supportsTablet": false,          // was "supportsTabletMode" — not a valid Expo key
  "bundleIdentifier": "…",          // see open-questions.md Q6
  "buildNumber": "1",
  "infoPlist": { "ITSAppUsesNonExemptEncryption": false }
}
```

`"slug": "animal-run"` and the bundle id `com.sleepyshark.animalrun` both disagree with the
display name "Wildlife Shuffle" — see `open-questions.md` Q6, because the bundle id is
expensive to change after the first TestFlight build.

### 11.3 Screenshots

Required sets: 6.9" (1320 × 2868) and 6.5" (1242 × 2688). Five shots, same five in both:

1. Mid-game, ragged skyline, buffalo visible on the board — *"Every animal is a different size. That's the whole game."*
2. A two-row clear mid-flash with `+480` floating — *"Pack a row. Clear a row."*
3. The tray, with an arrow from the tray into row 0 — *"What you see is what arrives."*
4. Buffalo shrink mid-crack, HUD chip at 2/4 — *"The buffalo doesn't clear. It shrinks."*
5. Game Over with a high score and full stats — *"Beat your best."*

### 11.4 Privacy

No data collected, no network calls, no analytics SDK, no tracking, no ads. App Privacy
declaration: **Data Not Collected**. Age rating **4+**. No `NSUserTrackingUsageDescription`
is needed and none should be added — adding one implies tracking that does not happen.

### 11.5 Build prerequisites

**There is no `babel.config.js` in the repo at all**, and `metro.config.js` is missing too.
`react-native-reanimated@4.3.1` is installed and **requires its Babel plugin, listed last**,
or every animation in §8 silently does nothing — no error, no warning, just an app where none
of the motion spec happens. Per §8.3 ¶4 this is the first file of Slice 1, before any
animation work.

`react-native-gesture-handler@2.31.1` is likewise installed and unused: `App.js:18` mounts
`GestureHandlerRootView` and `GameGrid.js:30` then uses `PanResponder` anyway. §8.3 ¶2 makes
the gesture handler load-bearing.

---

## 12. Copy

Short, active, never cute. The game never apologises and never explains twice.

| Context | String |
|---|---|
| Action bar, idle | `YOUR MOVE` |
| Action bar, resolving | `RESOLVING…` |
| Action bar, blocked | `BLOCKED` |
| Pass button | `Pass` |
| Tray label | `NEXT ARRIVAL` / `6 CELLS` |
| Buffalo shrink | `BUFFALO −1` |
| Buffalo retired | `BUFFALO DOWN  +500` |
| Chain step 2+ | `×2 CHAIN` |
| Perfect clear | `PERFECT  +1000` |
| Game over heading | `Run over · Savanna` |
| New best | `NEW BEST · previous 11,205` |
| Difficulties | `Meadow` · `Savanna` · `Tundra` |

Difficulty names are habitats, not Easy/Normal/Hard, because "Hard" is a judgement about the
player and a habitat is a description of the place. They also make a straight-faced promise
the numbers keep: Tundra is where the big animals live.
