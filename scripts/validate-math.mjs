import { generateBatch } from "../lib/questions.ts";

function recompute(sub, prompt, answer) {
  const num = (s) => parseFloat(String(s).replace(",", "."));
  if (sub === "textaufgaben") {
    let m = prompt.match(/(\d+)%\s+von\s+(\d+)/);
    if (m) return String(Math.round((num(m[2]) * num(m[1])) / 100 * 10) / 10);
    m = prompt.match(/CHF\s+(\d+).*?(\d+)%\s+reduziert/);
    if (m) return String(num(m[1]) - (num(m[1]) * num(m[2])) / 100);
    m = prompt.match(/(\d+)\s+rote\s+und\s+(\d+)\s+blaue/);
    if (m) return String(num(m[1]) + num(m[2]));
    m = prompt.match(/Addiere:\s+(\d+)\/(\d+)\s+\+\s+(\d+)\/(\d+)/);
    if (m) { const sum = num(m[1]) + num(m[3]), den = num(m[2]); return sum > den ? Math.floor(sum / den) + " " + (sum % den) + "/" + den : sum + "/" + den; }
  }
  if (sub === "kopfrechnen") {
    let m = prompt.match(/(\d+)\s+(\w+)\s+=\s+\?\s+(\w+)/);
    if (m) { const f = { kg: 1000, m: 100, h: 60, t: 1000 }[m[2]]; if (f) return String(num(m[1]) * f); }
    m = prompt.match(/Kopfrechnen:\s+(\d+)\s+([+−×])\s+(\d+)/);
    if (m) { const a = num(m[1]), b = num(m[3]); return String(m[2] === "+" ? a + b : m[2] === "−" ? a - b : a * b); }
  }
  return null;
}

let checked = 0, wrong = 0;
for (const sub of ["textaufgaben", "kopfrechnen"]) {
  for (let seed = 1; seed <= 420; seed++) {
    const qs = generateBatch(sub, 2, 12, seed * 7919 + 3);
    for (const q of qs) {
      const exp = recompute(sub, q.prompt, q.answer);
      if (exp !== null) {
        checked++;
        if (String(exp).replace(",", ".") !== String(q.answer).replace(",", ".")) {
          wrong++; console.log("MATH MISMATCH:", sub, "|", q.prompt, "| gen=", q.answer, "| exp=", exp);
        }
      }
    }
  }
}
console.log(`Math recomputation checked ${checked} questions, mismatches: ${wrong}`);
console.log(wrong === 0 ? "MATH VALIDATION PASS" : "MATH VALIDATION FAIL");
process.exit(wrong === 0 ? 0 : 1);
