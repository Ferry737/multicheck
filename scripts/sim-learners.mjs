// scripts/sim-learners.mjs
// Phase 23: run synthetic learner profiles through 56 days of training
// and assert the engine produces sensible, monotonic-ish mastery growth
// and never crashes / never reports impossible values.
import { emptyCoach, updateModel, composeSubskillQuestions, simulateAttempt, recordSimulation } from "/opt/data/projects/multicheck/lib/coach.ts";
import { buildNextSession } from "/opt/data/projects/multicheck/lib/orchestrator.ts";
import { ALL_SUBSKILLS } from "/opt/data/projects/multicheck/lib/curriculum.ts";

const PROFILES = ["strong", "weak-math", "slow-accurate", "fast-careless", "forgetful"];
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("  FAIL:", m); } };

for (const profile of PROFILES) {
  console.log(`[23] synthetic learner: ${profile}`);
  let m = emptyCoach();
  const DAYS = 56;
  const perDay = 10;
  const history = [];
  for (let d = 0; d < DAYS; d++) {
    const dec = buildNextSession(m, { minutes: 22 });
    const qs = [];
    for (const b of dec.plan.blocks) { const r = composeSubskillQuestions(m, b.subskill, b.count, b.mode); m = r.model; qs.push(...r.questions); }
    const attempts = qs.slice(0, perDay).map((q, i) => simulateAttempt(m, q, profile, i + d * 100));
    m = updateModel(m, attempts, "day-" + d, "adaptive");
    // once a week, a mini-simulation
    if (d % 7 === 6) {
      const r1 = composeSubskillQuestions(m, "textaufgaben", 5, "adaptive"); m = r1.model;
      const r2 = composeSubskillQuestions(m, "satzbau", 3, "adaptive"); m = r2.model;
      const simQs = r1.questions.concat(r2.questions);
      const simRes = simQs.map((q, i) => { const a = simulateAttempt(m, q, profile, i + 5000); return { subskill: a.subskill, correct: a.correct, ms: a.ms }; });
      m = recordSimulation(m, simRes, "mini-sim");
    }
    const overall = Object.values(m.subs).reduce((s, st) => s + st.mastery, 0) / ALL_SUBSKILLS.length;
    history.push(overall);
    // invariant: mastery in [0,1], daysActive sane, no NaN
    for (const st of Object.values(m.subs)) {
      if (!(st.mastery >= 0 && st.mastery <= 1)) { ok(false, `${profile} day${d}: mastery out of range ${st.mastery}`); break; }
      if (Number.isNaN(st.difficulty)) { ok(false, `${profile} day${d}: NaN difficulty`); break; }
    }
  }
  const finalOverall = history[history.length - 1];
  const startOverall = history[0];
  ok(finalOverall > startOverall, `${profile}: overall grew ${startOverall.toFixed(2)} -> ${finalOverall.toFixed(2)}`);
  ok(finalOverall <= 1.0001, `${profile}: final overall <= 1`);
  // strong learner should end high
  if (profile === "strong") ok(finalOverall > 0.7, `strong ends high (${finalOverall.toFixed(2)})`);
  // weak-math should show math weaker than non-math
  if (profile === "weak-math") {
    const mathM = (m.subs.textaufgaben.mastery + m.subs.kopfrechnen.mastery) / 2;
    const otherM = (m.subs.satzbau.mastery + m.subs.wortgruppen.mastery) / 2;
    ok(mathM < otherM + 0.2, `weak-math: math (${mathM.toFixed(2)}) not better than other (${otherM.toFixed(2)})`);
  }
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
