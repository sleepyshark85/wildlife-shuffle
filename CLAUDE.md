# Wildlife Shuffle

A turn-based puzzle game for iPhone. Animals of different widths rise up a grid; the player
drags them horizontally to pack rows; a completely filled row clears. Game ends when an
animal reaches the top.

**Stack:** Expo SDK 56, React Native 0.85, React 19. JavaScript (not TypeScript). Target is
iPhone first; Android and web are incidental.

## Where things stand

**v1 is gone.** It was deleted in Slice 2 and replaced. `main` carries the v2 rebuild:
`src/engine/` (pure rules) and `src/ui/` (React state layer and presentation). The game
plays end to end — pick a habitat, drag an animal, resolve a turn, reach Game Over.

**Read `docs/slices.md` first.** It records what each slice contains, what is actually true
of it, and — in *Resuming this project in a fresh session* — exactly what to run and read if
you are picking this up with no conversation history.

**All slices are merged**, on Expo SDK 57: the rules engine; the state layer and board;
motion, visual states and accessibility; meta progression and persistence; abilities;
sound and haptics; and store readiness. `npm test` on `main` is **431 passing**.

The app has been through TestFlight once. **That build crashed on the very first row clear**
— a plain function called from three worklets, which no tier below 4 could see. Fixed in
PR #34; read `docs/development-process.md` §6.9 before trusting a green suite to mean a
working build.

In flight, not yet merged: **the light theme** (AC-1501–1514, designed in PR #33). Light is
to become the default, with a natural texture on the board and Home.

**Owed to the owner: a device review.** The clear timings and the anticipation wash are
marked provisional in AC-824c, which carries the full list of what only a phone can settle —
including Dynamic Type, which `react-native-web` cannot observe at all. Also owed: real
screenshots, icon sign-off, and the support and privacy URLs in `store/metadata.md`.

**Identity is permanent.** The bundle identifier is `com.sleepyshark.wildlifeshuffle`, fixed
by the first TestFlight submission. The Expo slug is `wildlife-shuffle` — immutable, but
cosmetic. These are not the same thing.

**Always `git fetch` and compare against `origin/<branch>` before reviewing anything.** A
session-start snapshot is a snapshot, not the truth (`docs/development-process.md` §6.4).

## Repo map

| Path | What it is |
|---|---|
| `docs/slices.md` | **What each slice contains, and how to resume with no history. Start here.** |
| `docs/development-process.md` | The team, the procedure, and the rules each incident produced. Read §6. |
| `docs/v1-review.md` | Engineering review of v1. Carries a correction — it was written against a stale commit. |
| `docs/v2/` | The approved v2 design: gameplay, UI, ~400 acceptance criteria, open questions. |
| `docs/v2/layout-sweep.mjs` | The continuous viewport sweep (AC-119). Must report 0 overflowing. |
| `docs/v2/check-ac-refs.mjs` | The documents lint (AC-1310). Dangling or duplicate AC references fail it. |
| `src/engine/` | The rules engine. Pure, seeded, no React, no timers. Slice 1. |
| `src/ui/` | React state layer, presentation and layout. Slice 2. |
| `test/` | `node --test`. Engine unit and property tests, layout sweep, presentation, hygiene greps. |
| `tools/play.mjs` | Headless CLI: play a seeded run, or `--pacing` for the difficulty table. |
| `store/metadata.md` | App Store listing. `[YOU]` marks what only the owner can supply. |
| `spec.md` | **v1's spec. Historical — it describes code that no longer exists.** |

v1's `src/components/`, `src/data/` and `src/hooks/` were deleted in Slice 2. Do not look for
them; `docs/v1-review.md` records what they did and why they were replaced.

## The squad

Three subagents, defined in `.claude/agents/`:

- **game-designer** — owns gameplay, UI, and acceptance criteria. Produces `docs/v2/`.
- **game-developer** — implements against an approved design. Does not invent scope.
- **game-tester** — verifies against acceptance criteria. Does not fix what it finds.

They run in sequence, gated on owner approval: **design → approve → build → test**.
The designer does not write production code. The developer does not redefine ACs. The
tester does not patch the code it is testing.

## Working rules

- **Ground everything in the real files.** Cite `path:line`. v1's own README and `spec.md`
  both claim features that do not exist in the code — verify before believing either.
- **The rules engine must be pure and testable.** v1's central mistake was resolving turns
  inside React `setState` updaters with ad-hoc `setTimeout`s. v2 separates the deterministic
  state machine from React and from animation timing.
- **Keep from v1:** the `{id, type, x, y, size}` animal model, `applyGravity`'s bottom-to-top
  algorithm, and the core loop including the buffalo-shrink mechanic.
- **iPhone constraints are real.** The board must fit a 6.1" screen without scrolling or
  clipping, and respect the Dynamic Island and home indicator.
- No `console.log` in the render path. No dead code. No dependencies that are not imported.
