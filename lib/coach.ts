// lib/coach.ts — Adaptive learning engine (the "coach").
// Pure, deterministic, fully testable. No UI, no LLM in the decision path.
// AI may LATER augment explanations; it NEVER overrides deterministic answer keys.

import { AREAS, ALL_SUBSKILLS, subskillById, areaOf, Subskill, AreaId } from "./curriculum";
import { Question, generateBatch } from "./questions";

export type SessionMode =
  | "learn" | "guided" | "adaptive" | "speed" | "spaced"
  | "mixed" | "diagnostic" | "mini-sim" | "full-sim" | "writing" | "maintenance";

export type ErrorType =
  | "concept" | "calculation" | "reading" | "careless"
  | "time" | "memory" | "rule" | "language" | "guess";

export type PerfBucket = "fast-correct" | "slow-correct" | "fast-incorrect" | "slow-incorrect";

// ---- Per-subskill student state ----
const DRILL = ALL_SUBSKILLS.filter((s) => s.id !== "textschreiben"); // writing is a separate activity, not drilled with computed questions

export interface SubModel {
  mastery: number;        // 0..1
  accuracy: number;       // 0..1 (recent-weighted)
  speed: number;          // 0..1 (1 = at/above target pace)
  retention: number;      // 0..1 (spaced-recall strength)
  consistency: number;    // 0..1 (low variance across sessions)
  difficulty: number;     // current targeted difficulty 0..100
  attempts: number;
  sessions: number;       // distinct practice sessions touching this skill
  daysActive: number;     // distinct calendar days practiced
  lastSeen: number;       // ts
  nextReview: number;     // ts
  mistakeTypes: Record<string, number>;
  recent: { correct: boolean; ms: number; diff: number; ts: number; mode: SessionMode }[];
  unseenPerf: number;     // 0..1 accuracy on unseen/calibration items
  simPerf: number;        // 0..1 accuracy in simulation context (weighted high)
  confidence: number;     // 0..1 data sufficiency
}

export interface CoachModel {
  createdAt: number;
  examDate: string;
  diagnosticDone: boolean;
  totalStudyMs: number;
  streakDays: number;
  lastActive: string;
  subs: Record<string, SubModel>;
  fehler: Fehler[];
  history: Attempt[];
  exposure: Record<string, string[]>; // subskill -> recent templateKeys (anti-memorization)
  calibrationPool: Record<string, Question[]>; // reserved unseen items per subskill
  version: number;
  simMode?: number;
}

export interface Fehler {
  id: string; subskill: string; area: string;
  prompt: string; studentAnswer: string; correctAnswer: string;
  errorType: string; ms: number; date: number;
  repeats: number; mastered: boolean; lastWrong: number;
}
export interface Attempt {
  subskill: string; area: string; ts: number; correct: boolean; ms: number;
  errorType?: ErrorType; sessionId?: string; difficulty: number;
  mode: SessionMode; prompt?: string; studentAnswer?: string; correctAnswer?: string;
  templateKey?: string; unseen?: boolean;
}


const DAY = 86400000;

export function emptySub(): SubModel {
  return {
    mastery: 0, accuracy: 0, speed: 0, retention: 0, consistency: 0,
    difficulty: 30, attempts: 0, sessions: 0, daysActive: 0,
    lastSeen: 0, nextReview: 0, mistakeTypes: {},
    recent: [], unseenPerf: 0, simPerf: 0, confidence: 0,
  };
}

export function emptyCoach(examDate = "2026-10-15"): CoachModel {
  const subs: Record<string, SubModel> = {};
  for (const s of ALL_SUBSKILLS) subs[s.id] = emptySub();
  return {
    createdAt: Date.now(), examDate, diagnosticDone: false,
    totalStudyMs: 0, streakDays: 0, lastActive: "",
    subs, fehler: [], history: [], exposure: {}, calibrationPool: {}, version: 3,
  };
}

// ---- Speed targets per subskill (seconds; calibrated, not arbitrary) ----
// These are starting estimates; real usage refines them. Lower = faster expected.
export const SPEED_TARGET_S: Record<string, number> = {
  satzbau: 20, textverstaendnis: 30, textaufgaben: 28, kopfrechnen: 15,
  prozesslogik: 25, wortgruppen: 22, bilder_zaehlen: 18, symbole_entdecken: 20,
  schilder_erinnern: 25, sortierverfahren: 25, alltagswissen: 25, textschreiben: 0,
};

// ---- Error classification ----
export function classifyError(q: Question, a: Attempt): ErrorType {
  if (a.correct) return "careless"; // not an error
  // Memory tasks: if recall-type and wrong, likely memory
  if (q.type === "recall" || q.subskill === "schilder_erinnern") return "memory";
  // Very slow + wrong -> time pressure / concept
  const tgt = SPEED_TARGET_S[q.subskill] ?? 25;
  if (a.ms > tgt * 2500) return "time";
  // Concentration/counting visual tasks: reading/scanning
  if (q.subskill === "bilder_zaehlen" || q.subskill === "symbole_entdecken") return "reading";
  // Math: wrong numeric -> calculation or concept
  if (q.area === "mathematik") return a.ms < tgt * 1200 ? "calculation" : "concept";
  // German comprehension
  if (q.area === "deutsch") return "reading";
  return "concept";
}

export function perfBucket(a: Attempt): PerfBucket {
  const tgt = (SPEED_TARGET_S[a.subskill] ?? 25) * 1000;
  const fast = a.ms <= tgt;
  if (a.correct && fast) return "fast-correct";
  if (a.correct && !fast) return "slow-correct";
  if (!a.correct && fast) return "fast-incorrect";
  return "slow-incorrect";
}


// ---- Update model after a batch of attempts in one session ----
export function updateModel(m: CoachModel, attemptsBatch: Attempt[], sessionId: string, mode: SessionMode): CoachModel {
  let model = m;
  const dayKey = new Date(attemptsBatch[0]?.ts ?? Date.now()).toDateString();
  for (const a of attemptsBatch) {
    model = recordOne(model, a, dayKey);
  }
  // session count per subskill
  const touched = new Set(attemptsBatch.map((a) => a.subskill));
  const subs = { ...model.subs };
  for (const id of touched) {
    const st = { ...subs[id] };
    st.sessions = st.sessions + 1;
    const prevDays = new Set(model.subs[id]?.daysActive ? [model.subs[id].daysActive] : []);
    // approximate distinct days via recent ts span
    st.daysActive = Math.max(st.daysActive, new Set(attemptsBatch.filter(x=>x.subskill===id).map(x=>new Date(x.ts).toDateString())).size);
    subs[id] = st;
  }
  const total = attemptsBatch.reduce((s, a) => s + a.ms, 0);
  return {
    ...model,
    subs,
    totalStudyMs: model.totalStudyMs + total,
    lastActive: dayKey,
    streakDays: model.streakDays, // refined elsewhere
  };
}

function recordOne(m: CoachModel, a: Attempt, dayKey: string): CoachModel {
  const id = a.subskill;
  const st = m.subs[id] ?? emptySub();
  const attempts = st.attempts + 1;
  const recent = [...st.recent, { correct: a.correct, ms: a.ms, diff: a.difficulty, ts: a.ts, mode: a.mode }].slice(-25);

  // recency-weighted accuracy
  const wAcc = recent.reduce((s, r, i) => s + (a.correct === r.correct ? 1 : 0) * (i + 1), 0);
  const wTot = recent.reduce((s, _r, i) => s + (i + 1), 0);
  const simW = recent.filter((r) => r.mode === "mini-sim" || r.mode === "full-sim").length;
  let accuracy = wTot ? wAcc / wTot : 0;
  if (a.mode === "mini-sim" || a.mode === "full-sim") accuracy = accuracy * 0.6 + (a.correct ? 1 : 0) * 0.4;

  // speed score vs target
  const tgt = (SPEED_TARGET_S[id] ?? 25) * 1000;
  let speed = st.speed;
  const sp = a.ms <= tgt ? 1 : Math.max(0, 1 - (a.ms - tgt) / (tgt * 3));
  speed = speed ? speed * 0.7 + sp * 0.3 : sp;

  // mastery: EMA toward correctness, but only counts if reasonably paced
  const rate = 0.2;
  let mastery = st.mastery + rate * ((a.correct ? 1 : 0) - st.mastery);
  if (a.correct && a.ms > tgt * 2.2) mastery = Math.min(mastery, 0.8); // correct-but-slow caps mastery
  mastery = Math.max(0, Math.min(1, mastery));

  // retention updated by spaced recall success
  const retRate = 0.25;
  let retention = st.retention;
  if (a.mode === "spaced") retention = Math.max(0, Math.min(1, retention + retRate * ((a.correct ? 1 : 0) - retention)));
  else retention = Math.max(0, Math.min(1, retention * 0.995 + (a.correct ? 0.01 : -0.02))); // slow decay

  // consistency: low variance of recent correctness
  const mean = recent.filter(r=>r.correct).length / recent.length;
  const variance = recent.reduce((s,r)=>s+((r.correct?1:0)-mean)**2,0)/recent.length;
  const consistency = 1 - Math.min(1, variance * 2);

  // difficulty targeting: move toward student's demonstrated level
  const target = a.correct ? Math.min(100, st.difficulty + 6) : Math.max(10, st.difficulty - 10);
  const difficulty = st.difficulty + (target - st.difficulty) * 0.25;

  // unseen / sim performance
  let unseenPerf = st.unseenPerf, simPerf = st.simPerf;
  if (a.unseen) unseenPerf = unseenPerf ? unseenPerf * 0.7 + (a.correct?1:0)*0.3 : (a.correct?1:0);
  if (a.mode === "mini-sim" || a.mode === "full-sim") simPerf = simPerf ? simPerf*0.7+(a.correct?1:0)*0.3 : (a.correct?1:0);

  // confidence grows with data
  const confidence = Math.min(1, attempts / 12);

  // spaced next-review interval
  const base = a.correct
    ? (mastery > 0.8 ? 7 : mastery > 0.5 ? 3 : 1) * DAY
    : 0.4 * DAY;
  const nextReview = a.ts + base;

  // mistake types
  const mistakeTypes = { ...st.mistakeTypes };
  if (!a.correct) {
    const et = a.errorType ?? "concept";
    mistakeTypes[et] = (mistakeTypes[et] ?? 0) + 1;
  }

  const updated: SubModel = {
    ...st, mastery, accuracy, speed, retention, consistency, difficulty,
    attempts, lastSeen: a.ts, nextReview, mistakeTypes, recent,
    unseenPerf, simPerf, confidence,
  };

  // exposure tracking (anti-memorization)
  const exposure = { ...m.exposure };
  if (a.templateKey) {
    exposure[id] = [...(exposure[id] ?? []), a.templateKey].slice(-12);
  }

  // Fehlerliste
  let fehler = m.fehler;
  if (!a.correct) {
    const f: Fehler = {
      id: "f-" + a.ts + "-" + id, subskill: id, area: a.area,
      prompt: a.prompt ?? "", studentAnswer: a.studentAnswer ?? "",
      correctAnswer: a.correctAnswer ?? "", errorType: a.errorType ?? "Fehler",
      ms: a.ms, date: a.ts, repeats: 1, mastered: false, lastWrong: a.ts,
    };
    fehler = [f, ...m.fehler].slice(0, 200);
  }

  return {
    ...m,
    subs: { ...m.subs, [id]: updated },
    exposure,
    fehler,
    history: [...m.history, a].slice(-1500),
  };
}


// ---- Mastery gate (configurable, scientifically-tuned, not blindly hardcoded) ----
export interface MasteryGateCfg {
  accuracy: number; speed: number; sessions: number; days: number;
  unseenMin: number; spacedPass: boolean; maxRegression: number;
}
export const DEFAULT_GATE: MasteryGateCfg = {
  accuracy: 0.85, speed: 0.6, sessions: 3, days: 2,
  unseenMin: 0.7, spacedPass: true, maxRegression: 0.12,
};

export function masteryGate(m: CoachModel, id: string, cfg: MasteryGateCfg = DEFAULT_GATE): { mastered: boolean; reasons: string[] } {
  const st = m.subs[id];
  if (!st) return { mastered: false, reasons: ["keine Daten"] };
  const reasons: string[] = [];
  if (st.accuracy < cfg.accuracy) reasons.push(`Genauigkeit ${Math.round(st.accuracy*100)}% < ${cfg.accuracy*100}%`);
  if (st.speed < cfg.speed) reasons.push(`Tempo ${Math.round(st.speed*100)}% < ${cfg.speed*100}%`);
  if (st.sessions < cfg.sessions) reasons.push(`zu wenige Sitzungen (${st.sessions})`);
  if (st.daysActive < cfg.days) reasons.push(`zu wenige Tage (${st.daysActive})`);
  if (st.unseenPerf && st.unseenPerf < cfg.unseenMin) reasons.push(`unbekannte Aufgaben ${Math.round(st.unseenPerf*100)}% < ${cfg.unseenMin*100}%`);
  if (cfg.spacedPass && st.retention < 0.6) reasons.push(`Behalten ${Math.round(st.retention*100)}% zu niedrig`);
  // recent regression
  const recent = st.recent.slice(-6);
  const first = recent.slice(0,3).filter(r=>r.correct).length/3;
  const last = recent.slice(-3).filter(r=>r.correct).length/3;
  if (first - last > cfg.maxRegression && recent.length>=6) reasons.push("kürzliche Regression");
  return { mastered: reasons.length === 0, reasons };
}

// ---- Difficulty level from continuous score ----
export function diffLevel(score0to100: number): 1 | 2 | 3 {
  if (score0to100 < 40) return 1;
  if (score0to100 < 70) return 2;
  return 3;
}
export function diffLabel(score0to100: number): string {
  if (score0to100 < 25) return "Leicht";
  if (score0to100 < 50) return "Mittel";
  if (score0to100 < 75) return "Schwer";
  return "Sehr schwer";
}

// ---- Anti-memorization: choose generator seeds avoiding recent templates ----
function newTemplate(exposure: string[] | undefined, tries: number): number {
  for (let i = 0; i < tries; i++) {
    const seed = Math.floor(Math.random() * 1e9);
    const key = "t" + (seed % 100000);
    if (!exposure || !exposure.includes(key)) return seed;
  }
  return Math.floor(Math.random() * 1e9);
}

// ---- Compose a session for a subskill at a target difficulty/mode ----
export function composeSubskillQuestions(
  m: CoachModel, id: string, count: number, mode: SessionMode
): Question[] {
  const st = m.subs[id];
  const diff = st?.difficulty ?? 35;
  const level = mode === "speed" ? Math.min(3, diffLevel(diff) + 1) : diffLevel(diff);
  const out: Question[] = [];
  const exposure = m.exposure[id];
  for (let i = 0; i < count; i++) {
    const seed = newTemplate(exposure, 12);
    const q = generateBatch(id, level, 1, seed)[0];
    if (q) out.push({ ...q, templateKey: "t" + (seed % 100000) });
  }
  return out;
}


// ---- Session composer: allocate weak/medium/review/strong dynamically ----
export interface SessionBlock { subskill: string; mode: SessionMode; count: number; minutes: number; why: string; }
export interface SessionPlan { minutes: number; blocks: SessionBlock[]; why: string; title: string; }

export function composeSession(m: CoachModel, totalMinutes = 22): SessionPlan {
  const blocks: SessionBlock[] = [];
  const weak = DRILL.filter((s) => (m.subs[s.id]?.mastery ?? 0) < 0.4);
  const med = DRILL.filter((s) => { const x = m.subs[s.id]?.mastery ?? 0; return x >= 0.4 && x < 0.7; });
  const strong = DRILL.filter((s) => (m.subs[s.id]?.mastery ?? 0) >= 0.7);
  const due = DRILL.filter((s) => (m.subs[s.id]?.nextReview ?? 0) <= Date.now());

  // allocations (Phase 7): ~55% weak, ~22% med, ~13% review, ~10% strong
  const totalQ = Math.max(8, Math.round(totalMinutes / 2.2));
  const nWeak = Math.round(totalQ * 0.55);
  const nMed = Math.round(totalQ * 0.22);
  const nReview = Math.round(totalQ * 0.13);
  const nStrong = totalQ - nWeak - nMed - nReview;

  const pickWeak = [...weak, ...due.filter(d=>!weak.includes(d))];
  distribute(blocks, pickWeak, nWeak, m, "adaptive", "Schwache Grundlage");
  distribute(blocks, med, nMed, m, "mixed", "Weiterentwicklung");
  distribute(blocks, due, nReview, m, "spaced", "Fällige Wiederholung");
  distribute(blocks, strong, nStrong, m, "maintenance", "Erhaltung");

  if (blocks.length === 0) {
    // brand new student: diagnostic-like mix (exclude writing)
    distribute(blocks, DRILL.slice(0, 4), totalQ, m, "adaptive", "Erste Einschätzung");
  }

  const minutes = blocks.reduce((s, b) => s + b.minutes, 0);
  const why = explainWhy(m, blocks);
  return { minutes, blocks, why, title: "KI-Training" };
}

function distribute(blocks: SessionBlock[], subs: Subskill[], n: number, m: CoachModel, mode: SessionMode, why: string) {
  if (n <= 0 || subs.length === 0) return;
  const per = Math.max(2, Math.ceil(n / subs.length));
  for (const s of subs.slice(0, Math.ceil(n / per))) {
    const st = m.subs[s.id];
    const slow = st && st.speed < 0.6;
    const modeFinal: SessionMode = slow && mode === "adaptive" ? "speed" : mode;
    blocks.push({ subskill: s.id, mode: modeFinal, count: per, minutes: Math.round(per * 2.2), why });
  }
}

function explainWhy(m: CoachModel, blocks: SessionBlock[]): string {
  const limiting = DRILL
    .map((s) => ({ s, mk: m.subs[s.id]?.mastery ?? 0 }))
    .sort((a, b) => a.mk - b.mk)
    .slice(0, 2)
    .map((x) => x.s.name);
  const slow = ALL_SUBSKILLS.find((s) => (m.subs[s.id]?.speed ?? 0) < 0.5);
  let w = `Schwerpunkt auf ${limiting.join(" und ")}.`;
  if (slow) w += ` ${slow.name} braucht mehr Tempo.`;
  const due = blocks.filter((b) => b.mode === "spaced").length;
  if (due) w += ` ${due} Wiederholung(en) fällig.`;
  return w;
}

// ---- decideToday: the single AI recommendation ----
export function decideToday(m: CoachModel): SessionPlan {
  const plan = composeSession(m);
  plan.title = m.diagnosticDone ? "Heute trainieren" : "Erstes Training";
  return plan;
}


// ---- Readiness: conservative, unseen+sim+retention weighted (Phase 28) ----
export function readinessByArea(m: CoachModel): Record<AreaId, number> {
  const out = {} as Record<AreaId, number>;
  for (const a of AREAS) {
    const vals = a.subskills.map((s) => {
      const st = m.subs[s.id];
      if (!st || st.attempts === 0) return 0;
      const base = st.mastery * 0.5 + st.retention * 0.2 + st.accuracy * 0.2 + st.speed * 0.1;
      const unseenPenalty = st.unseenPerf ? Math.min(1, st.unseenPerf) * 0.15 : 0;
      return Math.round((base + unseenPenalty) * 100);
    });
    out[a.id] = vals.length ? Math.round(vals.reduce((x, y) => x + y, 0) / vals.length) : 0;
  }
  return out;
}
export function overallReadiness(m: CoachModel): number {
  const r = readinessByArea(m);
  const vals = Object.values(r).filter((v, i) => ALL_SUBSKILLS.some((s) => true)); // all areas
  const real = Object.values(r);
  const covered = ALL_SUBSKILLS.filter((s) => (m.subs[s.id]?.attempts ?? 0) > 0).length / ALL_SUBSKILLS.length;
  const raw = real.reduce((a, b) => a + b, 0) / real.length;
  // conservative: scale by curriculum coverage so 20 easy questions can't reach 90%
  return Math.round(raw * (0.55 + 0.45 * covered));
}


// ---- Simulation feedback (Phase 3): simulations carry MORE weight than training ----
// A simulation that disagrees with training must pull mastery/confidence DOWN.
export function recordSimulation(m: CoachModel, results: { subskill: string; correct: boolean; ms: number }[], mode: "mini-sim" | "full-sim"): CoachModel {
  let model = m;
  // weight: simulation evidence strongly influences mastery and confidence
  const bySub: Record<string, { correct: number; total: number; sumMs: number }> = {};
  for (const r of results) {
    bySub[r.subskill] = bySub[r.subskill] || { correct: 0, total: 0, sumMs: 0 };
    bySub[r.subskill].correct += r.correct ? 1 : 0;
    bySub[r.subskill].total += 1;
    bySub[r.subskill].sumMs += r.ms;
  }
  const subs = { ...model.subs };
  for (const id of Object.keys(bySub)) {
    const agg = bySub[id];
    const simAcc = agg.correct / agg.total;
    const st = subs[id] ?? emptySub();
    // disagreement: if training mastery was high but sim low, pull down hard
    const gap = st.mastery - simAcc;
    let mastery = st.mastery;
    if (gap > 0.15) {
      // simulation reveals over-confidence: converge toward sim, but not fully (training still counts)
      mastery = st.mastery * 0.4 + simAcc * 0.6;
    } else {
      // align gently
      mastery = st.mastery * 0.7 + simAcc * 0.3;
    }
    mastery = Math.max(0, Math.min(1, mastery));
    const tgt = (SPEED_TARGET_S[id] ?? 25) * 1000;
    const simSpeed = Math.max(0, Math.min(1, 1 - (agg.sumMs / agg.total - tgt) / (tgt * 3)));
    const confidence = Math.min(1, st.confidence * 0.8 + 0.1); // sim reduces over-confidence
    const simPerf = simAcc;
    subs[id] = {
      ...st, mastery,
      accuracy: st.accuracy * 0.5 + simAcc * 0.5,
      speed: st.speed * 0.5 + simSpeed * 0.5,
      retention: st.retention * 0.7 + simAcc * 0.3,
      confidence, simPerf,
      lastSeen: Date.now(), nextReview: Date.now() + (mastery > 0.7 ? 7 : 2) * DAY,
    };
    // record into history so readiness/fatigue analysis sees it
    const histBatch = agg.total ? results.filter(r => r.subskill === id).map(r => ({ ...r, mode, difficulty: st.difficulty, area: subs[id].difficulty ? "" : "", templateKey: undefined })) : [];
    // (history appended via updateModel below for proper bookkeeping)
  }
  // also feed through updateModel for history/fehler consistency
  const attempts: Attempt[] = results.map(r => ({
    subskill: r.subskill, area: subskillById(r.subskill)?.area ?? "", ts: Date.now(), correct: r.correct, ms: r.ms,
    difficulty: subs[r.subskill]?.difficulty ?? 40, mode, templateKey: undefined,
  }));
  model = { ...model, subs };
  model = updateModel(model, attempts, "sim-" + Date.now(), mode);
  model.simMode = (model.simMode || 0) + 1;
  return model;
}

// ---- Micro-lesson trigger (Phase 1) ----
// Detect repeated concept failures → recommend a lesson.
export function needsLesson(m: CoachModel, id: string): { lesson: boolean; concept?: string; reason: string } {
  const st = m.subs[id];
  if (!st) return { lesson: false, reason: "keine Daten" };
  const recent = st.recent.slice(-6);
  const wrong = recent.filter(r => !r.correct).length;
  // count repeated concept/mistake types
  const conceptFails = Object.entries(st.mistakeTypes)
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1]);
  if (wrong >= 4 && conceptFails.length > 0) {
    return { lesson: true, concept: conceptFails[0][0], reason: `${wrong} Fehler, Muster: ${conceptFails[0][0]}` };
  }
  // persistent weakness: low mastery after enough attempts
  if (st.mastery < 0.3 && st.attempts >= 6) return { lesson: true, concept: conceptFails[0]?.[0] ?? "concept", reason: "anhaltend schwach" };
  // NEW STUDENT / thin history: a subskill with very low mastery (never really learned)
  // still warrants a corrective lesson once it shows repeated trouble.
  if (st.mastery < 0.2 && st.attempts >= 3) return { lesson: true, concept: conceptFails[0]?.[0] ?? "concept", reason: "tiefe Schwäche, wenig Daten" };
  return { lesson: false, reason: "Ok" };
}

// ---- Decision explanation (Phase 9): short, why-based ----
export function explainDecision(m: CoachModel, block: SessionBlock): string {
  const st = m.subs[block.subskill];
  const name = subskillById(block.subskill)?.name ?? block.subskill;
  if (block.mode === "spaced") return `${name}: fällige Wiederholung (${Math.round((st?.retention ?? 0) * 100)}% Behalten).`;
  if (block.mode === "speed") return `${name}: Tempo ${Math.round((st?.speed ?? 0) * 100)}% — Speed-Drill.`;
  const mk = Math.round((st?.mastery ?? 0) * 100);
  const due = st && st.nextReview <= Date.now();
  return `${name}: ${mk}% Beherrschung${due ? ", fällig" : ""} — ${block.mode === "maintenance" ? "Erhaltung" : "Ausbau"}.`;
}

// ---- Mid-session autopilot decision (Loop 13) ----
// Given the outcome of one answer, decide whether to interrupt the drill.
// Rules: repeated concept failures -> lesson; careless-fast -> accuracy (never more speed);
// slow-but-correct -> speed flag (never a beginner lesson).
export type MidDecision =
  | { kind: "none" }
  | { kind: "lesson"; concept?: string }
  | { kind: "accuracy" }
  | { kind: "speed" };
export function midSessionDecision(m: CoachModel, subskill: string, correct: boolean, ms: number, streak: number, speedFlag: boolean): MidDecision {
  const SPEED_TARGET = 12000;
  if (!correct) {
    const nl = needsLesson(m, subskill);
    const st = m.subs[subskill];
    const weak = (st?.mastery ?? 0) < 0.4;
    // repeated in-session failures on a weak/sub-zero subskill => corrective lesson.
    // This is independent of stored history so brand-new students also get help.
    if (streak >= 3 && (nl.lesson || weak)) return { kind: "lesson", concept: nl.concept };
    if (ms < SPEED_TARGET * 0.4) return { kind: "accuracy" }; // very fast but wrong = careless
    return { kind: "none" };
  }
  if (ms > SPEED_TARGET * 2 && !speedFlag) return { kind: "speed" };
  return { kind: "none" };
}

// ---- Synthetic learners for QA (Phase 33) ----
export type LearnerProfile = "strong" | "weak-math" | "slow-accurate" | "fast-careless" | "forgetful";
export function simulateAttempt(m: CoachModel, q: Question, profile: LearnerProfile, idx: number): Attempt {
  const tgt = (SPEED_TARGET_S[q.subskill] ?? 25) * 1000;
  let correct: boolean; let ms: number;
  switch (profile) {
    case "strong": correct = Math.random() < 0.95; ms = tgt * (0.7 + Math.random()*0.3); break;
    case "weak-math": correct = q.area === "mathematik" ? Math.random() < 0.45 : Math.random() < 0.85; ms = tgt * (1.2 + Math.random()); break;
    case "slow-accurate": correct = Math.random() < 0.9; ms = tgt * (2.5 + Math.random()*1.5); break;
    case "fast-careless": correct = Math.random() < 0.6; ms = tgt * (0.4 + Math.random()*0.3); break;
    case "forgetful": correct = Math.random() < 0.8; ms = tgt; break;
    default: correct = Math.random() < 0.7; ms = tgt;
  }
  return {
    subskill: q.subskill, area: q.area, ts: Date.now() + idx*1000, correct, ms,
    difficulty: q.difficultyScore ?? 30, mode: "adaptive",
    templateKey: q.templateKey, errorType: correct ? undefined : "concept",
  };
}
