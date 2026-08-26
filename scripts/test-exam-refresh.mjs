// PHASE 4.1 (headless proxy) — exam persistence + timer across a simulated refresh.
// Cannot drive a browser; instead exercise the exam state machine the page uses,
// serializing to JSON between steps exactly as localStorage would.
import { emptyCoach } from "/opt/data/projects/multicheck/lib/coach.ts";
import * as exam from "/opt/data/projects/multicheck/lib/exam.ts";

const names = Object.keys(exam);
console.log("exam module exports:", names.join(", "));

function roundtrip(o) { return JSON.parse(JSON.stringify(o)); }

const mk = exam.buildExam;
if (!mk) { console.log("NO start function found — cannot test"); process.exit(0); }

const m = emptyCoach();
const T0 = 1_700_000_000_000;

let snap = mk("mini", 20260826);
console.log("\n--- created ---");
console.log("phase:", snap.phase, "startedAt:", snap.startedAt, "sections:", snap.sections?.length);

// enter active
if (exam.enterActive) snap = exam.enterActive({ ...snap, phase: "active" }, T0);

const remAt = (s, t) => exam.remainingMs ? exam.remainingMs(s, t) : null;
const r0 = remAt(snap, T0);
console.log("remaining at T0:", r0);

// answer 5 items, advancing 10s each
let t = T0;
let answered = 0;
for (let i = 0; i < 5; i++) {
  t += 10_000;
  const q = exam.currentQuestion ? exam.currentQuestion(snap) : null;
  if (!q) break;
  if (exam.answerCurrent) snap = exam.answerCurrent(snap, q.answer, t);
  if (exam.advance) snap = exam.advance(snap, t);
  if (snap.phase === "active" && exam.enterActive) snap = exam.enterActive(snap, t);
  answered++;
}
const rBefore = remAt(snap, t);
const answersBefore = JSON.stringify(snap.answers ?? snap.responses ?? null);
const posBefore = [snap.sectionIndex, snap.questionIndex, snap.phase];
console.log(`\n--- after ${answered} answers (t=+${(t-T0)/1000}s) ---`);
console.log("remaining:", rBefore, "position:", posBefore.join("/"));

// ===== SIMULATED HARD REFRESH: serialize -> parse (what localStorage does) =====
const persisted = roundtrip(snap);
const rAfter = remAt(persisted, t);
const answersAfter = JSON.stringify(persisted.answers ?? persisted.responses ?? null);
const posAfter = [persisted.sectionIndex, persisted.questionIndex, persisted.phase];

console.log("\n--- after SIMULATED REFRESH (same wall clock t) ---");
console.log("remaining:", rAfter, "position:", posAfter.join("/"));

const timerOk = rBefore === rAfter;
const answersOk = answersBefore === answersAfter;
const posOk = posBefore.join("/") === posAfter.join("/");
const startedAtOk = persisted.startedAt === snap.startedAt;

// question ORDER must be identical
const ordBefore = JSON.stringify((snap.sections ?? []).map(s => (s.questions ?? []).map(q => q.prompt)));
const ordAfter = JSON.stringify((persisted.sections ?? []).map(s => (s.questions ?? []).map(q => q.prompt)));
const orderOk = ordBefore === ordAfter;

// timer must also CONTINUE (decrease) as clock advances past refresh
const rLater = remAt(persisted, t + 30_000);
const continuesOk = rLater !== null && rLater < rAfter;

console.log("\n=== R5 CHECKS ===");
console.log("timer preserved across refresh :", timerOk ? "PASS" : `FAIL (${rBefore} -> ${rAfter})`);
console.log("timer CONTINUES after refresh  :", continuesOk ? "PASS" : `FAIL (${rAfter} -> ${rLater})`);
console.log("answers preserved              :", answersOk ? "PASS" : "FAIL");
console.log("position preserved             :", posOk ? "PASS" : "FAIL");
console.log("startedAt stable (no reset)    :", startedAtOk ? "PASS" : "FAIL");
console.log("question order identical       :", orderOk ? "PASS" : "FAIL");

const all = timerOk && continuesOk && answersOk && posOk && startedAtOk && orderOk;
console.log("\nR5 (headless proxy):", all ? "PASS" : "FAIL");
console.log("NOTE: this proves the state machine + serialization. It does NOT prove");
console.log("the browser wires it correctly on a real reload — that needs a browser.");
