// Regression test for the R7 plan-selection defect.
//
// DEFECT: composeSession -> distribute() iterated candidate subskills in fixed DRILL
// declaration order and then truncated, so only the first few DRILL entries were ever
// scheduled. A learner failing kopfrechnen 32 times never received kopfrechnen; the
// daily plan was byte-identical for every learner. Ordering by mastery alone was also
// insufficient: 32 failures and 0 attempts both read mastery 0.
//
// RED-CAPABLE: reverting distribute() to declaration order makes this fail.
import { emptyCoach, updateModel, decideToday } from "../lib/coach.ts";

const at = (s, correct, ts) => ({
  subskill: s, area: s === "kopfrechnen" || s === "textaufgaben" ? "mathematik" : "x",
  ts, correct, ms: 14000, difficulty: 50, mode: "training", unseen: true,
});

// Deliberately choose targets that sit LATE in the DRILL order — those are the ones the
// old truncation could never reach.
const TARGETS = ["kopfrechnen", "wortgruppen", "alltagswissen", "schilder_erinnern",
  "sortierverfahren", "symbole_entdecken"];

const fails = [];
const plans = new Map();

for (const target of TARGETS) {
  let m = emptyCoach();
  for (let i = 0; i < 32; i++) m = updateModel(m, [at(target, false, Date.now() + i)], `f${i}`, "training");
  const plan = decideToday(m);
  const subs = (plan.blocks || []).map((b) => b.subskill);
  plans.set(target, subs.join(","));
  const scheduled = subs.includes(target);
  const first = subs[0] === target;
  console.log(`${target.padEnd(20)} scheduled=${scheduled ? "yes" : "NO "} first=${first ? "yes" : "no "}  plan: ${subs.join(",")}`);
  if (!scheduled) fails.push(`${target} failed 32x but is NOT in the plan`);
  if (!first) fails.push(`${target} failed 32x but is not the FIRST block (priority)`);
}

// The plans for different weak subskills must not be identical.
const distinct = new Set(plans.values()).size;
console.log(`\ndistinct plans across ${TARGETS.length} different weak subskills: ${distinct}`);
if (distinct < TARGETS.length) fails.push(`only ${distinct}/${TARGETS.length} distinct plans — plan does not track the weak subskill`);

// A fresh learner must still get a sensible diagnostic mix (not empty, not one subskill).
const fresh = (decideToday(emptyCoach()).blocks || []).map((b) => b.subskill);
console.log(`fresh learner plan: ${fresh.join(",")}`);
if (fresh.length < 2) fails.push("fresh learner plan collapsed to fewer than 2 blocks");
if (new Set(fresh).size < 2) fails.push("fresh learner plan has no subskill variety");

console.log("");
if (fails.length) { for (const f of fails) console.log("FAIL:", f); console.log(`\nFAIL — ${fails.length} plan-selection defect(s).`); process.exit(1); }
console.log("PASS — the weakest PROVEN subskill is scheduled first and plans track the learner.");
