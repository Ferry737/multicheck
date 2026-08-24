// scripts/test-longitudinal.mjs — 30-session simulation for all 7 synthetic learners (Loop 16).
import { emptyCoach, updateModel, composeSession, classifyError, overallReadiness, composeSubskillQuestions } from "../lib/coach.ts";
import { ALL_SUBSKILLS } from "../lib/curriculum.ts";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };

function rng(seed) { return function() { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function profileFn(name) {
  const r = rng(name.split("").reduce((a, c) => a + c.charCodeAt(0), 7));
  return (q) => {
    let p, ms;
    switch (name) {
      case "A-strong": p = 0.97; ms = 6000 + r() * 2000; break;
      case "B-weak-math": p = q.area === "mathematik" ? 0.55 : 0.92; ms = 12000; break;
      case "C-slow-accurate": p = 0.9; ms = 30000 + r() * 10000; break;
      case "D-fast-careless": p = 0.65; ms = 2500 + r() * 1500; break;
      case "E-poor-retention": { const sp = q.mode === "spaced"; p = sp ? 0.55 : 0.9; ms = 10000; break; }
      case "F-strong-practice-weak-exam": p = (q.mode === "full-sim" || q.mode === "mini-sim") ? 0.6 : 0.93; ms = 11000; break;
      case "G-uneven": p = ({ deutsch: 0.95, mathematik: 0.8, logik: 0.82, konzentration: 0.51, merkfaehigkeit: 0.43, praktisch: 0.87 })[q.area] ?? 0.7; ms = 12000; break;
      default: p = 0.7; ms = 12000;
    }
    return { correct: r() < p, ms, mode: q.mode || "adaptive" };
  };
}

function runSession(m, profile, n) {
  const batch = [];
  for (const sk of ALL_SUBSKILLS) {
    if (sk.id === "textschreiben") continue;
    const qs = composeSubskillQuestions(m, sk.id, 3, "adaptive");
    for (const q of qs) {
      const rr = profile(q);
      const a = { subskill: q.subskill, area: q.area, ts: Date.now() + n * 1000, correct: rr.correct, ms: rr.ms, difficulty: q.difficultyScore ?? q.difficulty, mode: "adaptive", templateKey: q.templateKey, prompt: q.prompt, studentAnswer: rr.correct ? q.answer : "x", correctAnswer: q.answer };
      a.errorType = rr.correct ? undefined : classifyError(q, a);
      batch.push(a);
    }
  }
  if (n % 6 === 5) {
    for (const sk of ALL_SUBSKILLS.slice(0, 4)) {
      if (sk.id === "textschreiben") continue;
      const qs = composeSubskillQuestions(m, sk.id, 2, "mini-sim");
      for (const q of qs) { const rr = profile({ ...q, mode: "mini-sim" }); batch.push({ subskill: q.subskill, area: q.area, ts: Date.now() + n * 1000, correct: rr.correct, ms: rr.ms, difficulty: q.difficultyScore ?? q.difficulty, mode: "mini-sim", templateKey: q.templateKey }); }
    }
  }
  return updateModel(m, batch, "sess-" + n, "adaptive");
}

function summarizePlan(m) {
  const p = composeSession(m);
  const diffs = p.blocks.map(b => Math.round((m.subs[b.subskill]?.difficulty ?? 40)));
  return { n: p.blocks.length, diffs, mastery: Math.round(overallReadiness(m) * 100), weak: p.blocks.filter(b => (m.subs[b.subskill]?.mastery ?? 0) < 0.4).length };
}

const profiles = ["A-strong", "B-weak-math", "C-slow-accurate", "D-fast-careless", "E-poor-retention", "F-strong-practice-weak-exam", "G-uneven"];
for (const name of profiles) {
  let m = emptyCoach();
  const first = summarizePlan(m);
  let plans = [first];
  for (let n = 0; n < 30; n++) { m = runSession(m, profileFn(name), n); plans.push(summarizePlan(m)); }
  const last = plans[plans.length - 1];
  const diffChanged = JSON.stringify(first.diffs) !== JSON.stringify(last.diffs);
  const masteryRose = last.mastery > first.mastery + 5;
  ok(diffChanged || masteryRose, name + ": plan evolved s1->s30 (" + first.diffs + " vs " + last.diffs + ", masteries " + first.mastery + "->" + last.mastery + ")");
  ok(masteryRose, name + ": readiness rose (" + first.mastery + " -> " + last.mastery + ")");
  if (name === "A-strong") ok(last.diffs.filter(d => d >= 50).length >= Math.ceil(last.diffs.length * 0.6), "strong reaches high difficulty majority (" + last.diffs + ")");
  if (name === "B-weak-math") ok(m.subs["textaufgaben"].mastery > 0.3, "weak-math shows Math improvement (" + Math.round(m.subs["textaufgaben"].mastery * 100) + "%)");
  if (name === "C-slow-accurate") ok(m.subs["kopfrechnen"].speed < 0.7, "slow learner speed stays clearly slow (" + m.subs["kopfrechnen"].speed.toFixed(2) + ")");
  if (name === "G-uneven") { const pb = last.diffs.length ? composeSession(m).blocks.map(b => b.subskill) : []; ok(pb.includes("schilder_erinnern") || pb.includes("bilder_zaehlen") || (m.subs["schilder_erinnern"]?.mastery ?? 0) < 0.6, "uneven learner targets weak areas (" + pb.join(",") + ")"); }
}

console.log("LONGITUDINAL TESTS: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
