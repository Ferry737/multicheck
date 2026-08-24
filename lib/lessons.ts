// lib/lessons.ts — micro-lesson content (Phase 1).
// Each lesson: concept -> { title, explain, example (worked), guidedQ, guidedA, independentQ, independentA }
// Lessons are short (2-5 min), specific, interactive. AI may reword explanations at runtime.

export interface Lesson {
  title: string;
  concept: string;
  explain: string;
  worked: string;
  guided: { q: string; a: string };
  independent: { q: string; a: string; check: (s: string) => boolean };
}

export const LESSONS: Record<string, Lesson> = {
  "concept-math-percent": {
    title: "Prozent schnell rechnen",
    concept: "concept",
    explain: "Prozent = von Hundert. 10% sind ein Zehntel, 1% ist ein Hundertstel. 50% ist die Hälfte.",
    worked: "20% von 80: 10% = 8, also 20% = 2 × 8 = 16.",
    guided: { q: "Was sind 10% von 50?", a: "5" },
    independent: {
      q: "Was sind 25% von 200?", a: "50",
      check: (s) => { const n = parseFloat(s.replace(",", ".")); return n === 50; },
    },
  },
  "concept-math-money": {
    title: "Rabatt und Gutschein",
    concept: "concept",
    explain: "Erst den Rabatt vom Preis abziehen, DANN einen Gutschein. Reihenfolge zählt.",
    worked: "CHF 240, −15% = 204, dann −20 Gutschein = 184 CHF.",
    guided: { q: "CHF 100, 10% Rabatt, dann 10 Gutschein. Final?", a: "80" },
    independent: {
      q: "CHF 200, 20% Rabatt, dann 30 Gutschein. Final?", a: "130",
      check: (s) => parseFloat(s.replace(",", ".")) === 130,
    },
  },
  "concept-calculation": {
    title: "Rechenschritte sauber aufschreiben",
    concept: "calculation",
    explain: "Einen Schritt pro Zeile. Erst Einheiten umrechnen, dann rechnen.",
    worked: "1.5 kg = 1500 g. 1500 + 3 = 1503 g.",
    guided: { q: "Rechne 2 kg + 300 g in g.", a: "2300" },
    independent: {
      q: "3 h + 15 min in min?", a: "195",
      check: (s) => parseFloat(s.replace(",", ".")) === 195,
    },
  },
  "concept-reading": {
    title: "Genau lesen",
    concept: "reading",
    explain: "Lies die gesuchte Angabe im Text, nicht nur das erste Zahlwort.",
    worked: "„Bis 18 Uhr“ → Antwort ist „bis 18 Uhr“, nicht „vor 12“.",
    guided: { q: "Text: Sprechstunde 9–12 Uhr. Wann offen?", a: "9 bis 12 Uhr" },
    independent: {
      q: "Text: Versand bis 18 Uhr. Wann noch am selben Tag?", a: "bis 18 Uhr",
      check: (s) => s.toLowerCase().includes("18"),
    },
  },
  "concept-memory": {
    title: "Merkhilfe für Schilder",
    concept: "memory",
    explain: "Scanne die Menge zeilenweise, benenne jedes Schild leise.",
    worked: "⛔ ⚠️ ℹ️ → drei Schilder, das ⛔ war dabei.",
    guided: { q: "War ⚠️ unter ⛔ ⚠️ ℹ️?", a: "Ja" },
    independent: {
      q: "War ♿ unter ⛔ ⚠️ ℹ️ ♿?", a: "Ja",
      check: (s) => s.trim().toLowerCase().startsWith("j"),
    },
  },
  "concept-rule": {
    title: "Wortstellung: Nebensatz",
    concept: "rule",
    explain: "Im Nebensatz (weil, obwohl, wenn) steht das Verb AM ENDE. Davor ein Komma.",
    worked: "Der Chef prüft die Ware, weil die Frist kurz ist.",
    guided: { q: "Setze Komma: „Er hilft weil es eilt“", a: "Er hilft, weil es eilt" },
    independent: {
      q: "Verb ans Ende: „..., obwohl der Kunde wartet“ — korrekt?", a: "Ja",
      check: (s) => s.trim().toLowerCase().startsWith("j"),
    },
  },
};

export function lessonForConcept(concept?: string): Lesson | undefined {
  if (!concept) return undefined;
  return LESSONS["concept-" + concept] ?? LESSONS[concept] ?? LESSONS[Object.keys(LESSONS).find(k => k.includes(concept)) ?? ""];
}
