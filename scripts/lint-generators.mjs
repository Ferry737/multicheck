// TASK 4b — GENERATOR LINT PASS (cheap automation before human reading).
// Statically detects the two proven mechanical defect classes:
//   A) computed-then-discarded values ("void s" at prozesslogik case 10) — FAIL
//   B) pick-driven ternary answer selection (case 16 brittle chain) — REVIEW
// plus C) duplicate entries inside one pick array (duplicate-option risk).
//
// DOCTRINE: this linter must FAIL on the pre-fix commit that contained the
// defects. Retro-validated against 970c0cf; must be clean on HEAD.
import { readFileSync } from "fs";

const FILE = "/opt/data/projects/multicheck/lib/questions.ts";
const src = readFileSync(FILE, "utf8");
const lines = src.split("\n");

const deadPicks = [];
const ternaryAnswers = [];
const dupInPick = [];

for (let i = 0; i < lines.length; i++) {
  const ln = lines[i];
  const t = ln.trim();
  if (t.startsWith("//") || t.startsWith("*")) continue;

  // (A) computed-then-discarded: const X = pick(...)/ri(...)/shuffle(...) whose
  // identifier never appears again after its declaration within the file.
  const m = t.match(/^const\s+([A-Za-z_]\w*)\s*(?::[^=]+)?=\s*(?:pick|ri|shuffle)\s*\(/);
  if (m) {
    const name = m[1];
    const rest = lines.slice(i + 1).join("\n");
    const re = new RegExp(`\\b${name}\\b`);
    if (!re.test(rest)) {
      // permitted only via an explicit void discard marker comment
      const selfVoid = /^\s*void\s+$/.test(t.replace(m[0], "").replace(/\).*$/, ")").replace(/^[^)]*\)/, "")) || /void\s+/.test(lines.slice(i - 1, i + 3).join("\n"));
      deadPicks.push({ line: i + 1, name, code: t.slice(0, 90), explicitVoid: /\bvoid\b/.test(ln + lines[i + 1]) });
    }
  }
  if (/^void\s+[A-Za-z_]\w*/.test(t)) {
    deadPicks.push({ line: i + 1, name: "(explicit void)", code: t.slice(0, 90), explicitVoid: true });
  }

  // (B) pick-driven ternary answer selection (review, not fail):
  // const X = cond ? pick(...) : pick(...) style, or pick(...) ? A : B feeding mk/pl answer
  if (/(?:const\s+\w+\s*(?::[^=]+)?=\s*|\breturn\s+).*\?.*:.*(?:pick|ri)\s*\(/i.test(t)) {
    ternaryAnswers.push({ line: i + 1, code: t.slice(0, 90) });
  }

  // (C) duplicate literals inside a single pick array
  const pm = t.match(/pick\s*\(\s*r\s*,\s*\[([^\]]+)\]/);
  if (pm) {
    const items = pm[1].split(",").map((x) => x.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
    const seen = new Set();
    for (const it of items) { if (seen.has(it)) { dupInPick.push({ line: i + 1, dup: it }); break; } seen.add(it); }
  }
}

console.log(`scanned ${FILE.split("/").pop()}: ${lines.length} lines`);

// REGISTERED DEBT (Task 5, satzbau/wortgruppen widening): these void sites exist
// because earlier wiring left authored pools unconsumed — several emit CONSTANT
// questions (capacity ≈ 1), which is the measured root cause of the sub-median
// struct distribution. Task 5 rewrites them onto pools.json and removes their
// baseline entries; this gate fails on any NEW site beyond the registry.
const BASELINE_VOID_LINES = new Set([494, 512, 522, 563, 575, 603, 1105, 1157]);
const novelVoids = deadPicks.filter((d) => !d.explicitVoid || !BASELINE_VOID_LINES.has(d.line));

console.log(`\n(A) computed-then-discarded picks / explicit voids: ${deadPicks.length} (${BASELINE_VOID_LINES.size} registered debt, ${novelVoids.length} NEW)`);
for (const d of deadPicks) console.log(`  ${d.line}: ${d.code}${d.explicitVoid ? "  [explicit void" + (BASELINE_VOID_LINES.has(d.line) ? ", registered]" : ", NEW]") : ""}`);
console.log(`\n(B) pick-driven ternary selections (REVIEW): ${ternaryAnswers.length}`);
for (const d of ternaryAnswers) console.log(`  ${d.line}: ${d.code}`);
console.log(`\n(C) duplicates inside one pick array: ${dupInPick.length}`);
for (const d of dupInPick) console.log(`  ${d.line}: duplicate "${d.dup}"`);

if (novelVoids.length) {
  console.log(`\nFAIL — ${novelVoids.length} NEW computed-then-discarded value(s). This is the case-10 defect class.`);
  throw new Error("generator lint: new dead picks present");
}
console.log("\nPASS — no NEW computed-then-discarded values (registered debt: 8 sites, tracked for Task 5).");
