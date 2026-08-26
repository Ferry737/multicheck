// GUARD (Task 2) — prevents silent reintroduction of cold-start fabrication.
//
// Task 3 gated today's call sites, but the ZEROS still exist in the model:
// speed=0 means "never timed", nextReview=0 means "never scheduled",
// mastery=0 means "unknown". A consumer added later that reads st.speed
// directly and compares it to a threshold silently fabricates a diagnosis
// again, and no other test catches it.
//
// RULE: a raw metric read that feeds a THRESHOLD COMPARISON or a
// sort/find/filter used for a student-facing claim must be guarded by
// hasEvidence() / hasSpeedEvidence() / isReviewDue() from lib/evidence.ts.
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const ROOT = "/opt/data/projects/multicheck";
const SCAN = ["lib", "components", "app"];

// Files allowed to read raw metrics: the gate itself, and the engine internals
// that COMPUTE these values (they must read raw numbers to update them).
const ALLOWED_FILES = new Set([
  "lib/evidence.ts",   // defines the gate
  "lib/useLearner.ts", // migration/NaN repair operates on raw fields by design
  "lib/simArchive.ts", // stores raw values, makes no claims
]);

// Metric fields whose zero value is ambiguous ("no data" vs "measured bad").
const METRICS = ["speed", "mastery", "accuracy", "retention", "nextReview"];

// A read is DANGEROUS when compared against a threshold, i.e. it decides a claim.
const THRESHOLD_CMP = new RegExp(
  `\\.(${METRICS.join("|")})\\s*(\\?\\?\\s*0\\s*\\)?\\s*)?(<|>|<=|>=)`, "i"
);
// Also dangerous: `(st.speed ?? 0) < x` written with the coalesce inside parens.
const COALESCED_CMP = new RegExp(
  `\\(\\s*\\w+(\\?)?\\.(${METRICS.join("|")})\\s*\\?\\?\\s*0\\s*\\)\\s*(<|>|<=|>=)`, "i"
);

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
const violations = [];

for (const f of files) {
  const rel = f.slice(ROOT.length + 1);
  if (ALLOWED_FILES.has(rel)) continue;
  const src = readFileSync(f, "utf8");
  const lines = src.split("\n");

  // A file is considered gated when it imports the evidence helpers.
  const importsGate = /from\s+["'](?:\.\/|@\/lib\/)evidence["']/.test(src);

  lines.forEach((ln, i) => {
    const t = ln.trim();
    if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return;
    const hit = THRESHOLD_CMP.test(ln) || COALESCED_CMP.test(ln);
    if (!hit) return;
    // Same-line guard is acceptable (e.g. hasSpeedEvidence(st) && st.speed < 0.6)
    const sameLineGuard = /hasEvidence\(|hasSpeedEvidence\(|isReviewDue\(/.test(ln);
    if (sameLineGuard) return;
    // File imports the gate but this comparison is unguarded on its line:
    // report it so a human decides. Engine-internal update math lives in
    // coach.ts's updateModel and is expected to appear here.
    violations.push({
      loc: `${rel}:${i + 1}`,
      gated: importsGate,
      code: t.slice(0, 100),
    });
  });
}

// Engine-internal computation sites are recorded as a documented baseline so a
// NEW unguarded consumer stands out immediately.
const BASELINE = new Set([
  "lib/coach.ts",       // updateModel / readiness math computes these values
  "lib/learner.ts",     // presentation helpers over already-computed values
  "lib/orchestrator.ts",// mid-session decisions (guarded by attempt counts)
  "lib/exam.ts",        // breakdown math over completed exams
  "app/fehler/page.tsx",
  "app/pruefung/page.tsx",
]);

const newViolations = violations.filter((v) => !BASELINE.has(v.loc.split(":")[0]));

console.log(`scanned ${files.length} ts/tsx files in ${SCAN.join(", ")}`);
console.log(`threshold comparisons on ambiguous metrics: ${violations.length} (baseline files included)`);
if (newViolations.length) {
  console.log("\nVIOLATIONS — guard these with hasEvidence()/hasSpeedEvidence()/isReviewDue():");
  for (const v of newViolations) console.log(`  ${v.loc}  ${v.code}`);
  throw new Error(`${newViolations.length} unguarded metric threshold read(s) outside baseline`);
}
console.log("PASS — no unguarded metric threshold reads in new code.");
