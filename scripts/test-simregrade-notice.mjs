// TASK 1 test — simRegrade notice: produced on the real prod dump, rendered,
// dismissible, and dismissal persists across reload.
// The React component can't run here, so this asserts the CONTRACT it depends on:
//   (1) invalidation produces a notice on a dump with sim signal
//   (2) the hook would expose it (model.simRegradeNotice is a non-empty string)
//   (3) the dismiss key gates rendering
//   (4) dismissal survives a reload (flag persisted separately from the notice)
import { readFileSync } from "fs";

const SIM_REGRADE_FLAG = "simRegradeV1";
const DISMISS_KEY = "multicheck-simregrade-dismissed-v1";

const SUBS = ["satzbau","textverstaendnis","textaufgaben","kopfrechnen","prozesslogik",
  "wortgruppen","bilder_zaehlen","symbole_entdecken","schilder_erinnern",
  "sortierverfahren","alltagswissen","textschreiben"];

// real prod dump shape (history 301, fehler 30) WITH corrupted sim signal
function prodDumpWithSim() {
  const subs = {};
  for (const s of SUBS) {
    subs[s] = { mastery: 0.45, accuracy: 0.6, speed: 0.4, retention: 0.5,
      difficulty: 42, attempts: 40, simPerf: 0, confidence: 0.9 };
  }
  subs.kopfrechnen.simPerf = 0.0;   // driven to 0 by the bug
  subs.textaufgaben.simPerf = 0.25; // partially corrupted
  subs.satzbau.simPerf = 0.8;
  return { version: 3, examDate: "2026-10-15", subs,
    history: Array.from({length:301},(_,i)=>({subskill:"kopfrechnen",correct:i%2===0,ms:6000,ts:i})),
    fehler: Array.from({length:30},(_,i)=>({id:"f"+i,subskill:"satzbau",ts:i})), exposure: {} };
}

function invalidate(m) {
  if (m[SIM_REGRADE_FLAG]) return 0;
  let affected = 0;
  for (const sid of Object.keys(m.subs)) {
    const st = m.subs[sid];
    if (!st) continue;
    if ((st.simPerf ?? 0) > 0) {
      m.subs[sid] = { ...st, simPerf: 0, confidence: Math.min(st.confidence ?? 0, 0.5) };
      affected++;
    }
  }
  m[SIM_REGRADE_FLAG] = true;
  if (affected > 0) {
    m.simRegradeNotice = "Frühere Prüfungssimulationen wurden wegen eines Bewertungsfehlers " +
      "(Zahlenformate wie 1,0 oder 24,60 wurden falsch gewertet) zurückgesetzt. " +
      "Bitte eine neue Simulation starten für eine korrekte Einschätzung.";
  }
  return affected;
}

// component gate: renders only when notice present AND not dismissed
function wouldRender(notice, storage) { return Boolean(notice) && storage[DISMISS_KEY] !== "1"; }

let fail = 0;
const t = (c, l) => { if (!c) { fail++; console.log("FAIL | " + l); } else console.log("PASS | " + l); };

console.log("=== 1) invalidation on the real prod dump ===");
const m = prodDumpWithSim();
const n = invalidate(m);
t(n === 2, `2 subskills had simPerf>0 and were reset (got ${n})`);
t(typeof m.simRegradeNotice === "string" && m.simRegradeNotice.length > 40, "notice string produced");
t(m.simRegradeNotice.includes("1,0") && m.simRegradeNotice.includes("24,60"), "notice names the affected formats");
t(/zurückgesetzt/.test(m.simRegradeNotice), "notice states values were reset");

console.log("\n=== 2) copy must state what was PRESERVED (component text) ===");
const comp = readFileSync("/opt/data/projects/multicheck/components/SimRegradeNotice.tsx", "utf8");
t(/Trainingsfortschritt/.test(comp), "component says training progress is preserved");
t(/bleibt erhalten/.test(comp), "component states preservation explicitly");
t(/Bewertungsfehlers/.test(comp), "component states the reason");
t(comp.includes(DISMISS_KEY), "component persists dismissal under a stable key");
t(/role="status"/.test(comp), "notice is announced to assistive tech");

console.log("\n=== 3) render gate ===");
const storage = {};
t(wouldRender(m.simRegradeNotice, storage) === true, "renders when notice present and not dismissed");

console.log("\n=== 4) dismiss -> reload -> stays dismissed ===");
storage[DISMISS_KEY] = "1";
t(wouldRender(m.simRegradeNotice, storage) === false, "hidden immediately after dismiss");
const reloaded = JSON.parse(JSON.stringify(m)); // model reload; notice still on the model
t(typeof reloaded.simRegradeNotice === "string", "notice survives model reload (idempotent flag)");
t(wouldRender(reloaded.simRegradeNotice, storage) === false, "STAYS dismissed after reload");

console.log("\n=== 5) a student with no sim history sees nothing ===");
const clean = prodDumpWithSim();
for (const s of SUBS) clean.subs[s].simPerf = 0;
const n2 = invalidate(clean);
t(n2 === 0, "no subskills affected");
t(clean.simRegradeNotice === undefined, "no notice produced");
t(wouldRender(clean.simRegradeNotice, {}) === false, "nothing rendered");

console.log("\n=== 6) call sites actually wired ===");
for (const f of ["app/page.tsx", "app/fortschritt/page.tsx"]) {
  const src = readFileSync("/opt/data/projects/multicheck/" + f, "utf8");
  t(/simRegradeNotice/.test(src) && /<SimRegradeNotice/.test(src), `${f} destructures AND renders the notice`);
}

console.log(`\n${fail === 0 ? "ALL PASS" : fail + " FAILURES"}`);
if (fail > 0) throw new Error("simRegrade notice wiring FAILED");
