// Wildlife Shuffle v2 — executable form of AC-119 (see docs/v2/acceptance-criteria.md).
// Verifies the ui.md §3.2 cell-size ladder over a continuous viewport space rather than a
// fixed device list, so hardware that has not shipped is covered by construction.
// Run: node docs/v2/layout-sweep.mjs   — expected: 'overflowing : 0'

// Candidate v2 formula: graceful degradation ladder, tested across the continuous space.
const FULL   ={hud:52,act:48,tray:45,gaps:32};           // 177
const COMPACT={hud:44,act:44,tray:36,gaps:20};           // 144
const RAIL   ={hud:0, act:0, tray:45,gaps:32};           // 77  (wide: chrome moves to a side rail)
const sum=c=>c.hud+c.act+c.tray+c.gaps;
const W_RAIL=600, COLS=10, ROWS=15, GUTTER=32;

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
