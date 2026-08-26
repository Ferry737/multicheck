// HUMAN AUDIT SAMPLER — prints items verbatim for manual reading.
// Usage: npx tsx scripts/_audit_sample.mjs <subskill> <count>
import { generate, GENERATORS } from "/opt/data/projects/multicheck/lib/questions.ts";

const sub = process.argv[2];
const n = Number(process.argv[3] ?? 20);
const U = GENERATORS[sub].length;

for (let i = 0; i < n; i++) {
  const si = i % U;
  const q = generate(sub, 50, 555000 + i * 733, si);
  if (!q) { console.log(`[${i + 1}] si=${si} -> null`); continue; }
  console.log(`\n[${i + 1}] si=${si} sig=${q.structSig?.opSequence ?? "?"}`);
  console.log(`  PROMPT : ${q.prompt}`);
  if (q.options) console.log(`  OPTIONS: ${JSON.stringify(q.options)}`);
  console.log(`  ANSWER : ${q.answer}`);
  if (q.explanation) console.log(`  EXPL   : ${q.explanation}`);
  // correctness checks the validator also runs
  if (q.options) {
    const dup = q.options.length !== new Set(q.options).size;
    const hasAns = q.options.includes(q.answer);
    if (dup) console.log("  !! DUPLICATE OPTIONS");
    if (!hasAns) console.log("  !! ANSWER NOT AMONG OPTIONS");
  }
}
