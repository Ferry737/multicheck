// Phase 13: readiness adversarial cases A-E, run against the shipped coach.
import { emptyCoach, updateModel } from "../lib/coach.ts";

const day = (n) => Date.now() - (30 - n) * 86400000;
const A_ = (sub, correct, diff, mode = "training", extra = {}) => ({
  subskill: sub, area: "x", ts: day(1), correct, ms: correct ? 9000 : 16000,
  difficulty: diff, mode, ...extra,
});

function readiness(m) {
  const subs = Object.values(m.subs || {});
  if (!subs.length) return 0;
  const mast = subs.reduce((a, s) => a + (s.mastery || 0), 0) / subs.length;
  return Math.round(mast * 100);
}
function report(label, m, note) {
  const subs = Object.entries(m.subs || {});
  const per = subs.map(([k, s]) => `${k}=${Math.round((s.mastery || 0) * 100)}%`).join(" ");
  console.log(`${label.padEnd(46)} readiness=${String(readiness(m)).padStart(3)}%  ${note || ""}`);
  if (per) console.log(`   per-subskill: ${per}`);
}

const ALL = ["satzbau", "textverstaendnis", "textaufgaben", "kopfrechnen", "prozesslogik",
  "wortgruppen", "bilder_zaehlen", "symbole_entdecken", "schilder_erinnern",
  "sortierverfahren", "alltagswissen"];

// A — easy-question inflation: 20 easy correct answers only.
let A = emptyCoach();
for (let i = 0; i < 5; i++) A = updateModel(A, Array.from({ length: 4 }, () => A_("satzbau", true, 12)), `a${i}`, "training");
report("A easy inflation (20 easy correct, 1 subskill)", A, "expect: stays conservative");

// B — strong practice, poor simulation.
let B = emptyCoach();
for (let i = 0; i < 6; i++) B = updateModel(B, ALL.slice(0, 6).map((s) => A_(s, true, 65)), `b${i}`, "training");
const bBefore = readiness(B);
for (let i = 0; i < 3; i++) B = updateModel(B, ALL.slice(0, 6).map((s) => A_(s, false, 65, "full-sim", { unseen: true })), `bs${i}`, "full-sim");
report(`B strong practice -> poor simulation (was ${bBefore}%)`, B, "expect: falls materially");

// C — retention failure: correct now, fail delayed unseen review.
let C = emptyCoach();
for (let i = 0; i < 6; i++) C = updateModel(C, ALL.slice(0, 4).map((s) => A_(s, true, 55)), `c${i}`, "training");
const cBefore = readiness(C);
for (let i = 0; i < 4; i++) C = updateModel(C, ALL.slice(0, 4).map((s) => ({ ...A_(s, false, 55, "training", { unseen: true }), ts: day(25) })), `cr${i}`, "training");
report(`C retention failure (was ${cBefore}%)`, C, "expect: decreases / capped");

// D — narrow expert: perfect maths only, everything else untrained.
let D = emptyCoach();
for (let i = 0; i < 10; i++) D = updateModel(D, [A_("kopfrechnen", true, 85), A_("textaufgaben", true, 85)], `d${i}`, "training");
report("D narrow expert (maths only, 20 correct)", D, "expect: overall stays limited");

// E — genuine broad readiness across days, unseen, good speed, strong simulation.
let E = emptyCoach();
for (let d = 0; d < 12; d++) {
  E = updateModel(E, ALL.map((s) => ({ ...A_(s, true, 78, "training", { unseen: true }), ts: day(d + 1), ms: 7000 })), `e${d}`, "training");
}
for (let i = 0; i < 3; i++) E = updateModel(E, ALL.map((s) => ({ ...A_(s, true, 80, "full-sim", { unseen: true }), ms: 7000 })), `es${i}`, "full-sim");
report("E genuine broad strength + strong simulation", E, "expect: rises high");

console.log("\nverdicts:");
const a = readiness(A), b = readiness(B), c = readiness(C), dd = readiness(D), e = readiness(E);
const checks = [
  ["A stays conservative (<40%)", a < 40],
  ["B falls below its pre-simulation level", b < bBefore],
  ["C decreases or stays capped", c <= cBefore],
  ["D overall stays limited (<45%)", dd < 45],
  ["E rises high (>=60%)", e >= 60],
];
let ok = true;
for (const [label, pass] of checks) { console.log(`  ${pass ? "PASS" : "FAIL"} — ${label}`); if (!pass) ok = false; }
console.log(`\nA=${a}% B=${b}% (from ${bBefore}%) C=${c}% (from ${cBefore}%) D=${dd}% E=${e}%`);
console.log(ok ? "\nPASS — readiness behaves conservatively and responds to real evidence." : "\nFAIL — readiness does not respond correctly.");
if (!ok) process.exit(1);
