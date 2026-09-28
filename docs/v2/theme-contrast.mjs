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

/** Hue angle, 0-360, for AC-1526 D2. Achromatic returns null and is never in the hazard family. */
const hue = h => { const [r,g,b] = srgb(h); const mx=Math.max(r,g,b), mn=Math.min(r,g,b), d=mx-mn;
  if (!d) return null;
  const H = mx===r ? ((g-b)/d)%6 : mx===g ? (b-r)/d+2 : (r-g)/d+4;
  return (H*60+360)%360; };
const hueGap = (a,b) => { const x=hue(a), y=hue(b); if (x===null||y===null) return 180;
  const d=Math.abs(x-y); return Math.min(d, 360-d); };

export const SHAPE_FLOOR = 3.0;    // WCAG 1.4.11 non-text contrast, for a solid UI shape
export const TEXT_FLOOR  = 4.5;    // WCAG 1.4.3 AA, for a label at body size
export const TEXTURE_CEIL = 1.25;  // the owner's constraint, made checkable
export const SPECIES = [['rat',1],['fox',2],['elk',3],['elephant',4],['buffalo',5]];

/**
 * ui.md §16.5 / AC-1526. The eleven duties of the danger rows.
 *
 * THE FLOORS ARE THE SHIPPED THEMES' OWN MEASURED VALUES, ROUNDED DOWN, not invented ideals: the
 * gate is "no worse than what the owner has already seen and accepted". D4 and D5 are the two
 * exceptions and they take AC-1503's external 3:1 — and they are the two that catch the defects.
 *
 * D1 and D3 look alarmingly low and are correct. The shipped bands sit at 1.074:1 and 1.023:1
 * against their ordinary cells, because the band is identified by HUE (D2), by its cell line (D3)
 * and by the PULSE (D6) — never by contrast. D1 catches a band that is literally the cell's
 * colour; it must never be raised into a demand for a contrasting one, which would produce a band
 * that shouts at rest (ui.md §7 explicitly does not want that).
 */
export const DUTY = Object.freeze({
  bandVsCell: 1.02, bandHue: 60, bandLine: 1.25,
  bodyRest: SHAPE_FLOOR, bodyPulsed: SHAPE_FLOOR, pulseSwing: 1.09,
  killVsBand: 1.05, killVsCell: 1.15, killRule: 4.5, killStripe: 1.10, bandOutline: 1.50,
});

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
/**
 * ui.md §16.5 / AC-1523. A cosmetic that supplies a ground supplies ALL THREE of them: the
 * ordinary CELL, the DANGER BAND and the KILL ROW. The band is a ground animals stand on, at the
 * one moment in the run when the player most needs to read the board, and until §16.5 nothing had
 * ever measured against it — AC-1518's rule was written against the grounds somebody had thought
 * to enumerate, and `BOARD_THEMES.nightSavanna` ships four tokens for that reason.
 *
 * A ground missing `band` or `kill` is a DECLARATION ERROR here rather than a silent fallback to
 * the base theme, which is exactly the failure the owner reported.
 */
export const GROUNDS = {                       // every board ground a player can be looking at
  dark:         { board:'#16212C', cell:'#1A2833', band:'#1C1218', kill:'#080C11', ramp:'dark'  },
  light:        { board:'#E6DFD2', cell:'#DDD5C6', band:'#F5E3DF', kill:'#F2EDE3', ramp:'light' },
  // "the board after dark" — a dark ground, so it names the dark ramp and takes every hazard INK
  // from it (AC-1524). It needs its OWN band because its cell is already darker than the dark
  // theme's (L* 9.1 vs 15.4): the dark band at L* 6.7 would sit ABOVE it and the band's lightness
  // direction would invert on this ground alone.
  nightSavanna: { board:'#151026', cell:'#1B1533', band:'#1A0A16', kill:'#08040F', ramp:'dark'  },
};

/**
 * AC-1524 — a board theme changes what the hazard is drawn ON, never what it is drawn IN.
 *
 * These come from the RAMP the ground names and are never supplied by a cosmetic. The hazard
 * language belongs to the game, not to the unlock: red-family, flat, pulsing, at fixed opacities.
 * A cosmetic that could restyle the alarm is a cosmetic that could make the alarm quieter.
 */
export const HAZARD = {
  dark:  { rule:'#E05260', line:'#6B2F3A', lineA:0.55, stripe:'#E05260', stripeA:0.13,
           wash:'#E05260', outline:'#E05260', outlineA:0.40, pulseLow:0.05, pulseHigh:0.13 },
  light: { rule:'#A32B36', line:'#A32B36', lineA:0.45, stripe:'#A32B36', stripeA:0.14,
           wash:'#A32B36', outline:'#A32B36', outlineA:0.45, pulseLow:0.05, pulseHigh:0.13 },
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

// ---- §16.5 · the danger rows, on every ground ------------------------------------------------
// AC-1526 to AC-1531. The band is a THIRD GROUND and the kill row a fourth, and this is the part
// that was missing: a board theme repainted rows 0-10 and left rows 11-14 in the base theme's
// colours, and nobody had measured a body against a band at all, themed or not.
//
// D5 exists separately from D4 for AC-1527's reason: THE PULSE MOVES THE BAND TOWARD WHATEVER
// CARRIES THE FLOOR. On the dark ramp the floor is carried by light FILLS and the pulse lightens
// the ground; on the light ramp it is carried by dark EDGES and the pulse darkens it. In both
// themes the alarm erodes exactly the token AC-1503 relies on, so "clears at rest" does not
// imply "clears under the alarm" and never did.
console.log('\n--- DANGER ROWS · AC-1526\'s eleven duties, per ground ---');
console.log('duty                         floor    dark      light     nightSavanna');
const dutyRows = [];
const bandOf = {}, pulsedOf = {};
for (const [gname, G] of Object.entries(GROUNDS)) {
  if (!G.band || !G.kill) { bad(`ground ${gname} supplies no danger band / kill row (AC-1523)`); continue; }
  const H = HAZARD[G.ramp];
  bandOf[gname] = G.band;
  pulsedOf[gname] = over(H.wash, G.band, H.pulseHigh);
  const low = over(H.wash, G.band, H.pulseLow);
  dutyRows.push([gname, {
    'D1 band : cell':            [cr(G.band, G.cell),                        DUTY.bandVsCell, 'ge'],
    'D2 hue band -> hazard':     [hueGap(G.band, H.rule),                    DUTY.bandHue,    'le'],
    'D2b nearer than the cell':  [hueGap(G.cell, H.rule) - hueGap(G.band, H.rule), 0.001,     'ge'],
    'D3 band line : band':       [cr(over(H.line, G.band, H.lineA), G.band),  DUTY.bandLine,  'ge'],
    'D6 pulse swing':            [cr(pulsedOf[gname], low),                   DUTY.pulseSwing,'ge'],
    'D7 kill row : band':        [cr(G.kill, G.band),                         DUTY.killVsBand,'ge'],
    'D8 kill row : cell':        [cr(G.kill, G.cell),                         DUTY.killVsCell,'ge'],
    'D9 kill rule : kill row':   [cr(H.rule, G.kill),                         DUTY.killRule,  'ge'],
    'D10 stripes : kill row':    [cr(over(H.stripe, G.kill, H.stripeA), G.kill), DUTY.killStripe,'ge'],
    'D11 band outline : band':   [cr(over(H.outline, G.band, H.outlineA), G.band), DUTY.bandOutline,'ge'],
  }]);
}
if (dutyRows.length) {
  for (const key of Object.keys(dutyRows[0][1])) {
    let line = key.padEnd(29);
    const [, first] = dutyRows[0];
    line += String(first[key][1]).padEnd(9);
    for (const [, duties] of dutyRows) {
      const [v, floor, dir] = duties[key];
      const ok = dir === 'ge' ? v >= floor : v <= floor;
      if (!ok) fails++;
      line += (v.toFixed(3) + (ok ? '  ' : ' !')).padEnd(10);
    }
    line += dutyRows.some(([, d]) => { const [v,f,dir]=d[key]; return !(dir==='ge'?v>=f:v<=f); }) ? '  *** FAIL ***' : '';
    console.log(line);
  }
}

// D4 and D5 · every body, on every band, with every cosmetic, at rest and under the pulse.
// AC-1531: 3 grounds x 2 palette states x 2 gild states x 5 species x 2 pulse states = 120 rows.
console.log('\n--- DANGER BAND · AC-1503 on every body, every cosmetic, rest and pulsed (D4/D5) ---');
console.log('combination                          species    band    rest   pulsed  floor');
let bandRows = 0;
for (const [gname, G] of Object.entries(GROUNDS)) {
  if (!G.band) continue;
  const base = THEMES[G.ramp], H = HAZARD[G.ramp];
  for (const pname of ['-', ...Object.keys(PALETTES)]) {
    const pal = pname === '-' ? null : PALETTES[pname][G.ramp];
    if (pname !== '-' && !pal) { bad(`palette ${pname} has no variant for the ${G.ramp} ramp`); continue; }
    for (const gild of [false, true]) {
      for (const [s] of SPECIES) {
        // A palette never touches the buffalo (AC-1522), and the gild is the RAMP's gold.
        const style = pal && pal[s] ? pal[s] : { fill: base.fill[s], edge: base.edge[s] };
        const f = style.fill, e = gild ? base.gold : style.edge;
        const rest   = Math.max(cr(f, G.band),          cr(e, G.band));
        const pulsed = Math.max(cr(f, pulsedOf[gname]), cr(e, pulsedOf[gname]));
        const ok = rest >= DUTY.bodyRest && pulsed >= DUTY.bodyPulsed;
        if (!ok) fails++;
        bandRows += 2;
        const tag = `${gname}/${pname}${gild ? '+gild' : ''}`;
        console.log(`${tag.padEnd(36)}${s.padEnd(10)}${G.band} ${rest.toFixed(2).padStart(6)} `
          + `${pulsed.toFixed(2).padStart(7)}  ${DUTY.bodyRest.toFixed(1)} ${ok?'':'*** FAIL ***'}`);
      }
    }
  }
}
console.log(`\n${bandRows} band rows swept (AC-1531 expects 120).`);
if (bandRows !== 120) bad(`AC-1531: swept ${bandRows} band rows, expected 120`);

// ---- §16.6 · the arrival silhouette, on every ground it crosses -------------------------------
// AC-1534 to AC-1538, and §16.4 Rule 0 (d): this section exists because the rule had been extended
// TWICE by adding whatever somebody noticed. The silhouette is the third. It is checked in
// CIEDE2000 and not in `cr`, because its defect is the OPPOSITE of low contrast — a bone shadow on
// a midnight board has excellent contrast and is 2.2x more prominent than any animal on the board.
// A single metric across the inventory would have missed it again, so BOARD_INKS names the metric.
const lab = h => { const [r,g,b]=srgb(h).map(lin);
  const X=(0.4124*r+0.3576*g+0.1805*b)/0.95047, Y=0.2126*r+0.7152*g+0.0722*b, Z=(0.0193*r+0.1192*g+0.9505*b)/1.08883;
  const f=t=>t>216/24389?Math.cbrt(t):(24389/27*t+16)/116;
  const [fx,fy,fz]=[f(X),f(Y),f(Z)];
  return [116*fy-16, 500*(fx-fy), 200*(fy-fz)]; };
/** CIEDE2000, the metric `theme.js`'s `separation` uses. Same numbers, same job. */
function de2000(A,B){
  const [L1,a1,b1]=lab(A), [L2,a2,b2]=lab(B);
  const C1=Math.hypot(a1,b1), C2=Math.hypot(a2,b2), Cb=(C1+C2)/2;
  const G=0.5*(1-Math.sqrt(Cb**7/(Cb**7+25**7)));
  const A1=(1+G)*a1, A2=(1+G)*a2;
  const Cp1=Math.hypot(A1,b1), Cp2=Math.hypot(A2,b2);
  const h=(x,y)=>{ if(!x&&!y) return 0; const d=Math.atan2(y,x)*180/Math.PI; return d<0?d+360:d; };
  const h1=h(A1,b1), h2=h(A2,b2);
  const dL=L2-L1, dC=Cp2-Cp1;
  let dh=0; if(Cp1*Cp2){ dh=h2-h1; if(dh>180) dh-=360; else if(dh<-180) dh+=360; }
  const dH=2*Math.sqrt(Cp1*Cp2)*Math.sin(dh*Math.PI/360);
  const Lb=(L1+L2)/2, Cpb=(Cp1+Cp2)/2;
  let hb; if(!(Cp1*Cp2)) hb=h1+h2;
  else { hb=(h1+h2)/2; if(Math.abs(h1-h2)>180) hb += (h1+h2<360?180:-180); }
  const T=1-0.17*Math.cos((hb-30)*Math.PI/180)+0.24*Math.cos(2*hb*Math.PI/180)
          +0.32*Math.cos((3*hb+6)*Math.PI/180)-0.20*Math.cos((4*hb-63)*Math.PI/180);
  const Sl=1+0.015*(Lb-50)**2/Math.sqrt(20+(Lb-50)**2), Sc=1+0.045*Cpb, Sh=1+0.015*Cpb*T;
  const Rt=-2*Math.sqrt(Cpb**7/(Cpb**7+25**7))*Math.sin(60*Math.exp(-(((hb-275)/25)**2))*Math.PI/180);
  return Math.sqrt((dL/Sl)**2+(dC/Sc)**2+(dH/Sh)**2+Rt*(dC/Sc)*(dH/Sh));
}

/** ui.md §16.6 / AC-1536 — one value per RAMP (Rule 0 (b)), selected by the ramp in force. */
export const SILHOUETTE = {
  dark:  { ordinary:'#495764', buffalo:'#3A2E38' },
  light: { ordinary:'#BFB5A2', buffalo:'#E0CFC9' },
};
/** `theme.js:344-352` — the light buffalo's own body separation, rounded down. */
export const SILHOUETTE_FLOOR = 7.0;

console.log('\n--- ARRIVAL SILHOUETTE · CIEDE2000 on every ground it crosses (AC-1535) ---');
console.log('ground          ramp   shape      fill      dE     floor  faintest landed body  ceiling');
let silRows = 0;
for (const [gname, G] of Object.entries(GROUNDS)) {
  const base = THEMES[G.ramp];
  // Rule 0 (c): THE RAMP IN FORCE selects the silhouette — not the app's theme preference.
  const S = SILHOUETTE[G.ramp];
  if (!S) { bad(`no silhouette for the ${G.ramp} ramp (AC-1536)`); continue; }
  const faintest = Object.entries(base.fill)
    .map(([s,f]) => [s, de2000(f, G.cell)]).sort((a,b) => a[1]-b[1])[0];
  for (const [shape, col] of [['ordinary', S.ordinary], ['buffalo', S.buffalo]]) {
    const d = de2000(col, G.cell);
    const okFloor = d >= SILHOUETTE_FLOOR, okCeil = d < faintest[1];
    if (!okFloor || !okCeil) fails++;
    silRows++;
    console.log(`${gname.padEnd(16)}${G.ramp.padEnd(7)}${shape.padEnd(11)}${col} ${d.toFixed(2).padStart(6)}  `
      + `${SILHOUETTE_FLOOR.toFixed(1)}    ${faintest[0].padEnd(9)}${faintest[1].toFixed(2).padStart(6)}  `
      + `${okFloor && okCeil ? 'ok' : '*** FAIL ***'}`);
  }
}
console.log(`\n${silRows} silhouette rows swept (AC-1538 expects 6).`);
if (silRows !== 6) bad(`AC-1538: swept ${silRows} silhouette rows, expected 6`);

console.log(fails ? `\nFAIL — ${fails} defect(s)` : '\nPASS — both themes separable, both ramps monotonic, both textures under ceiling,\n       both accents carrying their labels, every cosmetic clearing 3:1 on every ground,\n       every danger row carrying its eleven duties on every ground, pulsed and at rest,\n       and every silhouette between its floor and the faintest body on the ground it crosses');
process.exit(fails ? 1 : 0);
