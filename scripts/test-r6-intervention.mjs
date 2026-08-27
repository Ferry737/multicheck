// R6 — ADAPTIVE INTERVENTION INTEGRITY (docs/RELEASE-GATES.md)
// Direct test of the shipped decision path lib/coach.ts midSessionDecision(), plus
// updateModel() so difficulty/classification effects are the production ones.
// PASS requires all four behavioural paths to differ appropriately.
import { emptyCoach, updateModel, midSessionDecision, classifyError, perfBucket, SPEED_TARGET_S } from "../lib/coach.ts";

const SUB = "kopfrechnen";
const TARGET = 12000; // midSessionDecision's internal SPEED_TARGET
const at = (correct, ms, ts, mode = "training") => ({
  subskill: SUB, area: "mathematik", ts, correct, ms, difficulty: 50, mode, unseen: true,
});
const fails = [];
const ok = (cond, label, detail) => {
  console.log(`  ${cond ? "PASS" : "FAIL"} — ${label}${detail ? `  [${detail}]` : ""}`);
  if (!cond) fails.push(label);
};

// ---------- A. FAST + WRONG ----------
console.log("A. FAST + WRONG (very fast incorrect answers)");
let mA = emptyCoach();
// give it a non-trivial history first so "weak" does not trivially fire
for (let i = 0; i < 4; i++) mA = updateModel(mA, [at(true, 9000, Date.now() - (9 - i) * 86400000)], `a-warm${i}`, "training");
const diffBeforeA = Math.round(mA.subs[SUB].difficulty);
const fastWrongMs = Math.round(TARGET * 0.3); // clearly "careless fast"
const decA1 = midSessionDecision(mA, SUB, false, fastWrongMs, 1, false);
const decA2 = midSessionDecision(mA, SUB, false, fastWrongMs, 2, false);
mA = updateModel(mA, [at(false, fastWrongMs, Date.now()), at(false, fastWrongMs, Date.now() + 1)], "a-fw", "training");
const diffAfterA = Math.round(mA.subs[SUB].difficulty);
const bucketA = perfBucket({ correct: false, ms: fastWrongMs });
console.log(`   ms=${fastWrongMs} (target ${TARGET})  decisions: ${decA1.kind}, ${decA2.kind}  bucket=${bucketA}  difficulty ${diffBeforeA} -> ${diffAfterA}`);
ok(decA1.kind === "accuracy", "fast+wrong triggers ACCURACY intervention", decA1.kind);
ok(decA1.kind !== "speed" && decA2.kind !== "speed", "fast+wrong never rewards speed");
ok(diffAfterA <= diffBeforeA, "difficulty does not RISE because of speed", `${diffBeforeA} -> ${diffAfterA}`);
ok(decA1.kind !== "lesson", "no beginner concept lesson on a single fast miss", decA1.kind);
ok(bucketA === "fast-incorrect", "error classified as fast-incorrect", bucketA);

// ---------- B. SLOW + CORRECT ----------
console.log("\nB. SLOW + CORRECT (correct but far above timing target)");
let mB = emptyCoach();
for (let i = 0; i < 4; i++) mB = updateModel(mB, [at(true, 9000, Date.now() - (9 - i) * 86400000)], `b-warm${i}`, "training");
const accBeforeB = Number((mB.subs[SUB].accuracy || 0).toFixed(3));
const slowMs = TARGET * 3;
const decB = midSessionDecision(mB, SUB, true, slowMs, 0, false);
mB = updateModel(mB, [at(true, slowMs, Date.now())], "b-sc", "training");
const accAfterB = Number((mB.subs[SUB].accuracy || 0).toFixed(3));
const bucketB = perfBucket({ correct: true, ms: slowMs });
console.log(`   ms=${slowMs}  decision=${decB.kind}  bucket=${bucketB}  accuracy ${accBeforeB} -> ${accAfterB}`);
ok(decB.kind === "speed", "slow+correct triggers SPEED/fluency intervention", decB.kind);
ok(decB.kind !== "lesson", "slow+correct does NOT trigger a concept lesson", decB.kind);
ok(accAfterB >= accBeforeB, "correctness still credited (accuracy not punished)", `${accBeforeB} -> ${accAfterB}`);
ok(bucketB === "slow-correct", "classified as slow-correct", bucketB);
// the two paths must differ from each other
ok(decA1.kind !== decB.kind, "fast+wrong and slow+correct produce DIFFERENT interventions", `${decA1.kind} vs ${decB.kind}`);

// ---------- C. REPEATED RELATED FAILURE ----------
console.log("\nC. REPEATED RELATED FAILURE (~3 failures, same concept)");
let mC = emptyCoach();
const normalWrongMs = TARGET; // not careless-fast, so it must be the STREAK that fires
let decC = { kind: "none" };
for (let s = 1; s <= 3; s++) {
  decC = midSessionDecision(mC, SUB, false, normalWrongMs, s, false);
  mC = updateModel(mC, [at(false, normalWrongMs, Date.now() + s)], `c${s}`, "training");
  console.log(`   streak=${s} -> ${decC.kind}${decC.concept ? " (" + decC.concept + ")" : ""}`);
}
ok(decC.kind === "lesson", "3 related failures escalate to a MicroLesson", decC.kind);
ok(decC.kind !== decA1.kind && decC.kind !== decB.kind, "lesson path differs from accuracy and speed paths");

// ---------- D. RECOVERY ----------
console.log("\nD. RECOVERY (correct answers after the intervention)");
let decD = { kind: "x" };
for (let i = 0; i < 3; i++) {
  // streak resets to 0 on a correct answer in the session loop
  decD = midSessionDecision(mC, SUB, true, 9000, 0, false);
  mC = updateModel(mC, [at(true, 9000, Date.now() + 10 + i)], `d${i}`, "training");
}
const masteryD = Math.round((mC.subs[SUB].mastery || 0) * 100);
console.log(`   after 3 correct: decision=${decD.kind}  mastery=${masteryD}%`);
ok(decD.kind === "none", "coach exits intervention mode after recovery", decD.kind);
ok(decD.kind !== "lesson", "coach is NOT stuck in lesson mode forever", decD.kind);

// distinctness summary
const kinds = new Set([decA1.kind, decB.kind, decC.kind, decD.kind]);
console.log(`\ndistinct intervention outcomes across the four paths: ${[...kinds].join(", ")}`);
ok(kinds.size === 4, "all four paths produce DIFFERENT outcomes", `${kinds.size}/4 distinct`);

console.log("");
if (fails.length) { console.log(`R6 FAIL — ${fails.length} assertion(s): ${fails.join("; ")}`); process.exit(1); }
console.log("R6 DIRECT PASS — accuracy / speed / lesson / recovery paths all behave distinctly.");
