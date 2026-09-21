// Wildlife Shuffle v2 — executable form of AC-140x and AC-15xx (docs/v2/acceptance-criteria.md).
// Asserts the two themes in ui.md §4 and §16, the accent's duties in §16.2, and — since §16.4 —
// every COSMETIC × GROUND combination a player can actually assemble.
// Run: node docs/v2/theme-contrast.mjs   — expected: PASS
//
// Three properties, and the third is the one this script was missing. A cosmetic is a second
// ground or a second ramp, and a second ground is a ground nobody measured against: the Tundra
// palette shipped as ONE table used over two grounds and was never checked against either.
const srgb = h => [1,3,5].map(i => parseInt(h.slice(i,i+2),16)/255);
const lin  = c => c <= 0.03928 ? c/12.92 : ((c+0.055)/1.055)**2.4;
const lum  = h => { const [r,g,b] = srgb(h).map(lin); return 0.2126*r + 0.7152*g + 0.0722*b; };
const cr   = (a,b) => { const [x,y] = [lum(a),lum(b)].sort((p,q)=>q-p); return (x+0.05)/(y+0.05); };
const Lstar= h => { const y = lum(h); return y <= 216/24389 ? y*24389/27 : Math.cbrt(y)*116-16; };
/** sRGB source-over, the way the platform composites an rgba() fill on an opaque ground. */
const over = (fg,bg,a) => '#' + [1,3,5].map(i =>
  Math.round(a*parseInt(fg.slice(i,i+2),16) + (1-a)*parseInt(bg.slice(i,i+2),16))
    .toString(16).padStart(2,'0')).join('').toUpperCase();

export const SHAPE_FLOOR = 3.0;    // WCAG 1.4.11 non-text contrast, for a solid UI shape
export const TEXT_FLOOR  = 4.5;    // WCAG 1.4.3 AA, for a label at body size
export const TEXTURE_CEIL = 1.25;  // the owner's constraint, made checkable
export const SPECIES = [['rat',1],['fox',2],['elk',3],['elephant',4],['buffalo',5]];

export const THEMES = {
  dark: { board:'#16212C', cell:'#1A2833', texture:'#1B2733',
    bg:'#0D141B', panel:'#131E28', panelSunken:'#0F1A23',
    accent:'#FFC24B', inkOnAccent:'#2A1C00', washAlpha:0.12, gold:'#E8B44A',
    fill:{rat:'#FFD166',fox:'#F58A47',elk:'#5FA45C',elephant:'#5B6E88',buffalo:'#8C3B4A'},
    edge:{rat:'#D9A83C',fox:'#C96A2C',elk:'#427A40',elephant:'#3F4F66',buffalo:'#E8B44A'} },
  light:{ board:'#E6DFD2', cell:'#DDD5C6', texture:'#DCD4C5',
    bg:'#F2EDE3', panel:'#FAF6EC', panelSunken:'#E4DDCE',
    accent:'#975C0F', inkOnAccent:'#FFFFFF', washAlpha:0.10, gold:'#9C6D14',
    fill:{rat:'#D8A63A',fox:'#D4712F',elk:'#3F7A3E',elephant:'#3E4F66',buffalo:'#7A2E3C'},
    edge:{rat:'#8A6416',fox:'#94430F',elk:'#284E27',elephant:'#26303F',buffalo:'#9C6D14'} },
};

/**
 * ui.md §16.4. A cosmetic that supplies a GROUND names the ramp it pairs with; a cosmetic that
 * supplies a COLOUR supplies one value per ramp. Those two rules are what make the product below
 * finite and checkable instead of a pile of combinations nobody enumerated.
 */
export const GROUNDS = {                       // every board ground a player can be looking at
  dark:         { board:'#16212C', ramp:'dark'  },
  light:        { board:'#E6DFD2', ramp:'light' },
  nightSavanna: { board:'#151026', ramp:'dark'  },   // "the board after dark" — a dark ground
};

export const PALETTES = {
  tundra: {
    dark: { rat:{fill:'#E4EEFA',edge:'#B4C8DE'}, fox:{fill:'#A8C4E0',edge:'#7B9DBE'},
            elk:{fill:'#6C90B2',edge:'#4C6C8C'}, elephant:{fill:'#5C77A7',edge:'#455D85'} },
    light:{ rat:{fill:'#8CB0DE',edge:'#2963AB'}, fox:{fill:'#6190BE',edge:'#2D5781'},
            elk:{fill:'#4D7192',edge:'#2E4963'}, elephant:{fill:'#3A4F6D',edge:'#263851'} },
  },
};

let fails = 0;
const bad = (msg) => { fails++; console.log('*** FAIL: ' + msg + ' ***'); };

// ---- §4 / §16.2 · the two themes on their own grounds ---------------------------------------
for (const [name, T] of Object.entries(THEMES)) {
  console.log(`\n=== ${name.toUpperCase()}  board ${T.board} (L* ${Lstar(T.board).toFixed(0)}) ===`);
  console.log('species    size  fill      L*   fill:board  edge:board   best');
  let prev = Infinity, mono = true;
  for (const [s, size] of SPECIES) {
    const f = T.fill[s], e = T.edge[s], L = Lstar(f);
    const cf = cr(f, T.board), ce = cr(e, T.board), best = Math.max(cf, ce);
    if (s !== 'buffalo') { if (L > prev) mono = false; prev = L; }   // buffalo is off the ramp
    const ok = best >= SHAPE_FLOOR; if (!ok) fails++;
    console.log(`${s.padEnd(10)}${String(size).padStart(3)}   ${f}  ${L.toFixed(0).padStart(3)}   `
      + `${cf.toFixed(2).padStart(6)}      ${ce.toFixed(2).padStart(6)}   ${best.toFixed(2).padStart(5)} ${ok?'':'*** FAIL ***'}`);
  }
  if (!mono) { console.log('*** FAIL: lightness is not monotonic with size ***'); fails++; }
  else console.log('lightness descends monotonically with size: YES');
  const t = cr(T.board, T.texture);
  const tok = t <= TEXTURE_CEIL; if (!tok) fails++;
  console.log(`background texture ${T.texture} vs board = ${t.toFixed(3)}:1  ${tok?`OK (<= ${TEXTURE_CEIL})`:'*** TOO STRONG ***'}`);
}

// ---- §16.2 · the accent, and the label it has to carry ---------------------------------------
// AC-1515. The binding pair is the primary button: an accent that cannot carry a label is not a
// button colour. `inkOnAccent` is the ground's opposite in both themes (AC-1512's rule, applied
// to the accent rather than to High Contrast) — dark ink on slate's light gold, white on bone's
// dark one — so there is ONE rule here and not a per-theme exception.
console.log('\n--- ACCENT · every pair it is drawn in ---');
console.log('theme  pair                              ratio  floor');
for (const [name, T] of Object.entries(THEMES)) {
  const wash = over(T.accent, T.bg, T.washAlpha);
  const pairs = [
    [`label ${T.inkOnAccent} on accent ${T.accent}`, cr(T.inkOnAccent, T.accent), TEXT_FLOOR],
    [`accent on bg ${T.bg}`,                          cr(T.accent, T.bg),          TEXT_FLOOR],
    [`accent on panel ${T.panel}`,                    cr(T.accent, T.panel),       TEXT_FLOOR],
    [`accent on sunken ${T.panelSunken}`,             cr(T.accent, T.panelSunken), SHAPE_FLOOR],
    [`accent on board ${T.board}`,                    cr(T.accent, T.board),       SHAPE_FLOOR],
    [`accent on cell ${T.cell}`,                      cr(T.accent, T.cell),        SHAPE_FLOOR],
    [`accent on its own wash ${wash}`,                cr(T.accent, wash),          SHAPE_FLOOR],
  ];
  for (const [what, ratio, floor] of pairs) {
    const ok = ratio >= floor; if (!ok) fails++;
    console.log(`${name.padEnd(7)}${what.padEnd(34)}${ratio.toFixed(2).padStart(5)}  ${floor.toFixed(1)}${ok?'':'  *** FAIL ***'}`);
  }
}

// ---- §16.4 · every cosmetic on every ground it can appear over --------------------------------
// AC-1517/AC-1518. The sweep is the product of the grounds a player can be looking at, the ramps
// that can be in force on each, and the two states of the gild. A row here is a thing somebody
// can actually be looking at, not a theoretical pairing.
console.log('\n--- COSMETICS x GROUND · AC-1503 on every combination ---');
console.log('combination                          species    fill      edge      best');
const RAMP = ['rat','fox','elk','elephant','buffalo'];
for (const [gname, G] of Object.entries(GROUNDS)) {
  const base = THEMES[G.ramp];
  for (const pname of ['-', ...Object.keys(PALETTES)]) {
    const pal = pname === '-' ? null : PALETTES[pname][G.ramp];
    if (pname !== '-' && !pal) { bad(`palette ${pname} has no variant for the ${G.ramp} ramp`); continue; }
    for (const gild of [false, true]) {
      let prev = Infinity, mono = true;
      for (const s of RAMP) {
        const style = pal && pal[s] ? pal[s] : { fill: base.fill[s], edge: base.edge[s] };
        const f = style.fill, e = gild ? base.gold : style.edge;
        if (s !== 'buffalo') { if (Lstar(f) > prev) mono = false; prev = Lstar(f); }
        const cf = cr(f, G.board), ce = cr(e, G.board), best = Math.max(cf, ce);
        const ok = best >= SHAPE_FLOOR; if (!ok) fails++;
        const tag = `${gname}/${pname}${gild ? '+gild' : ''}`;
        console.log(`${tag.padEnd(36)}${s.padEnd(10)}${f} ${cf.toFixed(2).padStart(5)}  ${e} ${ce.toFixed(2).padStart(5)}  `
          + `${best.toFixed(2).padStart(5)} ${ok?'':'*** FAIL ***'}`);
      }
      if (!mono) bad(`${gname}/${pname}: lightness is not monotonic with size`);
    }
  }
}

console.log(fails ? `\nFAIL — ${fails} defect(s)` : '\nPASS — both themes separable, both ramps monotonic, both textures under ceiling,\n       both accents carrying their labels, and every cosmetic clearing 3:1 on every ground');
process.exit(fails ? 1 : 0);
