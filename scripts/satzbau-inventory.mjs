// Satzbau structure-family inventory: per-struct capacity + tag + duplicate risk.
// Capacity = distinct (prompt|sorted-options|answer) triples over N seeds at fixed si.
import { GENERATORS } from "../lib/questions.ts";

const FLOOR = 13;
const SEEDS = Number(process.argv[3] || 4000);
const sub = process.argv[2] || "satzbau";

function h(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const gens = GENERATORS[sub];
const rows = [];
for (let si = 0; si < gens.length; si++) {
  const seen = new Set();
  const prompts = new Set();
  let tag = "?";
  for (let i = 0; i < SEEDS; i++) {
    const q = gens[si](h((i + 1) * 2654435761 % 2147483647), 50, si);
    if (!q) continue;
    tag = q.structSig?.opSequence || q.concept || "?";
    prompts.add(q.prompt);
    seen.add(q.prompt + "|" + (q.options ? [...q.options].sort().join("¦") : "") + "|" + q.answer);
  }
  rows.push({ si, tag, cap: seen.size, promptCap: prompts.size });
}

rows.sort((a, b) => a.cap - b.cap);
const below = rows.filter((r) => r.cap < FLOOR);
console.log(`${sub}: ${gens.length} structs, floor=${FLOOR}, seeds=${SEEDS}`);
console.log(`BELOW FLOOR: ${below.length}/${gens.length}`);
const caps = rows.map((r) => r.cap).sort((a, b) => a - b);
const med = caps[Math.floor(caps.length / 2)];
console.log(`min=${caps[0]} median=${med} max=${caps[caps.length - 1]} total=${caps.reduce((a, b) => a + b, 0)}`);
console.log("\nsi  cap  prompts  tag");
for (const r of rows) {
  const mark = r.cap < FLOOR ? "  <-- BELOW" : "";
  console.log(String(r.si).padStart(2) + "  " + String(r.cap).padStart(4) + "  " + String(r.promptCap).padStart(7) + "  " + r.tag + mark);
}
if (below.length) process.exit(1);
