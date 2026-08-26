// TASK 4 test — examDate drives the arc, and the near-exam window front-loads
// simulation instead of Grundlagen.
import { emptyCoach, twoMonthProgram } from "/opt/data/projects/multicheck/lib/coach.ts";
import { readFileSync } from "fs";

function arcFor(daysLeft) {
  const examDate = new Date(Date.now() + daysLeft * 86400000).toISOString().slice(0, 10);
  const m = { ...emptyCoach(), examDate };
  const p = twoMonthProgram(m);
  return { weeks: p.length, week1: p[0].label, min: p[0].minutesPerDay, arc: p.map(x => x.label).join(" -> ") };
}

let fail = 0;
const t = (c, l) => { if (!c) { fail++; console.log("FAIL | " + l); } else console.log("PASS | " + l); };

console.log("=== THE FIVE ARCS (daysLeft = 7 / 14 / 21 / 50 / 111) ===\n");
for (const d of [7, 14, 21, 50, 111]) {
  const r = arcFor(d);
  console.log(`daysLeft=${String(d).padStart(3)}  weeks=${r.weeks}  week1=${r.week1} (${r.min} min/day)`);
  console.log(`   ${r.arc}\n`);
}

console.log("=== ASSERTIONS ===");
const d7 = arcFor(7), d14 = arcFor(14), d21 = arcFor(21), d50 = arcFor(50), d111 = arcFor(111);

t(d7.week1 === "Prüfungssimulation", `7 days -> week1 is simulation (got ${d7.week1})`);
t(d14.week1 === "Prüfungssimulation", `14 days -> week1 is simulation (got ${d14.week1})`);
t(!d7.arc.includes("Grundlagen"), "7 days: NO Grundlagen phase at all");
t(!d14.arc.includes("Grundlagen"), "14 days: NO Grundlagen phase at all");
t(d21.week1 === "Grundlagen", `21 days -> foundations still lead (got ${d21.week1})`);
t(d50.week1 === "Grundlagen", `50 days -> foundations lead (got ${d50.week1})`);
t(d50.arc.includes("Prüfungssimulation"), "50 days: arc still reaches simulation");
t(d111.arc === d50.arc, "111 days == 50 days (weeks clamps at 8 — documented P2)");

console.log("\n=== the defect this fixes ===");
console.log(`  BEFORE: a student 10 days out was served week1='Grundlagen' and`);
console.log(`          never reached simulation before the real exam.`);
const d10 = arcFor(10);
console.log(`  AFTER : daysLeft=10 -> week1='${d10.week1}', arc=${d10.arc}`);
t(d10.week1 === "Prüfungssimulation", "10 days out now front-loads simulation");

console.log("\n=== settings route exists and is reachable ===");
const page = readFileSync("/opt/data/projects/multicheck/app/einstellungen/page.tsx", "utf8");
t(/type="date"/.test(page), "settings page has a date input");
t(/save\(\{ \.\.\.model, examDate: v \}\)/.test(page), "date change persists examDate to the model");
t(/twoMonthProgram/.test(page), "settings page previews the resulting plan");
const shell = readFileSync("/opt/data/projects/multicheck/components/AppShell.tsx", "utf8");
t(/\/einstellungen/.test(shell), "route is linked in the app nav (reachable, not orphaned)");

console.log(`\n${fail === 0 ? "ALL PASS" : fail + " FAILURES"}`);
if (fail > 0) throw new Error("exam date phase logic FAILED");
