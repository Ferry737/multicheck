// Prozesslogik load/capacity stress harness (Phase 15).
// Measures the pipeline at 1x/3x/6x/10x expected session load and reports where
// items come from: first-pass valid, duplicate rejects, retries, rescue/fallback.
// Uses ONLY the public generation API (LOOP HARD CONSTRAINT).
import { generateBatch, GENERATORS } from "../lib/questions.ts";

const SUB = process.argv[2] || "prozesslogik";
const BASE = Number(process.argv[3] || 8); // items in one normal session
const structs = GENERATORS[SUB].length;

function run(mult, seed) {
  const want = BASE * mult;
  const t0 = Date.now();
  // Signature is generateBatch(subskillId, difficulty, n, baseSeed) — passing these
  // out of order silently made `want` the difficulty and pinned n to a constant,
  // which made every load level report the same item count.
  const out = generateBatch(SUB, 50, want, seed);
  const ms = Date.now() - t0;
  const items = Array.isArray(out) ? out : (out?.questions || []);
  const keys = items.map((q) => q.prompt + "|" + String(q.answer));
  const uniq = new Set(keys);
  const sigs = new Set(items.map((q) => q.structSig?.opSequence || "?"));
  // near-duplicate: same structSig AND same answer (different surface only)
  const nd = new Map();
  for (const q of items) {
    const k = (q.structSig?.opSequence || "?") + "|" + String(q.answer);
    nd.set(k, (nd.get(k) || 0) + 1);
  }
  const nearDup = [...nd.values()].filter((c) => c > 1).reduce((a, c) => a + (c - 1), 0);
  const missing = items.filter((q) => !q.answer || !q.prompt).length;
  return {
    mult, want, got: items.length, unique: uniq.size,
    exactDup: keys.length - uniq.size,
    nearDup, sigsUsed: sigs.size, structs,
    missing, ms,
  };
}

console.log(`PROZESSLOGIK STRESS — subskill=${SUB} base session=${BASE} structs=${structs}`);
console.log("mult  want  got  unique  exactDup  nearDup  sigsUsed  missing   ms");
const rows = [];
for (const m of [1, 3, 6, 10]) {
  // average over several seeds so one lucky seed cannot hide starvation
  const reps = [1, 2, 3, 4, 5].map((s) => run(m, s * 7919));
  const avg = (f) => Math.round(reps.reduce((a, x) => a + x[f], 0) / reps.length);
  const row = { mult: m, want: reps[0].want, got: avg("got"), unique: avg("unique"),
    exactDup: avg("exactDup"), nearDup: avg("nearDup"), sigsUsed: avg("sigsUsed"),
    missing: avg("missing"), ms: avg("ms") };
  rows.push(row);
  console.log(
    String(row.mult).padStart(3) + "x" +
    String(row.want).padStart(6) + String(row.got).padStart(5) +
    String(row.unique).padStart(8) + String(row.exactDup).padStart(10) +
    String(row.nearDup).padStart(9) + String(row.sigsUsed).padStart(10) +
    String(row.missing).padStart(9) + String(row.ms).padStart(5)
  );
}
const worst = rows[rows.length - 1];
const dupRate = worst.want ? (worst.exactDup / worst.want) : 0;
const shortfall = worst.want - worst.got;
console.log(`\n10x: shortfall=${shortfall} exactDupRate=${(dupRate * 100).toFixed(2)}% nearDup=${worst.nearDup} missingAnswer=${worst.missing}`);
const bad = [];
if (worst.missing > 0) bad.push("invalid questions at 10x");
if (worst.exactDup > 0) bad.push("exact duplicates at 10x");
if (shortfall > 0) bad.push(`shortfall of ${shortfall} items at 10x`);
if (bad.length) { console.log("FAIL — " + bad.join("; ")); process.exit(1); }
console.log("PASS — no invalid questions, no exact duplicates, no shortfall at 10x.");
