"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { CoachModel, emptyCoach, updateModel, Attempt, SessionMode, recordSimulation } from "@/lib/coach";

const KEY = "multicheck-coach-v3";
const SCHEMA = 3;

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
          m.exposure = m.exposure || {};
          m.calibrationPool = m.calibrationPool || {};
          if (typeof m.examDate !== "string") m.examDate = base.examDate;
          if (m.version !== SCHEMA) m.version = SCHEMA;
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

  return { model, record, reset, retry, applySim, ready: status === "ready", status, errorMsg };
}
