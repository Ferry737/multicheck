// Phase 17: long-session repetition test. Serves >=100 questions through the SAME
// path a student's adaptive session uses, then classifies what they'd actually feel:
// exact repeats, template repeats (same struct), semantic near-repeats (same struct
// AND same answer), and genuinely novel items.
import { generateBatch, GENERATORS } from "../lib/questions.ts";

const TOTAL = Number(process.argv[2] || 120);
const SUBS = Object.keys(GENERATORS);
// Realistic adaptive composition: Deutsch/maths heavy, memory/concentration lighter.
const WEIGHTS = {
  satzbau: 4, textverstaendnis: 3, kopfrechnen: 4, textaufgaben: 2, prozesslogik: 3,
  wortgruppen: 2, alltagswissen: 2, sortierverfahren: 2,
  schilder_erinnern: 1, bilder_zaehlen: 1, symbole_entdecken: 1,
};
const bag = [];
for (const [s, w] of Object.entries(WEIGHTS)) for (let i = 0; i < w; i++) bag.push(s);

let seed = 555000;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

const served = [];
let round = 0;
while (served.length < TOTAL) {
  const sub = bag[Math.floor(rnd() * bag.length)];
  const d = [25, 40, 55, 70, 85][Math.floor(rnd() * 5)];
  const items = generateBatch(sub, d, 4, Math.floor(rnd() * 1e9));
  for (const q of items) {
    if (served.length >= TOTAL) break;
    served.push({ sub, d, prompt: q.prompt, answer: String(q.answer),
      sig: q.structSig?.opSequence || "?", round });
  }
  round++;
}

const exactSeen = new Map();
const sigSeen = new Map();
const semSeen = new Map();
let exact = 0, template = 0, semantic = 0, novel = 0;
for (const s of served) {
  const ek = s.sub + "|" + s.prompt + "|" + s.answer;
  const sk = s.sub + "|" + s.sig;
  const mk = s.sub + "|" + s.sig + "|" + s.answer;
  if (exactSeen.has(ek)) { exact++; }
  else if (semSeen.has(mk)) { semantic++; }
  else if (sigSeen.has(sk)) { template++; }
  else { novel++; }
  exactSeen.set(ek, 1); sigSeen.set(sk, 1); semSeen.set(mk, 1);
}

const pct = (n) => ((n / served.length) * 100).toFixed(1) + "%";
console.log(`LONG-SESSION REPETITION TEST — ${served.length} served questions across ${new Set(served.map((s) => s.sub)).size} subskills`);
console.log(`exact repeats:          ${String(exact).padStart(4)}  ${pct(exact)}`);
console.log(`semantic near-repeats:  ${String(semantic).padStart(4)}  ${pct(semantic)}   (same struct AND same answer)`);
console.log(`template repeats:       ${String(template).padStart(4)}  ${pct(template)}   (same struct, different content)`);
console.log(`genuinely novel:        ${String(novel).padStart(4)}  ${pct(novel)}`);
console.log(`distinct structs used:  ${new Set(served.map((s) => s.sub + "|" + s.sig)).size}`);
const fails = [];
if (exact > 0) fails.push(`${exact} exact repeats in a ${served.length}-question session`);
if (semantic / served.length > 0.15) fails.push(`semantic near-repeat rate ${pct(semantic)} exceeds 15%`);
console.log("");
if (fails.length) { for (const f of fails) console.log("FAIL:", f); process.exit(1); }
console.log("PASS — no exact repeats and near-repeat rate within tolerance for a long session.");
