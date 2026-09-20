# Wildlife Shuffle

A turn-based puzzle game for iPhone. Animals of different widths arrive at the bottom of a
board and push up whatever sits above them. You drag one animal sideways per turn to pack
the rows. A completely filled row clears. The run ends when anything reaches the kill line.

Built with Expo SDK 57, React Native 0.86, React 19. JavaScript.

## Run it

```bash
npm install
npx expo start            # then scan the QR with Expo Go
npx expo start --web      # or play it in a browser
```

No Expo account is needed to run a local dev server.

## Check it

```bash
npm test                      # 161 unit + property tests, then lint
node tools/play.mjs --seed 42 --turns 30   # play a seeded run as ASCII, no phone
node tools/play.mjs --pacing               # difficulty pacing table
node docs/v2/layout-sweep.mjs              # 682,290 viewports, must be 0 overflowing
node docs/v2/check-ac-refs.mjs             # dangling/duplicate acceptance-criteria refs
```

## How it is put together

Three layers, and the separation is enforced by tests rather than by convention.

| | |
|---|---|
| **`src/engine/`** | The rules. Pure functions, `(state, action) => state`. No React, no timers, no `Date.now()`, no `Math.random()` — randomness comes only from a seeded PRNG carried in the state. Runs in plain Node. |
| **`src/ui/`** | The React state layer and presentation. Owns every timer. Cell size is computed by one pure function and passed down. |
| **worklets** | Animation runs on the UI thread via Reanimated, driven by gesture-handler. It is a *replay* of state the engine already resolved, never a driver of it — a dropped frame cannot corrupt the board. |

**Determinism is the load-bearing property.** The same seed and the same inputs always produce
a deeply equal result. That is what makes a failure replayable, and everything else in the
verification strategy rests on it.

## Why it was rebuilt

The previous implementation resolved turns inside React `setState` updaters, with side effects
and `setTimeout` calls fired from within them — so under React 19 StrictMode every turn
double-counted. Its drag used `PanResponder → setState → re-render`, meaning the piece chased
your thumb rather than tracking it, and a move onto an occupied cell was rejected with no
feedback at all.

`docs/v1-review.md` is the full engineering review, including a correction: it was written
against a stale commit and got part of the feature inventory wrong.

## Documentation

| | |
|---|---|
| `docs/development-process.md` | The team, the procedure, and the rule each incident produced |
| `docs/v2/gameplay.md` | Rules, spawning, difficulty, scoring |
| `docs/v2/ui.md` | Layout, colour, the animal component, motion |
| `docs/v2/acceptance-criteria.md` | 249 numbered, testable criteria |
| `docs/v2/open-questions.md` | Decisions still outstanding |
| `spec.md` | **Historical.** It describes the previous implementation. |

## Status

Shipped: the rules engine, the state layer and the board. The game plays end to end.

Not yet built: the motion table beyond the drag, accessibility, persistence and session
resume, sound and haptics, and App Store assets. `docs/v2/gameplay.md` §0 lists what belongs
to which layer.
