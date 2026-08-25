// lib/offlineCoach.ts
// Deterministic, rule-based coaching that works with NO AI (Phase 20: AI outage fallback).
// Used when /api/ai/test reports AI_AVAILABLE=false. The student can still train and
// get helpful feedback; AI only ADDS natural-language personalization on top.
//
// This is the safety net: the product never breaks when the inference API is down
// or out of credits. Every function here is pure and testable.

import { Question } from "./questions";
import { classifyError } from "./coach";

export interface OfflineHint {
  short: string;        // one-line hint (always shown)
  method: string;       // step-by-step method for this question family
  similar: string;      // a related drill suggestion
}

// Per-type worked method (the "how to solve" the AI would otherwise narrate).
const METHODS: Record<string, (q: Question) => string> = {
  pct: (q) => {
    const m = q.prompt.match(/(\d+)% von (\d+)/);
    if (m) return `1% von ${m[2]} = ${Math.round(+m[2] / 100)}. Dann ${m[1]} × ${(+m[2] / 100).toString().replace(".", ",")} = ${q.answer}.`;
    return "Prozent = Anteil von 100. Erst 1% berechnen, dann multiplizieren.";
  },
  money: (q) => "Rabatt zuerst abziehen, dann einen Gutschein. Reihenfolge beachten!",
  money2: (q) => "Schritt 1: Preis − Rabatt. Schritt 2: Ergebnis − Gutschein. Nie andersherum.",
  conv: (q) => "Einheit merken (1 kg = 1000 g, 1 h = 60 min, 1 m = 100 cm). Dann multiplizieren.",
  conv2: (q) => "Schritt 1: umrechnen. Schritt 2: rechnen (＋ / − / ×).",
  frac: (q) => "Gleiche Nenner. Zähler addieren. Ggf. kürzen.",
  mental: (q) => "In Teil-Schritte zerlegen. Von links nach rechts rechnen.",
  recall: (q) => "Beim Merken das Bild aktiv benennen ('Apfel, Birne…'). Dann Augen schließen und wiederholen.",
  symbol: (q) => "Systematisch zeilenweise zählen, kein Symbol überspringen.",
  count: (q) => "Zeile für Zeile zählen. Einmal zurückzählen zur Kontrolle.",
  satzbau: (q) => "Subjekt + Prädikat + Objekt. Nebensatz: Verb ans Ende. Komma vor Nebensatz.",
  prozesslogik: (q) => "Abhängigkeiten finden. Welcher Schritt MUSS zuerst passieren?",
  wortgruppen: (q) => "Die gemeinsame Eigenschaft benennen. Das Wort ohne diese Eigenschaft ist die Antwort.",
  sortierverfahren: (q) => "Kleinste Zahl zuerst, dann aufsteigend. Paarweise vergleichen.",
  alltagswissen: (q) => "Sicherheit zuerst: Gefahr erkennen, melden, dann handeln.",
};

export function offlineHintFor(q: Question, studentAnswer: string): OfflineHint {
  const et = classifyError(q, { subskill: q.subskill, correct: false, ts: 0, ms: 0, difficulty: q.difficultyScore ?? 30, mode: "adaptive" } as any);
  const method = (METHODS[q.type] ?? METHODS[q.concept ?? ""] ?? (() => "Schritt für Schritt vorgehen."))(q);
  const short = et === "calculation"
    ? "Rechenfehler — noch einmal Schritt für Schritt."
    : et === "concept"
    ? "Konzept prüfen — schau dir die Methode an."
    : et === "reading"
    ? "Frage genau lesen — was wird wirklich gefragt?"
    : et === "memory"
    ? "Beim nächsten Mal das Bild aktiv beim Merken benennen."
    : et === "rule"
    ? "Die Regel beachten (Reihenfolge / Komma / Einheit)."
    : "Fast! Vergleiche dein Ergebnis mit der Lösung.";
  return { short, method, similar: `Mehr Übung: ${q.area} → ${q.subskill}` };
}

// A short deterministic 'coach says' line for a finished session (no AI needed).
export function offlineSessionSummary(correct: number, total: number): string {
  const pct = total ? Math.round((correct / total) * 100) : 0;
  if (pct >= 90) return `Stark — ${pct}% richtig. Erhalte das Niveau mit kurzen Wiederholungen.`;
  if (pct >= 70) return `${pct}% richtig. Die restlichen ${total - correct} lohnen ein gezieltes Drill.`;
  if (pct >= 50) return `${pct}% richtig. Wir fokussieren die schwachen Stellen im nächsten Block.`;
  return `${pct}% richtig. Kein Problem — wir üben die Grundlagen gezielt weiter.`;
}
