// scripts/test-exam.mjs — exam state machine + persistence + timer anti-exploit + sim->model
import { buildExam, answerCurrent, startQuestion, advance, enterActive, submit, finalize, remainingMs, currentQuestion, examBreakdown, fatigueAnalysis, applyExamToModel } from "../lib/exam.ts";
import { emptyCoach, overallReadiness, updateModel } from "../lib/coach.ts";
import { ALL_SUBSKILLS } from "../lib/curriculum.ts";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };

// 1) build + flow: instructions -> active -> answer -> advance across sections -> writing -> confirm -> submit
{
  let s = buildExam("voll", 12345);
  ok(s.phase === "instructions", "starts at instructions");
  s = enterActive(s, 1000);
  ok(s.phase === "active", "enterActive -> active");
  const q = currentQuestion(s);
  ok(!!q, "has a question");
  s = startQuestion(s, 1000);
  s = answerCurrent(s, q.answer, 3000); // correct
  ok(s.correct[q.id] === true, "correct recorded");
  // advance through the entire exam
  let guard = 0;
  while (s.phase !== "confirming" && s.phase !== "completed" && guard < 300) {
    guard++;
    if (s.phase === "active") {
      const qq = currentQuestion(s);
      s = startQuestion(s, 1000 + guard * 100);
      s = answerCurrent(s, qq.answer, 2000 + guard * 50);
      s = advance(s, 3000 + guard * 100);
    } else if (s.phase === "transition") {
      s = enterActive(s, 4000 + guard * 100);
    } else if (s.phase === "writing") {
      s = advance(s, 5000);
    } else break;
  }
  ok(s.phase === "confirming" || s.phase === "completed", "reaches confirming/completed: " + s.phase);
  s = submit(s, 6000);
  ok(s.submitted === true, "submitted flag");
  s = finalize(s);
  const bd = examBreakdown(s);
  ok(bd.areas.length === 7, "breakdown has 7 areas");
  ok(bd.subs.length === 11, "breakdown has 11 subskills");
  ok(bd.overall.accuracy > 0 && bd.overall.accuracy <= 1, "overall accuracy in range");
}

// 2) Timer anti-exploit: only absolute deadline persisted; remaining derived, refresh never restores full
{
  const start = 1_000_000;
  let s = buildExam("mini", 999);
  s = { ...s, startedAt: start, absoluteDeadline: start + 25 * 60000 };
  const rem0 = remainingMs(s, start);
  ok(Math.abs(rem0 - 25 * 60000) < 50, "remaining = full at start");
  const remLater = remainingMs(s, start + 10 * 60000); // 10 min later
  ok(Math.abs(remLater - 15 * 60000) < 50, "remaining decreases with time: " + remLater);
  // simulate refresh: new snapshot from persisted fields only (deadline, NOT remainingSeconds)
  const persisted = JSON.parse(JSON.stringify(s));
  const remAfterRefresh = remainingMs(persisted, start + 10 * 60000);
  ok(Math.abs(remAfterRefresh - 15 * 60000) < 50, "refresh does NOT restore full duration: " + remAfterRefresh);
}

// 3) Simulation disagreement lowers mastery (full sim strong practice but weak sim)
{
  let m = emptyCoach();
  const sub = "textaufgaben";
  for (let i = 0; i < 15; i++) m = (await import("../lib/coach.ts")).updateModel(m, [{ subskill: sub, area: "mathematik", ts: 1 + i * 1000, correct: true, ms: 12000, difficulty: 50, mode: "adaptive" }], "s", "adaptive");
  const before = m.subs[sub].mastery;
  // build a sim where this sub performs poorly
  let s = buildExam("voll", 555);
  // force all textaufgaben questions wrong in snapshot
  for (const sec of s.sections) for (const qi of sec.order) {
    const q = sec.questions[qi];
    if (q.subskill === sub) { s.correct[q.id] = false; s.responseTimes[q.id] = 20000; }
    else { s.correct[q.id] = true; s.responseTimes[q.id] = 8000; }
  }
  m = applyExamToModel(m, s, "voll");
  ok(m.subs[sub].mastery < before, `full-sim disagreement lowers mastery (${before.toFixed(2)} -> ${m.subs[sub].mastery.toFixed(2)})`);
}

// 4) Fatigue analysis detects degradation
{
  let s = buildExam("mini", 7);
  const ids = [];
  for (const sec of s.sections) for (const qi of sec.order) ids.push(sec.questions[qi].id);
  // first third correct, last third wrong
  ids.forEach((id, i) => { s.correct[id] = i < ids.length / 3 ? true : (i > 2 * ids.length / 3 ? false : true); });
  const f = fatigueAnalysis(s);
  ok(f.first > f.final, "fatigue: first third better than final");
}

console.log(`EXAM TESTS: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
