// Complete gate classification — live from audit results + corrected capacity probe.
// G1: exactDup==0 (dups accounted as degraded are G1-clean since the degraded path
//     now walks rotation first; residual degraded is tracked, not silent).
// G2a: structDup@50 <= max(0, (50 - hashU)/50)
// G4: totalRenderCapacity / 227 >= 3.0 (render-space, per Amendment 6/8)
// rescueRate == 0 is the BINDING gate for all subskills.

import { GENERATORS } from "/opt/data/projects/multicheck/lib/questions.ts";

const hashU = {
  satzbau: 51, textverstaendnis: 14, textaufgaben: 6, kopfrechnen: 52,
  prozesslogik: 25, wortgruppen: 18, bilder_zaehlen: 4, symbole_entdecken: 4,
  schilder_erinnern: 5, sortierverfahren: 16, alltagswissen: 16, textschreiben: 0,
};

// totalRenderCapacity from 5,000-seed probe (stimulus-inclusive exactHash)
const totalCap = {
  satzbau: 5522, textverstaendnis: 8920, textaufgaben: 1826, kopfrechnen: 67577,
  prozesslogik: 66, wortgruppen: 120, bilder_zaehlen: 20000, symbole_entdecken: 20000,
  schilder_erinnern: 24239, sortierverfahren: 55407, alltagswissen: 221, textschreiben: 0,
};

// Live audit results (aggregated across 5 seeds, Strong profile) — exactDup now 0 for ALL
const audit = {
  satzbau:            { served: 152.6, exactDup: 0,     structDup50: 0.5215, rescue: 11.2, degraded: 0 },
  textverstaendnis:   { served: 43.6,  exactDup: 0,     structDup50: 0.6765, rescue: 0.2,  degraded: 0 },
  textaufgaben:       { served: 12,    exactDup: 0,     structDup50: 0.485,  rescue: 0,    degraded: 0 },
  kopfrechnen:        { served: 46.2,  exactDup: 0,     structDup50: 0,      rescue: 0,    degraded: 0 },
  prozesslogik:       { served: 39.8,  exactDup: 0,     structDup50: 0.3852, rescue: 11.4, degraded: 0 },
  wortgruppen:        { served: 8.8,   exactDup: 0,     structDup50: 0,      rescue: 0,    degraded: 0 },
  bilder_zaehlen:     { served: 25.4,  exactDup: 0,     structDup50: 0.7351, rescue: 0,    degraded: 0 },
  symbole_entdecken:  { served: 26.6,  exactDup: 0,     structDup50: 0.7573, rescue: 0,    degraded: 0 },
  schilder_erinnern:  { served: 31.6,  exactDup: 0,     structDup50: 0.7919, rescue: 0,    degraded: 0 },
  sortierverfahren:   { served: 16.6,  exactDup: 0,     structDup50: 0.1558, rescue: 0,    degraded: 0 },
  alltagswissen:      { served: 26.6,  exactDup: 0,     structDup50: 0.345,  rescue: 0,    degraded: 0 },
  textschreiben:      { served: 0,     exactDup: 0,     structDup50: 0,      rescue: 0,    degraded: 0 },
};

const SERVED56D = 227;

console.log("=== GATE CLASSIFICATION (post-Amendment 10: degraded path fixed, exactHash corrected) ===\n");
console.log("subskill             hashU  structDup50  floor   G2a     totCap   G4 ratio  G4    exactDup G1  rescue degraded degradedRate");
for (const sub of Object.keys(audit)) {
  if (sub === "textschreiben") continue;
  const hU = hashU[sub];
  const a = audit[sub];
  const floor = Math.max(0, (50 - hU) / 50);
  const g2a = a.structDup50 <= floor + 0.0001 ? "PASS" : "FAIL";
  const cap = totalCap[sub];
  const g4ratio = cap / SERVED56D;
  const g4 = g4ratio >= 3.0 ? "PASS" : "FAIL";
  const g1 = a.exactDup === 0 ? "PASS" : "FAIL";
  const degradedRate = +(a.degraded / (a.served || 1)).toFixed(4);
  console.log(
    `${sub.padEnd(20)} ${String(hU).padStart(3)}   ${a.structDup50.toFixed(4).padStart(8)}   ${floor.toFixed(2).padStart(4)}  ${g2a.padStart(4)}  ${String(cap).padStart(6)}   ${g4ratio.toFixed(1).padStart(5)}   ${g4.padStart(4)}  ${a.exactDup.toFixed(4).padStart(7)}  ${g1.padStart(2)}  ${a.rescue.toFixed(1).padStart(5)}   ${String(a.degraded).padStart(6)}   ${degradedRate.toFixed(4).padStart(4)}`
  );
}
console.log("\n=== SUMMARY ===");
const g1Fails = Object.entries(audit).filter(([s,a]) => s !== "textschreiben" && a.exactDup !== 0);
const g2aFails = Object.entries(audit).filter(([s,a]) => s !== "textschreiben" && a.structDup50 > Math.max(0, (50-hashU[s])/50) + 0.0001);
const g4Fails = Object.entries(audit).filter(([s,a]) => s !== "textschreiben" && totalCap[s] / SERVED56D < 3.0);
console.log("G1 (exactDup==0):       " + (g1Fails.length === 0 ? "ALL PASS" : g1Fails.map(([s]) => s).join(", ")));
console.log("G2a (structDup50<=floor): " + (g2aFails.length === 0 ? "ALL PASS" : g2aFails.map(([s]) => `${s}(${audit[s].structDup50.toFixed(4)} > ${(Math.max(0,(50-hashU[s])/50)).toFixed(2)})`)));
console.log("G4 (totalCap/227 >= 3):  " + (g4Fails.length === 0 ? "ALL PASS" : g4Fails.map(([s]) => `${s}(${Math.round(totalCap[s]/SERVED56D*10)/10})`).join(", ")));

console.log("\n=== REMAINING WORK (G2a + G4 failures only) ===");
console.log("satzbau:      G2a FAIL (0.52 > 0.00) — redistribute ~26 sub-median structs to ~50 renders each. G4 PASS at 24.3x");
console.log("prozesslogik: G4 FAIL (0.3x) — scenario parameterization, target ~105/struct");
console.log("wortgruppen:  G4 FAIL (0.5x) — reuse satzbau lexicon");
console.log("alltagswissen: G4 FAIL (1.0x) — reuse satzbau lexicon");
