// PHASE 1.1 — STORAGE MIGRATION. Simulate OLD production storage (6f480b7 shape)
// loaded by NEW engine (16251e5). Old shape: exposure = { skill: ["t12345", ...] }
// (seed keys, capped 12). New engine expects exposure[id]=string[] structHashes,
// exposure[id+":rr"]=number, exposure[id+":p"]=string[], exposure[id+":pa"]=string[].
import { emptyCoach, updateModel, composeSubskillQuestions, composeSession } from "/opt/data/projects/multicheck/lib/coach.ts";

const SUBS = ["satzbau","textverstaendnis","textaufgaben","kopfrechnen","prozesslogik",
  "wortgruppen","bilder_zaehlen","symbole_entdecken","schilder_erinnern",
  "sortierverfahren","alltagswissen","textschreiben"];

// ---- Build an OLD-SHAPE model the way the deployed build would have written it ----
function oldShapeModel() {
  const base = emptyCoach();
  const m = JSON.parse(JSON.stringify(base));
  m.version = 3;
  m.examDate = "2026-10-15";
  // OLD exposure: seed keys per skill, NOT structHashes, NO :rr/:p/:pa keys
  m.exposure = {};
  for (const s of SUBS) {
    m.exposure[s] = ["t12345", "t67890", "t24680", "t13579"];
  }
  // realistic accumulated history
  for (const s of SUBS) {
    if (!m.subs[s]) continue;
    m.subs[s].attempts = 40;
    m.subs[s].mastery = 0.45;
    m.subs[s].accuracy = 0.6;
    m.subs[s].difficulty = 42;
    m.subs[s].recent = Array.from({length:25},(_,i)=>({correct:i%3!==0, ms:7000, diff:40, ts:i, mode:"adaptive"}));
  }
  m.history = Array.from({length:300},(_,i)=>({subskill:"kopfrechnen",correct:i%2===0,ms:6000,ts:i}));
  m.fehler = Array.from({length:30},(_,i)=>({id:"f"+i,subskill:"satzbau",prompt:"p"+i,correctAnswer:"a",studentAnswer:"b",ts:i}));
  return m;
}

function metricSane(v, label, out) {
  if (v === undefined || v === null) { out.push(`${label}=${v}`); return; }
  if (typeof v === "number" && !Number.isFinite(v)) { out.push(`${label}=${v} (NaN/Inf)`); return; }
  if (typeof v === "number" && (v < 0 || v > 1.0001) && label.includes("mastery")) out.push(`${label}=${v} out of range`);
}

function exercise(label, mutate) {
  const problems = [];
  let m;
  try {
    m = mutate();
  } catch (e) {
    console.log(`${label}: CRASH during load-shape construction: ${e.message}`);
    return false;
  }
  try {
    // 1) planner must work
    const plan = composeSession(m, 22);
    if (!plan || !Array.isArray(plan.blocks)) problems.push("composeSession returned no blocks");

    // 2) serve items across several subskills, chaining state
    let served = 0;
    for (const b of (plan.blocks || []).slice(0, 6)) {
      const res = composeSubskillQuestions(m, b.subskill, 3, b.mode, 777000 + served);
      m = res.model;
      for (const q of res.questions) {
        served++;
        if (!q.prompt || typeof q.prompt !== "string") problems.push(`empty prompt in ${b.subskill}`);
        if (q.answer === undefined || q.answer === null) problems.push(`missing answer in ${b.subskill}`);
      }
    }
    if (served === 0) problems.push("served 0 items");

    // 3) record attempts + update model
    m = updateModel(m, [{
      subskill: "kopfrechnen", area: "mathematik", ts: Date.now(),
      correct: true, ms: 6000, difficulty: 40, mode: "adaptive",
      templateKey: "k", structHash: "h",
    }], "day-x", "adaptive");

    // 4) every displayed metric must be finite/sane
    for (const s of SUBS) {
      const st = m.subs[s];
      if (!st) { problems.push(`subs.${s} missing after load`); continue; }
      metricSane(st.mastery, `${s}.mastery`, problems);
      metricSane(st.accuracy, `${s}.accuracy`, problems);
      metricSane(st.speed, `${s}.speed`, problems);
      metricSane(st.retention, `${s}.retention`, problems);
      metricSane(st.difficulty, `${s}.difficulty`, problems);
    }

    // 5) history/fehler preserved (not silently wiped)
    if (!Array.isArray(m.history)) problems.push("history not an array");
    if (!Array.isArray(m.fehler)) problems.push("fehler not an array");

    console.log(`${label}: served=${served} historyLen=${m.history?.length} fehlerLen=${m.fehler?.length} problems=${problems.length}`);
    if (problems.length) problems.slice(0, 8).forEach(p => console.log(`    - ${p}`));
    return problems.length === 0;
  } catch (e) {
    console.log(`${label}: CRASH: ${e.message}`);
    return false;
  }
}

console.log("=== 1.1 STORAGE MIGRATION MATRIX (old prod storage -> new engine) ===\n");
const results = {};

// (a) OLD full dump
results.old = exercise("(a) OLD prod shape   ", () => oldShapeModel());

// (b) TRUNCATED json -> load path yields emptyCoach; emulate post-parse-failure state
results.truncated = exercise("(b) TRUNCATED dump  ", () => {
  const raw = JSON.stringify(oldShapeModel());
  const cut = raw.slice(0, Math.floor(raw.length * 0.6));
  let parsed = null;
  try { parsed = JSON.parse(cut); } catch { parsed = null; }
  // mirrors useLearner: parse failure -> emptyCoach()
  return parsed && parsed.subs ? parsed : emptyCoach();
});

// (c) MALFORMED: corrupt key values with wrong types
results.malformed = exercise("(c) MALFORMED types ", () => {
  const m = oldShapeModel();
  m.exposure = "not-an-object";
  m.subs.kopfrechnen.mastery = "abc";
  m.subs.satzbau.recent = "not-an-array";
  m.history = null;
  m.fehler = undefined;
  // mirrors useLearner defensive merge
  const base = emptyCoach();
  m.subs = { ...base.subs, ...(m.subs || {}) };
  m.fehler = Array.isArray(m.fehler) ? m.fehler : [];
  m.history = Array.isArray(m.history) ? m.history : [];
  m.exposure = (m.exposure && typeof m.exposure === "object") ? m.exposure : {};
  return m;
});

// (d) EMPTY storage (control)
results.empty = exercise("(d) EMPTY (control) ", () => emptyCoach());

// (e) exposure holding NUMBERS where new code expects arrays and vice versa
results.mixed = exercise("(e) MIXED exposure  ", () => {
  const m = oldShapeModel();
  m.exposure["kopfrechnen:rr"] = ["not", "a", "number"];
  m.exposure["satzbau"] = 42;
  m.exposure["satzbau:pa"] = "string-not-array";
  return m;
});

console.log("\n=== RESULT ===");
for (const [k, v] of Object.entries(results)) console.log(`${k.padEnd(10)} -> ${v ? "PASS" : "FAIL"}`);
const allPass = Object.values(results).every(Boolean);
console.log(`\nR1 ${allPass ? "PASS" : "FAIL"}`);
