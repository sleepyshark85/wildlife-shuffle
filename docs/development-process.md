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

### 6.7 The stacked-branch merge

Slice 1's PR was based on Slice 0's branch. Both were merged within nine seconds — Slice 0
into `main` first, then Slice 1 into the already-merged Slice 0 branch. Slice 1's code never
reached `main`.

**Rule:** branch each slice from `main`, not from the previous slice's branch, unless the
dependency is genuine. If stacking is necessary, merge strictly in order and verify the
result is on `main` afterwards.

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
- **After merging, verify the code is actually on `main`** (§6.7).

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
