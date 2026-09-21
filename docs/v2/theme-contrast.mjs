// Wildlife Shuffle v2 — executable form of AC-140x (docs/v2/acceptance-criteria.md).
// Asserts the two themes in ui.md §4: every species is separable from its board ground by
// fill OR edge, the size→lightness ramp is monotonic in both, and the natural background
// texture stays under its contrast ceiling.
// Run: node docs/v2/theme-contrast.mjs   — expected: PASS
const srgb = h => [1,3,5].map(i => parseInt(h.slice(i,i+2),16)/255);
const lin  = c => c <= 0.03928 ? c/12.92 : ((c+0.055)/1.055)**2.4;
const lum  = h => { const [r,g,b] = srgb(h).map(lin); return 0.2126*r + 0.7152*g + 0.0722*b; };
const cr   = (a,b) => { const [x,y] = [lum(a),lum(b)].sort((p,q)=>q-p); return (x+0.05)/(y+0.05); };
const Lstar= h => { const y = lum(h); return y <= 216/24389 ? y*24389/27 : Math.cbrt(y)*116-16; };

export const SHAPE_FLOOR = 3.0;    // WCAG 1.4.11 non-text contrast, for a solid UI shape
export const TEXTURE_CEIL = 1.25;  // the owner's constraint, made checkable
export const SPECIES = [['rat',1],['fox',2],['elk',3],['elephant',4],['buffalo',5]];

export const THEMES = {
  dark: { board:'#16212C', cell:'#1A2833', texture:'#1B2733',
    fill:{rat:'#FFD166',fox:'#F58A47',elk:'#5FA45C',elephant:'#5B6E88',buffalo:'#8C3B4A'},
    edge:{rat:'#D9A83C',fox:'#C96A2C',elk:'#427A40',elephant:'#3F4F66',buffalo:'#E8B44A'} },
  light:{ board:'#E6DFD2', cell:'#DDD5C6', texture:'#DCD4C5',
    fill:{rat:'#D8A63A',fox:'#D4712F',elk:'#3F7A3E',elephant:'#3E4F66',buffalo:'#7A2E3C'},
    edge:{rat:'#8A6416',fox:'#94430F',elk:'#284E27',elephant:'#26303F',buffalo:'#9C6D14'} },
};

let fails = 0;
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
console.log(fails ? `\nFAIL — ${fails} defect(s)` : '\nPASS — both themes separable, both ramps monotonic, both textures under ceiling');
process.exit(fails ? 1 : 0);
