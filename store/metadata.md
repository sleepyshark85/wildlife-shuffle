# App Store metadata — Wildlife Shuffle

Everything App Store Connect asks for. **Drafted fields are marked `[DRAFT]`** — change freely,
they are a starting point, not a recommendation. **`[YOU]`** marks fields only you can supply.

Submission checklist is at the bottom.

---

## Identity

| field | value |
|---|---|
| App name (30 chars max) | `Wildlife Shuffle` *(16)* |
| Subtitle (30 chars max) | `[DRAFT]` `Pack the rows. Beat the rise.` *(29)* |
| Bundle ID | `com.sleepyshark.wildlifeshuffle` |
| SKU | `[DRAFT]` `wildlifeshuffle-ios-001` |
| Primary category | Games › Puzzle |
| Secondary category | `[DRAFT]` Games › Strategy |
| Age rating | **4+** — no objectionable content, no ads, no purchases, no network |

---

## Promotional text (170 chars max, editable without review)

`[DRAFT]`

> Animals arrive at the bottom and push the board up. Drag one sideways each turn to pack a
> full row and clear it. Five abilities, three habitats, no ads, no timers.

*(198 — needs trimming. Alternative at 164:)*

> Animals arrive and push the board up. Drag one sideways each turn to pack a row and clear
> it. Five abilities, three habitats. No ads, no timers, no network.

---

## Description (4000 chars max)

`[DRAFT]`

```
Animals arrive at the bottom of the board and push everything above them upward. You get one
move per turn: drag a single animal sideways. Fill a row completely and it clears.

That's the whole game. The depth is in what you do with it.

WHAT MAKES IT DIFFICULT

Every animal is a different width — a rat is one cell, an elephant is four. Packing a nine-wide
row means the widths have to add up exactly, and the pieces you need arrive when they arrive.

The buffalo doesn't clear. Complete a row containing one and it shrinks by a segment instead,
so a buffalo costs five completed rows to remove — and pays more than five clean rows for the
trouble.

WHAT YOU CAN SEE COMING

The tray below the board shows the shapes arriving next turn, in the columns they'll land in.
It doesn't lie and it never changes its mind. Every plan you make is a plan you can trust.

WHEN IT GOES WRONG

Score earns charges, and charges buy abilities — one per species, each acting at a different
scale. Burrow removes a single animal. Dart gives you three moves in one turn. Migrate clears
an entire species off the board. Stampede slides every row left to close its gaps. Hold the
Line stops arrivals for three turns.

And if animals reach the danger band, you're given a charge outright — once per run, regardless
of score. The help arrives when you need it, not when you've earned it.

THREE HABITATS

Meadow is roughly five minutes. Savanna is three. Tundra is two, and unforgiving.

WHAT IT DOESN'T DO

No ads. No in-app purchases. No timers or energy. No account, no tracking, no network requests
of any kind — the game has never made one and a test enforces it. Your scores stay on your
phone.

Accessibility: full Dynamic Type on every screen, VoiceOver throughout, Reduce Motion, High
Contrast, and optional size numerals on every animal.
```

---

## Keywords (100 chars max, comma-separated, no spaces after commas)

`[DRAFT]`

```
puzzle,blocks,strategy,offline,brain,logic,tetris,animals,relax,no ads,single player,casual
```

*(90 chars.)* Avoid repeating words already in the app name or subtitle — Apple indexes those
separately, so "wildlife" and "shuffle" are wasted here.

---

## URLs

| field | value |
|---|---|
| Support URL | `[YOU]` — **required.** A GitHub repo page or an email-only page is acceptable. |
| Marketing URL | `[YOU]` — optional, leave blank if none. |
| Privacy policy URL | `[YOU]` — **required even for "Data Not Collected".** See the template below. |

### Privacy policy — draft text you can host anywhere

`[DRAFT]`

```
Wildlife Shuffle does not collect any data.

The app makes no network requests. It has no analytics, no advertising, no third-party SDKs and
no account system. Your scores, statistics and settings are stored only on your device and are
never transmitted anywhere.

If you delete the app, that data is deleted with it.

Contact: [YOU — your support email]
```

---

## App Privacy declaration (App Store Connect form)

Answer **"No, we do not collect data from this app."** That's the whole form.

Verified in code rather than assumed: **zero network requests observed** through first launch,
onboarding and a full run; no analytics or ad dependency in the tree; no tracking usage
description in the manifest; and `expo-audio`'s microphone permission explicitly disabled,
because a mic permission beside a "Data Not Collected" declaration is a contradiction reviewers
will notice.

---

## Screenshots

Required: **6.9"** (1320 × 2868) and **6.5"** (1242 × 2688). Five each.

`scratchpad/s6shots/store/` holds 20 rehearsal renders proving each shot can be composed —
**they are not submittable.** They come from `react-native-web` in a headless browser, so the
fonts, emoji, status bar and safe areas are all wrong for a device.

The five shots, in order:

1. **Skyline** — a busy board, mid-run, score visible.
2. **A row clearing** — the flash at peak with the `+N` floating.
3. **The tray** — silhouettes below the board, showing what arrives next.
4. **A buffalo shrinking** — 5 → 4, the HUD chip tracking it.
5. **Game over** — final score and the run's stats.

Take them on your iPhone with the volume-up + side-button shortcut. A 6.9" device (15/16/17/18
Pro Max) covers the first set; App Store Connect will scale it down for 6.5" if you'd rather not
shoot both.

---

## Version

| field | value |
|---|---|
| Version | `1.0.0` |
| Build | auto-incremented by EAS (`eas.json` `production.autoIncrement`) |
| Copyright | `[DRAFT]` `2026 [YOU — your name or company]` |
| What's New | First release. |

---

## Review notes

`[DRAFT]`

```
No account or login is required. The game is fully playable from first launch.

A four-beat tutorial runs automatically on first launch and can be skipped at any point. It
teaches the core loop on the real game board.

The app makes no network requests.
```

---

## Before you submit

- [ ] `[YOU]` Support URL and privacy policy URL are live
- [ ] `[YOU]` Screenshots taken on a real device
- [ ] `[YOU]` Icon signed off — the current one is generated and defensible, not designed
- [ ] `[YOU]` App Privacy: "Data Not Collected"
- [ ] `[YOU]` Age rating questionnaire → 4+
- [ ] A native build has actually compiled in Xcode — **`expo prebuild` generating project files
      is not the same as a build linking**, and nothing has been through Xcode yet
- [ ] The device review owed since Slice 3 (`docs/v2/acceptance-criteria.md` AC-824c) — clear
      timings, the anticipation wash, Dynamic Type, `hitSlop`, real safe areas, and the sound
      and haptics nobody has heard on a phone
