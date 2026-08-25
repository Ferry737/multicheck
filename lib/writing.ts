// lib/writing.ts
// Textschreiben (free-text writing) private teacher (Phase 19).
// Writing is evaluated by RUBRIC, never by a computed answer key (it has no single right answer).
// The deterministic rubric gives structured feedback even with NO AI.
// AI (when available) can personalize the wording; it never changes the scores.

export interface WritingRubric {
  taskCompletion: number; // 0..1 did they address the prompt
  structure: number;      // 0..1 paragraphs / coherence
  grammar: number;        // 0..1 sentence correctness
  vocabulary: number;     // 0..1 word choice adequacy
  clarity: number;        // 0..1 understandable, concise
}

export interface WritingResult {
  rubric: WritingRubric;
  overall: number;         // 0..100 weighted
  feedback: string[];      // deterministic, point-by-point
  strengths: string[];
  improvements: string[];
}

// ---- Deterministic rubric scoring (no AI needed) ----
// Heuristics: length, sentence count, capitalization, common German connectors,
// question alignment. These are signals, not a substitute for human/AI judgment,
// but they give the student immediate, useful feedback offline.
export function scoreWriting(text: string, prompt: string): WritingResult {
  const t = (text || "").trim();
  const words = t.split(/\s+/).filter(Boolean);
  const sentences = t.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
  const wordCount = words.length;
  const sentCount = sentences.length;

  // task completion: length + prompt-keyword presence
  const pk = prompt.toLowerCase().match(/[a-zäöüß]{4,}/g)?.slice(0, 8) ?? [];
  const tlow = t.toLowerCase();
  const keywordHits = pk.filter((k) => tlow.includes(k)).length;
  const taskCompletion = Math.max(0, Math.min(1, wordCount / 60 * 0.6 + keywordHits / Math.max(1, pk.length) * 0.4));

  // structure: multiple sentences + paragraph breaks
  const paragraphs = t.split(/\n\s*\n/).filter(Boolean).length;
  const connectors = (tlow.match(/\b(und|aber|denn|weil|wenn|deshalb|daher|zuerst|dann|zum beispiel|zum schluss)\b/g) || []).length;
  const structure = Math.max(0, Math.min(1, (sentCount >= 3 ? 0.5 : sentCount * 0.16) + (paragraphs >= 2 ? 0.25 : 0) + Math.min(0.25, connectors * 0.05)));

  // grammar signal: starts with capital, ends with punctuation, balanced length
  const startsCap = /^[A-ZÄÖÜ]/.test(t);
  const endsPunct = /[.!?]$/.test(t);
  const avgLen = sentCount ? wordCount / sentCount : 0;
  const reasonableLen = avgLen >= 4 && avgLen <= 22 ? 1 : 0.5;
  const grammar = Math.max(0, Math.min(1, (startsCap ? 0.34 : 0) + (endsPunct ? 0.33 : 0) + reasonableLen * 0.33));

  // vocabulary: variety (unique/total) + no excessive repetition
  const uniq = new Set(words.map((w) => w.toLowerCase().replace(/[.,!?]/g, ""))).size;
  const vocabulary = Math.max(0, Math.min(1, uniq / Math.max(1, wordCount) * 1.4));

  // clarity: moderate sentence length, not too short, not rambling
  const clarity = Math.max(0, Math.min(1, wordCount >= 25 ? 0.6 : wordCount / 40) + (avgLen <= 18 ? 0.4 : 0.1));

  const rubric: WritingRubric = { taskCompletion, structure, grammar, vocabulary, clarity };
  const overall = Math.round((taskCompletion * 0.3 + structure * 0.2 + grammar * 0.2 + vocabulary * 0.15 + clarity * 0.15) * 100);

  const feedback: string[] = [];
  const strengths: string[] = [];
  const improvements: string[] = [];

  if (taskCompletion >= 0.7) strengths.push("Du gehst auf die Aufgabe ein."); else improvements.push("Achte darauf, die Frage vollständig zu beantworten.");
  if (structure >= 0.6) strengths.push("Gut gegliedert (Absätze/Connectoren)."); else improvements.push("Baue mehr Absätze und Connectoren (und, weil, dann) ein.");
  if (grammar >= 0.6) strengths.push("Grammatik/Satzbau solide."); else improvements.push("Großschreibung am Satzanfang und Punkt am Ende prüfen.");
  if (vocabulary >= 0.6) strengths.push("Gute Wortvielfalt."); else improvements.push("Variiere deine Wörter, wiederhole nicht zu oft.");
  if (clarity >= 0.6) strengths.push("Klar und verständlich."); else improvements.push("Schreibe etwas ausführlicher und übersichtlicher.");

  feedback.push(`Gesamt: ${overall}/100.`);
  feedback.push(...strengths.map((s) => "✓ " + s));
  feedback.push(...improvements.map((s) => "→ " + s));

  return { rubric, overall, feedback, strengths, improvements };
}

// AI-personalized text (optional, never overrides scores).
export function personalizeWritingFeedback(deterministic: string[], aiText: string | null): string[] {
  if (!aiText) return deterministic;
  return [...deterministic, "", "Coach (KI): " + aiText];
}
