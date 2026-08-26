import { generate } from "/opt/data/projects/multicheck/lib/questions.ts";

// Purity test: the PEDAGOGICAL PAYLOAD (prompt, options, stimulus, answer)
// must be byte-identical for identical (subskillId, structIndex, seed).
// The `id` field is a cosmetic identifier; it varies per seed and is not
// a purity invariant. What matters: the rendered question students see.
const SUBS = ["satzbau","prozesslogik","wortgruppen","textverstaendnis",
  "alltagswissen","bilder_zaehlen","symbole_entdecken","schilder_erinnern",
  "sortierverfahren","textaufgaben","kopfrechnen"];
let allPass = true;
for (const sub of SUBS) {
  const U = {satzbau:52,prozesslogik:22,wortgruppen:18,textverstaendnis:14,
    alltagswissen:16,bilder_zaehlen:4,symbole_entdecken:4,schilder_erinnern:5,
    sortierverfahren:16,textaufgaben:6,kopfrechnen:52}[sub] || 1;
  const fails = [];
  for (let si = 0; si < Math.min(U, 10); si++) {
    for (let seed = 7; seed < 107; seed++) {
      const a = generate(sub, 30, seed, si);
      const b = generate(sub, 30, seed, si);
      const pa = JSON.stringify([a.prompt, a.options, a.stimulus, a.answer]);
      const pb = JSON.stringify([b.prompt, b.options, b.stimulus, b.answer]);
      if (pa !== pb) {
        fails.push(`si=${si} seed=${seed}`);
      }
    }
  }
  const status = fails.length === 0 ? "PASS" : `FAIL (${fails.length}/${U*100})`;
  if (fails.length) allPass = false;
  console.log(`${status.padEnd(14)} ${sub}`);
  if (fails.length && fails.length < 4) {
    const f = fails[0]; const si = parseInt(f.split("si=")[1]); const seed = parseInt(f.split("seed=")[1]);
    const a = generate(sub, 30, seed, si); const b = generate(sub, 30, seed, si);
    console.log(`  example ${f}:`);
    console.log(`  A prompt: ${JSON.stringify(a.prompt)}`);
    console.log(`  B prompt: ${JSON.stringify(b.prompt)}`);
    console.log(`  A stimulus differs: ${a.stimulus !== b.stimulus}`);
  }
}
console.log(allPass ? "\nALL PASS" : "\nINVARIANT BROKEN");
