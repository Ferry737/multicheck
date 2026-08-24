// lib/learner.ts — adapter over the adaptive coach engine (lib/coach.ts).
// Keeps the public surface the UI already imports (recordAttempt, selectNext,
// readiness, etc.) while delegating real logic to coach.ts.
import { AREAS, ALL_SUBSKILLS, subskillById, AreaId } from "./curriculum";
import {
  CoachModel, Fehler, Attempt, SubModel, SessionMode, ErrorType,
  emptyCoach, updateModel, composeSession, decideToday, masteryGate,
  overallReadiness as overallReadinessC, readinessByArea as readinessByAreaC,
  classifyError, perfBucket,
} from "./coach";

export type { CoachModel as LearnerModel, Fehler, Attempt, SubModel };
export type Status = "weak" | "normal" | "strong";

export function emptyModel(examDate = new Date("2026-10-15").toISOString()): CoachModel {
  return emptyCoach(examDate.slice(0, 10));
}

export function statusOf(m: CoachModel, id: string): Status {
  const x = m.subs[id]?.mastery ?? 0;
  return x < 0.4 ? "weak" : x < 0.7 ? "normal" : "strong";
}
export function masteryOf(m: CoachModel, id: string) { return m.subs[id]?.mastery ?? 0; }

// Backward-compatible priority selector (delegates to coach composer's first weak pick).
export function selectNext(m: CoachModel): { subskill: string; reason: string } {
  const plan = decideToday(m);
  if (plan.blocks.length) return { subskill: plan.blocks[0].subskill, reason: plan.blocks[0].why };
  return { subskill: ALL_SUBSKILLS[0].id, reason: "Start" };
}

export function recordAttempt(m: CoachModel, a: Attempt, sessionId = "s", mode: SessionMode = "adaptive"): CoachModel {
  return updateModel(m, [a], sessionId, mode);
}
export function markFehlerMastered(m: CoachModel, id: string): CoachModel {
  return { ...m, fehler: m.fehler.map((f) => f.id === id ? { ...f, mastered: true } : f) };
}

export function sessionMix(m: CoachModel): { weak: string[]; med: string[]; strong: string[] } {
  const w: string[] = [], me: string[] = [], st: string[] = [];
  for (const s of ALL_SUBSKILLS) { const x = m.subs[s.id]?.mastery ?? 0; if (x < 0.4) w.push(s.id); else if (x < 0.7) me.push(s.id); else st.push(s.id); }
  return { weak: w, med: me, strong: st };
}

export function readinessByArea(m: CoachModel): Record<AreaId, number> { return readinessByAreaC(m); }
export function overallReadiness(m: CoachModel): number { return overallReadinessC(m); }
export function accuracy(m: CoachModel): number {
  const h = m.history; if (!h.length) return 0; return Math.round((h.filter((x) => x.correct).length / h.length) * 100);
}
export function avgSpeed(m: CoachModel): number {
  const h = m.history.filter((x) => x.correct); if (!h.length) return 0; return Math.round(h.reduce((a, b) => a + b.ms, 0) / h.length / 1000);
}
export function quadrant(m: CoachModel): string {
  const a = accuracy(m) >= 75, s = avgSpeed(m) > 0 && avgSpeed(m) <= 15;
  if (a && s) return "accurate+fast"; if (a && !s) return "accurate+slow"; if (!a && s) return "inaccurate+fast"; return "inaccurate+slow";
}

// re-exports used by UI/coach
export { decideToday, composeSession, masteryGate, classifyError, perfBucket };
export type { SessionMode, ErrorType };
