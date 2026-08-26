// scripts/test-engine-v2.mjs
// Verifies Phase 5-10 learning-engine fixes deterministically.
import { generate, hasUniqueOptions, dedupeOptions } from "/opt/data/projects/multicheck/lib/questions.ts";
import { emptyCoach, updateModel, composeSubskillQuestions } from "/opt/data/projects/multicheck/lib/coach.ts";
import { ALL_SUBSKILLS } from "/opt/data/projects/multicheck/lib/curriculum.ts";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log("  FAIL:", m); } };

// ---- Phase 5-H: duplicate options rejected ----
console.log("[5-H] duplicate option rejection");
let dupCount = 0, total = 0;
for (const s of ALL_SUBSKILLS) {
  for (let i = 0; i < 200; i++) {
    const q = generate(s.id, 20 + (i % 70), 1000 + i * 13);
    if (!q) continue;
    total++;
    if (q.options && !hasUniqueOptions(q)) dupCount++;
  }
}
ok(dupCount === 0, `found ${dupCount}/${total} questions with duplicate options`);

// ---- Phase 5-E: memory task balanced Ja/Nein ----
console.log("[5-E] memory Ja/Nein balance");
// Recall-family balance: struct slot 0 is the seeded-coin present/absent recall struct.
// The balance invariant applies to the recall family (slot 0), not to numeric structs.
let ja = 0, nein = 0;
for (let i = 0; i < 400; i++) {
  const q = generate("schilder_erinnern", 30, 5000 + i * 7, i % 5);
  if (q.answer === "Ja") ja++; else if (q.answer === "Nein") nein++;
}
ok(ja > 50 && nein > 50, `Ja=${ja} Nein=${nein} (rotation must yield both answers)`);
// And each recall struct must be internally consistent (bijection requirement).
let si0Ja = 0, si1Nein = 0;
for (let i = 0; i < 100; i++) {
  if (generate("schilder_erinnern", 30, 8000 + i * 11, 0).answer === "Ja") si0Ja++;
  if (generate("schilder_erinnern", 30, 8000 + i * 11, 1).answer === "Nein") si1Nein++;
}
ok(si0Ja === 100 && si1Nein === 100, `si0 always Ja (${si0Ja}/100), si1 always Nein (${si1Nein}/100)`);

// ---- Phase 5-D: Wortgruppen prompt matches actual group ----
console.log("[5-D] Wortgruppen prompt matches generated group");
let mismatch = 0;
for (let i = 0; i < 100; i++) {
  const q = generate("wortgruppen", 30, 9000 + i * 11);
  // The answer is the OUTLIER (odd one out). The prompt must NOT hard-code
  // 'Apfel, Birne, Banane' when the actual outlier is from a different group.
  // Verify: prompt does not contain the wrong hard-coded example when outlier isn't in that set.
  const hardCodedApfel = q.prompt.includes("Apfel, Birne, Banane");
  if (hardCodedApfel && q.answer !== "Traktor") mismatch++;
}
ok(mismatch === 0, `${mismatch} prompts hard-coded wrong group`);

// ---- Phase 6: continuous difficulty varies ----
console.log("[6] continuous difficulty produces varying difficultyScore");
const scores = new Set();
for (let d = 15; d <= 90; d += 15) {
  for (let i = 0; i < 30; i++) {
    const q = generate("textaufgaben", d, 20000 + d * 100 + i);
    if (q) scores.add(Math.round(q.difficultyScore));
  }
}
ok(scores.size >= 4, `distinct difficultyScores observed: ${scores.size}`);

// ---- Phase 5-B: recency-weighted accuracy ----
console.log("[5-B] recency-weighted accuracy (each attempt weighted by correctness, not vs current)");
{
  let m = emptyCoach();
  const mk = (correct, ms=1000) => ({ subskill:"kopfrechnen", area:"mathematik", ts: Date.now()+Math.random()*1000, correct, ms, difficulty:30, mode:"adaptive", templateKey:"t"+Math.floor(Math.random()*99999) });
  // T,T,T,T -> high; F,F,F,F -> low; T,T,T,F -> lower than T,T,T,T
  let a = emptyCoach();
  [true,true,true,true].forEach(c=> a = updateModel(a, [mk(c)], "s", "adaptive"));
  const hi = a.subs.kopfrechnen.accuracy;
  let b = emptyCoach();
  [false,false,false,false].forEach(c=> b = updateModel(b, [mk(c)], "s", "adaptive"));
  const lo = b.subs.kopfrechnen.accuracy;
  let c = emptyCoach();
  [true,true,true,false].forEach(cc=> c = updateModel(c, [mk(cc)], "s", "adaptive"));
  const mid = c.subs.kopfrechnen.accuracy;
  ok(hi > 0.8 && lo < 0.2 && mid < hi && mid > lo, `hi=${hi.toFixed(2)} mid=${mid.toFixed(2)} lo=${lo.toFixed(2)}`);
}

// ---- Phase 5-C: daysActive accumulates across sessions ----
console.log("[5-C] daysActive accumulates across distinct days");
{
  let m = emptyCoach();
  const dayKey = (offset) => new Date(Date.now() + offset*86400000).toDateString();
  // session 1 day 0
  m = updateModel(m, [{subskill:"satzbau",area:"deutsch",ts:Date.now(),correct:true,ms:1000,difficulty:30,mode:"adaptive",templateKey:"t1"}], "s1", "adaptive");
  // session 2 day 1
  m = updateModel(m, [{subskill:"satzbau",area:"deutsch",ts:Date.now()+86400000,correct:true,ms:1000,difficulty:30,mode:"adaptive",templateKey:"t2"}], "s2", "adaptive");
  // session 3 day 2
  m = updateModel(m, [{subskill:"satzbau",area:"deutsch",ts:Date.now()+2*86400000,correct:true,ms:1000,difficulty:30,mode:"adaptive",templateKey:"t3"}], "s3", "adaptive");
  ok(m.subs.satzbau.daysActive === 3, `daysActive=${m.subs.satzbau.daysActive} (expect 3)`);
}

// ---- Phase 10: V3 Elo ability moves toward outcome ----
console.log("[10] V3 ability estimate responds to correctness");
{
  let m = emptyCoach();
  const mk = (correct, diff=35, ms=1000) => ({ subskill:"textaufgaben", area:"mathematik", ts:Date.now()+Math.random(), correct, ms, difficulty:diff, mode:"adaptive", templateKey:"t"+Math.floor(Math.random()*99999) });
  const start = m.subs.textaufgaben.difficulty;
  // 10 correct at easy items (diff 20) -> ability should rise
  for (let i=0;i<10;i++) m = updateModel(m, [mk(true, 20)], "s", "adaptive");
  const afterCorrect = m.subs.textaufgaben.difficulty;
  // 10 wrong at hard items (diff 90) -> ability should drop
  let m2 = emptyCoach();
  for (let i=0;i<10;i++) m2 = updateModel(m2, [mk(false, 90)], "s", "adaptive");
  const afterWrong = m2.subs.textaufgaben.difficulty;
  ok(afterCorrect > start && afterWrong < start, `start=${start} correct=${afterCorrect.toFixed(1)} wrong=${afterWrong.toFixed(1)}`);
}

// ---- Phase 7: anti-repetition / exposure ----
console.log("[7] exposure tracking reduces template repeats");
{
  let m = emptyCoach();
  m.subs.textaufgaben.difficulty = 50;
  const qsR = composeSubskillQuestions(m, "textaufgaben", 12, "adaptive"); m = qsR.model; const qs = qsR.questions;
  const keys = qs.map(q=>q.templateKey).filter(Boolean);
  const unique = new Set(keys).size;
  ok(unique >= Math.min(12, keys.length) - 1, `unique templates ${unique}/${keys.length}`);
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
