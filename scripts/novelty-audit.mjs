// scripts/novelty-audit.mjs  (Phase 1+2+3 of the Novelty Capacity Loop)
//
// INDEPENDENT measurement harness. Per the Loop's hard constraint, this file
// imports ONLY the public generation + session-planning API. It does NOT import
// any dedupe helper, structHashOf, fingerprint, or similarity utility from the engine.
// All three fingerprints below are computed by THIS file from the rendered item.
//
// Fingerprints (from RENDERED prompt + options, engine-agnostic):
//   exactHash   : sha1 of normalized prompt + sorted options
//   surfaceHash : sha1 after masking digits->'#', currency->'¤', proper nouns/names->'N'
//   structHash  : sha1 of the engine-EMITTED StructSig (q.structSig). We READ the field
//                 the generator emits (not inferred), per Loop Phase 1 requirement that
//                 "Each generator must EMIT this signature as metadata."

import crypto from "crypto";
import { generate } from "/opt/data/projects/multicheck/lib/questions.ts";
import { emptyCoach, updateModel, composeSession, composeSubskillQuestions } from "/opt/data/projects/multicheck/lib/coach.ts";
import { ALL_SUBSKILLS } from "/opt/data/projects/multicheck/lib/curriculum.ts";

const sha1 = (s) => crypto.createHash("sha1").update(s, "utf8").digest("hex");

// --- independent exact + surface fingerprints ---
function normExact(q) {
  const opts = (q.options || []).map((o) => String(o).trim()).sort();
  return sha1(JSON.stringify([q.prompt.trim(), opts]));
}
const GIVEN_NAMES = new Set(["Hans", "Anna", "Peter", "Lisa", "Müller", "Meier", "Schmidt", "Fischer", "Weber", "Keller", "Bern", "Zürich", "Basel", "Genf", "Aargau", "Thurgau", "Beat", "Sara", "Tom", "Mia"]);
function maskSurface(s) {
  return String(s)
    .replace(/\d+/g, "#")
    .replace(/CHF\s*\d+/gi, "CHF ¤")
    .replace(/[€$]/g, "¤")
    .replace(/\b([A-Z][a-zäöüÄÖÜ]+)\b/g, (w) => (GIVEN_NAMES.has(w) ? "N" : w))
    .replace(/\s+/g, " ")
    .trim();
}
function normSurface(q) {
  const opts = (q.options || []).map((o) => maskSurface(o)).sort();
  return sha1(JSON.stringify([maskSurface(q.prompt), opts]));
}
// structHash from the EMITTED signature (engine provides; we only read it)
function emittedStructHash(q) {
  if (!q.structSig) return null;
  return sha1(JSON.stringify(q.structSig));
}

// === Phase 2: 56-day serve simulation, driven by the REAL planner ===
const PROFILES = {
  "Strong": { base: 80, noise: 5 },
  "Weak Math": { base: 25, noise: 8, mathBias: -20 },
  "Slow-but-Accurate": { base: 55, noise: 6, slow: true },
  "Fast-but-Careless": { base: 55, noise: 10, fast: true },
  "Poor Retention": { base: 60, noise: 8, forget: true },
};
const ITEMS_PER_DAY = 45;
const DAYS = 56;
const SEEDS = [101, 202, 303, 404, 505];

function makeModelWithBias(bias) {
  const m = emptyCoach();
  // bias the ability of math subskills down for Weak Math
  for (const s of ALL_SUBSKILLS) {
    const isMath = ["textaufgaben", "kopfrechnen"].includes(s.id);
    if (bias?.mathBias && isMath) m.subs[s.id].difficulty = Math.max(10, Math.min(95, (m.subs[s.id].difficulty ?? 35) + bias.mathBias));
  }
  return m;
}

function simulate(profileName, bias, seed) {
  let m = makeModelWithBias(bias);
  const served = {}; // subskill -> array of {exact, surface, struct, review}
  for (const s of ALL_SUBSKILLS) served[s.id] = [];
  // deterministic RNG seeded per (profile, seed) for attempt outcomes
  let rs = seed * 7919 + nameHash(profileName);
  const rnd = () => { rs = (rs * 1103515245 + 12345) & 0x7fffffff; return rs / 0x7fffffff; };

  for (let day = 0; day < DAYS; day++) {
    // planner with current model
    const plan = composeSession(m, 22);
    const toServe = [];
    for (const b of plan.blocks) {
      const qs = composeSubskillQuestions(m, b.subskill, b.count, b.mode);
      for (const q of qs) toServe.push({ q, sub: b.subskill });
    }
    // top up to ~ITEMS_PER_DAY by pulling weakest subskills
    let over = ITEMS_PER_DAY - toServe.length;
    while (over-- > 0) {
      const weakest = ALL_SUBSKILLS.slice().sort((a, b) => (m.subs[a.id].mastery ?? 0) - (m.subs[b.id].mastery ?? 0))[0];
      const qs = composeSubskillQuestions(m, weakest.id, 1, "adaptive");
      if (qs[0]) toServe.push({ q: qs[0], sub: weakest.id });
    }
    const attempts = [];
    for (const { q, sub } of toServe) {
      const isMath = ["textaufgaben", "kopfrechnen"].includes(sub);
      const base = bias?.base ?? 55;
      let pCorrect = base / 100;
      if (bias?.mathBias && isMath) pCorrect = Math.max(0.05, Math.min(0.95, pCorrect + bias.mathBias / 100));
      const correct = rnd() < pCorrect;
      const ms = (bias?.fast ? 1.5 : bias?.slow ? 30 : 6) * 1000 * (0.6 + rnd());
      attempts.push({ subskill: q.subskill, area: q.area, ts: Date.now() + day * 1000 + rnd(), correct, ms, difficulty: q.difficultyScore ?? 30, mode: "adaptive", templateKey: q.templateKey, structHash: q.structHash });
      const ex = normExact(q), su = normSurface(q), st = emittedStructHash(q);
      served[sub].push({ exact: ex, surface: su, struct: st, review: false });
    }
    m = updateModel(m, attempts, "day-" + day, "adaptive");
  }
  return served;
}

function nameHash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0x7fffffff; return h; }

// sliding-window duplicate rate for a list of hashes
function dupRateWindow(hashes, win) {
  const seen = new Map();
  let dups = 0, tot = 0;
  const arr = [];
  for (let i = 0; i < hashes.length; i++) {
    const h = hashes[i];
    if (h == null) continue;
    arr.push(h);
    if (arr.length > win) arr.shift();
    if (seen.has(h) && arr.includes(h)) { tot++; if (seen.get(h) > 0) dups++; }
    if (!seen.has(h)) seen.set(h, 0); else seen.set(h, seen.get(h) + 1);
  }
  // more precise: within the window, count items that repeat
  return { dups, tot };
}

function metricsFor(sub, list) {
  const exact = list.map((x) => x.exact);
  const surface = list.map((x) => x.surface);
  const struct = list.map((x) => x.struct).filter((x) => x != null);
  const uniqStruct = new Set(struct);
  // HHI over struct frequencies
  const freq = {};
  for (const h of struct) freq[h] = (freq[h] || 0) + 1;
  const total = struct.length || 1;
  let hhi = 0; let top = 0;
  for (const h in freq) { const f = freq[h] / total; hhi += f * f; top = Math.max(top, f); }
  // median repeat gap for struct
  const pos = {}; const gaps = [];
  struct.forEach((h, i) => { if (pos[h] != null) gaps.push(i - pos[h]); pos[h] = i; });
  gaps.sort((a, b) => a - b);
  const medianGap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : -1;
  return {
    served: list.length,
    exactDupRate: calcDupRate(exact),
    structDupRate50: calcDupRateWindow(struct, 50),
    structDupRate200: calcDupRateWindow(struct, 200),
    structDupRateAll: calcDupRateWindow(struct, 1000000),
    surfaceDupRate200: calcDupRateWindow(surface, 200),
    uniqueStruct: uniqStruct.size,
    structHHI: +hhi.toFixed(3),
    topFamilyShare: +top.toFixed(3),
    medianRepeatGap: medianGap,
    capacityRatio: +(uniqStruct.size / list.length).toFixed(3),
  };
}

function calcDupRate(hashes) {
  const seen = new Set(); let dups = 0;
  for (const h of hashes) { if (h == null) continue; if (seen.has(h)) dups++; else seen.add(h); }
  const tot = hashes.filter(h => h != null).length;
  return tot ? +(dups / tot).toFixed(4) : 0;
}
function calcDupRateWindow(hashes, win) {
  // fraction of items whose struct already appeared within the previous `win` items
  let dups = 0; const tot = hashes.filter(h => h != null).length;
  const recent = [];
  for (const h of hashes) {
    if (h == null) continue;
    if (recent.includes(h)) dups++;   // repeat within the sliding window
    recent.push(h);
    if (recent.length > win) recent.shift();
  }
  return tot ? +(dups / tot).toFixed(4) : 0;
}

// === Run ===
const allResults = {};
for (const pname of Object.keys(PROFILES)) {
  const perSeed = [];
  for (const seed of SEEDS) {
    const served = simulate(pname, PROFILES[pname], seed);
    const merged = {};
    for (const s of ALL_SUBSKILLS) merged[s.id] = served[s.id];
    allResults[pname + "|" + seed] = merged;
  }
  // aggregate across seeds for this profile (union of items by appending)
  const merged = {};
  for (const s of ALL_SUBSKILLS) merged[s.id] = [];
  for (const seed of SEEDS) {
    const k = pname + "|" + seed;
    for (const s of ALL_SUBSKILLS) merged[s.id].push(...allResults[k][s.id]);
  }
  const report = {};
  for (const s of ALL_SUBSKILLS) report[s.id] = metricsFor(s, merged[s.id]);
  allResults["AGG|" + pname] = report;
}

// write raw per-profile JSON
import { writeFileSync } from "fs";
import { mkdirSync } from "fs";
mkdirSync("/opt/data/projects/multicheck/reports", { recursive: true });
for (const pname of Object.keys(PROFILES)) {
  writeFileSync(`/opt/data/projects/multicheck/reports/novelty-${pname.replace(/\s+/g, "_")}.json`, JSON.stringify(allResults["AGG|" + pname], null, 2));
}

// console summary table
console.log("\n=== NOVELTY METRICS (per subskill, aggregated across 5 seeds) ===");
const gate = { G1: true, G2: true, G3: true, G4: true, G5: true };
const rows = [];
for (const s of ALL_SUBSKILLS) {
  const m = allResults["AGG|Strong"][s.id];
  rows.push([s.id, m.served, m.exactDupRate, m.structDupRate50, m.structDupRate200, m.surfaceDupRate200, m.uniqueStruct, m.structHHI, m.topFamilyShare, m.capacityRatio]);
  if (m.exactDupRate !== 0) gate.G1 = false;
  if (m.structDupRate50 > 0.02) gate.G2 = false;
  if (m.surfaceDupRate200 > 0.05) gate.G3 = false;
  if (m.capacityRatio < 3.0) gate.G4 = false;
  if (m.topFamilyShare > 0.15) gate.G5 = false;
}
console.log("subskill | served | exactDup | structDup@50 | structDup@200 | surfaceDup@200 | uniqStruct | HHI | topShare | capRatio");
for (const r of rows) console.log(r.join(" | "));
console.log("\nGATE PRE-FIX:", JSON.stringify(gate));
export { normExact, normSurface, emittedStructHash, metricsFor, simulate };
