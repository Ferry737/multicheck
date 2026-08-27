// Small-pool stress: how close does generateBatch get to a subskill's TRUE unique
// ceiling before it starts repeating? For tiny pools (bilder_zaehlen: 92 items total)
// requesting 80 unique is near-exhaustion; the correct behaviour is to exhaust the
// space first and only then repeat, never to repeat while unseen items remain.
import { generateBatch, GENERATORS } from "../lib/questions.ts";

const SUB = process.argv[2];
const WANT = Number(process.argv[3] || 80);

// Measure the true ceiling by brute-force sampling every struct hard.
function ceiling(sub) {
  const gens = GENERATORS[sub];
  const set = new Set();
  for (let si = 0; si < gens.length; si++) {
    for (let i = 0; i < 4000; i++) {
      let s = ((i + 1) * 2654435761) >>> 0;
      const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
      const q = gens[si](r, 50, si);
      if (q) set.add(q.prompt + "|" + String(q.answer));
    }
  }
  return set.size;
}

const cap = ceiling(SUB);
let worstDupWhileRoom = 0;
for (const seed of [11, 22, 33, 44, 55]) {
  const items = generateBatch(SUB, 50, WANT, seed);
  const keys = items.map((q) => q.prompt + "|" + String(q.answer));
  const uniq = new Set(keys);
  const dups = keys.length - uniq.size;
  // Duplicates are only acceptable once we have drained the pool.
  const roomLeft = Math.max(0, Math.min(WANT, cap) - uniq.size);
  if (roomLeft > 0 && dups > 0) worstDupWhileRoom = Math.max(worstDupWhileRoom, dups);
  console.log(`seed ${String(seed).padStart(3)}: got=${items.length} unique=${uniq.size} dups=${dups} unusedRoom=${roomLeft}`);
}
console.log(`\n${SUB}: trueCeiling=${cap} requested=${WANT} reachable=${Math.min(cap, WANT)}`);
if (worstDupWhileRoom > 0) {
  console.log(`FAIL — emitted duplicates while ${worstDupWhileRoom} unique items were still reachable.`);
  process.exit(1);
}
console.log("PASS — duplicates only occur after the unique space is drained.");
