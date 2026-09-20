# Wildlife Shuffle

A turn-based puzzle game for iPhone. Animals of different widths rise up a grid; the player
drags them horizontally to pack rows; a completely filled row clears. Game ends when an
animal reaches the top.

**Stack:** Expo SDK 56, React Native 0.85, React 19. JavaScript (not TypeScript). Target is
iPhone first; Android and web are incidental.

## Where things stand

v1 is the code currently on `main`. It works but is buggy and visually unfinished.
`docs/v1-review.md` is the authoritative list of what is wrong with it — read it before
proposing or writing anything. **We are designing v2.** No v2 implementation begins until
the owner has reviewed and approved the design.

## Repo map

| Path | What it is |
|---|---|
| `docs/v1-review.md` | Engineering review of v1. The squad's shared input. |
| `docs/v2/` | v2 design artifacts (designer's output). |
| `spec.md` | v1 spec. Historical — it drifted from the code. Do not treat as truth. |
| `src/data/gameLogic.js` | Pure-ish rules: spawn, gravity, row clear, move validation. |
| `src/data/gameStore.js` | The React state layer. This is where v1's bugs live. |
| `src/components/` | UI. `GameGrid` renders the board, `Animal` a single piece. |

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
