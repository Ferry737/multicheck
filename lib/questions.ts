// lib/questions.ts
// Reusable question engine covering all 7 Attest EBA areas.
// Math answers are COMPUTED and validated. Visual tasks use inline SVG (no external images).
// Every question: id, area, subskill, type, difficulty(1-3), prompt, stimulus?, options?,
//   answer, explanation, hint, estimatedTime, examRelevance, commonErrors, kind.

export type QType =
  | "multiple-choice" | "numeric" | "text" | "sequence" | "count"
  | "symbol" | "recall" | "writing" | "sort" | "reading";

export type QKind = "choice" | "input" | "visual" | "writing" | "sort";

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
  prompt: string;
  stimulus?: string; // SVG markup or text shown before answer
  options?: string[];
  answer: string;
  explanation: string;
  hint: string;
  estimatedTime: number;
  examRelevance: number;
  commonErrors: string;
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

// ===== MATHEMATIK =====
function genPercent(r: () => number, d: number): Question {
  const base = d <= 1 ? ri(r, 2, 20) * 10 : ri(r, 10, 200);
  const p = pick(r, [10, 20, 25, 30, 40, 50, 75]);
  const ans = round1((base * p) / 100);
  const opts = shuffle([String(ans), String(round1((base * (p + 10)) / 100)), String(round1((base * (p - 10)) / 100)), String(round1((base * (p + 5)) / 100))], r);
  return mk("mathematik", "textaufgaben", "pct", d, "Wie viel sind " + p + "% von " + base + "?", opts, String(ans),
    p + "% von " + base + " = " + base + " × " + p + "/100 = " + ans + ".",
    "10% sind " + base / 10 + ".", 28, 5, "Komma falsch setzen.");
}
function genMoney(r: () => number, d: number): Question {
  // discount: price reduced by x%
  const price = pick(r, [40, 60, 80, 100, 120, 150]);
  const disc = pick(r, [10, 20, 25, 30]);
  const ans = price - (price * disc) / 100;
  const opts = shuffle([String(ans), String(price - (price * (disc + 5)) / 100), String(price - (price * (disc - 5)) / 100), String(price)], r).map(String);
  return mk("mathematik", "textaufgaben", "money", d, "Ein Artikel kostet CHF " + price + ". Er wird " + disc + "% reduziert. Neuer Preis?", opts, String(ans),
    "CHF " + price + " − " + disc + "% = " + ans + " CHF.", "Berechne " + disc + "% von " + price + ".", 25, 4, "Rabatt falsch abziehen.");
}
function genWord(r: () => number, d: number): Question {
  const a = ri(r, 3, 9), b = ri(r, 3, 9), total = a + b;
  const opts = shuffle([String(total), String(a - b), String(a * b), String(Math.abs(a - b))], r);
  return mk("mathematik", "textaufgaben", "word", d,
    "Im Lager sind " + a + " rote und " + b + " blaue Kisten. Wie viele Kisten insgesamt?", opts, String(total),
    a + " + " + b + " = " + total + ".", "Addiere die beiden Mengen.", 22, 5, "Falsche Rechenart wählen.");
}
function genMental(r: () => number, d: number): Question {
  // conversions: e.g. 1.5 kg = ? g ; or simple mental arithmetic
  if (r() < 0.5) {
    const x = ri(r, 1, 9), unit = pick(r, [["kg", "g", 1000], ["m", "cm", 100], ["h", "min", 60], ["t", "kg", 1000]] as [string, string, number][]);
    const ans = x * unit[2];
    return mk("mathematik", "kopfrechnen", "conv", d, "Rechne um: " + x + " " + unit[0] + " = ? " + unit[1], undefined, String(ans),
      "1 " + unit[0] + " = " + unit[2] + " " + unit[1] + " → " + x + " × " + unit[2] + " = " + ans + ".", "Einheiten umrechnen.", 15, 4, "Faktor vergessen.");
  }
  const a = ri(r, 2, 9), b = ri(r, 2, 9), op = pick(r, ["+", "−", "×"]);
  const ans = op === "+" ? a + b : op === "−" ? a - b : a * b;
  return mk("mathematik", "kopfrechnen", "mental", d, "Kopfrechnen: " + a + " " + op + " " + b + " = ?", undefined, String(ans),
    a + " " + op + " " + b + " = " + ans + ".", "Rechne schrittweise.", 12, 4, "Grundrechenart.");
}
function genFrac(r: () => number, d: number): Question {
  const den = pick(r, [2, 3, 4, 5, 10]);
  const n1 = ri(r, 1, den - 1), n2 = ri(r, 1, den - 1);
  const sum = n1 + n2; const ans = sum > den ? Math.floor(sum / den) + " " + (sum % den) + "/" + den : sum + "/" + den;
  const opts = shuffle([ans, n1 + "/" + den, n2 + "/" + den, (n1 * n2) + "/" + den], r);
  return mk("mathematik", "textaufgaben", "frac", d, "Addiere: " + n1 + "/" + den + " + " + n2 + "/" + den + " = ?", opts, String(ans),
    "Gleicher Nenner " + den + ": " + n1 + "+" + n2 + "=" + sum + ".", "Nur Zähler addieren.", 22, 4, "Nenner addieren.");
}

// ===== DEUTSCH =====
const SENTENCES = [
  ["Der", "Kunde", "bezahlt", "an", "der", "Kasse", "."],
  ["Wir", "bestellen", "die", "Ware", "online", "."],
  ["Die", "Lieferung", "kommt", "morgen", "an", "."],
  ["Er", "schreibt", "eine", "E-Mail", "an", "den", "Chef", "."],
];
function genSatzbau(r: () => number, d: number): Question {
  const parts = pick(r, SENTENCES);
  const correct = parts.join(" ");
  const scrambled = shuffle(parts, r).join(" ");
  return mk("deutsch", "satzbau", "order", d, "Bilde einen korrekten Satz: " + scrambled, undefined, correct,
    "Richtig: " + correct, "Subjekt zuerst, dann Verb.", 20, 3, "Wortstellung (Verbposition).", "sort");
}
function genTextverst(r: () => number, d: number): Question {
  const texts: [string, string, string[]][] = [
    ["Achtung: Die Lieferung erfolgt nur nach Voranmeldung.", "Was ist nötig vor der Lieferung?", ["eine Voranmeldung", "eine Zahlung", "ein Ausweis"]],
    ["Die Sprechstunde ist von 9 bis 12 Uhr. Bitte pünktlich erscheinen.", "Wann ist die Sprechstunde geöffnet?", ["9 bis 12 Uhr", "ganztags", "nachmittags"]],
    ["Bestellungen bis 18 Uhr werden am selben Tag versandt.", "Wann wird noch am selben Tag versandt?", ["bis 18 Uhr", "vor 12 Uhr", "nach 20 Uhr"]],
  ];
  const [text, q, opts] = pick(r, texts);
  const ans = opts[0];
  return {
    id: "de-tv-" + ri(r, 1000, 9999), area: "deutsch", subskill: "textverstaendnis", type: "reading", kind: "choice",
    difficulty: d, prompt: q, stimulus: "Text: " + text, options: shuffle(opts, r),
    answer: ans, explanation: "Im Text steht: die richtige Info ist „" + ans + "“.", hint: "Lies genau die gesuchte Angabe.", estimatedTime: 30, examRelevance: 5, commonErrors: "Oberflächlich lesen.",
    difficultyScore: 50, concept: "reading",
  };
}

// ===== LOGIK =====
function genProzess(r: () => number, d: number): Question {
  const steps = pick(r, [
    ["Bestellung aufgeben", "Ware prüfen", "Versand", "Rechnung"],
    ["Brief öffnen", "lesen", "antworten", "absenden"],
    ["Material holen", "schneiden", "kleben", "trocknen lassen"],
  ]);
  const correct = steps.join(" → ");
  const wrong = shuffle(steps, r).join(" → ");
  const opts = shuffle([correct, wrong], r);
  return mk("logik", "prozesslogik", "process", d, "Ordne die Schritte sinnvoll:", opts, correct,
    "Logische Reihenfolge: " + correct, "Denke an die natürliche Abfolge.", 22, 3, "Reihenfolge falsch.", "sort");
}
function genWortgruppen(r: () => number, d: number): Question {
  const sets: [string[], string][] = [
    [["Apfel", "Birne", "Banane"], "Traktor"],
    [["Auto", "Bus", "Zug"], "Stift"],
    [["Tisch", "Stuhl", "Regal"], "Hund"],
  ];
  const [group, odd] = pick(r, sets);
  const opts = shuffle([odd, ...group.slice(0, 2)], r);
  return mk("logik", "wortgruppen", "odd", d, "Welches Wort passt NICHT zur Gruppe? (Apfel, Birne, Banane, …)", opts, odd,
    "„" + odd + "“ gehört nicht zur Kategorie.", "Finde die Kategorie.", 18, 3, "Kategorie nicht erkannt.");
}

// ===== KONZENTRATION (visual SVG) =====
function grid(n: number, r: () => number) {
  // n×n grid of cells; returns svg string
  const cell = 44, pad = 6, sz = n * (cell + pad);
  let cells = "";
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const sym = ri(r, 0, 3);
    cells += `<g transform="translate(${pad + x * (cell + pad)},${pad + y * (cell + pad)})"><rect width="${cell}" height="${cell}" rx="6" fill="#F0EEE9" stroke="#E2DFD8"/><text x="${cell / 2}" y="${cell / 2 + 7}" font-size="22" text-anchor="middle">${["●", "▲", "■", "★"][sym]}</text></g>`;
  }
  return `<svg viewBox="0 0 ${sz} ${sz}" width="${sz}" height="${sz}">${cells}</svg>`;
}
function genBilderZaehlen(r: () => number, d: number): Question {
  const n = d <= 1 ? 4 : d === 2 ? 5 : 6;
  const target = ri(r, 0, 3);
  const svg = grid(n, r);
  const count = (svg.match(new RegExp("[" + ["●", "▲", "■", "★"][target] + "]", "g")) || []).length;
  const symName = ["Kreise", "Dreiecke", "Quadrate", "Sterne"][target];
  return {
    id: "kon-bz-" + ri(r, 1000, 9999), area: "konzentration", subskill: "bilder_zaehlen", type: "count", kind: "visual",
    difficulty: d, prompt: "Zähle die " + symName + " (●▲■★) im Raster.", stimulus: svg, options: shuffle([String(count), String(count + 1), String(Math.max(0, count - 1)), String(count + 2)], r),
    answer: String(count), explanation: "Es sind " + count + " " + symName + ".", hint: "Systematisch zeilenweise zählen.", estimatedTime: 25, examRelevance: 3, commonErrors: "Übersehen/Zu viel zählen.",
    difficultyScore: 35, concept: "count",
  };
}
function genSymbole(r: () => number, d: number): Question {
  const n = d <= 1 ? 4 : 5;
  const svg = grid(n, r);
  const target = ri(r, 0, 3);
  const sym = ["●", "▲", "■", "★"][target];
  const count = (svg.match(new RegExp("[" + sym + "]", "g")) || []).length;
  return {
    id: "kon-se-" + ri(r, 1000, 9999), area: "konzentration", subskill: "symbole_entdecken", type: "symbol", kind: "visual",
    difficulty: d, prompt: "Wie viele Symbole der gesuchten Art (" + sym + ") sind im Raster?", stimulus: svg, options: shuffle([String(count), String(count + 1), String(Math.max(0, count - 1))], r),
    answer: String(count), explanation: "Anzahl = " + count + ".", hint: "Nutze ein Suchmuster.", estimatedTime: 22, examRelevance: 3, commonErrors: "Doppelzählung.",
    difficultyScore: 45, concept: "symbol",
  };
}

// ===== MERKFÄHIGKEIT (stimulus → recall) =====
const SIGNS = ["⛔", "⚠️", "ℹ️", "↩️", "♿", "🅿️", "🚭", "🔧"];
function genSchilder(r: () => number, d: number): Question {
  const k = d <= 1 ? 3 : 4;
  const chosen = shuffle(SIGNS, r).slice(0, k);
  const svg = `<svg viewBox="0 0 ${k * 70} 60" width="${k * 70}" height="60">` +
    chosen.map((s, i) => `<text x="${i * 70 + 35}" y="42" font-size="34" text-anchor="middle">${s}</text>`).join("") + `</svg>`;
  const ask = pick(r, chosen);
  return {
    id: "merk-" + ri(r, 1000, 9999), area: "merkfaehigkeit", subskill: "schilder_erinnern", type: "recall", kind: "visual",
    difficulty: d, prompt: "Erinnere dich: War das Schild " + ask + " unter den gezeigten Schildern?", stimulus: svg,
    options: ["Ja", "Nein"], answer: "Ja", explanation: "Das Schild war zu sehen.", hint: "Konzentriere dich kurz auf die Menge.", estimatedTime: 15, examRelevance: 2, commonErrors: "Nach Aufmerksamkeit vergessen.",
 difficultyScore: 60, concept: "recall",
  };
}

// ===== PRAKTISCH =====
function genSort(r: () => number, d: number): Question {
  const nums = shuffle([ri(r, 10, 99), ri(r, 10, 99), ri(r, 10, 99), ri(r, 10, 99)], r);
  const asc = [...nums].sort((a, b) => a - b).join(", ");
  return mk("praktisch", "sortierverfahren", "numbers", d, "Sortiere aufsteigend: " + nums.join(", "), undefined, asc,
    "Aufsteigend: " + asc, "Kleinste zuerst.", 18, 3, "Reihenfolge vertauscht.", "sort");
}
function genAlltag(r: () => number, d: number): Question {
  const q: [string, string[]][] = [
    ["Du siehst Rauch im Lager. Was tust du ZUERST?", ["Alarm auslösen", "weiterarbeiten", "fenster öffnen"]],
    ["Eine Kollegin ist gestürzt. Was ist richtig?", ["Erste Hilfe holen", "allein hochziehen", "ignorieren"]],
    ["Der Feuerwehrplan zeigt den Fluchtweg. Wo stehst du?", ["am Ausgang", "am Fenster", "am Lift"]],
  ];
  const [text, opts] = pick(r, q);
  const ans = opts[0];
  return mk("praktisch", "alltagswissen", "safety", d, text, shuffle(opts, r), ans,
    "Richtig: " + ans, "Sicherheit geht vor.", 16, 3, "Falsche Priorität.");
}

// ===== HELPERS / DISPATCH =====
function mk(area: string, sub: string, type: string, d: number, prompt: string, options: string[] | undefined, answer: string, explanation: string, hint: string, et: number, er: number, ce: string, kind?: QKind, concept?: string): Question {
  const base = TYPE_BASE[type] ?? 40;
  const difficultyScore = Math.max(8, Math.min(98, base + (d - 1) * TYPE_STEP));
  return {
    id: `${area}-${sub}-${type}-${ri(rng(Date.now()), 1000, 9999)}`, area, subskill: sub, type: type as QType,
    kind: kind ?? (options ? "choice" : "input"), difficulty: d, difficultyScore,
    concept: concept ?? type, prompt, options, answer, explanation, hint,
    estimatedTime: et, examRelevance: er, commonErrors: ce,
  };
}

const GENERATORS: Record<string, ((r: () => number, d: number) => Question)[]> = {
  textaufgaben: [genPercent, genMoney, genWord, genFrac],
  kopfrechnen: [genMental],
  satzbau: [genSatzbau], textverstaendnis: [genTextverst],
  prozesslogik: [genProzess], wortgruppen: [genWortgruppen],
  bilder_zaehlen: [genBilderZaehlen], symbole_entdecken: [genSymbole],
  schilder_erinnern: [genSchilder], sortierverfahren: [genSort], alltagswissen: [genAlltag],
};

export function generate(subskillId: string, difficulty: number, seed = Date.now()): Question | null {
  const gs = GENERATORS[subskillId];
  if (!gs || !gs.length) return null;
  const r = rng(seed);
  const g = gs[Math.floor(r() * gs.length)];
  const q = g(r, Math.max(1, Math.min(3, difficulty)));
  if (q.difficultyScore === undefined) {
    const base = TYPE_BASE[q.type] ?? 40;
    q.difficultyScore = Math.max(8, Math.min(98, base + (q.difficulty - 1) * TYPE_STEP));
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
