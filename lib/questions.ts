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
/**
 * TYPED PROCESS-SCENARIO POOL (prozesslogik widening).
 *
 * WHY: prozesslogik shipped with hard-coded scenario lists (3-5 per struct),
 * giving totalRenderCapacity = 66 against ~227 servings over 56 days — each item
 * seen ~3.4x. That is memorisation, not training.
 *
 * ANTI-GAMING RULE (loop §I): a variation counts ONLY if it changes what the
 * student must do. These scenarios vary the DOMAIN, the OBJECTS, the ACTORS and
 * the STEP CONTENT, so the student must re-derive the ordering each time. Font
 * size, spacing and punctuation jitter are NOT used and are forbidden as a
 * capacity fix.
 *
 * LINGUISTIC SAFETY: steps are short imperative/infinitive phrases that are
 * grammatically self-contained, so no case/agreement inflection is required.
 * Nothing here concatenates a noun into a sentence frame that would need
 * declension — that is the satzbau problem and is handled separately with a
 * typed lexicon. Every phrase below is authored, not assembled.
 */

// ---- Content pools (data, not code) ----
// Stored in lib/pools.json so questions.ts does not absorb four subskills worth
// of authored content. JSON is loaded via resolveJsonModule for tsc/bundler and
// resolves under plain node too (validate-all.mjs), which a ".ts" specifier
// cannot do (TS5097).
import POOLS from "./pools.json" with { type: "json" };
import LEX from "./satzbau-lexicon.json" with { type: "json" };

interface ProcessScenario { domain: string; steps: string[]; intruder: string; }
interface ConstraintScenario { domain: string; steps: string[]; rule: string; }

const PROCESS_SCENARIOS: ProcessScenario[] = POOLS.PROCESS_SCENARIOS as ProcessScenario[];
const CONSTRAINT_SCENARIOS: ConstraintScenario[] = POOLS.CONSTRAINT_SCENARIOS as ConstraintScenario[];
const CAUSE_EFFECT: [string, string][] = POOLS.CAUSE_EFFECT as [string, string][];
const PRINCIPLES: [string, string, string][] = POOLS.PRINCIPLES as [string, string, string][];
const DEPENDENCY_PAIRS: [string, string][] = POOLS.DEPENDENCY_PAIRS as [string, string][];
const MANDATORY_STEP: [string[], string, string][] = POOLS.MANDATORY_STEP as [string[], string, string][];
const BRANCHES: [string, string][] = POOLS.BRANCHES as [string, string][];
const SORT_KEYS: [string, string][] = POOLS.SORT_KEYS as [string, string][];
const WAIT_STEPS: [string, string, string][] = POOLS.WAIT_STEPS as [string, string, string][];
const PREV_STEP: [string, string][] = POOLS.PREV_STEP as [string, string][];
const LOOPS: [string, string, string][] = POOLS.LOOPS as [string, string, string][];
const EXCEPTIONS: [string, string, string][] = POOLS.EXCEPTIONS as [string, string, string][];
const HANDOFFS: [string, string, string][] = POOLS.HANDOFFS as [string, string, string][];
const GATES: [string, string][] = POOLS.GATES as [string, string][];
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
const lcm = (a: number, b: number): number => { const g = (x: number, y: number): number => y ? g(y, x % y) : x; return a * b / g(a, b); };
function genMental(r: () => number, d: number, heldOutFlag = false, structIndex = -1): Question {
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
    // --- additional rule-level paths to exceed 50 distinct structs ---
    (): Question => { const a = ri(r, 2, 9), q = ri(r, 3, 9); return inp("mult-table", `${a} × ${q} = ?`, a * q, `${a} mal ${q}.`, 1, 0, 2, "table-error"); },
    (): Question => { const a = pick(r, [11, 12, 15, 20, 25]); const q = ri(r, 2, 8); return inp("mult-multiples-of-5", `${a} × ${q} = ?`, a * q, `Vielfaches nutzen.`, 1, 0, 2, "table-error"); },
    (): Question => { const n = ri(r, 50, 150), m = ri(r, 40, 120); return inp("estimate-sum", `Schätze ungefähr: ${n} + ${m} ≈ ? (nächste Zehner)`, Math.round((n + m) / 10) * 10, `Zuerst runden, dann addieren.`, 1, 1, 3, "added-before-rounding"); },
    (): Question => { const p = pick(r, [10, 20, 50]); const base = ri(r, 30, 200); return inp("pct-of-round", `${p}% von ${base} = ?`, Math.round(base * p / 100), `${p}% = ${p / 100}.`, 1, 1, 2, "pct-as-fraction"); },
    (): Question => { const a = ri(r, 2, 9), b = ri(r, 2, 9), c = ri(r, 1, 9); return inp("add-3digit-small", `${a * 100 + c} + ${b} = ?`, a * 100 + c + b, `Stellenwert beachten.`, 1, 0, 2, "place-value"); },
    (): Question => { const a = ri(r, 1, 9) * 100, b = ri(r, 1, 9) * 10; return inp("sub-multiples-of-10", `${a + b} − ${b} = ?`, a, `Nur Zehner abziehen.`, 1, 0, 2, "borrow-unneeded"); },
    (): Question => { const n = ri(r, 6, 20); return inp("triple-number", `Das Dreifache von ${n} = ?`, n * 3, `${n} × 3.`, 1, 0, 2, "double-not-triple"); },
    (): Question => { const a = ri(r, 3, 12), b = ri(r, 2, 9); return inp("lcm-small", `Kleinstes Gemeinsames von ${a} und ${b}?`, lcm(a, b), `Vielfache vergleichen.`, 2, 1, 3, "product-instead"); },
    (): Question => { const x = ri(r, 10, 90); return inp("tenth-of", `Ein Zehntel von ${x}0 = ?`, x, `${x}0 / 10 = ${x}.`, 1, 0, 2, "tenth-as-percent"); },
    (): Question => { const a = ri(r, 2, 6), b = ri(r, 2, 6); return inp("power-2", `${a}² + ${b} = ?`, a * a + b, `Quadrat zuerst.`, 1, 1, 2, "added-before-square"); },
    (): Question => { const total = ri(r, 8, 30), part = ri(r, 2, total - 1); return inp("remainder-share", `${total} Äpfel, ${part} sind rot. Wie viele grün?`, total - part, `Rest bestimmen.`, 1, 0, 2, "counted-all"); },
    (): Question => { const a = ri(r, 3, 15), b = ri(r, 2, 10); return inp("rate-units", `${a} Stück kosten ${a * b} Franken. 1 Stück kostet?`, b, `Preis durch Menge.`, 1, 1, 2, "total-as-unit"); },
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
  // structIndex >= 0: deterministic struct selection (composer-driven round-robin);
  // the seed still drives all surface parameterization inside the slot.
  return pool[structIndex >= 0 ? structIndex % pool.length : ri(r, 0, pool.length - 1)]();
}
// ===== KOPFRECHNEN: training dispatch wrapper (held-out unreachable here) =====
function genMentalTrain(r: () => number, d: number, structIndex = -1): Question { return genMental(r, d, false, structIndex); }
// ===== DEUTSCH =====
// Word-order sentences for struct 0. Tokens are WORDS ONLY — the sentence-final
// period is NOT a token: shuffling punctuation leaked position information and
// rendered as a stray "." in the scrambled prompt (browser-found student defect),
// and joining it produced "… an ." with a space before the period.
// Variety is syntactic (verb-second with fronted time/place, separable-prefix
// finals, modal finals, dative+accusative order), not noun substitution.
const SENTENCES = [
  ["Der", "Kunde", "bezahlt", "an", "der", "Kasse"],
  ["Wir", "bestellen", "die", "Ware", "online"],
  ["Die", "Lieferung", "kommt", "morgen", "an"],
  ["Er", "schreibt", "eine", "E-Mail", "an", "den", "Chef"],
  ["Heute", "prüft", "die", "Kollegin", "die", "Rechnung"],
  ["Morgen", "liefern", "wir", "das", "Paket", "aus"],
  ["Der", "Chef", "unterschreibt", "den", "Vertrag", "heute"],
  ["Im", "Lager", "stapeln", "wir", "die", "Kartons"],
  ["Die", "Kollegin", "ruft", "den", "Kunden", "an"],
  ["Wir", "müssen", "die", "Liste", "kontrollieren"],
  ["Der", "Mitarbeiter", "gibt", "die", "Ware", "ab"],
  ["Nach", "der", "Pause", "beginnt", "die", "Schulung"],
  ["Sie", "sendet", "dem", "Kunden", "die", "Rechnung"],
  ["Das", "Formular", "liegt", "auf", "dem", "Tisch"],
  ["Am", "Freitag", "schliesst", "das", "Lager", "früher"],
  ["Der", "Bericht", "muss", "heute", "fertig", "werden"],
  ["Wir", "stellen", "die", "Regale", "um"],
  ["Die", "Maschine", "läuft", "seit", "acht", "Uhr"],
  ["Er", "trägt", "die", "Werte", "in", "die", "Liste", "ein"],
  ["Zuerst", "wiegen", "wir", "das", "Material"],
  ["Die", "Kundin", "holt", "das", "Paket", "ab"],
  ["Unser", "Team", "kontrolliert", "jede", "Sendung"],
  ["Der", "Termin", "findet", "am", "Montag", "statt"],
  ["Wir", "räumen", "den", "Arbeitsplatz", "auf"],
];
// ===== SATZBAU: 32 distinct rule-level paths (German sentence rules) + 8 held-out =====
// Each path = a distinct grammar RULE the learner must apply (verb position, case,
// declension, word formation, negation, question formation, connector logic...).
const SB_SUBJ = ["Der Mitarbeiter", "Die Kollegin", "Der Chef", "Unser Team", "Der Kunde"];
const SB_VERB = ["prüft", "bestellt", "verschickt", "kontrolliert", "liest"];
const SB_OBJ_AKK = ["die Rechnung", "die Ware", "das Paket", "den Bericht", "die Liste"];
// --- reusable grammar tables (only what the curriculum needs) ---
// Dative-governing verbs — NON-separable and person-agent compatible only.
// ("zuhören" removed: separable, needs "hört dir zu". "passen"/"gehören" removed:
// require a thing-subject, so "Ich passe ihm" is unnatural. 30-sample read finding.)
const SB_DAT_GOV = [["helfen", "hilft"], ["danken", "dankt"], ["antworten", "antwortet"],
  ["gratulieren", "gratuliert"], ["folgen", "folgt"], ["vertrauen", "vertraut"], ["glauben", "glaubt"]];
const SB_AKK_GOV = [["sehen", "sieht"], ["fragen", "fragt"], ["besuchen", "besucht"], ["rufen", "ruft"],
  ["informieren", "informiert"], ["kennen", "kennt"], ["brauchen", "braucht"]];
// Persons where dative and accusative pronouns DIFFER (wir/ihr excluded: uns/euch identical).
const SB_PRON_CASE = [["ich", "mir", "mich"], ["du", "dir", "dich"], ["er", "ihm", "ihn"],
  ["sie (Singular)", "ihr", "sie"], ["sie (Plural)", "ihnen", "sie"]];
// Possessive stems by owner.
const SB_POSS = [["ich", "mein"], ["du", "dein"], ["er", "sein"], ["sie", "ihr"], ["wir", "unser"]];
// Weak masculine (n-declension) nouns: nominative -> accusative/dative stem form.
const SB_NDECL = [["der Kunde", "Kunden"], ["der Kollege", "Kollegen"], ["der Junge", "Jungen"],
  ["der Name", "Namen"], ["der Herr", "Herrn"], ["der Mensch", "Menschen"],
  ["der Nachbar", "Nachbarn"], ["der Student", "Studenten"], ["der Praktikant", "Praktikanten"]];
// Fully regular -en verbs (safe for reflexive + imperative composition).
const SB_REG = ["prüfen", "holen", "packen", "zeigen", "fragen", "kaufen", "melden", "warten", "machen", "liefern"];
const SB_REFLV = [["freuen", "sich freuen über"], ["melden", "sich melden"], ["beeilen", "sich beeilen"],
  ["interessieren", "sich interessieren für"], ["erinnern", "sich erinnern an"], ["ärgern", "sich ärgern über"]];
const SB_REFL_BY_PERSON = [["ich", "mich"], ["du", "dich"], ["er", "sich"], ["wir", "uns"], ["ihr", "euch"], ["sie", "sich"]];
// Adjectives with comparative/superlative forms. `dim` marks the semantic dimension
// so objects only take adjectives that can sensibly describe them: "die warme Schere"
// and "die Schere ist wärmer als der Bericht" were 30-sample findings.
// "size"/"quality" apply to any workplace object; "temp"/"age" are restricted.
const SB_ADJ: { base: string; comp: string; sup: string; umlaut: boolean; dim: "size" | "quality" | "temp" | "age" }[] = [
  { base: "gross", comp: "grösser", sup: "grösste", umlaut: true, dim: "size" },
  { base: "klein", comp: "kleiner", sup: "kleinste", umlaut: true, dim: "size" },
  { base: "lang", comp: "länger", sup: "längste", umlaut: true, dim: "size" },
  { base: "kurz", comp: "kürzer", sup: "kürzeste", umlaut: true, dim: "size" },
  { base: "schwer", comp: "schwerer", sup: "schwerste", umlaut: false, dim: "size" },
  { base: "leicht", comp: "leichter", sup: "leichteste", umlaut: false, dim: "size" },
  { base: "hoch", comp: "höher", sup: "höchste", umlaut: true, dim: "size" },
  { base: "neu", comp: "neuer", sup: "neueste", umlaut: false, dim: "quality" },
  { base: "günstig", comp: "günstiger", sup: "günstigste", umlaut: false, dim: "quality" },
  { base: "wichtig", comp: "wichtiger", sup: "wichtigste", umlaut: false, dim: "quality" },
  { base: "genau", comp: "genauer", sup: "genaueste", umlaut: false, dim: "quality" },
  { base: "gut", comp: "besser", sup: "beste", umlaut: false, dim: "quality" },
  { base: "alt", comp: "älter", sup: "älteste", umlaut: true, dim: "age" },
  { base: "warm", comp: "wärmer", sup: "wärmste", umlaut: true, dim: "temp" },
];
// --- SEMANTIC COMPATIBILITY LAYER (Phase 2) ---
// Grammar alone licensed nonsense like "die Ware schreiben". Objects carry a
// semantic class; each verb declares which classes it accepts. Composition draws
// ONLY from licensed pairs, so capacity counts natural sentences, not combinations.
type SbObjClass = "document" | "message" | "goods" | "payment" | "tool" | "furniture" | "appointment" | "task";
const SB_OBJECTS: { lemma: string; cls: SbObjClass }[] = [
  { lemma: "Bericht", cls: "document" }, { lemma: "Liste", cls: "document" },
  { lemma: "Formular", cls: "document" }, { lemma: "Buch", cls: "document" },
  { lemma: "Blatt", cls: "document" },
  { lemma: "Ware", cls: "goods" }, { lemma: "Paket", cls: "goods" },
  { lemma: "Material", cls: "goods" },
  { lemma: "Rechnung", cls: "payment" },
  { lemma: "Schere", cls: "tool" }, { lemma: "Bleistift", cls: "tool" },
  { lemma: "Kugelschreiber", cls: "tool" },
  { lemma: "Regal", cls: "furniture" }, { lemma: "Tisch", cls: "furniture" }, { lemma: "Stuhl", cls: "furniture" },
];
// verb -> licensed object classes. Keys are the lexicon's exact infinitives
// (umlauts included), verified against SB_VERBS at build time by the semantic test.
const SB_VERB_LICENSE: Record<string, SbObjClass[]> = {
  schreiben: ["document"],
  lesen: ["document"],
  "prüfen": ["document", "payment", "goods"],
  kontrollieren: ["document", "payment", "goods"],
  bezahlen: ["payment"],
  bestellen: ["goods", "tool", "furniture"],
  verschicken: ["goods", "document"],
  liefern: ["goods"],
  packen: ["goods"],
  holen: ["goods", "tool", "document"],
  bringen: ["goods", "tool", "document"],
  kaufen: ["goods", "tool", "furniture"],
  sehen: ["goods", "tool", "furniture", "document"],
};
function genSatzbau(r: () => number, d: number, structIndex = -1): Question {
  const ph = (arr: string[]) => pick(r, arr);
  const cw = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const NOUNS = LEX.SB_NOUNS as any[];
  const VERBS = LEX.SB_VERBS as any[];
  const AKKV = VERBS.filter((v: any) => v.aux === "haben" && v.valency === "ack" && !v.separable);
  const SEPV = VERBS.filter((v: any) => v.separable);
  const AGENTS = NOUNS.filter((n: any) => ["Mitarbeiter", "Kollegin", "Chef", "Kunde"].includes(n.lemma));
  // Concrete workplace objects only. The full NOUNS list contains abstract/spatial
  // entries (Anfang, Ende, Mitte, Konto, Schweiz) that produce semantic nonsense in
  // object slots ("den Anfang bezahlen", "das Konto schreiben") — 30-sample finding.
  const OBJS = NOUNS.filter((n: any) => ["Rechnung", "Ware", "Paket", "Bericht", "Liste", "Material",
    "Formular", "Mail", "Sendung", "Buch", "Blatt", "Schere", "Bleistift", "Kugelschreiber",
    "Regal", "Tisch", "Stuhl"].includes(n.lemma));
  // Static (wo?) vs directional (wohin?) place adverbials must not be mixed.
  const PLACE_STATIC = ["im Büro", "im Lager", "in der Werkstatt", "in der Halle", "am Arbeitsplatz"];
  // Licensed verb+object draw (Phase 2/3): pick a transitive verb, then an object
  // whose semantic class that verb accepts. Prevents "die Ware schreiben".
  const licensedPair = () => {
    const cands = AKKV.filter((v: any) => SB_VERB_LICENSE[v.inf]);
    const v = pick(r, cands.length ? cands : AKKV);
    const allow = SB_VERB_LICENSE[v.inf] || ["document", "goods"];
    const objs = SB_OBJECTS.filter((o) => allow.includes(o.cls));
    const oSpec = pick(r, objs.length ? objs : SB_OBJECTS);
    const n = NOUNS.find((x: any) => x.lemma === oSpec.lemma);
    return { v, n: n || NOUNS[0], cls: oSpec.cls };
  };
  const sb = (opSeq: string, prompt: string, ans: string, expl: string, steps: number, cons: number, wml: number, dk: string) =>
    mk("deutsch", "satzbau", opSeq, d, prompt, undefined, ans, expl, "Achte auf die Satzbaumuster.", 20, 4, dk, "sort", opSeq,
      { opSequence: opSeq, stepCount: steps, constraintCount: cons, distractorKind: dk, workingMemoryLoad: wml, inputModality: "sequence", answerCardinality: 1 }, false);
  const path = structIndex >= 0 ? structIndex : ri(r, 0, 51);
  // satzbau lexicon composition (cases 1-10): answer computed from the same lexicon row as the prompt
  if (path >= 1 && path <= 10) {
    const n = pick(r, LEX.SB_NOUNS as any[]);
    // Cases 1-10 share this header. The verb+object pair MUST be semantically
    // licensed, otherwise this block emitted "Es hat die Ware gekommen" (kommen is
    // intransitive + sein-auxiliary) and "Es bezahlt den Bericht" — 30-sample finding.
    // Case 9 needs a motion verb (sein-auxiliary) and overrides `verb` locally.
    const lp10 = licensedPair();
    const verb = lp10.v;
    const obj = lp10.n;
    // Personal agent subjects only: "Es prüft die Liste" is unnatural for a
    // workplace action, so the subject is a person pronoun, not neuter "es".
    const subj = pick(r, ["ich", "du", "er", "sie", "wir"]);
    const pres = verb.pres[subj];
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    switch (path) {
      case 1: { const konj = pick(r, LEX.SB_CONNECTORS_REASON as any[]); const reason = pick(r, ["die Frist kurz ist", "das Lager voll ist", "der Kunde wartet", "die Zahlung fehlt", "die Bestellung verspätet sich"]); return sb("subordinate-verb-final", `Bilde: „${cap(subj)} ${pres} ${obj.ack}“ + „${konj} ${reason}“`, `${cap(subj)} ${pres} ${obj.ack}, ${konj} ${reason}.`, "Im Nebensatz steht das Verb am Ende.", 3, 1, 3, "verb-in-wrong-position"); }
      case 2: return sb("question-inversion", `Verwandle in eine Ja/Nein-Frage: „${cap(subj)} ${pres} ${obj.ack}“`, `${cap(pres)} ${subj} ${obj.ack}?`, "Bei Ja/Nein-Fragen steht das Verb an Position 1, das Subjekt danach.", 2, 0, 2, "no-inversion");
      case 3: { const qw = pick(r, ["Was", "Wo", "Wann", "Wie lange"]); return sb("wquestion-fronting", `Bilde die W-Frage: „${cap(subj)} ${pres} ${obj.ack}“ → Fragewort: „${qw}“`, `${qw} ${pres} ${subj} ${obj.ack}?`, "Fragewort + Verb + Subjekt (W-Frage).", 2, 0, 2, "statement-instead-of-question"); }
      case 4: return sb("negation-nicht-placement", `Setze „nicht“ richtig ein: „${cap(subj)} ${pres} ${obj.ack}“ (Perfekt)`, `${cap(subj)} hat ${obj.ack} nicht ${verb.participle}.`, "„nicht“ steht vor dem Partizip II.", 2, 0, 2, "negation-wrong-slot");
      case 5: { const k = n.gender === "der" ? "m" : n.gender === "die" ? "f" : "n"; const art = k === "m" ? LEX.SB_DEF_ARTICLE_FORMS.m_nom : k === "f" ? LEX.SB_DEF_ARTICLE_FORMS.f_nom : LEX.SB_DEF_ARTICLE_FORMS.n_nom; return sb("article-gender-nominativ", `Setze den bestimmten Artikel (Nominativ): „___ ${n.lemma}“`, `${art} ${n.lemma}`, `Genus ${n.gender === "der" ? "maskulin" : n.gender === "die" ? "feminin" : "sächlich"}: ${art}.`, 1, 0, 2, "wrong-gender-article"); }
      case 6: return sb("akkusative-masculine", `Akkusativ: „Ich sehe ___“ (${n.nom} im Nominativ)`, `Ich sehe ${n.ack}.`, n.gender === "der" ? "Maskulin Akk.: der → den." : "Akkusativform verwenden.", 1, 1, 2, "nominative-in-accusative");
      case 7: return sb("dative-after-mit", `Mit wem? Setze richtig: „Ich spreche mit ___“ (${n.nom} im Nominativ)`, `Ich spreche mit ${n.dat}.`, "Nach „mit“ steht Dativ.", 1, 1, 2, "accusative-after-preposition");
      case 8: return sb("perfect-haben", `Perfekt: „${cap(subj)} ${pres} ${obj.ack}“`, `${cap(subj)} hat ${obj.ack} ${verb.participle}.`, "haben + Partizip II am Satzende.", 2, 0, 3, "wrong-participle");
      case 9: { // motion verb + sein-auxiliary; overrides the shared transitive verb
        const mv = pick(r, VERBS.filter((x: any) => x.aux === "sein" && !x.separable));
        const place = pick(r, LEX.SB_PLACE_ADVERBIALS as any[]);
        const mpres = mv.pres[subj];
        // "sie" in this subject set is SINGULAR (matching mv.pres["sie"]), so the
        // sein-form must be "ist", not "sind" — agreement mismatch found in sampling.
        const istForm = subj === "ich" ? "bin" : subj === "du" ? "bist" : subj === "wir" ? "sind" : "ist";
        return sb("perfect-sein", `Perfekt: „${cap(subj)} ${mpres} ${place}“`, `${cap(subj)} ${istForm} ${place} ${mv.participle}.`, "Bewegungsverben bilden das Perfekt mit „sein“ + Partizip II am Satzende.", 2, 1, 3, "haben-with-motion-verb"); }
      case 10: { const modal = pick(r, LEX.SB_MODAL_VERBS as any[]); const mp = modal.pres[subj === "es" ? "er" : subj]; return sb("modal-infinitive-end", `Welches Muster gilt: „${cap(subj)} ${mp} ${verb.inf}“?`, `${cap(subj)} ${mp} ${verb.inf} (Infinitiv am Ende).`, "Modalverb Stellung 2; Infinitiv ganz am Satzende.", 2, 1, 3, "double-conjugated"); }
    }
  }
  switch (path) {
    case 0: { // verb-second statement order
      const parts = pick(r, SENTENCES);
      // punctuation is appended, never shuffled (see SENTENCES comment)
      const correct = parts.join(" ") + ".";
      return sb("reorder-verbsecond", "Bilde einen korrekten Satz: " + shuffle(parts, r).join(" "), correct,
        "Richtig: " + correct + " — Verb auf Position 2.", 1, 0, 2, "wrong-word-order");
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
    case 11: { // reconstruct the INFINITIVE from a split separable verb in a sentence
      const v = pick(r, SEPV);
      const pfx = ["an", "ab", "auf", "ein", "um", "vor", "mit", "nach"].find((x) => v.inf.startsWith(x)) || "an";
      const p = pick(r, ["ich", "du", "er", "wir"]);
      const lp = licensedPair();
      return sb("separable-prefix-end", `Welcher Infinitiv steckt dahinter? „${cw(p)} ${v.pres[p]} ${lp.n.ack} ${pfx}.“`,
        v.inf, `Präfix „${pfx}“ + Verbstamm gehören zusammen: ${v.inf}.`, 2, 2, 2, "wrong-prefix");
    }
    case 12: { // plural formation: NOMINATIVE plural from the noun's own table
      const n = pick(r, NOUNS);
      return sb("plural-formation", `Plural bilden: „${n.nom}“ → ?`, n.nomPl,
        `Pluralform von ${n.lemma}: ${n.plural} (Nominativ Plural: ${n.nomPl}).`, 2, 1, 2, "wrong-plural");
    }
    case 13: { // comparative used in a COMPARISON clause with "als"
      const a = pick(r, SB_ADJ.filter((x) => x.dim === "size" || x.dim === "quality"));
      const n1 = pick(r, OBJS);
      const n2 = pick(r, OBJS.filter((x: any) => x.lemma !== n1.lemma));
      return sb("comparative-form", `Vergleich mit „als“: „${cw(n1.nom)} ist ${a.base}__ als ${n2.nom}.“ — Komparativ von „${a.base}“`,
        a.comp, `Komparativ + „als“ beim Vergleich: ${a.base} → ${a.comp}.`, 2, 1, 3, "mehr-plus-adjective");
    }
    case 14: { // superlative in PREDICATIVE position: "am ...sten"
      const a = pick(r, SB_ADJ.filter((x) => x.dim === "size" || x.dim === "quality"));
      const n = pick(r, OBJS);
      // Predicative superlative: "am" + superlative stem + "-en".
      const pred = "am " + a.sup.replace(/e$/, "en");
      return sb("superlative-am", `Prädikativer Superlativ: „${cw(n.nom)} ist ___.“ (von „${a.base}“)`, pred,
        `Prädikativ: am + Superlativstamm + -en → ${pred}.`, 2, 1, 3, "wrong-superlative");
    }
    case 15: { // imperative
      const b = pick(r, [
        ["du | kommen", "Komm!"], ["Sie | nehmen", "Nehmen Sie!"], ["ihr | warten", "Wartet!"], ["du | machen", "Mach!"],
      ]);
      return sb("imperative-form", `Imperativ (${b[0]}): „${pick(r, ["hier bleiben", "das Formular ausfüllen", "auf mich warten", "langsam fahren"])}“ — richtige Form für die Anweisung mit derselben Regel wählen`, b[1],
        "Imperativbildung nach Adressat.", 1, 1, 2, "infinitive-as-imperative");
    }
    case 16: { // possessive article: owner person x noun gender x case
      const own = pick(r, SB_POSS);
      const n = pick(r, NOUNS);
      const isAkk = r() < 0.5;
      // Akkusativ masculine takes -en; feminine/neuter unchanged from nominative.
      const suffix = isAkk && n.gender === "der" ? "en" : n.gender === "die" ? "e" : "";
      const form = own[1] + suffix;
      const frame = isAkk ? `Ich sehe ___ ${n.lemma}` : `___ ${n.lemma} ist neu`;
      return sb("possessive-declension", `Possessivartikel (${isAkk ? "Akkusativ" : "Nominativ"}): „${frame}“ — Besitzer: ${own[0]}`,
        `${form} ${n.lemma}`,
        `${own[0]} → Stamm „${own[1]}“; ${n.gender} ${n.lemma} im ${isAkk ? "Akkusativ" : "Nominativ"} → ${form}.`, 2, 2, 3, "missing-ending");
    }
    case 17: { // two-way preposition: wo? -> Dativ vs wohin? -> Akkusativ
      const n = pick(r, NOUNS.filter((x: any) => ["Lager", "Büro", "Küche", "Regal", "Werkstatt", "Halle"].includes(x.lemma)));
      const prep = pick(r, ["in", "auf", "an", "unter", "neben", "hinter", "vor", "zwischen"]);
      const isWo = r() < 0.5;
      const dat = n.dat;
      const akk = n.gender === "die" ? `die ${n.lemma}` : n.gender === "der" ? `den ${n.lemma}` : `das ${n.lemma}`;
      const contracted = prep === "in" && isWo && n.gender !== "die" ? `im ${n.lemma}` : `${prep} ${isWo ? dat : akk}`;
      return sb("in-dative-vs-accusative", `Wechselpräposition „${prep}“ + ${n.nom} — Frage: ${isWo ? "wo? (Ort)" : "wohin? (Richtung)"}`,
        contracted,
        `${isWo ? "wo? → Dativ" : "wohin? → Akkusativ"}: ${contracted}.`, 2, 2, 3, "case-confusion");
    }
    case 18: { // word order: TeKaMoLo (time before place)
      const t = pick(r, LEX.SB_TIME_ADVERBIALS as string[]);
      const p = pick(r, LEX.SB_PLACE_ADVERBIALS as string[]);
      const v = pick(r, VERBS.filter((x: any) => x.valency === "dat"));
      const s = pick(r, ["Ich", "Wir", "Er", "Sie"]);
      const key = s === "Ich" ? "ich" : s === "Wir" ? "wir" : "er";
      const form = v.pres[key];
      return sb("wordorder-tekamolo", `Ordne die Angaben: „${s} ${form} (${p})(${t})“ — richtige Reihenfolge?`,
        `${s} ${form} ${t} ${p}.`, "Temporale Angabe steht vor lokaler (Te-Ka-Mo-Lo).", 2, 1, 3, "place-before-time");
    }
    case 19: { // connector by logical relation — exactly ONE defensible answer
      // Ambiguity control (30-sample read finding): the consequence set
      // {deshalb, darum, folglich} is mutually substitutable, so offering the
      // relation alone admits 3 correct answers. Each relation therefore pins ONE
      // canonical connector and the prompt names it as the required form.
      // "weil/da" excluded: they force verb-final order (effect clause is verb-second).
      const rel = pick(r, [
        ["Folge", "deshalb", "Folge (Konsequenz)"],
        ["Gegensatz", "trotzdem", "Gegensatz (unerwartete Folge)"],
        ["Grund", "denn", "Grund (Hauptsatz-Konnektor)"],
      ]);
      // Semantically matched cause pairs (no "das Konto ist beschädigt").
      const cause = pick(r, [
        ["Die Lieferung", "ist verspätet"], ["Das Material", "fehlt"],
        ["Die Rechnung", "ist nicht bezahlt"], ["Das Paket", "ist beschädigt"],
        ["Der Termin", "ist abgesagt"], ["Die Maschine", "steht still"],
        ["Die Liste", "ist unvollständig"], ["Der Bericht", "fehlt noch"],
      ]);
      const effect = pick(r, ["rufen wir den Kunden an", "bestellen wir neu", "informieren wir den Chef",
        "prüfen wir die Liste", "melden wir es dem Lager", "verschieben wir den Termin"]);
      // Only the ARTICLE lowercases mid-sentence; the German noun keeps its capital.
      const lowerArt = (s: string) => s.replace(/^(Die|Der|Das) /, (m) => m.toLowerCase());
      const tail = rel[0] === "Grund" ? `${lowerArt(cause[0])} ${cause[1]}` : effect;
      const head = rel[0] === "Grund" ? "Wir handeln sofort" : `${cause[0]} ${cause[1]}`;
      return sb("connector-meaning", `Verbinde logisch — ${rel[2]}: „${head}, ___ ${tail}.“`, rel[1],
        `${rel[2]} → „${rel[1]}“; das Verb bleibt an Position 2.`, 2, 2, 3, "weil-for-consequence");
    }
    case 20: { // zu + Infinitiv after specific governing verbs
      const gov = pick(r, [["versuchen", "versucht"], ["vergessen", "vergisst"], ["beginnen", "beginnt"],
        ["planen", "plant"], ["vorhaben", "hat vor"], ["hoffen", "hofft"], ["beschliessen", "beschliesst"]]);
      const lp = licensedPair(); const v = lp.v; const o = lp.n;
      const subj = pick(r, ["Er", "Sie", "Der Chef", "Die Kollegin"]);
      return sb("zu-infinitive", `Infinitivsatz: „${subj} ${gov[1]}, ${o.ack} ___“ (Verb: ${v.inf})`,
        `zu ${v.inf}`, `Nach „${gov[0]}“ folgt Infinitiv mit „zu“ am Satzende: zu ${v.inf}.`, 2, 1, 3, "bare-infinitive");
    }
    case 21: { // relative pronoun agrees with antecedent gender
      const n = pick(r, NOUNS);
      const lp = licensedPair(); const v = lp.v; const o = lp.n;
      const rel = n.gender === "der" ? "der" : n.gender === "die" ? "die" : "das";
      return sb("relative-pronoun", `Relativpronomen: „${n.nom}, ___ ${o.ack} ${v.pres["er"]} …“`, rel,
        `Relativpronomen folgt dem Genus von „${n.lemma}“ (${n.gender}) im Nominativ: ${rel}.`, 2, 1, 3, "wrong-relative");
    }
    case 22: { // passive: werden + Partizip II
      const ag = pick(r, AGENTS);
      const lp = licensedPair(); const v = lp.v; const o = lp.n;
      // Sentence-initial capitalisation (the noun forms carry lowercase articles).
      const up = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
      const active = `${up(ag.nom)} ${v.pres["er"]} ${o.ack}.`;
      return sb("passive-werden", `Passiv: „${active}“`, `${up(o.nom)} wird ${v.participle}.`,
        "Objekt wird Subjekt; werden + Partizip II.", 2, 1, 3, "wrong-auxiliary");
    }
    case 23: { // Konjunktiv II: polite request from a blunt imperative
      const v = pick(r, SB_REG);
      const o = pick(r, OBJS);
      const modal = pick(r, [["könnten", "Könnten Sie"], ["würden", "Würden Sie"]]);
      const blunt = `${v.replace(/n$/, "")} Sie ${o.ack}!`;
      return sb("konjunktiv-request", `Höfliche Bitte (Konjunktiv II): „${blunt}“ — mit „${modal[0]}“`,
        `${modal[1]} ${o.ack} ${v}?`, "könnten/würden + Infinitiv am Satzende; Fragezeichen.", 2, 1, 3, "blunt-imperative");
    }
    case 24: { // reflexive pronoun agrees with the SUBJECT person
      const p = pick(r, SB_REFL_BY_PERSON);
      const v = pick(r, SB_REFLV);
      const subj = p[0] === "er" ? "Er" : p[0] === "sie" ? "Sie" : cw(p[0]);
      // Regular present-tense conjugation. Stem rule: verbs in -ern/-eln drop only
      // the final -n ("erinnern" -> "erinner"), all others drop -en ("melden" -> "meld").
      // The -e- linking vowel is required after -d/-t stems ("meldest", not "meldst").
      const stem = /[e][rl]n$/.test(v[0]) ? v[0].replace(/n$/, "") : v[0].replace(/en$/, "");
      const link = /[dt]$/.test(stem) ? "e" : "";
      const conj = p[0] === "ich" ? stem + "e"
        : p[0] === "du" ? stem + link + "st"
        : p[0] === "er" ? stem + link + "t"
        : p[0] === "ihr" ? stem + link + "t"
        : v[0];
      return sb("reflexive-pronoun", `Reflexivpronomen einsetzen: „${subj} ${conj} ___“ (${v[1]})`, p[1],
        `Reflexivpronomen richtet sich nach dem Subjekt: ${p[0]} → ${p[1]}.`, 2, 1, 2, "wrong-reflexive");
    }
    case 25: { // adjective ending after DEFINITE article (weak declension)
      const a = pick(r, SB_ADJ.filter((x) => x.dim === "size" || x.dim === "quality"));
      const n = pick(r, OBJS);
      const isAkk = r() < 0.5;
      // Weak declension: -e in nom sg for all genders; -en for masculine accusative.
      const end = isAkk && n.gender === "der" ? "en" : "e";
      const art = isAkk && n.gender === "der" ? "den" : n.gender;
      return sb("adj-ending-def-article", `Adjektivendung nach bestimmtem Artikel (${isAkk ? "Akkusativ" : "Nominativ"}): „${art} ${a.base}__ ${n.lemma}“`,
        `${art} ${a.base}${end} ${n.lemma}`,
        `Nach bestimmtem Artikel gilt die schwache Deklination → -${end}.`, 2, 2, 3, "missing-or-wrong-ending");
    }
    case 26: { // adjective ending after INDEFINITE article (mixed declension)
      const a = pick(r, SB_ADJ.filter((x) => x.dim === "size" || x.dim === "quality"));
      const n = pick(r, OBJS);
      // Mixed declension: the ending must carry the gender the article cannot show.
      const end = n.gender === "der" ? "er" : n.gender === "die" ? "e" : "es";
      const art = n.gender === "die" ? "eine" : "ein";
      return sb("adj-ending-indef-article", `Adjektivendung nach unbestimmtem Artikel (Nominativ): „${art} ${a.base}__ ${n.lemma}“`,
        `${art} ${a.base}${end} ${n.lemma}`,
        `„${art}“ zeigt das Genus nicht — die Adjektivendung übernimmt es: ${n.gender} → -${end}.`, 2, 2, 3, "wrong-ending");
    }
    case 27: { // Präteritum of sein/haben
      const o = pick(r, OBJS);
      const pl = pick(r, LEX.SB_PLACE_ADVERBIALS as string[]);
      const t = pick(r, LEX.SB_TIME_ADVERBIALS as string[]);
      const useSein = r() < 0.5;
      const subj = pick(r, ["Ich", "Wir", "Er", "Sie"]);
      const sein = subj === "Ich" ? "war" : subj === "Wir" || subj === "Sie" ? "waren" : "war";
      const haben = subj === "Ich" ? "hatte" : subj === "Wir" || subj === "Sie" ? "hatten" : "hatte";
      const prompt = useSein ? `Präteritum: „${subj} ___ ${t} ${pl}“ (sein)` : `Präteritum: „${subj} ___ ${o.ack} (haben)“`;
      return sb("praeteritum-sein-haben", prompt, useSein ? sein : haben,
        "sein → war/waren; haben → hatte/hatten.", 1, 0, 2, "perfect-used-in-writing");
    }
    case 28: { // Futur I: werden + Infinitiv at end
      const t = pick(r, LEX.SB_TIME_ADVERBIALS as string[]);
      const lp = licensedPair(); const v = lp.v; const o = lp.n;
      const subj = pick(r, ["Ich", "Wir", "Er", "Sie"]);
      const key = subj === "Ich" ? "ich" : subj === "Wir" || subj === "Sie" ? "wir" : "er";
      const werden = key === "ich" ? "werde" : key === "wir" ? "werden" : "wird";
      const present = `${t.charAt(0).toUpperCase() + t.slice(1)} ${v.pres[key]} ${subj.toLowerCase()} ${o.ack}.`;
      return sb("futur-i", `Futur I: „${present}“`, `${subj} ${werden} ${t} ${o.ack} ${v.inf}.`,
        "werden (Position 2) + Infinitiv am Satzende.", 2, 0, 3, "present-only");
    }
    case 29: { // n-Deklination: weak masculines take -n in ALL cases but nominative
      const n = pick(r, SB_NDECL);
      const isDat = r() < 0.5;
      const art = isDat ? "dem" : "den";
      const v = isDat ? pick(r, SB_DAT_GOV) : pick(r, SB_AKK_GOV);
      const subj = pick(r, ["Ich", "Er", "Wir", "Die Kollegin"]);
      const form = subj === "Ich" ? v[0].replace(/en$/, "e") : subj === "Wir" ? v[0] : v[1];
      return sb("n-declension", `n-Deklination: „${subj} ${form} ___“ (${n[0]}, ${isDat ? "Dativ" : "Akkusativ"})`,
        `${art} ${n[1]}`, `Schwache Nomen: ${n[0]} → ${art} ${n[1]} (-n auch im Singular).`, 2, 1, 3, "regular-declension");
    }
    case 30: { // verb 'lassen' + Objekt + Infinitiv
      const lp = licensedPair(); const v = lp.v; const o = lp.n;
      const subj = pick(r, ["Ich", "Wir", "Er", "Sie"]);
      const lassen = subj === "Ich" ? "lasse" : subj === "Wir" || subj === "Sie" ? "lassen" : "lässt";
      return sb("lassen-construction", `lassen-Konstruktion: „${subj} ${lassen} ${o.ack} ___ (${v.inf}).“`, v.inf,
        "lassen + Objekt + Infinitiv am Satzende.", 2, 1, 3, "participle-with-lassen");
    }
    default: { // 31: um...zu (same subject) vs damit (different subject)
      const lp = licensedPair(); const v = lp.v; const o = lp.n;
      const same = r() < 0.5;
      const main = pick(r, [["Ich komme früh", "ich"], ["Wir bleiben länger", "wir"],
        ["Der Chef ruft an", "er"], ["Die Kollegin prüft alles", "sie"]]);
      const other = pick(r, ["der Kunde", "das Lager", "die Kollegin", "der Chef"]);
      const purpose = same
        ? `um ${o.ack} zu ${v.inf}`
        : `damit ${other} ${o.ack} ${v.pres["er"]}`;
      const ask = same ? "gleiches Subjekt" : "verschiedenes Subjekt";
      return sb("um-zu-vs-damit", `Zwecksatz (${ask}): „${main[0]}, ___“ — Ziel: ${o.ack} ${v.inf}${same ? "" : " (" + other + ")"}`,
        purpose, `${ask}: ${same ? "um…zu + Infinitiv" : "damit + Nebensatz mit Verb am Ende"}.`, 3, 2, 3, "damit-for-same-subject");
    }
    // --- additional rule-level grammar paths (32..49) to exceed 50 distinct structs ---
    case 32: { // article + noun in GENITIVE case (der/die/das → des/der/des)
      const n = pick(r, LEX.SB_NOUNS as any[]);
      const art = n.gender === "der" ? "des" : n.gender === "die" ? "der" : "des";
      return sb("article-gender-genitiv", `Setze den Artikel (Genitiv): „___ ${n.lemma}“`, `${art} ${n.lemma}`,
        "Genitiv: maskulin/sächlich → des; feminin → der.", 1, 0, 2, "wrong-gender-article-genitiv");
    }
    case 33: { // DATIVE plural: every plural noun adds -n after a preposition
      const n = pick(r, NOUNS);
      const prep = pick(r, ["mit", "bei", "von", "nach", "zu", "aus"]);
      return sb("plural-form", `Dativ Plural nach „${prep}“: „${prep} ___“ (${n.nomPl})`, `${prep} ${n.datPl}`,
        `Im Dativ Plural endet das Nomen auf -n: ${n.nomPl} → ${n.datPl}.`, 2, 2, 3, "singular-returned");
    }
    case 34: { // comparative in ATTRIBUTIVE position (declined before a noun)
      const a = pick(r, SB_ADJ.filter((x) => x.dim === "size" || x.dim === "quality"));
      const n = pick(r, OBJS);
      // Attributive comparative after the definite article: weak -e ending.
      const form = a.comp + "e";
      return sb("comparative", `Attributiver Komparativ: „${n.gender} ___ ${n.lemma}“ (von „${a.base}“)`,
        `${n.gender} ${form} ${n.lemma}`,
        `Komparativ + Adjektivendung nach bestimmtem Artikel: ${a.base} → ${a.comp} → ${form}.`, 2, 2, 3, "no-comparison");
    }
    case 35: { // superlative in ATTRIBUTIVE position (declined before a noun)
      const a = pick(r, SB_ADJ.filter((x) => x.dim === "size" || x.dim === "quality"));
      const n = pick(r, OBJS);
      return sb("superlative", `Attributiver Superlativ: „${n.gender} ___ ${n.lemma}“ (von „${a.base}“)`,
        `${n.gender} ${a.sup} ${n.lemma}`,
        `Superlativ steht attributiv mit Artikel: ${a.base} → ${a.sup}.`, 2, 2, 3, "comparative-returned");
    }
    case 36: { // question word chosen by the semantic role being asked about
      const lp = licensedPair();
      const role = pick(r, [
        ["die handelnde Person", "Wer"], ["das Objekt der Handlung", "Was"],
        ["den Ort", "Wo"], ["die Zeit", "Wann"], ["den Grund", "Warum"],
        ["die Art und Weise", "Wie"], ["das Ziel der Bewegung", "Wohin"],
        ["die Herkunft", "Woher"], ["den Besitzer", "Wessen"],
      ]);
      return sb("question-word", `Erfrage ${role[0]} im Satz „Die Kollegin ${lp.v.pres["er"]} ${lp.n.ack} im Büro.“ — Fragewort?`,
        role[1], `Für ${role[0]} fragt man mit „${role[1]}“.`, 2, 2, 2, "wrong-question-word");
    }
    case 37: { // negation: kein (nouns) vs nicht (verbs/adverbs)
      const n = pick(r, NOUNS);
      const v = pick(r, AKKV);
      const t = pick(r, LEX.SB_TIME_ADVERBIALS as string[]);
      const subj = pick(r, ["Ich", "Er", "Wir", "Sie"]);
      const useKein = r() < 0.5;
      // kein agrees like the indefinite article: masc-akk "keinen", fem "keine", neut "kein".
      const kein = n.gender === "der" ? "keinen" : n.gender === "die" ? "keine" : "kein";
      const form = subj === "Ich" ? v.pres["ich"] : subj === "Wir" || subj === "Sie" ? v.pres["wir"] : v.pres["er"];
      const prompt = useKein
        ? `Ergänze die Negation: „${subj} ${form} ___ ${n.lemma}.“ (Nomen negieren)`
        : `Ergänze die Negation: „${subj} ${form} ${n.ack} ___ ${t}.“ (Angabe negieren)`;
      return sb("negation-kein-nicht", prompt, useKein ? kein : "nicht",
        useKein ? `Nomen ohne bestimmten Artikel → kein-: ${n.gender} → ${kein}.` : "Verb/Angabe negieren → nicht.",
        2, 1, 3, "nicht-for-kein");
    }
    case 38: { // possessive article in the DATIVE (distinct from case 16's nom/akk)
      const own = pick(r, SB_POSS);
      const n = pick(r, OBJS);
      // Dative: masculine/neuter -em, feminine -er.
      const end = n.gender === "die" ? "er" : "em";
      const prep = pick(r, ["mit", "bei", "von", "nach", "zu"]);
      return sb("possessive", `Possessivartikel im Dativ nach „${prep}“: „${prep} ___ ${n.lemma}“ (Besitzer: ${own[0]})`,
        `${prep} ${own[1]}${end} ${n.lemma}`,
        `Dativ: ${n.gender} ${n.lemma} → ${own[1]}${end}.`, 2, 2, 3, "wrong-possessive");
    }
    case 39: { // separable verb: prefix detaches to the sentence end
      const v = pick(r, SEPV);
      const o = pick(r, OBJS);
      const p = pick(r, [["ich", "ich"], ["du", "du"], ["er", "er"], ["wir", "wir"]]);
      const form = v.pres[p[0]];
      // Prefix comes from the known separable-prefix set; SEPV only holds verbs
      // whose infinitive starts with one of these, so the lookup always resolves.
      const pfx = ["an", "ab", "auf", "ein", "um", "vor", "mit", "nach"].find((x) => v.inf.startsWith(x)) || "an";
      return sb("separable-verb", `Trennbares Verb „${v.inf}“: „${cw(p[1])} ${form} ${o.ack} ___.“`, pfx,
        `Das Präfix „${pfx}“ steht bei konjugiertem Verb am Satzende.`, 2, 1, 3, "prefix-dropped");
    }
    case 40: { // imperative form by addressee (du / ihr / Sie)
      const v = pick(r, SB_REG);
      const o = pick(r, OBJS);
      const who = pick(r, [["du", ""], ["ihr", "t"], ["Sie", "en Sie"]]);
      const stem = v.replace(/n$/, "").replace(/e$/, "");
      const form = who[0] === "du" ? stem + "!" : who[0] === "ihr" ? stem + "t!" : v + " Sie!";
      return sb("imperative", `Imperativ für „${who[0]}“ von „${v}“ (Objekt: ${o.ack})`, form,
        `Adressat ${who[0]}: ${form}`, 2, 1, 2, "infinitive-returned");
    }
    case 41: { // two-way preposition CHOICE: which preposition matches the relation?
      const n = pick(r, OBJS.filter((x: any) => ["Regal", "Tisch", "Stuhl"].includes(x.lemma)));
      const rel = pick(r, [
        ["liegt obenauf", "auf"], ["hängt an der Seite", "an"], ["steht darunter", "unter"],
        ["steht daneben", "neben"], ["steht dahinter", "hinter"], ["steht davor", "vor"],
        ["liegt darin", "in"], ["steht dazwischen", "zwischen"],
      ]);
      const obj = pick(r, OBJS.filter((x: any) => ["Liste", "Formular", "Bericht", "Paket", "Schere"].includes(x.lemma)));
      return sb("two-way-preposition", `Welche Wechselpräposition passt? „${cw(obj.nom)} ___ ${n.dat}“ — Lage: ${rel[0]} (wo?)`,
        rel[1], `Lage „${rel[0]}“ → „${rel[1]}“ + Dativ (wo?).`, 2, 2, 3, "wrong-preposition");
    }
    case 42: { // SUBORDINATING conjunction + verb-final clause (contrast to case 19)
      // Case 19 tests main-clause connectors (verb stays position 2). This family
      // tests subordinators, where the verb moves to the end — a different rule.
      const sub = pick(r, [
        ["Grund", "weil"], ["Zeit (gleichzeitig)", "während"], ["Bedingung", "wenn"],
        ["Zeitpunkt danach", "nachdem"], ["Einräumung", "obwohl"], ["Zeitpunkt davor", "bevor"],
      ]);
      const lp = licensedPair();
      const p = pick(r, ["ich", "er", "wir", "sie"]);
      const finite = lp.v.pres[p];
      return sb("conjunction-meaning", `Nebensatz-Konjunktion (${sub[0]}) — Verb ans Ende: „Wir warten, ___ ${p} ${lp.n.ack} ${finite}.“`,
        sub[1], `${sub[0]} → „${sub[1]}“; im Nebensatz steht das Verb am Ende („${finite}“).`, 3, 2, 3, "wrong-conjunction");
    }
    case 43: { // verb-second: fronting an element pushes the subject after the verb
      // Static place only: a directional phrase ("in die Schweiz") with a static
      // verb produced nonsense ("In die Schweiz sieht er das Velo") — 30-sample finding.
      const front = pick(r, [...(LEX.SB_TIME_ADVERBIALS as string[]), ...PLACE_STATIC]);
      const lp = licensedPair(); const v = lp.v; const o = lp.n;
      const p = pick(r, [["ich", "ich"], ["wir", "wir"], ["er", "er"], ["sie", "sie"]]);
      const form = v.pres[p[0] === "ich" ? "ich" : p[0] === "wir" || p[0] === "sie" ? "wir" : "er"];
      return sb("verb-second", `Vorfeld besetzt: „${cw(front)} … ${p[1]} … ${o.ack}“ — bilde den Satz (Verb: ${form})`,
        `${cw(front)} ${form} ${p[1]} ${o.ack}.`,
        "Vorfeld + Verb (Position 2) + Subjekt: Inversion nach vorangestellter Angabe.", 3, 2, 3, "verb-first");
    }
    case 44: { // pronoun case decided by VERB GOVERNMENT (dative vs accusative)
      const p = pick(r, SB_PRON_CASE);
      const isDat = r() < 0.5;
      const v = isDat ? pick(r, SB_DAT_GOV) : pick(r, SB_AKK_GOV);
      const subj = pick(r, ["Ich", "Er", "Sie", "Wir"]);
      const form = subj === "Ich" ? v[0].replace(/en$/, "e") : subj === "Wir" ? v[0] : v[1];
      return sb("pronoun-case", `Ergänze das Pronomen: „${subj} ${form} ___.“ (gemeint ist: ${p[0]}) — Verb: ${v[0]}`,
        isDat ? p[1] : p[2],
        `„${v[0]}“ verlangt ${isDat ? "Dativ" : "Akkusativ"}: ${isDat ? p[1] : p[2]}.`, 2, 1, 3, "wrong-case-pronoun");
    }
    case 45: { // which article does a given adjective ending imply? (reverse direction)
      const n = pick(r, OBJS);
      const a = pick(r, SB_ADJ.filter((x) => x.dim === "size" || x.dim === "quality"));
      // Weak -e ending appears with the definite article; the learner supplies it.
      return sb("adj-declension", `Welcher bestimmte Artikel passt: „___ ${a.base}e ${n.lemma}“ (Nominativ)?`,
        n.gender, `Die schwache Endung -e verlangt den bestimmten Artikel; ${n.lemma} ist ${n.gender}.`, 2, 2, 2, "strong-ending");
    }
    case 46: { // modal verb: conjugated modal at position 2, infinitive at the end
      const modal = pick(r, LEX.SB_MODAL_VERBS as any[]);
      const lp = licensedPair();
      const p = pick(r, ["ich", "du", "er", "wir", "sie"]);
      const mp = modal.pres[p];
      return sb("modal-verb", `Modalverb-Satzbau: „${cw(p)} ${mp} ${lp.n.ack} ___“ (Verb: ${lp.v.inf})`,
        `${cw(p)} ${mp} ${lp.n.ack} ${lp.v.inf}.`,
        `Modalverb „${modal.inf}“ steht an Position 2, der Infinitiv am Satzende.`, 3, 2, 3, "double-conjugated");
    }
    case 47: { // Partizip II from the lexicon's own participle field
      const v = pick(r, VERBS.filter((x: any) => !x.separable));
      const aux = v.aux === "sein" ? "ist" : "hat";
      return sb("participle-strong", `Partizip II von „${v.inf}“ (Perfekt mit „${v.aux}“): „Er ${aux} … ___“`,
        v.participle, `${v.inf} → ${v.participle} (Hilfsverb: ${v.aux}).`, 2, 1, 2, "weak-participle");
    }
    case 48: { // comparative of adjectives that take an UMLAUT
      // Only umlaut-marked adjectives, so the tested rule is actually present.
      const a = pick(r, SB_ADJ.filter((x) => x.umlaut && (x.dim === "size" || x.dim === "quality")));
      const n = pick(r, OBJS);
      return sb("comparative-umlaut", `Umlaut im Komparativ: „${cw(n.nom)} ist ___ als sonst.“ (von „${a.base}“)`,
        a.comp, `Einsilbige Adjektive mit a/o/u bekommen im Komparativ einen Umlaut: ${a.base} → ${a.comp}.`, 2, 1, 3, "no-umlaut");
    }
    case 49: { // sentence type identified from word order
      const lp = licensedPair();
      const p = pick(r, ["du", "er", "wir", "sie"]);
      const f = lp.v.pres[p];
      const kind = pick(r, [
        ["Aussagesatz", `${cw(p)} ${f} ${lp.n.ack}.`],
        ["Ja/Nein-Frage", `${cw(f)} ${p} ${lp.n.ack}?`],
        ["W-Frage", `Wann ${f} ${p} ${lp.n.ack}?`],
        ["Aufforderung", `${cw(lp.v.inf)} Sie ${lp.n.ack}!`],
      ]);
      return sb("sentence-type", `Welcher Satztyp ist das? „${kind[1]}“`, kind[0],
        "Verbposition und Satzzeichen bestimmen den Satztyp.", 2, 2, 3, "wrong-sentence-type");
    }
    case 50: { // temporal preposition chosen by the time relation it expresses
      const rel = pick(r, [
        ["früher als das Ereignis", "vor"], ["später als das Ereignis", "nach"],
        ["Beginn in der Vergangenheit, dauert an", "seit"], ["Endpunkt", "bis"],
        ["Zeitraum-Dauer", "während"], ["Zeitpunkt am Tag", "an"],
      ]);
      const ev = pick(r, ["der Prüfung", "der Schulung", "dem Termin", "der Pause", "dem Feierabend", "der Lieferung"]);
      return sb("temporal-preposition", `Temporale Präposition: „Wir handeln ___ ${ev}.“ — Bedeutung: ${rel[0]}`,
        rel[1], `„${rel[0]}“ → ${rel[1]}.`, 2, 2, 2, "wrong-temporal-preposition");
    }
    case 51: { // reflexive verb: which verb REQUIRES a reflexive pronoun?
      const rv = pick(r, SB_REFLV);
      const p = pick(r, SB_REFL_BY_PERSON);
      const stem = /[e][rl]n$/.test(rv[0]) ? rv[0].replace(/n$/, "") : rv[0].replace(/en$/, "");
      const link = /[dt]$/.test(stem) ? "e" : "";
      const conj = p[0] === "ich" ? stem + "e" : p[0] === "du" ? stem + link + "st"
        : p[0] === "er" || p[0] === "ihr" ? stem + link + "t" : rv[0];
      const subj = p[0] === "er" ? "Er" : p[0] === "sie" ? "Sie" : cw(p[0]);
      return sb("reflexive-verb", `Reflexives Verb vervollständigen: „${subj} ${conj} ___“ — welches Verb liegt zugrunde?`,
        rv[1], `„${rv[1]}“ braucht immer ein Reflexivpronomen (hier: ${p[1]}).`, 2, 2, 2, "non-reflexive-form");
    }
  }
}
// genTextverst defined above (4 text types).
// ===== TEXTVERSTÄNDNIS: 14 distinct rule-level reading operations =====
// ===== TEXTVERSTÄNDNIS: 14 reading-operation paths, each with RICH parameterized
// content pools so the distinct-prompt count far exceeds the items served in 56 days =====
function genTextverst(r: () => number, d: number, structIndex = -1): Question {
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
  const path = structIndex >= 0 ? structIndex : ri(r, 0, 13);
  switch (path) {
    case 0: { // read-locate-fact: many notice texts + conditions
      const facts = [
        ["Achtung: Die Lieferung erfolgt nur nach Voranmeldung.", "eine Voranmeldung", "Was ist nötig?"],
        ["Zutritt nur mit gültigem Ausweis.", "ein gültiger Ausweis", "Was ist nötig?"],
        ["Rückgabe nur mit Originalbeleg.", "der Originalbeleg", "Was wird verlangt?"],
        ["Der Aufzug ist wegen Wartung ausser Betrieb.", "eine Wartung", "Was ist der Grund?"],
        ["Hunde müssen an der Leine geführt werden.", "eine Leine", "Was ist nötig?"],
        ["Bezahlung ausschliesslich bar oder mit Karte.", "bar oder mit Karte", "Welche Bedingung gilt hier?"],
        ["Umkleiden vor Betreten der Halle Pflicht.", "ein Umkleiden", "Was wird verlangt?"],
        ["Rauchen ist auf dem ganzen Gelände verboten.", "überall verboten", "Wo gilt das Rauchverbot?"],
      ];
      const f = pick(r, facts);
      // The question wording used to be picked INDEPENDENTLY of the fact, which
      // paired a prohibition ("Rauchen ist verboten") with "Was ist nötig?" — the
      // question then did not match the text (stratified audit item #29).
      // Each fact now carries the question form that actually fits it.
      const qForm = f[2] || "Welche Bedingung gilt hier?";
      return tv("read-locate-fact", f[0], qForm,
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
function genProzess(r: () => number, d: number, structIndex = -1): Question {
  const ph = (arr: string[]) => pick(r, arr);
  const pl = (opSeq: string, prompt: string, ans: string, expl: string, optsIn: string[] | undefined, steps: number, cons: number, wml: number, dk: string) =>
    mk("logik", "prozesslogik", opSeq, d, prompt, optsIn, ans, expl, "Denke den Ablauf Schritt für Schritt durch.", 22, 4, dk, "sort", opSeq,
      { opSequence: opSeq, stepCount: steps, constraintCount: cons, distractorKind: dk, workingMemoryLoad: wml, inputModality: "sequence", answerCardinality: 1 }, false);
  const wrongOrder = (steps: string[]) => [...steps.slice(1), steps[0]];
  const path = structIndex >= 0 ? structIndex : ri(r, 0, 21);
  switch (path) {
    case 0: { // linear ordering of a familiar process
      // WIDENED: typed scenario pool (24 authored scenarios x 4 domains) instead
      // of 5 hard-coded lists. The domain/objects/steps change, so the student
      // must re-derive the ordering each time (real variation, not cosmetic).
      const steps = pick(r, PROCESS_SCENARIOS).steps;
      const correct = steps.join(" → ");
      return pl("linear-sequence-ordering", ph(["Ordne die Schritte sinnvoll:", "Bringe die Ablaufschritte in die richtige Reihenfolge:"]), correct,
        "Logische Reihenfolge: " + correct, shuffle([correct, wrongOrder(steps).join(" → ")], r), steps.length, 0, 2, "rotated-order");
    }
    case 1: { // conditional ordering (constraint between two steps)
      // WIDENED: 8 authored constraint scenarios; the RULE itself varies too.
      const cs = pick(r, CONSTRAINT_SCENARIOS);
      const steps = cs.steps;
      return pl("conditional-sequence-ordering", `Ordne mit Bedingung: ${cs.rule}`, steps.join(" → "),
        "Bedingung beachtet: " + cs.rule, [steps.join(" → "), wrongOrder(steps).join(" → ")], steps.length, 1, 3, "constraint-violated");
    }
    case 2: { // remove the irrelevant step
      // WIDENED: each scenario carries an intruder from a DIFFERENT domain, so
      // the discrimination is genuine rather than lexical.
      const sc = pick(r, PROCESS_SCENARIOS);
      const correct = sc.steps.join(" → ");
      return pl("remove-irrelevant-step", `Welcher Schritt gehört NICHT in diesen Ablauf (${sc.domain})?`, sc.intruder,
        `„${sc.intruder}“ gehört nicht zum Prozess.`, dedupeOptions(shuffle([sc.intruder, ...sc.steps.slice(0, 3)], r)), 3, 0, 2, "removed-right-step");
    }
    case 3: { // principle application (safety/priority rule)
      const principle = pick(r, PRINCIPLES); // WIDENED: 10 authored principles
      return pl("principle-application", principle[0], principle[1], "Prinzip: " + principle[2], undefined, 1, 1, 2, "efficiency-over-safety");
    }
    case 4: { // classify step position (Anfang/Mitte/Ende)
      // WIDENED: triples derived from the scenario pool (first/middle/last of
      // a real 4-step process), so position reasoning stays intact.
      const sc4 = pick(r, PROCESS_SCENARIOS);
      const triple = [sc4.steps[0], sc4.steps[1], sc4.steps[sc4.steps.length - 1]];
      const pos = ri(r, 0, 2);
      const label = pos === 0 ? "am Anfang" : pos === 1 ? "in der Mitte" : "am Ende";
      return pl("step-position-classify", `Wo steht „${triple[pos]}“ im Ablauf ${triple.join(" → ")}?`, label,
        `„${triple[pos]}“ steht ${label}.`, undefined, 3, 0, 2, "wrong-position");
    }
    case 5: { // cause before effect
      const pair = pick(r, CAUSE_EFFECT); // WIDENED: 12 authored cause/effect pairs
      return pl("cause-before-effect", `Was passiert ZUERST: „${pair[0]}“ oder „${pair[1]}“?`, pair[0],
        "Ursache vor Wirkung.", undefined, 2, 0, 2, "effect-first");
    }
    case 6: { // fill missing middle step
      // HUMAN-AUDIT FIX 1: endpoints and middle were drawn INDEPENDENTLY, producing
      // semantically wrong chains such as "Anmelden → be- und verarbeiten → absenden".
      // HUMAN-AUDIT FIX 2: steps[2] was used as a distractor, but in a 4-step
      // process it is ALSO a valid intermediate step — "Post öffnen → Antwort
      // verfassen → absenden" reads correctly, so two options were defensible.
      // Distractors now come only from OTHER domains, leaving exactly one answer.
      const sc6 = pick(r, PROCESS_SCENARIOS);
      const first = sc6.steps[0];
      const mid6 = sc6.steps[1];
      const last = sc6.steps[sc6.steps.length - 1];
      const foreign = PROCESS_SCENARIOS.filter((x) => x.domain !== sc6.domain);
      const d1 = pick(r, foreign).steps[1];
      const d2 = sc6.intruder;
      return pl("fill-missing-step", `Ergänze den sinnvollen Zwischenschritt: ${first} → ? → ${last}`, mid6,
        `${first} → ${mid6} → ${last}.`, dedupeOptions(shuffle([mid6, d1, d2], r)), 3, 0, 2, "implausible-middle");
    }
    case 7: { // dependency: may B start before A?
      // WIDENED: authored predecessor/dependent pairs. Previously two independent
      // picks could form a pair with no real dependency (e.g. Etikettieren ->
      // Fakturierung), making the "Nein" answer unjustified.
      const dp = pick(r, DEPENDENCY_PAIRS);
      return pl("dependency-check", `Darf „${dp[1]}“ starten, bevor „${dp[0]}“ abgeschlossen ist?`, "Nein",
        `${dp[0]} liefert die Grundlage für ${dp[1]}.`, ["Ja", "Nein"], 2, 1, 2, "reversed-dependency");
    }
    case 8: { // detect repeated step (control loop)
      // WIDENED: the control loop is built from a real scenario, so the repeated
      // step differs each time (was one fixed literal, capacity 1).
      const sc8 = pick(r, PROCESS_SCENARIOS);
      const rep = sc8.steps[1];
      const chain8 = [sc8.steps[0], rep, sc8.steps[2], rep, sc8.steps[3]].join(" → ");
      return pl("detect-repeat-step", `Welcher Schritt kommt ZWEIMAL vor? ${chain8}`, rep,
        `Kontrollschleife: „${rep}“ wiederholt sich.`, dedupeOptions(shuffle([rep, sc8.steps[0], sc8.steps[2], sc8.steps[3]], r)), 5, 0, 3, "wrong-repeat");
    }
    case 9: { // parallel eligibility
      // WIDENED: draws an INDEPENDENT pair (parallel = Ja) or a DEPENDENT pair
      // from a constraint scenario (parallel = Nein), so the answer is not
      // always "Ja" and the student must judge dependency.
      const par = r() < 0.5;
      if (par) {
        const a9 = pick(r, PROCESS_SCENARIOS), b9 = pick(r, PROCESS_SCENARIOS);
        const s1 = a9.steps[1], s2 = b9.domain === a9.domain ? b9.steps[3] : b9.steps[1];
        return pl("parallel-vs-serial", `Können „${s1}“ und „${s2}“ gleichzeitig laufen?`, "Ja",
          "Unabhängige Schritte sind parallel möglich.", ["Ja", "Nein"], 2, 1, 2, "false-serial");
      }
      const cs9 = pick(r, CONSTRAINT_SCENARIOS);
      return pl("parallel-vs-serial", `Können „${cs9.steps[1]}“ und „${cs9.steps[2]}“ gleichzeitig laufen? Regel: ${cs9.rule}`, "Nein",
        "Der zweite Schritt hängt vom ersten ab.", ["Ja", "Nein"], 2, 1, 2, "false-serial");
    }
    case 10: { // which step is skippable without breaking the goal
      // WIDENED + DEFECT FIX: the old code picked a value then discarded it
      // (void s) and always emitted the same hardcoded Formular prompt.
      const ms = pick(r, MANDATORY_STEP);
      return pl("skip-step-consequence", `Ablauf: ${ms[0].join(" → ")}. Welcher Schritt darf NIEMALS übersprungen werden?`, ms[1],
        ms[2], dedupeOptions(shuffle([...ms[0]], r)), 3, 1, 2, "skippable-chosen");
    }
    case 11: { // first-failure point: where does the process break?
      // WIDENED: the process and the failing step both vary; the blamed step is
      // the one that SELECTS the item, not the last step (distractor logic kept).
      const sc11 = pick(r, PROCESS_SCENARIOS);
      const blame = sc11.steps[1];
      return pl("first-failure-point", `Das Ergebnis ist falsch (${sc11.domain}). Wo wurde der Fehler WOHL erstmals gemacht? ${sc11.steps.join(" → ")}`, blame,
        `Fehler entstehen meist bei „${blame}“, nicht erst am Ende.`, dedupeOptions(shuffle([...sc11.steps], r)), 4, 1, 3, "last-step-blamed");
    }
    case 12: { // if-then branching decision
      const b = pick(r, BRANCHES); // WIDENED: 12 authored condition/branch pairs
      return pl("branch-decision", `Wenn "${b[0]}" — was ist der richtige Prozesszweig?`, b[1],
        "Regelgesteuerte Verzweigung.", undefined, 2, 1, 3, "ignore-condition");
    }
    case 13: { // ordering by priority when capacity is short
      // WIDENED: the customer-relevant task varies, as do the two low-priority
      // distractors, so the student applies the PRINCIPLE rather than recalling (a).
      const urgent = pick(r, ["Reklamation bearbeiten", "Kundenanfrage beantworten", "Fehllieferung klären", "Termin mit Kunden bestätigen", "defekte Ware sperren"]);
      const lows = shuffle(["Archiv aufräumen", "Kaffeemaschine entkalken", "Ordner neu beschriften", "Vorräte zählen", "Schreibtisch aufräumen"], r).slice(0, 2);
      const trio = shuffle([urgent, ...lows], r);
      return pl("priority-under-scarcity", `Du schaffst heute nur EINE Aufgabe: ${trio.map((x, i) => `(${"abc"[i]}) ${x}`).join(", ")}. Was zuerst?`, urgent,
        "Kundenrelevanz hat Vorrang.", dedupeOptions(trio), 2, 1, 2, "comfort-first");
    }
    case 14: { // cycle detection in a loop process
      // WIDENED: the loop subject and its exit condition vary together.
      const lp = pick(r, LOOPS); // WIDENED: 16 authored loop subjects
      return pl("loop-exit-condition", `Schleife: „Solange ${lp[0]} nicht leer: ${lp[1]}.“ Was beendet die Schleife?`, lp[2],
        "Abbruchbedingung erkennen.", dedupeOptions(shuffle([lp[2], "voller " + lp[0], "nach 10 Durchläufen", "nie"], r)), 3, 1, 3, "no-exit");
    }
    case 15: { // order by alphabet vs numeric vs date (choose the right key)
      // WIDENED: 10 authored key choices; distractors are other real keys.
      const sk = pick(r, SORT_KEYS);
      const otherKeys = SORT_KEYS.filter((x) => x[1] !== sk[1]).map((x) => x[1]);
      return pl("sort-key-selection", `Womit sortiert man am sinnvollsten: ${sk[0]}?`, sk[1],
        "Passender Sortierschlüssel.", dedupeOptions(shuffle([sk[1], ...shuffle(otherKeys, r).slice(0, 2)], r)), 2, 0, 2, "random-key");
    }
    case 16: { // buffer/waiting logic: what happens between two steps?
      // WIDENED: each entry carries its OWN waiting step, replacing a ternary
      // chain that would have silently mis-answered any new pair.
      const ws = pick(r, WAIT_STEPS);
      const otherWaits = WAIT_STEPS.filter((x) => x[2] !== ws[2]).map((x) => x[2]);
      return pl("intermediate-wait-step", `Was liegt typischerweise ZWISCHEN „${ws[0]}“ und „${ws[1]}“?`, ws[2],
        "Zwischenschritt im Prozess.", dedupeOptions(shuffle([ws[2], ...shuffle(otherWaits, r).slice(0, 2)], r)), 2, 0, 2, "step-skipped");
    }
    case 17: { // exception handling: normal path interrupted
      // WIDENED: exception scenarios across domains; the correct branch differs.
      const ex = pick(r, EXCEPTIONS); // WIDENED: 14 authored exception branches
      return pl("exception-path", ex[0], ex[1], ex[2], undefined, 2, 1, 3, "normal-path-forced");
    }
    case 18: { // role handoff: who does the next step?
      // WIDENED (also a correctness fix): previously the prompt was fixed while
      // the answer varied with an unused pick -> the answer could contradict the
      // question. Now the handoff pair drives both.
      const hand = HANDOFFS; // WIDENED: 16 authored handoff stations
      const h = pick(r, hand);
      return pl("role-handoff", `Nach der Station „${h[0]}“ übergibt ${h[1]} an wen?`, h[2],
        "Übergabepunkt im Prozess.", dedupeOptions(shuffle([h[2], h[1], ...hand.filter(x => x[2] !== h[2]).slice(0, 2).map(x => x[2])], r)), 2, 0, 2, "wrong-role");
    }
    case 19: { // deadline gating: which step has a cutoff?
      // WIDENED: cutoff hour and the gating event both vary, drawn from the JSON
      // pool (14 gates x 10 hours) instead of 4 inline entries x 6 hours.
      const hour = pick(r, ["10", "11", "12", "13", "14", "15", "16", "17", "18", "9"]);
      const g0 = pick(r, GATES);
      const g: [string, string] = [g0[0], `${g0[1]} bis ${hour} Uhr`];
      return pl("deadline-gate", `${g[0]} bis ${hour} Uhr werden noch heute bearbeitet. Was entscheidet über den Tag?`, g[1],
        "Cutoff-Zeit als Tor im Prozess.", dedupeOptions(shuffle([g[1], "die Reihenfolge im Stapel", "die Grösse der Sendung", "der Wunsch des Kunden"], r)), 2, 1, 2, "no-gate");
    }
    case 20: { // count steps needed to reach a state
      // WIDENED: the reduction per run and the start count both vary, so the
      // student must divide rather than recall "answer == start".
      const per = pick(r, [1, 2, 3]);
      const runs = ri(r, 3, 12);
      const start = per * runs;
      const unit = pick(r, ["Fehlbestand", "Restposten", "offene Meldungen", "Rückstände", "Altbestand"]);
      // stepCount is part of the structural SIGNATURE, so it must NOT vary with
      // the rendered numbers — passing `runs` here split one struct into six
      // signatures and pushed hashU 25 -> 31, violating the anti-gaming
      // invariant. The signature stays fixed; only the render varies.
      return pl("count-steps-to-goal", `Jede Stufe senkt den ${unit} um ${per}. Wie viele Kontrollläufe braucht es von ${start} auf 0?`, String(runs),
        `${start} ÷ ${per} = ${runs} Läufe.`, undefined, 4, 1, 3, "off-by-one-count");
    }
    default: { // 21: reverse-engineer the previous step
      // WIDENED + TWO GRAMMAR FIXES found by reading the output:
      //   1. "Im Prozess kommt „X“ gerade abgeschlossen wurde" was ungrammatical.
      //   2. "VORHERIGGE" was a typo for "VORHERIGE".
      const ps = pick(r, PREV_STEP);
      const otherPrev = PREV_STEP.filter((x) => x[1] !== ps[1]).map((x) => x[1]);
      return pl("backward-step-inference", `„${ps[0]}“ wurde gerade abgeschlossen. Was war der unmittelbar VORHERIGE Schritt?`, ps[1],
        `Vor „${ps[0]}“ kommt „${ps[1]}“.`, dedupeOptions(shuffle([ps[1], ...shuffle(otherPrev, r).slice(0, 2)], r)), 2, 1, 2, "forward-confusion");
    }
  }
}
// ===== WORTGRUPPEN: 18 distinct rule-level paths (semantic-relation types) =====
function genWortgruppen(r: () => number, d: number, structIndex = -1): Question {
  const ph = (arr: string[]) => pick(r, arr);
  const wg = (opSeq: string, prompt: string, ans: string, expl: string, optsIn: string[] | undefined, steps: number, cons: number, wml: number, dk: string) =>
    mk("logik", "wortgruppen", opSeq, d, prompt, optsIn, ans, expl, "Finde die logische Beziehung.", 18, 3, dk, "choice", opSeq,
      { opSequence: opSeq, stepCount: steps, constraintCount: cons, distractorKind: dk, workingMemoryLoad: wml, inputModality: "choice", answerCardinality: 1 }, false);
  // WIDENED: typed pool with an HONEST category label per set. The label powers
  // the rewritten case 5, whose old code drew the asked-for category independently
  // of the word set and hardcoded the answer "2" — producing wrong answers for
  // every set/category mismatch (e.g. [Löwe, Tiger, Bär]+Lachs asked as "Obst").
  const sets = POOLS.WG_SETS as [string[], string, string][];
  const path = structIndex >= 0 ? structIndex : ri(r, 0, 17);
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
      // WIDENED (was registered dead-pool): consumes the analogy pool; third
      // distractor is drawn from OTHER analogies so options stay single-answer.
      const an = pick(r, POOLS.WG_ANALOGIES as [string, string, string, string][]);
      const foreign = (POOLS.WG_ANALOGIES as [string, string, string, string][]).filter((x) => x[0] !== an[0]);
      const d3 = pick(r, foreign)[3];
      return wg("analogy-relationship-transfer", `${an[0]} : ${an[1]} wie ${an[2]} : ?`, `${an[2]} : ${an[3]}`,
        `Beziehung übertragen: ${an[0]} : ${an[1]} = ${an[2]} : ${an[3]}.`,
        dedupeOptions(shuffle([`${an[2]} : ${an[3]}`, `${an[2]} : ${d3}`, `${an[0]} : ${pick(r, sets)[1]}`], r)), 1, 0, 3, "surface-match");
    }
    case 3: {
      // WIDENED x2 DIRECTIONS: forward asks the Oberbegriff, reverse asks which
      // word belongs to the named category (foreign words drawn from OTHER rows'
      // member lists -> still exactly one defensible answer).
      const cats = POOLS.WG_SUPERORDINATES as [string, string][];
      const cat = pick(r, cats);
      if (r() < 0.5) {
        return wg("name-superordinate", `Wie heisst der Oberbegriff für: ${cat[0]}?`, cat[1], "Oberbegriff: " + cat[1] + ".", undefined, 1, 0, 2, "hyponym-instead");
      }
      const members = cat[0].split(", ");
      const otherRows = cats.filter((x) => x[1] !== cat[1]);
      const fRow1 = pick(r, otherRows);
      const f1 = pick(r, fRow1[0].split(", "));
      let f2 = pick(r, pick(r, otherRows.filter((x) => !x[0].includes(f1)))[0].split(", "));
      if (f2 === f1) f2 = pick(r, pick(r, otherRows)[0].split(", "));
      const shown = shuffle([members[0], f1, f2], r);
      return wg("name-superordinate",
        `Welches dieser Wörter ist: ${cat[1]}? ${shown.join(", ")}`,
        members[0],
        `${members[0]} gehört zu ${cat[1]}; ${f1} und ${f2} nicht.`,
        dedupeOptions(shuffle([members[0], f1, f2], r)), 1, 0, 2, "hyponym-instead");
    }
    case 4: {
      return wg("least-similar-pair", `Welches Paar ist am wenigsten ähnlich? ${group[0]} & ${group[1]} oder ${group[0]} & ${odd}?`, `${group[0]} & ${odd}`,
        `${odd} gehört nicht zur Gruppe.`, undefined, 1, 0, 2, "in-group-pair");
    }
    case 5: {
      // WRONG-ANSWER FIX + WIDENED: category now comes from the SET ITSELF
      // (honest label), so the count is derived, never hardcoded. The answer is
      // computed from which members actually belong. Input-mode keeps "choice"
      // with distinct numeric options.
      // Asked-for category comes from the SET ITSELF (honest authored label);
      // displayed trio = two members + one word from a DIFFERENT set; the answer
      // is DERIVED by counting real membership — never hardcoded.
      const askCat = group[2];
      const mixedSet = pick(r, (POOLS.WG_SETS as [string[], string, string][]).filter((x) => x[2] !== askCat));
      const shown: Array<[string, string]> = [
        [group[0], askCat], [group[1], askCat], [mixedSet[1], mixedSet[2]],
      ];
      const nCat = shown.filter(([, lab]) => lab === askCat).length;
      return wg("count-category-members",
        `Wie viele dieser Wörter sind ${askCat}? ${shown.map((x) => x[0]).join(", ")}`,
        String(nCat),
        shown.map(([w, lab]) => `${w}: ${lab}`).join("; ") + ".",
        undefined, 1, 1, 2, "included-outlier");
    }
    case 6: {
      // WIDENED: 16 authored membership rows, balanced Ja/Nein.
      const hier = pick(r, POOLS.WG_HIERARCHY as [string, string, string][]);
      return wg("hierarchy-membership", `Ist „${hier[0]}“ eine Art von ${hier[1]}?`, hier[2],
        `${hier[0]}: ${hier[2]}.`, dedupeOptions(shuffle(["Ja", "Nein"], r)), 1, 0, 2, "wrong-membership");
    }
    case 7: {
      // WIDENED: 16 authored part-whole rows, balanced Ja/Nein.
      const pw = pick(r, POOLS.WG_PART_WHOLE as [string, string, string][]);
      return wg("part-whole-relation", `Ist „${pw[0]}“ ein TEIL von „${pw[1]}“?`, pw[2],
        "Teil-Ganzes-Beziehung prüfen.", dedupeOptions(shuffle(["Ja", "Nein"], r)), 1, 0, 2, "whole-part-confusion");
    }
    case 8: {
      // WIDENED: pool of 18 antonym pairs; the authored third word is a
      // plausible near-property distractor, plus two constant relation words.
      // WIDENED x2 DIRECTIONS: asked word may be either pole of the pair.
      const ant = pick(r, POOLS.WG_ANTONYMS as [string, string, string][]);
      const flip8 = r() < 0.5;
      const word8 = flip8 ? ant[1] : ant[0];
      const ans8 = flip8 ? ant[0] : ant[1];
      return wg("antonym-matching", `Welches Wort ist das GEGENTEIL von „${word8}“?`, ans8,
        `${word8} ↔ ${ans8}.`, dedupeOptions(shuffle([ans8, ant[2], "ähnlich", "gleich"], r)), 1, 0, 2, "synonym-chosen");
    }
    case 9: {
      // WIDENED: 12-pair synonym pool; distractor is another pair's synonym.
      const syn = pick(r, POOLS.WG_SYNONYMS as [string, string, string][]);
      const foreign = (POOLS.WG_SYNONYMS as [string, string, string][]).filter((x) => x[1] !== syn[1]);
      return wg("synonym-matching", `Welches Wort bedeutet etwa das GLEICHE wie „${syn[0]}“?`, syn[1],
        `${syn[0]} ≈ ${syn[1]}.`, dedupeOptions(shuffle([syn[1], pick(r, foreign)[2], "entgegengesetzt", "falsch"], r)), 1, 0, 2, "antonym-chosen");
    }
    case 10: {
      // WIDENED: purpose phrases from the pool; options are OTHER objects'
      // purposes, so only one describes this object. Input-mode with options
      // would leave several defensible answers — hence fixed option set per draw.
      const fn = pick(r, POOLS.WG_FUNCTIONS as [string, string][]);
      const foreign = (POOLS.WG_FUNCTIONS as [string, string][]).filter((x) => x[0] !== fn[0]);
      const f1 = pick(r, foreign)[1];
      const f2 = pick(r, foreign.filter((x) => x[1] !== f1))[1];
      return wg("object-function", `Wozu dient eine/ein „${fn[0]}“ am ehesten?`, fn[1],
        `Ein ${fn[0]} dient zum ${fn[1]}.`,
        dedupeOptions(shuffle([fn[1], f1, f2], r)), 1, 0, 2, "decorative-purpose");
    }
    case 11: {
      // WIDENED (was registered dead-pool + CONSTANT render): every set from the
      // typed pool works here — the two in-group words share the property, the
      // odd word violates it. Answer and explanation are derived, not hardcoded.
      return wg("property-violation",
        `Welches Wort passt NICHT zu den anderen? ${group[0]}, ${group[1]}, ${odd}`,
        odd,
        `${group[0]} und ${group[1]} sind ${group[2].replace(/e$/, "")}artig; ${odd} nicht.`,
        dedupeOptions(shuffle([group[0], group[1], odd], r)), 1, 1, 2, "category-instead-property");
    }
    case 12: {
      // WIDENED x3 POSITIONS: asked position varies (erste Stelle/Mitte/letzte
      // Stelle); the answer is DERIVED by splitting the canonical sequence.
      const seq = pick(r, POOLS.WG_SEQUENCES as [string, string][]);
      const words12 = seq[0].split(", ");
      const pos12 = Math.floor(r() * 3);
      const posLabel = pos12 === 0 ? "AN ERSTER STELLE" : pos12 === 1 ? "IN DER MITTE" : "AN LETZTER STELLE";
      const ans12 = words12[pos12];
      return wg("canonical-sequence-middle", `Welches Wort steht in der üblichen Reihenfolge ${posLabel}? ${seq[0]}`, ans12,
        `${ans12} steht ${posLabel === "AN ERSTER STELLE" ? "vorne" : pos12 === 1 ? "in der Mitte" : "am Ende"}.`,
        undefined, 1, 1, 2, "endpoints-chosen");
    }
    case 13: {
      // WIDENED: 10-row collective-noun pool (was inline 4).
      // WIDENED x2 DIRECTIONS: collective->members or members->collective.
      const col = pick(r, POOLS.WG_COLLECTIVES as [string, string][]);
      if (r() < 0.5) {
        return wg("collective-noun", `Wie nennt man eine Gruppe von ${col[1]}?`, col[0],
          `Eine Gruppe: ${col[0]}.`, dedupeOptions(shuffle([col[0], "Sippe", "Gewässer", "Kiste"], r)), 1, 0, 2, "random-collective");
      }
      // Reverse: ONE member-word + TWO plain singular nouns (NON-collectives —
      // other collectives would make several answers defensible).
      const nonCol = POOLS.WG_NON_COLLECTIVES;
      const nc1 = pick(r, nonCol);
      const nc2 = pick(r, nonCol.filter((x) => x !== nc1));
      const shown13 = shuffle([col[1], nc1, nc2], r);
      return wg("collective-noun",
        `Welches dieser Wörter benennt eine GRUPPE von Tieren oder Dingen? ${shown13.join(", ")}`,
        col[1],
        `${col[0]} = eine Gruppe von ${col[1]}; ${nc1} und ${nc2} sind Einzeldinge.`,
        dedupeOptions(shuffle([col[1], nc1, nc2], r)), 1, 0, 2, "random-collective");
    }
    case 14: {
      // WIDENED + RENDER-VARIATION FIX: candidates go IN THE PROMPT (was a
      // constant prompt hiding pool variation). Dual word + three single-category
      // words drawn from other sets -> many honest renders, one defensible answer.
      const two = pick(r, POOLS.WG_DUAL_CATEGORY as [string, string][]);
      const singlesPool = (POOLS.WG_SETS as [string[], string, string][]).filter((x) => !x.flat().includes(two[0]));
      const picks: string[] = [];
      let guard14 = 0;
      while (picks.length < 3 && guard14++ < 100) {
        const cand = pick(r, singlesPool)[1];
        if (!picks.includes(cand)) picks.push(cand);
      }
      return wg("dual-category-member",
        `Welches Wort gehört zu ZWEI Kategorien gleichzeitig? ${[two[0], ...picks].join(", ")}`,
        two[0],
        `${two[0]}: ${two[1]}. Die anderen gehören je nur EINER Kategorie an.`,
        undefined, 1, 1, 3, "single-category-only");
    }
    case 15: {
      // WIDENED + PROMPT-INTEGRITY FIX: the old text claimed "schwächste zuerst"
      // while every row renders strongest-first — a contradiction. Now the display
      // order is genuinely shuffled and the asked POLE selects the answer:
      // am STÄRKSTEN -> row[1] (sehr X), am SCHWÄCHSTEN -> row[2] (weniger X).
      // Answer stays derived from authored schema; no string ternaries.
      const deg = pick(r, POOLS.WG_DEGREE as [string, string, string][]);
      const askStrong15 = r() < 0.5;
      const shown15 = shuffle([deg[0], deg[1], deg[2]], r);
      const ans15 = askStrong15 ? deg[1] : deg[2];
      return wg("intensity-ordering",
        `Von „${shown15.join("“, „")}“ — welches Wort drückt die EIGENSCHAFT am ${askStrong15 ? "STÄRKSTEN" : "SCHWÄCHSTEN"} aus?`,
        ans15,
        `Stufen: ${deg[2]} < ${deg[0]} < ${deg[1]}.`,
        undefined, 1, 1, 3, "strongest-chosen");
    }
    case 16: {
      // WIDENED: was wrapped in a single-element array (one render). Model pair +
      // correct analogue from the row; distractors are cross-relation pairs.
      // WIDENED: 13-row relation pool (was inline 6); distractors remain
      // cross-relation pairs so exactly one analogue matches the model relation.
      const rel = pick(r, POOLS.WG_RELATION_PAIRS as [string, string][]);
      const foreign = POOLS.WG_RELATION_DISTRACTORS as string[];
      const d1 = pick(r, foreign);
      const d2 = pick(r, foreign.filter((x) => x !== d1));
      return wg("relation-pattern-match", `Welches Paar zeigt dieselbe BEZIEHUNG wie „${rel[0]}“?`, rel[1],
        "Relation identifizieren und übertragen.", dedupeOptions(shuffle([rel[1], d1, d2], r)), 1, 0, 3, "surface-word-match");
    }
    default: { // 17: exclude by negation (all are X except one that is NOT-X)
      // WIDENED: two fixed rows -> ten.
      // WIDENED: 20-row negation pool — the 10 original rows stay byte-identical,
      // 10 new authored rows added (each: NOT-X criterion, exception, 2 in-group).
      const neg = pick(r, [
        ["nicht lebendig", "Stein", ["Rose", "Ameise", "Stein"]],
        ["kein Werkzeug", "Gabel", ["Hammer", "Zange", "Gabel"]],
        ["kein Tier", "Rose", ["Löwe", "Ameise", "Rose"]],
        ["nicht essbar", "Tulpe", ["Apfel", "Birne", "Tulpe"]],
        ["kein Fahrzeug", "Stuhl", ["Auto", "Bus", "Stuhl"]],
        ["kein Möbelstück", "Banane", ["Tisch", "Regal", "Banane"]],
        ["kein Instrument", "Hammer", ["Violine", "Flöte", "Hammer"]],
        ["kein Monat", "Dienstag", ["Januar", "August", "Dienstag"]],
        ["kein Vogel", "Lachs", ["Ente", "Spatz", "Lachs"]],
        ["kein Kleidungsstück", "Kelle", ["Mütze", "Rock", "Kelle"]],
        ...POOLS.WG_NEGATION_ROWS_NEW,
      ]);
      // WIDENED x2 POLES: ask for the NOT-X word, or invert and ask which word
      // does NOT satisfy the negation (i.e. the in-group X word).
      if (r() < 0.5) {
        return wg("negated-grouping", `Welches Wort ist ${neg[0]}?`, String(neg[1]),
          `${neg[1]} erfüllt das Kriterium.`, dedupeOptions(shuffle(neg[2] as string[], r)), 1, 1, 2, "positive-match-chosen");
      }
      const opts17 = neg[2] as string[];
      const crit17 = neg[0] as string;
      const inWord17 = opts17.find((w) => w !== (neg[1] as string)) as string;
      return wg("negated-grouping", `Welches Wort ist NICHT ${crit17}?`, inWord17,
        `${inWord17} erfüllt das Kriterium NICHT.`,
        dedupeOptions(shuffle(opts17, r)), 1, 1, 2, "positive-match-chosen");
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
function genSymbole(r: () => number, d: number, structIndex = -1): Question {
  const variant = structIndex >= 0 ? Math.min(structIndex, 3) : ri(r, 0, 3);
  if (variant === 0) return genVisualCount(r, d, "symbole_entdecken", "symbol", "Wie viele Symbole der gesuchten Art");
  if (variant === 1) return genVisualMore(r, d, "symbole_entdecken");
  if (variant === 2) return genVisualLeast(r, d, "symbole_entdecken");
  return genVisualRow(r, d, "symbole_entdecken");
}
function genBilderZaehlenVariant(r: () => number, d: number, structIndex = -1): Question {
  const variant = structIndex >= 0 ? Math.min(structIndex, 3) : ri(r, 0, 3);
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
function genSchilder(r: () => number, d: number, structIndex = -1): Question {
  const k = d <= 1 ? 3 : d === 2 ? 4 : 6;
  const chosen = shuffle(SIGNS, r).slice(0, k);
  const svg = genSchilderSvg(k, chosen);
  // slot0 = recall-present/absent with balanced coin; slot1 = forced-absent (Nein).
    // BIJECTION FIX (Amendment: structIndex <-> structHash must be 1:1).
    // Previously BOTH si=0 and si=1 used a balanced coin, so each emitted the
    // signatures recall-present AND recall-absent — two structs sharing two
    // signatures, which broke the bijection and made the signature space
    // ambiguous. Now the struct DETERMINES the case:
    //   si=0 -> always present (answer "Ja"),  si=1 -> always absent ("Nein").
    // Ja/Nein balance is preserved because the composer rotates si=0 and si=1
    // evenly, and the remaining slots (2..4) are non-Ja/Nein task types.
    const firstRaw = Math.floor(r() * 2147483647);
    const present = structIndex === -1 ? (firstRaw % 2 === 0) : (structIndex === 0);
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
function genSort(r: () => number, d: number, structIndex = -1): Question {
  const ph = (arr: string[]) => pick(r, arr);
  const so = (opSeq: string, prompt: string, ans: string, expl: string, steps: number, cons: number, wml: number, dk: string) =>
    mk("praktisch", "sortierverfahren", opSeq, d, prompt, undefined, ans, expl, "Vergleiche systematisch.", 19, 4, dk, "sort", opSeq,
      { opSequence: opSeq, stepCount: steps, constraintCount: cons, distractorKind: dk, workingMemoryLoad: wml, inputModality: "sequence", answerCardinality: 1 }, false);
  const path = structIndex >= 0 ? structIndex : ri(r, 0, 15);
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
function genAlltag(r: () => number, d: number, structIndex = -1): Question {
  const ph = (arr: string[]) => pick(r, arr);
  const aw = (opSeq: string, prompt: string, optsIn: string[], expl: string, steps: number, cons: number, wml: number, dk: string) => {
    const ans = optsIn[0];
    return mk("praktisch", "alltagswissen", opSeq, d, prompt, shuffle(optsIn, r), ans,
      expl, "Überlege, was sicher und richtig ist.", 20, 4, dk, "choice", opSeq,
      { opSequence: opSeq, stepCount: steps, constraintCount: cons, distractorKind: dk, workingMemoryLoad: wml, inputModality: "choice", answerCardinality: 1 }, false);
  };
  const path = structIndex >= 0 ? structIndex : ri(r, 0, 15);
  switch (path) {
    case 0: { // emergency priority: many scenarios
      const s = pick(r, [
        ["Ein Kollege ist bewusstlos und atmet nicht.", "Erst Hilfe rufen (144), dann Erste Hilfe beginnen"],
        ["Jemand liegt mit Kopfverletzung am Boden.", "Erst Hilfe rufen, dann Stillhalten"],
        ["Eine Person verschluckt sich und wird blau.", "Sofort Heimlich-Griff, parallel Hilfe rufen"],
        ["Im Büro bricht jemand mit Brustschmerz zusammen.", "Notruf 144, ruhig lassen, nicht allein lassen"],
        ["Ein Kollege hat sich stark an der Hand geschnitten und blutet.", "Blutung stillen, dann Hilfe holen"],
        ["Jemand ist von der Leiter gestürzt und klagt über Rückenschmerz.", "Nicht bewegen, Notruf 144"],
        ["Eine Person hat eine Chemikalie ins Auge bekommen.", "Auge lange mit Wasser spülen, dann Notruf"],
        ["Ein Kollege bekommt einen Stromschlag und liegt am Boden.", "Strom abschalten, erst dann helfen"],
        ["Jemand hat sich schwer verbrannt.", "Kühlen, nicht öffnen, Notruf 144"],
        ["Eine Person wirkt verwirrt und spricht undeutlich.", "Notruf 144, Verdacht auf Schlaganfall"],
        ["Ein Kollege klemmt sich die Hand in einer Maschine ein.", "Maschine sofort stoppen, dann Hilfe rufen"],
        ["Jemand hat sich an einer Nadel gestochen.", "Wunde spülen und sofort melden"],
        ["Eine Person atmet schwer und bekommt Panik.", "Ruhig ansprechen, aufrecht setzen, Notruf"],
      ]);
      return aw("priority-sequence-emergency", s[0] + " Was ZUERST?",
        [s[1], "Weiterarbeiten und abwarten", "Die Person allein hochziehen", "Erst einen Kaffee holen"],
        "Notruf vor Selbsthilfe.", 2, 1, 3, "wrong-priority");
    }
    case 1: { // immediate danger — each row is a DIFFERENT hazard + correct first action
      const s = pick(r, [
        ["Du siehst Rauch im Lager.", "Alarm auslösen und Bereich verlassen"],
        ["Es riecht nach Gas.", "Lüften, keine Zündquellen, melden"],
        ["Du hörst lautes Zischen an einer Druckleitung.", "Abstand halten und melden"],
        ["Aus einem Gerät kommen Funken.", "Gerät spannungsfrei machen und melden"],
        ["Eine Chemikalie ist auf den Boden ausgelaufen.", "Bereich absperren und Sicherheitsblatt beachten"],
        ["Ein Kabel liegt blank im Durchgang.", "Stelle sichern und Elektriker informieren"],
        ["Wasser läuft aus einer Leitung auf den Boden.", "Rutschgefahr markieren und Haupthahn melden"],
        ["Ein Regal steht sichtbar schief und ist schwer beladen.", "Bereich sperren und niemanden darunter arbeiten lassen"],
        ["Der Notausgang ist mit Paletten zugestellt.", "Weg sofort frei machen und melden"],
        ["Eine Schutzabdeckung an der Maschine fehlt.", "Maschine nicht starten und melden"],
        ["Es hängt Brandgeruch im Treppenhaus.", "Fluchtweg nutzen und Alarm auslösen"],
        ["Ein Gabelstapler fährt mit unsicherer Last.", "Fahrer stoppen lassen und Abstand halten"],
        ["Aus einem Fass tritt Dampf aus.", "Abstand halten, nicht einatmen, melden"],
        ["Der Boden ist mit Öl verschmiert.", "Rutschstelle sichern und reinigen lassen"],
      ]);
      return aw("immediate-danger-action", s[0] + " Was tust du ZUERST?",
        [s[1], "weiterarbeiten", "Fenster schliessen und warten", "erst die Arbeit beenden"],
        "Bei Gefahr gilt: sichern, Abstand halten, melden — nicht weiterarbeiten.", 1, 1, 2, "delay-action");
    }
    case 2: { // prohibition — identify the forbidden action in a given context
      const s = pick(r, [
        ["Was ist am Arbeitsplatz verboten?", "Mit unbekanntem USB-Stick den PC nutzen"],
        ["Was darfst du NICHT tun, wenn die Brandmeldeanlage läutet?", "Den Aufzug benutzen"],
        ["Was ist im Labor verboten?", "Essen und Trinken"],
        ["Was gilt im Lager als verboten?", "Rauchen bei Lagergut"],
        ["Was ist beim Gabelstapler verboten?", "Personen auf der Gabel mitfahren lassen"],
        ["Was darfst du an einer laufenden Maschine NICHT tun?", "Schutzabdeckung entfernen"],
        ["Was ist mit dem Notausgang verboten?", "Ihn mit Material zustellen"],
        ["Was darfst du mit Firmendaten NICHT tun?", "Sie privat weiterleiten"],
        ["Was ist beim Umgang mit Chemikalien verboten?", "Sie in unbeschriftete Flaschen umfüllen"],
        ["Was darfst du bei einem Arbeitsunfall NICHT tun?", "Ihn nicht melden"],
        ["Was ist auf der Leiter verboten?", "Auf die oberste Sprosse steigen"],
        ["Was darfst du mit einem defekten Werkzeug NICHT tun?", "Es trotzdem weiterverwenden"],
        ["Was ist beim Passwort verboten?", "Es an Kollegen weitergeben"],
      ]);
      return aw("identify-prohibition", s[0],
        [s[1], "Die Schutzbrille tragen", "Pausen einhalten", "Hände waschen"],
        "Verbote schützen vor Gefahr — die erlaubten Handlungen sind die sicheren.", 1, 0, 2, "allowed-picked");
    }
    case 3: { // reporting chain — who is the correct first point of contact?
      const s = pick(r, [
        ["Wen informierst du zuerst bei einem Datenleck?", "IT-Sicherheit"],
        ["Wohin meldest du einen Arbeitsunfall?", "Vorgesetzte/SUVA"],
        ["Wen rufst du bei Verdacht auf Unterschlagung?", "Vorgesetzte/Management"],
        ["Wem meldest du einen defekten Not-Aus-Schalter?", "Vorgesetzte und Technik sofort"],
        ["Wen informierst du bei einer falsch gelieferten Sendung?", "Einkauf bzw. Lieferant"],
        ["Wem meldest du eine Beinahe-Unfall-Situation?", "Sicherheitsbeauftragte Person"],
        ["Wen kontaktierst du bei einer Kundenreklamation?", "Kundendienst bzw. Vorgesetzte"],
        ["Wem meldest du ein beschädigtes Sicherheitsschild?", "Vorgesetzte, damit es ersetzt wird"],
        ["Wen informierst du, wenn du eine Frist nicht halten kannst?", "Vorgesetzte, frühzeitig"],
        ["Wem meldest du fehlende Schutzausrüstung?", "Vorgesetzte vor Arbeitsbeginn"],
        ["Wen informierst du bei einem Stromausfall in der Halle?", "Technik bzw. Hausdienst"],
        ["Wem meldest du eine verdächtige E-Mail?", "IT-Sicherheit, ohne Anhang zu öffnen"],
        ["Wen informierst du, wenn du krank zur Arbeit nicht kommst?", "Vorgesetzte am Morgen"],
      ]);
      return aw("reporting-chain", s[0],
        [s[1], "einen Kollegen", "niemanden", "erst die Familie"],
        "Immer die zuständige Stelle zuerst — nicht informell weitergeben.", 1, 0, 2, "wrong-recipient");
    }
    case 4: { // PPE — which protective equipment is mandatory for this task?
      const s = pick(r, [
        ["Du betrittst die Werkstatt.", "Sicherheitsschuhe und Schutzbrille"],
        ["Du arbeitest mit Chemikalien.", "Handschuhe und Schutzbrille"],
        ["Du fährst Gabelstapler.", "Gurt anlegen und Schutzschuhe"],
        ["Du schleifst ein Metallteil.", "Schutzbrille und Gehörschutz"],
        ["Du arbeitest an einer lauten Maschine.", "Gehörschutz"],
        ["Du hebst schwere Kisten.", "Sicherheitsschuhe und rückenschonende Technik"],
        ["Du reinigst mit Reinigungsmittel.", "Schutzhandschuhe"],
        ["Du arbeitest auf einer Leiter.", "festes Schuhwerk und gesicherte Leiter"],
        ["Du schweisst ein Werkstück.", "Schweisserschirm und Schutzkleidung"],
        ["Du hantierst mit heissem Material.", "hitzefeste Handschuhe"],
        ["Du arbeitest im Aussenbereich im Verkehr.", "Warnweste"],
        ["Du schneidest mit dem Cutter zu.", "Schnittschutzhandschuhe"],
        ["Du arbeitest bei Staubentwicklung.", "Staubmaske und Schutzbrille"],
      ]);
      return aw("personal-protective-equipment", s[0] + " Was ist dabei VORGESCHRIEBEN?",
        [s[1], "Kopfhörer mit Musik", "kurze Ärmel für Bewegungsfreiheit", "eine Uhr"],
        "Schutzausrüstung richtet sich nach der Gefährdung der Tätigkeit, nicht nach Bequemlichkeit.", 1, 0, 2, "comfort-first");
    }
    case 5: { // hygiene when handling food — one correct hygienic action per case
      const s = pick(r, [
        ["Du beginnst mit der Lebensmittelarbeit.", "Hände waschen und desinfizieren"],
        ["Du wechselst von rohem Fleisch zu Salat.", "Brett und Messer vorher wechseln"],
        ["Ein Lebensmittel ist über dem Datum.", "Nicht verwenden und entsorgen"],
        ["Die Kühlkette war zu lange unterbrochen.", "Ware nicht mehr verwenden"],
        ["Du hast eine Wunde am Finger.", "Wasserfestes Pflaster und Handschuh"],
        ["Du bist erkältet und arbeitest mit Essen.", "Vorgesetzte informieren, Hygieneregeln beachten"],
        ["Der Arbeitstisch war mit rohem Ei in Kontakt.", "Fläche reinigen und desinfizieren"],
        ["Du trägst Schmuck an den Händen.", "Schmuck vor der Arbeit ablegen"],
        ["Ein Produkt riecht ungewöhnlich.", "Nicht verwenden und melden"],
        ["Du hast eben den Abfall angefasst.", "Hände waschen vor der Weiterarbeit"],
        ["In der Küche fällt rohes Hühnerfleisch auf den Boden.", "entsorgen — nicht weiterverarbeiten"],
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
        ["Du willst im Zug ein längeres Telefonat führen.", "Leise sprechen oder Bereich wechseln"],
        ["Dein Rucksack blockiert den Gang.", "Rucksack abnehmen und eng halten"],
        ["Die Türen schliessen gerade.", "Warten, nicht dazwischen greifen"],
        ["Du möchtest im Bus Musik hören.", "Kopfhörer benutzen"],
        ["Beim Halt drängen Leute herein, du willst aussteigen.", "Erst aussteigen lassen"],
        ["Du merkst, dass du kein gültiges Ticket hast.", "Beim Kontrollpersonal selbst melden"],
        ["Ein Kinderwagen braucht Platz an der Tür.", "Platz machen und helfen"],
        ["Dein Gepäck liegt auf einem Sitz und Leute stehen.", "Gepäck wegnehmen, Platz freigeben"],
        ["Du hast starken Husten im vollen Wagen.", "Abstand halten und in den Ellbogen husten"],
        ["Du sitzt auf dem Behindertenplatz, jemand braucht ihn.", "Platz sofort freigeben"],
        ["Du willst aussteigen, der Gang ist blockiert.", "Freundlich um Durchlass bitten"],
      ]);
      return aw("public-transport-etiquette", s[0] + " Was ist angemessen?",
        [s[1], "wegschauen", "laut telefonieren", "sich weiter in die Ecke drücken"],
        "Rücksichtnahme im ÖV.", 1, 0, 2, "avoidance");
    }
    case 7: { // formal writing
      const s = pick(r, [
        ["Du schreibst an einen unbekannten Behördenkontakt.", "Sehr geehrte Damen und Herren"],
        ["Du kennst den Namen der Empfängerin.", "Sehr geehrte Frau Meier"],
        ["Du beendest eine formelle Mail.", "Freundliche Grüsse"],
        ["Du hängst ein Dokument an.", "Im Text auf den Anhang hinweisen"],
        ["Die Mail betrifft eine Reklamation.", "Sachlich bleiben und Fakten nennen"],
        ["Du brauchst eine Antwort bis Freitag.", "Frist höflich und klar nennen"],
        ["Der Betreff fehlt noch.", "Kurzen, konkreten Betreff setzen"],
        ["Du schreibst an mehrere externe Firmen gleichzeitig.", "Adressen ins BCC setzen"],
        ["Du hast einen Fehler in der gesendeten Mail entdeckt.", "Kurze Korrektur-Mail nachsenden"],
        ["Du antwortest auf eine lange Mail-Kette.", "Nur nötige Empfänger behalten"],
        ["Die Mail enthält vertrauliche Kundendaten.", "Verschlüsselt senden oder Link mit Zugriff"],
        ["Du bist im Urlaub nicht erreichbar.", "Abwesenheitsnotiz mit Vertretung setzen"],
      ]);
      return aw("mail-formal-writing", s[0] + " Was ist richtig?",
        [s[1], "Hey!", "Na, wie geht's?", "Was geht?"],
        "Formelle Anrede wählen.", 1, 0, 2, "informal-register");
    }
    case 8: { // change counting (computed)
      const price = (ri(r, 5, 48) + 0.5).toFixed(2); const paid = ri(r, 1, 4) * 10;
      const back = (paid - parseFloat(price)).toFixed(2);
      return aw("money-change-counting",
        `Ein Artikel kostet CHF ${price}, du zahlst mit CHF ${paid}.–. Wie viel Rückgeld?`,
        // 4 plausible distractors, all POSITIVE amounts. The old third option was
        // (price - paid), i.e. always negative — an implausible price that let the
        // student eliminate it for free (stratified audit item #98).
        [`CHF ${back}`,
         `CHF ${(paid - parseFloat(price) + 1).toFixed(2)}`,
         `CHF ${Math.max(0.05, paid - parseFloat(price) - 1).toFixed(2)}`,
         `CHF ${Math.max(0.05, paid - parseFloat(price) - 0.1).toFixed(2)}`],
        `${paid} − ${price} = ${back}.`, 2, 0, 2, "subtraction-slip");
    }
    case 9: { // rescheduling
      const s = pick(r, [
        ["Du kannst deinen Termin nicht wahrnehmen.", "frühzeitig absagen und neuen Termin vereinbaren"],
        ["Du bist krank und zur Prüfung angemeldet.", "rechtzeitig abmelden und verschieben"],
        ["Du merkst am Morgen, dass du 30 Minuten zu spät kommst.", "sofort anrufen und Bescheid geben"],
        ["Zwei Termine überschneiden sich.", "einen Termin frühzeitig verschieben"],
        ["Der Zug fällt aus und du verpasst den Termin.", "unterwegs anrufen und informieren"],
        ["Du brauchst Unterlagen, die noch fehlen.", "Termin verschieben und Unterlagen nachreichen"],
        ["Der Kunde sagt kurzfristig ab.", "neuen Termin anbieten und notieren"],
        ["Du hast den Termin schlicht vergessen.", "sofort melden, entschuldigen, neu vereinbaren"],
        ["Ein wichtigerer Notfall kommt dazwischen.", "Termin absagen und Grund nennen"],
        ["Du willst den Termin nur um eine Stunde schieben.", "früh anfragen, ob es möglich ist"],
        ["Die Einladung nennt keinen Ort.", "vor dem Termin nachfragen"],
        ["Du bist unsicher, ob der Termin noch gilt.", "kurz vorher bestätigen lassen"],
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
        ["Wohin gehört eine Altbatterie?", "zur Sammelstelle/Batteriebox"],
        ["Wohin gehört ein defektes Elektrogerät?", "zur Elektro-Rücknahmestelle"],
        ["Wohin gehört ein Kartonstapel?", "ins Kartonsammeln"],
        ["Wohin gehört eine Alu-Dose?", "in die Alu-Sammlung"],
        ["Wohin gehört eine leere Farbdose mit Resten?", "zur Sondermüll-Sammelstelle"],
        ["Wohin gehören Rüstabfälle aus der Küche?", "in die Biosammlung"],
        ["Wohin gehört eine kaputte Leuchtstoffröhre?", "zur Sonderentsorgung"],
        ["Wohin gehört ein benutztes Papiertaschentuch?", "in den Kehricht"],
        ["Wohin gehört Altöl aus der Werkstatt?", "in den Altöl-Behälter"],
        ["Wohin gehört eine Plastikfolie von der Palette?", "in die Folien-Sammlung"],
        ["Wohin gehört ein leerer Toner-Cartridge?", "zur Rücknahme beim Lieferanten"],
      ]);
      return aw("waste-separation", s[0],
        [s[1], "in den Kehricht", "in das Aluglas-Recycling", "in die Biotonne"],
        "Abfalltrennung korrekt zuordnen.", 1, 0, 2, "wrong-stream");
    }
    case 11: { // evacuation — distinct alarm situations, each with one correct route rule
      // ("evacuieren" was a spelling defect found in the 30-sample read -> "evakuieren")
      const s = pick(r, [
        ["Der Feueralarm ertönt.", "markierter Fluchtweg, Lift NICHT benutzen"],
        ["Es gibt Brandgeruch im Stockwerk.", "über die Treppe evakuieren"],
        ["Der nächste Fluchtweg ist verraucht.", "zweiten markierten Fluchtweg nehmen"],
        ["Die Fluchttür ist blockiert.", "Alternativweg nutzen und Blockade melden"],
        ["Du bist mit einem Besucher im Gebäude.", "Besucher mitnehmen und zum Sammelplatz führen"],
        ["Du hörst den Alarm im Untergeschoss.", "nach oben ins Freie über die Treppe"],
        ["Nach dem Verlassen fehlt eine Kollegin.", "am Sammelplatz melden, nicht zurückgehen"],
        ["Der Alarm geht während einer Maschinenarbeit los.", "Maschine sicher stoppen, dann Fluchtweg"],
        ["Du bist im Lift, als der Alarm ertönt.", "im nächsten Stock aussteigen und Treppe nehmen"],
        ["Du willst noch die Jacke aus dem Büro holen.", "nichts holen, sofort hinausgehen"],
        ["Rauch zieht dem Boden entlang.", "tief halten und zügig zum Ausgang"],
        ["Am Sammelplatz willst du wieder ins Haus.", "erst nach Freigabe der Einsatzkräfte"],
      ]);
      return aw("fire-evacuation-route", s[0] + " Welcher Weg ist richtig?",
        [s[1], "mit dem Lift nach unten", "im Raum bleiben und warten", "durch das Fenster klettern"],
        "Markierter Fluchtweg, kein Lift, zum Sammelplatz — und nichts zurückholen.", 1, 1, 2, "elevator-in-fire");
    }
    case 12: { // first aid for minor injuries — one correct immediate measure
      const s = pick(r, [
        ["Du schneidest dir leicht in den Finger.", "Wunde reinigen und verbinden"],
        ["Ein Splitter steckt oberflächlich in der Haut.", "Mit desinfizierter Pinzette entfernen"],
        ["Du hast eine Schürfwunde am Knie.", "Reinigen, desinfizieren, abdecken"],
        ["Deine Nase blutet.", "Vorbeugen und Nasenflügel drücken"],
        ["Du hast dir den Knöchel verstaucht.", "Kühlen und hochlagern"],
        ["Etwas Staub ist ins Auge geraten.", "Mit klarem Wasser ausspülen"],
        ["Du hast eine kleine Brandblase.", "Kühlen und nicht aufstechen"],
        ["Eine Wunde ist stark verschmutzt.", "Spülen und Wundversorgung holen"],
        ["Du hast dir den Finger geklemmt.", "Kühlen und Beweglichkeit prüfen"],
        ["Ein Insektenstich schwillt leicht an.", "Kühlen und beobachten"],
        ["Du schneidest dir leicht in den Finger.", "Wunde reinigen und verbinden"],
        ["Du verbrennst dich an heissem Wasser.", "kühlen und abdecken"],
        ["Du stolperst und knickst um.", "kühlen und hochlagern"],
      ]);
      return aw("first-aid-minor-cut", s[0] + " Was machst du zuerst?",
        [s[1], "weiterarbeiten ohne Verbindung", "Hand in heisses Wasser halten", "draufhauen"],
        "Standard-Erste-Hilfe.", 1, 0, 2, "neglect");
    }
    case 13: { // access control / social engineering — each row a distinct pressure tactic
      const s = pick(r, [
        ["Eine unbekannte Person bittet um Einlass ins Lager „nur kurz schauen“.", "höflich ablehnen und Vorgesetzte informieren"],
        ["Jemand gibt sich am Telefon als IT-Support aus und will das Passwort.", "ablehnen, echte IT selbst anrufen"],
        ["Ein Fremder folgt dir dicht durch die Badge-Tür.", "Tür nicht offen halten und Empfang informieren"],
        ["Eine Person ohne Badge sagt, sie sei neu und habe ihn vergessen.", "zum Empfang begleiten statt selbst hineinlassen"],
        ["Am Telefon fordert jemand dringend Kundendaten per Mail.", "keine Daten senden, Rückruf über offizielle Nummer"],
        ["Ein „Techniker“ ohne Termin will in den Serverraum.", "Auftrag prüfen lassen, Zutritt verweigern"],
        ["Du findest einen fremden USB-Stick im Eingang.", "nicht einstecken, bei der IT abgeben"],
        ["Eine Mail bittet um sofortige Zahlung mit geänderter Kontonummer.", "Zahlung stoppen und telefonisch verifizieren"],
        ["Jemand fotografiert im Lager ohne Erlaubnis.", "ansprechen und Vorgesetzte informieren"],
        ["Ein Anrufer verlangt unter Zeitdruck deine Zugangsdaten.", "Zugangsdaten nie weitergeben, Vorfall melden"],
        ["Eine Person will ein Paket ohne Abgabeschein mitnehmen.", "Herausgabe verweigern und Beleg verlangen"],
        ["Ein Besucher läuft unbegleitet in die Werkstatt.", "begleiten und Besucherregel durchsetzen"],
      ]);
      return aw("stranger-at-door", s[0] + " Richtig:",
        [s[1], "mitnehmen, ist ja nur kurz", "allein durch das Lager laufen lassen", "das Passwort geben"],
        "Zutrittskontrolle und Rückfrage über offizielle Wege — Zeitdruck ist kein Grund für Ausnahmen.", 1, 1, 2, "compliance-pressure");
    }
    case 14: { // account and password hygiene — one correct secure practice
      const s = pick(r, [
        ["Du brauchst ein neues Arbeitspasswort.", "Lang, einmalig, nicht wiederverwendet"],
        ["Ein Kollege bittet um dein Passwort für eine Datei.", "Nicht weitergeben, Zugriff sauber freigeben"],
        ["Du arbeitest kurz am gemeinsamen PC und gehst weg.", "Bildschirm sperren"],
        ["Du willst dir viele Passwörter merken.", "Passwortmanager verwenden"],
        ["Ein Dienst bietet Zwei-Faktor-Authentifizierung an.", "Aktivieren"],
        ["Du hast dasselbe Passwort privat und geschäftlich.", "Unterschiedliche Passwörter verwenden"],
        ["Du vermutest, dein Passwort ist bekannt geworden.", "Sofort ändern und IT melden"],
        ["Du willst das Passwort notieren.", "Nicht offen notieren, Manager nutzen"],
        ["Eine Mail verlangt Login über einen Link.", "Link nicht nutzen, Seite selbst aufrufen"],
        ["Du richtest ein Konto für eine neue Kollegin ein.", "Eigenes Konto, kein geteiltes Login"],
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
        ["Bei Glatteis auf dem Arbeitsweg.", "Schuhe mit gutem Profil und mehr Zeit"],
        ["Du arbeitest früh morgens im Dunkeln draussen.", "Warnweste und Licht"],
        ["Bei Nebel auf dem Aussenplatz.", "gut sichtbare, helle Kleidung"],
        ["Der Hallenboden ist nass.", "rutschfeste Schuhe"],
        ["Bei Hitze und körperlicher Arbeit.", "regelmässig trinken und Pausen"],
        ["Ein Gewitter zieht auf, du bist im Freien.", "Arbeit unterbrechen und Schutz suchen"],
        ["Bei starkem Wind auf dem Gerüst.", "Arbeit einstellen und sichern"],
        ["Bei starker Sonne am Mittag draussen.", "Sonnenschutz und Kopfbedeckung"],
        ["Bei Dauerregen im Aussenlager.", "wasserdichte Kleidung und Ware abdecken"],
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
export const GENERATORS: Record<string, ((r: () => number, d: number, structIndex: number) => Question)[]> = {
  // Each entry is ONE authored struct. Length == authoredU (introspectable; floors computable).
  textaufgaben: [
    (r, d) => genPercent(r, d),
    (r, d) => genMoney(r, d),
    (r, d) => genWord(r, d),
    (r, d) => genTwoStep(r, d),
    (r, d) => genUnitPrice(r, d),
    (r, d) => genFrac(r, d),
  ],
  kopfrechnen: Array.from({ length: 52 }, (_, k) => (r: () => number, d: number, si: number) => genMentalTrain(r, d, k >= 0 ? k : si)),
  satzbau: Array.from({ length: 52 }, (_, k) => (r: () => number, d: number, si: number) => genSatzbau(r, d, k >= 0 ? k : si)),
  textverstaendnis: Array.from({ length: 14 }, (_, k) => (r: () => number, d: number, si: number) => genTextverst(r, d, k >= 0 ? k : si)),
  prozesslogik: Array.from({ length: 22 }, (_, k) => (r: () => number, d: number, si: number) => genProzess(r, d, k >= 0 ? k : si)),
  wortgruppen: Array.from({ length: 18 }, (_, k) => (r: () => number, d: number, si: number) => genWortgruppen(r, d, k >= 0 ? k : si)),
  bilder_zaehlen: Array.from({ length: 4 }, (_, k) => (r: () => number, d: number, si: number) => genBilderZaehlenVariant(r, d, k >= 0 ? k : si)),
  symbole_entdecken: Array.from({ length: 4 }, (_, k) => (r: () => number, d: number, si: number) => genSymbole(r, d, k >= 0 ? k : si)),
  schilder_erinnern: [
    (r, d) => genSchilder(r, d, 0),   // recall-present
    (r, d) => genSchilder(r, d, 1),   // recall-absent
    (r, d) => genSchilderCount(r, d),
    (r, d) => genSchilderCategory(r, d),
    (r, d) => genSchilderCompare(r, d),
  ],
  sortierverfahren: Array.from({ length: 16 }, (_, k) => (r: () => number, d: number, si: number) => genSort(r, d, k >= 0 ? k : si)),
  alltagswissen: Array.from({ length: 16 }, (_, k) => (r: () => number, d: number, si: number) => genAlltag(r, d, k >= 0 ? k : si)),
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
export function generate(subskillId: string, difficulty: number, seed = Date.now(), structIndex = -1): Question | null {
  const gs = GENERATORS[subskillId];
  if (!gs || !gs.length) return null;
  const dclamped = Math.max(12, Math.min(95, difficulty));
  // structIndex >= 0 => deterministic struct (composer-driven round-robin);
  // the seed still drives ALL surface parameterization inside that struct.
  const legacy = structIndex < 0;
  const gi = legacy ? seedIndex(seed, gs.length) : ((structIndex % gs.length) + gs.length) % gs.length;
  const r = rng(seed);
  const g = gs[gi];
  // difficulty is a continuous 0..100 target (coach ability). Generators use it continuously.
  const q = g(r, dclamped, legacy ? -1 : gi);
  if (!hasUniqueOptions(q)) {
    // regenerate once with a perturbed seed to avoid duplicate options (P0 guard)
    const q2 = g(rng(seed + 7919), dclamped, legacy ? -1 : gi);
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
  // Duplicate rejection with bounded retry. Previously this loop pushed whatever
  // generate() returned, so at >=6x session load identical items appeared purely by
  // collision once the struct pool saturated (measured: 1 exact dup at 6x, 2 at 10x,
  // 11 near-dups at 10x). We now reject exact repeats AND prefer an unused struct
  // signature, with a hard attempt ceiling so the loop can never spin forever.
  const seenExact = new Set<string>();
  const seenSig = new Set<string>();
  const maxAttempts = Math.max(n * 12, 240);
  let attempts = 0;
  let rejectedExact = 0;
  while (out.length < n && attempts < maxAttempts) {
    const i = attempts++;
    const q = generate(subskillId, difficulty, baseSeed + i * 7919 + Math.floor(rng(baseSeed + i)() * 1e6));
    if (!q) continue;
    const key = q.prompt + "|" + String(q.answer);
    if (seenExact.has(key)) { rejectedExact++; continue; }
    const sig = q.structSig?.opSequence || "?";
    // While unused signatures remain, skip a signature we already served — this
    // spreads coverage across grammar families instead of hammering a few.
    if (seenSig.has(sig) && seenSig.size < countStructs(subskillId) && out.length < n - 1 && attempts < maxAttempts - n) continue;
    seenExact.add(key);
    seenSig.add(sig);
    out.push(q);
  }
  // Fallback: if the pool genuinely cannot fill n unique items, top up rather than
  // returning short — but STILL prefer unseen items, and only allow a repeat once the
  // unique space is truly drained. Without this check small pools (bilder_zaehlen /
  // symbole_entdecken: true ceiling 86) emitted up to 14 duplicates for n=80 while
  // unique items were still reachable.
  let topUp = 0;
  // Budget scales with how hard the tail is: draining the last few items of a small
  // pool needs many attempts because most seeds land on already-served items.
  const topUpBudget = Math.max(n * 200, 4000);
  while (out.length < n && topUp < topUpBudget) {
    const q = generate(subskillId, difficulty, baseSeed + (attempts + topUp) * 104729 + 17);
    topUp++;
    if (!q) continue;
    const key = q.prompt + "|" + String(q.answer);
    if (seenExact.has(key)) continue;
    seenExact.add(key);
    out.push(q);
  }
  // Only now, with the unique space drained, accept repeats to satisfy the count.
  let filler = 0;
  while (out.length < n && filler < n * 4) {
    const q = generate(subskillId, difficulty, baseSeed + (attempts + topUp + filler) * 15485863 + 29);
    filler++;
    if (q) out.push(q);
  }
  return out;
}
function countStructs(subskillId: string): number {
  const g = (GENERATORS as any)[subskillId];
  return Array.isArray(g) ? g.length : 1;
}
