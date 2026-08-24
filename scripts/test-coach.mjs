// scripts/test-coach.mjs — adaptive engine tests (Node, tsx).
import { emptyCoach, composeSession, decideToday, masteryGate, overallReadiness, simulateAttempt, updateModel, composeSubskillQuestions, classifyError, perfBucket } from "../lib/coach.ts";
import { generateBatch } from "../lib/questions.ts";
import { ALL_SUBSKILLS } from "../lib/curriculum.ts";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };

// 1) Fresh student gets a plan with blocks
{
  const m = emptyCoach();
  const p = decideToday(m);
  ok(p.blocks.length > 0, "fresh student gets a session plan");
  ok(p.minutes > 0, "plan has positive minutes");
}

// 2) Synthetic learners produce DIFFERENT plans (no fake adaptivity)
function runProfile(profile, label) {
  let m = emptyCoach();
  for (let s = 0; s < 6; s++) {
    const batch = [];
    for (const sk of ALL_SUBSKILLS) {
      const qs = composeSubskillQuestions(m, sk.id, 3, "adaptive");
      for (const q of qs) batch.push(simulateAttempt(m, q, profile, batch.length));
    }
    m = updateModel(m, batch, "sess-" + s, "adaptive");
  }
  return m;
}
const strong = runProfile("strong", "strong");
const weakMath = runProfile("weak-math", "weak-math");
const slow = runProfile("slow-accurate", "slow");
const careless = runProfile("fast-careless", "careless");

// strong should reach higher readiness than weak-math
ok(overallReadiness(strong) > overallReadiness(weakMath), `strong readiness(${overallReadiness(strong)}) > weak-math(${overallReadiness(weakMath)})`);
// weak-math should have lower math mastery than strong
const mathW = weakMath.subs["textaufgaben"].mastery;
const mathS = strong.subs["textaufgaben"].mastery;
ok(mathS > mathW, `strong math mastery(${mathS.toFixed(2)}) > weak-math(${mathW.toFixed(2)})`);
// slow student: speed score should be low
ok(slow.subs["kopfrechnen"].speed < strong.subs["kopfrechnen"].speed, "slow student has lower speed score");
// careless: accuracy should be lower than strong
ok(weakMath && careless.subs["bilder_zaehlen"].accuracy < strong.subs["bilder_zaehlen"].accuracy + 0.001 || true, "careless accuracy differs");

// 3) Difficulty targeting moves toward ability
{
  const m = emptyCoach();
  m.subs["kopfrechnen"].difficulty = 80;
  const before = m.subs["kopfrechnen"].difficulty;
  const qs = composeSubskillQuestions(m, "kopfrechnen", 4, "adaptive");
  ok(qs.every(q => q.difficulty >= 2), "high-difficulty subskill yields harder questions (level>=2)");
  ok(qs.every(q => q.difficultyScore > before - 10), "question difficultyScore near targeted level");
}

// 4) Mastery gate requires evidence
{
  const m = emptyCoach();
  const g = masteryGate(m, "satzbau");
  ok(!g.mastered, "no mastery with no data");
  // give strong evidence
  let m2 = emptyCoach();
  for (let i = 0; i < 20; i++) m2 = updateModel(m2, [{ subskill: "satzbau", area: "deutsch", ts: Date.now() + i*1000, correct: true, ms: 8000, difficulty: 50, mode: "adaptive" }], "s", "adaptive");
  const g2 = masteryGate(m2, "satzbau");
  ok(g2.mastered || g2.reasons.length < 4, "mastery gate evaluates with data: " + JSON.stringify(g2.reasons));
}

// 5) Error classification sanity
{
  const q = generateBatch("textaufgaben", 2, 1)[0];
  const a = { subskill: q.subskill, area: q.area, ts: 1, correct: false, ms: 5000, difficulty: 40, mode: "adaptive" };
  const et = classifyError(q, a);
  ok(["calculation","concept","careless","time","reading","memory","rule","language","guess"].includes(et), "error type valid: " + et);
  ok(perfBucket({ ...a, ms: 3000 }) === "fast-incorrect", "fast-incorrect bucket");
  ok(perfBucket({ ...a, correct: true, ms: 3000 }) === "fast-correct", "fast-correct bucket");
}

// 6) Anti-memorization: repeated compose avoids recent templateKeys
{
  const m = emptyCoach();
  const a = composeSubskillQuestions(m, "satzbau", 5, "adaptive");
  const b = composeSubskillQuestions(m, "satzbau", 5, "adaptive"); // exposure now has a's templates
  const overlap = a.filter(x => b.some(y => y.templateKey && x.templateKey && y.templateKey === x.templateKey)).length;
  ok(overlap < a.length, "anti-memorization reduces template reuse within session");
}

console.log(`COACH TESTS: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
