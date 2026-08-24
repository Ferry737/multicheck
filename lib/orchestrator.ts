// lib/orchestrator.ts
// CoachOrchestrator — the decision engine.
// DETERMINISTIC by design. AI (GLM-5.3) is an OPTIONAL interpreter/personalizer
// layered on top; it can NEVER change scores, answer keys, timers, curriculum,
// or persistence. If AI is unavailable, the deterministic policy is the full product.
//
// Two modes:
//   - deterministic (AI unavailable): full session planning + interventions
//   - ai-augmented (AI available): same plan, but rationale/explanations personalized

import { CoachModel, composeSubskillQuestions, composeSession, midSessionDecision, needsLesson, explainDecision, SessionPlan, Attempt } from "./coach";
import { Question } from "./questions";

export interface CoachDecision {
  // what to train next
  plan: SessionPlan;
  // why (one short line)
  rationale: string;
  // optional AI-personalized explanation (only when AI available)
  aiRationale?: string;
  // any interventions queued for this session (lesson/accuracy/speed)
  interventions: { subskill: string; kind: "lesson" | "accuracy" | "speed"; concept?: string }[];
  aiAvailable: boolean;
}

// Build the next session plan deterministically from the student model.
// This is the "one-button autonomy" core: student presses TRAIN, this runs.
export function buildNextSession(m: CoachModel, opts?: { minutes?: number; aiRationale?: string }): CoachDecision {
  const plan = composeSession(m, opts?.minutes ?? 22);
  const rationale = plan.why || "Ausgleichende Wiederholung basierend auf deinem Profil.";

  // Pre-compute likely interventions from current weak/slow subskills.
  const interventions: CoachDecision["interventions"] = [];
  for (const id of Object.keys(m.subs)) {
    const st = m.subs[id];
    if (!st) continue;
    const nl = needsLesson(m, id);
    if (nl.lesson) interventions.push({ subskill: id, kind: "lesson", concept: nl.concept });
    else if (st.speed < 0.5 && st.attempts >= 3) interventions.push({ subskill: id, kind: "speed" });
  }

  return {
    plan,
    rationale,
    aiRationale: opts?.aiRationale,
    interventions,
    aiAvailable: Boolean(opts?.aiRationale),
  };
}

// Called AFTER every answer (mid-session autopilot, Phase 13).
// Returns the deterministic decision; AI only personalizes the message text.
export function afterAnswer(m: CoachModel, q: Question, correct: boolean, ms: number, streak: number, speedFlag: boolean) {
  const dec = midSessionDecision(m, q.subskill, correct, ms, streak, speedFlag);
  // Build the next question(s) for this subskill at the updated ability.
  const next = composeSubskillQuestions(m, q.subskill, 1, speedFlag ? "speed" : "adaptive");
  return { decision: dec, next };
}

// AI augmentation boundary: the orchestrator only lets AI produce TEXT, never logic.
// Given a deterministic decision, ask AI to personalize the rationale (optional).
// The deterministic `rationale` is ALWAYS shown as the source of truth.
export function personalizeRationale(deterministicRationale: string, aiText: string | null): string {
  if (!aiText) return deterministicRationale;
  // AI text is supplementary only; never replaces the deterministic reason.
  return deterministicRationale + "\n\n" + aiText;
}

// Guard: ensure AI output never leaks into scoring/curriculum/persistence paths.
// Callers must use deterministic functions for those; this module never calls them
// with AI-derived values.
export function assertNoAIScoreOverride(_aiValue: unknown, deterministicValue: number): number {
  // deterministic value always wins; AI is ignored for numeric scoring
  return deterministicValue;
}
