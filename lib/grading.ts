/**
 * SINGLE ANSWER-GRADING CHOKE POINT.
 *
 * The same comparison defect appeared independently in THREE places
 * (components/Trainer.tsx, lib/exam.ts, components/MicroLesson.tsx), each with
 * its own private norm(). Two of them mis-graded mathematically correct answers:
 *   - single-comma replace (no /g)  -> "12,34,56" style inputs broke
 *   - pure string compare           -> 1.0 vs 1, 1,0 vs 1, 24,60 vs 24.6 REJECTED
 *   - MicroLesson had no comma handling at all
 * Swiss/German learners type comma decimals and apostrophe thousands, so this
 * marked correct work wrong, drained mastery, and (via applyExamToModel)
 * corrupted readiness.
 *
 * EVERY student-answer comparison in the app MUST go through gradeAnswer().
 * Do not add another local norm(). scripts/test-no-local-graders.mjs fails the
 * build if a new private grader appears.
 */

/** Text normalization: strip whitespace, ALL commas -> dots, lowercase. */
export function normalizeAnswer(v: string): string {
  return (v || "").replace(/\s/g, "").replace(/,/g, ".").toLowerCase();
}

/**
 * Parse Swiss/German numeric forms: comma decimals ("24,6"), apostrophe
 * thousands ("1'234"), space thousands ("1 234"). Returns null when the value
 * is not purely numeric, so text answers fall back to string comparison.
 */
export function asNumber(s: string): number | null {
  const cleaned = (s || "").trim().replace(/['\u2019\s]/g, "").replace(/,/g, ".");
  if (!/^[+-]?\d*\.?\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** True when both sides are numeric and equal within float tolerance. */
export function numericMatch(a: string, b: string): boolean {
  const na = asNumber(a), nb = asNumber(b);
  if (na === null || nb === null) return false;
  return Math.abs(na - nb) < 1e-9;
}

/**
 * Grade a student answer. Numeric tolerance is applied ONLY to non-choice
 * answers: for multiple choice the option string must match exactly, so two
 * numerically-equal options can never both be accepted.
 */
export function gradeAnswer(value: string, answer: string, kind?: string): boolean {
  return normalizeAnswer(value) === normalizeAnswer(answer) ||
    (kind === "choice" && value === answer) ||
    (kind !== "choice" && numericMatch(value, answer));
}
