// lib/questions.ts
// Reusable question engine covering all 7 Attest EBA areas.
// Math answers are COMPUTED and validated. Visual tasks use inline SVG (no external images).
// Every question: id, area, subskill, type, difficulty(1-3), prompt, stimulus?, options?,
//   answer, explanation, hint, estimatedTime, examRelevance, commonErrors, kind.

export type QType =
  | "multiple-choice" | "numeric" | "text" | "sequence" | "count"
  | "symbol" | "recall" | "writing" | "sort" | "reading";

export type QKind = "choice" | "input" | "visual" | "writing" | "sort";

export interface StructSig {
  opSequence: string;        // e.g. "pct-apply", "conv-then-apply", "odd-one-out", "order-constraint"
  stepCount: number;         // number of solution steps
  constraintCount: number;   // number of binding constraints (e.g. voucher after discount)
  distractorKind: string;     // which misconception the distractors encode
  workingMemoryLoad: number; // 1..3
  inputModality: string;     // "numeric" | "text" | "visual" | "sequence" | "recall"
  answerCardinality: number; // how many distinct valid answers exist (usually 1)
}

export interface Question {
  id: string;
  area: string;
  subskill: string;
  type: QType;
  kind: QKind;
  difficulty: number; // 1 easy .. 3 hard
  difficultyScore: number; // continuous 0..100 calibration
  concept: string; // which concept/method this item exercises
  templateKey?: string; // anti-memorization fingerprint
  structHash?: string; // sha1 of the StructSig (emitted by generator, used by planner for cooldown/held-out)
  structSig?: StructSig; // the emitted structural signature
  heldOut?: boolean;    // reserved transfer-gap variant, unreachable from training planner
  meta?: { capacityWarning?: boolean }; // runtime signal (e.g. LRU fallback when all structs on cooldown)
  prompt: string;
  stimulus?: string; // SVG markup or text shown before answer
  options?: string[];
  answer: string;
  explanation: string;
  hint: string;
  estimatedTime: number;
  examRelevance: number;
  commonErrors: string;
  memorizeMs?: number; // if set, stimulus is shown only this long, then hidden (memory realism)
  // for writing
  minWords?: number;
  topic?: string;
}

// Per-type base difficulty calibration (solution steps / cognitive load).
// Continuous score = base + (d-1)*step, then adjusted by distractor closeness conceptually.
const TYPE_BASE: Record<string, number> = {
  pct: 35, money: 45, word: 30, frac: 55, conv: 40, mental: 38,
  order: 42, reading: 50, process: 48, odd: 40,
  count: 35, symbol: 45, recall: 60, numbers: 30, safety: 55,
};
const TYPE_STEP = 18;

// ---- seeded RNG ----
function rng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
const ri = (r: () => number, a: number, b: number) => Math.floor(r() * (b - a + 1)) + a;
const pick = <T,>(r: () => number, arr: T[]): T => arr[Math.floor(r() * arr.length)];
const shuffle = <T,>(arr: T[], r: () => number): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
const round1 = (n: number) => Math.round(n * 10) / 10;

// ---- structural fingerprint (Phase 0 Loop: emitted by generator, not inferred) ----
// Node crypto is available at runtime (Next server + tsx). For safety in any env,
// we use a small synchronous sha1 if available, else a stable string hash.
import crypto from "crypto";
function sha1(s: string): string {
  try { return crypto.createHash("sha1").update(s, "utf8").digest("hex"); }
  catch { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); }
}
export function structHashOf(sig: StructSig): string {
  return sha1(JSON.stringify(sig));
}

// Reject duplicate option strings (P0 learning bug: ambiguous/duplicate choices).
export function dedupeOptions(opts: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const o of opts) {
    const k = o.replace(/\s+/g, " ").trim().toLowerCase();
    if (!seen.has(k)) { seen.add(k); out.push(o); }
  }
  return out;
}
// Enforce at least 2 distinct options; if dedup collapsed too far, caller must regenerate.
export function hasUniqueOptions(q: { options?: string[] }): boolean {
  if (!q.options || q.options.length < 2) return true; // input/visual tasks have no options
  const norm = q.options.map((o) => o.replace(/\s+/g, " ").trim().toLowerCase());
  return new Set(norm).size === norm.length;
}

// ===== MATHEMATIK =====
function genPercent(r: () => number, d: number): Question {
  const easy = d < 45;
  const base = easy ? ri(r, 2, 20) * 10 : d < 75 ? ri(r, 15, 250) : ri(r, 80, 999);
  const p = easy ? pick(r, [10, 20, 25, 50]) : d < 75 ? pick(r, [10, 15, 20, 25, 30, 40, 75]) : pick(r, [12, 18, 23, 37, 65, 85]);
  const ans = round1((base * p) / 100);
  const opts = dedupeOptions(shuffle([String(ans), String(round1((base * (p + 10)) / 100)), String(round1((base * (p - 10)) / 100)), String(round1((base * (p + 5)) / 100))], r));
  return mk("mathematik", "textaufgaben", "pct", d, "Wie viel sind " + p + "% von " + base + "?", opts, String(ans),
    p + "% von " + base + " = " + base + " × " + p + "/100 = " + ans + ".",
    "10% sind " + base / 10 + ".", 28, 5, "Komma falsch setzen.", "choice", "percent",
    { opSequence: "pct-apply", stepCount: 1, constraintCount: 0, distractorKind: "off-by-10pct", workingMemoryLoad: 1, inputModality: "numeric", answerCardinality: 1 });
}
function genMoney(r: () => number, d: number): Question {
  if (d >= 70) {
    const price = pick(r, [120, 180, 240, 300, 450]);
    const disc = pick(r, [10, 15, 20, 25, 30]);
    const voucher = pick(r, [10, 20, 30, 50]);
    const afterDisc = price - (price * disc) / 100;
    const ans = Math.round((afterDisc - voucher) * 100) / 100;
    const opts = dedupeOptions(shuffle([String(ans), String(Math.round((price - voucher) - (price*disc)/100)), String(price - (price*disc)/100), String(ans + voucher)], r).map(String));
    return mk("mathematik", "textaufgaben", "money2", d,
      `Ein Artikel kostet CHF ${price}. Er wird ${disc}% reduziert. Danach wird ein Gutschein von CHF ${voucher} abgezogen. Finaler Preis?`,
      opts, String(ans),
      `${price} − ${disc}% = ${afterDisc} CHF. − ${voucher} = ${ans} CHF.`,
      "Zuerst Rabatt, dann Gutschein.", 35, 5, "Reihenfolge der Abzüge verwechseln.", "choice", "money-multistep",
      { opSequence: "discount-then-voucher", stepCount: 2, constraintCount: 1, distractorKind: "wrong-order-of-deductions", workingMemoryLoad: 2, inputModality: "numeric", answerCardinality: 1 });
  }
  const price = d < 45 ? pick(r, [40, 60, 80, 100]) : pick(r, [80, 120, 150, 200]);
  const disc = d < 45 ? pick(r, [10, 20, 25]) : pick(r, [10, 15, 20, 25, 30]);
  const ans = price - (price * disc) / 100;
  const opts = dedupeOptions(shuffle([String(ans), String(price - (price * (disc + 5)) / 100), String(price - (price * (disc - 5)) / 100), String(price)], r).map(String));
  return mk("mathematik", "textaufgaben", "money", d, "Ein Artikel kostet CHF " + price + ". Er wird " + disc + "% reduziert. Neuer Preis?", opts, String(ans),
    "CHF " + price + " − " + disc + "% = " + ans + " CHF.", "Berechne " + disc + "% von " + price + ".", 25, 4, "Rabatt falsch abziehen.", "choice", "money-single",
    { opSequence: "discount-single", stepCount: 1, constraintCount: 0, distractorKind: "off-by-5pct", workingMemoryLoad: 1, inputModality: "numeric", answerCardinality: 1 });
}
function genWord(r: () => number, d: number): Question {
  const a = ri(r, 3, 9), b = ri(r, 3, 9), total = a + b;
  const diffs = [...new Set([total + 1, total - 1, a * b].filter((v) => v > 0 && v !== total))];
  const opts = shuffle([String(total), ...diffs.slice(0, 3).map(String)], r);
  return mk("mathematik", "textaufgaben", "word", d,
    "Im Lager sind " + a + " rote und " + b + " blaue Kisten. Wie viele Kisten insgesamt?", opts, String(total),
    a + " + " + b + " = " + total + ".", "Addiere die beiden Mengen.", 22, 5, "Falsche Rechenart wählen.", "choice", "sum-count",
    { opSequence: "sum-two-quantities", stepCount: 1, constraintCount: 0, distractorKind: "wrong-operation", workingMemoryLoad: 1, inputModality: "numeric", answerCardinality: 1 });
}
function genTwoStep(r: () => number, d: number): Question {
  const packs = ri(r, 2, 6), per = ri(r, 3, 9);
  const ans = packs * per;
  const opts = dedupeOptions(shuffle([String(ans), String(ans + per), String(packs + per), String(ans - per)], r));
  return mk("mathematik", "textaufgaben", "twostep", d,
    `${packs} Packungen mit je ${per} Teilen ergeben wie viele Teile insgesamt?`, opts, String(ans),
    `${packs} × ${per} = ${ans}.`, "Malnehmen der Gruppen.", 24, 5, "Addiert statt multipliziert.", "choice", "group-multiplication",
    { opSequence: "groups-times-items", stepCount: 1, constraintCount: 0, distractorKind: "added-instead-of-multiplied", workingMemoryLoad: 1, inputModality: "numeric", answerCardinality: 1 });
}
function genUnitPrice(r: () => number, d: number): Question {
  const n = ri(r, 2, 8), unit = pick(r, [3, 4, 5, 6, 7]);
  const ans = n * unit;
  const opts = dedupeOptions(shuffle([String(ans), String(ans + unit), String(ans - unit), String(Math.round(ans / 2))], r));
  return mk("mathematik", "textaufgaben", "unitprice", d,
    `Ein Stück kostet CHF ${unit}. Wie viel kosten ${n} Stück?`, opts, String(ans),
    `${n} × CHF ${unit} = CHF ${ans}.`, "Stückpreis mal Menge.", 23, 5, "Menge falsch angesetzt.", "choice", "unit-price",
    { opSequence: "unitprice-times-qty", stepCount: 1, constraintCount: 0, distractorKind: "half-or-off-by-one", workingMemoryLoad: 1, inputModality: "numeric", answerCardinality: 1 });
}
function genFrac(r: () => number, d: number): Question {
  const den = pick(r, [2, 3, 4, 5, 10]);
  const n1 = ri(r, 1, den - 1), n2 = ri(r, 1, den - 1);
  const sum = n1 + n2; const ans = sum > den ? Math.floor(sum / den) + " " + (sum % den) + "/" + den : sum + "/" + den;
  const opts = shuffle([ans, n1 + "/" + den, n2 + "/" + den, (n1 * n2) + "/" + den], r);
  return mk("mathematik", "textaufgaben", "frac", d, "Addiere: " + n1 + "/" + den + " + " + n2 + "/" + den + " = ?", opts, String(ans),
    "Gleicher Nenner " + den + ": " + n1 + "+" + n2 + "=" + sum + ".", "Nur Zähler addieren.", 22, 4, "Nenner addieren.", "choice", "fraction-add-same-den",
    { opSequence: "fraction-add-same-denominator", stepCount: 1, constraintCount: 0, distractorKind: "denominator-added", workingMemoryLoad: 1, inputModality: "numeric", answerCardinality: 1 });
}

// ===== KOPFRECHNEN =====
// 40 distinct RULE-level solution paths (the mental procedure itself differs:
// which rule is retrieved, which direction, carry/borrow, strategy) + 10 HELD-OUT
// paths (exactly 20% of the 50-path space, unreachable from training dispatch).
// Each path has a unique opSequence; surface phrasing varies 2-3x per path.
function genMental(r: () => number, d: number, heldOutFlag = false): Question {
  const ph = (arr: string[]) => pick(r, arr);
  const inp = (opSeq: string, prompt: string, ans: number | string, expl: string, steps: number, cons: number, wml: number, dk: string) =>
    mk("mathematik", "kopfrechnen", opSeq, d, prompt, undefined, String(ans), expl, "Rechne schrittweise im Kopf.", 14, 4, "Leichter Rechenfehler.", "input", opSeq,
      { opSequence: opSeq, stepCount: steps, constraintCount: cons, distractorKind: dk, workingMemoryLoad: wml, inputModality: "numeric", answerCardinality: 1 }, heldOutFlag);
  const U1000: [string, string, number][] = [["kg", "g", 1000], ["t", "kg", 1000], ["km", "m", 1000], ["l", "ml", 1000]];
  const U100: [string, string, number][] = [["m", "cm", 100]];
  const U60: [string, string, number][] = [["h", "min", 60], ["min", "s", 60]];
  const convFwd = (fname: string, u: [string, string, number]): Question => {
    const x = ri(r, 2, d < 45 ? 24 : 89);
    return inp("convert-fwd-" + fname, ph([`Rechne um: ${x} ${u[0]} = ? ${u[1]}`, `Wieviele ${u[1]} sind ${x} ${u[0]}?`, `${x} ${u[0]} ausgedrückt in ${u[1]}?`]), x * u[2],
      `1 ${u[0]} = ${u[2]} ${u[1]} → ${x} × ${u[2]} = ${x * u[2]}.`, 1, 0, 1, "factor-off");
  };
  const convBwd = (fname: string, u: [string, string, number]): Question => {
    const x = u[2] * ri(r, 2, d < 45 ? 24 : 89);
    const ans = x / u[2];
    return inp("convert-bwd-" + fname, ph([`Rechne um: ${x} ${u[1]} = ? ${u[0]}`, `Wieviele ${u[0]} sind ${x} ${u[1]}?`, `${x} ${u[1]} ausgedrückt in ${u[0]}?`]), ans,
      `${x} ${u[1]} ÷ ${u[2]} = ${ans} ${u[0]}.`, 1, 0, 1, "factor-inverted");
  };
  const convThen = (op: "+" | "−"): Question => {
    const u = pick(r, U1000); const x = ri(r, 2, 24); const y = ri(r, 23, 987);
    const conv = x * u[2]; const ans = op === "+" ? conv + y : conv - y;
    const lead = op === "+" ? "addieren" : "subtrahieren";
    return inp("convert-then-" + (op === "+" ? "add" : "sub"), ph([`Erst umrechnen, dann ${lead}: ${x} ${u[0]} → ${u[1]}, dann ${op === "+" ? "addiere" : "ziehe"} ${y} ${u[1]} ${op === "+" ? "dazu" : "ab"}. Ergebnis in ${u[1]}?`, `Rechne um und ${lead}: ${x} ${u[0]} ${op} ${y} ${u[1]} = ?`]), ans,
      `${x} ${u[0]} = ${conv} ${u[1]}; ${conv} ${op} ${y} = ${ans}.`, 2, 0, 2, "wrong-order");
  };
  const addCarry = (): Question => {
    const a = ri(r, 11, 98), b = ri(r, 11, 98);
    const ok = (a % 10) + (b % 10) > 9; if (!ok) { const b2 = b + (10 - (a % 10) - (b % 10)); return addCarryRec(a, b2); } return addCarryRec(a, b);
  };
  const addCarryRec = (a: number, b: number): Question => inp("add-2digit-carry", ph([`${a} + ${b} = ?`, `Berechne: ${a} plus ${b}`, `Addiere im Kopf: ${a} und ${b}`]), a + b,
    `${a} + ${b} = ${a + b} (Übertrag beachten).`, 1, 0, 2, "carry-forgotten");
  const addNoCarry = (): Question => {
    const a = ri(r, 11, 89), b = ri(r, 11, 89);
    return inp("add-2digit-nocarry", ph([`${a} + ${b} = ?`, `Addiere: ${a} und ${b}`, `Was gibt ${a} plus ${b}?`]), a + b, `${a} + ${b} = ${a + b}.`, 1, 0, 1, "sum-off");
  };
  const subBorrow = (): Question => {
    const a = ri(r, 35, 99); const b = ri(r, 12, a - 10); const ok = (a % 10) < (b % 10); if (!ok) return subBorrowRec(a, Math.min(a - 10, b + (10 - ((b % 10) || 1)))); return subBorrowRec(a, b);
  };
  const subBorrowRec = (a: number, b: number): Question => inp("sub-2digit-borrow", ph([`${a} − ${b} = ?`, `Subtrahiere: ${a} minus ${b}`, `Wie viel bleibt von ${a}, wenn man ${b} abzieht?`]), a - b,
    `${a} − ${b} = ${a - b} (Zehner borgen).`, 1, 0, 2, "borrow-forgotten");
  const subNoBorrow = (): Question => {
    const a = ri(r, 40, 99); const b = ri(r, 11, Math.min(38, a - 5)); const ok = (a % 10) >= (b % 10) && (a % 10) !== (b % 10); if (!ok) return subNoBorrowRec(a + 1, b); return subNoBorrowRec(a, b);
  };
  const subNoBorrowRec = (a: number, b: number): Question => inp("sub-2digit-nocarry", ph([`${a} − ${b} = ?`, `Ziehe ab: ${b} von ${a}`, `${a} weniger ${b} ergibt?`]), a - b, `${a} − ${b} = ${a - b}.`, 1, 0, 1, "diff-off");
  const mulSmall = (): Question => {
    const a = ri(r, 2, 12), b = ri(r, 2, 12);
    return inp("mul-1x1", ph([`${a} × ${b} = ?`, `Multipliziere: ${a} mal ${b}`, `Das kleine Einmaleins: ${a} · ${b}`]), a * b, `${a} × ${b} = ${a * b}.`, 1, 0, 1, "table-off");
  };
  const mulDistr = (): Question => {
    const a = ri(r, 12, 29), b = ri(r, 3, 9);
    return inp("mul-2x1-distributive", ph([`${a} × ${b} = ? (zerlege ${a})`, `Berechne geschickt: ${a} × ${b}`, `${a} mal ${b} – erst zerlegen, dann multiplizieren`]), a * b,
      `${a} = ${(a - (a % 10))} + ${a % 10}; ${(a - (a % 10))} × ${b} = ${(a - (a % 10)) * b}, ${a % 10} × ${b} = ${(a % 10) * b}; Summe ${a * b}.`, 2, 0, 2, "partial-product-off");
  };
  const divExact = (): Question => {
    const b = pick(r, [3, 4, 5, 6, 7, 8]), q = ri(r, 3, 19); const a = b * q;
    return inp("div-exact", ph([`${a} ÷ ${b} = ?`, `Teile ohne Rest: ${a} durch ${b}`, `${a} geteilt durch ${b} ergibt?`]), q, `${a} ÷ ${b} = ${q}.`, 1, 0, 1, "quotient-off");
  };
  const divRem = (): Question => {
    const b = pick(r, [3, 4, 5, 6]); const q = ri(r, 3, 19); const a = b * q + ri(r, 1, b - 1);
    return inp("div-with-remainder", `Dividiere mit Rest: ${a} ÷ ${b}. Gib den REST an.`, a % b, `${a} = ${q} × ${b} + ${a % b}.`, 2, 1, 2, "remainder-dropped");
  };
  const pct = (p: number, opSeq: string, strat: string): Question => {
    const base = ri(r, 2, 99) * 10;
    return inp(opSeq, ph([`${p}% von ${base}?`, `Berechne ${p} Prozent von ${base}.`, `Was sind ${p}% aus ${base}?`]), (base * p) / 100,
      `${strat}: ${p}% von ${base} = ${(base * p) / 100}.`, 1, 0, 2, "wrong-base");
  };
  const frac = (n: number, de: number, name: string): Question => {
    const whole = ri(r, 2, 99) * 10;
    return inp(`frac-${name}`, ph([`${n}/${de} von ${whole}?`, `Berechne ${n}/${de} von ${whole}.`, `Was ist ${n}/${de} aus ${whole}?`]), (whole * n) / de,
      `${whole} ÷ ${de} = ${whole / de}; × ${n} = ${(whole * n) / de}.`, 2, 0, 2, "denominator-ignored");
  };
  const chain = (opSeq: string, o1: "×" | "+", o2: "−" | "+"): Question => {
    const a = ri(r, 3, 12), b = ri(r, 3, 12), c = ri(r, 3, 49);
    const s1 = o1 === "×" ? a * b : a + b; const ans = o2 === "−" ? s1 - c : s1 + c;
    return inp(opSeq, `In einem Zug: ${a} ${o1} ${b} ${o2} ${c} = ?`, ans, `${a} ${o1} ${b} = ${s1}; ${s1} ${o2} ${c} = ${ans}.`, 2, 0, 3, "partial-result");
  };
  const train: (() => Question)[] = [
    () => convFwd("x1000", pick(r, U1000)), () => convBwd("x1000", pick(r, U1000)),
    () => convFwd("x100", U100[0]), () => convBwd("x100", U100[0]),
    () => convFwd("x60", pick(r, U60)), () => convBwd("x60", pick(r, U60)),
    () => convThen("+"), () => convThen("−"),
    addCarry, addNoCarry, subBorrow, subNoBorrow, mulSmall, mulDistr, divExact, divRem,
    () => pct(50, "percent-50-half", "Hälfte nehmen"), () => pct(25, "percent-25-quarter", "Viertel nehmen"), () => pct(10, "percent-10-tenth", "Zehntel nehmen"),
    () => pct(pick(r, [5, 20, 75]), "percent-general", "Über 10% und Vielfache schrittweise"),
    () => frac(1, 2, "half"), () => frac(1, 4, "quarter"), () => frac(1, 5, "fifth"), () => frac(1, 10, "tenth"),
    (): Question => { const x = ri(r, 20, 99); return inp("halve-number", ph([`Die Hälfte von ${x}?`, `Halbiere ${x}.`, `${x} geteilt durch 2?`]), x / 2 === Math.floor(x / 2) ? x / 2 : Math.round(x / 2 * 10) / 10, `${x} ÷ 2.`, 1, 0, 1, "op-confusion"); },
    (): Question => { const x = ri(r, 11, 99); return inp("double-number", ph([`Das Doppelte von ${x}?`, `Verdopple ${x}.`, `${x} mal 2?`]), x * 2, `${x} × 2 = ${x * 2}.`, 1, 0, 1, "op-confusion"); },
    (): Question => { const x = ri(r, 14, 96); return inp("round-nearest-10", ph([`Runde ${x} auf die nächste Zehnerzahl.`, `${x} gerundet auf Zehner?`, `Auf welche Zehnerzahl liegt ${x} am nächsten?`]), Math.round(x / 10) * 10, `${x} → ${Math.round(x / 10) * 10}.`, 1, 0, 1, "round-direction"); },
    (): Question => { const a = ri(r, 12, 89), b = ri(r, 12, 89); const ap = Math.round(a / 10) * 10, bp = Math.round(b / 10) * 10; return inp("estimate-sum-decade", ph([`Schätze ${a} + ${b} auf Zehner.`, `Überschlag: etwa ${a} + ${b}?`, `Runde beide und addiere: ${a} + ${b}?`]), ap + bp, `${a}≈${ap}, ${b}≈${bp} → ${ap + bp}.`, 2, 0, 2, "over-precise"); },
    (): Question => { const a = ri(r, 3, 19), b = ri(r, 2, 18), op = pick(r, ["+", "×"]); const ra = op === "+" ? a + 6 : a * 6, rb = op === "+" ? b + 4 : b * 4; return inp("compare-two-results", `Welches Ergebnis ist größer: ${a} ${op} 6 oder ${b} ${op} 4?`, ra >= rb ? "das erste" : "das zweite", `Erstes = ${ra}, zweites = ${rb}.`, 2, 0, 2, "one-side-only"); },
    () => chain("chain-mul-then-sub", "×", "−"), () => chain("chain-mul-then-add", "×", "+"), () => chain("chain-add-then-mul", "+", "−"),
    (): Question => { const b = ri(r, 4, 49), res = ri(r, 20, 99); return inp("backward-missing-addend", `? + ${b} = ${res}. Was ist ??`, res - b, `${res - b} + ${b} = ${res}.`, 1, 1, 2, "forward-result"); },
    (): Question => { const b = pick(r, [3, 4, 5, 6]), q = ri(r, 3, 12), res = b * q; return inp("backward-missing-factor", `? × ${b} = ${res}. Was ist ??`, q, `${q} × ${b} = ${res}.`, 1, 1, 2, "forward-result"); },
    (): Question => { const a = ri(r, 3, 12), b = ri(r, 2, 12), c = ri(r, 2, 49); return inp("ordered-rule-two-step", `Regel: erst multiplizieren, dann subtrahieren. ${a} × ${b} − ${c} = ?`, a * b - c, `${a} × ${b} = ${a * b}; − ${c} = ${a * b - c}.`, 2, 1, 2, "order-violated"); },
    (): Question => { const a = ri(r, 11, 89); return inp("complement-to-100", `Was fehlt bis 100: ${a} + ? = 100`, 100 - a, `100 − ${a} = ${100 - a}.`, 1, 1, 2, "to-ten-only"); },
    (): Question => { const a = ri(r, 11, 99), b = ri(r, 11, 99), c = ri(r, 11, 99); return inp("sum-three-numbers", `Addiere alle drei: ${a} + ${b} + ${c} = ?`, a + b + c, `${a} + ${b} = ${a + b}; + ${c} = ${a + b + c}.`, 2, 0, 3, "partial-sum"); },
    (): Question => { const n = ri(r, 4, 32); return inp("square-number", ph([`${n} × ${n} = ?`, `Berechne die Quadratzahl von ${n}.`, `${n} zum Quadrat?`]), n * n, `${n}² = ${n * n}.`, 1, 0, 1, "table-off"); },
    (): Question => { const b = pick(r, [4, 5, 6, 8]), a = b * ri(r, 3, 29) + ri(r, 1, b - 1); return inp("next-multiple", `Die nächstgrößere Zahl teilbar durch ${b}, ab ${a}?`, a + (b - (a % b)), `${a} → aufrunden auf Vielfaches von ${b}.`, 1, 1, 2, "rounded-down"); },
    (): Question => { const a = ri(r, 40, 99), b = ri(r, 11, 30), c = ri(r, 5, 20); return inp("diff-chain", `Nacheinander abziehen: ${a} − ${b} − ${c} = ?`, a - b - c, `${a} − ${b} = ${a - b}; − ${c} = ${a - b - c}.`, 2, 0, 3, "partial-diff"); },
  ];
  const heldOutPaths: (() => Question)[] = [
    (): Question => { const u = pick(r, U1000); const x = ri(r, 2, 9), y = ri(r, 2, 9); const conv = x * u[2]; return inp("convert-then-multiply", `Erst umrechnen, dann multiplizieren: ${x} ${u[0]} → ${u[1]}, dann × ${y}.`, conv * y, `${x} ${u[0]} = ${conv}; × ${y} = ${conv * y}.`, 2, 0, 2, "wrong-order"); },
    (): Question => { const base = ri(r, 4, 40) * 10, sub = ri(r, 1, base / 2 - 1); return inp("percent-of-remaining", `Zuerst ${sub} abziehen, dann 10% vom Rest: ${base} − ${sub}, davon 10%?`, (base - sub) / 10, `Rest = ${base - sub}; 10% = ${(base - sub) / 10}.`, 2, 1, 3, "percent-of-original"); },
    (): Question => { const whole = ri(r, 4, 20) * 10; return inp("frac-three-quarters", `Drei Viertel von ${whole}?`, (whole * 3) / 4, `${whole} ÷ 4 = ${whole / 4}; × 3 = ${(whole * 3) / 4}.`, 2, 0, 2, "quarter-not-multiplied"); },
    (): Question => { const x = ri(r, 5, 40); return inp("double-twice", `Verdopple ${x} zweimal.`, x * 4, `${x} → ${x * 2} → ${x * 4}.`, 2, 1, 2, "single-double"); },
    (): Question => { const x = ri(r, 120, 890); return inp("round-nearest-100", `Runde ${x} auf die nächste Hundertzahl.`, Math.round(x / 100) * 100, `${x} → ${Math.round(x / 100) * 100}.`, 1, 0, 2, "round-to-ten"); },
    (): Question => { const a = ri(r, 40, 95), b = ri(r, 12, 35); const ap = Math.round(a / 10) * 10, bp = Math.round(b / 10) * 10; return inp("estimate-difference", `Schätze ${a} − ${b} auf Zehner.`, ap - bp, `${a}≈${ap}, ${b}≈${bp} → ${ap - bp}.`, 2, 0, 2, "over-precise"); },
    (): Question => { const a = ri(r, 40, 90), res = ri(r, 10, a - 5); return inp("backward-missing-subtrahend", `${a} − ? = ${res}. Was wurde abgezogen?`, a - res, `${a} − ${a - res} = ${res}.`, 1, 1, 2, "forward-result"); },
    (): Question => { const a = ri(r, 2, 8), b = ri(r, 2, 8), c = ri(r, 2, 20), e = ri(r, 1, 9); const s1 = a * b; return inp("ordered-three-step", `Regel: × dann + dann −. ${a} × ${b} + ${c} − ${e} = ?`, s1 + c - e, `${s1} + ${c} = ${s1 + c}; − ${e} = ${s1 + c - e}.`, 3, 1, 3, "order-violated"); },
    (): Question => { const total = ri(r, 3, 12) * ri(r, 2, 9), n = ri(r, 3, 9); return inp("per-item-division", `${total} Stück kosten insgesamt gleich viel. Wie viel kostet 1 Stück, wenn ${n} Stück zusammen ${total * n} kosten?`, total, `${total * n} ÷ ${n} = ${total}.`, 1, 1, 2, "multiplied-instead"); },
    (): Question => { const de = pick(r, [5, 10]), n1 = ri(r, 1, de - 2), n2 = ri(r, 1, de - n1 - 0); return inp("same-denominator-sum", `${n1}/${de} + ${n2}/${de} = ? (als Bruch, z. B. 3/10)`, `${n1 + n2}/${de}`, `Zähler addieren: ${n1} + ${n2} = ${n1 + n2} → ${(n1 + n2)}/${de}.`, 1, 1, 2, "denominator-added"); },
  ];
  const pool = heldOutFlag ? heldOutPaths : train;
  return pool[ri(r, 0, pool.length - 1)]();
}
// ===== KOPFRECHNEN: training dispatch wrapper (held-out unreachable here) =====
function genMentalTrain(r: () => number, d: number): Question { return genMental(r, d, false); }
// ===== DEUTSCH =====
const SENTENCES = [
  ["Der", "Kunde", "bezahlt", "an", "der", "Kasse", "."],
  ["Wir", "bestellen", "die", "Ware", "online", "."],
  ["Die", "Lieferung", "kommt", "morgen", "an", "."],
  ["Er", "schreibt", "eine", "E-Mail", "an", "den", "Chef", "."],
];
function genSatzbau(r: () => number, d: number): Question {
  const path = ri(r, 0, 11); // 12 paths
  if (path === 0) { // reorder scrambled statement
    const parts = pick(r, SENTENCES);
    const correct = parts.join(" ");
    const scrambled = shuffle(parts, r).join(" ");
    return mk("deutsch", "satzbau", "order", d, "Bilde einen korrekten Satz: " + scrambled, undefined, correct,
      "Richtig: " + correct, "Subjekt zuerst, dann Verb.", 20, 3, "Wortstellung (Verbposition).", "sort", "reorder-statement",
      { opSequence: "scramble-reorder", stepCount: 1, constraintCount: 0, distractorKind: "wrong-word-order", workingMemoryLoad: 1, inputModality: "sequence", answerCardinality: 1 });
  }
  if (path === 1) { // main + subordinate clause
    const subj = pick(r, ["Der Mitarbeiter", "Die Kollegin", "Unser Team", "Der Chef"]);
    const verb = pick(r, ["prüft", "bestellt", "verschickt", "kontrolliert"]);
    const obj = pick(r, ["die Rechnung", "die Ware", "das Paket", "den Bericht"]);
    const konj = pick(r, [["weil", "da"], ["obwohl", "auch wenn"], ["wenn", "falls"]]);
    const reason = pick(r, ["die Frist kurz ist", "das Lager voll ist", "der Kunde wartet", "die Zahlung fehlt"]);
    const correct = `${subj} ${verb} ${obj}, ${konj[0]} ${reason}.`;
    return mk("deutsch", "satzbau", "order2", d, "Bilde einen Satz mit Nebensatz: „" + subj + " " + verb + " " + obj + "“ + „" + konj[0] + " " + reason + "“", undefined, correct,
      "Mit Komma: " + correct, "Nebensatz mit Komma abtrennen; Verb ans Ende.", 28, 4, "Verbposition im Nebensatz.", "sort", "subordinate-clause",
      { opSequence: "main-plus-subordinate", stepCount: 2, constraintCount: 1, distractorKind: "verb-in-wrong-position", workingMemoryLoad: 2, inputModality: "sequence", answerCardinality: 1 });
  }
  if (path === 2) { // statement -> question (inversion)
    const base = pick(r, [["Der Chef liest den Bericht.", "Liest der Chef den Bericht?"], ["Die Kollegin schreibt die Mail.", "Schreibt die Kollegin die Mail?"], ["Wir laden die Ware.", "Laden wir die Ware?"], ["Er ruft den Kunden an.", "Ruft er den Kunden an?"]]);
    return mk("deutsch", "satzbau", "statement2question", d, "Verwandle in eine Frage: „" + base[0] + "“", undefined, base[1],
      "Verb an Position 2: " + base[1], "Bei Fragen rückt das Verb nach vorne.", 22, 4, "Fragewort statt Inversion.", "sort", "statement-to-question",
      { opSequence: "statement-to-question", stepCount: 1, constraintCount: 0, distractorKind: "wrong-inversion", workingMemoryLoad: 1, inputModality: "sequence", answerCardinality: 1 });
  }
  if (path === 3) { // negation placement
    const pos = [`Ich habe ${pick(r, ["die Rechnung", "die Mail", "das Paket"])} ${pick(r, ["gesehen", "verschickt", "geprüft"])}.`, `Ich habe ${pick(r, ["die Rechnung", "die Mail", "das Paket"])} nicht ${pick(r, ["gesehen", "verschickt", "geprüft"])}.`];
    return mk("deutsch", "satzbau", "negation", d, "Setze „nicht“ richtig ein: „" + pos[0] + "“", undefined, pos[1],
      "Verneinung steht vor dem Partizip: " + pos[1], "Nicht vor dem Zeitwort-Teil.", 20, 3, "Verneinung falsch platziert.", "sort", "negation-placement",
      { opSequence: "negation-insertion", stepCount: 1, constraintCount: 0, distractorKind: "negation-wrong-slot", workingMemoryLoad: 1, inputModality: "sequence", answerCardinality: 1 });
  }
  if (path === 4) { // article agreement (der/die/das) with noun
    const noun = pick(r, [["der Kunde", "die Kundin"], ["der Bericht", "die Mail"], ["das Paket", "die Sendung"], ["der Lagerplatz", "die Regal"]]);
    const correct = noun[0];
    return mk("deutsch", "satzbau", "article", d, `Wähle den passenden Artikel: „___ ${noun[0].split(" ")[1]}“ (maskulin/neutral oder feminin?)`, undefined, correct,
      "Artikel stimmt mit Genus: " + correct, "Genus (der/die/das) beachten.", 22, 4, "Falsches Genus.", "sort", "article-agreement",
      { opSequence: "article-gender-match", stepCount: 1, constraintCount: 0, distractorKind: "wrong-gender", workingMemoryLoad: 1, inputModality: "sequence", answerCardinality: 1 });
  }
  if (path === 5) { // adjective ending (declension)
    const adj = pick(r, ["groß", "klein", "neu", "teuer", "schnell"]);
    const noun = pick(r, ["der Artikel", "die Ware", "das Paket"]);
    const ending = noun.startsWith("der") ? "e" : noun.startsWith("die") ? "e" : "e";
    const correct = `${adj}${ending} ${noun}`;
    return mk("deutsch", "satzbau", "adjektiv", d, `Setze das Adjektiv richtig: „${adj} ${noun}“`, undefined, correct,
      "Adjektivendung: " + correct, "Endung an Artikel anpassen.", 24, 4, "Endung vergessen.", "sort", "adjective-ending",
      { opSequence: "adjective-declension", stepCount: 1, constraintCount: 0, distractorKind: "missing-ending", workingMemoryLoad: 1, inputModality: "sequence", answerCardinality: 1 });
  }
  if (path === 6) { // tense transform (present -> perfect)
    const base = pick(r, [["Er kauft das Material.", "Er hat das Material gekauft."], ["Wir prüfen die Liste.", "Wir haben die Liste geprüft."], ["Sie lädt die Ware.", "Sie hat die Ware geladen."], ["Er schreibt die Mail.", "Er hat die Mail geschrieben."]]);
    return mk("deutsch", "satzbau", "tense", d, "Setze in die Vergangenheit (Perfekt): „" + base[0] + "“", undefined, base[1],
      "Perfekt mit Hilfsverb: " + base[1], "Hilfsverb + Partizip.", 24, 4, "Falsches Hilfsverb/Partizip.", "sort", "tense-transform",
      { opSequence: "present-to-perfect", stepCount: 1, constraintCount: 0, distractorKind: "wrong-participle", workingMemoryLoad: 2, inputModality: "sequence", answerCardinality: 1 });
  }
  if (path === 7) { // connector choice (und/aber/denn/oder)
    const a = pick(r, ["Die Lieferung ist spät", "Das Material fehlt", "Der Kunde wartet", "Die Rechnung ist falsch"]);
    const b = pick(r, ["wir rufen an", "wir bestellen neu", "wir melden es", "wir korrigieren sie"]);
    const konn = pick(r, [["und", "zusätzlich"], ["aber", "trotzdem"], ["denn", "weil"], ["oder", "sonst"]]);
    const correct = `${a}, ${konn[0]} ${b}.`;
    return mk("deutsch", "satzbau", "connector", d, `Verbinde sinnvoll: „${a}“ + „${b}“ (${konn[0]})`, undefined, correct,
      "Passender Connector: " + correct, "Sinn des Connectors prüfen.", 22, 4, "Falscher Connector.", "sort", "connector-choice",
      { opSequence: "connector-selection", stepCount: 1, constraintCount: 0, distractorKind: "wrong-connector", workingMemoryLoad: 1, inputModality: "sequence", answerCardinality: 1 });
  }
  if (path === 8) { // pronoun case (wer/wen/wem)
    const base = pick(r, [["Wer ruft an?", "Nominativ"], ["Wen sehen Sie?", "Akkusativ"], ["Wem helfen Sie?", "Dativ"], ["Wessen Paket ist das?", "Genitiv"]]);
    return mk("deutsch", "satzbau", "pronoun", d, `Welcher Fall: „${base[0]}“`, undefined, base[1],
      "Fall: " + base[1], "Fragewort bestimmt den Fall.", 24, 5, "Falscher Kasus.", "sort", "pronoun-case",
      { opSequence: "pronoun-case-id", stepCount: 1, constraintCount: 0, distractorKind: "wrong-case", workingMemoryLoad: 2, inputModality: "sequence", answerCardinality: 1 });
  }
  if (path === 9) { // word -> plural
    const base = pick(r, [["der Artikel", "die Artikel"], ["die Mail", "die Mails"], ["das Paket", "die Pakete"], ["der Kunde", "die Kunden"]]);
    return mk("deutsch", "satzbau", "plural", d, `Bilde den Plural: „${base[0]}“`, undefined, base[1],
      "Plural: " + base[1], "Pluralbildung beachten.", 22, 4, "Falsche Pluralform.", "sort", "plural-form",
      { opSequence: "singular-to-plural", stepCount: 1, constraintCount: 0, distractorKind: "wrong-plural", workingMemoryLoad: 1, inputModality: "sequence", answerCardinality: 1 });
  }
  if (path === 10) { // separable verb (prefix placement)
    const base = pick(r, [["Er ruft den Kunden an.", "anrufen"], ["Wir geben die Ware ab.", "abgeben"], ["Sie sieht das Paket ein.", "einsehen"], ["Er stellt die Ware um.", "umstellen"]]);
    return mk("deutsch", "satzbau", "sepverb", d, `Nenne das trennbare Verb: „${base[0]}“`, undefined, base[1],
      "Grundform: " + base[1], "Präfix trennen.", 24, 5, "Präfix falsch zugeordnet.", "sort", "separable-verb",
      { opSequence: "separable-verb-id", stepCount: 1, constraintCount: 0, distractorKind: "wrong-prefix", workingMemoryLoad: 2, inputModality: "sequence", answerCardinality: 1 });
  }
  // path 11: passive transform
  const act = pick(r, [["Der Chef liest den Bericht.", "Der Bericht wird vom Chef gelesen."], ["Die Kollegin schreibt die Mail.", "Die Mail wird von der Kollegin geschrieben."], ["Wir laden die Ware.", "Die Ware wird von uns geladen."]]);
  return mk("deutsch", "satzbau", "passive", d, "Setze ins Passiv: „" + act[0] + "“", undefined, act[1],
    "Passiv: " + act[1], "Objekt wird Subjekt; werden + Partizip.", 30, 5, "Passiv falsch gebildet.", "sort", "active-to-passive",
    { opSequence: "active-to-passive", stepCount: 2, constraintCount: 1, distractorKind: "wrong-auxiliary", workingMemoryLoad: 2, inputModality: "sequence", answerCardinality: 1 });
}
// genTextverst defined above (4 text types).
function genTextverst(r: () => number, d: number): Question {
  const texts: [string, string, string[], StructSig][] = [
    ["Achtung: Die Lieferung erfolgt nur nach Voranmeldung.", "Was ist nötig vor der Lieferung?", ["eine Voranmeldung", "eine Zahlung", "ein Ausweis"], { opSequence: "read-locate-fact", stepCount: 1, constraintCount: 0, distractorKind: "plausible-but-unstated", workingMemoryLoad: 1, inputModality: "choice", answerCardinality: 1 }],
    ["Die Sprechstunde ist von 9 bis 12 Uhr. Bitte pünktlich erscheinen.", "Wann ist die Sprechstunde geöffnet?", ["9 bis 12 Uhr", "ganztags", "nachmittags"], { opSequence: "read-locate-time", stepCount: 1, constraintCount: 0, distractorKind: "nearby-time", workingMemoryLoad: 1, inputModality: "choice", answerCardinality: 1 }],
    ["Bestellungen bis 18 Uhr werden am selben Tag versandt.", "Wann wird noch am selben Tag versandt?", ["bis 18 Uhr", "vor 12 Uhr", "nach 20 Uhr"], { opSequence: "read-deadline", stepCount: 1, constraintCount: 0, distractorKind: "adjacent-time", workingMemoryLoad: 1, inputModality: "choice", answerCardinality: 1 }],
    ["Wir bitten um kurze Mitteilung bei Verzögerung.", "Was wird bei Verzögerung erwartet?", ["eine Mitteilung", "eine Entschuldigung", "gar nichts"], { opSequence: "read-infer-expectation", stepCount: 1, constraintCount: 0, distractorKind: "over/under-action", workingMemoryLoad: 1, inputModality: "choice", answerCardinality: 1 }],
  ];
  const [text, q, opts, sig] = pick(r, texts);
  const ans = opts[0];
  return {
    id: "de-tv-" + ri(r, 1000, 9999), area: "deutsch", subskill: "textverstaendnis", type: "reading", kind: "choice",
    difficulty: d, prompt: q, stimulus: "Text: " + text, options: shuffle(opts, r),
    answer: ans, explanation: "Im Text steht: die richtige Info ist „" + ans + "“.", hint: "Lies genau die gesuchte Angabe.", estimatedTime: 30, examRelevance: 5, commonErrors: "Oberflächlich lesen.",
    difficultyScore: 50, concept: "reading", templateKey: "deutsch-textverstaendnis-reading-" + sig.opSequence, structSig: sig, structHash: structHashOf(sig),
  };
}
// ===== LOGIK =====
function genProzess(r: () => number, d: number): Question {
  const wrongOrder = (steps: string[]) => [...steps.slice(1), steps[0]];
  const path = ri(r, 0, 9); // 10 paths
  if (path === 0) { // linear ordering
    const steps = pick(r, [
      ["Bestellung aufgeben", "Ware prüfen", "Versand", "Rechnung"],
      ["Brief öffnen", "lesen", "antworten", "absenden"],
      ["Material holen", "schneiden", "kleben", "trocknen lassen"],
      ["Anmelden", "Daten eingeben", "prüfen", "absenden"],
    ]);
    const correct = steps.join(" → ");
    const wrong = wrongOrder(steps).join(" → ");
    const opts = shuffle([correct, wrong], r);
    return mk("logik", "prozesslogik", "process", d, "Ordne die Schritte sinnvoll:", opts, correct,
      "Logische Reihenfolge: " + correct, "Denke an die natürliche Abfolge.", 22, 3, "Reihenfolge falsch.", "sort", "sequence-linear",
      { opSequence: "linear-sequence", stepCount: steps.length, constraintCount: 0, distractorKind: "rotated-order", workingMemoryLoad: 1, inputModality: "sequence", answerCardinality: 1 });
  }
  if (path === 1) { // conditional ordering
    const steps = ["Bestellung prüfen", "Kreditlimit prüfen", "Freigabe einholen", "Versand buchen", "Rechnung senden"];
    const correct = steps.join(" → ");
    const wrong = wrongOrder(steps).join(" → ");
    return mk("logik", "prozesslogik", "process2", d, "Ordne mit Bedingung: Freigabe erst NACH Kreditlimitprüfung. Reihenfolge:", [correct, wrong], correct,
      "Logische Reihenfolge mit Bedingung: " + correct, "Achte auf die Bedingung.", 30, 4, "Bedingung ignoriert.", "sort", "sequence-conditional",
      { opSequence: "conditional-sequence", stepCount: steps.length, constraintCount: 1, distractorKind: "constraint-violated", workingMemoryLoad: 2, inputModality: "sequence", answerCardinality: 1 });
  }
  if (path === 2) { // remove the irrelevant step
    const all = ["Material holen", "schneiden", "kleben", "trocknen lassen", "Kaffee trinken"];
    const wrongStep = "Kaffee trinken";
    const correct = all.filter((s) => s !== wrongStep);
    return mk("logik", "prozesslogik", "remove-wrong", d, "Streich den Schritt, der nicht hierher gehört:", undefined, correct.join(" → "),
      "Richtig ohne Störglied: " + correct.join(" → "), "Erkenne das nicht-passende Glied.", 24, 4, "Falsches Glied entfernt.", "sort", "remove-distractor-step",
      { opSequence: "identify-irrelevant-step", stepCount: all.length - 1, constraintCount: 0, distractorKind: "removed-right-step", workingMemoryLoad: 2, inputModality: "sequence", answerCardinality: 1 });
  }
  if (path === 3) { // principle check
    const principle = pick(r, [
      ["Versand vor Bezahlung?", "Nein – zuerst prüfen, dann versenden.", "Reihenfolge der Prozessschritte."],
      ["Kollege allein hochziehen bei Sturz?", "Nein – Erste Hilfe holen.", "Sicherheit vor Schnelligkeit."],
      ["Dokument löschen statt archivieren?", "Nein – archivieren.", "Aufbewahrungspflicht."],
      ["Passwort laut vorlesen?", "Nein – nie preisgeben.", "Datenschutz."],
    ]);
    return mk("logik", "prozesslogik", "principle", d, principle[0], undefined, principle[1],
      "Begründung: " + principle[2], "Wende das richtige Prinzip an.", 22, 4, "Prinzip verkannt.", "input", "principle-check",
      { opSequence: "principle-application", stepCount: 1, constraintCount: 0, distractorKind: "efficiency-over-safety", workingMemoryLoad: 1, inputModality: "text", answerCardinality: 1 });
  }
  if (path === 4) { // classify a step as begin/middle/end
    const triple = pick(r, [
      ["Bestellung aufgeben", "Versand", "Rechnung"],
      ["lesen", "antworten", "absenden"],
      ["Material holen", "kleben", "trocknen lassen"],
    ]);
    const pos = ri(r, 0, 2);
    const label = pos === 0 ? "Anfang" : pos === 1 ? "Mitte" : "Ende";
    return mk("logik", "prozesslogik", "classify-step", d, `Wo steht „${triple[pos]}“ in der Abfolge ${triple.join(" → ")}?`, undefined, label,
      `„${triple[pos]}“ ist am ${label}.`, "Position im Ablauf.", 22, 4, "Falsche Position.", "input", "step-position",
      { opSequence: "step-position-classify", stepCount: triple.length, constraintCount: 0, distractorKind: "wrong-position", workingMemoryLoad: 2, inputModality: "text", answerCardinality: 1 });
  }
  if (path === 5) { // cause-effect ordering
    const pair = pick(r, [
      [["Regen", "Straße nass"], ["Licht aus", "dunkel"], ["feuern", "warm"]],
    ])[0];
    return mk("logik", "prozesslogik", "cause-effect", d, `Was kommt ZUERST: ${pair[0]} oder ${pair[1]}?`, undefined, pair[0],
      `${pair[0]} ist die Ursache, dann ${pair[1]}.`, "Ursache vor Wirkung.", 20, 4, "Wirkung vor Ursache.", "input", "cause-before-effect",
      { opSequence: "cause-effect-order", stepCount: 2, constraintCount: 0, distractorKind: "effect-first", workingMemoryLoad: 1, inputModality: "text", answerCardinality: 1 });
  }
  if (path === 6) { // complete the sequence (missing middle)
    const steps = pick(r, [
      ["Anmelden", "?", "absenden"],
      ["Material holen", "?", "trocknen lassen"],
      ["Bestellung", "?", "Rechnung"],
    ]);
    const mid = pick(r, [["Daten eingeben", "Daten löschen"], ["kleben", "malen"], ["prüfen", "ignorieren"]]);
    return mk("logik", "prozesslogik", "missing-step", d, `Ergänze den fehlenden Schritt: ${steps[0]} → ? → ${steps[2]}`, undefined, mid[0],
      `Richtig: ${steps[0]} → ${mid[0]} → ${steps[2]}.`, "Passenden Zwischenschritt wählen.", 24, 4, "Falscher Zwischenschritt.", "input", "missing-step",
      { opSequence: "fill-missing-step", stepCount: 3, constraintCount: 0, distractorKind: "wrong-middle", workingMemoryLoad: 2, inputModality: "text", answerCardinality: 1 });
  }
  if (path === 7) { // dependency (which must finish first)
    const a = pick(r, ["Verpacken", "Etikettieren", "Prüfen"]), b = pick(r, ["Versand", "Lagerung", "Rechnung"]);
    return mk("logik", "prozesslogik", "dependency", d, `Darf ${b} starten, bevor ${a} fertig ist?`, undefined, "Nein",
      `${a} muss vor ${b} abgeschlossen sein.`, "Abhängigkeiten beachten.", 24, 5, "Reihenfolge vertauscht.", "input", "dependency-check",
      { opSequence: "dependency-order", stepCount: 2, constraintCount: 1, distractorKind: "reversed-dependency", workingMemoryLoad: 2, inputModality: "text", answerCardinality: 1 });
  }
  if (path === 8) { // cycle detection (which step repeats)
    const steps = ["Bestellung", "Prüfen", "Korrigieren", "Prüfen", "Versand"];
    return mk("logik", "prozesslogik", "cycle", d, `Welcher Schritt kommt ZWEIMAL vor? ${steps.join(" → ")}`, undefined, "Prüfen",
      "Prüfen erscheint zweimal (Kontrollschleife).", "Wiederholungen erkennen.", 22, 4, "Falscher Schritt.", "input", "cycle-detection",
      { opSequence: "detect-repeat-step", stepCount: steps.length, constraintCount: 0, distractorKind: "wrong-repeat", workingMemoryLoad: 2, inputModality: "text", answerCardinality: 1 });
  }
  // path 9: parallel vs sequential
  return mk("logik", "prozesslogik", "parallel", d, "Können „Ware prüfen“ und „Verpackung vorbereiten“ gleichzeitig laufen?", undefined, "Ja",
    "Unabhängige Schritte sind parallel möglich.", "Abhängigkeit prüfen.", 24, 5, "Falsch seriell gedacht.", "input", "parallel-vs-serial",
    { opSequence: "parallel-eligibility", stepCount: 2, constraintCount: 1, distractorKind: "false-serial", workingMemoryLoad: 2, inputModality: "text", answerCardinality: 1 });
}
function genWortgruppen(r: () => number, d: number): Question {
  const sets: [string[], string][] = [
    [["Apfel", "Birne", "Banane"], "Traktor"],
    [["Auto", "Bus", "Zug"], "Stift"],
    [["Tisch", "Stuhl", "Regal"], "Hund"],
    [["Hund", "Katze", "Maus"], "Brille"],
    [["Rot", "Blau", "Grün"], "Teller"],
    [["Hammer", "Schraubenzieher", "Zange"], "Gabel"],
    [["Rose", "Tulpe", "Lilie"], "Kartoffel"],
    [["Montag", "Dienstag", "Mittwoch"], "Juli"],
  ];
  const path = ri(r, 0, 7); // 8 paths
  const [group, odd] = pick(r, sets);
  if (path === 0) {
    const example = group.slice(0, 3).join(", ");
    const opts = dedupeOptions(shuffle([odd, ...group.slice(0, 2)], r));
    return mk("logik", "wortgruppen", "odd", d, `Welches Wort passt NICHT zur Gruppe? (${example}, …)`, opts, odd,
      `„${odd}“ gehört nicht zur Kategorie.`, "Finde die Kategorie.", 18, 3, "Kategorie nicht erkannt.", "choice", "odd-one-out",
      { opSequence: "odd-one-out", stepCount: 1, constraintCount: 0, distractorKind: "near-category-member", workingMemoryLoad: 1, inputModality: "choice", answerCardinality: 1 });
  }
  if (path === 1) {
    const two = group.slice(0, 2);
    const opts = dedupeOptions(shuffle([two.join(" + "), odd + " + " + group[0], group[1] + " + " + odd], r));
    return mk("logik", "wortgruppen", "find-pair", d, "Welche zwei Wörter gehören zur selben Gruppe?", opts, two.join(" + "),
      `„${two[0]}“ und „${two[1]}“ passen zusammen.`, "Erkenne die Kategorie-Zugehörigkeit.", 18, 3, "Falsche Zuordnung.", "choice", "match-same-category",
      { opSequence: "match-same-category", stepCount: 1, constraintCount: 0, distractorKind: "cross-category-pair", workingMemoryLoad: 1, inputModality: "choice", answerCardinality: 1 });
  }
  if (path === 2) {
    const a = pick(r, group), b = pick(r, group.filter((x) => x !== a));
    const opts = dedupeOptions(shuffle([`${a} & ${b}`, `${a} & ${odd}`, `${odd} & ${group[0]}`], r));
    return mk("logik", "wortgruppen", "two-belong", d, "Welche zwei passen zusammen?", opts, `${a} & ${b}`,
      `Beide gehören zur Gruppe.`, "Gemeinsame Kategorie finden.", 18, 3, "Kategorie verfehlt.", "choice", "two-belong-together",
      { opSequence: "analogy-pairing", stepCount: 1, constraintCount: 0, distractorKind: "outlier-included", workingMemoryLoad: 1, inputModality: "choice", answerCardinality: 1 });
  }
  if (path === 3) {
    const analog = pick(r, [["Apfel", "Obst", "Rose", "Blume"], ["Auto", "Fahrzeug", "Fahrrad", "Fahrzeug"], ["Hund", "Tier", "Löwe", "Tier"], ["Hammer", "Werkzeug", "Schelle", "Werkzeug"]]);
    const opts = dedupeOptions(shuffle([analog[3], analog[1], "Pflanze"], r));
    return mk("logik", "wortgruppen", "analogy", d, `A ist zu B wie C ist zu?  ${analog[0]} : ${analog[1]} :: ${analog[2]} : ?`, opts, analog[3],
      `${analog[0]} ist ${analog[1]}, also ${analog[2]} ist ${analog[3]}.`, "Übertrage die Beziehung.", 20, 4, "Beziehung falsch übertragen.", "choice", "analogy-transfer",
      { opSequence: "analogy-transfer", stepCount: 1, constraintCount: 0, distractorKind: "same-as-b", workingMemoryLoad: 2, inputModality: "choice", answerCardinality: 1 });
  }
  if (path === 4) { // superordinate category name
    const cat = pick(r, [["Apfel,Birne,Banane", "Obst"], ["Auto,Bus,Zug", "Fahrzeug"], ["Hund,Katze,Maus", "Tier"], ["Rot,Blau,Grün", "Farbe"]]);
    return mk("logik", "wortgruppen", "category-name", d, `Wie heißt die gemeinsame Kategorie von ${cat[0]}?`, undefined, cat[1],
      `Das ist ${cat[1]}.`, "Oberbegriff finden.", 18, 3, "Falscher Oberbegriff.", "input", "superordinate-category",
      { opSequence: "name-superordinate", stepCount: 1, constraintCount: 0, distractorKind: "hyponym-instead", workingMemoryLoad: 1, inputModality: "text", answerCardinality: 1 });
  }
  if (path === 5) { // which two are LEAST alike
    const a = pick(r, group), b = pick(r, group.filter((x) => x !== a)), rest = odd;
    return mk("logik", "wortgruppen", "least-alike", d, `Welches Paar ist am wenigsten ähnlich? ${a} & ${b}  oder  ${a} & ${rest}?`, undefined, `${a} & ${rest}`,
      `${rest} gehört nicht zur Gruppe.`, "Ähnlichkeit bewerten.", 18, 4, "Falsches Paar.", "input", "least-similar-pair",
      { opSequence: "least-similar", stepCount: 1, constraintCount: 0, distractorKind: "in-group-pair", workingMemoryLoad: 1, inputModality: "text", answerCardinality: 1 });
  }
  if (path === 6) { // count members vs non-members
    return mk("logik", "wortgruppen", "member-count", d, `Wie viele dieser Wörter sind Obst: ${group.slice(0,2).join(", ")}, ${odd}?`, undefined, String(group.length),
      `Nur ${group.slice(0,2).join(" und ")} sind Obst (${group.length}).`, "Zähle nur Gruppenmitglieder.", 18, 4, "Auch Nicht-Mitglied gezählt.", "input", "count-members",
      { opSequence: "count-category-members", stepCount: 1, constraintCount: 0, distractorKind: "included-outlier", workingMemoryLoad: 1, inputModality: "text", answerCardinality: 1 });
  }
  // path 7: hierarchy level (is X a type of Y?)
  const hier = pick(r, [["Birne", "Obst", "Ja"], ["Traktor", "Obst", "Nein"], ["Rose", "Tier", "Nein"], ["Hund", "Tier", "Ja"]]);
  return mk("logik", "wortgruppen", "hierarchy", d, `Ist „${hier[0]}“ eine Art von ${hier[1]}?`, undefined, hier[2],
    `${hier[0]} ist ${hier[2] === "Ja" ? "eine Art von" : "keine Art von"} ${hier[1]}.`, "Einordnung prüfen.", 18, 4, "Falsche Einordnung.", "input", "hierarchy-membership",
    { opSequence: "hierarchy-membership", stepCount: 1, constraintCount: 0, distractorKind: "wrong-membership", workingMemoryLoad: 1, inputModality: "text", answerCardinality: 1 });
}

// ===== KONZENTRATION (visual SVG) =====
function grid(n: number, r: () => number) {
  const cell = 44, pad = 6, sz = n * (cell + pad);
  let cells = "";
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const sym = ri(r, 0, 3);
    cells += `<g transform="translate(${pad + x * (cell + pad)},${pad + y * (cell + pad)})\"><rect width="${cell}" height="${cell}" rx="6" fill="#F0EEE9" stroke="#E2DFD8"/><text x="${cell / 2}" y="${cell / 2 + 7}" font-size="22" text-anchor="middle">${["●", "▲", "■", "★"][sym]}</text></g>`;
  }
  return `<svg viewBox="0 0 ${sz} ${sz}" width="${sz}" height="${sz}">${cells}</svg>`;
}
const SYMS = ["●", "▲", "■", "★"];
const SYM_NAMES = ["Kreise", "Dreiecke", "Quadrate", "Sterne"];
function countSym(svg: string, sym: string) { return (svg.match(new RegExp("[" + sym + "]", "g")) || []).length; }
function genVisualCount(r: () => number, d: number, sub: string, concept: string, verb: string): Question {
  const n = d < 45 ? 4 : d < 75 ? 5 : 6;
  const target = ri(r, 0, 3);
  const svg = grid(n, r);
  const count = countSym(svg, SYMS[target]);
  const symName = SYM_NAMES[target];
  const distractors = d < 60 ? [count + 1, Math.max(0, count - 1)] : [count + 1, Math.max(0, count - 1), count + 2, Math.max(0, count - 2)];
  return {
    id: "kon-" + sub + "-" + ri(r, 1000, 9999), area: "konzentration", subskill: sub, type: "count", kind: "visual",
    difficulty: d < 45 ? 1 : d < 75 ? 2 : 3, prompt: verb + " " + symName + " (●▲■★) im Raster.", stimulus: svg, options: dedupeOptions(shuffle([String(count), ...distractors.map(String)], r)),
    answer: String(count), explanation: "Es sind " + count + " " + symName + ".", hint: "Systematisch zeilenweise zählen.", estimatedTime: 25, examRelevance: 3, commonErrors: "Übersehen/Zu viel zählen.",
    difficultyScore: 35, concept, templateKey: "konzentration-" + sub + "-count-" + concept, structSig: { opSequence: "count-target-symbol", stepCount: 1, constraintCount: 0, distractorKind: "off-by-one", workingMemoryLoad: 1, inputModality: "visual", answerCardinality: 1 }, structHash: structHashOf({ opSequence: "count-target-symbol", stepCount: 1, constraintCount: 0, distractorKind: "off-by-one", workingMemoryLoad: 1, inputModality: "visual", answerCardinality: 1 }),
  };
}
function genVisualMore(r: () => number, d: number, sub: string): Question {
  const n = d < 45 ? 4 : d < 75 ? 5 : 6;
  let svg = grid(n, r);
  let counts = SYMS.map((s) => countSym(svg, s));
  let tries = 0;
  // unique maximum required: exactly one correct answer (validator-checked)
  while (counts.filter((c) => c === Math.max(...counts)).length !== 1 && tries++ < 64) {
    svg = grid(n, r);
    counts = SYMS.map((s) => countSym(svg, s));
  }
  const maxIdx = counts.indexOf(Math.max(...counts));
  const ans = SYM_NAMES[maxIdx];
  const opts = dedupeOptions(shuffle(SYM_NAMES, r));
  return {
    id: "kon-" + sub + "-more-" + ri(r, 1000, 9999), area: "konzentration", subskill: sub, type: "count", kind: "visual",
    difficulty: d < 45 ? 1 : d < 75 ? 2 : 3, prompt: "Welche Symbolart kommt AM MEISTEN vor?", stimulus: svg, options: opts,
    answer: ans, explanation: ans + " (" + counts[maxIdx] + "x).", hint: "Vergleiche alle vier Arten.", estimatedTime: 26, examRelevance: 3, commonErrors: "Nur eine Art gezählt.",
    difficultyScore: 40, concept: "count-compare", templateKey: "konzentration-" + sub + "-more", structSig: { opSequence: "find-max-frequency", stepCount: 4, constraintCount: 0, distractorKind: "picked-min", workingMemoryLoad: 2, inputModality: "visual", answerCardinality: 1 }, structHash: structHashOf({ opSequence: "find-max-frequency", stepCount: 4, constraintCount: 0, distractorKind: "picked-min", workingMemoryLoad: 2, inputModality: "visual", answerCardinality: 1 }),
  };
}
function genVisualLeast(r: () => number, d: number, sub: string): Question {
  const n = d < 45 ? 4 : d < 75 ? 5 : 6;
  let svg = grid(n, r);
  let counts = SYMS.map((s) => countSym(svg, s));
  let tries = 0;
  // unique minimum required: exactly one correct answer (validator-checked)
  while (counts.filter((c) => c === Math.min(...counts)).length !== 1 && tries++ < 64) {
    svg = grid(n, r);
    counts = SYMS.map((s) => countSym(svg, s));
  }
  const minIdx = counts.indexOf(Math.min(...counts));
  const maxIdx = counts.indexOf(Math.max(...counts));
  const opts = dedupeOptions(shuffle([SYM_NAMES[minIdx], SYM_NAMES[maxIdx], SYM_NAMES[(minIdx + 1) % 4]], r));
  return {
    id: "kon-" + sub + "-least-" + ri(r, 1000, 9999), area: "konzentration", subskill: sub, type: "count", kind: "visual",
    difficulty: d < 45 ? 1 : d < 75 ? 2 : 3, prompt: "Welche Symbolart kommt AM WENIGSTEN vor?", stimulus: svg, options: opts,
    answer: SYM_NAMES[minIdx], explanation: SYM_NAMES[minIdx] + " (" + counts[minIdx] + "x).", hint: "Vergleiche alle vier.", estimatedTime: 27, examRelevance: 3, commonErrors: "Meiste statt wenigste.",
    difficultyScore: 42, concept: "count-least", templateKey: "konzentration-" + sub + "-least", structSig: { opSequence: "find-min-frequency", stepCount: 4, constraintCount: 0, distractorKind: "picked-max", workingMemoryLoad: 2, inputModality: "visual", answerCardinality: 1 }, structHash: structHashOf({ opSequence: "find-min-frequency", stepCount: 4, constraintCount: 0, distractorKind: "picked-max", workingMemoryLoad: 2, inputModality: "visual", answerCardinality: 1 }),
  };
}
// 4th visual path: count only the FIRST ROW (constraint: ignore all other rows)
function genVisualRow(r: () => number, d: number, sub: string): Question {
  const n = d < 45 ? 4 : d < 75 ? 5 : 6;
  const target = ri(r, 0, 3);
  const svg = grid(n, r);
  const firstRow = svg.split("</g>").slice(0, n).join("</g>");
  const count = countSym(firstRow, SYMS[target]);
  const symName = SYM_NAMES[target];
  const opts = dedupeOptions(shuffle([String(count), String(count + 1), String(Math.max(0, count - 1)), String(count + 2)], r));
  return {
    id: "kon-" + sub + "-row-" + ri(r, 1000, 9999), area: "konzentration", subskill: sub, type: "count", kind: "visual",
    difficulty: d < 45 ? 1 : d < 75 ? 2 : 3, prompt: "Zähle die " + symName + " NUR in der ERSTEN Reihe des Rasters.", stimulus: svg, options: opts,
    answer: String(count), explanation: "In der ersten Reihe: " + count + " " + symName + ".", hint: "Nur die oberste Zeile zählen.", estimatedTime: 25, examRelevance: 3, commonErrors: "Ganze Raster gezählt.",
    difficultyScore: 44, concept: "count-row", templateKey: "konzentration-" + sub + "-row", structSig: { opSequence: "count-row-constraint", stepCount: 1, constraintCount: 1, distractorKind: "counted-all", workingMemoryLoad: 2, inputModality: "visual", answerCardinality: 1 }, structHash: structHashOf({ opSequence: "count-row-constraint", stepCount: 1, constraintCount: 1, distractorKind: "counted-all", workingMemoryLoad: 2, inputModality: "visual", answerCardinality: 1 }),
  };
}
function genSymbole(r: () => number, d: number): Question {
  const variant = ri(r, 0, 3);
  if (variant === 0) return genVisualCount(r, d, "symbole_entdecken", "symbol", "Wie viele Symbole der gesuchten Art");
  if (variant === 1) return genVisualMore(r, d, "symbole_entdecken");
  if (variant === 2) return genVisualLeast(r, d, "symbole_entdecken");
  return genVisualRow(r, d, "symbole_entdecken");
}
function genBilderZaehlenVariant(r: () => number, d: number): Question {
  const variant = ri(r, 0, 3);
  if (variant === 0) return genVisualCount(r, d, "bilder_zaehlen", "count", "Zähle die");
  if (variant === 1) return genVisualMore(r, d, "bilder_zaehlen");
  if (variant === 2) return genVisualLeast(r, d, "bilder_zaehlen");
  return genVisualRow(r, d, "bilder_zaehlen");
}

// ===== MERKFÄHIGKEIT (stimulus → recall) =====
const SIGNS = ["⛔", "⚠️", "ℹ️", "↩️", "♿", "🅿️", "🚭", "🔧"];
const SIGN_NAMES = ["Verbotszeichen", "Warnzeichen", "Hinweiszeichen", "Pfeilzeichen", "Rollstuhlzeichen", "Parksymbol", "Rauchverbot", "Werkzeugzeichen"];
function genSchilderSvg(k: number, chosen: string[]): string {
  return `<svg viewBox="0 0 ${k * 70} 60" width="${k * 70}" height="60">` +
    chosen.map((s, i) => `<text x="${i * 70 + 35}" y="42" font-size="34" text-anchor="middle">${s}</text>`).join("") + `</svg>`;
}
function genSchilder(r: () => number, d: number): Question {
  const k = d <= 1 ? 3 : d === 2 ? 4 : 6;
  const chosen = shuffle(SIGNS, r).slice(0, k);
  const svg = genSchilderSvg(k, chosen);
  const present = r() < 0.5;
  const ask = present ? pick(r, chosen) : (() => { const others = SIGNS.filter((s) => !chosen.includes(s)); return others.length ? pick(r, others) : pick(r, chosen); })();
  const answer = present ? "Ja" : "Nein";
  const sig = present
    ? { opSequence: "recall-present", stepCount: 1, constraintCount: 0, distractorKind: "false-negative", workingMemoryLoad: 1, inputModality: "recall", answerCardinality: 1 }
    : { opSequence: "recall-absent", stepCount: 1, constraintCount: 0, distractorKind: "false-positive", workingMemoryLoad: 1, inputModality: "recall", answerCardinality: 1 };
  return {
    id: "merk-" + ri(r, 1000, 9999), area: "merkfaehigkeit", subskill: "schilder_erinnern", type: "recall", kind: "visual",
    difficulty: d, prompt: "Erinnere dich: War das Schild " + ask + " unter den gezeigten Schildern?", stimulus: svg,
    options: ["Ja", "Nein"], answer, explanation: present ? "Das Schild war zu sehen." : "Dieses Schild war NICHT dabei.", hint: "Konzentriere dich kurz auf die Menge.", estimatedTime: 15, examRelevance: 2, commonErrors: "Nach Aufmerksamkeit vergessen.",
    difficultyScore: 60, concept: "recall", memorizeMs: 4000, templateKey: "merkfaehigkeit-schilder_erinnern-recall-" + (present ? "present" : "absent"), structSig: sig, structHash: structHashOf(sig),
  };
}
function genSchilderCount(r: () => number, d: number): Question {
  const k = d <= 1 ? 3 : d === 2 ? 4 : 6;
  const chosen = shuffle(SIGNS, r).slice(0, k);
  const svg = genSchilderSvg(k, chosen);
  const ans = k;
  const opts = dedupeOptions(shuffle([String(ans), String(ans + 1), String(Math.max(0, ans - 1)), "weiß nicht"], r));
  return {
    id: "merk-count-" + ri(r, 1000, 9999), area: "merkfaehigkeit", subskill: "schilder_erinnern", type: "recall", kind: "visual",
    difficulty: d, prompt: "Wie viele Schilder wurden gezeigt?", stimulus: svg, options: opts,
    answer: String(ans), explanation: "Es waren " + ans + " Schilder.", hint: "Zähle die gezeigten Schilder.", estimatedTime: 16, examRelevance: 2, commonErrors: "Anzahl falsch erinnert.",
    difficultyScore: 62, concept: "recall-count", memorizeMs: 4000, templateKey: "merkfaehigkeit-schilder_erinnern-count", structSig: { opSequence: "recall-count", stepCount: 1, constraintCount: 0, distractorKind: "off-by-one", workingMemoryLoad: 1, inputModality: "recall", answerCardinality: 1 }, structHash: structHashOf({ opSequence: "recall-count", stepCount: 1, constraintCount: 0, distractorKind: "off-by-one", workingMemoryLoad: 1, inputModality: "recall", answerCardinality: 1 }),
  };
}
// Schilder path 3: "which category does the Nth sign belong to?" (recall + classify)
function genSchilderCategory(r: () => number, d: number): Question {
  const k = d <= 1 ? 3 : d === 2 ? 4 : 6;
  const chosen = shuffle(SIGNS, r).slice(0, k);
  const svg = genSchilderSvg(k, chosen);
  const pos = ri(r, 0, k - 1);
  const ans = SIGN_NAMES[SIGNS.indexOf(chosen[pos])];
  const opts = dedupeOptions(shuffle([ans, ...shuffle(SIGN_NAMES.filter((n) => n !== ans), r).slice(0, 3)], r));
  return {
    id: "merk-cat-" + ri(r, 1000, 9999), area: "merkfaehigkeit", subskill: "schilder_erinnern", type: "recall", kind: "visual",
    difficulty: d, prompt: `Welche Kategorie hat das ${pos + 1}. Schild (von links)?`, stimulus: svg, options: opts,
    answer: ans, explanation: `Das ${pos + 1}. Schild ist: ${ans}.`, hint: "Achte auf die Reihenfolge und Symbolart.", estimatedTime: 17, examRelevance: 2, commonErrors: "Kategorie verwechselt.",
    difficultyScore: 64, concept: "recall-classify", memorizeMs: 4000, templateKey: "merkfaehigkeit-schilder_erinnern-category", structSig: { opSequence: "recall-classify", stepCount: 1, constraintCount: 1, distractorKind: "wrong-category", workingMemoryLoad: 2, inputModality: "recall", answerCardinality: 1 }, structHash: structHashOf({ opSequence: "recall-classify", stepCount: 1, constraintCount: 1, distractorKind: "wrong-category", workingMemoryLoad: 2, inputModality: "recall", answerCardinality: 1 }),
  };
}
// Schilder path 4: "were there MORE of sign X than sign Y?" (relational recall)
function genSchilderCompare(r: () => number, d: number): Question {
  const k = d <= 1 ? 3 : d === 2 ? 4 : 6;
  const chosen = shuffle(SIGNS, r).slice(0, k);
  const svg = genSchilderSvg(k, chosen);
  const a = pick(r, chosen), b = pick(r, chosen);
  const ans = a === b ? "Gleich viele" : (chosen.filter((s) => s === a).length >= chosen.filter((s) => s === b).length ? `Mehr ${a}` : `Mehr ${b}`);
  const opts = dedupeOptions(shuffle([ans, a === b ? "Keines" : `Mehr ${b}`, a === b ? "Nur eines" : `Mehr ${a}`, "Weiß nicht"], r));
  return {
    id: "merk-cmp-" + ri(r, 1000, 9999), area: "merkfaehigkeit", subskill: "schilder_erinnern", type: "recall", kind: "visual",
    difficulty: d, prompt: `Kamen von ${a} und ${b} gleich viele oder mehr von einer Sorte?`, stimulus: svg, options: opts,
    answer: ans, explanation: `Bewertung: ${ans}.`, hint: "Zähle beide Sorten getrennt.", estimatedTime: 18, examRelevance: 2, commonErrors: "Relation falsch.",
    difficultyScore: 66, concept: "recall-compare", memorizeMs: 4000, templateKey: "merkfaehigkeit-schilder_erinnern-compare", structSig: { opSequence: "recall-compare", stepCount: 2, constraintCount: 0, distractorKind: "reversed-relation", workingMemoryLoad: 2, inputModality: "recall", answerCardinality: 1 }, structHash: structHashOf({ opSequence: "recall-compare", stepCount: 2, constraintCount: 0, distractorKind: "reversed-relation", workingMemoryLoad: 2, inputModality: "recall", answerCardinality: 1 }),
  };
}

// ===== PRAKTISCH =====
function genSort(r: () => number, d: number): Question {
  const variant = ri(r, 0, 3);
  if (variant === 0) {
    const nums = shuffle([ri(r, 10, 99), ri(r, 10, 99), ri(r, 10, 99), ri(r, 10, 99)], r);
    const asc = [...nums].sort((a, b) => a - b).join(", ");
    return mk("praktisch", "sortierverfahren", "numbers", d, "Sortiere aufsteigend: " + nums.join(", "), undefined, asc,
      "Aufsteigend: " + asc, "Kleinste zuerst.", 18, 3, "Reihenfolge vertauscht.", "sort", "sort-ascending",
      { opSequence: "sort-ascending", stepCount: nums.length, constraintCount: 0, distractorKind: "descending", workingMemoryLoad: 1, inputModality: "sequence", answerCardinality: 1 });
  }
  if (variant === 1) {
    const nums = shuffle([ri(r, 10, 99), ri(r, 10, 99), ri(r, 10, 99), ri(r, 10, 99)], r);
    const desc = [...nums].sort((a, b) => b - a).join(", ");
    return mk("praktisch", "sortierverfahren", "numbers-desc", d, "Sortiere absteigend: " + nums.join(", "), undefined, desc,
      "Absteigend: " + desc, "Größte zuerst.", 18, 3, "Richtung vertauscht.", "sort", "sort-descending",
      { opSequence: "sort-descending", stepCount: nums.length, constraintCount: 0, distractorKind: "ascending", workingMemoryLoad: 1, inputModality: "sequence", answerCardinality: 1 });
  }
  if (variant === 2) {
    const nums = shuffle([ri(r, 10, 99), ri(r, 10, 99), ri(r, 10, 99), ri(r, 10, 99)], r);
    const odds = nums.filter((x) => x % 2 === 1).sort((a, b) => a - b).join(", ");
    return mk("praktisch", "sortierverfahren", "odds", d, "Gib nur die UNGERADEN Zahlen sortiert an: " + nums.join(", "), undefined, odds || "(keine)",
      "Ungerade aufsteigend: " + (odds || "(keine)"), "Nur ungerade auswählen.", 20, 4, "Gerade mitgenommen.", "sort", "filter-odd-sort",
      { opSequence: "filter-then-sort", stepCount: nums.length + 1, constraintCount: 1, distractorKind: "all-sorted", workingMemoryLoad: 2, inputModality: "sequence", answerCardinality: 1 });
  }
  const words = shuffle(["Apfel", "Birne", "Zebra", "Maus", "Tiger"], r).slice(0, 4);
  const byLen = [...words].sort((a, b) => a.length - b.length).join(", ");
  return mk("praktisch", "sortierverfahren", "by-length", d, "Sortiere nach Wortlänge (kurz → lang): " + words.join(", "), undefined, byLen,
    "Nach Länge: " + byLen, "Länge vergleichen.", 19, 4, "Alphabetisch statt nach Länge.", "sort", "sort-by-attribute",
    { opSequence: "sort-by-attribute", stepCount: words.length, constraintCount: 0, distractorKind: "alphabetical", workingMemoryLoad: 2, inputModality: "sequence", answerCardinality: 1 });
}
function genAlltag(r: () => number, d: number): Question {
  const path = ri(r, 0, 3);
  if (path === 0) {
    const q: [string, string[]][] = [
      ["Ein Kollege ist bewusstlos und atmet nicht. Was ist die richtige Reihenfolge?", ["Erst Hilfe rufen (144), dann Erste Hilfe beginnen", "Weiterarbeiten und abwarten", "Ihn allein hochziehen", "Erst den Chef informieren"]],
      ["Brandmeldeanlage läutet, aber kein Rauch sichtbar. Was tust du?", ["Evakuierungsanweisung befolgen und Bereich verlassen", "Weitersuchen nach dem Brand", "Das Signal ignorieren", "Fenster öffnen und warten"]],
      ["Du findest einen unbekannten USB-Stick im Lager. Richtig ist:", ["Meldung an IT/Sicherheit, nicht einstecken", "Sofort in den PC stecken", "Für dich behalten", "An Kollegen weitergeben"]],
    ];
    const [text, opts] = pick(r, q);
    const ans = opts[0];
    return mk("praktisch", "alltagswissen", "safety2", d, text, shuffle(opts, r), ans,
      "Richtig: " + ans, "Sicherheit und Meldepflicht gehen vor.", 22, 4, "Falsche Priorität bei Gefahr.", "choice", "safety-priority-order",
      { opSequence: "priority-sequence", stepCount: 2, constraintCount: 1, distractorKind: "wrong-priority", workingMemoryLoad: 2, inputModality: "choice", answerCardinality: 1 });
  }
  if (path === 1) {
    const q: [string, string[]][] = [
      ["Du siehst Rauch im Lager. Was tust du ZUERST?", ["Alarm auslösen", "weiterarbeiten", "fenster öffnen"]],
      ["Eine Kollegin ist gestürzt. Was ist richtig?", ["Erste Hilfe holen", "allein hochziehen", "ignorieren"]],
      ["Der Feuerwehrplan zeigt den Fluchtweg. Wo stehst du?", ["am Ausgang", "am Fenster", "am Lift"]],
    ];
    const [text, opts] = pick(r, q);
    const ans = opts[0];
    return mk("praktisch", "alltagswissen", "safety", d, text, shuffle(opts, r), ans,
      "Richtig: " + ans, "Sicherheit geht vor.", 16, 3, "Falsche Priorität.", "choice", "immediate-action",
      { opSequence: "immediate-action", stepCount: 1, constraintCount: 0, distractorKind: "delay-action", workingMemoryLoad: 1, inputModality: "choice", answerCardinality: 1 });
  }
  if (path === 2) {
    const q: [string, string[]][] = [
      ["Was ist am Arbeitsplatz verboten?", ["Mit unbekanntem Stick den PC nutzen", "Die Brille tragen", "Hände waschen", "Pausen einhalten"]],
      ["Was darfst du NICHT tun, wenn die Brandmeldeanlage läutet?", ["Weitersuchen nach dem Brand", "Die Treppe nutzen", "Ruhig bleiben", "Sammeln"]],
    ];
    const [text, opts] = pick(r, q);
    const ans = opts[0];
    return mk("praktisch", "alltagswissen", "forbidden", d, text, shuffle(opts, r), ans,
      "Richtig: " + ans, "Regeln kennen und beachten.", 17, 3, "Erlaubtes gewählt.", "choice", "identify-forbidden",
      { opSequence: "identify-prohibition", stepCount: 1, constraintCount: 0, distractorKind: "allowed-picked", workingMemoryLoad: 1, inputModality: "choice", answerCardinality: 1 });
  }
  const q: [string, string[]][] = [
    ["Wen informierst du zuerst bei einem Datenleck?", ["IT-Sicherheit", "einen Kollegen", "den Kunden direkt", "niemanden"]],
    ["Wohin meldest du einen Arbeitsunfall?", ["an Vorgesetzte/SUVA", "an den Kunden", "gar nicht", "an die Reinigung"]],
  ];
  const [text, opts] = pick(r, q);
  const ans = opts[0];
  return mk("praktisch", "alltagswissen", "reporting", d, text, shuffle(opts, r), ans,
    "Richtig: " + ans, "Zuständige Stelle melden.", 17, 4, "Falsche Meldekette.", "choice", "reporting-chain",
    { opSequence: "identify-report-target", stepCount: 1, constraintCount: 0, distractorKind: "wrong-recipient", workingMemoryLoad: 1, inputModality: "choice", answerCardinality: 1 });
}

// ===== HELD-OUT POOL (>=20% of structural space, unreachable from training) =====
function genMentalHeldOut(r: () => number, d: number): Question { return genMental(r, d, true); }
function genPctHeldOut(r: () => number, d: number): Question {
  const base = pick(r, [40, 60, 80, 120, 200]);
  const p = pick(r, [10, 20, 25, 50]);
  const res = round1((base * p) / 100);
  const opts = dedupeOptions(shuffle([String(base), String(base + 10), String(Math.round(base / 2)), String(base * 2)], r));
  return mk("mathematik", "textaufgaben", "pct-reverse", d, `${p}% von welcher Zahl ergeben ${res}?`, opts, String(base),
    `${p}% von ${base} = ${res}.`, "Rückwärts rechnen.", 30, 5, "Basis verwechselt.", "choice", "percent-reverse",
    { opSequence: "percent-reverse", stepCount: 1, constraintCount: 1, distractorKind: "result-as-base", workingMemoryLoad: 2, inputModality: "numeric", answerCardinality: 1 }, true);
}
function genSatzbauHeldOut(r: () => number, d: number): Question {
  const pairs = [["Der Chef liest den Bericht.", "Der Bericht wird vom Chef gelesen."], ["Die Kollegin schreibt die Mail.", "Die Mail wird von der Kollegin geschrieben."]];
  const [a, b] = pick(r, pairs);
  return mk("deutsch", "satzbau", "passive", d, "Setze in Passiv: „" + a + "“", undefined, b,
    "Passiv: " + b, "Objekt wird Subjekt; werden + Partizip.", 30, 5, "Passiv falsch gebildet.", "sort", "passive-transform",
    { opSequence: "active-to-passive", stepCount: 2, constraintCount: 1, distractorKind: "wrong-auxiliary", workingMemoryLoad: 2, inputModality: "sequence", answerCardinality: 1 }, true);
}
function genSchilderHeldOut(r: () => number, d: number): Question {
  const k = d <= 1 ? 3 : 4;
  const chosen = shuffle(SIGNS, r).slice(0, k);
  const svg = `<svg viewBox="0 0 ${k * 70} 60" width="${k * 70}" height="60">` +
    chosen.map((s, i) => `<text x="${i * 70 + 35}" y="42" font-size="34" text-anchor="middle">${s}</text>`).join("") + `</svg>`;
  const pos = ri(r, 0, k - 1);
  const ans = String(pos + 1);
  const opts = dedupeOptions(shuffle([ans, String((pos + 2 > k ? 1 : pos + 2)), String(k)], r));
  return {
    id: "merk-order-" + ri(r, 1000, 9999), area: "merkfaehigkeit", subskill: "schilder_erinnern", type: "recall", kind: "visual",
    difficulty: d, prompt: `An welcher Position (von links, 1-basiert) stand das Schild ${chosen[pos]}?`, stimulus: svg, options: opts,
    answer: ans, explanation: "Position " + ans + ".", hint: "Beachte die Reihenfolge.", estimatedTime: 17, examRelevance: 2, commonErrors: "Position falsch.",
    difficultyScore: 64, concept: "recall-order", memorizeMs: 4000, templateKey: "merkfaehigkeit-schilder_erinnern-order", structSig: { opSequence: "recall-order", stepCount: 1, constraintCount: 0, distractorKind: "off-by-one-position", workingMemoryLoad: 2, inputModality: "recall", answerCardinality: 1 }, structHash: structHashOf({ opSequence: "recall-order", stepCount: 1, constraintCount: 0, distractorKind: "off-by-one-position", workingMemoryLoad: 2, inputModality: "recall", answerCardinality: 1 }), heldOut: true,
  };
}
function genVisualHeldOut(r: () => number, d: number, sub: string): Question {
  const n = d < 45 ? 4 : 5;
  const target = ri(r, 0, 3);
  const svg = grid(n, r);
  const firstRow = svg.split("</g>").slice(0, n).join("</g>");
  const count = countSym(firstRow, SYMS[target]);
  const symName = SYM_NAMES[target];
  const opts = dedupeOptions(shuffle([String(count), String(count + 1), String(count + 2), String(Math.max(0, count - 1))], r));
  return {
    id: "kon-" + sub + "-row-" + ri(r, 1000, 9999), area: "konzentration", subskill: sub, type: "count", kind: "visual",
    difficulty: d < 45 ? 1 : d < 75 ? 2 : 3, prompt: "Zähle die " + symName + " NUR in der ERSTEN Reihe.", stimulus: svg, options: opts,
    answer: String(count), explanation: "In der ersten Reihe: " + count + ".", hint: "Nur die oberste Zeile.", estimatedTime: 26, examRelevance: 3, commonErrors: "Ganze Raster gezählt.",
    difficultyScore: 44, concept: "count-row", templateKey: "konzentration-" + sub + "-row", structSig: { opSequence: "count-row-constraint", stepCount: 1, constraintCount: 1, distractorKind: "counted-all", workingMemoryLoad: 2, inputModality: "visual", answerCardinality: 1 }, structHash: structHashOf({ opSequence: "count-row-constraint", stepCount: 1, constraintCount: 1, distractorKind: "counted-all", workingMemoryLoad: 2, inputModality: "visual", answerCardinality: 1 }), heldOut: true,
  };
}
function genAlltagHeldOut(r: () => number, d: number): Question {
  const q: [string, string[]][] = [
    ["Ein Kunde ist aggressiv UND es riecht nach Gas. Was zuerst?", ["Person in Sicherheit bringen & Gas melden", "Kunde beruhigen", "Weiterarbeiten", "Lüften"]],
    ["Stromausfall UND wertvolle Ware lagert. Richtig?", ["Einbruchschutz aktivieren & melden", "Licht anlassen", "Ware verteilen", "Ignorieren"]],
  ];
  const [text, opts] = pick(r, q);
  const ans = opts[0];
  return mk("praktisch", "alltagswissen", "multi-constraint", d, text, shuffle(opts, r), ans,
    "Richtig: " + ans, "Mehrere Gefahren → Priorität.", 24, 5, "Nur eine Gefahr bedacht.", "choice", "multi-constraint",
    { opSequence: "multi-constraint-priority", stepCount: 2, constraintCount: 2, distractorKind: "single-constraint", workingMemoryLoad: 3, inputModality: "choice", answerCardinality: 1 }, true);
}

// ===== HELPERS / DISPATCH =====
function mk(area: string, sub: string, type: string, d: number, prompt: string, options: string[] | undefined, answer: string, explanation: string, hint: string, et: number, er: number, ce: string, kind?: QKind, concept?: string, structSig?: StructSig, heldOut?: boolean): Question {
  const base = TYPE_BASE[type] ?? 40;
  const bandStep = (d - 50) / 50;
  const difficultyScore = Math.max(8, Math.min(98, Math.round(base + bandStep * 22)));
  const discrete = d <= 40 ? 1 : d <= 70 ? 2 : 3;
  const tmpl = `${sub}-${type}-${prompt.replace(/\W+/g, "").slice(0, 24)}`;
  const shash = structSig ? structHashOf(structSig) : undefined;
  return {
    id: `${area}-${sub}-${type}-${ri(rng(Date.now()), 1000, 9999)}`, area, subskill: sub, type: type as QType,
    kind: kind ?? (options ? "choice" : "input"), difficulty: discrete, difficultyScore,
    concept: concept ?? type, prompt, options: options ? dedupeOptions(options) : undefined, answer, explanation, hint,
    estimatedTime: et, examRelevance: er, commonErrors: ce, templateKey: tmpl,
    structSig, structHash: shash, heldOut: !!heldOut,
  };
}

// Continuous difficulty resolver (Phase 6)
export function resolveDifficulty(ability: number): number {
  return Math.max(12, Math.min(95, Math.round(ability)));
}

// Training generators: >=4 distinct solution paths per subskill.
const GENERATORS: Record<string, ((r: () => number, d: number) => Question)[]> = {
  textaufgaben: [genPercent, genMoney, genWord, genTwoStep, genUnitPrice, genFrac],
  kopfrechnen: [genMentalTrain],
  satzbau: [genSatzbau, genSatzbau, genSatzbau, genSatzbau],
  textverstaendnis: [genTextverst],
  prozesslogik: [genProzess, genProzess, genProzess, genProzess],
  wortgruppen: [genWortgruppen, genWortgruppen, genWortgruppen, genWortgruppen],
  bilder_zaehlen: [genBilderZaehlenVariant],
  symbole_entdecken: [genSymbole],
  schilder_erinnern: [genSchilder, genSchilderCount, genSchilderCategory, genSchilderCompare],
  sortierverfahren: [genSort, genSort, genSort, genSort],
  alltagswissen: [genAlltag, genAlltag, genAlltag, genAlltag],
};

// Held-out generators: reserved transfer-gap space (>=20%), unreachable from training.
const HELDOUT: Record<string, ((r: () => number, d: number) => Question)[]> = {
  textaufgaben: [genPctHeldOut],
  kopfrechnen: [genMentalHeldOut],
  satzbau: [genSatzbauHeldOut],
  schilder_erinnern: [genSchilderHeldOut],
  bilder_zaehlen: [(r, d) => genVisualHeldOut(r, d, "bilder_zaehlen")],
  symbole_entdecken: [(r, d) => genVisualHeldOut(r, d, "symbole_entdecken")],
  alltagswissen: [genAlltagHeldOut],
  textverstaendnis: [genAlltagHeldOut],
  prozesslogik: [genAlltagHeldOut],
  wortgruppen: [genAlltagHeldOut],
  sortierverfahren: [genAlltagHeldOut],
};

export function generateHeldOut(subskillId: string, difficulty: number, seed = Date.now()): Question | null {
  const gs = HELDOUT[subskillId];
  if (!gs || !gs.length) return null;
  const r = rng(seed);
  const g = gs[Math.floor(r() * gs.length)];
  const q = g(r, Math.max(12, Math.min(95, difficulty)));
  q.heldOut = true;
  return q;
}

export function heldOutExists(subskillId: string): boolean {
  return !!HELDOUT[subskillId] && HELDOUT[subskillId].length > 0;
}

export function generate(subskillId: string, difficulty: number, seed = Date.now()): Question | null {
  const gs = GENERATORS[subskillId];
  if (!gs || !gs.length) return null;
  const r = rng(seed);
  const g = gs[Math.floor(r() * gs.length)];
  // difficulty is a continuous 0..100 target (coach ability). Generators use it continuously.
  const q = g(r, Math.max(12, Math.min(95, difficulty)));
  if (!hasUniqueOptions(q)) {
    // regenerate once with a perturbed seed to avoid duplicate options (P0 guard)
    const q2 = g(rng(seed + 7919), Math.max(12, Math.min(95, difficulty)));
    if (hasUniqueOptions(q2)) return q2;
  }
  if (q.difficultyScore === undefined) {
    const base = TYPE_BASE[q.type] ?? 40;
    const bandStep = (difficulty - 50) / 50;
    q.difficultyScore = Math.max(8, Math.min(98, Math.round(base + bandStep * 22)));
  }
  if (q.concept === undefined) q.concept = q.type;
  return q;
}

export function generateBatch(subskillId: string, difficulty: number, n = 6, baseSeed = Date.now()): Question[] {
  const out: Question[] = [];
  for (let i = 0; i < n; i++) {
    // vary seed per item so prompts differ within a session
    const q = generate(subskillId, difficulty, baseSeed + i * 7919 + Math.floor(rng(baseSeed + i)() * 1e6));
    if (q) out.push(q);
  }
  return out;
}
