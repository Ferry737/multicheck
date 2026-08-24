// lib/curriculum.ts
// ASSUMED Multicheck® Attest (EBA) structure — NOT OFFICIAL, pending verification.
// Source: general knowledge of Swiss EBA intake assessment + spec §2/§15/§24.
// Correct me and I will adjust. Labeled "assumed" in the UI/docs.

export type Subject = "math" | "german" | "logic";

export interface Skill {
  id: string;
  subject: Subject;
  name: string;
  prerequisites: string[]; // skill ids required first
  examWeight: number; // 1..5 relative importance for EBA
  // difficulty band 1..5 (1 = most elementary)
  band: number;
}

export const SKILLS: Skill[] = [
  // MATH — elementary foundation (band 1)
  { id: "add", subject: "math", name: "Addition", prerequisites: [], examWeight: 3, band: 1 },
  { id: "sub", subject: "math", name: "Subtraction", prerequisites: ["add"], examWeight: 3, band: 1 },
  { id: "mul", subject: "math", name: "Multiplication facts", prerequisites: ["add"], examWeight: 4, band: 1 },
  { id: "div", subject: "math", name: "Division", prerequisites: ["mul"], examWeight: 4, band: 1 },
  { id: "mental", subject: "math", name: "Mental arithmetic", prerequisites: ["mul", "div"], examWeight: 3, band: 1 },
  { id: "order", subject: "math", name: "Order of operations", prerequisites: ["add", "sub", "mul", "div"], examWeight: 3, band: 2 },
  { id: "frac", subject: "math", name: "Fractions", prerequisites: ["div"], examWeight: 4, band: 2 },
  { id: "dec", subject: "math", name: "Decimals", prerequisites: ["div", "frac"], examWeight: 4, band: 2 },
  { id: "pct", subject: "math", name: "Percentages", prerequisites: ["dec", "frac"], examWeight: 5, band: 2 },
  { id: "ratio", subject: "math", name: "Ratios & proportions", prerequisites: ["pct"], examWeight: 3, band: 3 },
  { id: "money", subject: "math", name: "Money & units", prerequisites: ["dec"], examWeight: 2, band: 2 },
  { id: "word", subject: "math", name: "Word problems", prerequisites: ["pct", "ratio", "money"], examWeight: 5, band: 3 },
  { id: "charts", subject: "math", name: "Tables & charts", prerequisites: ["frac", "dec"], examWeight: 2, band: 3 },
  // GERMAN
  { id: "de-vocab", subject: "german", name: "Everyday & exam vocabulary", prerequisites: [], examWeight: 4, band: 1 },
  { id: "de-read", subject: "german", name: "Reading comprehension", prerequisites: ["de-vocab"], examWeight: 5, band: 2 },
  { id: "de-grammar", subject: "german", name: "Grammar & sentence structure", prerequisites: ["de-vocab"], examWeight: 4, band: 2 },
  { id: "de-spell", subject: "german", name: "Spelling", prerequisites: ["de-vocab"], examWeight: 2, band: 1 },
  { id: "de-exam", subject: "german", name: "Exam-style instructions", prerequisites: ["de-read", "de-grammar"], examWeight: 4, band: 3 },
  // LOGIC / COGNITIVE
  { id: "log-seq", subject: "logic", name: "Logical sequences", prerequisites: [], examWeight: 3, band: 1 },
  { id: "log-pattern", subject: "logic", name: "Pattern recognition", prerequisites: ["log-seq"], examWeight: 3, band: 2 },
  { id: "log-analogy", subject: "logic", name: "Analogies", prerequisites: ["log-seq"], examWeight: 2, band: 2 },
  { id: "log-spatial", subject: "logic", name: "Spatial reasoning", prerequisites: [], examWeight: 2, band: 2 },
];

export const SUBJECTS: { id: Subject; label: string }[] = [
  { id: "math", label: "Mathematics" },
  { id: "german", label: "German" },
  { id: "logic", label: "Logical reasoning" },
];

export function skillById(id: string): Skill | undefined {
  return SKILLS.find((s) => s.id === id);
}

// Exam target date — derived from the learner's October 2026 goal.
export const EXAM_DATE = new Date("2026-10-15T00:00:00");
