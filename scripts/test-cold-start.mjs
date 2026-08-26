// TASK 3 test — cold start makes ZERO subskill-specific claims, and claims
// appear ONLY for the subskill that earned evidence (>=8 attempts, >=2 sessions).
import { emptyCoach, updateModel, composeSession, explainDecision } from "/opt/data/projects/multicheck/lib/coach.ts";
import { weeklyPlan } from "/opt/data/projects/multicheck/lib/exam.ts";
import { hasEvidence, hasSpeedEvidence, isReviewDue, EVIDENCE } from "/opt/data/projects/multicheck/lib/evidence.ts";
import { ALL_SUBSKILLS } from "/opt/data/projects/multicheck/lib/curriculum.ts";

let fail = 0;
const t = (c, l) => { if (!c) { fail++; console.log("FAIL | " + l); } else console.log("PASS | " + l); };

const NAMES = ALL_SUBSKILLS.map(s => s.name);
function claimsIn(text) { return NAMES.filter(n => text.includes(n)); }

console.log("=== 1) FRESH STORAGE: zero subskill-specific claims ===");
const fresh = emptyCoach();
const p0 = composeSession(fresh, 22);
const w0 = weeklyPlan(fresh);

console.log("  session why :", p0.why);
console.log("  weekly today:", w0.today);
console.log("  weekly notes:", JSON.stringify(w0.notes));

t(claimsIn(p0.why).length === 0, `session 'why' names no subskill (found: ${claimsIn(p0.why).join(", ") || "none"})`);
t(!/braucht mehr Tempo/.test(p0.why), "no 'braucht mehr Tempo' fabrication");
t(!/Wiederholung\(en\) fällig/.test(p0.why), "no 'Wiederholung(en) fällig' fabrication");
t(/Diagnose läuft/.test(p0.why), "states diagnosis is running instead");
t(claimsIn(w0.today).length === 0, `weeklyPlan today names no subskill (found: ${claimsIn(w0.today).join(", ") || "none"})`);
t(!/\d+ schwache Bereiche/.test(w0.notes.join(" ")), "no '12 schwache Bereiche' fabrication");
t(w0.notes.join(" ").includes("noch nicht bewertet"), "says 'noch nicht bewertet'");

console.log("\n=== 2) no speed drills before a timed baseline ===");
const speedBlocks = (p0.blocks || []).filter(b => b.mode === "speed");
t(speedBlocks.length === 0, `zero speed-mode blocks at t=0 (got ${speedBlocks.length})`);

console.log("\n=== 3) per-block explainDecision does not report a measured 0% ===");
for (const b of (p0.blocks || []).slice(0, 3)) {
  const d = explainDecision(fresh, b);
  console.log(`    [${b.subskill}] ${d}`);
  t(!/0% Beherrschung/.test(d), `${b.subskill}: no '0% Beherrschung'`);
  t(/noch nicht bewertet/.test(d), `${b.subskill}: says 'noch nicht bewertet'`);
}

console.log("\n=== 4) evidence thresholds behave ===");
t(hasEvidence({ attempts: 7, sessions: 5 }) === false, "7 attempts is NOT enough");
t(hasEvidence({ attempts: 8, sessions: 1 }) === false, "8 attempts in 1 session is NOT enough");
t(hasEvidence({ attempts: 8, sessions: 2 }) === true, `${EVIDENCE.minAttempts} attempts across ${EVIDENCE.minSessions} sessions IS enough`);
t(hasSpeedEvidence({ attempts: 8, sessions: 2, recent: [{ms:1},{ms:1},{ms:1},{ms:1}] }) === false, "4 timed attempts is NOT enough for a speed claim");
t(hasSpeedEvidence({ attempts: 8, sessions: 2, recent: Array(5).fill({ms:1000}) }) === true, "5 timed attempts IS enough");
t(isReviewDue({ nextReview: 0 }) === false, "nextReview=0 is NOT overdue");
t(isReviewDue({ nextReview: Date.now() - 1000 }) === true, "a real past nextReview IS due");

console.log("\n=== 5) after 8 attempts across 2 sessions in ONE subskill ===");
let m = emptyCoach();
const TARGET = "kopfrechnen";
for (let s = 0; s < 2; s++) {
  const atts = [];
  for (let i = 0; i < 4; i++) {
    atts.push({ subskill: TARGET, area: "mathematik", ts: Date.now() + s * 86400000 + i * 1000,
      correct: i % 4 !== 0, ms: 20000, difficulty: 40, mode: "adaptive", templateKey: "k", structHash: "h" + i });
  }
  m = updateModel(m, atts, "sess-" + s, "adaptive");
}
const st = m.subs[TARGET];
console.log(`  ${TARGET}: attempts=${st.attempts} sessions=${st.sessions} speed=${st.speed.toFixed(3)} timed=${(st.recent||[]).filter(r=>r.ms>0).length}`);
t(hasEvidence(st) === true, `${TARGET} now HAS evidence`);

const p1 = composeSession(m, 22);
console.log("  session why :", p1.why);
const named = claimsIn(p1.why);
t(named.length > 0, `a claim now appears (named: ${named.join(", ") || "none"})`);
const targetName = ALL_SUBSKILLS.find(s => s.id === TARGET).name;
const others = named.filter(n => n !== targetName);
t(others.length === 0, `ONLY the evidenced subskill is named (extra: ${others.join(", ") || "none"})`);

console.log("\n=== 6) unevidenced subskills still make no claim ===");
const unevidenced = ALL_SUBSKILLS.filter(s => s.id !== TARGET && !hasEvidence(m.subs[s.id]));
t(unevidenced.length > 0, `${unevidenced.length} subskills remain unevidenced`);
for (const s of unevidenced.slice(0, 2)) {
  const d = explainDecision(m, { subskill: s.id, mode: "adaptive", count: 2, minutes: 4, why: "" });
  t(/noch nicht bewertet/.test(d), `${s.id}: still 'noch nicht bewertet'`);
}

console.log(`\n${fail === 0 ? "ALL PASS" : fail + " FAILURES"}`);
if (fail > 0) throw new Error("cold-start evidence gate FAILED");
