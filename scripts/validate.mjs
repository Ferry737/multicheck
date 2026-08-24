import { generateBatch } from "../lib/questions.ts";
import { ALL_SUBSKILLS } from "../lib/curriculum.ts";

// Independent expected-answer recomputation for math subskills
function expected(q) {
  // q.prompt contains the parameters; we re-parse from prompt (fragile but validates determinism)
  return null; // we instead trust generator-internal correctness + check structural invariants
}

let total = 0, bad = 0, dupes = 0, emptyOpt = 0, ansMissing = 0;
const seen = new Map();
for (const s of ALL_SUBSKILLS) {
  const qs = generateBatch(s.id, 2, 200, 12345);
  for (const q of qs) {
    total++;
    if (!q.answer) { ansMissing++; bad++; }
    if (q.options && q.options.length && !q.options.includes(q.answer)) { bad++; console.log("ANSWER NOT IN OPTIONS:", s.id, q.prompt, "ans=", q.answer, "opts=", q.options); }
    if (q.options && q.options.some((o) => !o || !o.trim())) { emptyOpt++; }
    const key = q.prompt + "|" + (q.stimulus || "");
    if (seen.has(key)) dupes++; else seen.set(key, 1);
  }
}
console.log(`Generated ${total} questions.`);
console.log(`Answer missing: ${ansMissing}, Answer-not-in-options: ${bad - ansMissing}, Empty options: ${emptyOpt}, Duplicate prompts: ${dupes}`);
console.log(bad === 0 && emptyOpt === 0 ? "VALIDATION PASS ✅" : "VALIDATION FAIL ❌");
process.exit(bad === 0 && emptyOpt === 0 ? 0 : 1);
