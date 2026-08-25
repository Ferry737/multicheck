// scripts/test-orchestrator.mjs
// Verifies Phase 11/12: CoachOrchestrator deterministic core + AI-disabled functionality.
import { buildNextSession, afterAnswer, personalizeRationale, assertNoAIScoreOverride } from "/opt/data/projects/multicheck/lib/orchestrator.ts";
import { emptyCoach, updateModel } from "/opt/data/projects/multicheck/lib/coach.ts";
import { generate } from "/opt/data/projects/multicheck/lib/questions.ts";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("  FAIL:", m); } };

console.log("[11/12] CoachOrchestrator deterministic + AI-disabled");

// 1. buildNextSession works deterministically with NO AI (aiAvailable=false)
let m = emptyCoach();
const dec = buildNextSession(m, { minutes: 22 });
ok(dec.aiAvailable === false, "aiAvailable false when no AI rationale passed");
ok(dec.plan.blocks.length > 0, "session has blocks");
ok(dec.rationale && dec.rationale.length > 0, "deterministic rationale present");
ok(dec.interventions.length >= 0, "interventions array present");

// 2. After training, plan adapts (weak subskills appear)
let m2 = emptyCoach();
// simulate weak satzbau
for (let i = 0; i < 5; i++) m2 = updateModel(m2, [{ subskill: "satzbau", area: "deutsch", ts: Date.now(), correct: false, ms: 3000, difficulty: 30, mode: "adaptive", templateKey: "t" + i }], "s", "adaptive");
const dec2 = buildNextSession(m2, { minutes: 22 });
const weakBlock = dec2.plan.blocks.find((b) => b.subskill === "satzbau");
ok(!!weakBlock, "weak subskill (satzbau) scheduled after failures");

// 3. afterAnswer returns a deterministic decision + next question (AI off)
const q = generate("kopfrechnen", 35, 123);
const aa = afterAnswer(m2, q, true, 2000, 1, false);
ok(aa.decision && aa.next && aa.next.length >= 0, "afterAnswer returns decision + next");

// 4. personalizeRationale: AI text is supplementary, never replaces deterministic reason
const det = "Trainiere schwache Bereiche.";
const withAI = personalizeRationale(det, "Ich sehe du kämpfst mit Satzbau.");
ok(withAI.startsWith(det), "deterministic rationale preserved when AI present");
const noAI = personalizeRationale(det, null);
ok(noAI === det, "no AI -> deterministic rationale unchanged");

// 5. assertNoAIScoreOverride: AI value NEVER overrides deterministic score
const score = assertNoAIScoreOverride(999, 0.82);
ok(score === 0.82, "AI value ignored for scoring");

// 6. AI-augmented mode flag
const decAI = buildNextSession(m, { minutes: 22, aiRationale: "Personalisiert: du warst gestern stark." });
ok(decAI.aiAvailable === true, "aiAvailable true when AI rationale passed");

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
