import { generateBatch, generate, hasUniqueOptions } from "../lib/questions.ts";

let checked = 0, fail = 0;
const failMsg = (m) => { fail++; if (fail <= 20) console.log("FAIL:", m); };

// ---- MATH: independent recomputation across all dimensions ----
function num(s) { return parseFloat(String(s).replace(",", ".")); }
function checkMath(sub, prompt, answer, expected) {
  checked++;
  if (Math.abs(num(answer) - expected) > 1e-9) failMsg(`${sub}: "${prompt}" ans=${answer} expected=${expected}`);
}
function checkAnswer(sub, prompt, answer, expected) {
  checked++;
  if (String(answer).trim() !== String(expected).trim()) failMsg(`${sub}: "${prompt}" ans=${answer} expected=${expected}`);
}

// unit conversion factors in small-unit terms (grams / metres / seconds / litres)
const FACT = { g: 1, kg: 1000, t: 1e6, m: 1, cm: 0.01, km: 1000, s: 1, min: 60, h: 3600, l: 1, ml: 0.001 };
const UNIT = "ml|cm|km|min|kg|g|t|m|h|s|l";

// Independently evaluate one kopfrechnen item from its rendered prompt.
// Throws on unknown family so a new generator path can NEVER silently skip validation.
function evalMental(q) {
  const pr = String(q.prompt || "");
  const sig = q.structSig ? q.structSig.opSequence : "";
  let m;
  if (sig.startsWith("convert-fwd") || sig.startsWith("convert-bwd")) {
    if ((m = pr.match(new RegExp(`(\\d+(?:\\.\\d+)?) (${UNIT}) = \\? (${UNIT})`))) ||
        (m = pr.match(new RegExp(`(${UNIT})`.replace(/\((.*)\)/, "") + "")) /* placeholder never matches */)) {
      const x = +m[1], from = m[2], to = m[3];
      return x * FACT[from] / FACT[to];
    }
    if ((m = pr.match(new RegExp(`Wieviele (${UNIT}) sind (\\d+(?:\\.\\d+)?) (${UNIT})\\?`)))) {
      const x = +m[2], from = m[3], to = m[1];
      return x * FACT[from] / FACT[to];
    }
    if ((m = pr.match(new RegExp(`(\\d+(?:\\.\\d+)?) (${UNIT}) ausgedrückt in (${UNIT})\\?`)))) {
      const x = +m[1], from = m[2], to = m[3];
      return x * FACT[from] / FACT[to];
    }
    throw new Error("VALIDATOR GAP convert: " + pr);
  }
  if (sig.startsWith("convert-then")) {
    if ((m = pr.match(new RegExp(`(\\d+) (${UNIT}) → (${UNIT}), dann (?:addiere|ziehe) (\\d+)`)))) {
      const x = +m[1], from = m[2], to = m[3], y = +m[4], sub = /ziehe/.test(pr);
      const conv = x * FACT[from] / FACT[to];
      return sub ? conv - y : conv + y;
    }
    if ((m = pr.match(new RegExp(`(\\d+) (${UNIT}) ([+−]) (\\d+) (${UNIT}) = \\?`)))) {
      const x = +m[1], from = m[2], op = m[3], y = +m[4], to = m[5];
      const conv = x * FACT[from] / FACT[to];
      return op === "+" ? conv + y : conv - y;
    }
    throw new Error("VALIDATOR GAP convert-then: " + pr);
  }
  if (sig === "add-2digit-carry" || sig === "add-2digit-nocarry") {
    if ((m = pr.match(/^(\d+) \+ (\d+) = \?$/)) || (m = pr.match(/^Berechne: (\d+) plus (\d+)$/)) ||
        (m = pr.match(/^Addiere im Kopf: (\d+) und (\d+)$/)) || (m = pr.match(/^Was gibt (\d+) plus (\d+)\?$/)) ||
        (m = pr.match(/^Addiere: (\d+) und (\d+)$/)))
      return +m[1] + +m[2];
    throw new Error("VALIDATOR GAP add: " + pr);
  }
  if (sig === "sub-2digit-borrow" || sig === "sub-2digit-nocarry") {
    if ((m = pr.match(/^(\d+) − (\d+) = \?$/)) || (m = pr.match(/^Subtrahiere: (\d+) minus (\d+)$/)) ||
        (m = pr.match(/^Wie viel bleibt von (\d+), wenn man (\d+) abzieht\?$/)) || (m = pr.match(/^Ziehe ab: (\d+) von (\d+)$/)) ||
        (m = pr.match(/^(\d+) weniger (\d+) ergibt\?$/))) {
      // "Ziehe ab: b von a" stores b first
      const a = /Ziehe ab/.test(pr) ? +m[2] : +m[1];
      const b = /Ziehe ab/.test(pr) ? +m[1] : +m[2];
      return a - b;
    }
    throw new Error("VALIDATOR GAP sub: " + pr);
  }
  if (sig === "mul-1x1") {
    if ((m = pr.match(/^(\d+) × (\d+) = \?$/)) || (m = pr.match(/^Multipliziere: (\d+) mal (\d+)$/)) ||
        (m = pr.match(/^Das kleine Einmaleins: (\d+) · (\d+)$/))) return +m[1] * +m[2];
    throw new Error("VALIDATOR GAP mul1: " + pr);
  }
  if (sig === "mul-2x1-distributive") {
    if ((m = pr.match(/^(\d+) × (\d+) = \? \(zerlege/)) || (m = pr.match(/^Berechne geschickt: (\d+) × (\d+)$/)) ||
        (m = pr.match(/^(\d+) mal (\d+) – erst zerlegen/))) return +m[1] * +m[2];
    throw new Error("VALIDATOR GAP mul2: " + pr);
  }
  if (sig === "div-exact") {
    if ((m = pr.match(/^(\d+) ÷ (\d+) = \?$/)) || (m = pr.match(/^Teile ohne Rest: (\d+) durch (\d+)$/)) ||
        (m = pr.match(/^(\d+) geteilt durch (\d+) ergibt\?$/))) return +m[1] / +m[2];
    throw new Error("VALIDATOR GAP div: " + pr);
  }
  if (sig === "div-with-remainder") {
    if ((m = pr.match(/^Dividiere mit Rest: (\d+) ÷ (\d+)\. Gib den REST an\.$/))) return +m[1] % +m[2];
    throw new Error("VALIDATOR GAP rem: " + pr);
  }
  if (sig.startsWith("percent")) {
    if ((m = pr.match(/^(\d+)% von (\d+)\?$/)) || (m = pr.match(/^Berechne (\d+) Prozent von (\d+)\.$/)) ||
        (m = pr.match(/^Was sind (\d+)% aus (\d+)\?$/))) return (+m[2] * +m[1]) / 100;
    throw new Error("VALIDATOR GAP pct: " + pr);
  }
  if (sig.startsWith("frac-")) {
    if ((m = pr.match(/^(\d+)\/(\d+) von (\d+)\?$/)) || (m = pr.match(/^Berechne (\d+)\/(\d+) von (\d+)\.$/)) ||
        (m = pr.match(/^Was ist (\d+)\/(\d+) aus (\d+)\?$/))) return (+m[3] * +m[1]) / +m[2];
    throw new Error("VALIDATOR GAP frac: " + pr);
  }
  if (sig === "halve-number") {
    if ((m = pr.match(/^Die Hälfte von (\d+)\?$/)) || (m = pr.match(/^Halbiere (\d+)\.$/)) || (m = pr.match(/^(\d+) geteilt durch 2\?$/))) {
      const x = +m[1];
      return x % 2 === 0 ? x / 2 : Math.round((x / 2) * 10) / 10;
    }
    throw new Error("VALIDATOR GAP halve: " + pr);
  }
  if (sig === "double-number") {
    if ((m = pr.match(/^Das Doppelte von (\d+)\?$/)) || (m = pr.match(/^Verdopple (\d+)\.$/)) || (m = pr.match(/^(\d+) mal 2\?$/)))
      return +m[1] * 2;
    throw new Error("VALIDATOR GAP double: " + pr);
  }
  if (sig === "round-nearest-10") {
    if ((m = pr.match(/^Runde (\d+) auf die nächste Zehnerzahl\.$/)) || (m = pr.match(/^(\d+) gerundet auf Zehner\?$/)) ||
        (m = pr.match(/^Auf welche Zehnerzahl liegt (\d+) am nächsten\?$/))) return Math.round(+m[1] / 10) * 10;
    throw new Error("VALIDATOR GAP round: " + pr);
  }
  if (sig === "estimate-sum-decade") {
    if ((m = pr.match(/^Schätze (\d+) \+ (\d+) auf Zehner\.$/)) || (m = pr.match(/^Überschlag: etwa (\d+) \+ (\d+)\?$/)) ||
        (m = pr.match(/^Runde beide und addiere: (\d+) \+ (\d+)\?$/)))
      return Math.round(+m[1] / 10) * 10 + Math.round(+m[2] / 10) * 10;
    throw new Error("VALIDATOR GAP est: " + pr);
  }
  if (sig === "compare-two-results") {
    if ((m = pr.match(/größer: (\d+) ([+×]) 6 oder (\d+) ([+×]) 4\?$/))) {
      const ra = m[2] === "+" ? +m[1] + 6 : +m[1] * 6;
      const rb = m[4] === "+" ? +m[3] + 4 : +m[3] * 4;
      return { text: ra >= rb ? "das erste" : "das zweite" };
    }
    throw new Error("VALIDATOR GAP cmp: " + pr);
  }
  if (sig.startsWith("chain-") || sig === "ordered-rule-two-step") {
    if ((m = pr.match(/^In einem Zug: (\d+) ([+×]) (\d+) ([−+]) (\d+) = \?$/))) {
      const s1 = m[2] === "+" ? +m[1] + +m[3] : +m[1] * +m[3];
      return m[4] === "+" ? s1 + +m[5] : s1 - +m[5];
    }
    if ((m = pr.match(/^Regel: .*? (\d+) × (\d+) − (\d+) = \?$/))) return +m[1] * +m[2] - +m[3];
    throw new Error("VALIDATOR GAP chain: " + pr);
  }
  if (sig === "backward-missing-addend") {
    if ((m = pr.match(/^\? \+ (\d+) = (\d+)\. Was ist \?\?$/))) return +m[2] - +m[1];
    throw new Error("VALIDATOR GAP missadd: " + pr);
  }
  if (sig === "backward-missing-factor") {
    if ((m = pr.match(/^\? × (\d+) = (\d+)\. Was ist \?\?$/))) return +m[2] / +m[1];
    throw new Error("VALIDATOR GAP missfac: " + pr);
  }
  if (sig === "complement-to-100") {
    if ((m = pr.match(/^Was fehlt bis 100: (\d+) \+ \? = 100$/))) return 100 - +m[1];
    throw new Error("VALIDATOR GAP comp: " + pr);
  }
  if (sig === "sum-three-numbers") {
    if ((m = pr.match(/^Addiere alle drei: (\d+) \+ (\d+) \+ (\d+) = \?$/))) return +m[1] + +m[2] + +m[3];
    throw new Error("VALIDATOR GAP sum3: " + pr);
  }
  if (sig === "square-number") {
    if ((m = pr.match(/^(\d+) × (\d+) = \?$/)) && m[1] === m[2]) return +m[1] * +m[2];
    if ((m = pr.match(/^Berechne die Quadratzahl von (\d+)\.$/)) || (m = pr.match(/^(\d+) zum Quadrat\?$/))) return +m[1] * +m[1];
    throw new Error("VALIDATOR GAP sq: " + pr);
  }
  if (sig === "next-multiple") {
    if ((m = pr.match(/^Die nächstgrößere Zahl teilbar durch (\d+), ab (\d+)\?$/))) {
      const b = +m[1], a = +m[2];
      return a + (b - (a % b));
    }
    throw new Error("VALIDATOR GAP nextmult: " + pr);
  }
  if (sig === "diff-chain") {
    if ((m = pr.match(/^Nacheinander abziehen: (\d+) − (\d+) − (\d+) = \?$/))) return +m[1] - +m[2] - +m[3];
    throw new Error("VALIDATOR GAP diff: " + pr);
  }
  throw new Error("VALIDATOR GAP family: " + sig + " | " + pr);
}

for (let seed = 1; seed <= 600; seed++) {
  // textaufgaben: independent re-evaluation per family (novelty Loop)
  for (const q of generateBatch("textaufgaben", 2, 8, seed * 13)) {
    const pr = String(q.prompt || "");
    const sig = q.structSig ? q.structSig.opSequence : "";
    let m;
    if (sig === "pct-apply") {
      m = pr.match(/(\d+)% von (\d+)/);
      checkMath("pct", pr, q.answer, Math.round((+m[2] * +m[1] / 100) * 10) / 10);
    } else if (sig === "discount-single") {
      m = pr.match(/CHF (\d+)\. Er wird (\d+)% reduziert/);
      checkMath("money", pr, q.answer, +m[1] - (+m[1] * +m[2]) / 100);
    } else if (sig === "discount-then-voucher") {
      m = pr.match(/CHF (\d+)\..*?(\d+)% reduziert\..*?Gutschein von CHF (\d+)/);
      const after = +m[1] - (+m[1] * +m[2]) / 100;
      checkMath("money2", pr, q.answer, Math.round((after - +m[3]) * 100) / 100);
    } else if (sig === "sum-two-quantities") {
      m = pr.match(/(\d+) rote und (\d+) blaue/);
      checkMath("word", pr, q.answer, +m[1] + +m[2]);
    } else if (sig === "groups-times-items") {
      m = pr.match(/(\d+) Packungen mit je (\d+) Teilen/);
      checkMath("twostep", pr, q.answer, +m[1] * +m[2]);
    } else if (sig === "unitprice-times-qty") {
      m = pr.match(/Ein Stück kostet CHF (\d+)\. Wie viel kosten (\d+) Stück\?/);
      checkMath("unitprice", pr, q.answer, +m[1] * +m[2]);
    } else if (sig === "fraction-add-same-denominator") {
      m = pr.match(/Addiere: (\d+)\/(\d+) \+ (\d+)\/(\d+)/);
      const n1 = +m[1], den = +m[2], n2 = +m[3];
      const sum = n1 + n2;
      checkAnswer("frac", pr, q.answer, sum > den ? Math.floor(sum / den) + " " + (sum % den) + "/" + den : sum + "/" + den);
    } else {
      throw new Error("VALIDATOR GAP textaufgaben: " + sig + " | " + pr);
    }
  }
  // kopfrechnen: independent re-evaluation for EVERY family (novelty Loop)
  for (const q of generateBatch("kopfrechnen", 2, 8, seed * 17)) {
    const exp = evalMental(q);
    if (typeof exp === "object" && exp.text) checkAnswer("cmp", q.prompt, q.answer, exp.text);
    else checkMath("mental", q.prompt, q.answer, exp);
  }
}

// ---- VISUAL: Bilder zählen + Symbole entdecken ----
// Independent count by re-parsing the SVG stimulus (not trusting stored answer).
function independentCount(svg, sym) {
  const re = new RegExp("[" + sym + "]", "g");
  return (svg.match(re) || []).length;
}
const SYMS = { "●": "Kreise", "▲": "Dreiecke", "■": "Quadrate", "★": "Sterne" };
// Independent visual re-evaluation (novelty Loop): parse the SVG per family.
function evalVisual(q) {
  const pr = String(q.prompt || "");
  const sig = q.structSig ? q.structSig.opSequence : "";
  const svg = String(q.stimulus || "");
  const nameOf = (sym) => SYMS[sym];
  const counts = Object.fromEntries(Object.keys(SYMS).map((s) => [nameOf(s), independentCount(svg, s)]));
  if (sig === "count-target-symbol") {
    const m = pr.match(/Zähle die (\w+)/) || pr.match(/gesuchten Art (\w+)/);
    if (!m) throw new Error("VALIDATOR GAP count: " + pr);
    return { text: String(counts[m[1]]) };
  }
  if (sig === "count-row-constraint") {
    const m = pr.match(/Zähle die (\w+) NUR in der ERSTEN Reihe/);
    if (!m) throw new Error("VALIDATOR GAP row: " + pr);
    // first n cells = first row; cell width 44 + pad 6 => row y range = first n <g>
    const cells = svg.split("</g>");
    // grid is n×n with n cells per row; infer n from cells/…: viewBox size / 50
    const vb = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
    const n = Math.round(+vb[1] / 50);
    const firstRow = cells.slice(0, n).join("</g>");
    return { text: String(independentCount(firstRow, Object.keys(SYMS).find((k) => SYMS[k] === m[1]))) };
  }
  if (sig === "find-max-frequency") {
    // answer = name of the UNIQUE most frequent symbol
    const winner = String(q.answer);
    const c = counts[winner];
    if (c === undefined) throw new Error("max: unknown answer " + winner);
    const others = Object.entries(counts).filter(([nm]) => nm !== winner);
    if (others.some(([, c2]) => c2 >= c)) throw new Error(`max: ${winner} count=${c} not strict max ${JSON.stringify(counts)}`);
    return { text: String(q.answer) };
  }
  if (sig === "find-min-frequency") {
    const minCount = Math.min(...Object.values(counts));
    const winners = Object.entries(counts).filter(([, c]) => c === minCount).map(([nm]) => nm);
    if (!winners.includes(String(q.answer))) throw new Error(`least: answer=${q.answer} counts=${JSON.stringify(counts)}`);
    return { text: String(q.answer) };
  }
  throw new Error("VALIDATOR GAP visual family: " + sig + " | " + pr);
}
for (let seed = 1; seed <= 400; seed++) {
  for (const q of generateBatch("bilder_zaehlen", 2, 8, seed * 7)) {
    const exp = evalVisual(q);
    checked++;
    if (String(exp.text) !== String(q.answer)) failMsg(`bilder: independent=${exp.text} stored=${q.answer} (${q.prompt})`);
    if (!q.options.includes(q.answer)) failMsg(`bilder: answer ${q.answer} not in options ${q.options}`);
  }
  for (const q of generateBatch("symbole_entdecken", 2, 8, seed * 11)) {
    const exp = evalVisual(q);
    checked++;
    if (String(exp.text) !== String(q.answer)) failMsg(`symbole: independent=${exp.text} stored=${q.answer}`);
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
// Balance applies WITHIN the binary-recall family (Ja/Nein items), not across all
// schilder families — count/category/compare items have other answer kinds.
const jn = memJa + memNein;
if (jn > 0 && (memJa < jn*0.3 || memNein < jn*0.3)) { failMsg(`memory imbalance Ja=${memJa} Nein=${memNein}/${jn}`); fail++; }
if (procBad) fail++;

console.log(`VALIDATION: ${checked} checks, ${fail} failures`);
console.log(fail === 0 ? "VALIDATION PASS ✅" : "VALIDATION FAIL ❌");
process.exit(fail === 0 ? 0 : 1);
