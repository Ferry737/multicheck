// Targeted probe for the R10 transient integrity hit.
//
// During the live exam one loop reported fb=true (a ✓/✗/"Richtig:" pattern) in
// section 5, which could not be reproduced on re-probe. Two possible causes:
//   (a) real feedback leaked into exam mode  -> P0
//   (b) the ✓/✗ glyph appears in QUESTION CONTENT (schilder/symbole items use marks)
// This settles it offline by scanning every generated item for feedback-looking
// patterns in the CONTENT itself, which is what a page-text regex cannot distinguish.
import { generateBatch, GENERATORS } from "../lib/questions.ts";

const PATTERNS = [
  ["✓", /✓/],
  ["✗", /✗/],
  ["Richtig:", /Richtig:/],
  ["Falsch", /Falsch/],
];

let checked = 0;
const hits = [];
for (const sub of Object.keys(GENERATORS)) {
  for (const d of [20, 50, 85]) {
    for (const seed of [7, 19, 31, 43, 57]) {
      for (const q of generateBatch(sub, d, 12, seed * 104729)) {
        checked++;
        const blob = [q.prompt, q.stimulus, ...(q.options || []), String(q.answer)].filter(Boolean).join(" ~ ");
        for (const [name, re] of PATTERNS) {
          if (re.test(blob)) hits.push({ sub, d, name, where: blob.slice(0, 130) });
        }
      }
    }
  }
}

console.log(`scanned ${checked} generated items for feedback-looking glyphs in CONTENT`);
if (hits.length) {
  const bySub = {};
  for (const h of hits) bySub[h.sub] = (bySub[h.sub] || 0) + 1;
  console.log(`content hits: ${hits.length}  by subskill: ${JSON.stringify(bySub)}`);
  for (const h of hits.slice(0, 6)) console.log(`  ${h.sub} d=${h.d} pattern=${h.name}  ${h.where}`);
  console.log("\nCONCLUSION: these glyphs occur in QUESTION CONTENT, so a page-text regex for");
  console.log("✓/✗ cannot prove feedback leaked. The exam-integrity probe must assert on the");
  console.log("absence of a FEEDBACK ELEMENT, not on glyphs anywhere in the page text.");
} else {
  console.log("no feedback-looking glyphs in any generated content.");
  console.log("CONCLUSION: a ✓/✗ on the exam page would therefore indicate REAL feedback.");
}
