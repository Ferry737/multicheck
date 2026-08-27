// Phase 21: does a poor simulation in ONE area actually change the FUTURE PLAN?
// Driven through the shipped coach API (updateModel + the planner), not by poking
// localStorage — storage injection does not drive the plan, so it is not evidence.
import { emptyCoach, updateModel } from "../lib/coach.ts";
import * as coach from "../lib/coach.ts";

const ALL = ["satzbau", "textverstaendnis", "textaufgaben", "kopfrechnen", "prozesslogik",
  "wortgruppen", "bilder_zaehlen", "symbole_entdecken", "schilder_erinnern",
  "sortierverfahren", "alltagswissen"];
const MATHS = ["textaufgaben", "kopfrechnen"];

const at = (sub, correct, ts, mode = "training") => ({
  subskill: sub, area: MATHS.includes(sub) ? "mathematik" : "x", ts, correct,
  ms: correct ? 9000 : 20000, difficulty: 55, mode, unseen: true,
});

// Build a learner who is uniformly decent everywhere.
let m = emptyCoach();
for (let d = 0; d < 8; d++) {
  m = updateModel(m, ALL.map((s) => at(s, true, Date.now() - (10 - d) * 86400000)), `warm${d}`, "training");
}

const planner = coach.decideToday || coach.composeSession;
function planOf(model) {
  if (typeof planner === "function") {
    try { return planner(model); } catch (e) { return { error: String(e).slice(0, 80) }; }
  }
  return null;
}
function mastery(model, sub) { const s = model.subs[sub]; return s ? Math.round((s.mastery || 0) * 100) : 0; }

const before = {
  kopfrechnen: mastery(m, "kopfrechnen"), textaufgaben: mastery(m, "textaufgaben"),
  satzbau: mastery(m, "satzbau"),
  conf_kopf: m.subs.kopfrechnen ? Number((m.subs.kopfrechnen.confidence || 0).toFixed(3)) : null,
  plan: planOf(m),
};

// Now: a POOR simulation, maths only.
for (let i = 0; i < 3; i++) {
  m = updateModel(m, MATHS.map((s) => at(s, false, Date.now(), "full-sim")), `sim${i}`, "full-sim");
}

const after = {
  kopfrechnen: mastery(m, "kopfrechnen"), textaufgaben: mastery(m, "textaufgaben"),
  satzbau: mastery(m, "satzbau"),
  conf_kopf: m.subs.kopfrechnen ? Number((m.subs.kopfrechnen.confidence || 0).toFixed(3)) : null,
  plan: planOf(m),
};

console.log("PHASE 21 — simulation -> future plan");
console.log(`planner function found: ${typeof planner === "function" ? (planner.name || "yes") : "NO (plan comparison NOT RUN)"}`);
console.log(`\nmaths mastery  kopfrechnen ${before.kopfrechnen}% -> ${after.kopfrechnen}%   textaufgaben ${before.textaufgaben}% -> ${after.textaufgaben}%`);
console.log(`control (satzbau, untouched)        ${before.satzbau}% -> ${after.satzbau}%`);
console.log(`kopfrechnen confidence  ${before.conf_kopf} -> ${after.conf_kopf}`);

const mathsDropped = after.kopfrechnen < before.kopfrechnen && after.textaufgaben < before.textaufgaben;
const controlHeld = after.satzbau >= before.satzbau - 2;
console.log(`\n${mathsDropped ? "PASS" : "FAIL"} — maths mastery fell after the poor simulation`);
console.log(`${controlHeld ? "PASS" : "FAIL"} — untouched control subskill did not fall (change is targeted, not global)`);

if (before.plan && after.plan && !before.plan.error) {
  const b = JSON.stringify(before.plan), a = JSON.stringify(after.plan);
  const changed = b !== a;
  const bMaths = (b.match(/kopfrechnen|textaufgaben/g) || []).length;
  const aMaths = (a.match(/kopfrechnen|textaufgaben/g) || []).length;
  console.log(`\nplan changed: ${changed}   maths mentions in plan: ${bMaths} -> ${aMaths}`);
  console.log(`${changed && aMaths >= bMaths ? "PASS" : "FAIL"} — plan responds and maths priority does not decrease`);
} else {
  console.log("\nplan comparison: NOT RUN — no planner export found on lib/coach.ts");
  console.log("(mastery/confidence response above is measured; the plan-selection claim is NOT verified here)");
}
if (!mathsDropped || !controlHeld) process.exit(1);
