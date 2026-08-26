"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { CoachModel, emptyCoach, updateModel, Attempt, SessionMode, recordSimulation } from "@/lib/coach";

const KEY = "multicheck-coach-v3";
const SCHEMA = 3;
/**
 * One-time remediation flag for the pre-76ce485 exam grading defect.
 * lib/exam.ts mis-graded typed numeric answers (1.0 / 1,0 / 24,60 / 1'234 were
 * scored WRONG), and applyExamToModel folded those verdicts into mastery /
 * simPerf / readiness. clearExam() deletes the raw answers on submit, so the
 * affected values CANNOT be recomputed. Measured worst case: mastery understated
 * by 0.852 (0.899 -> 0.047) and simPerf 1.000 -> 0.000 on a 12-item mini-sim.
 * Carrying those numbers forward is a false-readiness failure, so sim-derived
 * signal is invalidated once and the student is told.
 */
const SIM_REGRADE_FLAG = "simRegradeV1";

export type LoadStatus = "loading" | "ready" | "error";

let sessionCounter = 0;
function newSessionId() { return "sess-" + (++sessionCounter) + "-" + Date.now(); }

export function useLearner() {
  const [model, setModel] = useState<CoachModel | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const started = useRef(false);
  const sessionId = useRef<string>(newSessionId());
  const buffer = useRef<Attempt[]>([]);

  const init = useCallback(() => {
    setStatus("loading");
    try {
      const raw = localStorage.getItem(KEY);
      let m: CoachModel;
      if (raw) {
        const parsed = JSON.parse(raw) as any;
        if (!parsed || typeof parsed !== "object" || !parsed.subs) {
          m = emptyCoach();
        } else {
          m = parsed as CoachModel;
          const base = emptyCoach();
          m.subs = { ...base.subs, ...(m.subs || {}) };
          m.fehler = Array.isArray(m.fehler) ? m.fehler : [];
          m.history = Array.isArray(m.history) ? m.history : [];
          m.exposure = (m.exposure && typeof m.exposure === "object" && !Array.isArray(m.exposure))
            ? m.exposure : {};
          m.calibrationPool = m.calibrationPool || {};
          m.lessonsSeen = Array.isArray(m.lessonsSeen) ? m.lessonsSeen : [];
          if (typeof m.examDate !== "string") m.examDate = base.examDate;

          // MIGRATION GUARD (schema v3 -> current engine). The composer reads
          // exposure[id] / [id+":p"] / [id+":pa"] as string[] and [id+":rr"] /
          // [id+":rescueCount"] as number. Storage written by an older build can
          // hold other types; a non-array there throws on .slice(). Coerce, and
          // drop legacy seed-key entries ("t12345") which are not structHashes.
          {
            const exp = m.exposure as Record<string, unknown>;
            let repaired = 0;
            for (const k of Object.keys(exp)) {
              const v = exp[k];
              const isCounter = k.endsWith(":rr") || k.endsWith(":rescueCount") ||
                k.endsWith(":lastSi") || k.includes(":rescueFrom:");
              if (isCounter) {
                const n = Number(v);
                if (!Number.isFinite(n)) { delete exp[k]; repaired++; }
                continue;
              }
              if (!Array.isArray(v)) { delete exp[k]; repaired++; continue; }
              const cleaned = (v as unknown[]).filter((x) => typeof x === "string");
              if (cleaned.length !== (v as unknown[]).length) { exp[k] = cleaned; repaired++; }
            }
            // Numeric learner metrics must never surface as NaN in the UI.
            const NUM_FIELDS = ["mastery","accuracy","speed","retention","consistency",
              "difficulty","attempts","sessions","daysActive","unseenPerf","simPerf","confidence"] as const;
            for (const sid of Object.keys(m.subs)) {
              const st = (m.subs as unknown as Record<string, Record<string, unknown>>)[sid];
              const fresh = (base.subs as unknown as Record<string, Record<string, unknown>>)[sid];
              if (!st || !fresh) continue;
              for (const f of NUM_FIELDS) {
                const n = Number(st[f]);
                if (!Number.isFinite(n)) { st[f] = fresh[f]; repaired++; }
              }
              if (!Array.isArray(st.recent)) { st.recent = []; repaired++; }
            }
            if (repaired > 0) {
              console.warn(`[multicheck] storage migration repaired ${repaired} field(s) from an older schema.`);
            }
          }

          if (m.version !== SCHEMA) m.version = SCHEMA;

          // ---- ONE-TIME SIM REGRADE INVALIDATION (pre-76ce485 grading defect) ----
          // Raw simulation answers are deleted on submit, so mis-graded sim signal
          // cannot be recomputed. Reset ONLY sim-derived fields; training-derived
          // mastery/accuracy stay intact. Runs once, then records the flag.
          const anyM = m as unknown as Record<string, unknown>;
          if (!anyM[SIM_REGRADE_FLAG]) {
            let affected = 0;
            for (const sid of Object.keys(m.subs)) {
              const st = m.subs[sid];
              if (!st) continue;
              if ((st.simPerf ?? 0) > 0) {
                m.subs[sid] = { ...st, simPerf: 0, confidence: Math.min(st.confidence ?? 0, 0.5) };
                affected++;
              }
            }
            anyM[SIM_REGRADE_FLAG] = true;
            if (affected > 0) {
              anyM.simRegradeNotice =
                "Frühere Prüfungssimulationen wurden wegen eines Bewertungsfehlers " +
                "(Zahlenformate wie 1,0 oder 24,60 wurden falsch gewertet) zurückgesetzt. " +
                "Bitte eine neue Simulation starten für eine korrekte Einschätzung.";
              console.warn(`[multicheck] sim regrade: invalidated sim signal for ${affected} subskill(s).`);
            }
          }
        }
      } else {
        m = emptyCoach();
      }
      setModel(m);
      setStatus("ready");
    } catch (e) {
      try { setModel(emptyCoach()); setStatus("ready"); }
      catch { setStatus("error"); setErrorMsg("App konnte nicht geladen werden."); }
    }
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    init();
  }, [init]);

  const save = useCallback((m: CoachModel) => {
    setModel(m);
    try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* quota — in-memory still works */ }
  }, []);

  // record a single attempt, buffered per session then flushed
  const record = useCallback((a: Attempt) => {
    buffer.current.push(a);
    setModel((prev) => {
      if (!prev) return prev;
      const next = updateModel(prev, [a], sessionId.current, a.mode ?? "adaptive");
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const reset = useCallback(() => { sessionId.current = newSessionId(); buffer.current = []; save(emptyCoach()); }, [save]);
  const retry = useCallback(() => { started.current = false; init(); }, [init]);

  const applySim = useCallback((results: { subskill: string; correct: boolean; ms: number }[], mode: "mini-sim" | "full-sim") => {
    setModel((prev) => {
      if (!prev) return prev;
      const next = recordSimulation(prev, results, mode);
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  // Surface the one-time sim-regrade notice so invalidation is never silent.
  const simRegradeNotice = ((model as unknown as Record<string, unknown> | null)?.simRegradeNotice as string | undefined) ?? null;
  return { model, record, save, reset, retry, applySim, ready: status === "ready", status, errorMsg, simRegradeNotice };
}
