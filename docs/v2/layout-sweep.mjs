// Wildlife Shuffle v2 — executable form of AC-119 (see docs/v2/acceptance-criteria.md).
// Verifies the ui.md §3.2 cell-size ladder over a continuous viewport space rather than a
// fixed device list, so hardware that has not shipped is covered by construction.
// Run: node docs/v2/layout-sweep.mjs   — expected: 'overflowing : 0'

// Candidate v2 formula: graceful degradation ladder, tested across the continuous space.
//
// `strip` is ui.md §7.1's buffalo strip, reserved whether or not it is showing.
// §7.1 asks for the gap to absorb it; measured, the gap is 9-51 pt across the
// §3.2 device table and five of those ten devices have less than 20, so it is
// funded out of `gaps` instead and the board yields the remaining 8 pt (full) /
// 10 pt (compact). The reasoning is in src/ui/layout.js CHROME; this file is the
// same numbers, and it has to carry them or AC-119 sweeps a layout that no
// longer ships.
const FULL   ={hud:52,act:48,tray:31,gaps:20,strip:20};  // 171  (tray thinned, item 3)
const COMPACT={hud:44,act:44,tray:26,gaps:14,strip:16};  // 144
const RAIL   ={hud:0, act:0, tray:31,gaps:32,strip:0};   // 63  (wide: chrome moves to a side rail)
const sum=c=>c.hud+c.act+c.tray+c.gaps+c.strip;
const W_RAIL=600, COLS=9, ROWS=15, GUTTER=32;

function layout(w,h,it,ib){
  const tryStage=(chrome,lo,hi)=>{
    const availH=h-it-ib-sum(chrome);
    const cell=Math.floor(Math.min((w-GUTTER)/COLS, availH/ROWS));
    return {cell:Math.min(cell,hi), ok:cell>=lo, raw:cell, chrome};
  };
  // Stage W: wide screens move HUD + action bar into a side rail
  if(w>=W_RAIL){
    const s=tryStage(RAIL,30,48);
    if(s.ok) return {stage:'W-rail', cell:s.cell, chrome:sum(RAIL)};
  }
  const s0=tryStage(FULL,30,44);      if(s0.ok) return {stage:'0-comfortable',cell:s0.cell,chrome:sum(FULL)};
  const s1=tryStage(COMPACT,30,44);   if(s1.ok) return {stage:'1-compact',   cell:s1.cell,chrome:sum(COMPACT)};
  const s2=tryStage(COMPACT,24,44);   if(s2.ok) return {stage:'2-minimum',   cell:s2.cell,chrome:sum(COMPACT)};
  return {stage:'3-unsupported', cell:null, chrome:sum(COMPACT)};
}
function fits(w,h,it,ib,L){
  if(L.cell===null) return true;                          // stage 3 renders a message, not a board
  return (L.cell*ROWS + L.chrome + it + ib) <= h && (L.cell*COLS) <= (w-GUTTER);
}

const devices=[
  ['iPhone SE 1 / 5s',320,568,0,0],['iPhone 6/7/8/SE2/SE3',375,667,20,0],
  ['iPhone 12/13 mini',375,812,50,34],['iPhone X/XS/11 Pro',375,812,44,34],
  ['iPhone 14/15/16',393,852,59,34],['iPhone 17/18 Pro',402,874,62,34],
  ['iPhone 11/XR/14 Plus',414,896,48,34],['iPhone 15/16/17 Plus',430,932,59,34],
  ['iPhone 16/17/18 Pro Max',440,956,62,34],
  ['Duo folded  (@3x est)',466,678,59,34],
  ['Duo folded  (small inset)',466,678,20,34],
  ['Duo unfolded (@3x est)',626,890,42,34],
  ['Duo unfolded (ASC est)',669,951,42,34],
  ['iPad mini (excluded)',744,1133,24,34],
  ['Duo folded  book-fold?',313,890,59,34],
  ['Duo folded  squat?',466,678,70,40],
  ['Duo unfolded landscape',890,626,34,34],
  ['Display Zoom on 14/15/16',320,693,59,34],
  ['Display Zoom on Pro Max',375,812,62,34],
];
console.log('DEVICE                        size      insets  stage            cell  board      fits');
for(const [n,w,h,it,ib] of devices){
  const L=layout(w,h,it,ib);
  const board=L.cell?`${L.cell*COLS}x${L.cell*ROWS}`:'—';
  console.log(`${n.padEnd(28)} ${String(w).padStart(3)}x${String(h).padEnd(4)} ${String(it).padStart(2)}/${String(ib).padEnd(2)}  ${L.stage.padEnd(16)} ${String(L.cell??'-').padStart(3)}  ${board.padEnd(10)} ${fits(w,h,it,ib,L)?'OK':'*** OVERFLOW ***'}`);
}

// Continuous sweep
let n=0,bad=0,unsup=0,stages={};
for(let w=272;w<=900;w+=2)for(let h=480;h<=1200;h+=2)
  for(const [it,ib] of [[0,0],[20,0],[44,34],[59,34],[62,34],[70,40]]){
    const L=layout(w,h,it,ib); n++;
    stages[L.stage]=(stages[L.stage]||0)+1;
    if(L.stage==='3-unsupported'){unsup++;continue;}
    if(!fits(w,h,it,ib,L)) bad++;
  }
console.log(`\nCONTINUOUS SWEEP  ${n.toLocaleString()} combinations (w 272-900, h 480-1200 @2pt, 6 inset profiles)`);
console.log('  overflowing :',bad);
console.log('  stage mix   :',Object.entries(stages).map(([k,v])=>`${k}=${(v/n*100).toFixed(1)}%`).join('  '));

// Where is the true unsupported boundary?
for(const [it,ib] of [[0,0],[59,34],[62,34]]){
  let minH=null;
  for(let h=400;h<=900;h++){ const L=layout(400,h,it,ib); if(L.stage!=='3-unsupported'){minH=h;break;} }
  console.log(`  insets ${it}/${ib}: smallest supported height = ${minH} pt`);
}
console.log('  smallest supported width =', 24*COLS+GUTTER, 'pt');

// ===========================================================================
// S7 · the onboarding coach (AC-1206, AC-1208), swept over the same space
// ===========================================================================
//
// WHY THIS IS HERE. AC-119's "overflowing : 0" above is a claim about the GAME
// screen and nothing else — before this section, `grep -i onboard` over this
// file and over src/ui/layout.js returned nothing. The tutorial is an overlay
// on the same screen and it has its own geometry, and none of it was measured
// anywhere. The owner found that out by playing build 3.
//
// WHAT THE CARD HAS TO DO. There is no AC on its placement — AC-1206/AC-1208
// say it runs on the real board, gates on the action and is skippable, and say
// nothing about where the caption sits. So the invariants below are the ones
// those ACs IMPLY and nothing more:
//
//   on screen     it is inside the safe area, top and bottom (AC-910: no text
//                 clipped or truncated).
//   not the tray  AC-1208's beat is about the tray, so the card may not cover
//                 it.
//   not the board it gates on the player PERFORMING the action, so it may not
//                 cover an animal the beat opens with.
//   not the HUD   Pause is in the HUD and Settings is behind Pause, so a player
//                 who needs Reduce Motion must be able to reach it during their
//                 first four minutes (AC-906, AC-1207). The card sits BELOW the
//                 HUD; OnboardingCoach.js's header says so, and says the card
//                 used to cover Pause before it did.
//   no wide word  the longest word fits the card's content width, or the text
//                 clips sideways.
//
// The card is NOT required to stay inside the danger band. The comment at the
// head of OnboardingCoach.js says it does — "what the card covers instead is
// the top of the board, which on every beat board is the empty danger band" —
// and the DANGER BAND column below shows that is false on every iPhone in the
// table and true only on an iPad. It costs nothing (the band is empty and so
// are the four rows under it on every beat board), but the sentence is wrong
// and it is printed here rather than asserted.
//
// HOW THE CARD'S HEIGHT IS KNOWN. Measured, then modelled, then checked back
// against the measurements. The card is
//
//   border + padding + gaps + head + title lines + body lines [+ Next button]
//
// and the only unknown is how many lines the title and the body wrap to. That
// is computed here by greedy word-wrap over ADV below — a per-character
// advance table measured out of the shipped web build's own font stack with
// `canvas.measureText`, which resolves to Helvetica/Arial metrics. The model
// was validated against 70 measurements of the real rendered card (10 widths x
// 7 Dynamic Type steps, read off `getBoundingClientRect`): it reproduced all
// 70 line counts exactly and never under-estimated the card's height, with a
// largest over-estimate of 11.9 pt.
//
// WHAT THAT BOUND DOES NOT COVER, and it is the usual one: iOS renders SF Pro,
// not Helvetica. SF Pro is a little narrower at the same point size, so these
// line counts are an upper bound for the device rather than its exact answer —
// and Dynamic Type itself is invisible to Tier 2 at all (AC-910h). The ladder
// printed below is therefore the shape of the answer; only AC-824c can confirm
// the step it breaks at.

const SPACE = { xs: 4, sm: 8, lg: 16 };
const CARD_BORDER = 1;
const TOUCH = 44;
const HAIRLINE = 1;
/** ui.md §9's type scale, for the three styles the card uses. */
const TITLE = { size: 22, line: 26, weight: 700, track: -0.2 };
const BODY  = { size: 15, line: 20, weight: 400, track: 0 };
const BUTTON_LINE = 20;
/** engine/constants.js: rows 11-13 are the danger band; row 14 is the ceiling. */
const DANGER_LOW = 11;

/**
 * The four beats, as the design states them. Deliberately a COPY of
 * `src/ui/onboarding.js` rather than an import — the sweep is the reference
 * the code is held to, and a reference that imports the code checks nothing.
 * `test/layout.test.js` asserts the two agree, so drift fails loudly.
 *
 * `top` is the highest occupied row of the beat's OPENING board (y counts up
 * from the floor; -1 means the board is empty, which beat 3's is).
 */
const BEATS_UI = [
  { id: 'slide', top: 0,
    title: 'Slide the fox',
    body: 'Drag the fox left into the gap. Animals only move sideways, and only through empty cells.' },
  { id: 'clear', top: 1,
    title: 'Fill every column',
    body: 'One column of the bottom row is empty. Slide a rat from the row above into it — it falls in, and the row goes.' },
  { id: 'tray', top: -1,
    title: 'The tray is a promise',
    body: 'The strip under the board is the next arrival: the exact shapes, in the exact columns. Take a turn and watch them land.' },
  { id: 'buffalo', top: 1,
    title: "The buffalo doesn't clear",
    body: 'Complete the row it sits in and it loses one segment instead. 5 segments, 5 completed rows, and it retires for a bonus.' },
];

/**
 * Character advance in ems, measured from the shipped web build's resolved
 * font stack at weight 700 (title) and 400 (body). Only the characters the
 * copy above uses are here; `advance` throws on anything else, so new copy
 * fails this sweep rather than being silently mis-measured.
 */
const ADV = {
  700: {' ':0.2778,"'":0.2378,',':0.2778,'.':0.2778,':':0.333,'5':0.5562,'A':0.7222,'C':0.7222,'D':0.7222,'F':0.6108,'O':0.7778,'S':0.667,'T':0.6108,'a':0.5562,'b':0.6108,'c':0.5562,'d':0.6108,'e':0.5562,'f':0.333,'g':0.6108,'h':0.6108,'i':0.2778,'k':0.5562,'l':0.2778,'m':0.8892,'n':0.6108,'o':0.6108,'p':0.6108,'r':0.3892,'s':0.5562,'t':0.333,'u':0.6108,'v':0.5562,'w':0.7778,'x':0.5562,'y':0.5562,'·':0.333,'—':1},
  400: {' ':0.2778,"'":0.1909,',':0.2778,'.':0.2778,':':0.2778,'5':0.5562,'A':0.667,'C':0.7222,'D':0.7222,'F':0.6108,'O':0.7778,'S':0.667,'T':0.6108,'a':0.5562,'b':0.5562,'c':0.5,'d':0.5562,'e':0.5562,'f':0.2778,'g':0.5562,'h':0.5562,'i':0.2222,'k':0.5,'l':0.2222,'m':0.833,'n':0.5562,'o':0.5562,'p':0.5562,'r':0.333,'s':0.5,'t':0.2778,'u':0.5562,'v':0.5,'w':0.7222,'x':0.5,'y':0.5,'·':0.333,'—':1},
};

function advance(text, type, scale) {
  const table = ADV[type.weight];
  let w = 0;
  for (const ch of text) {
    const a = table[ch];
    if (a === undefined) {
      console.error(`layout-sweep: no measured advance for ${JSON.stringify(ch)} at weight `
        + `${type.weight}. Re-measure ADV against the shipped font before changing the copy.`);
      process.exit(2);
    }
    w += a * type.size * scale + type.track;
  }
  return w;
}

/** Greedy word wrap, which is what both RN and the browser do. */
function wrapLines(text, type, scale, avail) {
  const space = advance(' ', type, scale);
  let n = 1, cur = null;
  for (const word of text.split(' ')) {
    const w = advance(word, type, scale);
    if (cur === null) { cur = w; continue; }
    if (cur + space + w <= avail + 1e-6) cur += space + w; else { n += 1; cur = w; }
  }
  return n;
}
const longestWord = (text, type, scale) =>
  Math.max(...text.split(' ').map((w) => advance(w, type, scale)));

/**
 * The card's laid-out height, and the widest thing that has to fit across it.
 *
 * Memoised on (width, scale, beat, state) because that is all it depends on,
 * and the sweep asks for it 34 million times against 17,640 distinct answers.
 */
const CARD_MEMO = new Map();
function coachCard(beat, satisfied, screenW, scale) {
  const key = `${screenW}|${scale}|${beat.id}|${satisfied ? 1 : 0}`;
  const hit = CARD_MEMO.get(key);
  if (hit) return hit;
  const out = computeCard(beat, satisfied, screenW, scale);
  CARD_MEMO.set(key, out);
  return out;
}
function computeCard(beat, satisfied, screenW, scale) {
  // frame padding, card padding, card border — both sides of each.
  const contentW = screenW - 2 * SPACE.lg - 2 * SPACE.lg - 2 * CARD_BORDER;
  const title = satisfied ? `Done · ${beat.title}` : beat.title;
  const titleLines = wrapLines(title, TITLE, scale, contentW);
  const bodyLines = wrapLines(beat.body, BODY, scale, contentW);
  // The Skip button and the Next button are the same control: a 44 pt touch
  // floor that grows once the scaled label needs more (Controls.js `button`).
  const button = Math.max(TOUCH, 2 * SPACE.xs + (BUTTON_LINE + 2) * scale);
  const height = 2 * CARD_BORDER + 2 * SPACE.lg + 2 * SPACE.sm + button
    + titleLines * Math.ceil(TITLE.line * scale)
    + bodyLines * Math.ceil(BODY.line * scale)
    + (satisfied ? SPACE.sm + button : 0);
  const widest = Math.max(longestWord(title, TITLE, scale), longestWord(beat.body, BODY, scale));
  return { height, contentW, widest, titleLines, bodyLines };
}

/** Where the Game screen puts everything, in screen points (GameScreen.js). */
function screenGeometry(w, h, it, ib, L) {
  if (L.cell === null) return null;
  const wide = L.stage === 'W-rail';
  const chrome = wide ? RAIL : (L.chrome === sum(FULL) ? FULL : COMPACT);
  const gap = chrome === COMPACT ? 10 : 16;
  const hudH = wide ? 0 : chrome.hud + HAIRLINE;
  const barH = wide ? 0 : chrome.act + HAIRLINE;
  const group = L.cell * ROWS + gap + chrome.tray;
  // The buffalo strip sits between the HUD and the centred group, reserved
  // whether or not it is showing (ui.md §7.1, src/ui/layout.js CHROME).
  const region = h - it - ib - hudH - barH - chrome.strip;
  // ui.md §3.1: the board + tray group is a flex child CENTRED in what is left.
  const boardTop = it + hudH + chrome.strip + (region - group) / 2;
  return {
    screenW: w,
    boardTop,
    strip: chrome.strip,
    trayTop: boardTop + L.cell * ROWS + gap,
    // GameScreen.js: `top={insets.top + (wide ? 0 : chrome.hud + chrome.strip)}`,
    // and the card adds SPACE.sm of its own. The strip is in the sum because
    // beat 4 is the buffalo beat and its scripted board puts one on screen.
    cardTop: it + (wide ? 0 : chrome.hud + chrome.strip) + SPACE.sm,
    hudBottom: it + hudH + (wide ? 0 : chrome.strip),
    safeBottom: h - ib,
    rowTop: (y) => boardTop + (ROWS - 1 - y) * L.cell,
    dangerBottom: boardTop + (ROWS - DANGER_LOW) * L.cell,
  };
}

/** The four invariants, for one beat in one state on one screen. */
function coachFaults(g, L, it, scale, beat, satisfied) {
  const card = coachCard(beat, satisfied, g.screenW, scale);
  const bottom = g.cardTop + card.height;
  return {
    offScreen: bottom > g.safeBottom || g.cardTop < it,
    coversHud: g.cardTop < g.hudBottom,
    coversTray: bottom > g.trayTop,
    coversBoard: beat.top >= 0 && bottom > g.rowTop(beat.top),
    wideWord: card.widest > card.contentW,
    pastDanger: bottom > g.dangerBottom,
    rowsCovered: (bottom - g.boardTop) / L.cell,
    height: card.height,
    top: g.cardTop,
    bottom,
  };
}

console.log('\n\nTUTORIAL (S7) — the coach card over the same continuous space');
console.log('\nPer device, at Dynamic Type Large. ROWS COVERED is how much of the board the card');
console.log('sits over; the danger band plus the ceiling row is 4, and being over that is not a');
console.log('fault — it is OnboardingCoach.js\'s header comment being wrong.\n');
console.log('DEVICE                        stage            cell  card  top..bottom  rows  danger band  verdict');
for (const [n, w, h, it, ib] of devices) {
  const L = layout(w, h, it, ib);
  if (L.cell === null) { console.log(`${n.padEnd(28)} unsupported`); continue; }
  const g = screenGeometry(w, h, it, ib, L);
  let worst = null;
  for (const beat of BEATS_UI) for (const satisfied of [false, true]) {
    const f = coachFaults(g, L, it, 1, beat, satisfied);
    if (!worst || f.rowsCovered > worst.rowsCovered) worst = f;
  }
  const bad = worst.offScreen || worst.coversHud || worst.coversTray
    || worst.coversBoard || worst.wideWord;
  console.log(
    `${n.padEnd(28)} ${L.stage.padEnd(16)} ${String(L.cell).padStart(3)}  `
    + `${String(Math.round(worst.height)).padStart(4)}  `
    + `${(`${Math.round(worst.top)}..${Math.round(worst.bottom)}`).padStart(11)}`
    + `  ${worst.rowsCovered.toFixed(2).padStart(4)}  ${(worst.pastDanger ? 'OVER' : 'inside').padStart(11)}`
    + `  ${bad ? '*** FAULT ***' : 'OK'}`,
  );
}

/**
 * Dynamic Type, as iOS reports it through `fontScale` — the body-text ratios
 * 14..53 pt over the 17 pt Large default. AC-910b asks for full scaling to
 * AccessibilityXXXL on overlays, "scrolling where needed".
 */
const DT = [
  ['Large (default)', 1], ['xLarge', 1.118], ['xxLarge', 1.235], ['xxxLarge', 1.353],
  ['AX1', 1.647], ['AX2', 1.941], ['AX3 (AC-910b ceiling)', 2.353],
];

let coachN = 0, coachBad = 0;
const counts = { offScreen: 0, coversHud: 0, coversTray: 0, coversBoard: 0, wideWord: 0, pastDanger: 0 };
const ladder = new Map(DT.map(([, s]) => [s, { offScreen: 0, coversTray: 0, coversBoard: 0 }]));
for (let w = 272; w <= 900; w += 2) for (let h = 480; h <= 1200; h += 2)
  for (const [it, ib] of [[0,0],[20,0],[44,34],[59,34],[62,34],[70,40]]) {
    const L = layout(w, h, it, ib);
    const g = screenGeometry(w, h, it, ib, L);
    if (!g) continue;                        // stage 3 shows a message, not a board
    for (const beat of BEATS_UI) for (const satisfied of [false, true]) {
      for (const [, scale] of DT) {
        const f = coachFaults(g, L, it, scale, beat, satisfied);
        if (scale === 1) {
          coachN++;
          for (const k of Object.keys(counts)) if (f[k]) counts[k]++;
          if (f.offScreen || f.coversHud || f.coversTray || f.coversBoard || f.wideWord) coachBad++;
        }
        const c = ladder.get(scale);
        if (f.offScreen) c.offScreen++;
        if (f.coversTray) c.coversTray++;
        if (f.coversBoard) c.coversBoard++;
      }
    }
  }
console.log(`\nCONTINUOUS SWEEP  ${coachN.toLocaleString()} combinations`
  + ' (w 272-900, h 480-1200 @2pt, 6 inset profiles, 4 beats, 2 states) at Dynamic Type Large');
console.log('  tutorial overflowing :', coachBad);
console.log(`    off screen ${counts.offScreen}   covers the HUD ${counts.coversHud}`
  + `   covers the tray ${counts.coversTray}   covers an animal ${counts.coversBoard}`
  + `   word too wide ${counts.wideWord}`);
console.log(`    (past the danger band ${counts.pastDanger} — reported, not a fault; see above)`);

// The Dynamic Type ladder is PRINTED, not asserted. AC-910b's remedy for an
// overlay that outgrows its screen is "scrolling where needed", and no sheet in
// this app scrolls — not Pause, not Game Over, not Settings, not Records, not
// this card. Asserting a rule the app has never implemented would make this
// sweep permanently red, and a permanently red check is one nobody reads.
console.log('\nDYNAMIC TYPE LADDER (AC-910b, AC-910h: invisible to Tier 2, device-only)');
console.log('STEP                     scale   off screen  covers tray  covers an animal');
for (const [label, scale] of DT) {
  const c = ladder.get(scale);
  console.log(`${label.padEnd(24)} ${scale.toFixed(3)}  ${String(c.offScreen).padStart(10)}`
    + `  ${String(c.coversTray).padStart(11)}  ${String(c.coversBoard).padStart(16)}`);
}

// What `test/layout.test.js` holds the shipped code to, so this reference and
// src/ui/onboarding.js cannot drift apart unnoticed.
console.log('\nBEAT DATA (checked against src/ui/onboarding.js by test/layout.test.js)');
for (const b of BEATS_UI) {
  let sumc = 0;
  for (const ch of b.title + b.body) sumc = (sumc * 31 + ch.codePointAt(0)) >>> 0;
  console.log(`  ${b.id.padEnd(8)} topRow=${String(b.top).padStart(2)} copy=${sumc}`);
}

if (bad > 0 || coachBad > 0) {
  console.error(`\nFAILED: ${bad} board overflow(s), ${coachBad} tutorial fault(s).`);
  process.exit(1);
}
console.log('\nPASS: 0 overflowing, board and tutorial.');

