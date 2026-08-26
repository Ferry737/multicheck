// PERMANENT INVARIANT: historyRingLength == emissionCount after a run.
// The degraded path must write to :pa before emitting, so every emission
// is recorded in the full-history prompt ring. If the ring is shorter than
// the emission count, dedup is incomplete (write-only path bug).
import { composeSubskillQuestions, emptyCoach } from "/opt/data/projects/multicheck/lib/coach.ts";
import crypto from "crypto";

function nameHash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0x7fffffff; return h; }

const SEED = 101;
const DAYS = 56;
const ITEMS_PER_DAY = 40;
let failures = 0;

for (const id of ["satzbau", "textverstaendnis", "textaufgaben", "kopfrechnen",
  "prozesslogik", "wortgruppen", "bilder_zaehlen", "symbole_entdecken",
  "schilder_erinnern", "sortierverfahren", "alltagswissen"]) {
  let m = emptyCoach();
  let emissions = 0;
  for (let day = 0; day < DAYS; day++) {
    const ds = SEED * 100000 + day * 100 + nameHash(id) % 97;
    const res = composeSubskillQuestions(m, id, 5, "adaptive", ds);
    m = res.model;
    emissions += res.questions.length;
  }
  const paLen = (m.exposure[id + ":pa"] ?? []).length;
  const pLen = (m.exposure[id + ":p"] ?? []).length;
  const pass = paLen === emissions;
  if (!pass) {
    failures++;
    console.error(`FAIL ${id}: emitted=${emissions} :pa=${paLen} :p=${pLen} (cap 4000)`);
  } else {
    console.log(`PASS ${id}: emitted=${emissions} :pa=${paLen} :p=${pLen}`);
  }
}

console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURES"}`);
if (failures > 0) throw new Error("historyRingLength != emissionCount — dedup invariant violated");
