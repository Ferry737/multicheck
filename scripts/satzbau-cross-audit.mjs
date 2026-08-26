// Phase 11/12: cross-family final audit + diversity metrics.
// Generates N fresh items from EVERY satzbau family and measures duplication that
// per-family audits cannot see: the same skeleton reused across different struct
// IDs, one lexical pool dominating everywhere, repeated temporal adverbs.
import { GENERATORS } from "../lib/questions.ts";

const PER = Number(process.argv[2] || 10);
const gens = GENERATORS.satzbau;
function h(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

const all = [];
for (let si = 0; si < gens.length; si++) {
  const seen = new Set();
  let i = 0;
  while (seen.size < PER && i < 5000) {
    const q = gens[si](h((++i) * 2654435761 % 2147483647), 50, si);
    if (!q) continue;
    const k = q.prompt + "|" + q.answer;
    if (seen.has(k)) continue;
    seen.add(k);
    all.push({ si, prompt: q.prompt, answer: String(q.answer), sig: q.structSig?.opSequence || "?" });
  }
}

const exact = new Set(all.map((x) => x.prompt + "|" + x.answer));
const exactDup = all.length - exact.size;

// Skeleton = prompt with all quoted content and lexical items masked. Catches the
// "same sentence frame under a different struct id" pattern.
const skel = (p) => p.replace(/„[^“]*“/g, "«X»").replace(/\b[A-ZÄÖÜ][a-zäöüß]+\b/g, "N").replace(/\s+/g, " ").trim();
const skelMap = new Map();
for (const x of all) {
  const k = skel(x.prompt);
  if (!skelMap.has(k)) skelMap.set(k, new Set());
  skelMap.get(k).add(x.si);
}
const crossFamily = [...skelMap.entries()].filter(([, set]) => set.size > 1);

// Lexical concentration: how often does the single most common noun appear?
const nounCount = new Map();
for (const x of all) for (const m of x.prompt.matchAll(/\b(Bericht|Liste|Formular|Buch|Blatt|Ware|Paket|Material|Rechnung|Schere|Bleistift|Kugelschreiber|Regal|Tisch|Stuhl)\b/g)) {
  nounCount.set(m[1], (nounCount.get(m[1]) || 0) + 1);
}
const topNouns = [...nounCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
const totalNounHits = [...nounCount.values()].reduce((a, b) => a + b, 0) || 1;

const timeCount = new Map();
for (const x of all) for (const m of x.prompt.matchAll(/\b(heute|morgen|gestern|nächste Woche|heute Morgen|um acht Uhr)\b/g)) {
  timeCount.set(m[1], (timeCount.get(m[1]) || 0) + 1);
}

console.log(`CROSS-FAMILY AUDIT — ${all.length} fresh items (${PER} x ${gens.length} families)`);
console.log(`exact duplicates:            ${exactDup} (${((exactDup / all.length) * 100).toFixed(2)}%)`);
console.log(`distinct structSig tags:     ${new Set(all.map((x) => x.sig)).size} / ${gens.length}`);
console.log(`shared skeletons across ids: ${crossFamily.length}`);
for (const [k, set] of crossFamily.slice(0, 8)) console.log(`   structs ${[...set].join(",")}: ${k.slice(0, 78)}`);
console.log(`\ntop nouns (concentration):`);
for (const [n, c] of topNouns) console.log(`   ${n.padEnd(16)} ${c} (${((c / totalNounHits) * 100).toFixed(1)}%)`);
console.log(`temporal adverb spread:      ${timeCount.size} distinct`);
const maxShare = topNouns.length ? topNouns[0][1] / totalNounHits : 0;
console.log(`\nverdict: exactDup=${exactDup === 0 ? "OK" : "FAIL"} topNounShare=${(maxShare * 100).toFixed(1)}%${maxShare > 0.35 ? " <-- CONCENTRATED" : " OK"}`);
