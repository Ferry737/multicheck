import { generateBatch, generate, hasUniqueOptions } from "../lib/questions.ts";

let checked = 0, fail = 0;
const failMsg = (m) => { fail++; if (fail <= 20) console.log("FAIL:", m); };

// ---- MATH: independent recomputation across all dimensions ----
function num(s) { return parseFloat(String(s).replace(",", ".")); }
function checkMath(sub, prompt, answer, expected) {
  checked++;
  if (Math.abs(num(answer) - expected) > 1e-9) failMsg(`${sub}: "${prompt}" ans=${answer} expected=${expected}`);
}
for (let seed = 1; seed <= 600; seed++) {
  // textaufgaben: percent, money, word, frac
  for (const q of generateBatch("textaufgaben", 2, 8, seed * 13)) {
    const a = num(q.answer);
    if (q.prompt.includes("% von")) {
      const m = q.prompt.match(/(\d+)% von (\d+)/); const p = +m[1], b = +m[2];
      checkMath("pct", q.prompt, q.answer, Math.round((b * p / 100) * 10) / 10);
    } else if (q.prompt.includes("CHF")) {
      const m = q.prompt.match(/CHF (\d+).*?(\d+)% reduziert/); const price = +m[1], disc = +m[2];
      checkMath("money", q.prompt, q.answer, price - (price * disc) / 100);
    } else if (q.prompt.includes("insgesamt")) {
      const m = q.prompt.match(/(\d+) rote und (\d+) blaue/); checkMath("word", q.prompt, q.answer, +m[1] + +m[2]);
    } else if (q.prompt.includes("Addiere")) {
      const m = q.prompt.match(/(\d+)\/(\d+) \+ (\d+)\/(\d+)/); const n1=+m[1],d2=+m[2],n2=+m[3]; const sum=n1+n2;
      checkMath("frac", q.prompt, q.answer, sum > d2 ? Math.floor(sum/d2)+" "+(sum%d2)+"/"+d2 : sum+"/"+d2);
    }
  }
  // kopfrechnen: conv + mental
  for (const q of generateBatch("kopfrechnen", 2, 8, seed * 17)) {
    if (q.prompt.includes("Rechne um")) {
      const m = q.prompt.match(/(\d+) (\w+) = \? (\w+)/); const x=+m[1];
      const f = {"kg":"g","m":"cm","h":"min","t":"kg"}[m[2]];
      const fact = m[2]==="kg"?1000:m[2]==="m"?100:m[2]==="h"?60:1000;
      checkMath("conv", q.prompt, q.answer, x*fact);
    } else {
      const m = q.prompt.match(/(\d+) ([+−×]) (\d+)/); const a=+m[1],op=m[2],b=+m[3];
      checkMath("mental", q.prompt, q.answer, op==="+"?a+b:op==="−"?a-b:a*b);
    }
  }
}

// ---- VISUAL: Bilder zählen + Symbole entdecken ----
// Independent count by re-parsing the SVG stimulus (not trusting stored answer).
function independentCount(svg, sym) {
  const re = new RegExp("[" + sym + "]", "g");
  return (svg.match(re) || []).length;
}
const SYMS = { "●": "Kreise", "▲": "Dreiecke", "■": "Quadrate", "★": "Sterne" };
for (let seed = 1; seed <= 400; seed++) {
  for (const q of generateBatch("bilder_zaehlen", 2, 8, seed * 7)) {
    // prompt contains "Zähle die <name>"; map name→symbol
    const name = q.prompt.match(/Zähle die (\w+)/)[1];
    const sym = Object.keys(SYMS).find((k) => SYMS[k] === name);
    const cnt = independentCount(q.stimulus, sym);
    checked++;
    if (String(cnt) !== q.answer) failMsg(`bilder: prompt says ${name} (${sym}) independent=${cnt} stored=${q.answer}`);
    // answer must be present in options
    if (!q.options.includes(q.answer)) failMsg(`bilder: answer ${q.answer} not in options ${q.options}`);
  }
  for (const q of generateBatch("symbole_entdecken", 2, 8, seed * 11)) {
    const symInPrompt = q.prompt.match(/Art \(([●▲■★])\)/)[1];
    const cnt = independentCount(q.stimulus, symInPrompt);
    checked++;
    if (String(cnt) !== q.answer) failMsg(`symbole: independent=${cnt} stored=${q.answer} (prompt asks ${symInPrompt})`);
    if (!q.options.includes(q.answer)) failMsg(`symbole: answer not in options`);
  }
}

// ---- STRUCTURAL: every subskill, every question ----
const SUBS = ["textaufgaben","kopfrechnen","satzbau","textverstaendnis","prozesslogik","wortgruppen","bilder_zaehlen","symbole_entdecken","schilder_erinnern","sortierverfahren","alltagswissen"];
for (const sub of SUBS) {
  for (let seed = 1; seed <= 30; seed++) {
    for (const q of generateBatch(sub, 2, 6, seed * 101 + 3)) {
      checked++;
      if (!q.answer) failMsg(`${sub}: missing answer`);
      if (q.options && !q.options.includes(q.answer)) failMsg(`${sub}: answer not in options`);
      if (q.options && q.options.some((o) => !o || o.trim() === "")) failMsg(`${sub}: empty option`);
      if (!q.prompt) failMsg(`${sub}: missing prompt`);
    }
  }
}

// ---- ADVERSARIAL (Phase 22): duplicate options + memory balance + process wrong≠correct ----
console.log("--- adversarial checks ---");
let dupChecks = 0, dupFail = 0;
let memJa = 0, memNein = 0, memChecked = 0;
let procBad = 0, procChecked = 0;
for (const sub of SUBS) {
  for (let seed = 1; seed <= 80; seed++) {
    for (const q of generateBatch(sub, 2, 6, seed * 307 + 7)) {
      // duplicate-option check (Phase 5-H / 22)
      dupChecks++;
      if (q.options && !hasUniqueOptions(q)) { dupFail++; if (dupFail<=10) failMsg(`${sub}: duplicate options ${JSON.stringify(q.options)}`); }
      // memory balance (Phase 5-E / 22)
      if (sub === "schilder_erinnern") {
        memChecked++;
        if (q.answer === "Ja") memJa++; else if (q.answer === "Nein") memNein++;
        // answer must be present in options
        if (!q.options.includes(q.answer)) failMsg(`memory: answer ${q.answer} not in options`);
      }
      // process logic: correct order must differ from the distractor (Phase 5-?/22)
      if (sub === "prozesslogik") {
        procChecked++;
        const opts = q.options || [];
        const correct = opts.find((o) => o === q.answer);
        const others = opts.filter((o) => o !== q.answer);
        if (others.some((o) => o === correct)) { procBad++; failMsg(`prozess: correct equals a distractor`); }
      }
    }
  }
}
checked += dupChecks + memChecked + procChecked;
if (dupFail) fail++;
if (memChecked && (memJa < memChecked*0.3 || memNein < memChecked*0.3)) { failMsg(`memory imbalance Ja=${memJa} Nein=${memNein}/${memChecked}`); fail++; }
if (procBad) fail++;

console.log(`VALIDATION: ${checked} checks, ${fail} failures`);
console.log(fail === 0 ? "VALIDATION PASS ✅" : "VALIDATION FAIL ❌");
process.exit(fail === 0 ? 0 : 1);
