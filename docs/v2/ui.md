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
│  SCORE                     ×2.0  🐃▌▌▌  ❙❙  │  52   HUD
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

Fixed heights: HUD 52, tray block 31 (10 label + 18 strip + 3 rule — §6), action bar 48.
The HUD pins under the top safe inset, the action bar pins above the bottom safe inset, and
the **board + tray group is a flex child centred in whatever remains**. That rule is what
makes the layout survive every device without per-device special cases.

**The streak pill renders `streakMult`, never the raw counter.** `state.streak` keeps counting
past the ×3.0 cap — deliberately, so `longestStreak` can record "14 in a row"
(`gameplay.md` §9) — but the HUD shows only the multiplier. Rendering the raw count beside it
would read `streak 23 · ×3.0`, which invites the player to chase a number that stopped paying
eight clears ago.

### 3.2 The cell-size ladder

v1 had *two* disagreeing formulas — `GameScreen.js:14` sized on width only, `GameGrid.js:27`
on `min(width, height)` — so the board sat off-centre in its own frame
(`docs/v1-review.md` D1 — in fact **three**: `GameScreen.js:41` on width only, `GameGrid.js:30`
and `GamePreview.js:14` on `min(w,h)`). **There is exactly one sizing function in v2**, computed once in the
Game screen and passed down as a prop. No component computes its own.

The approved draft expressed it as a single clamped expression:

```js
const cell = clamp(Math.floor(Math.min((screenW - 32) / 10, availH / 15)), 28, 44);   // WRONG
```

**That floor was an overflow, not a safety net.** When available space demanded a cell below
28, `clamp` raised it back to 28 and the board then exceeded the screen — silently, with no
degradation path. The draft's defence ("no supported iPhone hits it") was true of the device
list and false of the mechanism: Display Zoom and larger accessibility text both shrink the
logical viewport on existing hardware, and the folded iPhone Duo lands within ~12 pt of the
cliff on some inset estimates.

**A floor that can exceed its container is a bug. The chrome yields before the board does.**

#### The ladder

Four stages, evaluated in order, first one that fits wins:

| Stage | Chrome budget | Cell range | When |
|---|---:|---|---|
| **W — Wide** | 63 (HUD + action bar move to a side rail) | 30–48 | Screen ≥ 600 pt wide |
| **0 — Comfortable** | 163 (52 HUD + 48 action + 31 tray + 32 gaps) | 30–44 | The common case |
| **1 — Compact** | 134 (44 + 44 + 26 + 20) | 30–44 | Stage 0 would drop below a 30 pt cell |
| **2 — Minimum** | 134 | 24–44 | Stage 1 would still drop below 30 |
| **3 — Unsupported** | — | — | Even a 24 pt cell will not fit |

```js
function boardLayout(screenW, screenH, insetTop, insetBottom) {
  const fit = (chrome, lo, hi) => {
    const availH = screenH - insetTop - insetBottom - chrome;
    const raw = Math.floor(Math.min((screenW - 32) / BOARD.width, availH / 15));
    return { cell: Math.min(raw, hi), ok: raw >= lo, chrome };
  };
  if (screenW >= 600) { const w = fit(63, 30, 48);  if (w.ok) return { stage: 'wide',    ...w }; }
  const s0 = fit(163, 30, 44);  if (s0.ok) return { stage: 'comfortable', ...s0 };
  const s1 = fit(134, 30, 44);  if (s1.ok) return { stage: 'compact',     ...s1 };
  const s2 = fit(134, 24, 44);  if (s2.ok) return { stage: 'minimum',     ...s2 };
  return { stage: 'unsupported', cell: null, chrome: 134 };
}
```

**Why chrome yields first.** The board is the game; the HUD, tray and action bar are
supporting elements (§1). Chrome is 163 pt of supporting furniture against 420–720 pt of
board, so it is proportionally the more expendable. The ladder only engages on genuinely
cramped viewports — 30 pt is the smallest cell that still reads comfortably at arm's length,
and no current iPhone at default zoom falls below it.

**Compact chrome** keeps every touch target at 44 pt: the action bar shrinks to 44 and the
Pass button fills it; the HUD to 44, still holding the 30 pt score over its 10 pt label; the
tray to 36 (10 label + 24 strip + 2 rule), with strip animals at 22 pt.

**24 pt is a legibility floor, not a touch floor** — touch is already handled by `hitSlop`
(§9). Below 24 the glyph (0.53 × cell ≈ 13 pt) and the 1 pt panel seams stop reading, which
would make the size cues in §5.2 fail. **Stage 3 shows a clear message rather than a clipped
board.** It is reachable only below 504 pt of height (597 pt with 59/34 insets) or 272 pt of
width — dimensions no iPhone has ever shipped, at any zoom level.

#### Verified by continuous sweep, not by a device list

A fixed device table cannot cover hardware that has not shipped. The ladder is therefore
verified across the continuous space by `docs/v2/layout-sweep.mjs` (`node layout-sweep.mjs`)
— **682,290 combinations** — widths 272–900, heights
480–1200, six inset profiles — with **zero overflows**. Unreleased devices are covered by
construction, which is the property that matters. AC-119 makes this the standing test.

| Device | pt | insets | stage | cell | board |
|---|---|---|---|---:|---:|
| iPhone SE (1st gen / 5s) | 320 × 568 | 0 / 0 | minimum | 28 | 252 × 420 |
| iPhone SE 2 / SE 3 / 8 | 375 × 667 | 20 / 0 | comfortable | 32 | 288 × 480 |
| iPhone 12 / 13 mini | 375 × 812 | 50 / 34 | comfortable | 37 | 333 × 555 |
| **iPhone 14 / 15 / 16 (target)** | 393 × 852 | 59 / 34 | comfortable | **39** | 351 × 585 |
| iPhone 17 / 18 Pro | 402 × 874 | 62 / 34 | comfortable | 41 | 369 × 615 |
| iPhone 15 / 16 / 17 Plus | 430 × 932 | 59 / 34 | comfortable | 44 | 396 × 660 |
| iPhone 16 / 17 / **18** Pro Max | 440 × 956 | 62 / 34 | comfortable | 44 | 396 × 660 |
| **iPhone Duo, folded** | ~466 × 678 | est. | compact | 30 | 270 × 450 |
| **iPhone Duo, unfolded** | ~626 × 890 | est. | **wide** | 48 | 432 × 720 |
| Display Zoom on a 393 × 852 | 320 × 693 | 59 / 34 | compact | 31 | 279 × 465 |

**Nine columns makes every device better off**, because the same screen width divides into
fewer cells. The reference iPhone goes from a 36 pt cell to **39**, the Plus and Pro Max reach
the 44 pt ceiling, the folded Duo climbs out of stage 2, and Display Zoom on a 393 × 852 no
longer needs the minimum stage. The board's footprint barely moves — 351 × 585 against
360 × 540 — but every cell in it is 8% larger.

**That is a direct win for the four-cue size system (§5.2).** Panel seams, glyphs and the size
numeral all scale with the cell, so the one thing the whole visual language exists to make
legible got larger on every supported device. And the cue reads against a shorter row: a
buffalo now spans 5 of 9 columns rather than 4 of 10, so "how many columns is this" is a
question about a smaller number, asked of a body that covers more of the row. Counting 9
columns is easier than counting 10.

> **Sourcing caveat.** iPhone 18 and the iPhone Duo postdate my training data. The Duo's
> existence and its 5.4″ / 7.6″ displays are well corroborated (Apple Newsroom, Bloomberg,
> CNN, MacRumors, 9 Sept 2026), but **its point dimensions are not published by Apple** and
> the figures circulating are back-calculated from the panel resolution — and they disagree
> with each other (≈626 × 890 at a 3× scale factor vs 669 × 951 from App Store Connect, and
> the folded estimate of ~466 × 678 is not consistent with either as a book-fold). The Duo
> rows above are therefore **illustrative, not normative**. This is precisely why the ruling
> is a ladder verified over a continuous space rather than a table of devices: **nothing in
> this design depends on those numbers being right.** Confirm them against the Xcode 27.1
> simulator before shooting screenshots.

#### The wide layout — one breakpoint, not a second design

At 600 pt and above, the HUD and action bar move out of the vertical stack and into a
right-hand rail. This is the same components in a different arrangement — not a tablet
redesign — and it *returns* 100 pt of vertical space to the board.

```
┌────────────────────────────────────────────────┐   iPhone Duo, unfolded
│ ░░░░░░░░░░░ safe area top ░░░░░░░░░░░░░░░░░░░░ │   ~626 × 890 pt
│                                                │
│   ┌──────────────────────────┐   ┌──────────┐  │
│   │                          │   │  SCORE   │  │
│   │                          │   │  12,480  │  │
│   │                          │   │          │  │
│   │         BOARD            │   │   ×2.0   │  │
│   │       10 × 15 @ 48       │   │  🐃▌▌▌   │  │
│   │        480 × 720         │   │          │  │
│   │                          │   │    ❙❙    │  │
│   │                          │   ├──────────┤  │
│   │  🐘🐘🐘🐘🐘 🦌🦌🦌 🦊🦊  │   │          │  │
│   └──────────────────────────┘   │ [ Pass ] │  │
│   NEXT ARRIVAL        6 CELLS    │          │  │
│   ▐🐀▌ ▐🦊🦊▌  ▐🦌🦌🦌▌       │  YOUR MOVE │  │
│   ╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱    └──────────┘  │
│        ← 480 →              16      ← 114 →    │
│ ░░░░░░░░░ home indicator ░░░░░░░░░░░░░░░░░░░░░ │
└────────────────────────────────────────────────┘
```

The rail is the remaining width after the board and gutters, minimum 96 pt. The board stays
left-of-centre so it sits under the right thumb when the device is held two-handed.

**Why not simply make the board bigger?** Because a 10-column board spanning 660 pt is a
26 cm drag from edge to edge — the mechanic is thumb-dragging, and a board that outgrows the
thumb gets worse, not better. The cell ceiling rises 44 → 48 for large screens and stops
there deliberately. Filling the space with a rail uses it; stretching the board squanders it.

#### Scope: the Duo is supported, the iPad is not

**iPad remains out of scope** — `ios.supportsTablet: false`. `app.json` currently has
`"supportsTabletMode": true`, which is not a valid Expo key at all and has been doing nothing.

**The Duo is in scope and `supportsTablet: false` will not exclude it** — it is an iPhone. A
foldable that opens into a 43%-empty screen is a phone app that was handed a bigger canvas
and did nothing with it, which is exactly the impression the App Store review screenshots
would carry.

**Shipping order:** v2.0 ships stages W/0/1/2 with the rail. If the rail slips, the fallback
is stage 0 centred with deliberate framing — the board centred, gutters carrying the board's
own background rather than flat app ground, so it reads as composed rather than stranded.
What v2.0 must **not** do is overflow, clip, or look accidental. Confirm the Duo's real
dimensions against the simulator before its own screenshot set is shot (§11.3).

**Orientation stays locked to portrait in every stage**, including unfolded. A 10 × 15 board
is inherently portrait; landscape would either shrink the cell to fit 15 rows in 626 pt of
height or demand a different board, and the board shape is a rules parameter (`gameplay.md`
§3), not a layout one.

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
| Elephant 🐘 | **4** | `#5B6E88` | `#3F4F66` | `#DCE6F2` | 46 |
| **Buffalo 🐃** | **5** | `#8C3B4A` | `#E8B44A` (2 pt) | `#FFE3B0` | 36 |

**Lightness descends monotonically with size** for the four ordinary species, so a heavier
animal is literally a heavier-looking block. The revert to elephant 4 / buffalo 5 **tidies
this**: the drawable species now run 1, 2, 3, 4 contiguously, an unbroken sequence, with
buffalo alone off it at 5. Under the old sizes elephant was the largest animal yet lighter
than buffalo, which worked quietly against the reading. Buffalo is deliberately **off the
ramp**: it is
not a bigger animal, it is a different *kind* of object — the only piece that refuses to
clear — so the ox-blood fill and 2 pt gold rim mark it as special rather than as "size 4".

v1 independently reached the same instinct: at `01c247e` buffalo renders `#e74c3c` while the
other four species stay `#2255dd` (`docs/v1-review.md` D5, corrected). That is the right
distinction and v2 keeps it. What it does not do is make **size** legible — four species
sharing one blue block is still the whole mechanic made invisible, which is what the four
redundant cues in §5.2 exist to fix.

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
bottom-right of each body. **Normative, because leaving it to the glyph style is what broke
it:** 10 pt / 600 mono, `ink` **`#EFF4F8`** at **full opacity**, on a **solid `#0D141B` chip**
— radius 3, 2 pt horizontal padding, inset 3 pt from the bottom-right corner.

The chip is the point. Inheriting the species glyph colour made the numeral's contrast depend
on which animal it sat on, and three of five failed: fox 4.46, elk 3.92, elephant 3.47 against
a 4.5:1 floor. A solid chip fixes the pair at **ink on app ground = 16.7:1 on every species,
by construction** (and the chip itself separates from every fill, minimum 2.5:1 against
buffalo) — the same move as everything else here, making a thing impossible to get
wrong rather than requiring five separate correct choices. An accessibility aid that itself
fails contrast is worse than no aid, because the player has asked for help and been given
something harder to read.

### 5.3 Buffalo

The buffalo's panels double as its health bar: a size-3 buffalo shows three panels, and each
shrink visibly removes one. Additional treatment:

- 2 pt `#E8B44A` gold rim plus `inset 0 0 12px rgba(232,180,74,.14)` — it glows faintly from
  within, and is the only piece on the board that does.
- Its seams are gold (`rgba(232,180,74,.5)`), not black, so the panel count reads as segments
  of a thing rather than shading.
- **HUD chip.** Whenever a buffalo is on the board, a chip sits in the HUD: the glyph plus
  **five** 5 × 12 pt bars, filled for remaining segments and at 22% opacity for spent ones. The
  player should never have to hunt the board to find out how much buffalo is left.
- **The chip and the body extinguish together.** The chip's segment fades over the same 260 ms
  as the body's shrink, on the same timeline — not on the React commit. Updating on commit
  leaves the chip reading "1 of 4" beside a two-cell-wide body for a quarter of a second,
  which is the HUD contradicting the board about the one fact the chip exists to report.

### 5.4 Animal states

| State | Treatment |
|---|---|
| **Rest** | As specified above. |
| **Grabbed** | Scale 1.04, `shadow 0 6px 16px rgba(0,0,0,.45)`, edge brightens 12%, 2 pt lift, over 90 ms. Driven from the gesture's `onBegin` worklet, so the lift lands on the same frame as the touch; the selection haptic fires with it. |
| **Dragging** | Follows the finger with **0 ms** smoothing — positioned by the same UI-thread frame that delivers the touch (§8.3) — and snaps to the nearest column over 110 ms. v1 had an empty `dropping: {}` style object (`src/components/Animal.js:51`) while the README advertised "scale + shadow" — there was no drag feedback at all. |
| **Origin** | The cells the animal has left render as a **recess** — see §5.5. It persists for the whole drag and fades over 110 ms on release. |
| **Drop target — legal** | A 2 pt `accent` dashed ghost at the destination columns, fill `rgba(255,194,75,.10)`. |
| **Drop target — illegal** | The ghost turns `illegal` red and the **swept path is shown blocked**: the obstructing animal gets a 2 pt red rim. The player sees *why* before releasing. This is the fix for v1's silent rejection (`docs/v1-review.md` C5). |
| **Illegal release** | Shake + red rim, §8. Pure announcement — it locks nothing, so the next drag can begin on the following frame. |
| **Clearing** | White flash then collapse, §8. |
| **Danger** | Any animal in rows 11–13 gets a 1 pt `kill-line` outer rim at 40%. |

---

### 5.5 The origin recess

**The problem, in the owner's words:** *"when I'm dragging an animal out of its original
location, keep the preview of the original location until I actually place it. Else I need to
remember where it's originally been, which can cost me a turn."*

v1 had this — `spec.md` called it the *Original Position Ghost*, a bright orange dashed
outline — and v2's design dropped it. That was an omission, not a decision, and the cost the
owner names is the right way to think about it: **a move is the scarcest resource in the game**
(one per turn, no undo), so losing track of where a piece started means either committing a
move you did not intend or spending your action putting it back. The origin marker is not
decoration. It is what makes a drag **cancellable**, and cancellability is what lets a player
explore a move before paying for it.

#### Three things on screen, three visual registers — not three outlines

Mid-drag the board carries the dragged body, the destination ghost, and now the origin. Adding
a third dashed outline would turn the board into a diagram, and v1's orange is unavailable
anyway: at `#FF9800` it sits almost on top of v2's `accent #FFC24B`, which the destination
ghost already owns.

The resolution is to stop competing for the same register. **These three are at different
points in time, so they get different kinds of treatment:**

| | time | register | treatment |
|---|---|---|---|
| **Origin** | past | **recessed** | a hole in the board |
| **Body** | present | **solid** | full fill, lifted, shadowed |
| **Destination** | future | **outlined** | 2 pt dashed, accent or red |

Only one of the three is an outline. The past is the quietest thing on the board because it is
a memory aid; the destination is the loud one because it is the thing that happens if you let
go. **The origin reads as absence, which is semantically exact — it is the shape of where
something is not.**

#### Specification

- **Recess:** the origin's cells take their existing ground **darkened by 55%**, plus the
  dragged animal's species fill at **12%**. Darkening the ground rather than painting a fixed
  colour keeps it correct over the danger band's `#2A1D24` as well as the normal `#1A2833`.
- **Inner top edge:** 1 pt `rgba(255,255,255,0.06)` along the top of the footprint, which is
  what makes it read as pressed in rather than merely dark.
- **The species tint at 12% is doing real work**, not ornament: it is what ties the hole to the
  piece in your hand, so a board with several vacated shapes on it could never be ambiguous.
- **No outline, no dashes, no accent colour.**
- **Shape is the whole footprint** — a 4-wide elephant leaves a 4-wide hole. At a 39 pt cell
  that is 156 pt of shape, which is why a low-contrast treatment is sufficient: the cue is
  carried by size, not by contrast.

#### Lifecycle

- **Appears on grab**, in the same `onBegin` worklet frame as the lift.
- **No zero-displacement suppression.** The body starts on top of the recess and uncovers it
  progressively as the drag moves off — the animal walking off its own footprint. Gating it
  would add a rule to hide something already hidden.
- **Fades over 110 ms on release, tracking whatever the body does.** One rule for all three
  outcomes: accepted, rejected, or cancelled.
- **On a rejected move it does not outlive the shake.** The body returns to the origin over
  110 ms and the recess fades over the same 110 ms, so they converge to nothing together. A
  recess still showing under a body that has come home would be marking "where this came
  from" as the place it now is, which is meaningless and reads as a second piece. The shake
  then plays on the body alone.

#### Thread, motion and contrast

- **Worklet, and cheaper than the destination ghost.** The origin is fixed at gesture start, so
  it is one shared value written once in `onBegin` — where the destination ghost recomputes
  every frame. **Zero React commits mid-drag** (AC-831) is unaffected.
- **Reduce Motion: unchanged, and more important rather than less.** The recess is a static
  state, not motion; only its 110 ms fade is animated and that already sits inside the ≤120 ms
  cross-fade budget. When everything else has been made quieter, the affordance that prevents
  a wasted turn is the last thing that should go.
- **High Contrast trades the register.** A recess is a low-contrast device by nature, so under
  High Contrast the origin instead takes a **2 pt solid `#FFFFFF` outline at 70%** with no
  fill, against the destination ghost's **dashed** one. That does put two outlines on the
  board — but High Contrast has already changed the vocabulary (animal borders go to 2.5 pt
  white), and for a player who needs it, legibility beats elegance. **Solid versus dashed, not
  two dash rhythms:** React Native exposes only `borderStyle: 'dashed'` with a
  platform-chosen pattern, so rhythm is not expressible — and solid-versus-dashed reads better
  regardless, because the origin is a fact and the destination is a proposal. Adding SVG or
  per-segment views to express a dash pattern would be disproportionate.
- **No conflict with the anticipation wash** (§8.2b), which also touches cell grounds: that
  runs during the ARRIVAL push-up and the drag happens in READY. They cannot overlap.

## 6. The tray — the preview contract, made visible

This is the component that carries v2's central promise, so it is designed to *look* like a
promise rather than like a decoration.

v1 rendered the preview as a row of flat green occupancy squares (`GamePreview.js:33-46`) —
and then re-rolled the positions anyway (`gameStore.js:101-135`). Two failures: it did not
show *what* was coming, only *where*, and the where was a lie.

**v2 renders silhouettes** — shadows at the board's cell width, in their exact spawn columns,
with each animal's own outline preserved.

```
NEXT                                             6 CELLS
┌────────────────────────────────────────────────┐
│  ▓▓   ▓▓▓▓▓▓      ▓▓▓▓▓▓▓▓▓                      │  18 pt strip
└────────────────────────────────────────────────┘
╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱   3 pt hazard rule
```

### 6.1 Why silhouettes do not break the honest-preview contract

The contract is that the preview must be **true**. A silhouette is less *specific*, not less
true: it states the footprint and the columns exactly, and the arrival still proves it (§6.3).
Withholding information is a different act from misrepresenting it, and only the second is
what v1 did.

**What the player plans against is preserved in full.** Size is the only property that affects
how a piece behaves — species identity does nothing mechanically. So the silhouette must keep
**per-animal outlines**: a fox arriving at column 3 and two rats arriving at columns 3 and 4
are *different* silhouettes, one 2-wide shadow against two 1-wide ones, and that distinction
is exactly the plan-relevant one. A merged shadow would lose it and would cross into
misleading.

**Buffalo is the one exception and it keeps its gold rim.** A buffalo behaves differently — it
refuses to clear — so hiding one would withhold information that is *mechanical* rather than
cosmetic, which is withholding by omission rather than being less specific. The line this spec
draws: **hide what is cosmetic, keep what changes the rules.**

What the player genuinely loses is flavour — the small pleasure of seeing a herd of elephants
coming. That is the owner's call to make and it is a real cost, recorded here so it is not
mistaken for a free change.

### 6.2 The strip

- Strip is **18 pt** tall (`0.46 × cell`), ground `panel-sunken`, 1 pt `hairline` border,
  radius 5. Label row 10 pt. Total tray block **31 pt**, down from 45.
- Silhouettes: `#2C3A47` fill, 1 pt `#3C4C5B` top edge, radius 3, with a 1 pt gap between
  adjacent animals so outlines never merge. Buffalo instead takes a 1.5 pt `#E8B44A` rim at
  60% and a faint ox-blood tint.
- No glyphs, no panel seams, no species colour.
- Right-hand counter still shows the batch's total footprint, so arrival pressure stays
  readable as a number as well as a shape.

**The 14 pt returned to the board is not decoration.** It moves the chrome budget from 177 to
163 and lifts the reference iPhone from a 36 pt cell to 39 (§3.2) — so the thinner tray is
part of why nine columns reads better, not merely a consequence of it.

### 6.3 The handover: shadow becomes animal

During the 260 ms arrival push-up the **same views travel from the strip into row 0 and
resolve from silhouette to animal as they cross** — fill blooming to the species colour, panel
seams drawing in, glyph fading up, over the last 160 ms of the flight.

This keeps §6's proof intact: it is still literally the same view arriving where the tray said
it would. And the transition earns something the old tray did not have — the shadow becoming
real is the moment the arrival stops being a forecast and starts being a board.

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
| Clear flash | **320 ms** | 60 attack, 260 decay | no | peak **0.92** body / **0.22** row wash |
| Clear lead beat | **80 ms** | — | **yes** | first step of a resolution only — announce, then go |
| Clear collapse | 110 ms | `cubic-bezier(.4,0,1,.4)` | **yes** | scale 0.85 + drift 6 pt down; fade runs 140 ms past |
| Cascade step interval | **260 ms → 200 ms** | see §8.2 | **yes** | A chain reaction, gathering pace gently |
| Buffalo shrink | 260 ms | 120 crack + 260 respring | **yes** | The row did **not** clear |
| Arrival push-up | 260 ms | `cubic-bezier(.22,1,.36,1)` | **yes** | The tray told the truth |
| Score count-up | ≥ 400 ms, starts at first `collapseAt` | ease-out cubic | no | The size of what happened |
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

- **The clear flash is an announcement, so its length is free.** Only the 110 ms collapse
  gates input. This is why the flash could be tripled (§8.2a) without moving the budget by a
  millisecond — and it is the thing I failed to act on when I reclassified it: the 140 ms
  figure was argued down under a constraint that had already stopped applying to it.
- **The flash gets an 80 ms leading beat on the first step of a resolution, then overlays.**
  Not v1's flash-*then*-remove, which held a lit row for 1200 ms of dead time; 80 ms is the
  flash's attack landing before the geometry starts to move, so the row is announced and
  *then* goes. Steps 2+ of the same cascade stay strictly concurrent — by then the player is
  watching a cascade and the announcing job is done, and a lead on every step would push the
  realistic worst case into compression it does not currently need.
- **An illegal move locks nothing.** The shake is pure announcement. The player can start
  their next drag on the very next frame, which is exactly what someone who has just been
  told "no" wants to do.
- **Game over dims and slides at the same time**, not one after the other. The dim starts at
  t=0 and the sheet at t=120, both done by 400 ms, so the player reaches their score in 400 ms
  rather than 580. The dim is an opacity-animated overlay view, **never** an animated
  `filter: saturate()` — RN cannot drive a filter from the UI thread, so the approved draft's
  "desaturate" would have janked at the one moment the player is definitely watching.

### 8.2a Clear timing — revised after the first real viewing

> The owner played the Slice 2 build and said the row disappearance was **"too abrupt — should
> be more natural and slower, maybe a little bit of flashing."**

**What they were reacting to.** Slice 2 excluded AC-801–827, so there is no clear animation at
all: rows vanish between frames. This is a reaction to *nothing*, not to the 140 ms spec, and
it is not on its own evidence that the spec was wrong.

**But it found a real defect anyway.** The flash went 1200 ms → 400 → 140 across three
revisions, and **every one of those cuts was argued from input-lock arithmetic**. Then
Revision 2 reclassified the flash as an *announcement*, which means it stopped costing budget
— and I never revisited the duration. **140 ms is a leftover from when the flash gated
input.** Nobody had watched any of it. The owner's instinct is right and the correction is
free.

| | was | now | class |
|---|---:|---:|---|
| Clear flash | 140 ms | **320 ms** (60 attack, 260 decay) | announcement — free |
| Leading beat before collapse | 0 ms | **80 ms**, first step of a resolution only | structural |
| Collapse | 110 ms | **110 ms** | structural — unchanged |
| Fall | 200 ms | **200 ms** | structural — unchanged |
| Cascade interval | `max(150, 250−20(k−1))` | `max(200, 260−15(k−1))` | structural |

**The score never announces before the board does.** `MOTION.scoreCount` had a duration but no
start time, so Slice 3 correctly left it on the React commit — and on an ARRIVAL-phase clear
that put the final score in the HUD at 400 ms while the flash had not begun until 570 ms. The
HUD was telling the player the answer before the board asked the question.

**The count-up starts at the turn's first clear unit's `collapseAt`**, which the replay plan
already carries. That is the moment the row actually goes, one beat after the flash announced
it, so the order is flash → collapse → score. The floating `+N` starts on the same timestamp,
which also syncs it to the HUD.

**One count-up per turn, not one per step.** Its duration is
`max(400, lastClearUnit.collapseAt − firstClearUnit.collapseAt + 400)` and its target is the
turn's final score, so a cascade reads as one accumulating sweep that lands just after the
last row goes — rather than a counter that restarts and jitters on every step.

**Flash opacity: peak 0.92 on the animal body, 0.22 on the row's background cells**, reached
at the end of the 60 ms attack and decaying to 0 across the following 260 ms.

**The flash is an additive overlay, never a fill swap.** The body underneath keeps its species
colour and its panel seams the whole time; the flash only overwhelms them, and they surface
again through the decay. This is what makes 0.92 safe — at the peak the row is effectively
white for a moment, but nothing has been destroyed, and §5.2's size cues are back before the
row finishes leaving. A fill swap would genuinely lose them, and must not be used.

0.92 is the developer's value, chosen at the component and now promoted to spec. I am adopting
it rather than shading it down on theory: they watched it and I did not, and the coordinator
confirmed the frame reads as one white row against an untouched board, which is exactly the
job. The thing to watch on a real device is whether a **multi-row** clear at 0.92 reads as one
event or as a white band — if it flattens, lower the body peak before touching the duration.

**Abruptness is an attack/decay problem, not only a duration problem.** A row that vanishes
has an infinitely fast decay; a row that fades symmetrically reads as mushy. The flash is
therefore deliberately asymmetric — **60 ms attack, 260 ms decay** — because the fast attack
is what announces and the slow decay is what stops it feeling abrupt. A single flash, not a
pulse train: overlapping pulses in a cascade read as a stutter.

**The collapse gains physicality at no structural cost.** Within its unchanged 110 ms the
cleared animals scale to 0.85 and drift 6 pt downward as they go, rather than simply
shrinking; the opacity fade continues **140 ms past** the structural window as an
announcement. "More natural" is largely this — things that leave should look like they went
somewhere.

**Cascades slow down rather than speed up.** The interval now tightens from 260 ms to a 200 ms
floor instead of 250 → 150. The old curve was dramatically correct — a chain reaction should
gather pace — but it was also the opposite of what "natural" asks for, and it made later steps
overlap so heavily that they stopped reading as discrete events. With the deepest observed
cascade at 3 steps the aggressive tightening barely engaged anyway, so it was buying drama
nobody saw at a cost in legibility everybody did.

**Measured after Slice 3: the 320 ms flash was free with room to spare.** It outlives the
structural lock by **at most 10 ms**, and only when the turn's final animated unit is a
cascade step 2 or later; in every other shape the collapse's own tail covers the whole 320 ms.
So AC-813c's allowance — that the flash may still be playing when input reopens — is almost
never exercised. That is a stronger version of the argument for tripling it than the one I
made, which was only that the allowance existed.

**This is one sentence from one viewing of a build with no animation in it.** It is not
locked. The numbers above are a considered response to a real reaction, and they should be
watched and adjusted on the next build rather than defended — that is the whole point of
having seen it move.

### 8.2 The input-lock budget

> **Worst case, from finger-up to input reopening: 1500 ms. Typical clearing turn: 960 ms.
> Turn with no clear: 570 ms.**

**The clock starts at finger-up, not at the React commit.** That is a ruling, not a wording
choice: the budget is a promise about what the player feels, and what the player feels starts
when they let go. Between finger-up and the commit sits the reducer's synchronous work and a
React render, which Slice 3 measured at a median of 61 ms in a dev web bundle — not
representative of a release iOS build, but not zero there either.

**So the implementation owes the difference.** `react-native-gesture-handler` gives the
release timestamp on the gesture; the presentation layer subtracts
`commitTime − fingerUpTime` from the budget *before* scaling the timeline, so the promise
stays exact on a slow device and nothing changes on a fast one. If the measured gap is under
one frame (≈16 ms) the correction is noise and may be skipped.

I am not asking anyone to engineer further around this before it is measured on hardware —
only that the ACs and the code agree about where zero is. On-device measurement of the gap
joins the AC-824c review list.

This replaces the ~3.2 s figure in the approved draft. A three-second lockout is the opposite
of fluid however good the frames inside it are, and a long cascade is precisely the moment a
player most wants to keep acting.

**Where the old 3.2 s went.** Three changes, in order of how much they bought:

1. **Cascade steps pipeline instead of queueing.** Step *n+1*'s flash and collapse begin
   while step *n*'s animals are still falling — at **75%** through their fall, where the
   destination is already unambiguous. *(The figure follows from AC-823's interval: a step's
   collapse runs 0–110 ms and its fall 110–310 ms, so a 260 ms interval lands at
   (260−110)/200 = 75%. It was 70% under the old curve and the text said 60%, so it had been
   stale since before §8.2a.)* The engine has already resolved the whole cascade, so
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
interval(k) = max(200, 260 − 15 × (k − 1))     // 260, 245, 230, 215, 200, 200 …
```

It still tightens as the chain deepens, but gently. The original curve (250 → 150) was
dramatically correct — a chain reaction should gather pace — but it was also the opposite of
the "more natural" the owner asked for, and at depth 4+ the steps overlapped so heavily they
stopped reading as discrete events. See §8.2a.

**At most 5 cascade steps are animated separately, counted across the whole turn** — not per
phase. `SETTLE` and `ARRIVAL` each run their own resolution, so one `reduce()` can emit clear
events from both; the player experiences one turn, so the animation cap and the budget below
are both per-turn quantities. Steps 6 and beyond are replayed as one combined final step.

**Event-count contract for the cascade pipeline.** The number of `CLEAR_STEP` events a single
turn can deliver is bounded by board mass, not by a step counter (`gameplay.md` §4): ~15
*steps* and ~19 *events* in the worst case — they are not the same quantity, since one step can
emit a clear plus a shrink plus a retirement — against 3 observed across 45,504 fuzzed turns.
**Neither figure is normative**; `assert step <= 32` is the only ceiling the engine enforces. **The pipeline must not assume a small number.** What it *can* rely on is
the animation cap: however many events arrive, they replay as **at most 6 animated units per
turn** (5 separate + 1 combined), which is the number the 1500 ms arithmetic below is built
on. Nobody can read eight discrete cascade steps; past five the drama is in
the total, not the enumeration, and a six-step cascade on a 15-row board is close to
theoretical. The engine still resolves all of them and still scores every one — this is a
presentation cap only, and it must not change a single point of score.

**The arithmetic.**

A step costs `collapse 110 + fall 200 = 310 ms` structural. A resolution additionally pays the
80 ms leading beat once, on its first step only (§8.1).

**These figures are derived, not restated.** `node docs/v2/budget.mjs` computes them from the
timing constants, exhaustively over every `(settle, arrival)` split the AC-825 cap permits,
and prints exactly the table below. A number in this section has now gone stale behind its own
ACs three times — 0.78×, then 0.71×, then the 60%-through-the-fall figure — every time because
prose restated an arithmetic result. **AC-824e requires the script and this table to agree.**

```
case                                   split    raw      scale
no clear                               0/0       570 ms  none
typical: one clear step                1/0       960 ms  none
realistic worst: 3 steps, 2/1          2/1      1610 ms  0.932x
absolute worst: 6 units, 3/3           3/3      2360 ms  0.636x
```

The absolute worst is a **3/3 split of 6 animated units**, not the 5 units the previous text
assumed: AC-825 caps a turn at 5 separately-animated steps **plus one combined**, which is 6,
and splitting them evenly across the two phases costs most because each phase pays its own
lead beat and its own final settle. Verified against all 882 legal combinations.

**The guarantee.** The presentation layer lays the timeline out from the target timings
above, then **uniformly time-scales it so it never exceeds 1500 ms**. Uniform scaling is the
readability-preserving form of compression: every step stays distinct, the sequence keeps its
shape, everything simply plays faster. Worst case needs 1500 / 2360 = **0.636×**, still
comfortably above the 0.55× floor. The scale floor is 0.55×, below which motion stops reading; the 5-step cap
above is what guarantees the floor is never reached.

**Measured, after Slice 1.** Across 90 bot runs the deepest cascade observed was **3 steps**,
and no board could be constructed by hand that chains past 3. The 5-step animation cap is
therefore never reached in practice — it remains a guarantee against a board nobody has found
yet, not everyday behaviour.

**What §8.2a cost, stated plainly.** Before the clear was slowed, the realistic worst case was
1440 ms and fitted *uncompressed*; it is now 1610 ms and compresses by **0.932×**. I traded that
away deliberately. "Never compresses in practice" was an observation, not a promise; the
1500 ms guarantee (AC-822) is the promise and it is untouched, the 0.55× floor is nowhere near
(worst case 0.71×), and a 7% speed-up on the rarest turn in the game is not perceptible. A
visibly better clear on *every* turn is worth an imperceptible compression on a three-step
cascade almost no one will see.

Input reopens at the end of the *structural* timeline, which is the guaranteed ≤ 1500 ms —
not when the last announcement animation finishes. A tap during the lock is **buffered and
applied at the next READY phase**, never dropped. Nothing in this game ever swallows a touch.

### 8.2b The 570 ms question — when the reward lands

On an **ARRIVAL-phase clear** — the common shape, where the arriving batch completes the row —
nothing is announced until **570 ms after finger-up**: snap 110 + settle 200 + push-up 260 all
happen first, and only then does the clear take its own 390. This is the spec working exactly
as designed, and **no amount of tuning the flash changes it.**

**It is not a responsiveness defect, and the distinction matters.** Responsiveness is about
the *move*, and the move answers in 110 ms — the piece snaps under the thumb immediately.
What lands at 570 ms is the *reward*, and it lands when its cause does: the row is completed
by the arriving animals, so it cannot be announced before they arrive. Every one of those
570 ms is showing the player something true. Shortening the chain would mean either
overlapping the settle with the arrival, which can reorder two animals' interactions and make
gravity unreadable, or cutting the push-up, which is the animation that proves the tray told
the truth (§6). Both cost more than they buy.

**What can help, at zero structural cost: anticipation.** The engine resolves the entire turn
before the first frame plays (§8.3 ¶3), so the presentation layer *knows at t = 0* which row
the arrival is about to complete. Washing that row while the arrival pushes up draws the eye
there before the flash lands on it. It is not a spoiler and not a guess — it is the same
category as the honest preview: true information, shown early. The flash then arrives
somewhere the player is already looking, which is the difference between being told and
noticing.

**What it actually lights is the gap — and that is better than what I specified.** My draft
said "a row wash at 0.10 on that row", which assumed the row was a uniform band. It is not: a
row about to be completed is **by definition nearly full**, so it is mostly animal bodies. The
developer built it and watched it — 0.10 white reads clearly over the board ground and much
more weakly over a body, so what the player sees lit is the row's **remaining gap**, which is
exactly the columns the arriving animals are about to land in.

That is the better cue, and this spec now asks for it deliberately rather than getting it by
accident of compositing. It points at *where the action is* rather than at the row in general,
and it ties visually to the tray: the gap lights, and then the previewed animals drop into it.

| cells of the completing row | wash |
|---|---|
| **unoccupied** — the gap the arrival fills | **0.14** |
| occupied — bodies already in the row | **0.05**, enough to read as one row rather than floating cells |

Fading in across the 260 ms push-up.

**The lever, if it needs adjusting on device.** For more *row-level* presence raise the
**occupied** alpha; for more *gap* presence raise the unoccupied one. Do not raise both
together — a uniform increase makes the empty part shout, which is the failure mode that
turns a focus into a smear.

**Provisional, like §8.2a.** The developer's caution stands: on a full board at arm's length
this may be too quiet to register at all. If it reads as a smear or as nothing, drop it and
accept the 570 ms, which is correct if unglamorous.

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
**Touch targets:** 44 pt minimum, always. At the ladder's 24 pt floor (§3.2) a rat is
24 × 24 pt, so **every animal carries `hitSlop` padding it out to 44 pt on all four sides**,
computed as `max(0, (44 − dimension) / 2)`. This is why 24 pt is a *legibility* floor rather
than a touch floor — touch is already solved at every cell size.

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
all carry it. Buffalo is identified by its gold rim and glow, not its redness.

Brettel/Viénot simulation over the §4.3 palette gives the real worst pairs, which are **not**
the ones the approved draft named: under **deuteranopia** the closest pair is **fox/elk**
(RGB distance 53), and under **protanopia fox and elk very nearly collide** — `#9b9b48` vs
`#9e9e5c`, distance **20**. That is the worst case in the palette and the draft did not
mention it.

**It is acceptable, and the reason is structural rather than lucky.** Fox and elk are adjacent
in size, so they are adjacent on the lightness ramp — the collision is the ramp working as
designed, not a palette accident. What matters is carried achromatically: fox is 2 cells wide
with 2 panels, elk is 3 with 3, and the lightness difference survives every simulation even
when hue does not. Species *identity* blurs; **size never does**, which is what AC-908
actually requires. Do not fix this by pulling fox and elk apart in hue — that would break the
size→lightness mapping to rescue a distinction the game does not use.

**Three toggles in Settings.** Persistence is **Layer A (Slice 4)** — they are session-scoped
until AsyncStorage lands under AC-10xx, which `src/ui/settings.js` documents as a deliberate
deferral rather than an omission:

| Toggle | Effect |
|---|---|
| **Size numerals** | Prints the size digit bottom-right of every body, 10 pt / 600 mono |
| **High contrast** | Animal borders go to 2.5 pt `#FFFFFF`; seams to 1.5 pt `rgba(255,255,255,.55)`; cell lines brighten to `#33475A` |
| **Reduce motion** | Forces the Reduce Motion path regardless of the OS setting |

**Dynamic Type — three surfaces, three rules.** The approved AC-910 said "all HUD, sheet and
overlay text scales", and Slice 3 could not satisfy it: the ladder's chrome heights are fixed
(§3.2), so a scaled 30 pt score does not fit a 44 pt compact HUD, and Slice 2 had applied
`allowFontScaling={false}` to every `<Text>` in the app to make the layout hold. Both cannot
be true. The conflict is real and the resolution is to stop treating three different kinds of
surface as one:

| Surface | Rule | Why |
|---|---|---|
| **Board** | never scales | Spatial, not textual. Scaling it breaks the layout formula. |
| **Sheets & overlays** — Pause, Game Over, Settings, Records, How to Play | **full Dynamic Type** to `AccessibilityExtraExtraExtraLarge`, scrolling where needed | These are reading surfaces. They are modal, they do not compete with the board, and there is no reason to exempt them. |
| **HUD** | fixed height; scales *within* it by trading labels for values | Glanceable status, and the one surface whose height the board's fit depends on. |

**Three treatments, not two.** `allowFontScaling={false}` is correct on the HUD **and on the
board** — the board's glyphs are sized from the cell, not the type scale. But the ladder also
has fixed-height chrome that is neither: the action bar and the tray label row must scale
*somewhat* without clipping. They take a **`maxFontSizeMultiplier`** — 1.5 on the action bar,
1.3 on the tray labels — and everything else scales without limit.

**A cap is not an exemption.** Capped text still responds to the player's setting; it just
stops before it clips. An earlier draft of AC-910c said the flag belonged "only on HUD text",
which read literally would have stripped the board and clipped the Pass button — it had no
vocabulary for the middle case.

**How the HUD scales without growing.** Its 10 pt uppercase labels are the part that fails an
accessibility text size, and they are also the expendable part — a large number under a tiny
word that reads "SCORE" is not carrying much. So at Dynamic Type `xxLarge` and above the HUD
**drops its labels and grows its values into the freed space**: the score goes 30 → 40 pt in a
52 pt HUD, 30 → 34 pt in a 44 pt compact HUD, and the streak pill and buffalo chip scale to
match. Same height, bigger number, no board cost. VoiceOver is unaffected either way — the
labels live on `accessibilityLabel` (§10), not on the visible text.

This is a real reduction against the approved AC and I am not going to pretend otherwise: a
player at AccessibilityLarge gets a 40 pt score instead of a ~50 pt one. The alternative is
letting the HUD grow, which spends board rows on chrome for the players least able to afford
losing them.

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

Required sets: 6.9" (1320 × 2868) and 6.5" (1242 × 2688). Five shots, same five in both.

**The iPhone Duo needs its own set** covering both states — at minimum one folded and one
unfolded shot, the unfolded one showing the stage-W rail layout (§3.2), because a reviewer
scrolling the listing on a Duo is exactly the audience that notices a phone app stranded in
the middle of a foldable. **Shoot it against the Xcode 27.1 simulator, not against the
estimated dimensions in §3.2**, and confirm the real point size at that time.

The five shots:

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

**Dependency inventory, corrected.** `expo-haptics` is **already installed and in use**
(`useSoundManager.js`), so haptics are a port. **`expo-audio` must be added** — `useSoundManager`
plays no audio despite its name. `@react-native-async-storage/async-storage` is **in use**
(`useLocalStorage.js`). Only `expo-sqlite` and `react-native-url-polyfill` are genuinely
unused and should be removed.

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

---

## 13. Layer D — Special abilities (UI)

Structure per `gameplay.md` §13. **Numbers pending AC-318b.**

### 13.1 Where it lives

The HUD is at its chrome budget and the action bar holds one button, so the abilities go in
the action bar beside Pass — **no new chrome, no board cost.**

```
┌────────────────────────────────────────────────┐
│  ⚡ ABILITIES  ●●○     │       [  Pass  ]       │  48 pt action bar
└────────────────────────────────────────────────┘
     ← 150 pt, charge pips →       ← 150 pt →
```

- Two buttons, 150 pt each, 44 pt tall, 12 pt gap — both above the 44 pt target.
- **Charge pips** on the abilities button: **4 dots** — three for the banked cap and a fourth,
  gold-rimmed, reachable only by Last Stand overflow (`gameplay.md` §13.2b). The fourth sits at
  25% opacity while empty, so the reserve reads as "three, plus one you have not earned"
  rather than as a four-slot bar the player is failing to fill.

- **The gold marks the Last Stand *event*, not a slot.** My earlier wording described the
  fourth pip as "the Last Stand pip", which conflated the two — and the consequence was that a
  player at **0 charges**, the AC-1408e player and the entire reason Last Stand exists, saw the
  grant land on **pip 1** and look exactly like an ordinary ladder charge. The gold appeared
  only when Last Stand *overflowed* a full reserve, which is the one case that does not need
  it. So: **whichever pip Last Stand fills blooms gold for the 400 ms of the announce, then
  settles to the ordinary fill.** Both statements stay true — the fourth *slot* is reachable
  only by Last Stand, and the *event* is marked wherever it lands. Once banked, a charge is a
  charge; a grant is a moment, and moments are announced rather than stored.
- At **zero charges** the button is disabled but **still visible** — layout must not reflow
  (the AC-413 principle). The turn-state text (`YOUR MOVE`) moves into the HUD's spare
  right-hand column, where the pause control already sits.

### 13.2 The ability sheet

Tapping opens a bottom sheet (22 pt top radius, the standard treatment): five rows, each a
species chip at its §4.3 fill, the ability name at 16/600, its effect in one line at 13/400,
and its **cost in charge pips** right-aligned — ●, ●● or ●●● (`gameplay.md` §13.2d).

**Cost renders as pips rather than a numeral** so it reads against the same vocabulary as the
reserve on the button: the player compares two rows of dots, not a number against a number.
Unaffordable rows sit at 40% opacity with their cost still legible — *why* a row is
unavailable must be visible, or the sheet looks broken rather than expensive.

Tapping a row **arms** the ability and dismisses the sheet. **No charge is spent at arming
time** — it is spent on confirmation (§13.3), so a player who opens the sheet to read what
things do never loses anything.

### 13.3 Targeting, and getting out of it

**Burrow** and **Migrate** need a target, so the board enters a **targeting state**: everything
dims to 45% except valid targets, a chip at the top carries the prompt and a **Cancel** action,
and the action bar is replaced by that chip for the duration.

| Ability | Prompt |
|---|---|
| Burrow | `Tap an animal to burrow` |
| Migrate | `Tap an animal — its whole species leaves` |

Migrate's prompt **explains the mechanic in the act of asking**, because its target is a
species but the thing the player taps is an animal, and a prompt that said "tap a species"
would name something not on the board. **The buffalo is never a valid target for either**
(AC-1412, AC-1412b) and stays dimmed with the rest.

**Cancel must always be one tap and must never spend the charge.** A player who arms the wrong
ability and cannot back out of it has been punished for exploring the system, which is the
opposite of what an assist mechanic is for. Tapping outside any valid target also cancels.

**Stampede**, **Dart** and **Hold the Line** need no target and resolve immediately on arming.

### 13.4 Feedback

Each ability gets one distinct beat, all within the §8.2 budget because all are announcements
over an ordinary structural resolution:

| Ability | What the player sees |
|---|---|
| **Burrow** | The target dissolves downward — the rat's own vanishing act, 260 ms |
| **Dart** | The action bar shows `2 MOVES LEFT`, counting down; the board stays live |
| **Migrate** | Every animal of that species flashes once in unison, then leaves together |
| **Stampede** | Rows slide left bottom-up, staggered over the rows that **actually move**, capped at **4 beats / 480 ms** with the tail folded — the herd moving as one |
| **Hold the Line** | Announce `HOLD THE LINE · 3 TURNS`; the tray then greys out and shows **arrivals remaining** — `FROZEN · 2`, `FROZEN · 1` — the freeze having started immediately (AC-1410) |

**Hold the Line's tray treatment is load-bearing, not decoration.** The tray's whole contract
is that it shows what is coming (§6); when nothing is coming it must say so, or the contract
reads as broken for three turns.

A charge being earned is announced in the HUD: the pip fills with a 300 ms bloom and the
abilities button pulses once. It never interrupts play.

**Last Stand gets its own beat**, because it fires at the worst moment of the run and must not
read as an ordinary threshold crossing: the gold fourth pip blooms over 400 ms, the abilities
button takes a single `#E8B44A` pulse, and a `LAST STAND` label rises from it. It fires in the
same moment the danger band first lights (§7), so the two read as one event — *you are in
trouble, here is one more thing you can do about it* — rather than as a reward arriving
inexplicably beside a warning.

---

## 14. Records and Collection (S8, S9)

These were one row each in §2 and nobody designed them. They were built from §9's content list
against existing tokens, which is why they are consistent — but they are **the two screens a
returning player sees most often after Home**, and Collection in particular is doing
motivational work that a content list cannot specify.

Both are **reading surfaces** (§10): full Dynamic Type to AccessibilityXXXL, scrollable,
`allowFontScaling` untouched, behind the shared `FullScreen` shell.

### 14.1 Records (S8)

**The question this screen answers is "am I getting better?"** — not "what are my totals". That
ordering decides the layout: the recent-runs list is the thing that answers it, so it is not
at the bottom under the aggregates.

```
┌─────────────────────────────────────────┐
│  ‹ Back            RECORDS              │
│                                         │
│  🔥 4 day streak                        │   streak first — it is the
│  ─────────────────────────────────────  │   only number that decays
│  [ Meadow ] [ Savanna ] [ Tundra ]      │   segmented, governs BESTS only
│                                         │
│  BEST SCORE                             │
│  12,480                                 │   34/800 tabular, accent
│  ┌────────┬────────┬────────┐           │
│  │   4    │   47   │   31   │           │
│  │ CHAIN  │ TURNS  │  ROWS  │           │
│  └────────┴────────┴────────┘           │
│                                         │
│  RECENT RUNS                            │
│  Today      Savanna   12,480   47 turns │
│  Today      Tundra     3,210   22 turns │
│  Yesterday  Savanna    9,870   41 turns │
│  …                              (10)    │
│                                         │
│  LIFETIME                               │
│  Games played              38           │
│  Rows cleared             412           │
│  Buffalo retired            7           │
│  Perfect clears             2           │
└─────────────────────────────────────────┘
```

**The difficulty selector governs the bests block only; recent runs shows all difficulties
with a chip.** Bests are inherently per-difficulty — that is what makes them comparable — but
the run diary is chronological, and a session in which someone dropped from Tundra to Savanna
is a truer picture when it is not filtered into invisibility.

- **Dates are relative** — `Today`, `Yesterday`, then `12 Sep`. A returning player is asking
  about today; an absolute date makes them do the arithmetic.
- **Lifetime sits last and smallest.** These are slow-moving numbers that reward a glance, not
  study.
- **Unachieved values render `—`, never `0`.** Zero is a score you got; an em-dash is one you
  have not got yet, and the difference matters on a first-run screen.
- Empty state: the tiles show `—` and the list reads *"No runs yet."* Nothing apologises.

### 14.2 Collection (S9)

Four unlocks, all cosmetic (`gameplay.md` §9). This screen's job is to make the next one feel
reachable, which a bare `0 / 10` does not.

```
┌─────────────────────────────────────────┐
│  ‹ Back          COLLECTION             │
│                                         │
│  ┌─────────────────────────────────────┐│
│  │ ▓▓▓▓▓  NIGHT SAVANNA        LOCKED  ││  preview always visible,
│  │ ▓▓▓▓▓  board theme                  ││  dimmed to 45% while locked
│  │ ████████░░  7 / 10 buffalo retired  ││
│  │ Buffalo arrive every 10 turns on    ││  ← how, not just what
│  │ Savanna. Five completed rows on one ││
│  │ retires it.                         ││
│  └─────────────────────────────────────┘│
│  ┌─────────────────────────────────────┐│
│  │ ▓▓▓▓▓  TUNDRA PALETTE       LOCKED  ││
│  │ Best so far 12,480 of 25,000        ││  ← single-event: no bar
│  │ One run. Chains and streaks multiply│││
│  │ faster than rows do.                ││
│  └─────────────────────────────────────┘│
│  ┌─────────────────────────────────────┐│
│  │ 🐀🐀🐀  RAT KING         ✓ EQUIPPED ││  unlocked: full colour
│  └─────────────────────────────────────┘│
└─────────────────────────────────────────┘
```

**Three decisions, each of which a content list would have missed:**

1. **Locked items show their preview, dimmed to 45% — never hidden.** You should be able to see
   what you are playing for. A locked card with no preview is a tease; a dimmed one is a goal.

2. **Cumulative and single-event conditions do not look the same.** "Retire 10 buffalo" and
   "clear 500 rows" accumulate, so they get a **progress bar plus counter**. "Score 25,000 in
   one run" and "clear 4 rows in one step" do **not** accumulate — you are not 50% of the way
   to a 25,000 run — so they get **"Best so far 12,480 of 25,000"** and no bar. Showing a
   half-full bar for a target that resets every run is a lie about how close you are.

3. **Every card carries a one-line hint on *how*, not just the condition.** "Retire 10 buffalo"
   is a requirement; "Buffalo arrive every 10 turns on Savanna" is something a player can act
   on this evening. This is the motivational work, and it is the line most worth writing
   carefully.

**Unlocked items can be equipped**, one board theme and one animal set at a time, with the
defaults always available — an unlock you cannot apply is not an unlock. Equipping changes
appearance only and never a rule, spawn or score (AC-1011).

### 14.3 Copy

| Context | String |
|---|---|
| Records heading | `RECORDS` |
| Streak | `🔥 4 day streak` · `🔥 1 day streak` |
| Bests, unachieved | `—` |
| Recent, empty | `No runs yet.` |
| Collection, locked | `LOCKED` |
| Collection, unlocked | `✓ EQUIPPED` / `EQUIP` |
| Cumulative progress | `7 / 10 buffalo retired` |
| Single-event progress | `Best so far 12,480 of 25,000` |
| Single-event, none yet | `Not yet — best run 3,210` |

Hints name a difficulty where one is materially better, because "play more" is not a hint.

---

## 15. Sound

**This section did not exist.** `gameplay.md` §10 pointed at "`ui.md` §8–§9" for sound; §8 is
Motion and §9 is Typography. Every property of the shipped cues — waveform, pitch, length,
envelope, loudness, the chain interval — was therefore invented by the developer, correctly
flagged, and put in one table (`SOUNDS`, `CHAIN_SEMITONE`) so it could be overruled cheaply.
This is the spec that should have preceded it.

### 15.1 What the game sounds like

**Struck wood.** Log drum, marimba, temple block — pitched, warm, short, unaggressive. Not
animal noises: eleven literal creature sounds would be emoji-adjacent and unbearable by turn
twenty. Not arcade bleeps either, which would reference nothing the game looks like. Pitched
wooden percussion sits with a dark earthy palette, and it is the one family that handles a
rising cascade naturally, because it is already an instrument.

**Three materials, and each means something:**

| material | what it marks |
|---|---|
| **Wood** — struck, damped or open | The player's actions and the board's ordinary events |
| **Struck metal** — small bell, damped | **The buffalo, and only the buffalo** |
| **Air** — soft filtered noise | Arrivals, and the freeze |

Metal is reserved exactly as the gold rim is (§4.3): the one object that is a different *kind*
of thing gets the one material that is not wood. A player learns in two buffalo that metal
means buffalo, without being told.

**There is no music.** No bed, no loop, no ambience between actions. A puzzle game that hums
is a puzzle game people mute, and muting it would take the eleven cues with it. **The silence
is what lets short cues carry meaning.**

### 15.2 The rule that ties audio to the game's thesis

The visual system exists to make **size** legible (§5.2). The audio should carry the same
property rather than an unrelated one:

> **Pitch falls as size rises.** A rat is a high tick; an elephant is a low thud.

This is the lightness ramp in another sense — light/small/high against dark/large/low — and it
means a player who cannot see the board still knows what just landed.

```
species pitch = root − 2 × (size − 3) semitones      root = C4, 261.6 Hz

  rat (1)  +4      fox (2)  +2      elk (3)   0      elephant (4)  −2      buffalo (5)  −4
```

**Duration follows size too:** 60 ms at size 1 rising to 140 ms at size 5. Bigger things
sound bigger by being lower *and* longer, which is the same redundancy the four visual cues
use.

### 15.3 The cues

Peak levels in dBFS. Everything is quiet: this is a game played on a train.

| cue | material | pitch | length | peak |
|---|---|---|---:|---:|
| grab | wood tick | root +7 | 40 ms | −18 |
| snap to column | wood | species | 70 ms | −15 |
| land | wood, damped | species −2 | 90 ms | −15 |
| illegal move | wood, dead — **unpitched** | — | 110 ms | −14 |
| row clear | wood, open | root +12 | 220 ms | −10 |
| **cascade step n** | wood, open | root +12, **ascending pentatonic** | 200 ms | −10 |
| buffalo arrival | metal, heavily damped | root −4 | 180 ms | −13 |
| buffalo shrink | metal, damped | root −4 | 260 ms | −11 |
| buffalo retired | metal, open + octave | root −4 | 900 ms | −6 |
| perfect clear | wood chord, root +7 +12 | — | 1100 ms | −6 |
| new best | wood, rising 0 / +4 / +7 | — | 600 ms | −8 |
| game over | wood, falling 0 / −5, damped | — | 700 ms | −10 |
| **ability fired** | wood, the species' own pitch | species | 150 ms | −12 |
| **charge granted** | wood tick | root +12 | 120 ms | −14 |
| **Last Stand** | metal, with the danger pulse | root −4 | 500 ms | −8 |
| **unlock** | wood, rising 0 / +2 / +4 / +7 | — | 800 ms | −8 |

**The illegal move is the only unpitched cue in the game.** Everything else has a note;
rejection has none. That is the sound of the board not answering, and it needs no volume to
land.

**Ability cues borrow their species' pitch**, so Stampede is low and Burrow is high — the
scope ladder (§13.1) audible without a new vocabulary.

### 15.4 Cascades rise through a pentatonic scale, not chromatically

The shipped cue rises **one semitone** per step. Change it to a **pentatonic ascent** —
`0, +2, +4, +7, +9, +12` — for one reason:

> A chromatic run is consonant for two steps and sour by six. A pentatonic run **cannot** hit
> a bad interval at any depth, so a long cascade sounds like a reward rather than an alarm.

Cascades measured at depth 3 today, so this rarely differs in practice — but the rare deep
cascade is the best thing that happens in the game, and it should not be the moment the audio
turns dissonant.

### 15.5 What sound does not respond to

**Reduce Motion does not silence or alter anything here.** It addresses vestibular
discomfort; sound and haptics are neither motion nor a substitute for it. The **Sound** and
**Haptics** toggles in Settings are the controls for this, and they are the only ones.

**The silent switch takes sound and leaves haptics** (AC-1103), which is correct as well as
the only implementable behaviour: haptics are private and sound is not, so a player on silent
in public wants exactly this.

### 15.6 When two cues collide

**A new best suppresses the game-over cue.** They fall within one commit of each other and
would read as a mess. The emotionally dominant fact is the best, not the ending — and the
Game Over sheet already says the run is over, in the one channel that cannot be muted. One
moment, one sound.
