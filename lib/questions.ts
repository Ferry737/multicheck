// lib/questions.ts
// Deterministic question engine. Math answers are COMPUTED, never guessed.
// Each question: { id, skill, subject, difficulty(1-5), prompt, options?, correct,
//   explanation, hint, estimatedTime, examRelevance, commonErrors, kind }

export type QKind = "multiple-choice" | "numeric" | "text";

export interface Question {
  id: string;
  skill: string;
  subject: string;
  difficulty: number; // 1=easy .. 5=hard
  kind: QKind;
  prompt: string;
  options?: string[]; // for multiple-choice
  answer: string; // correct answer string
  explanation: string;
  hint: string;
  estimatedTime: number; // seconds
  examRelevance: number; // 1..5
  commonErrors: string;
}

// ---- seeded RNG so a session is reproducible if needed ----
function rng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function randInt(min: number, max: number, r: () => number) {
  return Math.floor(r() * (max - min + 1)) + min;
}

function shuffle<T>(arr: T[], r: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------- MATH GENERATORS ----------------
function genAdd(r: () => number, diff: number): Question {
  const max = diff <= 2 ? 20 : diff <= 3 ? 100 : 1000;
  const a = randInt(1, max, r), b = randInt(1, max, r);
  const ans = a + b;
  return {
    id: `add-${a}-${b}`, skill: "add", subject: "math", difficulty: diff, kind: "numeric",
    prompt: `Rechne: ${a} + ${b} = ?`, answer: String(ans),
    explanation: `${a} + ${b} = ${ans}.`,
    hint: "Zähle vom ersten Zahlenwert weiter.", estimatedTime: diff <= 2 ? 8 : 20, examRelevance: 3,
    commonErrors: "Zehner überspringen bei Übergang (z.B. 48+7).",
  };
}

function genSub(r: () => number, diff: number): Question {
  const max = diff <= 2 ? 20 : diff <= 3 ? 100 : 1000;
  let a = randInt(1, max, r), b = randInt(1, max, r);
  if (b > a) [a, b] = [b, a];
  const ans = a - b;
  return {
    id: `sub-${a}-${b}`, skill: "sub", subject: "math", difficulty: diff, kind: "numeric",
    prompt: `Rechne: ${a} − ${b} = ?`, answer: String(ans),
    explanation: `${a} − ${b} = ${ans}.`,
    hint: "Wenn nötig, leihe von der nächsten Zehnerstelle.", estimatedTime: diff <= 2 ? 9 : 22, examRelevance: 3,
    commonErrors: "Zehner borgen falsch anwenden.",
  };
}

function genMul(r: () => number, diff: number): Question {
  // band 1: small facts; higher: larger
  const small = [2, 3, 4, 5, 6, 7, 8, 9, 10];
  const a = small[randInt(0, small.length - 1, r)];
  const b = diff <= 2 ? small[randInt(0, 5, r)] : small[randInt(0, small.length - 1, r)];
  const ans = a * b;
  return {
    id: `mul-${a}-${b}`, skill: "mul", subject: "math", difficulty: diff, kind: "numeric",
    prompt: `Rechne: ${a} × ${b} = ?`, answer: String(ans),
    explanation: `${a} × ${b} = ${ans}. Tipp: ${b} mal ${a} ist dasselbe.`,
    hint: "Nutze das Einmaleins. Bei 7×8: 7×10=70, minus 2×7=14 → 56.", estimatedTime: diff <= 2 ? 12 : 18, examRelevance: 4,
    commonErrors: "Einmaleins-Fakten (bes. 6,7,8) vergessen.",
  };
}

function genDiv(r: () => number, diff: number): Question {
  const b = diff <= 2 ? randInt(2, 9, r) : randInt(2, 12, r);
  const ans = randInt(2, diff <= 2 ? 9 : 12, r);
  const a = b * ans;
  return {
    id: `div-${a}-${b}`, skill: "div", subject: "math", difficulty: diff, kind: "numeric",
    prompt: `Rechne: ${a} ÷ ${b} = ?`, answer: String(ans),
    explanation: `${a} ÷ ${b} = ${ans}, weil ${b} × ${ans} = ${a}.`,
    hint: "Denke: welche Zahl mal " + b + " ergibt " + a + "?", estimatedTime: diff <= 2 ? 12 : 20, examRelevance: 4,
    commonErrors: "Division mit Rest verwechseln; falscher Faktor.",
  };
}

function genPct(r: () => number, diff: number): Question {
  // ASSUMED exam-relevant: percentage of a number, common values
  const base = diff <= 2 ? randInt(2, 20, r) * 10 : randInt(10, 200, r);
  const pct = shuffle([10, 20, 25, 30, 40, 50, 75], r)[0];
  const ans = (base * pct) / 100;
  const ansStr = Number.isInteger(ans) ? String(ans) : ans.toFixed(1);
  const mc = shuffle([
    ansStr,
    String((base * (pct + 10)) / 100),
    String((base * (pct - 10)) / 100),
  ], r).map(String);
  return {
    id: `pct-${base}-${pct}`, skill: "pct", subject: "math", difficulty: diff, kind: "multiple-choice",
    prompt: `Wie viel sind ${pct}% von ${base}?`, options: mc, answer: ansStr,
    explanation: `${pct}% von ${base} = ${base} × ${pct}/100 = ${ansStr}.`,
    hint: "10% sind " + base / 10 + ". Baue davon auf.", estimatedTime: diff <= 2 ? 18 : 28, examRelevance: 5,
    commonErrors: "Komma falsch setzen; Prozent und Bruch verwechseln.",
  };
}

function genFrac(r: () => number, diff: number): Question {
  if (diff <= 2) {
    const a = randInt(1, 3, r), b = randInt(2, 4, r);
    return {
      id: `frac-${a}-${b}`, skill: "frac", subject: "math", difficulty: diff, kind: "numeric",
      prompt: `Welcher Bruch entspricht ${a}/${b}? (schreibe als Bruch, z.B. 1/2)`, answer: `${a}/${b}`,
      explanation: `Der Bruch ist ${a} von ${b} gleichen Teilen.`,
      hint: "Zähler / Nenner.", estimatedTime: 12, examRelevance: 4,
      commonErrors: "Zähler und Nenner vertauschen.",
    };
  }
  // add fractions same denominator
  const d = shuffle([2, 3, 4, 5, 10], r)[0];
  const a = randInt(1, d - 1, r), b = randInt(1, d - 1, r);
  const num = a + b;
  return {
    id: `frac-add-${a}-${b}-${d}`, skill: "frac", subject: "math", difficulty: diff, kind: "numeric",
    prompt: `Addiere: ${a}/${d} + ${b}/${d} = ? (als Bruch)`, answer: num > d ? `${Math.floor(num / d)} ${num % d}/${d}` : `${num}/${d}`,
    explanation: `Gleicher Nenner ${d}: ${a}+${b}=${num}.`,
    hint: "Nur Zähler addieren, Nenner bleibt.", estimatedTime: 22, examRelevance: 4,
    commonErrors: "Auch Nenner addieren.",
  };
}

function genDec(r: () => number, diff: number): Question {
  const a = randInt(1, 9, r) + r() * 0.9;
  const b = randInt(1, 9, r) + r() * 0.9;
  const ans = Math.round((a + b) * 100) / 100;
  return {
    id: `dec-${a.toFixed(1)}-${b.toFixed(1)}`, skill: "dec", subject: "math", difficulty: diff, kind: "numeric",
    prompt: `Rechne: ${a.toFixed(1)} + ${b.toFixed(1)} = ?`, answer: ans.toFixed(1),
    explanation: `Kommastellen untereinander, dann addieren: ${ans.toFixed(1)}.`,
    hint: "Komma gerade untereinander schreiben.", estimatedTime: 18, examRelevance: 4,
    commonErrors: "Komma falsch ausrichten.",
  };
}

// ---------------- GERMAN GENERATORS (assumed) ----------------
const DE_VOCAB: [string, string][] = [
  ["die Rechnung", "the bill / calculation"],
  ["der Betrag", "the amount"],
  ["die Lieferung", "the delivery"],
  ["der Kunde", "the customer"],
  ["die Ware", "the goods"],
  ["die Bestellung", "the order"],
];
function genDeVocab(r: () => number, diff: number): Question {
  const [de, en] = DE_VOCAB[randInt(0, DE_VOCAB.length - 1, r)];
  const others = shuffle(DE_VOCAB.filter((x) => x[0] !== de).map((x) => x[0]), r).slice(0, 3);
  const opts = shuffle([de, ...others], r);
  const targetEn = EN_DE.find((x) => x[0] === en)?.[1] ?? "";
  return {
    id: `de-vocab-${de}`, skill: "de-vocab", subject: "german", difficulty: diff, kind: "multiple-choice",
    prompt: `Wähle die richtige Bedeutung: "${de}"`, options: opts, answer: de,
    explanation: `"${de}" doesn't apply; correct mapping: ${de} = ${en}.`,
    hint: "Denke an den Kontext Geschäft/Administration.", estimatedTime: 14, examRelevance: 4,
    commonErrors: "Wörter mit ähnlichem Klang verwechseln.",
  };
}
const EN_DE: [string, string][] = DE_VOCAB.map(([d, e]) => [e, d]);

// ---------------- LOGIC GENERATORS ----------------
function genSeq(r: () => number, diff: number): Question {
  const step = randInt(2, diff <= 2 ? 4 : 9, r);
  const start = randInt(1, 10, r);
  const seq = [start, start + step, start + 2 * step, start + 3 * step];
  const next = start + 4 * step;
  const opts = shuffle([next, next + step, next - step, next + 1], r).map(String);
  return {
    id: `seq-${seq.join("-")}`, skill: "log-seq", subject: "logic", difficulty: diff, kind: "multiple-choice",
    prompt: `Reihe fortsetzen: ${seq.join(", ")}, ?`, options: opts, answer: String(next),
    explanation: `Jede Zahl steigt um ${step}. Nächste: ${next}.`,
    hint: "Differenz zwischen zwei Zahlen finden.", estimatedTime: 14, examRelevance: 3,
    commonErrors: "Falschen Abstand annehmen.",
  };
}

// ---------------- DISPATCH ----------------
const GENERATORS: Record<string, (r: () => number, d: number) => Question> = {
  add: genAdd, sub: genSub, mul: genMul, div: genDiv, pct: genPct, frac: genFrac,
  dec: genDec, "de-vocab": genDeVocab, "log-seq": genSeq,
};

export function generateForSkill(skillId: string, difficulty: number, seed = Date.now()): Question | null {
  const g = GENERATORS[skillId];
  if (!g) return null;
  return g(rng(seed), Math.max(1, Math.min(5, difficulty)));
}

// Generate a small batch (variants) for a skill.
export function generateBatch(skillId: string, difficulty: number, n = 6, baseSeed = Date.now()): Question[] {
  const out: Question[] = [];
  for (let i = 0; i < n; i++) {
    const q = generateForSkill(skillId, difficulty, baseSeed + i * 7919);
    if (q) out.push(q);
  }
  return out;
}
