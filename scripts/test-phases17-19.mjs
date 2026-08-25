// scripts/test-phases17-19.mjs
import { emptyCoach, twoMonthProgram } from "/opt/data/projects/multicheck/lib/coach.ts";
import { scoreWriting, personalizeWritingFeedback } from "/opt/data/projects/multicheck/lib/writing.ts";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("  FAIL:", m); } };

console.log("[17] two-month program");
{
  const m = emptyCoach("2026-10-15");
  const prog = twoMonthProgram(m);
  ok(prog.length >= 2 && prog.length <= 8, `weeks: ${prog.length}`);
  ok(prog.every(p => p.minutesPerDay >= 20), "each week has a daily-minute target");
  ok(prog[0].label === "Grundlagen" || prog[prog.length-1].label === "Prüfungssimulation", "phases shift toward simulation near exam");
}

console.log("[19] Textschreiben rubric");
{
  const good = "Ich habe heute gelernt. Zuerst habe ich Mathe geübt und dann Deutsch. Das war gut, weil ich viel verstanden habe.";
  const r1 = scoreWriting(good, "Beschreibe deinen Tag");
  ok(r1.overall > 50, `good text scores ${r1.overall}`);
  ok(r1.strengths.length > 0, "strengths identified");

  const bad = "ja";
  const r2 = scoreWriting(bad, "Beschreibe deinen Tag");
  ok(r2.overall < r1.overall, "bad text scores lower");
  ok(r2.improvements.length > 0, "improvements identified");

  const ai = personalizeWritingFeedback(r1.feedback, "Versuch mehr Fachwörter.");
  ok(ai.some(l => l.includes("Coach (KI)")), "AI personalization appended");
  const noAi = personalizeWritingFeedback(r1.feedback, null);
  ok(noAi.length === r1.feedback.length, "no AI -> deterministic feedback unchanged");
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
