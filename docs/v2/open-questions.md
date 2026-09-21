# Wildlife Shuffle v2 — Open Questions

Six questions. Each turns on the owner's intent or product strategy, not on design craft —
the design calls are made in `gameplay.md` and `ui.md`, and the full decision log is
`gameplay.md` §12. Every question below has a recommendation; if you agree with all six, reply
"all as recommended" and nothing changes.

They are ordered by how expensive they are to reverse later.

---

## Q1 · The bundle identifier and app name disagree. Fix now or never.

`app.json` currently has:

```
"name": "Wildlife Shuffle"
"slug": "animal-run"
"bundleIdentifier": "com.sleepyshark.animalrun"
```

The bundle identifier is **permanent once the app has been submitted to App Store Connect**,
including to TestFlight. Changing it after that means a new app record, a new URL, and the
loss of any reviews or installs. The slug is tied to the EAS project. Right now, both are free
to change; after the first TestFlight build, neither is.

**Recommendation: change both to match the product, before any build.**
`"slug": "wildlife-shuffle"`, `"bundleIdentifier": "com.sleepyshark.wildlifeshuffle"`.
The EAS `projectId` can stay. This is a five-minute change today and a permanent regret in a
month. If you have already created the App Store Connect record under `animalrun`, say so and
I will spec around it — it is survivable, just untidy.

---

## Q2 · v1's configurable board is deleted. Confirm.

`gameplay.md` §3 fixes the board at 10 × 15 and `ui.md` §2 deletes `SettingsMenu`'s width and
height steppers. v1 offered 5–15 columns and 10–25 rows; the advertised 15 × 25 does not fit a
6.1" iPhone at all (`docs/v1-review.md` D2).

This is a real loss of a feature you shipped, so it is your call rather than mine. The case
for deleting it: a variable board makes high scores incomparable, makes the difficulty numbers
in `gameplay.md` §5.5 untunable, and puts a settings screen in front of the game on first
launch. The case for keeping it: some players like knobs.

**Recommendation: delete it.** Difficulty moves to Home as three habitat choices, and the
board stays one shape so the leaderboard means something. The layout engine stays generic
(`W × H`), so if you later want a "Tall" or "Wide" mode it is a config constant, not a
rewrite — but it would need its own high-score table.

---

## Q3 · Is monetisation in scope for v2?

I have designed for a **free app with no ads, no in-app purchases, no analytics and no network
calls**. That choice propagates: it is why the privacy declaration in `ui.md` §11.4 is "Data
Not Collected", why the age rating is 4+, and why the four unlocks in `gameplay.md` §9 are
earned rather than sold.

Adding ads or IAP later is not a toggle. An ad SDK adds a network stack, a consent flow, an
ATT prompt and a changed privacy declaration; a rewarded-video "continue your run" also
changes the difficulty curve, because the curve currently assumes a run ends when it ends.

**Recommendation: no monetisation in v2.** Ship it free and see whether anyone plays it. If
the answer is yes, monetisation is a v3 conversation with real retention data behind it,
which is a much better conversation than this one.

---

## Q4 · Daily Challenge — build the plumbing now, ship the feature later?

`gameplay.md` §5.2 specifies a seeded PRNG with the seed recorded per run. That costs almost
nothing and buys reproducible bug reports on its own. It also means a Daily Challenge — every
player gets the same seed on the same date, with a shared result — becomes a screen and a
date-to-seed function rather than a redesign of the spawn system.

A Daily is the single strongest retention feature available to a game like this, and it is far
cheaper to accommodate now than to retrofit.

**Recommendation: build the seeded PRNG in v2 as specified; ship the Daily Challenge screen in
v2.1.** If you would rather have it in v2, say so now — it is roughly one screen plus a
storage field, and I will write the ACs.

---

## Q5 · Local high scores, or Game Center?

`gameplay.md` §9 stores everything locally. The consequence is honest but limited: your best
score is yours alone, and reinstalling the app loses it.

Game Center gives real leaderboards and achievements, iCloud-backed scores that survive
reinstalls, and a friends list — and it costs a capability, an authentication flow that can
fail or be declined, a privacy declaration that is no longer "Data Not Collected", and a
design for what the game looks like to a player who declines sign-in.

**Recommendation: local-only in v2.** The game has to be worth competing on before a
leaderboard is worth building, and a fixed 10 × 15 board (Q2) is the precondition that makes
adding Game Center later straightforward.

---

## Q6 · Android and web — supported, or incidental?

`CLAUDE.md` says "iPhone first; Android and web are incidental", and I have designed to that:
every dimension in `ui.md` §3 is an iPhone dimension, and the safe-area, haptic and sound
specs are iOS-specific.

The code will still run on Android and web, because the stack is Expo. What is undefined is
what "runs" is allowed to mean — Android has different safe-area behaviour, a back button with
no home for it in the navigation model, and haptics with a different vocabulary.

**Recommendation: iPhone is the only supported target for v2.** Keep the code
cross-platform and let Android and web run unsupported, but do not test against them, do not
ship to Google Play, and do not let an Android-only layout issue block a release. If you want
Android as a real target, it needs its own layout pass and its own AC group — say so and I
will write them.

---

## Q7 · Abilities: always available, or gated on the species being on the board?

`gameplay.md` §13.1 makes all five abilities available at any time, gated only by charges. The
owner's words — *"a special ability from any animal of choice"* — read most naturally that way.

The alternative is that an ability requires that species to be **on the board**. It ties the
two systems together and makes board state matter in a second way: you would keep a rat alive
because you might need Burrow. It also means sometimes being unable to use the ability you
need, which on a losing board is the moment the mechanic exists for.

**Recommendation: always available for the first build.** It is the simpler rule, it matches
the owner's phrasing, and gating can be added later without redesigning anything. If it turns
out charges are spent thoughtlessly because nothing constrains the choice, gating is the
first lever to reach for.

---

## Q8 · The tray loses species flavour — confirming that is wanted

`ui.md` §6 implements the shadow tray as asked, and §6.1 argues it keeps the honest-preview
contract: footprint and columns stay exact, only species identity is withheld, and species
affects nothing mechanically. Buffalo keeps its rim because it *does* change the rules.

What is genuinely lost is **flavour** — seeing a herd of elephants coming is a small pleasure
the silhouette removes, and the animals are the game's character. The mechanical argument for
the change is sound; the aesthetic cost is real and is the owner's to weigh.

**Recommendation: ship it and look at it.** It is a two-line change to revert per-species
colour into the strip if the board feels less alive without it, and 14 pt of board is worth
having either way.

---

## Things I decided rather than asking you

Listed so you can overrule any of them. Rationale for each is in `gameplay.md` §12.

- The board rises **only where arrivals land underneath** — v1's actual behaviour, verified by
  execution, and better than the global rise the spec claimed (`gameplay.md` §2).
- Movement is a **slide**, not a teleport; the swept path must be clear (§6.1).
- **Pass** is always available, which removes the soft-lock class of bug entirely (§6.3).
- The **1-column spawn buffer is removed** and replaced by an explicit, tunable cell band
  (§5.3).
- Difficulty **ramps within a run** and the three modes have different ceilings (§5.5).
- Score rewards **clears only, never elapsed turns** (§7.4).
- Cascade steps **pipeline** and the input lock is capped at **1500 ms**, down from the approved
  draft's 3.2 s (`ui.md` §8.2), and all animation runs on the UI thread (`ui.md` §8.3).
- The app is **dark-only** (`ui.md` §1).
- **iPad is not supported** (`ui.md` §3.2).
- The board is **9 × 15**, elephant is **4** and buffalo **5**, and the difficulty bands were
  **re-derived from scratch** rather than rescaled (`gameplay.md` §5.6).
- Buffalo's retirement bonus rose **500 → 650** so the premium tracks its larger imposition.
- Special abilities are **Layer D**, blocking nothing, with every threshold provisional until
  scores are measured (`gameplay.md` §13).
- **Session resume is ported from v1, not dropped** — stored as a seed plus a move list rather
  than a board snapshot, written on backgrounding only (`gameplay.md` §9). This is listed here
  because the v1 review's stale feature inventory nearly caused v2 to ship without it; the
  design originally had no equivalent, which would have been a regression against behaviour
  players already have.
