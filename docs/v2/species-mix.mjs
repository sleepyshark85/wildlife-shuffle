// Wildlife Shuffle v2 — executable form of AC-308b (docs/v2/acceptance-criteria.md).
// Demonstrates that gameplay.md §5.2's count-first generator realises the §5.4 weight table,
// where the superseded capacity-constrained draw did not. 9-wide board, elephant 4, buffalo 5.
// NOTE (gameplay.md 5.5b): the three habitats are removed. This still sweeps all three
// weight tables because they are still in constants.js until the collapse lands; after it,
// the meadow column is the curve and the other two go with DIFFICULTIES. It measures the
// LONG-RUN mix only -- for the short-window property the owner reported, see
// docs/v2/spawn-clustering.mjs.
// Run: node docs/v2/species-mix.mjs
// Expected: every realised share within ~2pp of intent, mean drawn size within ~0.10.

const S={rat:1,fox:2,elk:3,elephant:4};
const W={meadow:{rat:35,fox:30,elk:25,elephant:10},
         savanna:{rat:25,fox:28,elk:27,elephant:20},
         tundra:{rat:15,fox:25,elk:30,elephant:30}};
const BANDS={meadow:[[2,4],[3,5]],savanna:[[2,4],[3,5],[4,6]],tundra:[[3,5],[4,6],[5,7]]};
const WIDTH=9, CAP=WIDTH-1;
let seed=4242; const rnd=()=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff;};
const ri=(a,b)=>a+Math.floor(rnd()*(b-a+1));
const ALL=Object.keys(S);
function draw(pool,w){let t=0;for(const s of pool)t+=w[s];let r=rnd()*t;for(const s of pool){r-=w[s];if(r<=0)return s;}return pool[pool.length-1];}
const meanSize=w=>{const tw=Object.values(w).reduce((a,b)=>a+b,0);return Object.entries(w).reduce((a,[s,v])=>a+S[s]*v,0)/tw;};
// F2: stochastic round of target/meanSize -> k, then k unbiased draws, hard cap at CAP.
function F2(w,band){
  const T=ri(band[0],band[1]); const raw=T/meanSize(w);
  let k=Math.floor(raw); if(rnd()<raw-k) k++; k=Math.max(1,k);
  let o=[],f=0;
  for(let i=0;i<k;i++){const p=ALL.filter(x=>S[x]<=CAP-f); if(!p.length)break; const s=draw(p,w);o.push(s);f+=S[s];}
  return o;
}
for(const d of ['meadow','savanna','tundra']){
  const w=W[d], tw=Object.values(w).reduce((a,b)=>a+b,0), im=meanSize(w);
  console.log(`\n=== ${d.toUpperCase()}  intended mean size ${im.toFixed(2)} ===`);
  console.log('band      rat     fox     elk     eleph   mean   cells/turn  target  err   maxcells');
  console.log(`intent   ${(w.rat/tw*100).toFixed(1).padStart(5)}%  ${(w.fox/tw*100).toFixed(1).padStart(5)}%  ${(w.elk/tw*100).toFixed(1).padStart(5)}%  ${(w.elephant/tw*100).toFixed(1).padStart(5)}%  ${im.toFixed(2)}`);
  for(const band of BANDS[d]){
    seed=4242; const c={rat:0,fox:0,elk:0,elephant:0}; let tot=0,cells=0,b=0,mx=0;
    for(let i=0;i<60000;i++){const o=F2(w,band);b++;let cc=0;for(const s of o){c[s]++;tot++;cells+=S[s];cc+=S[s];}if(cc>mx)mx=cc;}
    const bandMean=(band[0]+band[1])/2, actual=cells/b;
    console.log(`${(band[0]+'-'+band[1]).padEnd(8)} ${(c.rat/tot*100).toFixed(1).padStart(5)}%  ${(c.fox/tot*100).toFixed(1).padStart(5)}%  ${(c.elk/tot*100).toFixed(1).padStart(5)}%  ${(c.elephant/tot*100).toFixed(1).padStart(5)}%  ${(cells/tot).toFixed(2)}   ${actual.toFixed(2)}       ${bandMean.toFixed(1)}   ${(actual-bandMean>=0?'+':'')}${(actual-bandMean).toFixed(2)}   ${mx}`);
  }
}
console.log('\n--- fraction of a 9-wide row arriving per turn (start -> ceiling) ---');
for(const d of ['meadow','savanna','tundra']){
  const s=BANDS[d][0],c=BANDS[d][BANDS[d].length-1];
  console.log(`${d.padEnd(8)} ${((s[0]+s[1])/2/9*100).toFixed(0)}% -> ${((c[0]+c[1])/2/9*100).toFixed(0)}%   (10-wide design was meadow 30->60, savanna 40->70, tundra 50->80)`);
}
