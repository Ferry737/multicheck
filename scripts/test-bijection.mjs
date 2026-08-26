// STEP 2 — GLOBAL BIJECTION: structIndex <-> structHash must be bijective for
// ALL 11 subskills (Amendment 4 required it; only prozesslogik was verified).
// hashU (distinct emitted signatures) must equal authoredU (GENERATORS length).
import { generate, GENERATORS, structHashOf } from "/opt/data/projects/multicheck/lib/questions.ts";

const N = 400; // seeds per struct
let fail = 0;
const rows = [];

for (const id of Object.keys(GENERATORS)) {
  const authoredU = GENERATORS[id].length;
  if (authoredU === 0) { rows.push([id, 0, 0, "n/a (no structs)"]); continue; }

  const sigByStruct = new Map();   // si -> Set(signature)
  const structBySig = new Map();   // signature -> Set(si)

  for (let si = 0; si < authoredU; si++) {
    for (let i = 0; i < N; i++) {
      const q = generate(id, 50, 700000 + i * 53 + si * 4099, si);
      if (!q) continue;
      const sig = q.structSig ? structHashOf(q.structSig) : (q.structHash ?? "");
      if (!sigByStruct.has(si)) sigByStruct.set(si, new Set());
      sigByStruct.get(si).add(sig);
      if (!structBySig.has(sig)) structBySig.set(sig, new Set());
      structBySig.get(sig).add(si);
    }
  }

  const hashU = structBySig.size;
  // bijection violations
  const oneToMany = [...sigByStruct.entries()].filter(([, set]) => set.size > 1);
  const manyToOne = [...structBySig.entries()].filter(([, set]) => set.size > 1);

  let verdict;
  if (hashU !== authoredU) {
    verdict = `FAIL hashU ${hashU} != authoredU ${authoredU}`;
    fail++;
  } else if (oneToMany.length) {
    verdict = `FAIL ${oneToMany.length} struct(s) emit >1 signature`;
    fail++;
  } else if (manyToOne.length) {
    verdict = `FAIL ${manyToOne.length} signature(s) shared by >1 struct`;
    fail++;
  } else {
    verdict = "PASS bijective";
  }
  rows.push([id, authoredU, hashU, verdict]);
  if (oneToMany.length) {
    for (const [si, set] of oneToMany.slice(0, 4)) console.log(`    ${id} si=${si} emits ${set.size} signatures`);
  }
  if (manyToOne.length) {
    for (const [sig, set] of manyToOne.slice(0, 4)) console.log(`    ${id} signature ${sig.slice(0, 10)} shared by si ${[...set].join(",")}`);
  }
}

console.log("\nsubskill             authoredU  hashU  verdict");
for (const [id, a, h, v] of rows) {
  console.log(`${id.padEnd(20)} ${String(a).padStart(9)}  ${String(h).padStart(5)}  ${v}`);
}
console.log(`\n${fail === 0 ? "ALL PASS — bijection holds for every subskill" : fail + " SUBSKILL(S) FAIL"}`);
if (fail > 0) throw new Error("structIndex <-> structHash bijection violated");
