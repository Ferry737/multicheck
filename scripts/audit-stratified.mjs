// Phase 8: stratified human-audit sample. Covers every subskill x 3 difficulty
// bands, weighted toward the high semantic-risk generators named in the brief
// (alltagswissen, textverstaendnis, wortgruppen, prozesslogik, high-difficulty maths,
// memory/concentration instructions). Emits a numbered read sheet with marked answers.
import { generateBatch, GENERATORS } from "../lib/questions.ts";

const HIGH_RISK = ["alltagswissen", "textverstaendnis", "wortgruppen", "prozesslogik"];
const MATHS = ["kopfrechnen", "textaufgaben"];
const MEMORY = ["schilder_erinnern", "bilder_zaehlen", "symbole_entdecken"];
const BANDS = [20, 50, 85];

const plan = [];
for (const sub of Object.keys(GENERATORS)) {
  let perBand = 2;
  if (HIGH_RISK.includes(sub)) perBand = 4;
  else if (MATHS.includes(sub) || MEMORY.includes(sub)) perBand = 3;
  for (const d of BANDS) plan.push({ sub, d, n: sub === "kopfrechnen" || sub === "textaufgaben" ? (d === 85 ? perBand + 2 : perBand) : perBand });
}

let idx = 0;
const lines = [];
lines.push("# Stratified human audit sheet (Phase 8)");
lines.push("");
lines.push("Mark each item: PASS | WRONG | AMBIGUOUS | UNNATURAL | TOO_EASY | TOO_HARD | REPETITIVE");
lines.push("");
for (const { sub, d, n } of plan) {
  const items = generateBatch(sub, d, n, 1000 + idx * 7919);
  for (const q of items) {
    idx++;
    lines.push(`## ${idx}. ${sub} @ d=${d}${HIGH_RISK.includes(sub) ? " [high-risk]" : ""}`);
    // The passage/stimulus is a SEPARATE field. Omitting it made textverstaendnis
    // items look unanswerable ("Was ist noetig?" with no text) — an audit-sheet gap,
    // not a product defect: the student does see it.
    if (q.stimulus) lines.push(`- stimulus: ${q.stimulus}`);
    lines.push(`- prompt: ${q.prompt}`);
    if (q.options && q.options.length) {
      lines.push(`- options: ${q.options.map((o) => (String(o) === String(q.answer) ? `**${o}** <= keyed` : o)).join(" | ")}`);
    }
    lines.push(`- answer: **${q.answer}**`);
    if (q.explanation) lines.push(`- explanation: ${q.explanation}`);
    lines.push(`- verdict: [ ]`);
    lines.push("");
  }
}
lines.unshift(`Total items: ${idx}`);
console.log(lines.join("\n"));
