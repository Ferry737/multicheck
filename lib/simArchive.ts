/**
 * APPEND-ONLY SIMULATION ARCHIVE.
 *
 * ROOT PROBLEM this solves: app/pruefung/page.tsx called clearExam() immediately
 * after applyExamToModel(), deleting the raw per-question answers while the
 * graded verdicts had already been folded into mastery/simPerf/readiness. When
 * the grading defect was found (typed "1,0" / "24,60" scored WRONG), the damage
 * could NOT be recomputed — remediation was forced to invalidate the values.
 *
 * With this archive, any future grading change is HEALABLE: re-grade the stored
 * raw answers with gradeAnswer() and rebuild derived metrics. It also supplies
 * the raw data that per-item difficulty calibration needs.
 *
 * RETENTION: newest MAX_RECORDS answer records are kept (append-only, oldest
 * dropped first). Sized for ~2 months of realistic use: a full simulation is
 * ~60 items, a mini ~20; 2000 records covers roughly 30+ full simulations.
 * Cap is enforced on write so localStorage quota cannot be exhausted.
 */
import { gradeAnswer } from "./grading";

export const ARCHIVE_KEY = "multicheck-sim-archive-v1";
export const MAX_RECORDS = 2000;

export interface ArchivedAnswer {
  examId: string;        // groups records belonging to one simulation
  timestamp: number;     // when the simulation was submitted
  mode: string;          // "mini" | "voll"
  qid: string;
  subskill: string;
  answer: string;        // RAW student input, exactly as typed
  correctAnswer: string; // the expected answer at the time
  gradedVerdict: boolean;// what the grader decided THEN
  structHash: string;    // for later item/difficulty calibration
  kind?: string;         // "choice" | undefined — needed to re-grade correctly
  ms: number;
}

export function loadArchive(): ArchivedAnswer[] {
  try {
    const raw = localStorage.getItem(ARCHIVE_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw);
    return Array.isArray(p) ? (p as ArchivedAnswer[]) : [];
  } catch { return []; }
}

/** Append records. Never rewrites history; oldest records fall off the cap. */
export function appendArchive(records: ArchivedAnswer[]): number {
  if (!records.length) return 0;
  try {
    const merged = [...loadArchive(), ...records].slice(-MAX_RECORDS);
    localStorage.setItem(ARCHIVE_KEY, JSON.stringify(merged));
    return merged.length;
  } catch {
    return 0; // quota: archiving is best-effort and must never break a submission
  }
}

/**
 * Re-grade every archived answer with the CURRENT grader.
 * Returns the corrected per-subskill results plus a count of verdicts that
 * changed, so a caller can decide whether rebuilding metrics is warranted.
 */
export function regradeArchive(archive: ArchivedAnswer[] = loadArchive()): {
  changed: number;
  results: { subskill: string; correct: boolean; ms: number }[];
  perSubskill: Record<string, { before: number; after: number; total: number }>;
} {
  const results: { subskill: string; correct: boolean; ms: number }[] = [];
  const perSubskill: Record<string, { before: number; after: number; total: number }> = {};
  let changed = 0;

  for (const r of archive) {
    const nowCorrect = gradeAnswer(r.answer, r.correctAnswer, r.kind);
    if (nowCorrect !== r.gradedVerdict) changed++;
    results.push({ subskill: r.subskill, correct: nowCorrect, ms: r.ms });
    const b = (perSubskill[r.subskill] ??= { before: 0, after: 0, total: 0 });
    b.total++;
    if (r.gradedVerdict) b.before++;
    if (nowCorrect) b.after++;
  }
  return { changed, results, perSubskill };
}

/** Build archive records from a completed exam snapshot. */
export function recordsFromSnapshot(
  s: {
    startedAt: number;
    answers: Record<string, string>;
    correct: Record<string, boolean>;
    responseTimes: Record<string, number>;
    sections: { questions: { id: string; answer: string; subskill: string; structHash?: string; templateKey?: string; kind?: string }[] }[];
  },
  mode: string,
  now = Date.now()
): ArchivedAnswer[] {
  const examId = `${mode}-${s.startedAt}`;
  const out: ArchivedAnswer[] = [];
  for (const qid of Object.keys(s.answers)) {
    let q: { id: string; answer: string; subskill: string; structHash?: string; templateKey?: string; kind?: string } | undefined;
    for (const sec of s.sections) {
      const hit = sec.questions.find((x) => x.id === qid);
      if (hit) { q = hit; break; }
    }
    if (!q) continue;
    out.push({
      examId, timestamp: now, mode, qid,
      subskill: q.subskill,
      answer: s.answers[qid] ?? "",
      correctAnswer: q.answer,
      gradedVerdict: Boolean(s.correct[qid]),
      structHash: q.structHash ?? q.templateKey ?? "",
      kind: q.kind,
      ms: s.responseTimes[qid] ?? 0,
    });
  }
  return out;
}
