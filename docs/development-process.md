# Wildlife Shuffle — Team, Procedure and Development Process

How this project is built. Written from what actually happened building Slice 1, including
the mistakes, because the mistakes are the part worth writing down.

---

## 1. The team

Three agents, defined in `.claude/agents/`. They are invoked by name (`game-designer`,
`game-developer`, `game-tester`) and each has tools and boundaries set in its frontmatter.

| Agent | Owns | Cannot |
|---|---|---|
| **game-designer** | Gameplay, UI/visual system, acceptance criteria. Produces `docs/v2/`. | Write production code. Touch `src/`. |
| **game-developer** | Implementation against approved ACs. | Redefine ACs. Mark its own work verified. Commit. |
| **game-tester** | Verification by execution. Bug hunting beyond the ACs. | Fix what it finds. Modify `src/` or `test/`. Commit. |

**The separation is the point.** A developer that can edit the acceptance criteria will
edit them to match what it built. A tester that can fix what it finds stops reporting and
starts patching, and nobody learns the defect existed. A designer that writes code designs
what is easy to write.

**The orchestrator** (the main session) owns git, owns what reaches the owner, and is the
only party that verifies claims across agents. No agent's report is taken at face value —
see §5.

---

## 2. The slice pipeline

Work ships in slices. Each slice is gated on the owner.

```
  design ─→ OWNER APPROVES ─→ build ─→ test ─→ fix ─→ re-test ─→ PR ─→ OWNER
                                 ↑                        │
                                 └────── max 2 rounds ─────┘
```

If a slice is not green after two fix rounds it goes to the owner rather than grinding.

| Slice | Contents | Done when |
|---|---|---|
| **0** | Squad + approved design | Owner approves `docs/v2/` |
| **1** | Rules engine, headless | `npm test` green; seeded CLI replays identically |
| **2** | React state layer + board | **The game plays on a real phone** |
| **3** | Visual states, motion, accessibility | Matches the visual system |
| **4** | Meta progression, persistence | |
| **5** | Polish — sound, haptics, juice | |
| **6** | App Store readiness | Submittable |

Slices 1–3 are a complete, shippable game. 4–6 are layers the owner can defer
independently.

**Why the engine comes first.** Roughly 75% of v1's defects lived in the state layer, not
the rules. The engine is the only part that can be *proved* correct, so it is built and
verified with no rendering to hide behind. A feature-vertical slice would bury engine bugs
under rendering bugs, which is v1's exact failure mode.

---

## 3. The architectural rule everything rests on

v1's defining error: turn resolution ran inside React `setState` updaters, with side
effects and `setTimeout` calls fired from within them. Under React 19 StrictMode that
double-executes every turn.

v2 separates three concerns, and the separation is enforced by ACs, not by convention:

1. **A pure rules engine** — `(state, action) => state`. No React, no timers, no
   `Date.now()`, no `Math.random()`. Randomness comes only from a seeded PRNG carried in
   the state.
2. **A React state layer** — holds engine state, dispatches actions, owns every timer with
   explicit cleanup.
3. **Presentation** — animation is a *replay* of state the engine already resolved, never a
   driver of it. A dropped frame cannot corrupt the board.

**Determinism is the load-bearing property.** Same seed plus same inputs produces a deeply
equal result. Without it the tester cannot replay a failure and the entire verification
strategy collapses. It is attacked directly every round, and a regression there outranks
every other finding.

---

## 4. How verification works

Four tiers. Be honest about which tier a claim comes from.

| Tier | Method | Proves |
|---|---|---|
| **1 · Engine** | `node --test` + seeded invariant fuzzing | Rules, scoring, determinism |
| **2 · E2E** | Expo web + Playwright at iPhone viewport | The full loop: input → state → render |
| **3 · Layout** | Arithmetic against the continuous viewport sweep | Device fit, including hardware that has not shipped |
| **4 · On-device** | The owner, on a real iPhone | Feel, haptics, true touch, performance |

Only tier 4 proves iOS. Tier 2 is a strong signal and not proof: it is `react-native-web`
driven by mouse events. A failure there is real; a pass there is not a guarantee.

**Some defects no tier below 4 can represent at all.** Anything whose behaviour differs
between a `.native` and a `.web` module — worklet serialization above all — does not merely
go unnoticed on web, it *cannot happen* there. When a property is like that, audit it
structurally in Tier 1 rather than testing the behaviour anywhere (§6.9).

**Invariant fuzzing is the sharpest tool.** Drive the engine over thousands of seeded turns
and assert after *every step*: no overlap, nothing out of bounds, nothing floating after
gravity, unique ids, turn +1 exactly, every filled row resolved, score integral and
non-decreasing. Slice 1 ran 162,611 such turns.

**The tester verifies blind.** It writes its own tests from the ACs *before* reading the
developer's. Two passes that agree because they made the same assumption are worth one.

**Never trust a green check you have not seen fail.** Before relying on a new test, lint or
harness, inject the fault it is supposed to catch and confirm it fails. This rule exists
because of §6.2.

---

## 5. Claims are verified, not relayed

Every agent report is checked against the files and by execution before it is acted on or
passed to the owner. This is not distrust; it is the only way a multi-agent chain stays
honest. In Slice 1 it caught:

- A designer report claiming two ACs had been added. **Neither existed** — while two
  documents already cited one of them.
- A designer report claiming a table had been reworded. **It had not been**, so the spec
  still mandated behaviour the code correctly did not implement.
- A premise all three parties shared about why a safety rail was needed. **Nobody had
  checked it**, and it was false.

The orchestrator also verifies its *own* claims. A finding reported to the owner that
turns out to be wrong costs more than one that was never reported.

---

## 6. Incidents, and the rules that came from them

### 6.1 The rail that bounded nothing

The developer, the tester and the orchestrator all accepted: *"paying past the chain rail
would extend `chainMult` beyond what the rail exists to bound."* Nobody checked. `chainMult`
was already flat at ×5 from step 5, so paying step 11 paid exactly what step 5 paid. The
rail bounded nothing while confiscating 9,750 of 17,100 points — most of it a buffalo
retirement the player would have seen reported with no points attached.

**Rule:** a shared premise that nobody has executed is a guess. Check the cheap thing first.

**Corollary, from the designer:** *a rail that play reaches is not a safety rail, it is a
gameplay parameter.*

### 6.2 The check that could only pass

The designer verified a document fix by grepping for `set to the ×3.0 cap`. The file said
`Set to the ×3.0 cap`. Zero results was read as confirmation. Combined with a partial-write
in its edit script, two ACs were lost while being cited from two files.

**Rule:** a check that cannot fail is not a check. Prove a new check catches before trusting
it to pass. Now enforced by `docs/v2/check-ac-refs.mjs` (AC-1310), which was itself validated
by injecting dangling references and confirming a non-zero exit.

### 6.3 Statistics with two sources

Run statistics were accumulated in seven local variables *and* derivable from the event
stream. They agreed, which is the bug shape rather than its absence. The fix was not to sync
them: `resolveClears` now returns `{animals, events}` and nothing else, so there is no number
to increment from.

**Rule:** remove the second source rather than keeping two in sync. A sync rule is the thing
that fails. When one statistic looked like it needed an exception, the exception was refused
and the mechanism was made true instead — one exception is all it takes to need a sync rule
again.

### 6.4 Reviewing a stale commit

The v1 review was written against `1f6f9c3`, taken from the session-start git snapshot.
`origin/main` was **7 commits ahead**. The review reported v1 as lacking score, persistence
and sound, all of which existed. The architectural findings survived; the feature inventory
did not.

**Rule:** `git fetch` and compare against `origin/<branch>` before reviewing anything. A
session-start snapshot is a snapshot, not the truth.

### 6.5 The commit that was missing a file

Slice 3 was committed with `git add -- src test docs/v2 docs/slices.md`, which is explicit
staging done exactly as §7 requires. It omitted `App.js` — the only place `SettingsProvider`
is mounted — because the file sits at the repository root and no pattern named it. At that
commit every `useSettings()` consumer silently fell back to frozen defaults, disabling the
Reduce Motion path and with it the whole reason the slice existed.

The suite caught it, but only because someone ran the tests *at HEAD* rather than in the
working tree: 175 of 176. "176 passing" was true of the tree and false of the commit.

**Rule:** explicit staging is what stops unrelated work riding along, and it is also what drops
a required file. Verifying the tree is correct is not the same as verifying the commit is
complete. Before pushing a slice, run the suite against what was actually committed — a
detached worktree at HEAD, or a `git stash` around the test run.

### 6.6 Reverting a planted fault with git

An agent injecting faults to prove its tests can fail used `git checkout <file>` to undo one,
twice in a single slice — and both times destroyed real uncommitted work, because the file was
tracked but the *working-tree* version was the deliverable. It caught both by grepping for the
symbol immediately afterwards.

**Rule:** agents restore a planted fault from a scratchpad copy, never from git. Fault
injection happens on files whose committed state is by definition not the state you want back.

### 6.7 Right state, wrong appearance — twice

Two consecutive bugs shipped through every check we had, and the owner found both by playing.
Arriving animals rendered at opacity 0 for a whole run. Animals visually crossed each other
while falling. In both cases the engine was correct, the final positions were correct, and
**every harness we owned compared positions.**

The second has a sharper lesson than the first. Position was not a value anyone could
evaluate: each animal ran its own `withDelay`, which anchors to *that animation's own first
frame*, so twenty animations built across a vsync boundary started up to one frame apart. One
frame is a quarter of a row and a stack has no slack. Nothing could be swept, because where an
animal was depended on which frame it happened to start on.

The fix made position arithmetic — one clock per turn, and `rowAt(startY, keys, t)` as a pure
function — which is what made a 500-turn sweep possible at all.

**Rules:**
- Before writing presentation code, ask *what would this look like wrong while the state is
  right?* A position-only check cannot answer it.
- **Anything that must be checkable off-device must import nothing that only runs on-device.**
  Reanimated cannot load in Node, so a single import moves a property out of `node --test`'s
  reach and into the hands of a human with a phone. `src/ui/trajectory.js` imports nothing, and
  a hygiene test enforces it.

### 6.8 The stacked-branch merge

Slice 1's PR was based on Slice 0's branch. Both were merged within nine seconds — Slice 0
into `main` first, then Slice 1 into the already-merged Slice 0 branch. Slice 1's code never
reached `main`.

**Rule:** branch each slice from `main`, not from the previous slice's branch, unless the
dependency is genuine. If stacking is necessary, merge strictly in order and verify the
result is on `main` afterwards.

### 6.9 The defect no tier we ran could see

The first TestFlight build aborted on the very first row clear, every time. The cause was
one line in `ClearLayer.js`:

```js
const rowTop = (y, cell) => (ROWS - 1 - y) * cell;
```

`Departing`, `Shard` and `Float` each call it from inside a `useAnimatedStyle`. Reanimated
serializes a plain function captured by a worklet as a **Remote Function** — a stub whose
entire body is a `throw`. All three components mount *only* when a row clears, so the crash
was not merely reproducible but inevitable.

The uncomfortable part is not the mistake. It is that **375 tests and every browser run were
structurally incapable of catching it.** `remoteFunctionUnpacker` is `.native.ts` with no web
counterpart: on web a worklet is an ordinary closure on the JS thread and `rowTop` is simply
`rowTop`. Tiers 1–3 did not miss this defect — they cannot represent it. Only a device could
fail, and the device is the tier we run least.

Three hypotheses were offered before the cause was found, and **all three were wrong** — an
out-of-range schedule index, a stale capture, the cue path. The category was right ("a
worklet may only call worklets") and the file was wrong. Guessing narrowed nothing; the
answer came from compiling the file with the project's real Babel config and reading what
came out.

**Rule:** when a property holds only on a platform a tier cannot execute, do not test the
behaviour — **audit the property structurally in Tier 1.** `AC-828 a worklet calls only
worklets` parses every worklet body in the tree and resolves each callee. Run against the
broken `main` it found exactly one violation: this one.

**Rule:** for any question of the form "what does the bundler/transform actually emit",
compile it and look. `transformFileSync` with the project's own config is available to
`node --test`, it takes a few lines, and it replaces an argument with an artefact.

**Rule:** a green Tier 1–3 suite is evidence about Tiers 1–3. It is not evidence that a build
launches. Nothing may be called shippable on its strength alone — AC-824c's device pass is
not a formality at the end of the queue, it is the only tier that can see this class of
defect at all.

---

---

## 7. Git and PR workflow

- **One branch per slice**, named `slice-N-<topic>`, cut from `main`.
- **Never commit to `main` directly.**
- **Stage explicitly.** Never `git add -A` — unrelated working-tree changes (a dirty
  `package-lock.json`, another agent's in-flight files) must not ride along.
- **Agents do not commit.** Only the orchestrator does.
- **Commit messages** explain *why*, cite `path:line` for defects, and give real measured
  numbers rather than adjectives.
- **Before pushing, run the suite against what was committed**, not the working tree — a
  detached worktree at HEAD, or a `git stash` around the test run (§6.5).
- **After merging, verify the code is actually on `main`** (§6.8).

**Merge authority:** when the owner says *"go for it"*, that carries through to merging the
PR. The orchestrator still opens the PR and reports what is in it; it does not wait for a
second instruction. Absent that, PRs wait.

---

## 8. Working agreements

- **Ground everything in the real files.** Cite `path:line`. v1's `README.md` and `spec.md`
  both advertise features that do not exist in its code.
- **Measure, don't assert.** "Meadow is too easy" is an opinion; "Meadow's median run is 240
  turns against a 100–150 target" is a finding. Every pacing and layout claim in `docs/v2/`
  has a harness behind it.
- **Flag ambiguity, don't resolve it silently.** When the developer hit four contradictions
  in the design it reported all four and stated what it had assumed. Three became design
  changes; one became an AC that had been wrong since it was written.
- **Report failure plainly.** If tests fail, say so with the output. If a step was skipped,
  say that. Never mark your own work verified.
- **Correct errors without ceremony.** State the correction, carry the consequence, move on.

---

## 9. Running the checks

```bash
npm test                          # engine unit + property tests
node tools/play.mjs --seed 42 --turns 30    # watch a seeded run as ASCII
node tools/play.mjs --pacing                # difficulty pacing against AC-318
node docs/v2/check-ac-refs.mjs              # dangling / duplicate AC references
node docs/v2/layout-sweep.mjs               # viewport sweep, must be 0 overflowing
```

All four must be clean before a slice ships.
