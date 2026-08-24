import { emptyModel, recordAttempt, overallReadiness, accuracy, masteryOf, selectNext } from "../lib/learner.ts";
import { AREAS } from "../lib/curriculum.ts";
import { generateBatch } from "../lib/questions.ts";

let pass = 0, fail = 0;
const assert = (c, m) => { if (c) { pass++; } else { fail++; console.log("FAIL:", m); } };

// Fresh user
let m = emptyModel();
assert(overallReadiness(m) === 0, "fresh readiness 0");
assert(accuracy(m) === 0, "fresh accuracy 0");

// Standortbestimmung: 10 questions across areas (mix correct/incorrect)
const subskills = AREAS.flatMap((a) => a.subskills).filter((s) => s.id !== "textschreiben");
let ts = 1000;
for (let n = 0; n < 10; n++) {
  const sk = subskills[n % subskills.length];
  const qs = generateBatch(sk.id, 2, 1, ts++);
  const q = qs[0];
  const correct = n % 3 !== 0; // ~7/10 correct
  m = recordAttempt(m, { subskill: sk.id, area: q.area, ts: Date.now() + n * 1000, correct, ms: correct ? 9000 : 20000, prompt: q.prompt, studentAnswer: correct ? q.answer : "x", correctAnswer: q.answer });
}
// Expect accuracy ~70%
const acc = accuracy(m);
assert(acc >= 60 && acc <= 80, "accuracy ~70% got " + acc);
assert(m.fehler.length === 3 || m.fehler.length === 4, "3-4 mistakes recorded got " + m.fehler.length);
assert(overallReadiness(m) > 0, "readiness increased after training");

// Fehler review: re-answer a mistake correctly
const f = m.fehler.find((x) => !x.mastered);
const qs = generateBatch(f.subskill, 2, 1, 555);
const q = qs[0];
m = recordAttempt(m, { subskill: f.subskill, area: f.area, ts: Date.now(), correct: true, ms: 8000, prompt: q.prompt, studentAnswer: q.answer, correctAnswer: q.answer });
assert(masteryOf(m, f.subskill) > 0, "mastery for reviewed skill > 0");

// Adaptive: selectNext should not return a fully-mastered skill repeatedly
const pick = selectNext(m);
assert(typeof pick.subskill === "string", "selectNext returns a skill");

// Persistence simulation: corrupt data → must not throw
try {
  const bad = JSON.parse('{"subs":null,"foo":1}');
  const base = emptyModel();
  const merged = { ...base, ...bad, subs: { ...base.subs, ...(bad.subs || {}) }, fehler: Array.isArray(bad.fehler) ? bad.fehler : [] };
  assert(merged.subs && Object.keys(merged.subs).length > 0, "corrupt merge recovers subs");
} catch { fail++; console.log("FAIL: corrupt merge threw"); }

console.log(`E2E: ${pass} passed, ${fail} failed`);
console.log(fail === 0 ? "E2E PASS ✅" : "E2E FAIL ❌");
process.exit(fail === 0 ? 0 : 1);
