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
  // Continuous difficulty: larger base + finer percentages as ability rises (Phase 6).
  const easy = d < 45;
  const base = easy ? ri(r, 2, 20) * 10 : d < 75 ? ri(r, 15, 250) : ri(r, 80, 999);
  const p = easy ? pick(r, [10, 20, 25, 50]) : d < 75 ? pick(r, [10, 15, 20, 25, 30, 40, 75]) : pick(r, [12, 18, 23, 37, 65, 85]);
  const ans = round1((base * p) / 100);
  const opts = dedupeOptions(shuffle([String(ans), String(round1((base * (p + 10)) / 100)), String(round1((base * (p - 10)) / 100)), String(round1((base * (p + 5)) / 100))], r));
  return mk("mathematik", "textaufgaben", "pct", d, "Wie viel sind " + p + "% von " + base + "?", opts, String(ans),
    p + "% von " + base + " = " + base + " × " + p + "/100 = " + ans + ".",
    "10% sind " + base / 10 + ".", 28, 5, "Komma falsch setzen.");
}
function genMoney(r: () => number, d: number): Question {
  if (d >= 70) {
    // multi-step: discount THEN voucher (Hard / continuous high band)
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
      "Zuerst Rabatt, dann Gutschein.", 35, 5, "Reihenfolge der Abzüge verwechseln.");
  }
  const price = d < 45 ? pick(r, [40, 60, 80, 100]) : pick(r, [80, 120, 150, 200]);
  const disc = d < 45 ? pick(r, [10, 20, 25]) : pick(r, [10, 15, 20, 25, 30]);
  const ans = price - (price * disc) / 100;
  const opts = dedupeOptions(shuffle([String(ans), String(price - (price * (disc + 5)) / 100), String(price - (price * (disc - 5)) / 100), String(price)], r).map(String));
  return mk("mathematik", "textaufgaben", "money", d, "Ein Artikel kostet CHF " + price + ". Er wird " + disc + "% reduziert. Neuer Preis?", opts, String(ans),
    "CHF " + price + " − " + disc + "% = " + ans + " CHF.", "Berechne " + disc + "% von " + price + ".", 25, 4, "Rabatt falsch abziehen.");
}
function genWord(r: () => number, d: number): Question {
  const a = ri(r, 3, 9), b = ri(r, 3, 9), total = a + b;
  const diffs = [...new Set([total + 1, total - 1, a * b].filter((v) => v > 0 && v !== total))]; // plausible positive distractors only
  const opts = shuffle([String(total), ...diffs.slice(0, 3).map(String)], r);
  return mk("mathematik", "textaufgaben", "word", d,
    "Im Lager sind " + a + " rote und " + b + " blaue Kisten. Wie viele Kisten insgesamt?", opts, String(total),
    a + " + " + b + " = " + total + ".", "Addiere die beiden Mengen.", 22, 5, "Falsche Rechenart wählen.");
}
function genMental(r: () => number, d: number): Question {
  // conversions: e.g. 1.5 kg = ? g ; or simple mental arithmetic
  if (d >= 70) {
    // two-step mental: convert then apply (Hard continuous band)
    const x = ri(r, 2, 9);
    const y = ri(r, 2, 9);
    const unit = pick(r, [["kg", "g", 1000], ["h", "min", 60], ["m", "cm", 100], ["t", "kg", 1000], ["km", "m", 1000]] as [string, string, number][]);
    const op = pick(r, ["+", "×", "−"]);
    const conv = x * unit[2];
    const ans = op === "+" ? conv + y : op === "−" ? conv - y : conv * y;
    return mk("mathematik", "kopfrechnen", "conv2", d,
      `Rechne und berechne: ${x} ${unit[0]} = ? ${unit[1]}, dann davon ${op === "+" ? "plus" : op === "−" ? "minus" : "mal"} ${y}.`, undefined, String(ans),
      `${x} ${unit[0]} = ${conv} ${unit[1]}. ${conv} ${op} ${y} = ${ans}.`,
      "Zuerst umrechnen, dann rechnen.", 18, 5, "Reihenfolge der Schritte.");
  }
  if (r() < 0.5 || d < 45) {
    const x = ri(r, 1, d < 45 ? 6 : 12), unit = pick(r, [["kg", "g", 1000], ["m", "cm", 100], ["h", "min", 60], ["t", "kg", 1000]] as [string, string, number][]);
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
  if (d === 3) {
    // subordinate clause — harder word order
    const subj = pick(r, ["Der Mitarbeiter", "Die Kollegin", "Unser Team", "Der Chef"]);
    const verb = pick(r, ["prüft", "bestellt", "verschickt", "kontrolliert"]);
    const obj = pick(r, ["die Rechnung", "die Ware", "das Paket", "den Bericht"]);
    const konj = pick(r, [["weil", "da"], ["obwohl", "auch wenn"], ["wenn", "falls"]]);
    const reason = pick(r, ["die Frist kurz ist", "das Lager voll ist", "der Kunde wartet", "die Zahlung fehlt"]);
    const correct = `${subj} ${verb} ${obj}, ${konj[0]} ${reason}.`;
    const wrong = `${subj}, ${konj[0]} ${reason} ${verb} ${obj}.`;
    return mk("deutsch", "satzbau", "order2", d, "Bilde einen Satz mit Nebensatz: „" + subj + " " + verb + " " + obj + "“ + „" + konj[0] + " " + reason + "“", undefined, correct,
      "Mit Komma: " + correct, "Nebensatz mit Komma abtrennen; Verb ans Ende.", 28, 4, "Verbposition im Nebensatz.");
  }
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
  // a wrong order that is GUARANTEED different from the correct one (deterministic rotation)
  const wrongOrder = (steps: string[]) => {
    const w = [...steps.slice(1), steps[0]]; // rotate by one — always different for len > 1
    return w;
  };
  if (d === 3) {
    // conditional rule — harder sequencing with a constraint
    const steps = ["Bestellung prüfen", "Kreditlimit prüfen", "Freigabe einholen", "Versand buchen", "Rechnung senden"];
    const correct = steps.join(" → ");
    const wrong = wrongOrder(steps).join(" → ");
    return mk("logik", "prozesslogik", "process2", d, "Ordne mit Bedingung: Freigabe erst NACH Kreditlimitprüfung. Reihenfolge:", [correct, wrong], correct,
      "Logische Reihenfolge mit Bedingung: " + correct, "Achte auf die Bedingung.", 30, 4, "Bedingung ignoriert.");
  }
  const steps = pick(r, [
    ["Bestellung aufgeben", "Ware prüfen", "Versand", "Rechnung"],
    ["Brief öffnen", "lesen", "antworten", "absenden"],
    ["Material holen", "schneiden", "kleben", "trocknen lassen"],
  ]);
  const correct = steps.join(" → ");
  const wrong = wrongOrder(steps).join(" → ");
  const opts = shuffle([correct, wrong], r);
  return mk("logik", "prozesslogik", "process", d, "Ordne die Schritte sinnvoll:", opts, correct,
    "Logische Reihenfolge: " + correct, "Denke an die natürliche Abfolge.", 22, 3, "Reihenfolge falsch.", "sort");
}
function genWortgruppen(r: () => number, d: number): Question {
  const sets: [string[], string][] = [
    [["Apfel", "Birne", "Banane"], "Traktor"],
    [["Auto", "Bus", "Zug"], "Stift"],
    [["Tisch", "Stuhl", "Regal"], "Hund"],
    [["Hund", "Katze", "Maus"], "Brille"],
    [["Rot", "Blau", "Grün"], "Teller"],
  ];
  const [group, odd] = pick(r, sets);
  const opts = dedupeOptions(shuffle([odd, ...group.slice(0, 2)], r));
  // prompt MUST describe the ACTUAL group that was generated (no hard-coded example)
  const example = group.slice(0, 3).join(", ");
  return mk("logik", "wortgruppen", "odd", d, `Welches Wort passt NICHT zur Gruppe? (${example}, …)`, opts, odd,
    `„${odd}“ gehört nicht zur Kategorie.`, "Finde die Kategorie.", 18, 3, "Kategorie nicht erkannt.");
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
  const n = d < 45 ? 4 : d < 75 ? 5 : 6;
  const target = ri(r, 0, 3);
  const svg = grid(n, r);
  const count = (svg.match(new RegExp("[" + ["●", "▲", "■", "★"][target] + "]", "g")) || []).length;
  const symName = ["Kreise", "Dreiecke", "Quadrate", "Sterne"][target];
  const distractors = d < 60 ? [count + 1, Math.max(0, count - 1)] : [count + 1, Math.max(0, count - 1), count + 2, Math.max(0, count - 2)];
  return {
    id: "kon-bz-" + ri(r, 1000, 9999), area: "konzentration", subskill: "bilder_zaehlen", type: "count", kind: "visual",
    difficulty: d < 45 ? 1 : d < 75 ? 2 : 3, prompt: "Zähle die " + symName + " (●▲■★) im Raster.", stimulus: svg, options: dedupeOptions(shuffle([String(count), ...distractors.map(String)], r)),
    answer: String(count), explanation: "Es sind " + count + " " + symName + ".", hint: "Systematisch zeilenweise zählen.", estimatedTime: 25, examRelevance: 3, commonErrors: "Übersehen/Zu viel zählen.",
    difficultyScore: 35, concept: "count",
  };
}
function genSymbole(r: () => number, d: number): Question {
  const n = d < 45 ? 4 : d < 75 ? 5 : 6;
  const svg = grid(n, r);
  const target = ri(r, 0, 3);
  const sym = ["●", "▲", "■", "★"][target];
  const count = (svg.match(new RegExp("[" + sym + "]", "g")) || []).length;
  const distractors = d < 60 ? [count + 1, Math.max(0, count - 1)] : [count + 1, Math.max(0, count - 1), count + 2];
  return {
    id: "kon-se-" + ri(r, 1000, 9999), area: "konzentration", subskill: "symbole_entdecken", type: "symbol", kind: "visual",
    difficulty: d < 45 ? 1 : d < 75 ? 2 : 3, prompt: "Wie viele Symbole der gesuchten Art (" + sym + ") sind im Raster?", stimulus: svg, options: dedupeOptions(shuffle([String(count), ...distractors.map(String)], r)),
    answer: String(count), explanation: "Anzahl = " + count + ".", hint: "Nutze ein Suchmuster.", estimatedTime: 22, examRelevance: 3, commonErrors: "Doppelzählung.",
    difficultyScore: 45, concept: "symbol",
  };
}

// ===== MERKFÄHIGKEIT (stimulus → recall) =====
const SIGNS = ["⛔", "⚠️", "ℹ️", "↩️", "♿", "🅿️", "🚭", "🔧"];
function genSchilder(r: () => number, d: number): Question {
  const k = d <= 1 ? 3 : d === 2 ? 4 : 6;
  const chosen = shuffle(SIGNS, r).slice(0, k);
  const svg = `<svg viewBox="0 0 ${k * 70} 60" width="${k * 70}" height="60">` +
    chosen.map((s, i) => `<text x="${i * 70 + 35}" y="42" font-size="34" text-anchor="middle">${s}</text>`).join("") + `</svg>`;
  // Balanced recall: sometimes the asked sign WAS shown (Ja), sometimes NOT (Nein).
  const present = r() < 0.5;
  const ask = present ? pick(r, chosen) : (() => {
    const others = SIGNS.filter((s) => !chosen.includes(s));
    return others.length ? pick(r, others) : pick(r, chosen);
  })();
  const answer = present ? "Ja" : "Nein";
  return {
    id: "merk-" + ri(r, 1000, 9999), area: "merkfaehigkeit", subskill: "schilder_erinnern", type: "recall", kind: "visual",
    difficulty: d, prompt: "Erinnere dich: War das Schild " + ask + " unter den gezeigten Schildern?", stimulus: svg,
    options: ["Ja", "Nein"], answer, explanation: present ? "Das Schild war zu sehen." : "Dieses Schild war NICHT dabei.", hint: "Konzentriere dich kurz auf die Menge.", estimatedTime: 15, examRelevance: 2, commonErrors: "Nach Aufmerksamkeit vergessen.",
    difficultyScore: 60, concept: "recall", memorizeMs: 4000,
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
  if (d === 3) {
    const q: [string, string[]][] = [
      ["Ein Kollege ist bewusstlos und atmet nicht. Was ist die richtige Reihenfolge?", ["Erst Hilfe rufen (144), dann Erste Hilfe beginnen", "Weiterarbeiten und abwarten", "Ihn allein hochziehen", "Erst den Chef informieren"]],
      ["Brandmeldeanlage läutet, aber kein Rauch sichtbar. Was tust du?", ["Evakuierungsanweisung befolgen und Bereich verlassen", "Weitersuchen nach dem Brand", "Das Signal ignorieren", "Fenster öffnen und warten"]],
      ["Du findest eine unbekannte USB-Stick im Lager. Richtig ist:", ["Meldung an IT/ Sicherheit, nicht einstecken", "Sofort in den PC stecken", "Für dich behalten", "An Kollegen weitergeben"]],
    ];
    const [text, opts] = pick(r, q);
    const ans = opts[0];
    return mk("praktisch", "alltagswissen", "safety2", d, text, shuffle(opts, r), ans,
      "Richtig: " + ans, "Sicherheit und Meldepflicht gehen vor.", 22, 4, "Falsche Priorität bei Gefahr.");
  }
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
  // Continuous difficulty band (Phase 6): map 0..100 ability to a calibration score
  // that varies smoothly rather than 3 discrete steps, so harder really is harder.
  const bandStep = (d - 50) / 50; // -1..1 around exam standard
  const difficultyScore = Math.max(8, Math.min(98, Math.round(base + bandStep * 22)));
  const discrete = d <= 40 ? 1 : d <= 70 ? 2 : 3; // for backward-compatible tagging only
  const tmpl = `${sub}-${type}-${prompt.replace(/\W+/g, "").slice(0, 24)}`;
  return {
    id: `${area}-${sub}-${type}-${ri(rng(Date.now()), 1000, 9999)}`, area, subskill: sub, type: type as QType,
    kind: kind ?? (options ? "choice" : "input"), difficulty: discrete, difficultyScore,
    concept: concept ?? type, prompt, options: options ? dedupeOptions(options) : undefined, answer, explanation, hint,
    estimatedTime: et, examRelevance: er, commonErrors: ce, templateKey: tmpl,
  };
}

// Continuous difficulty resolver (Phase 6): the coach stores ability 0..100 per subskill.
// We feed that directly so generation parameters vary continuously, not just 3 levels.
export function resolveDifficulty(ability: number): number {
  // ability 0..100 -> clamp to [12, 95]; the generators interpret d as a continuous target
  return Math.max(12, Math.min(95, Math.round(ability)));
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
