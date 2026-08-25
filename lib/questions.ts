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
  // Seed mixing (splitmix32): consecutive integer seeds (seed+i) must produce
  // decorrelated streams, otherwise path selection collapses to one branch.
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822507) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
  let s = (h ^ (h >>> 16)) % 2147483647;
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
// ===== SATZBAU: 32 distinct rule-level paths (German sentence rules) + 8 held-out =====
// Each path = a distinct grammar RULE the learner must apply (verb position, case,
// declension, word formation, negation, question formation, connector logic...).
const SB_SUBJ = ["Der Mitarbeiter", "Die Kollegin", "Der Chef", "Unser Team", "Der Kunde"];
const SB_VERB = ["prüft", "bestellt", "verschickt", "kontrolliert", "liest"];
const SB_OBJ_AKK = ["die Rechnung", "die Ware", "das Paket", "den Bericht", "die Liste"];
function genSatzbau(r: () => number, d: number): Question {
  const ph = (arr: string[]) => pick(r, arr);
  const sb = (opSeq: string, prompt: string, ans: string, expl: string, steps: number, cons: number, wml: number, dk: string) =>
    mk("deutsch", "satzbau", opSeq, d, prompt, undefined, ans, expl, "Achte auf die Satzbaumuster.", 20, 4, dk, "sort", opSeq,
      { opSequence: opSeq, stepCount: steps, constraintCount: cons, distractorKind: dk, workingMemoryLoad: wml, inputModality: "sequence", answerCardinality: 1 }, false);
  const path = ri(r, 0, 31);
  switch (path) {
    case 0: { // verb-second statement order
      const parts = pick(r, SENTENCES);
      return sb("reorder-verbsecond", "Bilde einen korrekten Satz: " + shuffle(parts, r).join(" "), parts.join(" "),
        "Richtig: " + parts.join(" ") + " — Verb auf Position 2.", 1, 0, 2, "wrong-word-order");
    }
    case 1: { // subordinate clause: verb to the end
      const subj = pick(r, SB_SUBJ), obj = pick(r, SB_OBJ_AKK);
      const konj = pick(r, [["weil"], ["obwohl"], ["wenn"], ["falls"]]);
      const reason = pick(r, ["die Frist kurz ist", "das Lager voll ist", "der Kunde wartet", "die Zahlung fehlt"]);
      return sb("subordinate-verb-final", `Bilde: „${subj} ${pick(r, SB_VERB)} ${obj}“ + „${konj[0]} ${reason}“`,
        `${subj} ${pick(r, SB_VERB)} ${obj}, ${konj[0]} ${reason}.`, "Im Nebensatz steht das Verb am Ende.", 2, 1, 3, "verb-in-wrong-position");
    }
    case 2: { // yes/no question inversion
      const base = pick(r, [
        ["Der Chef liest den Bericht.", "Liest der Chef den Bericht?"],
        ["Die Kollegin schreibt die Mail.", "Schreibt die Kollegin die Mail?"],
        ["Wir laden die Ware.", "Laden wir die Ware?"],
        ["Er ruft den Kunden an.", "Ruft er den Kunden an?"],
      ]);
      return sb("question-inversion", `Verwandle in eine Ja/Nein-Frage: „${base[0]}“`, base[1], "Verb an Position 1 bei Ja/Nein-Fragen.", 1, 0, 2, "no-inversion");
    }
    case 3: { // W-question with fronted question word
      const pairs = pick(r, [
        ["Der Chef liest den Bericht.", "Was liest der Chef?", "Was"],
        ["Er kommt um acht Uhr.", "Wann kommt er?", "Wann"],
        ["Sie wohnt in Bern.", "Wo wohnt sie?", "Wo"],
        ["Das Paket kostet CHF 40.", "Wie viel kostet das Paket?", "Wie viel"],
      ]);
      return sb("wquestion-fronting", `Bilde die W-Frage nach dem fett gedruckten Wort: „${pairs[0]}“ → Fragewort „${pairs[2]}“`, pairs[1],
        "Fragewort + Verb + Subjekt.", 1, 0, 2, "statement-instead-of-question");
    }
    case 4: { // negation 'nicht' before infinitive/participle
      const obj = pick(r, ["die Rechnung", "die Mail", "das Paket"]);
      const vb = pick(r, ["gesehen", "verschickt", "geprüft"]);
      return sb("negation-nicht-placement", `Setze „nicht“ richtig ein: „Ich habe ${obj} ${vb}.“`, `Ich habe ${obj} nicht ${vb}.`,
        "„nicht“ steht direkt vor Partizip/Infinitiv.", 1, 0, 2, "negation-wrong-slot");
    }
    case 5: { // article agreement der/die/das
      const noun = pick(r, [["Kunde", "der"], ["Rechnung", "die"], ["Paket", "das"], ["Bericht", "den|der"], ["Sendung", "die"], ["Termin", "der"]]);
      const art = noun[1].split("|")[0];
      return sb("article-gender", `Setze den bestimmten Artikel (Nominativ): „___ ${noun[0]}“`, `${art} ${noun[0]}`,
        "Genus bestimmen: " + art + " " + noun[0] + ".", 1, 0, 2, "wrong-gender");
    }
    case 6: { // Akkusative after 'haben/sehen' — der→den
      const m = pick(r, [["der Bericht", "den Bericht"], ["der Termin", "den Termin"], ["der Kunde", "den Kunden"]]);
      return sb("akkusative-masculine", `Akkusativ: „Ich sehe ___“ (${m[0]} im Nominativ)`, "Ich sehe " + m[1] + ".",
        "Maskulin Akkusativ: der → den.", 1, 1, 2, "nominative-in-accusative");
    }
    case 7: { // Dative after 'mit'
      const m = pick(r, [["der Chef", "dem Chef"], ["die Kollegin", "der Kollegin"], ["das Team", "dem Team"]]);
      return sb("dative-after-mit", `Mit wem? Setze richtig: „Ich spreche mit ___“ (${m[0]} im Nominativ)`, "Ich spreche mit " + m[1] + ".",
        "Nach „mit“ steht Dativ.", 1, 1, 2, "accusative-after-preposition");
    }
    case 8: { // present→perfect with haben
      const b = pick(r, [
        ["Er kauft das Material.", "Er hat das Material gekauft."],
        ["Wir prüfen die Liste.", "Wir haben die Liste geprüft."],
        ["Sie schreibt die Mail.", "Sie hat die Mail geschrieben."],
      ]);
      return sb("perfect-haben", `Perfekt: „${b[0]}“`, b[1], "haben + Partizip am Satzende.", 1, 0, 3, "wrong-participle");
    }
    case 9: { // present→perfect with sein (motion)
      const b = pick(r, [
        ["Er geht ins Büro.", "Er ist ins Büro gegangen."],
        ["Wir fahren nach Zürich.", "Wir sind nach Zürich gefahren."],
        ["Sie kommt um acht.", "Sie ist um acht gekommen."],
      ]);
      return sb("perfect-sein", `Perfekt: „${b[0]}“`, b[1], "Bewegung: sein + Partizip.", 1, 1, 3, "haben-with-motion-verb");
    }
    case 10: { // modal verb construction
      const b = pick(r, [
        ["Er muss die Rechnung prüfen.", "muss ... prüfen (Infinitiv am Ende)"],
        ["Sie kann das Paket tragen.", "kann ... tragen (Infinitiv am Ende)"],
        ["Wir wollen den Chef sprechen.", "wollen ... sprechen (Infinitiv am Ende)"],
      ]);
      return sb("modal-infinitive-end", `Welches Muster gilt: „${b[0]}“?`, b[1], "Modalverb Position 2, Infinitiv ganz am Ende.", 2, 1, 3, "finite-form-at-end");
    }
    case 11: { // separable verb prefix to the end
      const b = pick(r, [
        ["Er ruft den Kunden an.", "anrufen"],
        ["Wir geben die Ware ab.", "abgeben"],
        ["Sie sieht das Paket ein.", "einsehen"],
        ["Er stellt die Ware um.", "umstellen"],
      ]);
      return sb("separable-prefix-end", `Trennbares Verb erkennen: „${b[0]}“ → Infinitiv?`, b[1], "Präfix abtrennen und zusammensetzen.", 1, 0, 2, "wrong-prefix");
    }
    case 12: { // plural formation
      const b = pick(r, [
        ["der Artikel", "die Artikel"], ["die Mail", "die Mails"], ["das Paket", "die Pakete"], ["der Kunde", "die Kunden"], ["das Lager", "die Lager"],
      ]);
      return sb("plural-formation", `Plural: „${b[0]}“`, b[1], "Pluralform lernen.", 1, 0, 2, "wrong-plural");
    }
    case 13: { // comparative
      const b = pick(r, [["groß", "größer"], ["schnell", "schneller"], ["teuer", "teurer"], ["gut", "besser"], ["viel", "mehr"]]);
      return sb("comparative-form", `Komparativ von „${b[0]}“`, b[1], "Steigerungsform.", 1, 0, 2, "mehr-plus-adjective");
    }
    case 14: { // superlative with 'am'
      const b = pick(r, [["schnell", "am schnellsten"], ["gut", "am besten"], ["gerne", "am liebsten"], ["billig", "am billigsten"]]);
      return sb("superlative-am", `Superlativ: „${b[0]}“`, b[1], "am + Stamm + -sten.", 1, 0, 2, "wrong-superlative");
    }
    case 15: { // imperative
      const b = pick(r, [
        ["du | kommen", "Komm!"], ["Sie | nehmen", "Nehmen Sie!"], ["ihr | warten", "Wartet!"], ["du | machen", "Mach!"],
      ]);
      return sb("imperative-form", `Imperativ (${b[0]}): „${pick(r, ["hier bleiben", "das Formular ausfüllen", "auf mich warten", "langsam fahren"])}“ — richtige Form für die Anweisung mit derselben Regel wählen`, b[1],
        "Imperativbildung nach Adressat.", 1, 1, 2, "infinitive-as-imperative");
    }
    case 16: { // possessive articles
      const who = pick(r, [["ich", "mein Handy"], ["du", "dein Handy"], ["er", "sein Handy"]]);
      void who;
      const nounCase = pick(r, [["mein Vater", "meinen Vater (Akk.)"], ["meine Tasche", "meine Tasche (Akk.)"], ["mein Buch", "mein Buch (Akk.)"]]);
      return sb("possessive-declension", `Possessivartikel im Akkusativ: „Ich sehe ___“ (ausgangend von „${nounCase[0].split(" ")[0]}“ + Nomen)`, nounCase[1],
        "Endung nach Genus im Akkusativ.", 1, 1, 2, "missing-ending");
    }
    case 17: { // preposition 'in' + Dativ (location) vs Akkusativ (direction)
      const b = pick(r, [
        ["in + Lager (wo?)", "im Lager"],
        ["in + Büro (wo?)", "im Büro"],
        ["in + Küche (wohin?)", "in die Küche"],
      ]);
      return sb("in-dative-vs-accusative", `Richtige Form: „${b[0]}“`, b[1], "wo? → Dativ; wohin? → Akkusativ.", 1, 1, 3, "case-confusion");
    }
    case 18: { // word order: TeKaMoLo (time-causal-manner-place)
      const ans = pick(r, [
        ["Ich fahre morgen nach Bern.", "Zeit vor Ort"],
        ["Wir treffen uns heute im Büro.", "Zeit vor Ort"],
      ]);
      void ans;
      return sb("wordorder-tekamolo", `Reihenfolge der Angaben: Zeit, Ort — „Ich gehe (heute)(ins Büro).“, kombiniert?`,
        "Ich gehe heute ins Büro.", "Temporale Angabe vor lokaler.", 2, 1, 3, "place-before-time");
    }
    case 19: { // connector meaning choice
      const c = pick(r, [
        ["Die Lieferung ist spät, ______ rufen wir den Kunden an.", "deshalb"],
        ["Das Material fehlt, ______ bestellen wir neu.", "deshalb"],
        ["Es regnet, ______ spielen wir drinnen.", "trotzdem"],
      ]);
      void c;
      return sb("connector-meaning", `Verbinde logisch: „Die Lieferung ist spät, ___ rufen wir an.“ (Folge)`, "deshalb",
        "Folge: deshalb; Grund: denn/weil.", 1, 1, 2, "weil-for-consequence");
    }
    case 20: { // zu + infinitive after verbs like versuchen/vorhaben
      const b = pick(r, [["versuchen", "zu kommen"], ["vergessen", "zu schreiben"], ["beginnen", "zu lesen"]]);
      return sb("zu-infinitive", `Richtig: „Er versucht, pünktlich ___“ (${b[0]} + Infinitiv mit zu)`, "zu kommen",
        "Infinitiv mit „zu“ nach bestimmten Verben.", 1, 1, 3, "bare-infinitive");
    }
    case 21: { // relative pronoun agreement
      const b = pick(r, [
        ["Der Mann, ___ das Paket bringt", "der"],
        ["Die Frau, ___ die Kasse bedient", "die"],
        ["Das Kind, ___ dort spielt", "das"],
      ]);
      return sb("relative-pronoun", `Relativpronomen: „${b[0]} …“`, b[1], "Relativpronomen = Genus des Bezugswords.", 1, 1, 3, "wrong-relative");
    }
    case 22: { // passive werden + Partizip
      const b = pick(r, [
        ["Der Chef liest den Bericht.", "Der Bericht wird gelesen."],
        ["Wir laden die Ware.", "Die Ware wird geladen."],
      ]);
      return sb("passive-werden", `Passiv: „${b[0]}“`, b[1], "werden + Partizip II.", 2, 1, 3, "wrong-auxiliary");
    }
    case 23: { // Konjunktiv II polite request
      const b = pick(r, [
        ["Helfen Sie mir.", "Könnten Sie mir helfen?"],
        ["Geben Sie mir das.", "Könnten Sie mir das geben?"],
      ]);
      return sb("konjunktiv-request", `Höfliche Bitte: „${b[0]}“`, b[1], "könnten/würden + Infinitiv.", 1, 1, 3, "blunt-imperative");
    }
    case 24: { // reflexive verbs
      const b = pick(r, [
        ["Ich wasche ___.", "mich"], ["Du interessierst dich ___ Musik.", "dich"], ["Wir freuen ___.", "uns"],
      ]);
      return sb("reflexive-pronoun", `Reflexivpronomen einsetzen: „${b[0]}“`, b[1], "Reflexivpronomen passend zum Subjekt.", 1, 1, 2, "wrong-reflexive");
    }
    case 25: { // adjective declension after definite article
      const b = pick(r, [
        ["der neue Mitarbeiter", "neue"], ["die alte Rechnung", "alte"], ["das kleine Paket", "kleine"],
      ]);
      void b;
      const t = pick(r, [["der groß__ Tisch", "große"], ["die klein__ Schachtel", "kleine"], ["das neu__ Regal", "neue"]]);
      return sb("adj-ending-def-article", `Adjektivendung: „${t[0]}“`, t[1], "Nach bestimmtem Artikel: -e (Nom. Sg.).", 1, 1, 2, "missing-or-wrong-ending");
    }
    case 26: { // adjective declension after indefinite article
      const t = pick(r, [["ein groß__ Tisch", "großer"], ["eine klein__ Schachtel", "kleine"], ["ein neu__ Regal", "neues"]]);
      return sb("adj-ending-indef-article", `Adjektivendung: „${t[0]}“`, t[1], "Nach unbestimmtem Artikel zeigt die Endung das Genus.", 1, 1, 3, "wrong-ending");
    }
    case 27: { // Präteritum of sein/haben (common in writing)
      const b = pick(r, [
        ["Ich ___ gestern im Lager.", "(war) sein-Präteritum"], ["Wir ___ keine Zeit.", "(hatten) haben-Präteritum"],
      ]);
      void b;
      const t = pick(r, [["Ich ___ gestern krank (sein)", "war"], ["Wir ___ müde (haben)", "hatten"]]);
      return sb("praeteritum-sein-haben", `Präteritum: „${t[0]}“`, t[1], "war / hatten.", 1, 0, 2, "perfect-used-in-writing");
    }
    case 28: { // Futur I
      const b = pick(r, [
        ["Morgen besuche ich den Kunden.", "Ich werde morgen den Kunden besuchen."],
        ["Wir liefern nächste Woche.", "Wir werden nächste Woche liefern."],
      ]);
      return sb("futur-i", `Futur I: „${b[0]}“`, b[1], "werden + Infinitiv am Ende.", 1, 0, 3, "present-only");
    }
    case 29: { // n-Deklination (weak nouns)
      const b = pick(r, [["der Junge (Akk.)", "den Jungen"], ["der Kollege (Dat.)", "dem Kollegen"], ["der Kunde (Akk.)", "den Kunden"]]);
      return sb("n-declension", `n-Deklination: „${b[0]}“`, b[1], "Schwache Nomen bekommen -n(en).", 1, 1, 3, "regular-declension");
    }
    case 30: { // verb 'lassen'
      const b = pick(r, [
        ["Ich lasse das Paket ___ (bringen).", "bringen"],
        ["Er lässt das Auto ___ (reparieren).", "reparieren"],
      ]);
      return sb("lassen-construction", `lassen-Konstruktion: „${b[0]}“`, b[1], "lassen + Objekt + Infinitiv am Ende.", 2, 1, 3, "participle-with-lassen");
    }
    default: { // 31: um...zu vs damit
      const b = pick(r, [
        ["Ich komme früh, ___ ich habe Zeit.", "weil"], // purpose/reason contrast pair
        ["Ich lerne Deutsch, ___ ich in der Schweiz arbeite.", "weil"],
        ["Ich spare Geld, ___ ein Auto zu kaufen.", "um"],
      ]);
      void b;
      return sb("um-zu-vs-damit", `„Ich spare Geld, ___ ein Auto zu kaufen.“ (Zwecksatz mit gleichem Subjekt)`, "um",
        "gleiches Subjekt: um…zu; verschiedenes: damit.", 1, 1, 3, "damit-for-same-subject");
    }
  }
}
// genTextverst defined above (4 text types).
// ===== TEXTVERSTÄNDNIS: 14 distinct rule-level reading operations =====
// ===== TEXTVERSTÄNDNIS: 14 reading-operation paths, each with RICH parameterized
// content pools so the distinct-prompt count far exceeds the items served in 56 days =====
function genTextverst(r: () => number, d: number): Question {
  const tv = (opSeq: string, text: string, q: string, opts: string[], expl: string, steps: number, cons: number, wml: number, dk: string) => {
    const ans = opts[0];
    return {
      id: "de-tv-" + ri(r, 1000, 9999), area: "deutsch", subskill: "textverstaendnis", type: "reading" as const, kind: "choice" as const,
      difficulty: d <= 40 ? 1 : d <= 70 ? 2 : 3, prompt: q, stimulus: "Text: " + text, options: shuffle(opts, r),
      answer: ans, explanation: expl, hint: "Lies den Text genau.", estimatedTime: 30, examRelevance: 5,
      commonErrors: dk, difficultyScore: 50, concept: opSeq, templateKey: "tv-" + opSeq,
      structSig: { opSequence: opSeq, stepCount: steps, constraintCount: cons, distractorKind: dk, workingMemoryLoad: wml, inputModality: "text", answerCardinality: 1 },
      structHash: structHashOf({ opSequence: opSeq, stepCount: steps, constraintCount: cons, distractorKind: dk, workingMemoryLoad: wml, inputModality: "text", answerCardinality: 1 }),
    };
  };
  const path = ri(r, 0, 13);
  switch (path) {
    case 0: { // read-locate-fact: many notice texts + conditions
      const facts = [
        ["Achtung: Die Lieferung erfolgt nur nach Voranmeldung.", "eine Voranmeldung"],
        ["Zutritt nur mit gültigem Ausweis.", "ein gültiger Ausweis"],
        ["Rückgabe nur mit Originalbeleg.", "der Originalbeleg"],
        ["Der Aufzug ist wegen Wartung ausser Betrieb.", "eine Wartung"],
        ["Hunde müssen an der Leine geführt werden.", "eine Leine"],
        ["Bezahlung ausschliesslich bar oder mit Karte.", "bar oder mit Karte"],
        ["Umkleiden vor Betreten der Halle Pflicht.", "ein Umkleiden"],
        ["Rauchen ist auf dem ganzen Gelände verboten.", "überall verboten"],
      ];
      const f = pick(r, facts);
      return tv("read-locate-fact", f[0],
        pick(r, ["Was ist nötig?", "Welche Bedingung gilt hier?", "Was wird verlangt?"]),
        [f[1], "eine Zahlung", "keine Angabe", "eine schriftliche Erlaubnis"],
        "Im Text steht die Bedingung direkt.", 1, 0, 2, "plausible-but-unstated");
    }
    case 1: { // read-locate-time-range: many opening-time texts
      const t = pick(r, [
        ["Die Sprechstunde ist von 9 bis 12 Uhr.", "9 bis 12 Uhr"],
        ["Der Tresen ist von 7 bis 19 Uhr besetzt.", "7 bis 19 Uhr"],
        ["Beratung nur von 14 bis 16 Uhr.", "14 bis 16 Uhr"],
        ["Die Bibliothek hat von 10 bis 18 Uhr offen.", "10 bis 18 Uhr"],
        ["Anlieferung nur zwischen 6 und 10 Uhr.", "6 bis 10 Uhr"],
      ]);
      return tv("read-locate-time-range", t[0],
        pick(r, ["Wann ist die Sprechstunde/Öffnung?", "In welchem Zeitfenster ist es möglich?"]),
        [t[1], "ganztags", "nur nachmittags", "rund um die Uhr"],
        "Zeitangabe direkt im Text.", 1, 0, 2, "nearby-time");
    }
    case 2: { // read-deadline-cutoff
      const c = pick(r, [
        ["Bestellungen bis 18 Uhr werden am selben Tag versandt.", "bis 18 Uhr"],
        ["Anmeldungen bis Freitag werden berücksichtigt.", "bis Freitag"],
        ["Reklamationen bis 30 Tage nach Kauf sind möglich.", "bis 30 Tage nach Kauf"],
        ["Bewerbungen bis zum 15. März sind gültig.", "bis zum 15. März"],
        ["Ummeldungen bis Monatsende bleiben gebührenfrei.", "bis Monatsende"],
      ]);
      return tv("read-deadline-cutoff", c[0],
        pick(r, ["Bis wann gilt die Regel?", "Wann ist die Frist?", "Welche Grenze gilt?"]),
        [c[1], "bis Mittag", "am Wochenende", "ohne Ende"],
        "Die Frist steht im Satz.", 1, 1, 2, "adjacent-time");
    }
    case 3: { // read-infer-expectation
      const e = pick(r, [
        ["Wir bitten um kurze Mitteilung bei Verzögerung.", "eine Mitteilung"],
        ["Bitte melden Sie sich, wenn etwas fehlt.", "sich melden"],
        ["Bei Fragen wenden Sie sich an den Empfang.", "den Empfang kontaktieren"],
        ["Kommt es zu Störungen, informieren Sie bitte die Leitstelle.", "die Leitstelle informieren"],
      ]);
      return tv("read-infer-expectation", e[0],
        pick(r, ["Was wird erwartet?", "Wie soll man reagieren?"]),
        [e[1], "eine Entschuldigung", "gar nichts", "einen Bericht schreiben"],
        "Höflichkeitsform → Erwartung ableiten.", 1, 1, 3, "over/under-action");
    }
    case 4: { // negate-exception-scan
      const x = pick(r, [
        ["Der Eintritt ist frei. Ausnahme: Für Gruppen ab 10 Personen wird eine Gebühr erhoben.", "für Gruppen ab 10 Personen"],
        ["Das Parken ist kostenlos. Ausnahme: Lastwagen zahlen Gebühr.", "für Lastwagen"],
        ["Alle Getränke inklusive. Ausnahme: Cocktails werden berechnet.", "für Cocktails"],
        ["Zutritt erlaubt. Ausnahme: Ohne Maske kein Eintritt.", "ohne Maske"],
      ]);
      return tv("negate-exception-scan", x[0],
        pick(r, ["Wann gilt die Ausnahme?", "Wann kostet/ändert es sich?"]),
        [x[1], "für alle Besucher", "nie", "immer"],
        "Ausnahme erkennen („Ausnahme:“).", 2, 1, 3, "main-rule-only");
    }
    case 5: { // compare-two-offers (computed)
      const a = ri(r, 35, 70), b = ri(r, 55, 90), m = ri(r, 4, 10);
      const A = a * m, B = b * m;
      const cheaper = A <= B ? `Angebot A (CHF ${A})` : `Angebot B (CHF ${B})`;
      return tv("compare-two-offers",
        `Angebot A: CHF ${a} pro Monat, Mindestlaufzeit ${m} Monate. Angebot B: CHF ${b} pro Monat, keine Bindung.`,
        `Welches Angebot ist nach ${m} Monaten günstiger?`,
        [cheaper, cheaper === `Angebot A (CHF ${A})` ? `Angebot B (CHF ${B})` : `Angebot A (CHF ${A})`, "beide gleich teuer"],
        `${m} × ${a} = ${A} vs ${m} × ${b} = ${B}.`, 3, 1, 4, "monthly-rate-only");
    }
    case 6: { // apply-stated-rule-to-case
      const lim = ri(r, 5, 20), got = lim + ri(r, 2, 12), fee = ri(r, 3, 12);
      return tv("apply-stated-rule-to-case",
        `Regel: Wer mehr als ${lim} kg Gepäck hat, zahlt CHF ${fee} extra. ${pick(r, ["Nina", "Tom", "Sara", "Ali"])} hat ${got} kg.`,
        `Was gilt für ${pick(r, ["Nina", "Tom", "Sara", "Ali"])}?`,
        [`${pick(r, ["sie", "er"])} zahlt CHF ${fee} extra`, "sie/er zahlt nichts", "das Gepäck wird abgewiesen"],
        `Fall unter Regel subsumieren: ${got} > ${lim}.`, 2, 1, 3, "rule-ignored");
    }
    case 7: { // locate-opening-hours-day
      const h = pick(r, [
        ["Mo–Fr 8–18 Uhr, Sa 9–12 Uhr. Sonntag geschlossen.", "9–12 Uhr", "SAMSTAG"],
        ["Mo–Mi 9–17, Do–Fr 9–20, Sa 10–14.", "10–14 Uhr", "SAMSTAG"],
        ["Werktags 7–19, Samstag 8–12, Sonntag geschlossen.", "8–12 Uhr", "SAMSTAG"],
      ]);
      return tv("locate-opening-hours-day", h[0],
        `Wann hat das Geschäft am ${h[2]} offen?`,
        [h[1], "8–18 Uhr", "geschlossen", "rund um die Uhr"],
        "Richtige Zeile der Tabelle zuordnen.", 2, 1, 3, "wrong-row");
    }
    case 8: { // sequence-events-in-text
      const s = pick(r, [
        ["Zuerst wird der Vertrag geprüft, danach unterschrieben; anschliessend erhältst du eine Kopie.", "man erhält eine Kopie", "nach dem Unterschreiben"],
        ["Zuerst anmelden, dann beraten lassen, zuletzt bestellen.", "man bestellt", "zuletzt"],
        ["Erst messen, dann zuschneiden, danach kleben.", "man klebt", "danach"],
      ]);
      return tv("sequence-events-in-text", s[0],
        `Was passiert ${s[2]}?`,
        [s[1], "der Vertrag wird geprüft", "nichts", "man beginnt von vorne"],
        "Sequenzmarken (danach/anschliessend) folgen.", 2, 0, 3, "step-skipped");
    }
    case 9: { // identify-author-purpose
      const p = pick(r, [
        ["WARNUNG: Das Betreten der Baustelle ist lebensgefährlich!", "um vor einer Gefahr zu warnen"],
        ["WICHTIG: Termin bitte 24h vorher absagen.", "um auf eine Pflicht hinzuweisen"],
        ["GRATIS Probeabo für 4 Wochen – jetzt anmelden!", "um zu werben/anwerben"],
        ["ACHTUNG: Glatteis auf dem Pausenhof.", "um vor einer Gefahr zu warnen"],
      ]);
      return tv("identify-author-purpose", p[0],
        "Warum wurde dieser Text geschrieben?",
        [p[1], "um ein Produkt zu verkaufen", "um einzuladen", "zur Unterhaltung"],
        "Textsorte/Signalwort deuten.", 1, 0, 2, "literal-content-only");
    }
    case 10: { // resolve-pronoun-reference
      const who = pick(r, [["Herr Meier", "der Chef"], ["die Lehrerin", "die Schülerin"], ["der Arzt", "die Patientin"], ["der Vater", "der Sohn"]]);
      const obj = pick(r, ["Bericht", "Schlüssel", "Mappe", "Rezept"]);
      return tv("resolve-pronoun-reference",
        `Als ${who[0]} ${who[1]} traf, übergab ${who[0].split(" ")[1] === "Meier" ? "ihm" : "ihr"} ${who[0].split(" ")[1] === "Meier" ? "seinen" : "ihren"} ${obj}.`,
        `Wem gab ${who[0]} den ${obj}?`,
        [who[1], "sich selbst", "einem Kollegen", "dem Empfang"],
        "Pronomen auf den richtigen Bezug beziehen.", 2, 1, 3, "wrong-referent");
    }
    case 11: { // quantifier-comprehension
      const q = pick(r, [
        ["Die meisten Mitarbeiter nutzen den neuen Drucker; einige wechseln noch.", "die meisten"],
        ["Alle Teilnehmer haben die Einverständniserklärung unterschrieben.", "alle"],
        ["Kaum jemand hat die alte Nummer gewählt.", "kaum jemand"],
        ["Einige Kunden warten noch auf ihre Rechnung.", "einige"],
      ]);
      return tv("quantifier-comprehension", q[0],
        "Wie viele sind es (laut Text)?",
        [q[1], "keiner", "genau die Hälfte", "etwa ein Drittel"],
        "Quantor genau lesen.", 1, 1, 2, "absolute-reading");
    }
    case 12: { // notice-vs-prohibition
      const n = pick(r, [
        ["Hinweis: Die Tiefgarage wird am Montag gesperrt. Bitte den Parkplatz neben dem Bahnhof nutzen.", "am Bahnhof parkieren"],
        ["Achtung: Brücke gesperrt. Bitte Umleitung über die Hauptstrasse nehmen.", "über die Hauptstrasse fahren"],
        ["Info: Schalter 3 geschlossen. Bitte Schalter 1 verwenden.", "Schalter 1 verwenden"],
      ]);
      return tv("notice-vs-prohibition", n[0],
        "Was sollen Betroffene tun?",
        [n[1], "an der gesperrten Stelle bleiben", "zu Hause bleiben", "nichts tun"],
        "Hinweis + Handlungsanweisung kombinieren.", 2, 1, 3, "notice-ignored");
    }
    default: { // price-table-extraction
      const a = (ri(r, 2, 6) + 0.2).toFixed(2).replace(".", "."), b = ri(r, 8, 15), c = (ri(r, 1, 4) + 0.6).toFixed(2);
      return tv("price-table-extraction",
        `Tarife: Einzelkarte CHF ${a}, Tageskarte CHF ${b}.-, Kinder CHF ${c}.`,
        "Was kostet eine Tageskarte?",
        [`CHF ${b}.–`, `CHF ${a}`, `CHF ${c}`],
        "Richtigen Tabellenwert ablesen.", 1, 0, 2, "wrong-column");
    }
  }
}
// ===== PROZESSLOGIK: 22 distinct rule-level paths =====
function genProzess(r: () => number, d: number): Question {
  const ph = (arr: string[]) => pick(r, arr);
  const pl = (opSeq: string, prompt: string, ans: string, expl: string, optsIn: string[] | undefined, steps: number, cons: number, wml: number, dk: string) =>
    mk("logik", "prozesslogik", opSeq, d, prompt, optsIn, ans, expl, "Denke den Ablauf Schritt für Schritt durch.", 22, 4, dk, "sort", opSeq,
      { opSequence: opSeq, stepCount: steps, constraintCount: cons, distractorKind: dk, workingMemoryLoad: wml, inputModality: "sequence", answerCardinality: 1 }, false);
  const wrongOrder = (steps: string[]) => [...steps.slice(1), steps[0]];
  const path = ri(r, 0, 21);
  switch (path) {
    case 0: { // linear ordering of a familiar process
      const steps = pick(r, [
        ["Bestellung aufgeben", "Ware prüfen", "Versand", "Rechnung"],
        ["Brief öffnen", "lesen", "antworten", "absenden"],
        ["Material holen", "schneiden", "kleben", "trocknen lassen"],
        ["Anmelden", "Daten eingeben", "prüfen", "absenden"],
        ["Kaffee mahlen", "aufbrühen", "einschenken", "servieren"],
      ]);
      const correct = steps.join(" → ");
      return pl("linear-sequence-ordering", ph(["Ordne die Schritte sinnvoll:", "Bringe die Ablaufschritte in die richtige Reihenfolge:"]), correct,
        "Logische Reihenfolge: " + correct, shuffle([correct, wrongOrder(steps).join(" → ")], r), steps.length, 0, 2, "rotated-order");
    }
    case 1: { // conditional ordering (constraint between two steps)
      const steps = ["Bestellung prüfen", "Kreditlimit prüfen", "Freigabe einholen", "Versand buchen", "Rechnung senden"];
      return pl("conditional-sequence-ordering", "Ordne mit Bedingung: Freigabe erst NACH Kreditlimitprüfung.", steps.join(" → "),
        "Bedingung beachtet.", [steps.join(" → "), wrongOrder(steps).join(" → ")], steps.length, 1, 3, "constraint-violated");
    }
    case 2: { // remove the irrelevant step
      const sets = pick(r, [
        [["Material holen", "schneiden", "kleben", "trocknen lassen"], "Kaffee trinken"],
        [["Bestellung prüfen", "kommissionieren", "verpacken", "versenden"], "Fenster streichen"],
        [["Dokument scannen", "ablegen", "Index setzen"], "Reifen wechseln"],
      ]);
      const correct = (sets[0] as string[]).join(" → ");
      return pl("remove-irrelevant-step", "Welcher Schritt gehört NICHT in diesen Ablauf?", String(sets[1]),
        `„${sets[1]}“ gehört nicht zum Prozess.`, dedupeOptions(shuffle([String(sets[1]), ...(sets[0] as string[]).slice(0, 3)], r)), 3, 0, 2, "removed-right-step");
    }
    case 3: { // principle application (safety/priority rule)
      const principle = pick(r, [
        ["Versand vor Bezahlung?", "Nein – zuerst prüfen, dann versenden.", "Prozessreihenfolge."],
        ["Kollege allein hochziehen bei Sturz?", "Nein – Erste Hilfe holen.", "Sicherheit vor Schnelligkeit."],
        ["Dokument sofort löschen?", "Nein – Aufbewahrungsfrist beachten.", "Compliance."],
      ]);
      return pl("principle-application", principle[0], principle[1], "Prinzip: " + principle[2], undefined, 1, 1, 2, "efficiency-over-safety");
    }
    case 4: { // classify step position (Anfang/Mitte/Ende)
      const triple = pick(r, [
        ["Bestellung aufgeben", "Versand", "Rechnung"],
        ["lesen", "antworten", "absenden"],
        ["Material holen", "kleben", "trocknen lassen"],
      ]);
      const pos = ri(r, 0, 2);
      const label = pos === 0 ? "am Anfang" : pos === 1 ? "in der Mitte" : "am Ende";
      return pl("step-position-classify", `Wo steht „${triple[pos]}“ im Ablauf ${triple.join(" → ")}?`, label,
        `„${triple[pos]}“ steht ${label}.`, undefined, 3, 0, 2, "wrong-position");
    }
    case 5: { // cause before effect
      const pair = pick(r, [
        ["Es regnet", "Die Strasse ist nass"],
        ["Der Stecker wird gezogen", "Das Gerät ist aus"],
        ["Das Feuer brennt", "Das Wasser kocht"],
      ]);
      return pl("cause-before-effect", `Was passiert ZUERST: „${pair[0]}“ oder „${pair[1]}“?`, pair[0],
        "Ursache vor Wirkung.", undefined, 2, 0, 2, "effect-first");
    }
    case 6: { // fill missing middle step
      const t = pick(r, [
        ["Anmelden", "absenden"],
        ["Material holen", "trocknen lassen"],
        ["Bestellung aufgeben", "Rechnung senden"],
      ]);
      const mid = pick(r, [
        ["Daten eingeben", "Formular drucken"],
        ["be- und verarbeiten", "wegwerfen"],
        ["kommissionieren", "ignorieren"],
      ]);
      return pl("fill-missing-step", `Ergänze den sinnvollen Zwischenschritt: ${t[0]} → ? → ${t[1]}`, mid[0],
        `${t[0]} → ${mid[0]} → ${t[1]}.`, undefined, 3, 0, 2, "implausible-middle");
    }
    case 7: { // dependency: may B start before A?
      const a = pick(r, ["Verpacken", "Etikettieren", "Endkontrolle"]);
      const b = pick(r, ["Versand", "Auslieferung", "Fakturierung"]);
      return pl("dependency-check", `Darf „${b}“ starten, bevor „${a}“ abgeschlossen ist?`, "Nein",
        `${a} liefert die Grundlage für ${b}.`, undefined, 2, 1, 2, "reversed-dependency");
    }
    case 8: { // detect repeated step (control loop)
      return pl("detect-repeat-step", `Welcher Schritt kommt ZWEIMAL vor? Bestellung → Prüfen → Korrigieren → Prüfen → Versand`, "Prüfen",
        "Kontrollschleife: Prüfen wiederholt sich.", undefined, 5, 0, 3, "wrong-repeat");
    }
    case 9: { // parallel eligibility
      return pl("parallel-vs-serial", `Können „Ware prüfen“ und „Verpackung vorbereiten“ gleichzeitig laufen?`, "Ja",
        "Unabhängige Schritte sind parallel möglich.", undefined, 2, 1, 2, "false-serial");
    }
    case 10: { // which step is skippable without breaking the goal
      const s = pick(r, [
        [["holen", "messen", "dokumentieren"], "dokumentieren"],
        [["bestellen", "einlagern", "feiern"], "feiern"],
      ]);
      void s;
      return pl("skip-step-consequence", `Ablauf: Formular ausfüllen → unterschreiben → abschicken. Welcher Schritt darf NIEMALS übersprungen werden?`, "unterschreiben",
        "Ohne Unterschrift ist das Formular ungültig.", undefined, 3, 1, 2, "skippable-chosen");
    }
    case 11: { // first-failure point: where does the process break?
      return pl("first-failure-point", `Ein Kunde erhält die falsche Ware. Wo wurde der Fehler WOHL erstmals gemacht? Bestellung erfassen → Kommissionierung → Verpackung → Versand`, "Kommissionierung",
        "Falsche Artikel kommen meist aus der Kommissionierung.", undefined, 4, 1, 3, "last-step-blamed");
    }
    case 12: { // if-then branching decision
      const b = pick(r, [
        ["Die Ware ist beschädigt.", "Ware zurückweisen und Schaden dokumentieren"],
        ["Der Kunde ist nicht zu Hause.", "Zustellung erneut versuchen / Abholung anbieten"],
        ["Der Lagerbestand ist leer.", "Nachbestellen und Kunden informieren"],
      ]);
      return pl("branch-decision", `Wenn "${b[0]}" — was ist der richtige Prozesszweig?`, b[1],
        "Regelgesteuerte Verzweigung.", undefined, 2, 1, 3, "ignore-condition");
    }
    case 13: { // ordering by priority when capacity is short
      return pl("priority-under-scarcity", `Du schaffst heute nur EINE Aufgabe: (a) Reklamation bearbeiten, (b) Archiv aufräumen, (c) Kaffeemaschine entkalken. Was zuerst?`, "(a)",
        "Kundenrelevanz hat Vorrang.", undefined, 2, 1, 2, "comfort-first");
    }
    case 14: { // cycle detection in a loop process
      return pl("loop-exit-condition", `Schleife: „Solange Stapel nicht leer: Karte ziehen, prüfen, ablegen.“ Was beendet die Schleife?`, "leerer Stapel",
        "Abbruchbedingung erkennen.", undefined, 3, 1, 3, "no-exit");
    }
    case 15: { // order by alphabet vs numeric vs date (choose the right key)
      const t = pick(r, [["Rechnungen ablegen", "nach Rechnungsdatum"], ["Kundenkartei", "alphabetisch nach Name"], ["Artikelliste", "nach Artikelnummer"]]);
      return pl("sort-key-selection", `Womit sortiert man am sinnvollsten: ${t[0]}?`, t[1],
        "Passender Sortierschlüssel.", undefined, 2, 0, 2, "random-key");
    }
    case 16: { // buffer/waiting logic: what happens between two steps?
      const t = pick(r, [["Bestellung", "Versand"], ["Bewerbung", "Vorstellungsgespräch"], ["Rechnung", "Mahnung"]]);
      return pl("intermediate-wait-step", `Was liegt typischerweise ZWISCHEN „${t[0]}“ und „${t[1]}“?`,
        t[0] === "Rechnung" ? "Zahlungsfrist verstreichen lassen" : t[0] === "Bewerbung" ? "Einladung abwarten" : "Zahlungseingang abwarten",
        "Zwischenschritt im Prozess.", undefined, 2, 0, 2, "step-skipped");
    }
    case 17: { // exception handling: normal path interrupted
      return pl("exception-path", `Im Normalfall läuft die Ware zum Versand. Was gilt bei STORNIERUNG durch den Kunden?`, "Ware zurück ins Lager einbuchen",
        "Ausnahmezweig führt zurück ins Lager.", undefined, 2, 1, 3, "normal-path-forced");
    }
    case 18: { // role handoff: who does the next step?
      const t = pick(r, [["Lagermitarbeiter", "Spediteur"], ["Sachbearbeiter", "Teamleiter"], ["Empfang", "Poststelle"]]);
      return pl("role-handoff", `Nach der Kommissionierung übergibt der Lagermitarbeiter die Ware an wen?`, t[0] === "Lagermitarbeiter" ? "den Spediteur" : t[0],
        "Übergabepunkt im Prozess.", undefined, 2, 0, 2, "wrong-role");
    }
    case 19: { // deadline gating: which step has a cutoff?
      return pl("deadline-gate", `Bestellungen bis 14 Uhr gehen noch heute raus. Was entscheidet über den Versandtag?`, "der Zahlungseingang bis 14 Uhr",
        "Cutoff-Zeit als Tor im Prozess.", undefined, 2, 1, 2, "no-gate");
    }
    case 20: { // count steps needed to reach a state
      const n = ri(r, 3, 6);
      return pl("count-steps-to-goal", `Jede Stufe senkt den Fehlbestand um 1. Wie viele Kontrollläufe braucht es von ${n} Fehlern auf 0?`, String(n),
        `${n} × 1 Fehler = ${n} Läufe.`, undefined, n, 1, 3, "off-by-one-count");
    }
    default: { // 21: reverse-engineer the previous step
      const t = pick(r, [
        ["Versand", "Verpackung"], ["Rechnung", "Versand"], ["Trocknen", "Kleben"],
      ]);
      return pl("backward-step-inference", `Im Prozess kommt „${t[0]}“ gerade abgeschlossen wurde. Was war der unmittelbare VORHERIGGE Schritt?`, t[1],
        `Vor „${t[0]}“ kommt „${t[1]}“.`, undefined, 2, 1, 2, "forward-confusion");
    }
  }
}
// ===== WORTGRUPPEN: 18 distinct rule-level paths (semantic-relation types) =====
function genWortgruppen(r: () => number, d: number): Question {
  const ph = (arr: string[]) => pick(r, arr);
  const wg = (opSeq: string, prompt: string, ans: string, expl: string, optsIn: string[] | undefined, steps: number, cons: number, wml: number, dk: string) =>
    mk("logik", "wortgruppen", opSeq, d, prompt, optsIn, ans, expl, "Finde die logische Beziehung.", 18, 3, dk, "choice", opSeq,
      { opSequence: opSeq, stepCount: steps, constraintCount: cons, distractorKind: dk, workingMemoryLoad: wml, inputModality: "choice", answerCardinality: 1 }, false);
  const sets: [string[], string][] = [
    [["Apfel", "Birne", "Banane"], "Traktor"],
    [["Auto", "Bus", "Zug"], "Stift"],
    [["Tisch", "Stuhl", "Regal"], "Hund"],
    [["Hund", "Katze", "Maus"], "Brille"],
    [["Rot", "Blau", "Grün"], "Teller"],
    [["Hammer", "Schraubenzieher", "Zange"], "Gabel"],
    [["Rose", "Tulpe", "Lilie"], "Kartoffel"],
    [["Montag", "Dienstag", "Mittwoch"], "Juli"],
    [["Löwe", "Tiger", "Bär"], "Lachs"],
    [["Brot", "Käse", "Joghurt"], "Hammer"],
  ];
  const path = ri(r, 0, 17);
  const [group, odd] = pick(r, sets);
  switch (path) {
    case 0: {
      const opts = dedupeOptions(shuffle([odd, ...group.slice(0, 2)], r));
      return wg("odd-one-out-category", `Welches Wort passt NICHT zur Gruppe? (${group.join(", ")})`, odd,
        `„${odd}“ gehört nicht zur Kategorie.`, opts, 1, 0, 2, "near-category-member");
    }
    case 1: {
      const two = group.slice(0, 2);
      return wg("find-same-category-pair", ph(["Welche zwei Wörter gehören zur selben Gruppe?", "Welches Paar hat die gemeinsame Kategorie?"]),
        two.join(" + "), `„${two[0]}“ und „${two[1]}“ gehören zusammen.`,
        dedupeOptions(shuffle([two.join(" + "), odd + " + " + group[0], group[1] + " + " + odd], r)), 1, 0, 2, "cross-category-pair");
    }
    case 2: {
      const analog = pick(r, [
        ["Apfel", "Obst", "Rose", "Blume"], ["Auto", "Fahrzeug", "Fahrrad", "Fahrzeug"],
        ["Hund", "Tier", "Löwe", "Tier"], ["Hammer", "Werkzeug", "Nagel", "Werkzeug"],
      ]);
      void analog;
      const a = pick(r, [["Hund : Welpe", "Katze : Kätzchen"], ["Vogel : Nest", "Biene : Bienenstock"], ["Fisch : Wasser", "Maulwurf : Erde"]]);
      return wg("analogy-relationship-transfer", `${a[0]} wie?`, a[1], "Beziehung übertragen.", dedupeOptions(shuffle([a[1], "Pflanze", "Stein"], r)), 1, 0, 3, "surface-match");
    }
    case 3: {
      const cat = pick(r, [
        ["Zitrone, Orange, Mandarine", "Zitrusfrüchte"], ["Auto, Bus, Zug", "Fahrzeuge"], ["Hund, Katze, Maus", "Tiere"], ["Rot, Blau, Grün", "Farben"],
        ["Hammer, Zange, Schraubenzieher", "Werkzeuge"], ["Montag, Dienstag, Mittwoch", "Wochentage"],
      ]);
      return wg("name-superordinate", `Wie heisst der Oberbegriff für: ${cat[0]}?`, cat[1], "Oberbegriff: " + cat[1] + ".", undefined, 1, 0, 2, "hyponym-instead");
    }
    case 4: {
      return wg("least-similar-pair", `Welches Paar ist am wenigsten ähnlich? ${group[0]} & ${group[1]} oder ${group[0]} & ${odd}?`, `${group[0]} & ${odd}`,
        `${odd} gehört nicht zur Gruppe.`, undefined, 1, 0, 2, "in-group-pair");
    }
    case 5: {
      return wg("count-category-members", `Wie viele dieser Wörter sind ${pick(r, ["Tiere", "Obst"])}? ${group.slice(0, 2).join(", ")}, ${odd}`, String(2),
        "Nur zwei gehören zur Kategorie.", undefined, 1, 1, 2, "included-outlier");
    }
    case 6: {
      const hier = pick(r, [["Birne", "Obst", "Ja"], ["Traktor", "Obst", "Nein"], ["Rose", "Tier", "Nein"], ["Hund", "Tier", "Ja"]]);
      return wg("hierarchy-membership", `Ist „${hier[0]}“ eine Art von ${hier[1]}?`, hier[2],
        `${hier[0]}: ${hier[2]}.`, undefined, 1, 0, 2, "wrong-membership");
    }
    case 7: { // part-whole relation
      const pw = pick(r, [
        ["Rad", "Fahrrad", "Ja"], ["Blatt", "Baum", "Ja"], ["Fenster", "Haus", "Ja"], ["Rad", "Brötchen", "Nein"],
      ]);
      return wg("part-whole-relation", `Ist „${pw[0]}“ ein TEIL von „${pw[1]}“?`, pw[2], "Teil-Ganzes-Beziehung prüfen.", undefined, 1, 0, 2, "whole-part-confusion");
    }
    case 8: { // opposite pairs (antonyms)
      const ant = pick(r, [["gross", "klein"], ["heiss", "kalt"], ["schnell", "langsam"], ["voll", "leer"], ["hell", "dunkel"]]);
      const wrong = pick(r, [["warm"], ["laut"], ["neu"], ["bunt"]]);
      return wg("antonym-matching", `Welches Wort ist das GEGENTEIL von „${ant[0]}“?`, ant[1],
        `${ant[0]} ↔ ${ant[1]}.`, dedupeOptions(shuffle([ant[1], wrong[0], "ähnlich", "gleich"], r)), 1, 0, 2, "synonym-chosen");
    }
    case 9: { // synonym matching
      const syn = pick(r, [["schnell", "rasch"], ["gross", "riesig"], ["klug", "gescheit"], ["schön", "hübsch"]]);
      return wg("synonym-matching", `Welches Wort bedeutet etwa das GLEICHE wie „${syn[0]}“?`, syn[1],
        `${syn[0]} ≈ ${syn[1]}.`, dedupeOptions(shuffle([syn[1], "entgegengesetzt", "selten", "falsch"], r)), 1, 0, 2, "antonym-chosen");
    }
    case 10: { // function/purpose of an object
      const fn = pick(r, [
        ["Hammer", "nageln"], ["Besen", "kehren"], ["Schere", "schneiden"], ["Kanne", "einschenken"],
      ]);
      return wg("object-function", `Wozu dient eine/ein „${fn[0]}“ am ehesten?`, "zum " + fn[1],
        `Ein ${fn[0]} dient zum ${fn[1]}.`, undefined, 1, 0, 2, "decorative-purpose");
    }
    case 11: { // which word does NOT fit a given property
      const prop = pick(r, [
        ["essbar", group[0][0], odd], ["fahrbar", "Bus", odd], ["farbig", "Grün", odd],
      ]);
      void prop;
      return wg("property-violation", `Welches Wort passt nicht zu den anderen (Eigenschaft)? ${["Banane", "Birne", "Stuhl"].join(", ")}`, "Stuhl",
        "Stuhl ist nicht essbar.", dedupeOptions(shuffle(["Banane", "Birne", "Stuhl"], r)), 1, 1, 2, "category-instead-property");
    }
    case 12: { // sequence words (first/next/last in a canonical order)
      const seq = pick(r, [
        ["Montag, Mittwoch, Freitag", "Mittwoch"], ["Januar, Februar, März", "Februar"], ["erster, zweiter, dritter", "zweiter"],
      ]);
      return wg("canonical-sequence-middle", `Welches Wort steht in der üblichen Reihenfolge IN DER MITTE? ${seq[0]}`, seq[1],
        "Reihenfolge kennen.", undefined, 1, 1, 2, "endpoints-chosen");
    }
    case 13: { // collective noun / grouping label
      const col = pick(r, [["Rudel", "Wölfe"], ["Schwarm", "Fische"], ["Herde", "Kühe"], ["Haufen", "Steine"]]);
      return wg("collective-noun", `Wie nennt man eine Gruppe von ${col[1]}?`, col[0],
        `Eine Gruppe: ${col[0]}.`, dedupeOptions(shuffle([col[0], "Sippe", "Gewässer", "Kiste"], r)), 1, 0, 2, "random-collective");
    }
    case 14: { // category boundary: which belongs to TWO categories?
      const two = pick(r, [["Tomate", "Obst und Gemüse"], ["Lachs", "Tier und Lebensmittel"], ["Gold", "Metall und Farbe"]]);
      return wg("dual-category-member", `Welches Wort gehört zu ZWEI Kategorien gleichzeitig?`, two[0],
        `${two[0]}: ${two[1]}.`, undefined, 1, 1, 3, "single-category-only");
    }
    case 15: { // degree/intensity ordering
      const deg = pick(r, [["warm", "heiss", "lauwarm"], ["gross", "riesig", "mittel"], ["gut", "sehr gut", "befriedigend"]]);
      return wg("intensity-ordering", `Ordne nach Intensität (schwächste zuerst): „${deg[0]}, ${deg[1]}, ${deg[2]}“ — welches ist am SCHWÄCHSTEN?`,
        deg[2].includes("lau") ? "lauwarm" : deg[2] === "mittel" ? "mittel" : "befriedigend",
        "Abstufungen vergleichen.", undefined, 1, 1, 3, "strongest-chosen");
    }
    case 16: { // which pair shares the same relation as model pair
      const rel = pick(r, [
        [["Vogel : fliegen", "Fisch : schwimmen"], ["Kind : Eltern", "Pferd : Fohlen"]],
      ])[0];
      return wg("relation-pattern-match", `Welches Paar zeigt dieselbe BEZIEHUNG wie „${rel[0]}“?`, rel[1],
        "Relation identifizieren und übertragen.", dedupeOptions(shuffle([rel[1], "Haus : Dachziegel", "Buch : lesen"], r)), 1, 0, 3, "surface-word-match");
    }
    default: { // 17: exclude by negation (all are X except one that is NOT-X)
      const neg = pick(r, [["nicht lebendig", "Stein", ["Rose", "Ameise", "Stein"]], ["kein Werkzeug", "Gabel", ["Hammer", "Zange", "Gabel"]]]);
      return wg("negated-grouping", `Welches Wort ist ${neg[0]}?`, String(neg[1]),
        `${neg[1]} erfüllt das Kriterium.`, dedupeOptions(shuffle(neg[2] as string[], r)), 1, 1, 2, "positive-match-chosen");
    }
  }
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
    difficulty: d < 45 ? 1 : d < 75 ? 2 : 3, prompt: verb + " " + symName + " (●▲■★) im Raster (" + n + "×" + n + ").", stimulus: svg, options: dedupeOptions(shuffle([String(count), ...distractors.map(String)], r)),
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
    difficulty: d < 45 ? 1 : d < 75 ? 2 : 3, prompt: "Zähle die " + symName + " NUR in der ERSTEN Reihe des Rasters (" + n + " Spalten).", stimulus: svg, options: opts,
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
    difficulty: d,
    prompt: `Erinnere dich (Reihe mit ${k} Schildern: ${chosen.join(", ")}): War das Schild ${ask} dabei?`,
    stimulus: svg,
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
    difficulty: d, prompt: `Wie viele Schilder wurden gezeigt (Reihe: ${chosen.join(", ")})?`, stimulus: svg, options: opts,
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
    difficulty: d, prompt: `Welche Kategorie hat das Symbol an Position ${pos + 1} der Reihe [${chosen.map((s, ix) => ix === pos ? "»" + s + "«" : s).join(", ")}]?`, stimulus: svg, options: opts,
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
    difficulty: d, prompt: `Reihe [${chosen.join(", ")}]: Kamen von ${a} und ${b} gleich viele oder mehr von einer Sorte?`, stimulus: svg, options: opts,
    answer: ans, explanation: `Bewertung: ${ans}.`, hint: "Zähle beide Sorten getrennt.", estimatedTime: 18, examRelevance: 2, commonErrors: "Relation falsch.",
    difficultyScore: 66, concept: "recall-compare", memorizeMs: 4000, templateKey: "merkfaehigkeit-schilder_erinnern-compare", structSig: { opSequence: "recall-compare", stepCount: 2, constraintCount: 0, distractorKind: "reversed-relation", workingMemoryLoad: 2, inputModality: "recall", answerCardinality: 1 }, structHash: structHashOf({ opSequence: "recall-compare", stepCount: 2, constraintCount: 0, distractorKind: "reversed-relation", workingMemoryLoad: 2, inputModality: "recall", answerCardinality: 1 }),
  };
}

// ===== PRAKTISCH =====
// ===== SORTIERVERFAHREN: 16 distinct rule-level paths =====
function genSort(r: () => number, d: number): Question {
  const ph = (arr: string[]) => pick(r, arr);
  const so = (opSeq: string, prompt: string, ans: string, expl: string, steps: number, cons: number, wml: number, dk: string) =>
    mk("praktisch", "sortierverfahren", opSeq, d, prompt, undefined, ans, expl, "Vergleiche systematisch.", 19, 4, dk, "sort", opSeq,
      { opSequence: opSeq, stepCount: steps, constraintCount: cons, distractorKind: dk, workingMemoryLoad: wml, inputModality: "sequence", answerCardinality: 1 }, false);
  const path = ri(r, 0, 15);
  const nums4 = () => { const s = new Set<number>(); while (s.size < 4) s.add(ri(r, 10, 99)); return [...s]; };
  switch (path) {
    case 0: { const n = nums4(); return so("sort-numeric-asc", ph(["Sortiere aufsteigend (klein → gross): ", "Ordne von klein nach gross: "]) + n.join(", "), [...n].sort((a,b)=>a-b).join(", "), "Aufsteigend: " + [...n].sort((a,b)=>a-b).join(", "), 4, 0, 2, "descending"); }
    case 1: { const n = nums4(); return so("sort-numeric-desc", ph(["Sortiere absteigend (gross → klein): ", "Ordne von gross nach klein: "]) + n.join(", "), [...n].sort((a,b)=>b-a).join(", "), "Absteigend: " + [...n].sort((a,b)=>b-a).join(", "), 4, 0, 2, "ascending"); }
    case 2: { const n = nums4(); return so("filter-even-sort", "Gib nur die GERADE Zahlen aufsteigend an: " + n.join(", "), n.filter(x=>x%2===0).sort((a,b)=>a-b).join(", ") || "(keine)", "Nur gerade, dann sortiert.", 5, 1, 3, "odd-included"); }
    case 3: { const n = nums4(); return so("filter-odd-sort", "Gib nur die UNGERADE Zahlen aufsteigend an: " + n.join(", "), n.filter(x=>x%2===1).sort((a,b)=>a-b).join(", ") || "(keine)", "Nur ungerade, dann sortiert.", 5, 1, 3, "even-included"); }
    case 4: { const w = shuffle(["Apfel","Birne","Zebra","Maus"], r); return so("sort-wordlength-asc", "Sortiere nach Wortlänge (kurz → lang): " + w.join(", "), [...w].sort((a,b)=>a.length-b.length).join(", "), "Nach Länge: " + [...w].sort((a,b)=>a.length-b.length).join(", "), 4, 0, 2, "alphabetical"); }
    case 5: { const w = shuffle(["Apfel","Birne","Zebra","Maus"], r); return so("sort-alphabetical", "Sortiere alphabetisch: " + w.join(", "), [...w].sort().join(", "), "Alphabetisch: " + [...w].sort().join(", "), 4, 0, 2, "by-length"); }
    case 6: { const n = nums4(); return so("find-min-value", ph(["Welche Zahl ist die KLEINSTE? ", "Kleinster Wert unter: "]) + n.join(", "), String(Math.min(...n)), "Kleinste: " + Math.min(...n), 4, 0, 2, "picked-max"); }
    case 7: { const n = nums4(); return so("find-max-value", ph(["Welche Zahl ist die GRÖSSTE? ", "Grösster Wert unter: "]) + n.join(", "), String(Math.max(...n)), "Grösste: " + Math.max(...n), 4, 0, 2, "picked-min"); }
    case 8: { // second smallest — order statistic
      const n = nums4(); const s = [...n].sort((a,b)=>a-b);
      return so("second-smallest", `Welche Zahl ist die ZWEITkleinste? ${n.join(", ")}`, String(s[1]), `Sortiert: ${s.join(", ")}; zweitkleinste = ${s[1]}.`, 5, 1, 3, "picked-smallest");
    }
    case 9: { // median of 4 (lower median)
      const n = nums4(); const s = [...n].sort((a,b)=>a-b);
      return so("median-position", `Welche Zahl liegt in der sortierten Reihenfolge an 2. Stelle? ${n.join(", ")}`, String(s[1]), `Sortiert: ${s.join(", ")}.`, 5, 1, 3, "unsorted-pick");
    }
    case 10: { // sort by decimal magnitude (mixed magnitudes)
      const vals = shuffle([ri(r,2,9)/10, ri(r,1,9), ri(r,11,99)/100*100/100+ri(r,0,0)+ri(r,1,9)*0.01+0.0].map(v=>Math.round(v*100)/100).concat([ri(r,2,9)]), r).slice(0,4);
      const sv = [...vals].sort((a,b)=>a-b);
      return so("sort-decimals-asc", "Sortiere aufsteigend (Kommas beachten!): " + vals.map(v=>String(v)).join(", "), sv.map(v=>String(v)).join(", "), "Als Zahl vergleichen: " + sv.join(" ≤ "), 5, 1, 3, "string-compare");
    }
    case 11: { // sort times of day
      const t = shuffle([`${ri(r,7,11)}:${pick(r,["00","15","30","45"])}`, `${ri(r,12,17)}:${pick(r,["00","15","30","45"])}`, `${ri(r,18,22)}:${pick(r,["00","30"])}`, `${ri(r,1,6)}:${pick(r,["00","30"])}`], r);
      const key = (x:string)=>{const [h,m]=x.split(":").map(Number);return h*60+m;};
      return so("sort-times-chronological", "Sortiere die Uhrzeiten chronologisch: " + t.join(", "), [...t].sort((a,b)=>key(a)-key(b)).join(", "), "Chronologisch: " + [...t].sort((a,b)=>key(a)-key(b)).join(", "), 4, 1, 3, "string-order");
    }
    case 12: { // sort German words by reverse alphabet (Z→A)
      const w = shuffle(["Zug","Auto","Essen","Boot"], r);
      return so("sort-reverse-alpha", "Sortiere alphabetisch RÜCKWÄRTS (Z → A): " + w.join(", "), [...w].sort((a,b)=>b.localeCompare(a)).join(", "), "Rückwärts: " + [...w].sort((a,b)=>b.localeCompare(a)).join(", "), 4, 1, 3, "forward-alpha");
    }
    case 13: { // rank by weight/distance from clues (relative ordering)
      const a=ri(r,2,9), b=ri(r,2,9), c=ri(r,2,9);
      const items=[["A",a],["B",b],["C",c]] as [string,number][];
      if (new Set(items.map(i=>i[1])).size < 3) return so("rank-by-clue", "Drei Pakete: A wiegt 5 kg, B wiegt 3 kg, C wiegt 7 kg. Welches ist das SCHWERSTE?", "C", "C (7 kg) ist am schwersten.", 3, 1, 2, "wrong-extreme");
      const sorted=[...items].sort((x,y)=>y[1]-x[1]);
      return so("rank-by-clue", `Pakete: A=${a} kg, B=${b} kg, C=${c} kg. Welches ist das SCHWERSTE?`, sorted[0][0], `${sorted[0][0]} (${sorted[0][1]} kg).`, 3, 1, 2, "wrong-extreme");
    }
    case 14: { // insert into sorted sequence (which position?)
      const base = [12, 25, 41, 58]; const ins = ri(r, 13, 57);
      let pos = base.findIndex(b => b > ins); if (pos === -1) pos = 4;
      return so("insert-sorted-position", `An welche Position in der aufsteigenden Folge ${base.join(", ")} gehört die Zahl ${ins}?`, "Position " + (pos+1), `${ins} kommt zwischen ${pos>0?base[pos-1]:"Anfang"} und ${pos<4?base[pos]:"Ende"} → Position ${pos+1}.`, 5, 1, 3, "wrong-gap");
    }
    default: { // check if sorted (verify a claimed order)
      const n = nums4();
      const makeSorted = r() < 0.5;
      const seq = makeSorted ? [...n].sort((a,b)=>a-b) : shuffle(n, r);
      const isSorted = seq.every((v,i)=>i===0||seq[i-1]<=v);
      return so("verify-sorted", `Ist diese Reihe aufsteigend sortiert? ${seq.join(", ")}`, isSorted ? "Ja" : "Nein", isSorted ? "Ja, aufsteigend." : "Nein, mindestens ein Paar verletzt die Ordnung.", 4, 1, 3, "assumed-sorted");
    }
  }
}
// ===== ALLTAGSWISSEN: 16 distinct rule-level paths (situational judgment) =====
// ===== ALLTAGSWISSEN: 16 situational-judgment paths, each with rich pools =====
function genAlltag(r: () => number, d: number): Question {
  const ph = (arr: string[]) => pick(r, arr);
  const aw = (opSeq: string, prompt: string, optsIn: string[], expl: string, steps: number, cons: number, wml: number, dk: string) => {
    const ans = optsIn[0];
    return mk("praktisch", "alltagswissen", opSeq, d, prompt, shuffle(optsIn, r), ans,
      expl, "Überlege, was sicher und richtig ist.", 20, 4, dk, "choice", opSeq,
      { opSequence: opSeq, stepCount: steps, constraintCount: cons, distractorKind: dk, workingMemoryLoad: wml, inputModality: "choice", answerCardinality: 1 }, false);
  };
  const path = ri(r, 0, 15);
  switch (path) {
    case 0: { // emergency priority: many scenarios
      const s = pick(r, [
        ["Ein Kollege ist bewusstlos und atmet nicht.", "Erst Hilfe rufen (144), dann Erste Hilfe beginnen"],
        ["Jemand liegt mit Kopfverletzung am Boden.", "Erst Hilfe rufen, dann Stillhalten"],
        ["Eine Person verschluckt sich und wird blau.", "Sofort Heimlich-Griff, parallel Hilfe rufen"],
        ["Im Büro bricht jemand mit Brustschmerz zusammen.", "Notruf 144, ruhig lassen, nicht allein lassen"],
      ]);
      return aw("priority-sequence-emergency", s[0] + " Was ZUERST?",
        [s[1], "Weiterarbeiten und abwarten", "Die Person allein hochziehen", "Erst einen Kaffee holen"],
        "Notruf vor Selbsthilfe.", 2, 1, 3, "wrong-priority");
    }
    case 1: { // immediate danger
      const s = pick(r, [
        ["Du siehst Rauch im Lager.", "Alarm auslösen und Bereich verlassen"],
        ["Es riecht nach Gas.", "Lüften, keine Zündquellen, melden"],
        ["Du hörst lautes Zischen an einer Druckleitung.", "Abstand halten und melden"],
      ]);
      return aw("immediate-danger-action", s[0] + " Was tust du ZUERST?",
        [s[1], "weiterarbeiten", "Fenster schliessen und warten", "erst die Arbeit beenden"],
        "Gefahr → Alarm + Abstand.", 1, 1, 2, "delay-action");
    }
    case 2: { // prohibition
      const s = pick(r, [
        ["Was ist am Arbeitsplatz verboten?", "Mit unbekanntem USB-Stick den PC nutzen"],
        ["Was darfst du NICHT tun, wenn die Brandmeldeanlage läutet?", "Den Aufzug benutzen"],
        ["Was ist im Labor verboten?", "Essen und Trinken"],
        ["Was gilt im Lager als verboten?", "Rauchen bei Lagergut"],
      ]);
      return aw("identify-prohibition", s[0],
        [s[1], "Die Brille tragen", "Pausen einhalten", "Hände waschen"],
        "Verbotsregeln kennen.", 1, 0, 2, "allowed-picked");
    }
    case 3: { // reporting chain
      const s = pick(r, [
        ["Wen informierst du zuerst bei einem Datenleck?", "IT-Sicherheit"],
        ["Wohin meldest du einen Arbeitsunfall?", "Vorgesetzte/SUVA"],
        ["Wen rufst du bei Verdacht auf Unterschlagung?", "Vorgesetzte/Management"],
      ]);
      return aw("reporting-chain", s[0],
        [s[1], "einen Kollegen", "niemanden", "erst die Familie"],
        "Zuständige Stelle zuerst.", 1, 0, 2, "wrong-recipient");
    }
    case 4: { // PPE
      const s = pick(r, [
        ["Du betrittst die Werkstatt.", "Sicherheitsschuhe und Schutzbrille"],
        ["Du arbeitest mit Chemikalien.", "Handschuhe und Schutzbrille"],
        ["Du fährst Gabelstapler.", "Gurt anlegen und Schutzschuhe"],
      ]);
      return aw("personal-protective-equipment", s[0] + " Was gehört MANDATORILY dazu?",
        [s[1], "Kopfhörer", "kurze Ärmel für Bewegungsfreiheit", "eine Uhr"],
        "Schutzausrüstung nach Vorschrift.", 1, 0, 2, "comfort-first");
    }
    case 5: { // food hygiene
      const s = pick(r, [
        ["In der Küche fällt rohes Hühnfleisch auf den Boden.", "entsorgen — nicht weiterverarbeiten"],
        ["Rohmilch riecht sauer.", "nicht verwenden, wegkippen"],
        ["Brot liegt seit gestern offen herum.", "prüfen, bei Zweifel wegwerfen"],
      ]);
      return aw("hygiene-food-handling", s[0] + " Richtig ist:",
        [s[1], "abwaschen und trotzdem verwenden", "für später in den Kühlschrank legen", "kurz anbraten"],
        "Kontaminationsgefahr kennen.", 2, 1, 2, "risk-denial");
    }
    case 6: { // public transport etiquette
      const s = pick(r, [
        ["In einem vollen Zug steht eine schwangere Frau.", "Platz anbieten"],
        ["Im Bus sitzt ein gebrechlicher Senior.", "Platz anbieten"],
        ["Jemand mit Krücken steht im Waggon.", "Platz machen"],
      ]);
      return aw("public-transport-etiquette", s[0] + " Was ist angemessen?",
        [s[1], "wegschauen", "laut telefonieren", "sich weiter in die Ecke drücken"],
        "Rücksichtnahme im ÖV.", 1, 0, 2, "avoidance");
    }
    case 7: { // formal writing
      const s = pick(r, [
        ["Du schreibst zum ersten Mal an einen offiziellen Behördenkontakt.", "Sehr geehrte Damen und Herren"],
        ["Du mailst eine Rechnung an einen Kunden.", "Guten Tag / Sehr geehrte Damen und Herren"],
        ["Du schreibst deinem Chef.", "Guten Morgen / Hallo"],
      ]);
      return aw("mail-formal-writing", s[0] + " Wie beginnst du?",
        [s[1], "Hey!", "Na, wie geht's?", "Was geht?"],
        "Formelle Anrede wählen.", 1, 0, 2, "informal-register");
    }
    case 8: { // change counting (computed)
      const price = (ri(r, 5, 48) + 0.5).toFixed(2); const paid = ri(r, 1, 4) * 10;
      const back = (paid - parseFloat(price)).toFixed(2);
      return aw("money-change-counting",
        `Ein Artikel kostet CHF ${price}, du zahlst mit CHF ${paid}.–. Wie viel Rückgeld?`,
        [`CHF ${back}`, `CHF ${(paid - parseFloat(price) + 1).toFixed(2)}`, `CHF ${(parseFloat(price) - paid).toFixed(2)}`],
        `${paid} − ${price} = ${back}.`, 2, 0, 2, "subtraction-slip");
    }
    case 9: { // rescheduling
      const s = pick(r, [
        ["Du kannst deinen Termin nicht wahrnehmen.", "frühzeitig absagen und neuen Termin vereinbaren"],
        ["Du bist krank zur Prüfung angemeldet.", "rechtzeitig abmelden und verschieben"],
      ]);
      return aw("appointment-rescheduling", s[0] + " Was macht man ZUERST?",
        [s[1], "einfach nicht erscheinen", "erst am Tag danach Bescheid geben", "jemand anders schicken"],
        "Verlässlichkeit + frühe Kommunikation.", 1, 1, 2, "no-show");
    }
    case 10: { // waste separation
      const s = pick(r, [
        ["Wohin gehört eine leere PET-Flasche?", "in die PET-Sammelstelle"],
        ["Wohin gehört eine Glasflasche?", "in den Glascontainer"],
        ["Wohin gehört eine alte Zeitung?", "ins Altpapier"],
        ["Wohin gehört ein Altbatterie?", "zur Sammelstelle/Batteriebox"],
      ]);
      return aw("waste-separation", s[0],
        [s[1], "in den Kehricht", "in das Aluglas-Recycling", "in die Biotonne"],
        "Abfalltrennung korrekt zuordnen.", 1, 0, 2, "wrong-stream");
    }
    case 11: { // evacuation
      const s = pick(r, [
        ["Der Feueralarm ertönt.", "markierter Fluchtweg, Lift NICHT benutzen"],
        ["Es gibt Brandgeruch im Stockwerk.", "über Treppe evacuieren"],
      ]);
      return aw("fire-evacuation-route", s[0] + " Welcher Weg ist richtig?",
        [s[1], "schnell mit dem Lift nach unten", "im Büro warten", "zum Fenster hinaus"],
        "Fluchtwegregeln: Treppe statt Lift.", 1, 1, 2, "lift-used");
    }
    case 12: { // first aid
      const s = pick(r, [
        ["Du schneidest dir leicht in den Finger.", "Wunde reinigen und verbinden"],
        ["Du verbrennst dich an heissem Wasser.", "kühlen und abdecken"],
        ["Du stolperst und knickst um.", "kühlen und hochlagern"],
      ]);
      return aw("first-aid-minor-cut", s[0] + " Was machst du zuerst?",
        [s[1], "weiterarbeiten ohne Verbindung", "Hand in heisses Wasser halten", "draufhauen"],
        "Standard-Erste-Hilfe.", 1, 0, 2, "neglect");
    }
    case 13: { // stranger at door
      const s = pick(r, [
        ["Eine unbekannte Person bittet um Einlass ins Lager „nur kurz schauen“.", "höflich ablehnen und Vorgesetzte informieren"],
        ["Jemand gibt sich am Telefon als IT-Support aus und will Passwort.", "ablehnen, echte IT selbst anrufen"],
      ]);
      return aw("stranger-at-door", s[0] + " Richtig:",
        [s[1], "mitnehmen, ist ja nur kurz", "allein durch das Lager laufen lassen", "das Passwort geben"],
        "Zutrittskontrolle beachten.", 1, 1, 2, "compliance-pressure");
    }
    case 14: { // password hygiene
      const s = pick(r, [
        ["Wie gehst du mit deinem Arbeitspasswort um?", "niemandem verraten, auch nicht Kollegen"],
        ["Wie verwahrst du ein generiertes Passwort?", "in einem Passwort-Manager"],
        ["Was tust du nach Verdacht auf Leak?", "Passwort sofort ändern"],
      ]);
      return aw("computer-password-hygiene", s[0],
        [s[1], "auf dem Bildschirm notieren", "mit anderen teilen", "immer dasselbe nehmen"],
        "Grundlegende Passworthygiene.", 1, 1, 2, "sharing-ok");
    }
    default: { // weather-appropriate clothing
      const s = pick(r, [
        ["Bei −5 °C und Schneefall arbeitest du draussen.", "gefütterte, wasserdichte Winterkleidung"],
        ["Bei 32 °C im Sommer arbeitest du draussen.", "helle, luftige Kleidung und Hut"],
        ["Bei Regen und Wind im Freien.", "wasserdichte Jacke und festes Schuhwerk"],
      ]);
      return aw("weather-appropriate-clothing", s[0] + " Was ziehst du an?",
        [s[1], "leichte Sommerhose", "normale Turnschuhe", "ein T-Shirt"],
        "An Wetter angepasste Kleidung.", 1, 0, 2, "underdressed");
    }
  }
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
  schilder_erinnern: [genSchilder, genSchilder, genSchilder, genSchilder, genSchilderCount, genSchilderCategory, genSchilderCompare],
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
  const g = gs[seedIndex(seed, gs.length)];
  const q = g(r, Math.max(12, Math.min(95, difficulty)));
  q.heldOut = true;
  return q;
}

export function heldOutExists(subskillId: string): boolean {
  return !!HELDOUT[subskillId] && HELDOUT[subskillId].length > 0;
}

// Decorrelated generator selection: consecutive seeds (seed+i) must not all land on the
// same generator — the LCG's first draws are correlated. Hash the seed for the index.
function seedIndex(seed: number, len: number): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822507) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) % len;
}
export function generate(subskillId: string, difficulty: number, seed = Date.now()): Question | null {
  const gs = GENERATORS[subskillId];
  if (!gs || !gs.length) return null;
  const r = rng(seed);
  const g = gs[seedIndex(seed, gs.length)];
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
