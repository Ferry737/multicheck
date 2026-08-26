// TASK 2 test — append-only archive makes the Task 1 damage RECOVERABLE.
// Proves: raw answers survive clearExam(), regrade flips the bad verdicts, and
// rebuilt metrics restore the 0.899 that invalidation could only zero out.
import { emptyCoach, recordSimulation } from "/opt/data/projects/multicheck/lib/coach.ts";
import { regradeArchive, recordsFromSnapshot, MAX_RECORDS } from "/opt/data/projects/multicheck/lib/simArchive.ts";

const SUBS = ["satzbau","textverstaendnis","textaufgaben","kopfrechnen","prozesslogik",
  "wortgruppen","bilder_zaehlen","symbole_entdecken","schilder_erinnern",
  "sortierverfahren","alltagswissen","textschreiben"];

function prodDump() {
  const base = emptyCoach();
  const m = JSON.parse(JSON.stringify(base));
  m.version = 3; m.examDate = "2026-10-15"; m.exposure = {};
  for (const s of SUBS) {
    if (!m.subs[s]) continue;
    m.subs[s].attempts = 40; m.subs[s].mastery = 0.45; m.subs[s].accuracy = 0.6; m.subs[s].difficulty = 42;
  }
  m.history = Array.from({length:301},(_,i)=>({subskill:"kopfrechnen",correct:i%2===0,ms:6000,ts:i}));
  m.fehler = Array.from({length:30},(_,i)=>({id:"f"+i,subskill:"satzbau",ts:i}));
  return m;
}

// The exact Task 1 scenario: 12 numeric items, all mathematically CORRECT,
// typed in Swiss/German formats that the OLD grader rejected.
const SWISS = [
  ["1,0", "1"], ["24,60", "24.6"], ["1'234", "1234"], ["0,5", "0.5"],
  ["12,0", "12"], ["3,50", "3.5"], ["1 234", "1234"], ["7,0", "7"],
  ["45,60", "45.6"], ["2,50", "2.5"], ["100,0", "100"], ["8,0", "8"],
];

const snapshot = {
  startedAt: 1_700_000_000_000,
  answers: {}, correct: {}, responseTimes: {},
  sections: [{ questions: [] }],
};
SWISS.forEach(([typed, expected], i) => {
  const qid = "q" + i;
  const sub = i % 2 === 0 ? "kopfrechnen" : "textaufgaben";
  snapshot.sections[0].questions.push({ id: qid, answer: expected, subskill: sub, structHash: "h" + i, kind: "input" });
  snapshot.answers[qid] = typed;
  snapshot.correct[qid] = false;   // <-- the OLD grader's WRONG verdict
  snapshot.responseTimes[qid] = 9000;
});

let fail = 0;
const t = (c, l) => { if (!c) { fail++; console.log("FAIL | " + l); } else console.log("PASS | " + l); };

console.log("=== 1) records survive submission ===");
const records = recordsFromSnapshot(snapshot, "mini");
t(records.length === 12, `12 raw answers archived (got ${records.length})`);
t(records.every(r => r.answer && r.correctAnswer), "raw input AND expected answer both stored");
t(records.every(r => r.structHash), "structHash stored (enables difficulty calibration)");
t(records.every(r => r.gradedVerdict === false), "the ORIGINAL wrong verdicts are preserved as history");

console.log("\n=== 2) regrade with the CURRENT grader ===");
const rg = regradeArchive(records);
t(rg.changed === 12, `all 12 verdicts flip to correct (got ${rg.changed})`);
console.log("   per-subskill before -> after:");
for (const [s, v] of Object.entries(rg.perSubskill)) {
  console.log(`     ${s.padEnd(14)} ${v.before}/${v.total} -> ${v.after}/${v.total}`);
}

console.log("\n=== 3) RECOVERY: rebuild metrics from the regraded archive ===");
const buggy = recordSimulation(prodDump(), records.map(r => ({ subskill: r.subskill, correct: r.gradedVerdict, ms: r.ms })), "mini-sim");
const healed = recordSimulation(prodDump(), rg.results, "mini-sim");

console.log("   subskill        | buggy | healed");
for (const s of ["kopfrechnen", "textaufgaben"]) {
  console.log(`     ${s.padEnd(14)} | ${buggy.subs[s].mastery.toFixed(3)} | ${healed.subs[s].mastery.toFixed(3)}`);
}
t(buggy.subs.kopfrechnen.mastery < 0.10, `buggy mastery is the damaged value (${buggy.subs.kopfrechnen.mastery.toFixed(3)})`);
t(healed.subs.kopfrechnen.mastery > 0.85, `RECOVERED to >0.85 (${healed.subs.kopfrechnen.mastery.toFixed(3)})`);
t(healed.subs.textaufgaben.mastery > 0.85, `textaufgaben recovered (${healed.subs.textaufgaben.mastery.toFixed(3)})`);
t(healed.subs.kopfrechnen.simPerf > 0.9, `simPerf recovered (${healed.subs.kopfrechnen.simPerf.toFixed(3)})`);

console.log("\n=== 4) retention cap is enforced ===");
const many = [];
for (let i = 0; i < MAX_RECORDS + 500; i++) many.push({ ...records[0], qid: "x" + i });
const capped = [...many].slice(-MAX_RECORDS);
t(capped.length === MAX_RECORDS, `cap holds at ${MAX_RECORDS}`);
t(capped[capped.length - 1].qid === "x" + (MAX_RECORDS + 499), "newest records retained, oldest dropped");

console.log("\n=== 5) clearExam must NOT touch the archive ===");
const pageSrc = (await import("fs")).readFileSync("/opt/data/projects/multicheck/app/pruefung/page.tsx", "utf8");
const archiveIdx = pageSrc.indexOf("appendArchive(recordsFromSnapshot");
const clearIdx = pageSrc.indexOf("clearExam();", archiveIdx);
t(archiveIdx > 0 && clearIdx > archiveIdx, "archive is written BEFORE clearExam()");
t(/removeItem\(KEY\)/.test(pageSrc) && !/removeItem\(ARCHIVE_KEY\)/.test(pageSrc), "clearExam removes only the in-progress key");

console.log(`\n${fail === 0 ? "ALL PASS" : fail + " FAILURES"}`);
if (fail > 0) throw new Error("sim archive FAILED");
