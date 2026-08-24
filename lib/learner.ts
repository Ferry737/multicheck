// lib/learner.ts — learner model, adaptive priority, spaced repetition, Fehlerliste.
import { AREAS, ALL_SUBSKILLS, subskillById, AreaId } from "./curriculum";

export type Status = "weak" | "normal" | "strong";
export interface Attempt {
  subskill: string; area: string; ts: number; correct: boolean; ms: number;
  errorType?: string; sessionId?: string;
  prompt?: string; studentAnswer?: string; correctAnswer?: string;
}
export interface Fehler {
  id: string; subskill: string; area: string;
  prompt: string; studentAnswer: string; correctAnswer: string;
  errorType: string; ms: number; date: number;
  repeats: number; mastered: boolean; lastWrong: number;
}
export interface SubState {
  mastery: number; seen: number; correct: number; avgMs: number;
  lastSeen: number; due: number; errors: Record<string, number>;
}
export interface LearnerModel {
  createdAt: number; examDate: string;
  diagnosticDone: boolean; streakDays: number; lastActive: string; totalStudyMs: number;
  subs: Record<string, SubState>;
  fehler: Fehler[];
  history: Attempt[];
}

const ZERO = (): SubState => ({ mastery: 0, seen: 0, correct: 0, avgMs: 0, lastSeen: 0, due: 0, errors: {} });

export function emptyModel(examDate = new Date("2026-10-15").toISOString()): LearnerModel {
  const subs: Record<string, SubState> = {};
  for (const s of ALL_SUBSKILLS) subs[s.id] = ZERO();
  return { createdAt: Date.now(), examDate, diagnosticDone: false, streakDays: 0, lastActive: "", totalStudyMs: 0, subs, fehler: [], history: [] };
}

export function statusOf(m: LearnerModel, id: string): Status {
  const x = m.subs[id]?.mastery ?? 0;
  return x < 0.4 ? "weak" : x < 0.7 ? "normal" : "strong";
}
export function masteryOf(m: LearnerModel, id: string) { return m.subs[id]?.mastery ?? 0; }

// priority = weakness × recency × repetition × exam_relevance
export function selectNext(m: LearnerModel): { subskill: string; reason: string } {
  const now = Date.now(); let best: { id: string; score: number; reason: string } | null = null;
  for (const s of ALL_SUBSKILLS) {
    const st = m.subs[s.id]; const weak = 1 - st.mastery;
    const recency = st.lastSeen ? Math.min(1, (now - st.lastSeen) / 86400000 / 7) : 1;
    const repErr = st.seen ? Math.min(1, (st.errors ? Object.values(st.errors).reduce((a, b) => a + b, 0) : 0) / Math.max(1, st.seen)) : 0.3;
    const score = weak * (0.4 + 0.6 * recency) * (0.5 + 0.5 * repErr) * (s.examWeight / 5);
    if (!best || score > best.score) best = { id: s.id, score, reason: st.mastery < 0.4 ? "Schwache Grundlage" : st.due <= now ? "Fällige Wiederholung" : "Hohe Prüfungsrelevanz" };
  }
  return best ? { subskill: best.id, reason: best.reason } : { subskill: ALL_SUBSKILLS[0].id, reason: "Start" };
}

export function recordAttempt(m: LearnerModel, a: Attempt): LearnerModel {
  const st = m.subs[a.subskill] ?? ZERO();
  const seen = st.seen + 1; const correct = st.correct + (a.correct ? 1 : 0);
  const rate = 0.22;
  let mastery = st.mastery + rate * ((a.correct ? 1 : 0) - st.mastery);
  const expected = 18000;
  if (a.correct && a.ms > expected * 2) mastery = Math.min(mastery, 0.82);
  mastery = Math.max(0, Math.min(1, mastery));
  const avgMs = st.avgMs ? st.avgMs * 0.7 + a.ms * 0.3 : a.ms;
  const errors = { ...st.errors };
  if (!a.correct && a.errorType) errors[a.errorType] = (errors[a.errorType] ?? 0) + 1;
  // spaced intervals: same-session(0.4d) → 1d → 3d → 7d → maintenance
  const base = a.correct ? (mastery > 0.8 ? 7 : 2) * 86400000 : 0.4 * 86400000;
  const subs = { ...m.subs, [a.subskill]: { ...st, seen, correct, mastery, avgMs, lastSeen: a.ts, due: a.ts + base, errors } };
  // Fehlerliste
  let fehler = m.fehler;
  if (!a.correct) {
    const f: Fehler = {
      id: "f-" + a.ts + "-" + a.subskill, subskill: a.subskill, area: a.area,
      prompt: a.prompt ?? "", studentAnswer: a.studentAnswer ?? "", correctAnswer: a.correctAnswer ?? "",
      errorType: a.errorType ?? "Fehler", ms: a.ms, date: a.ts, repeats: 1, mastered: false, lastWrong: a.ts,
    };
    fehler = [f, ...m.fehler].slice(0, 200);
  }
  return { ...m, subs, fehler, history: [...m.history, a].slice(-1000) };
}
export function markFehlerMastered(m: LearnerModel, id: string): LearnerModel {
  return { ...m, fehler: m.fehler.map((f) => f.id === id ? { ...f, mastered: true } : f) };
}

// adaptive mix: 60% weak, 25% medium, 15% strong
export function sessionMix(m: LearnerModel): { weak: string[]; med: string[]; strong: string[] } {
  const w: string[] = [], me: string[] = [], st: string[] = [];
  for (const s of ALL_SUBSKILLS) { const x = m.subs[s.id]?.mastery ?? 0; if (x < 0.4) w.push(s.id); else if (x < 0.7) me.push(s.id); else st.push(s.id); }
  return { weak: w, med: me, strong: st };
}

export function readinessByArea(m: LearnerModel): Record<AreaId, number> {
  const out = {} as Record<AreaId, number>; const cnt = {} as Record<AreaId, number>;
  for (const a of AREAS) { out[a.id] = 0; cnt[a.id] = 0; for (const s of a.subskills) { out[a.id] += m.subs[s.id]?.mastery ?? 0; cnt[a.id]++; } out[a.id] = cnt[a.id] ? Math.round((out[a.id] / cnt[a.id]) * 100) : 0; }
  return out;
}
// Readiness formula (TRANSPARENT, not an official score):
//   per-area readiness   = mean(subskill mastery) over that area's subskills
//   overall readiness    = mean(per-area readiness) across the 7 areas
// mastery is updated per attempt via EMA(rate 0.22) toward (correct?1:0), capped at 0.82 if correct-but-slow.
// This is a training estimate only; it does NOT equal the official Multicheck result.
export function overallReadiness(m: LearnerModel): number {
  const r = readinessByArea(m); const vals = Object.values(r); return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}
export function accuracy(m: LearnerModel): number {
  const h = m.history; if (!h.length) return 0; return Math.round((h.filter((x) => x.correct).length / h.length) * 100);
}
export function avgSpeed(m: LearnerModel): number {
  const h = m.history.filter((x) => x.correct); if (!h.length) return 0; return Math.round(h.reduce((a, b) => a + b.ms, 0) / h.length / 1000);
}
// Accuracy vs Speed quadrant
export function quadrant(m: LearnerModel): string {
  const a = accuracy(m) >= 75, s = avgSpeed(m) > 0 && avgSpeed(m) <= 15;
  if (a && s) return "accurate+fast"; if (a && !s) return "accurate+slow"; if (!a && s) return "inaccurate+fast"; return "inaccurate+slow";
}
