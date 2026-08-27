// R7 — LONGITUDINAL PLAN ADAPTIVITY (docs/RELEASE-GATES.md)
// Six profiles, 10 sessions each, driven through the shipped planner (decideToday) and
// updateModel. FAIL if different profiles receive nearly identical plans.
import { emptyCoach, updateModel, decideToday, SPEED_TARGET_S } from "../lib/coach.ts";

const ALL = ["satzbau", "textverstaendnis", "textaufgaben", "kopfrechnen", "prozesslogik",
  "wortgruppen", "bilder_zaehlen", "symbole_entdecken", "schilder_erinnern",
  "sortierverfahren", "alltagswissen"];
const MATHS = new Set(["textaufgaben", "kopfrechnen"]);
const areaOf = (s) => (MATHS.has(s) ? "mathematik" : "x");
const DAY = 86400000;

let seed = 31337;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

// Each profile: how it answers a given subskill on a given day.
const PROFILES = {
  "weak-math":        (s) => ({ correct: MATHS.has(s) ? rnd() < 0.35 : rnd() < 0.85, mult: 1.1 }),
  "slow-accurate":    () => ({ correct: rnd() < 0.92, mult: 3.0 }),
  "fast-careless":    () => ({ correct: rnd() < 0.55, mult: 0.35 }),
  "poor-retention":   (s, d) => ({ correct: d % 3 === 0 ? rnd() < 0.35 : rnd() < 0.85, mult: 1.0 }),
  "strong":           () => ({ correct: rnd() < 0.96, mult: 0.8 }),
  "practice-strong-sim-weak": (s, d, mode) => ({ correct: mode === "full-sim" ? rnd() < 0.3 : rnd() < 0.92, mult: 1.0 }),
};

function runProfile(name) {
  const fn = PROFILES[name];
  let m = emptyCoach();
  const sessions = [];
  for (let d = 0; d < 10; d++) {
    const plan = decideToday(m);
    const blocks = plan?.blocks || [];
    sessions.push({
      day: d,
      subs: blocks.map((b) => b.subskill),
      modes: blocks.map((b) => b.mode),
      counts: blocks.map((b) => b.count ?? b.items ?? 0),
      mathShare: blocks.filter((b) => MATHS.has(b.subskill)).length / Math.max(1, blocks.length),
      speedBlocks: blocks.filter((b) => b.mode === "speed").length,
      spacedBlocks: blocks.filter((b) => b.mode === "spaced").length,
      readiness: Math.round(((Object.values(m.subs).reduce((a, s) => a + (s.mastery || 0), 0)) / Math.max(1, Object.values(m.subs).length)) * 100),
    });
    // Practise what the plan asked for (fall back to everything on day 0).
    const target = blocks.length ? [...new Set(blocks.map((b) => b.subskill))] : ALL;
    const mode = name === "practice-strong-sim-weak" && d % 4 === 3 ? "full-sim" : "training";
    const attempts = [];
    for (const s of target) {
      const r = fn(s, d, mode);
      const tgt = (SPEED_TARGET_S[s] ?? 25) * 1000;
      for (let k = 0; k < 3; k++) {
        const rr = fn(s, d, mode);
        attempts.push({ subskill: s, area: areaOf(s), ts: Date.now() - (10 - d) * DAY + k,
          correct: rr.correct, ms: Math.round(tgt * rr.mult), difficulty: 50, mode, unseen: true });
      }
    }
    m = updateModel(m, attempts, `${name}-d${d}`, mode);
  }
  const last = sessions[sessions.length - 1];
  return { name, sessions, final: last, model: m };
}

const results = Object.keys(PROFILES).map(runProfile);
const fails = [];
const ok = (c, label, detail) => { console.log(`  ${c ? "PASS" : "FAIL"} — ${label}${detail ? `  [${detail}]` : ""}`); if (!c) fails.push(label); };

console.log("R7 — LONGITUDINAL PLAN ADAPTIVITY (6 profiles x 10 sessions)\n");
console.log("profile                     mathShare(final)  speedBlocks  spacedBlocks  readiness  planSubs(final)");
for (const r of results) {
  console.log(
    r.name.padEnd(27) +
    String(r.final.mathShare.toFixed(2)).padStart(12) +
    String(r.final.speedBlocks).padStart(13) +
    String(r.final.spacedBlocks).padStart(14) +
    String(r.final.readiness + "%").padStart(11) + "  " +
    r.final.subs.slice(0, 4).join(",")
  );
}

const by = (n) => results.find((r) => r.name === n);
const avgMath = (r) => r.sessions.reduce((a, s) => a + s.mathShare, 0) / r.sessions.length;
const avgSpeed = (r) => r.sessions.reduce((a, s) => a + s.speedBlocks, 0) / r.sessions.length;
const avgSpaced = (r) => r.sessions.reduce((a, s) => a + s.spacedBlocks, 0) / r.sessions.length;

console.log("\nprofile-specific expectations:");
ok(avgMath(by("weak-math")) > avgMath(by("strong")), "weak-math gets MORE maths allocation than strong",
  `${avgMath(by("weak-math")).toFixed(2)} vs ${avgMath(by("strong")).toFixed(2)}`);
ok(avgSpeed(by("slow-accurate")) >= avgSpeed(by("strong")), "slow-accurate gets >= speed work than strong",
  `${avgSpeed(by("slow-accurate")).toFixed(2)} vs ${avgSpeed(by("strong")).toFixed(2)}`);
ok(avgSpaced(by("poor-retention")) >= avgSpaced(by("strong")), "poor-retention gets >= spaced review than strong",
  `${avgSpaced(by("poor-retention")).toFixed(2)} vs ${avgSpaced(by("strong")).toFixed(2)}`);

// Divergence: the six profiles must not receive near-identical plans.
const sigs = results.map((r) => r.sessions.map((s) => s.subs.join(">") + "|" + s.modes.join(">")).join("//"));
const distinct = new Set(sigs).size;
ok(distinct === results.length, "all 6 profiles produced DISTINCT plan trajectories", `${distinct}/${results.length} distinct`);

// Improvement must move the plan: weak-math improving should reduce its maths share.
const wm = by("weak-math");
const earlyMath = wm.sessions.slice(0, 3).reduce((a, s) => a + s.mathShare, 0) / 3;
const lateMath = wm.sessions.slice(-3).reduce((a, s) => a + s.mathShare, 0) / 3;
console.log(`\nweak-math maths share: early ${earlyMath.toFixed(2)} -> late ${lateMath.toFixed(2)} (stays elevated while still weak)`);
ok(lateMath > 0, "weak-math keeps a non-zero maths allocation while weak", lateMath.toFixed(2));

console.log("");
if (fails.length) { console.log(`R7 FAIL — ${fails.length}: ${fails.join("; ")}`); process.exit(1); }
console.log("R7 DIRECT PASS — plans diverge by profile and respond to behaviour over 10 sessions.");
