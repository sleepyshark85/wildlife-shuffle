// Wildlife Shuffle v2 — doc lint. Verifies that every AC cited anywhere in docs/v2/
// is actually defined, that none is defined twice, and that ranges resolve.
// Run: node docs/v2/check-ac-refs.mjs        Exit 1 on any defect.
// Standing check for AC-1310.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(dir).filter(f => f.endsWith('.md'));
const defs = new Map();            // id -> "file:line"
const dupes = [];
const refs = [];                   // {id, file, line}

for (const f of files) {
  readFileSync(join(dir, f), 'utf8').split('\n').forEach((line, i) => {
    const at = `${f}:${i + 1}`;
    // A definition is an AC id in bold at the very start of a line.
    const d = line.match(/^\*\*(AC-\d+[a-z]?)\b/);
    if (d) { if (defs.has(d[1])) dupes.push(`${d[1]} (${defs.get(d[1])} and ${at})`); else defs.set(d[1], at); }
    // Every other mention is a reference.
    for (const m of line.matchAll(/\bAC-(\d+[a-z]?)\b/g)) {
      const id = 'AC-' + m[1];
      if (d && d[1] === id && m.index <= 2) continue;   // skip the definition itself
      refs.push({ id, at });
    }
    // Ranges: "AC-820..825", "AC-112–119", "AC-306/307"
    for (const m of line.matchAll(/\bAC-(\d+)\s*(?:\.\.|–|—|-|to )\s*(?:AC-)?(\d+[a-z]?)\b/g)) {
      refs.push({ id: 'AC-' + m[2], at, range: true });
    }
    for (const m of line.matchAll(/\bAC-(\d+)\/(\d+)\b/g)) refs.push({ id: 'AC-' + m[2], at, range: true });
  });
}

const dangling = refs.filter(r => !defs.has(r.id));
const seen = new Set();
const uniqDangling = dangling.filter(r => { const k = r.id + r.at; if (seen.has(k)) return false; seen.add(k); return true; });

console.log(`AC definitions : ${defs.size}`);
console.log(`AC references  : ${refs.length}`);
console.log(`duplicate defs : ${dupes.length}`);
dupes.forEach(d => console.log('  DUPLICATE  ' + d));
console.log(`dangling refs  : ${uniqDangling.length}`);
uniqDangling.forEach(r => console.log(`  DANGLING   ${r.id.padEnd(10)} cited at ${r.at}`));

// Numbering gaps, informational only — a gap is legal, a dangling reference is not.
const nums = [...defs.keys()].filter(k => /^AC-\d+$/.test(k)).map(k => +k.slice(3)).sort((a, b) => a - b);
const groups = {};
for (const n of nums) { const g = Math.floor(n / 100) * 100; (groups[g] ??= []).push(n); }
console.log('\ngroup sizes:', Object.entries(groups).map(([g, v]) => `${g}xx=${v.length}`).join('  '));

const bad = dupes.length + uniqDangling.length;
console.log(bad ? `\nFAIL — ${bad} defect(s)` : '\nPASS — every cited AC is defined, none defined twice');
process.exit(bad ? 1 : 0);
