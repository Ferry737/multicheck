// scripts/test-coach.mjs — adaptive engine tests (Node, tsx).
import { emptyCoach, composeSession, decideToday, masteryGate, overallReadiness, simulateAttempt, updateModel, composeSubskillQuestions, classifyError, perfBucket, recordSimulation, needsLesson, explainDecision } from "../lib/coach.ts";
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

ok(overallReadiness(strong) > overallReadiness(weakMath), `strong readiness > weak-math`);
const mathW = weakMath.subs["textaufgaben"].mastery;
const mathS = strong.subs["textaufgaben"].mastery;
ok(mathS > mathW, `strong math mastery > weak-math`);
ok(slow.subs["kopfrechnen"].speed < strong.subs["kopfrechnen"].speed, "slow student has lower speed score");

// 3) Difficulty targeting moves toward ability
{
  const m = emptyCoach();
  m.subs["kopfrechnen"].difficulty = 80;
  const qs = composeSubskillQuestions(m, "kopfrechnen", 4, "adaptive");
  ok(qs.every(q => q.difficulty >= 2), "high-difficulty subskill yields harder questions (level>=2)");
}

// 4) Mastery gate requires evidence
{
  const m = emptyCoach();
  const g = masteryGate(m, "satzbau");
  ok(!g.mastered, "no mastery with no data");
  let m2 = emptyCoach();
  for (let i = 0; i < 20; i++) m2 = updateModel(m2, [{ subskill: "satzbau", area: "deutsch", ts: Date.now() + i*1000, correct: true, ms: 8000, difficulty: 50, mode: "adaptive" }], "s", "adaptive");
  const g2 = masteryGate(m2, "satzbau");
  ok(g2.mastered || g2.reasons.length < 4, "mastery gate evaluates with data");
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
  const b = composeSubskillQuestions(m, "satzbau", 5, "adaptive");
  const overlap = a.filter(x => b.some(y => y.templateKey && x.templateKey && y.templateKey === x.templateKey)).length;
  ok(overlap < a.length, "anti-memorization reduces template reuse");
}

// 7) Simulation feedback: training high, sim low -> mastery DROPS
{
  let m = emptyCoach();
  const sub = "textaufgaben";
  for (let i = 0; i < 15; i++) m = updateModel(m, [{ subskill: sub, area: "mathematik", ts: Date.now()+i*1000, correct: true, ms: 12000, difficulty: 50, mode: "adaptive" }], "s", "adaptive");
  const before = m.subs[sub].mastery;
  const simRes = Array.from({length: 10}, (_, k) => ({ subskill: sub, correct: k < 3, ms: 15000 })); // deterministic 30% sim accuracy
  m = recordSimulation(m, simRes, "mini-sim");
  ok(m.subs[sub].mastery < before, `simulation disagreement lowers mastery (${before.toFixed(2)} -> ${m.subs[sub].mastery.toFixed(2)})`);
  ok(m.subs[sub].simPerf < 0.7, "simPerf recorded low");
}

// 8) Lesson trigger: repeated concept failures -> needsLesson true
{
  let m = emptyCoach();
  const sub = "satzbau";
  for (let i = 0; i < 6; i++) m = updateModel(m, [{ subskill: sub, area: "deutsch", ts: Date.now()+i*1000, correct: false, ms: 9000, difficulty: 40, mode: "adaptive", errorType: "rule" }], "s", "adaptive");
  const nl = needsLesson(m, sub);
  ok(nl.lesson === true, "needsLesson true after repeated rule failures: " + JSON.stringify(nl));
}

// 9) explainDecision returns short text
{
  const m = emptyCoach();
  const plan = composeSession(m);
  if (plan.blocks.length) {
    const ex = explainDecision(m, plan.blocks[0]);
    ok(typeof ex === "string" && ex.length > 5, "explainDecision returns text");
  } else ok(true, "skipped");
}

console.log(`COACH TESTS: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
