// Phase 7: difficulty distribution regression.
// A universal duplicate filter can preferentially reject HARD candidates (they are
// rarer / collide more), so a request for difficulty 90 could quietly return items
// that look like difficulty 50. This measures the realised difficulty of what
// generateBatch actually returns at each requested ability point.
import { generateBatch, GENERATORS } from "../lib/questions.ts";

const SUBS = Object.keys(GENERATORS);
const POINTS = [10, 30, 50, 70, 90];
const N = 40;

console.log("subskill              d=10   d=30   d=50   d=70   d=90   monotonic?");
const fails = [];
for (const sub of SUBS) {
  const means = [];
  for (const d of POINTS) {
    const vals = [];
    for (const seed of [3, 7, 11]) {
      const items = generateBatch(sub, d, N, seed * 104729);
      for (const q of items) if (typeof q.difficulty === "number") vals.push(q.difficulty);
    }
    means.push(vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : NaN);
  }
  // Realised difficulty must rise with the request (allow small non-strict steps).
  let mono = true;
  for (let i = 1; i < means.length; i++) if (means[i] + 2 < means[i - 1]) mono = false;
  const spread = means[means.length - 1] - means[0];
  // q.difficulty is a coarse BAND (1..3) for most generators, while a few echo the
  // raw 0..100 request. Normalise: judge collapse relative to the observed scale
  // rather than assuming 0..100 (an earlier version of this test wrongly reported a
  // P1 "difficulty collapse" because it compared a 1..3 band against a 0..100 span).
  const scale = means[means.length - 1] > 10 ? 100 : 3;
  const minSpread = scale === 100 ? 20 : 1.5;
  if (!mono) fails.push(`${sub}: realised difficulty not monotonic (${means.map((m) => m.toFixed(0)).join(" -> ")})`);
  if (Number.isFinite(spread) && spread < minSpread) fails.push(`${sub}: difficulty COLLAPSED (d=10 -> d=90 spread ${spread.toFixed(1)} on a ${scale}-scale)`);
  console.log(sub.padEnd(20) + means.map((m) => String(m.toFixed(1)).padStart(6)).join(" ") + "   " + (mono ? "yes" : "NO"));
}
console.log("");
if (fails.length) { for (const f of fails) console.log("FAIL:", f); process.exit(1); }
console.log("PASS — realised difficulty tracks the requested ability point for every subskill.");
