// Capacity + hashU probe for a single subskill (widening verification).
// Usage: npx tsx scripts/_cap.mjs <subskill> [seeds]
import { generate, GENERATORS, structHashOf } from "/opt/data/projects/multicheck/lib/questions.ts";
import crypto from "crypto";

const sub = process.argv[2];
const N = Number(process.argv[3] ?? 5000);
if (!sub || !GENERATORS[sub]) { console.log("unknown subskill:", sub); process.exit(1); }

const U = GENERATORS[sub].length;
const perStruct = [];
const sigs = new Set();

for (let si = 0; si < U; si++) {
  const seen = new Set();
  for (let i = 0; i < N; i++) {
    const q = generate(sub, 50, 800000 + i * 41 + si * 7919, si);
    if (!q) continue;
    const opts = (q.options || []).map(String).map(x => x.trim()).sort();
    seen.add(crypto.createHash("sha1")
      .update(JSON.stringify([q.prompt.trim(), opts, (q.stimulus ?? "").trim()]))
      .digest("hex"));
    if (q.structSig) sigs.add(structHashOf(q.structSig));
    else if (q.structHash) sigs.add(q.structHash);
  }
  perStruct.push(seen.size);
}

const sorted = [...perStruct].sort((a, b) => a - b);
const med = sorted[Math.floor(sorted.length / 2)];
const total = perStruct.reduce((a, b) => a + b, 0);
const cens = (v) => (v >= N ? ">=" + N : String(v));

console.log(`${sub}: U=${U} hashU=${sigs.size}`);
console.log(`  min=${cens(sorted[0])} median=${cens(med)} max=${cens(sorted[sorted.length-1])} total=${total}`);
console.log(`  G4 = total/227 = ${(total / 227).toFixed(2)} ${total / 227 >= 3 ? "PASS" : "FAIL"}`);
const below = perStruct.map((v, i) => [i, v]).filter(([, v]) => v < 50);
console.log(`  structs with <50 renders: ${below.length}${below.length ? " -> " + JSON.stringify(below.slice(0, 30)) : ""}`);
