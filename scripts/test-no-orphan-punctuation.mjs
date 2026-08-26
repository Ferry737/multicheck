// Guard: no orphan punctuation in student-facing prompts or answers.
//
// BROWSER-FOUND DEFECT (production, satzbau struct 0): SENTENCES stored the
// sentence-final "." as a separate token, so shuffle() scattered it into the
// scrambled prompt ("Lieferung an Die kommt . morgen") — it read as a typo AND
// leaked position information. The correct answer also rendered as "… an ."
// with a space before the period.
//
// This guard is red-capable: it fails on the pre-fix tree (period as a token)
// and passes once punctuation is appended rather than shuffled.
import { generate, GENERATORS } from "../lib/questions.ts";

let checked = 0;
const fails = [];
const fail = (m) => { if (fails.length < 25) fails.push(m); };

// A space before terminal punctuation is invalid German — with three legitimate
// exceptions that are NOT defects:
//   "= ?"          math notation
//   "___ ?"        cloze notation
//   "A : B"        analogy notation (spaced colon is the convention)
// So: flag " ." / " ," / " ;" / " !" always. A trailing " ?" is legitimate in both
// math ("= ?") and analogy ("Metzger : ?") notation, so it is NOT flagged.
const ORPHAN = /\s[.,;!](\s|$)|\s:$/u;
// A lone punctuation TOKEN (surrounded by spaces) is an authoring bug. The
// analogy colon and the math/cloze question mark are excluded by construction.
const LONE = /(^|\s)[.,;](\s|$)/;

for (const sub of Object.keys(GENERATORS)) {
  const n = GENERATORS[sub].length;
  for (let si = 0; si < n; si++) {
    for (let seed = 1; seed <= 40; seed++) {
      const q = generate(sub, 50, seed * 7919 + si, si);
      if (!q) continue;
      checked++;
      if (ORPHAN.test(q.prompt)) fail(`${sub} si=${si}: ORPHAN PUNCT in prompt: ${JSON.stringify(q.prompt.slice(0, 110))}`);
      if (q.answer && ORPHAN.test(String(q.answer))) fail(`${sub} si=${si}: ORPHAN PUNCT in answer: ${JSON.stringify(String(q.answer).slice(0, 110))}`);
      for (const o of q.options || []) {
        if (ORPHAN.test(o)) fail(`${sub} si=${si}: ORPHAN PUNCT in option: ${JSON.stringify(o.slice(0, 110))}`);
      }
      // A lone punctuation token is always an authoring bug.
      if (LONE.test(q.prompt))
        fail(`${sub} si=${si}: LONE PUNCT TOKEN in prompt: ${JSON.stringify(q.prompt.slice(0, 110))}`);
    }
  }
}

console.log(`checked ${checked} generated items across ${Object.keys(GENERATORS).length} subskills`);
if (fails.length) {
  for (const f of fails) console.log("FAIL:", f);
  console.log(`\nFAIL — ${fails.length} orphan-punctuation defect(s). Punctuation must be appended, never shuffled as a token.`);
  process.exit(1);
}
console.log("PASS — no orphan or lone punctuation in any prompt, answer, or option.");
