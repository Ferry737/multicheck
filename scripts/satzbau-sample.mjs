// Deterministic N-sample dump for a specific satzbau struct (human read, Phase 7).
// usage: npx tsx scripts/satzbau-sample.mjs <si> [n]
import { GENERATORS } from "../lib/questions.ts";
function h(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const si = Number(process.argv[2]);
const n = Number(process.argv[3] || 30);
const gen = GENERATORS.satzbau[si];
const seen = new Set();
let i = 0, shown = 0;
while (shown < n && i < 20000) {
  const q = gen(h((++i) * 2654435761 % 2147483647), 50, si);
  if (!q) continue;
  const k = q.prompt + "|" + q.answer;
  if (seen.has(k)) continue;
  seen.add(k);
  shown++;
  console.log(`${String(shown).padStart(2)}. Q: ${q.prompt}`);
  console.log(`    A: ${q.answer}`);
}
console.log(`\nstruct ${si} — ${shown} distinct samples shown`);
