// TASK 1 test — one-time sim-regrade invalidation.
// Mirrors the useLearner load-path logic (hook can't run outside React).
const SIM_REGRADE_FLAG = "simRegradeV1";

function invalidate(m) {
  const anyM = m;
  if (!anyM[SIM_REGRADE_FLAG]) {
    let affected = 0;
    for (const sid of Object.keys(m.subs)) {
      const st = m.subs[sid];
      if (!st) continue;
      if ((st.simPerf ?? 0) > 0) {
        m.subs[sid] = { ...st, simPerf: 0, confidence: Math.min(st.confidence ?? 0, 0.5) };
        affected++;
      }
    }
    anyM[SIM_REGRADE_FLAG] = true;
    if (affected > 0) anyM.simRegradeNotice = "Frühere Prüfungssimulationen wurden ... zurückgesetzt.";
    return affected;
  }
  return 0;
}

let fail = 0;
function check(cond, label) { if (!cond) { fail++; console.log("FAIL | " + label); } else console.log("PASS | " + label); }

// --- model with corrupted sim signal (as the buggy grader would leave it) ---
const m = {
  subs: {
    kopfrechnen:  { mastery: 0.047, accuracy: 0.6, simPerf: 0.0,  confidence: 0.9 },
    textaufgaben: { mastery: 0.047, accuracy: 0.6, simPerf: 0.25, confidence: 0.9 },
    satzbau:      { mastery: 0.50,  accuracy: 0.7, simPerf: 0.8,  confidence: 0.8 },
    wortgruppen:  { mastery: 0.55,  accuracy: 0.7, simPerf: 0,    confidence: 0.3 },
  },
};

const trainingMasteryBefore = { ...Object.fromEntries(Object.entries(m.subs).map(([k,v]) => [k, v.mastery])) };
const n1 = invalidate(m);

console.log("=== first run ===");
check(n1 === 2, `affected 2 subskills with simPerf>0 (got ${n1})`);
check(m.subs.textaufgaben.simPerf === 0, "textaufgaben simPerf reset to 0");
check(m.subs.satzbau.simPerf === 0, "satzbau simPerf reset to 0");
check(m.subs.satzbau.confidence <= 0.5, `satzbau confidence capped (got ${m.subs.satzbau.confidence})`);
check(m.subs.wortgruppen.confidence === 0.3, "untouched subskill keeps confidence");
check(typeof m.simRegradeNotice === "string", "notice recorded (not silent)");
check(m[SIM_REGRADE_FLAG] === true, "flag set");

console.log("\n=== training-derived mastery must be PRESERVED ===");
for (const k of Object.keys(trainingMasteryBefore)) {
  check(m.subs[k].mastery === trainingMasteryBefore[k], `${k} mastery unchanged (${m.subs[k].mastery})`);
}

console.log("\n=== idempotency: second run must be a no-op ===");
m.subs.satzbau.simPerf = 0.7; // student ran a NEW (correctly graded) sim
const n2 = invalidate(m);
check(n2 === 0, `second run affects 0 (got ${n2})`);
check(m.subs.satzbau.simPerf === 0.7, "new post-fix sim signal is NOT wiped");

console.log(`\n${fail === 0 ? "ALL PASS" : fail + " FAILURES"}`);
if (fail > 0) throw new Error("sim-regrade invalidation FAILED");
