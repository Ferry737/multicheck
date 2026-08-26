// REGRESSION TEST for the decimal-input P0 (mirrors Trainer.tsx after fix).
// Must accept numerically-equal answers AND still reject genuinely wrong ones.
const norm = (s) => s.replace(/\s/g, "").replace(/,/g, ".").toLowerCase();
const asNumber = (s) => {
  const cleaned = s.trim().replace(/['\u2019\s]/g, "").replace(/,/g, ".");
  if (!/^[+-]?\d*\.?\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};
const numericMatch = (a, b) => {
  const na = asNumber(a), nb = asNumber(b);
  if (na === null || nb === null) return false;
  return Math.abs(na - nb) < 1e-9;
};
const isCorrect = (input, answer, kind = "input") =>
  norm(input) === norm(answer) ||
  (kind === "choice" && input === answer) ||
  (kind !== "choice" && numericMatch(input, answer));

let fail = 0;
function expect(input, answer, want, label, kind = "input") {
  const got = isCorrect(input, answer, kind);
  const ok = got === want;
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"} | "${input}" vs "${answer}" -> ${got ? "ACCEPT" : "REJECT"} (want ${want ? "ACCEPT" : "REJECT"}) ${label}`);
}

console.log("=== MUST ACCEPT (numerically equal) ===");
expect("1", "1", true, "identical");
expect("1.0", "1", true, "trailing .0");
expect("1,0", "1", true, "comma decimal");
expect("1.00", "1", true, "trailing zeros");
expect("24.6", "24.6", true, "identical decimal");
expect("24,6", "24.6", true, "comma for dot");
expect("24,60", "24.6", true, "comma + trailing zero");
expect("1'234", "1234", true, "Swiss apostrophe thousands");
expect("1 234", "1234", true, "space thousands");
expect("0.5", "0,5", true, "dot vs comma answer");
expect("-3", "-3.0", true, "negative equal");

console.log("\n=== MUST REJECT (genuinely wrong) ===");
expect("2", "1", false, "different integer");
expect("24.7", "24.6", false, "off by 0.1");
expect("12", "1.2", false, "decimal shift");
expect("10", "1", false, "factor of 10");
expect("1.0001", "1", false, "beyond tolerance");
expect("", "1", false, "empty input");
expect("abc", "1", false, "non-numeric");

console.log("\n=== TEXT answers must be unaffected ===");
expect("Die Lieferung kommt morgen an.", "Die Lieferung kommt morgen an.", true, "exact sentence");
expect("die lieferung kommt morgen an.", "Die Lieferung kommt morgen an.", true, "case-insensitive");
expect("Falscher Satz.", "Die Lieferung kommt morgen an.", false, "wrong sentence");
expect("12, 34, 56", "12, 34, 56", true, "sort list exact");
expect("12,34,56", "12, 34, 56", true, "sort list no spaces");
expect("56, 34, 12", "12, 34, 56", false, "wrong sort order");

console.log("\n=== CHOICE answers ===");
expect("Ja", "Ja", true, "choice exact", "choice");
expect("Nein", "Ja", false, "choice wrong", "choice");

console.log(`\n${fail === 0 ? "ALL PASS" : fail + " FAILURES"}`);
if (fail > 0) throw new Error("decimal-input regression FAILED");

// ===== EXAM PATH: lib/exam.ts gradeAnswer must match Trainer semantics =====
const examMod = await import("/opt/data/projects/multicheck/lib/exam.ts");
if (typeof examMod.gradeAnswer !== "function") throw new Error("exam.gradeAnswer missing");
let exFail = 0;
function expectExam(input, answer, want, label, kind = "input") {
  const got = examMod.gradeAnswer(input, answer, kind);
  const ok = got === want;
  if (!ok) exFail++;
  console.log(`${ok ? "PASS" : "FAIL"} | EXAM "${input}" vs "${answer}" -> ${got ? "ACCEPT" : "REJECT"} (want ${want ? "ACCEPT" : "REJECT"}) ${label}`);
}
console.log("\n=== EXAM grading parity ===");
expectExam("1.0", "1", true, "trailing .0");
expectExam("1,0", "1", true, "comma decimal");
expectExam("24,60", "24.6", true, "comma + trailing zero");
expectExam("1'234", "1234", true, "Swiss thousands");
expectExam("2", "1", false, "wrong integer");
expectExam("24.7", "24.6", false, "off by 0.1");
expectExam("abc", "1", false, "non-numeric");
expectExam("Ja", "Ja", true, "choice exact", "choice");
expectExam("Nein", "Ja", false, "choice wrong", "choice");
console.log(`\nEXAM ${exFail === 0 ? "ALL PASS" : exFail + " FAILURES"}`);
if (exFail > 0) throw new Error("exam grading parity FAILED");
