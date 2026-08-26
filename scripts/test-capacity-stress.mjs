// STEP 1 — validate prozesslogik min=14 under stress before relaxing the target.
// (a) STRESS PROFILE: Logik-weak learner served prozesslogik at 2-3x average rate
// (b) DOUBLE HORIZON: 112 days instead of 56
// Binding gate: rescueRate == 0 AND degradedRate == 0 under BOTH.
import { emptyCoach, updateModel, composeSubskillQuestions, g1Violations } from "/opt/data/projects/multicheck/lib/coach.ts";
import crypto from "crypto";

function nameHash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0x7fffffff; return h; }
function exactKey(q) {
  const opts = (q.options || []).map(String).map(x => x.trim()).sort();
  return crypto.createHash("sha1").update(JSON.stringify([q.prompt.trim(), opts, (q.stimulus ?? "").trim()])).digest("hex");
}

const ID = "prozesslogik";

function run(label, days, perDay, seed) {
  for (const k of Object.keys(g1Violations)) delete g1Violations[k];
  let m = emptyCoach();
  const keys = [];
  let served = 0;
  for (let day = 0; day < days; day++) {
    const res = composeSubskillQuestions(m, ID, perDay, "adaptive", seed * 100000 + day * 100 + nameHash(ID) % 97);
    m = res.model;
    const atts = [];
    for (const q of res.questions) {
      served++;
      keys.push(exactKey(q));
      // Logik-weak learner: mostly wrong, which keeps the subskill in the weak bucket
      atts.push({ subskill: ID, area: "logik", ts: Date.now() + day * 86400000,
        correct: (day + served) % 4 === 0, ms: 24000, difficulty: 30,
        mode: "adaptive", templateKey: q.templateKey, structHash: q.structHash });
    }
    m = updateModel(m, atts, "day-" + day, "adaptive");
  }
  const rescue = Number(m.exposure[ID + ":rescueCount"] ?? 0);
  const degraded = Number(g1Violations[ID] ?? 0);
  const distinct = new Set(keys).size;
  const dup = ((keys.length - distinct) / keys.length * 100);
  console.log(
    label.padEnd(34) +
    ` served=${String(served).padStart(4)}` +
    ` distinct=${String(distinct).padStart(4)}` +
    ` exactDup=${dup.toFixed(2).padStart(6)}%` +
    ` rescue=${String(rescue).padStart(3)}` +
    ` degraded=${String(degraded).padStart(3)}`
  );
  return { rescue, degraded, dup };
}

console.log("=== prozesslogik margin validation (min=14, ~10.3 servings/struct baseline) ===\n");
console.log("scenario                            served distinct exactDup  rescue degraded");

const results = [];
// baseline: 56 days, ~4/day => ~227 servings (the modelled average)
results.push(["baseline 56d x4/day", run("baseline 56d x4/day", 56, 4, 101)]);
// (a) STRESS: 2x and 3x the average serving rate
results.push(["stress 56d x8/day (2x)", run("stress 56d x8/day (2x)", 56, 8, 202)]);
results.push(["stress 56d x12/day (3x)", run("stress 56d x12/day (3x)", 56, 12, 303)]);
// (b) DOUBLE HORIZON
results.push(["double horizon 112d x4/day", run("double horizon 112d x4/day", 112, 4, 404)]);
// combined worst case
results.push(["worst 112d x12/day", run("worst 112d x12/day", 112, 12, 505)]);

console.log("\n=== VERDICT ===");
const anyRescue = results.some(([, r]) => r.rescue > 0);
const anyDegraded = results.some(([, r]) => r.degraded > 0);
for (const [label, r] of results) {
  const ok = r.rescue === 0 && r.degraded === 0;
  console.log(`${ok ? "PASS" : "FAIL"} | ${label.padEnd(30)} rescue=${r.rescue} degraded=${r.degraded}`);
}
console.log(`\nrescueRate == 0 under ALL scenarios : ${anyRescue ? "NO" : "YES"}`);
console.log(`degradedRate == 0 under ALL scenarios: ${anyDegraded ? "NO" : "YES"}`);
console.log(anyRescue || anyDegraded
  ? "\n=> DO NOT RELAX. Widen the structs that break under stress."
  : "\n=> min=14 survives 3x serving rate AND double horizon. Relaxing to 3x servings is evidence-backed.");
