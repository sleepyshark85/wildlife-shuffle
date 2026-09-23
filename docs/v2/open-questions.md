# Wildlife Shuffle v2 — Open Questions

Thirteen questions, ten of them already answered. Each turns on the owner's intent or product strategy, not on design craft —
the design calls are made in `gameplay.md` and `ui.md`, and the full decision log is
`gameplay.md` §12. Every question below has a recommendation; if you agree with all of them, reply
"all as recommended" and nothing changes. **Q11–Q13 are the new ones**; they follow from
removing the habitats and lifting the one-buffalo rule.

They are ordered by how expensive they are to reverse later.

---

## Q1 · The bundle identifier — **DECIDED 2026-09-21**

> **The owner chose the new name.** `slug: wildlife-shuffle`,
> `bundleIdentifier: com.sleepyshark.wildlifeshuffle`, Android package to match. Landed before
> any build, so the identifier was never burned. Kept below for the record.

### Original question — resolved

> **Status, 2026-09-21:** Slice 6 (store readiness) is building and **this is the one thing
> stopping it**. The identifier is still `com.sleepyshark.animalrun`. The developer has been
> told not to touch it and is correct not to. **It becomes permanent at the first TestFlight
> submission**, which Slice 6 produces — so the window closes with that build, not later.
>
> Cost of deciding now: one line in `app.json`. Cost of deciding after: a new App Store
> Connect record, a new URL, and the loss of any reviews or installs. **My recommendation is
> unchanged and below.** If no answer arrives before the build, ship it as
> `com.sleepyshark.wildlifeshuffle` — an unused correct identifier costs nothing, and a used
> wrong one cannot be undone.

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

**Recommendation: delete it.** *(Answered yes, and since superseded in one detail: there are
no habitat choices either — `gameplay.md` §5.5b. Home is one Play button.)* The
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

## Q9 · Which theme does the app open in, for a player with no device preference?

`ui.md` §16 ships both and follows the device setting, with a manual override. That answers
almost everyone. It does not answer what a *screenshot* shows, or what someone whose phone is
set to "automatic" sees at 3pm.

The owner's words were *"should have more bright theme"*, which reads as a preference and not
only as a request for the option to exist.

**Recommendation: light is the default**, and the App Store screenshots are shot in light. The
request was made after seeing the dark one and finding it wanting; honouring it means leading
with the bright one, not burying it behind a setting. Overruling this is a one-line change and
a reshoot — cheap now, less cheap after the listing is up.

---

## Q10 · Does the natural background belong on Home and the sheets, or only on the board?

§16.3 puts the texture on the **board ground only**, so it can never sit behind an animal.
Home, Records, Collection and the sheets stay flat.

That is the safe reading of the owner's constraint, and it may be *too* safe: "natural
background" might have meant the app's whole surface, and the board is the one place the
constraint bites. The screens where nothing has to stay legible against it are the screens
where it is free.

**Recommendation: extend it to Home only**, at the same 1.25:1 ceiling, and leave Records,
Collection and all sheets flat because they are reading surfaces (§10). Home is the screen a
returning player sees first and the one that currently carries the least character.

---

## Q11 · Buffalo have no population cap. Confirm that is what you meant.

> **ANSWERED (owner, 23 Sep 2026): no cap.** They chose it over a cap of 3 with the
> measured worst case in front of them — 10 buffalo on the board, 25 of 135 cells locked.
> The ratchet is the point. Revisit only if a device round says the late game is *hopeless*
> rather than *hard*; those are different complaints and only the owner can tell them apart
> by playing it.


**The decision as built:** buffalo arrive on a fixed schedule (turns 12, 24, 36, 46, 56, 66,
74, 82, 90 …) and **nothing ever suppresses one**. If the player does not clear them, they
pile up.

**What that measures out to**, 300 bot runs on the shipped curve: 5.4 buffalo arrive per run,
the player retires 0.6 of them, and the run ends with a mean of **17.9 buffalo cells still
standing** — 13% of the board — with a worst case of **ten buffalo at once**. The run is
12 turns shorter than before (70 → 58 median, still 3.9 minutes, inside the §0 window).

**My recommendation: no cap, as built.** *"The player need to try to clear it as soon as
possible"* only means something if not trying has a cost that keeps growing, and a cap turns
the buffalo back into weather. The escalation is then responsive to how well someone is
playing rather than imposed on a timer, which is what you asked for.

**But I have measured the alternative, so it is one number away if you want it.** A cap of 3
with the schedule deferring to the first turn under cap: median 62 turns, worst case bounded
at 3 buffalo, 11 locked cells. A cap of 2: median 62, 7 locked cells, still 2.2 arrivals a run
against the shipped build's 1.1.

**Reach for it only if the device round says the late game is *hopeless* rather than *hard*.**
Those are different complaints and only you can tell them apart by playing it. If the answer
is "hard, and I keep starting another run", the cap stays off.

---

## Q12 · The merged records — one line of explanation, or none?

> **ANSWERED (owner, 23 Sep 2026): merge by best score.** The highest of the three per
> stat survives; which habitat produced it is lost. Not "keep as history" and not "reset" —
> the owner's best score stays their best score.


Your three sets of per-habitat bests merge into one by taking the maximum (`gameplay.md` §9a).
That is a decision I made and I am not asking you to remake it. What I am asking is whether
the app **says so**.

**My recommendation: one line on Records, once, dismissible.** *"Habitats are gone — your
best from any habitat is now just your best."* A player who had a Tundra best and now sees a
different number on a screen that never explains itself will assume the app lost their data,
and a support email about a lost high score costs more than one line of copy.

The alternative is silence, which is defensible — the numbers only go up, so nobody is worse
off. I recommend against it because the number that changed is the one people remember.

---

## Q13 · Does "the game gets harder over time" want a visible sense of progress?

> **ANSWERED (owner, 23 Sep 2026): yes, show the countdown.** The schedule is a pure
> function of the turn number now, so the HUD can say when the next buffalo lands without
> lying. That is the visible sense of progress, rather than a level number.


The curve now escalates without saying so: the band stops growing at turn 13 and everything
after that is buffalo arriving faster (every 12, then 10, then 8) and buffalo the player did
not clear. **The player can see the buffalo. They cannot see the cadence tighten.**

**My recommendation: do not add a level indicator, and do add the countdown.** `ui.md` §7.1
puts `NEXT 🐃 4` in the HUD, which tells the player when the next one lands; when that number
starts coming back as 8 instead of 12, the tightening is legible in the thing it actually
changes. A "Phase 2 of 3" banner would reintroduce the levels concept you just removed, under
a different name and with less information.

This is in here rather than decided because it is the one place where "no levels" and "the
game gets harder over time" pull against each other, and which way they resolve is a
statement about what the game is.

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
