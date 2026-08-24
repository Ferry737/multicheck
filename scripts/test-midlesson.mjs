import { midSessionDecision, emptyCoach } from "../lib/coach.ts";

const m = emptyCoach();
let dec;
const cases = [
  ["wrong#1 slow", "satzbau", false, 7000, 1, false],
  ["wrong#2 slow", "satzbau", false, 7000, 2, false],
  ["wrong#3 slow", "satzbau", false, 7000, 3, false],
];
for (const [label, sub, correct, ms, streak, speed] of cases) {
  dec = midSessionDecision(m, sub, correct, ms, streak, speed);
  console.log(label, "->", dec.kind, dec.concept ?? "");
}
console.log("LESSON TRIGGERED:", dec.kind === "lesson" ? "PASS ✅" : "FAIL ❌");
const acc = midSessionDecision(m, "satzbau", false, 2000, 1, false);
console.log("Fast+wrong ->", acc.kind, "(expect accuracy)");
const spd = midSessionDecision(m, "satzbau", true, 26000, 0, false);
console.log("Slow+correct ->", spd.kind, "(expect speed)");
const ok = midSessionDecision(m, "satzbau", true, 3000, 0, false);
console.log("Correct+fast ->", ok.kind, "(expect none)");
