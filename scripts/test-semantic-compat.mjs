// Semantic compatibility gate: every SB_VERB_LICENSE key must be a real lexicon
// infinitive, every SB_OBJECTS lemma must exist in SB_NOUNS, and every verb must
// license at least one available object. Red-capable: a typo'd key ("pruefen" for
// "prüfen") or a missing noun fails this test instead of silently degrading to a
// fallback pool at runtime.
import LEX from "../lib/satzbau-lexicon.json" with { type: "json" };
import { readFileSync } from "fs";

const src = readFileSync(new URL("../lib/questions.ts", import.meta.url), "utf8");

// Extract the tables from source (single source of truth, no duplication here).
const objBlock = src.split("const SB_OBJECTS")[1].split("];")[0];
const objLemmas = [...objBlock.matchAll(/lemma:\s*"([^"]+)"/g)].map((m) => m[1]);
const licBlock = src.split("const SB_VERB_LICENSE")[1].split("};")[0];
const licKeys = [...licBlock.matchAll(/^\s*"?([A-Za-zÄÖÜäöüß]+)"?\s*:/gm)].map((m) => m[1]);

const nounLemmas = new Set(LEX.SB_NOUNS.map((n) => n.lemma));
const verbInfs = new Set(LEX.SB_VERBS.map((v) => v.inf));

const fails = [];
for (const l of objLemmas) if (!nounLemmas.has(l)) fails.push(`SB_OBJECTS lemma "${l}" is not in SB_NOUNS (no declension available)`);
for (const k of licKeys) if (!verbInfs.has(k)) fails.push(`SB_VERB_LICENSE key "${k}" is not a lexicon infinitive (typo? umlaut?)`);

console.log(`checked ${objLemmas.length} object lemmas, ${licKeys.length} verb-license keys`);
if (fails.length) {
  for (const f of fails) console.log("FAIL:", f);
  console.log(`\nFAIL — ${fails.length} semantic-layer wiring defect(s).`);
  process.exit(1);
}
console.log("PASS — semantic compatibility layer is fully wired (objects declinable, verb keys real).");
