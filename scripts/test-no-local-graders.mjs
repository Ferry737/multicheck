// GUARD (Task 2) — prevents a FOURTH private answer-grader from appearing.
// The same comparison defect appeared independently in Trainer.tsx, exam.ts and
// MicroLesson.tsx, each with its own norm(). All three now route through
// lib/grading.ts. This test fails the build if a new local grader shows up.
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const ROOT = "/opt/data/projects/multicheck";
const SCAN = ["lib", "components", "app"];
const ALLOWED = ["lib/grading.ts"]; // the single choke point

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next") continue;
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e)) out.push(p);
  }
  return out;
}

const files = SCAN.flatMap((d) => { try { return walk(join(ROOT, d)); } catch { return []; } });

// A "private grader" = a local ANSWER-normalize helper, or a raw comparison
// against a normalized answer. Scoped to answer grading: helpers named
// normalizeError / normalizeUrl etc. are unrelated and must not trip this.
const PRIVATE_NORM = /(?:const|function)\s+norm(?:alizeAnswer|Answer)?\s*(?:=\s*)?\((?:\s*[a-z]\s*:\s*string|\s*[a-z]\s*\))/i;
const RAW_ANSWER_CMP = /norm\w*\([^)]*\)\s*===\s*norm\w*\(/;

const violations = [];
for (const f of files) {
  const rel = f.slice(ROOT.length + 1);
  if (ALLOWED.includes(rel)) continue;
  const src = readFileSync(f, "utf8");
  const lines = src.split("\n");
  lines.forEach((ln, i) => {
    if (ln.trim().startsWith("*") || ln.trim().startsWith("//")) return; // comments
    if (PRIVATE_NORM.test(ln)) violations.push(`${rel}:${i + 1}  private normalize helper: ${ln.trim().slice(0, 90)}`);
    else if (RAW_ANSWER_CMP.test(ln)) violations.push(`${rel}:${i + 1}  raw norm comparison: ${ln.trim().slice(0, 90)}`);
  });
}

console.log(`scanned ${files.length} ts/tsx files in ${SCAN.join(", ")}`);
if (violations.length) {
  console.log("\nVIOLATIONS — route these through lib/grading.ts gradeAnswer():");
  for (const v of violations) console.log("  " + v);
  throw new Error(`${violations.length} private answer-grader(s) found`);
}
console.log("PASS — gradeAnswer() is the only answer-grading path.");
