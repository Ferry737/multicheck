// lib/learner.ts
// Learner model + adaptive logic. Client-side, persisted to localStorage.
// Mastery per skill (0..1), response times, error categories, recall schedule.

import { SKILLS, skillById, Subject } from "./curriculum";

export interface Attempt {
  skill: string;
  ts: number;
  correct: boolean;
  ms: number; // response time
  errorCategory?: string;
}

export interface SkillState {
  mastery: number; // 0..1 estimated ability
  seen: number;
  correct: number;
  avgMs: number;
  lastSeen: number;
  // spaced repetition: next due timestamp
  due: number;
  // error categories tallied
  errors: Record<string, number>;
}

export interface LearnerModel {
  createdAt: number;
  goal: string;
  diagnosticDone: boolean;
  skills: Record<string, SkillState>;
  history: Attempt[];
  // confidence calibration: self-rated vs actual
  totalStudyMs: number;
  streakDays: number;
  lastActiveDate: string;
}

const ZERO_SKILL = (): SkillState => ({
  mastery: 0, seen: 0, correct: 0, avgMs: 0, lastSeen: 0, due: 0, errors: {},
});

export function emptyModel(): LearnerModel {
  const skills: Record<string, SkillState> = {};
  for (const s of SKILLS) skills[s.id] = ZERO_SKILL();
  return {
    createdAt: Date.now(), goal: "Multicheck® Attest EBA", diagnosticDone: false,
    skills, history: [], totalStudyMs: 0, streakDays: 0, lastActiveDate: "",
  };
}

export function masteryOf(m: LearnerModel, skillId: string): number {
  return m.skills[skillId]?.mastery ?? 0;
}

// Update a skill after an attempt (Bayesian-ish EMA on correctness,
// time-aware). Returns new model (immutable update).
export function recordAttempt(m: LearnerModel, a: Attempt): LearnerModel {
  const st = m.skills[a.skill] ?? ZERO_SKILL();
  const seen = st.seen + 1;
  const correct = st.correct + (a.correct ? 1 : 0);
  // mastery moves toward (correct?1:0) with learning rate ~0.25
  const rate = 0.25;
  let mastery = st.mastery + rate * ((a.correct ? 1 : 0) - st.mastery);
  // speed penalty: if correct but slow (>2x expected), cap mastery gain
  const expected = 15000;
  if (a.correct && a.ms > expected * 2) mastery = Math.min(mastery, 0.85);
  mastery = Math.max(0, Math.min(1, mastery));
  const avgMs = st.avgMs ? (st.avgMs * 0.7 + a.ms * 0.3) : a.ms;
  const errors = { ...st.errors };
  if (!a.correct && a.errorCategory) errors[a.errorCategory] = (errors[a.errorCategory] ?? 0) + 1;
  // schedule next review: weaker -> sooner
  const gapMs = a.correct ? (mastery > 0.8 ? 7 : 2) * 86400000 : 0.5 * 86400000;
  const skills = {
    ...m.skills,
    [a.skill]: { ...st, seen, correct, mastery, avgMs, lastSeen: a.ts, due: a.ts + gapMs, errors },
  };
  return { ...m, skills, history: [...m.history, a].slice(-500) };
}

// ---- ADAPTIVE SELECTION ----
// Priority = low mastery * examWeight, boosted if due/overdue, gated by prerequisites.
export interface NextPick {
  skillId: string;
  reason: string;
}

export function selectNext(m: LearnerModel): NextPick {
  const now = Date.now();
  let best: { id: string; score: number; reason: string } | null = null;
  for (const s of SKILLS) {
    const st = m.skills[s.id];
    // prerequisite check: skip if a prerequisite is still weak (<0.6)
    const prereqOk = s.prerequisites.every((p) => (m.skills[p]?.mastery ?? 0) >= 0.55);
    if (!prereqOk) {
      // find weakest prerequisite to surface instead
      const weak = s.prerequisites.find((p) => (m.skills[p]?.mastery ?? 0) < 0.55);
      if (weak && (!best || 0 > best.score)) {
        best = best ?? { id: weak, score: 0, reason: "" };
      }
      continue;
    }
    const overdue = st.due <= now ? 1.5 : 1;
    const score = (1 - st.mastery) * s.examWeight * overdue;
    if (!best || score > best.score) {
      best = { id: s.id, score, reason: st.mastery < 0.4 ? "Schwache Grundlage" : st.due <= now ? "Fällige Wiederholung" : "Hohe Prüfungsrelevanz" };
    }
  }
  if (!best) return { skillId: SKILLS[0].id, reason: "Start" };
  return { skillId: best.id, reason: best.reason };
}

// ---- DIAGNOSTIC ----
// Adaptive: start at band 1, increase difficulty on streak, drop on failure.
export function diagnosticQuestions(): string[] {
  // one representative skill per band start
  return ["add", "mul", "div", "pct", "de-vocab", "de-read", "log-seq", "frac", "dec", "word"];
}

// ---- READINESS (honest estimate, not faked score) ----
export function readinessBySubject(m: LearnerModel): Record<Subject, number> {
  const out = { math: 0, german: 0, logic: 0 } as Record<Subject, number>;
  const counts = { math: 0, german: 0, logic: 0 } as Record<Subject, number>;
  for (const s of SKILLS) {
    out[s.subject] += m.skills[s.id]?.mastery ?? 0;
    counts[s.subject] += 1;
  }
  (Object.keys(out) as Subject[]).forEach((k) => (out[k] = counts[k] ? Math.round((out[k] / counts[k]) * 100) : 0));
  return out;
}

export function overallReadiness(m: LearnerModel): number {
  const r = readinessBySubject(m);
  return Math.round((r.math + r.german + r.logic) / 3);
}
