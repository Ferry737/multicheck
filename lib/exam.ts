// lib/exam.ts — Exam state machine + persistence + timing + scoring (Loop 1-9, 11).
// Pure, deterministic, testable. UI consumes this; no scattered booleans.
import { AREAS, ALL_SUBSKILLS, subskillById, AreaId } from "./curriculum";
import { gradeAnswer, normalizeAnswer as norm } from "./grading";
import { Question, generateBatch } from "./questions";
import { CoachModel, recordSimulation, emptyCoach } from "./coach";

export type ExamPhase =
  | "not_started" | "instructions" | "active" | "transition"
  | "writing" | "confirming" | "submitting" | "completed" | "interrupted" | "error";

export type ExamMode = "standort" | "mini" | "voll";

interface Section {
  area: AreaId;
  subskills: string[];
  questions: Question[];
  order: number[];        // indices into questions
  startTs?: number;
  endTs?: number;
}

export interface ExamSnapshot {
  version: number;
  mode: ExamMode;
  phase: ExamPhase;
  seed: number;
  startedAt: number;
  absoluteDeadline: number;       // anti-exploit: only absolute deadline persisted
  totalMs: number;
  sections: Section[];
  currentSection: number;
  currentIndex: number;            // index within current section's order
  answers: Record<string, string>; // qid -> student answer
  correct: Record<string, boolean>;
  responseTimes: Record<string, number>;
  questionStart: Record<string, number>;
  writingDraft: string;
  writingDeadline: number;
  submitted: boolean;
  sectionOrder: AreaId[];
  memorizePhaseEnded?: Record<number, boolean>; // section idx -> memorize done (memory realism)
  finishedSections: number[];
}

const DAY = 86400000;

export function buildExam(mode: ExamMode, seed = Date.now()): ExamSnapshot {
  const areaOrder = AREAS.map((a) => a.id);
  const perArea = mode === "standort" ? 1 : mode === "mini" ? 3 : 7;
  const sections: Section[] = AREAS.filter((a) => a.id !== "textschreiben").map((a, si) => {
    const qs: Question[] = [];
    for (const s of a.subskills) {
      if (s.id === "textschreiben") continue;
      qs.push(...generateBatch(s.id, 2, perArea, seed + si * 1000 + 7));
    }
    const order = qs.map((_, i) => i);
    return { area: a.id, subskills: a.subskills.map((s) => s.id), questions: qs, order };
  });
  const totalMs = mode === "standort" ? 10 * 60000 : mode === "mini" ? 25 * 60000 : 90 * 60000;
  return {
    version: 1, mode, phase: "instructions", seed,
    startedAt: Date.now(), absoluteDeadline: Date.now() + totalMs, totalMs,
    sections, currentSection: 0, currentIndex: 0,
    answers: {}, correct: {}, responseTimes: {}, questionStart: {},
    writingDraft: "", writingDeadline: 0,
    submitted: false, sectionOrder: areaOrder, memorizePhaseEnded: {},
    finishedSections: [],
  };
}

export function currentQuestion(s: ExamSnapshot): Question | null {
  if (s.phase !== "active" && s.phase !== "writing") return null;
  const sec = s.sections[s.currentSection];
  if (!sec) return null;
  const qi = sec.order[s.currentIndex];
  return sec.questions[qi] ?? null;
}

export function remainingMs(s: ExamSnapshot, now = Date.now()): number {
  // anti-exploit: derived from absolute deadline only
  return Math.max(0, s.absoluteDeadline - now);
}

export function answerCurrent(s: ExamSnapshot, value: string, now = Date.now()): ExamSnapshot {
  const q = currentQuestion(s);
  if (!q) return s;
  const correct = gradeAnswer(value, q.answer, q.kind);
  const rt = s.questionStart[q.id] ? now - s.questionStart[q.id] : 0;
  return {
    ...s,
    answers: { ...s.answers, [q.id]: value },
    correct: { ...s.correct, [q.id]: correct },
    responseTimes: { ...s.responseTimes, [q.id]: rt },
  };
}

export function startQuestion(s: ExamSnapshot, now = Date.now()): ExamSnapshot {
  const q = currentQuestion(s);
  if (!q) return s;
  return { ...s, questionStart: { ...s.questionStart, [q.id]: now } };
}

// advance to next question/section; sets phase transitions
export function advance(s: ExamSnapshot, now = Date.now()): ExamSnapshot {
  if (s.phase === "writing") {
    // after writing -> confirming
    return { ...s, phase: "confirming" };
  }
  const sec = s.sections[s.currentSection];
  if (!sec) return { ...s, phase: "completed" };
  if (s.currentIndex + 1 < sec.order.length) {
    return { ...s, currentIndex: s.currentIndex + 1, questionStart: {} };
  }
  // section finished
  const finished = [...s.finishedSections, s.currentSection];
  if (s.currentSection + 1 < s.sections.length) {
    return {
      ...s, currentSection: s.currentSection + 1, currentIndex: 0,
      phase: "transition", finishedSections: finished, questionStart: {},
    };
  }
  // all sections done -> writing (if not standort) else confirming
  if (s.mode === "standort") return { ...s, phase: "confirming", finishedSections: finished };
  return { ...s, phase: "writing", writingDeadline: now + 10 * 60000, finishedSections: finished };
}

export function enterActive(s: ExamSnapshot, now = Date.now()): ExamSnapshot {
  const sec = s.sections[s.currentSection];
  if (!sec || sec.order.length === 0) return { ...s, phase: "active" };
  const qi = sec.order[Math.min(s.currentIndex, sec.order.length - 1)];
  const q = sec.questions[qi];
  return { ...s, phase: "active", questionStart: q ? { [q.id]: now } : {} };
}

export function submit(s: ExamSnapshot, now = Date.now()): ExamSnapshot {
  return { ...s, phase: "submitting", submitted: true };
}

export function finalize(s: ExamSnapshot): ExamSnapshot {
  return { ...s, phase: "completed" };
}

// ---- Post-exam breakdown (Loop 9) ----
export interface AreaResult { area: AreaId; accuracy: number; avgMs: number; confidence: number; weak: boolean; }
export interface SubResult { subskill: string; accuracy: number; avgMs: number; }

export function examBreakdown(s: ExamSnapshot): { overall: { accuracy: number; avgMs: number }; areas: AreaResult[]; subs: SubResult[] } {
  const qids = Object.keys(s.correct);
  const total = qids.length;
  const correctN = qids.filter((id) => s.correct[id]).length;
  const avgMs = total ? Math.round(qids.reduce((a, id) => a + (s.responseTimes[id] || 0), 0) / total) : 0;
  const overall = { accuracy: total ? correctN / total : 0, avgMs };

  const byArea: Record<string, { c: number; n: number; ms: number }> = {};
  const bySub: Record<string, { c: number; n: number; ms: number }> = {};
  for (const sec of s.sections) {
    for (const qi of sec.order) {
      const q = sec.questions[qi];
      const got = s.correct[q.id] ? 1 : 0;
      const ms = s.responseTimes[q.id] || 0;
      byArea[q.area] = byArea[q.area] || { c: 0, n: 0, ms: 0 };
      byArea[q.area].c += got; byArea[q.area].n += 1; byArea[q.area].ms += ms;
      bySub[q.subskill] = bySub[q.subskill] || { c: 0, n: 0, ms: 0 };
      bySub[q.subskill].c += got; bySub[q.subskill].n += 1; bySub[q.subskill].ms += ms;
    }
  }
  const areas: AreaResult[] = AREAS.map((a) => {
    const d = byArea[a.id] || { c: 0, n: 0, ms: 0 };
    const acc = d.n ? d.c / d.n : 0;
    return { area: a.id, accuracy: acc, avgMs: d.n ? Math.round(d.ms / d.n) : 0, confidence: d.n >= 3 ? 1 : d.n / 3, weak: acc < 0.6 };
  });
  const subs: SubResult[] = ALL_SUBSKILLS.filter((x) => x.id !== "textschreiben").map((x) => {
    const d = bySub[x.id] || { c: 0, n: 0, ms: 0 };
    return { subskill: x.id, accuracy: d.n ? d.c / d.n : 0, avgMs: d.n ? Math.round(d.ms / d.n) : 0 };
  });
  return { overall, areas, subs };
}

// ---- Fatigue analysis (Loop 11) ----
export function fatigueAnalysis(s: ExamSnapshot): { first: number; middle: number; final: number; degraded: boolean } {
  const qids = Object.keys(s.correct);
  const third = Math.ceil(qids.length / 3);
  const slice = (arr: string[]) => { const c = arr.filter((id) => s.correct[id]).length; return arr.length ? c / arr.length : 0; };
  const first = slice(qids.slice(0, third));
  const middle = slice(qids.slice(third, 2 * third));
  const final = slice(qids.slice(2 * third));
  return { first, middle, final, degraded: first - final > 0.15 };
}

// ---- Simulation -> student model (Loop 10) ----
export function applyExamToModel(m: CoachModel, s: ExamSnapshot, mode: ExamMode): CoachModel {
  const results = Object.keys(s.correct).map((id) => {
    const sec = s.sections.find((x) => x.questions.some((q) => q.id === id))!;
    const q = sec.questions.find((x) => x.id === id)!;
    return { subskill: q.subskill, correct: s.correct[id], ms: s.responseTimes[id] || 0 };
  });
  const weightedMode = mode === "voll" ? "full-sim" : "mini-sim";
  let model = recordSimulation(m, results, weightedMode as "full-sim" | "mini-sim");
  const f = fatigueAnalysis(s);
  if (f.degraded) {
    const subs = model.subs;
    for (const a of AREAS) for (const sk of a.subskills) {
      if (subs[sk.id]) subs[sk.id] = { ...subs[sk.id], retention: Math.max(0, subs[sk.id].retention - 0.05) };
    }
    model = { ...model, subs };
  }
  return model;
}

// ---- Autopilot plan (Loop 12) ----
export interface AutoPlan { today: string; tomorrow: string; in2: string; notes: string[]; }
export function weeklyPlan(m: CoachModel, examDate = m.examDate): AutoPlan {
  const days = Math.max(0, Math.ceil((new Date(examDate).getTime() - Date.now()) / DAY));
  const weak = ALL_SUBSKILLS.filter((s) => (m.subs[s.id]?.mastery ?? 0) < 0.4);
  const near = days <= 7;
  const today = near
    ? `Schwerpunkt: ${weak.slice(0, 2).map((s) => s.name).join(" + ") || "Erhaltung"} · Simulation + Tempo`
    : `Schwerpunkt: ${weak.slice(0, 3).map((s) => s.name).join(" + ") || "Ausbau"} · Konzeptaufbau`;
  return {
    today,
    tomorrow: "Gemischt + Spaced Review",
    in2: days <= 28 ? "Mini-Simulation" : "Adaptive Practice",
    notes: [
      `Noch ${days} Tage bis Prüfung`,
      weak.length ? `${weak.length} schwache Bereiche` : "Keine schwachen Bereiche",
    ],
  };
}
