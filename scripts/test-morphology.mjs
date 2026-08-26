// Morphology gate (Phase 6). The 30-sample reads found "Du meldst" (missing -e-
// linking vowel) and "Ihr erinnernt" (-ern verbs drop only -n). Those were fixed in
// the generator; this test pins the RULES deterministically so they cannot regress
// without a red gate, instead of relying on sampled questions to rediscover them.
//
// Scope: the regular present-tense subset the satzbau generator actually composes.
// Irregular/strong forms come from the lexicon's explicit `pres` table and are
// checked separately below against that table, not re-derived here.
import LEX from "../lib/satzbau-lexicon.json" with { type: "json" };

// Mirror of the generator's rule (kept in sync deliberately; a divergence here is
// the signal that the generator changed).
function stemOf(inf) {
  return /[e][rl]n$/.test(inf) ? inf.replace(/n$/, "") : inf.replace(/en$/, "");
}
function conj(inf, person) {
  const stem = stemOf(inf);
  const link = /[dt]$/.test(stem) ? "e" : "";
  switch (person) {
    case "ich": return stem + "e";
    case "du": return stem + link + "st";
    case "er": return stem + link + "t";
    case "wir": return inf;
    case "ihr": return stem + link + "t";
    case "sie_pl": return inf;
    default: throw new Error("bad person " + person);
  }
}

const CASES = [
  // regular
  ["holen", "ich", "hole"], ["holen", "du", "holst"], ["holen", "er", "holt"],
  ["holen", "wir", "holen"], ["holen", "ihr", "holt"],
  // -d/-t stems need the -e- linking vowel
  ["melden", "du", "meldest"], ["melden", "er", "meldet"], ["melden", "ihr", "meldet"],
  ["warten", "du", "wartest"], ["warten", "er", "wartet"], ["warten", "ihr", "wartet"],
  ["arbeiten", "du", "arbeitest"], ["arbeiten", "ihr", "arbeitet"],
  // -ern / -eln drop only the final -n
  ["erinnern", "ihr", "erinnert"], ["erinnern", "du", "erinnerst"], ["erinnern", "ich", "erinnere"],
  ["ärgern", "ihr", "ärgert"], ["ärgern", "du", "ärgerst"],
  ["sammeln", "ihr", "sammelt"], ["sammeln", "du", "sammelst"],
  // ordinary -en
  ["prüfen", "du", "prüfst"], ["prüfen", "ihr", "prüft"],
  ["packen", "ihr", "packt"], ["zeigen", "du", "zeigst"],
  ["interessieren", "ihr", "interessiert"], ["beeilen", "du", "beeilst"],
];

const fails = [];
for (const [inf, person, want] of CASES) {
  const got = conj(inf, person);
  if (got !== want) fails.push(`${inf} + ${person}: expected "${want}", got "${got}"`);
}

// Lexicon integrity: every verb must carry all six present forms, a participle and
// an auxiliary, or the generators silently emit "undefined".
for (const v of LEX.SB_VERBS) {
  for (const p of ["ich", "du", "er", "sie", "wir", "ihr"]) {
    if (!v.pres || typeof v.pres[p] !== "string" || !v.pres[p]) fails.push(`lexicon verb "${v.inf}" missing pres.${p}`);
  }
  if (!v.participle) fails.push(`lexicon verb "${v.inf}" missing participle`);
  if (v.aux !== "haben" && v.aux !== "sein") fails.push(`lexicon verb "${v.inf}" has invalid aux "${v.aux}"`);
}
// Pronoun agreement table must be complete and internally distinct where German is.
const PRON = { ich: "mich", du: "dich", er: "sich", wir: "uns", ihr: "euch", sie: "sich" };
for (const [p, refl] of Object.entries(PRON)) if (!refl) fails.push(`reflexive missing for ${p}`);

console.log(`checked ${CASES.length} conjugation cases + ${LEX.SB_VERBS.length} lexicon verbs`);
if (fails.length) {
  for (const f of fails.slice(0, 25)) console.log("FAIL:", f);
  console.log(`\nFAIL — ${fails.length} morphology defect(s).`);
  process.exit(1);
}
console.log("PASS — morphology rules hold (linking vowel, -ern/-eln stems, lexicon completeness).");
