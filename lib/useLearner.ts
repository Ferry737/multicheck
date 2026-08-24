"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { LearnerModel, emptyModel, recordAttempt, Attempt } from "@/lib/learner";

const KEY = "multicheck-model-v2";
const SCHEMA = 2;

export type LoadStatus = "loading" | "ready" | "error";

export function useLearner() {
  const [model, setModel] = useState<LearnerModel | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const started = useRef(false);

  const init = useCallback(() => {
    setStatus("loading");
    try {
      const raw = localStorage.getItem(KEY);
      let m: LearnerModel;
      if (raw) {
        const parsed = JSON.parse(raw) as any;
        // schema migration / corruption guard
        if (!parsed || typeof parsed !== "object" || !parsed.subs) {
          m = emptyModel();
        } else {
          m = parsed as LearnerModel;
          // merge missing subskills so new taxonomy doesn't crash
          const base = emptyModel();
          m.subs = { ...base.subs, ...(m.subs || {}) };
          m.fehler = Array.isArray(m.fehler) ? m.fehler : [];
          m.history = Array.isArray(m.history) ? m.history : [];
          if (typeof m.examDate !== "string") m.examDate = base.examDate;
        }
      } else {
        m = emptyModel();
      }
      setModel(m);
      setStatus("ready");
    } catch (e) {
      // corrupt persisted data must NEVER cause infinite Lade…
      try { setModel(emptyModel()); setStatus("ready"); }
      catch { setStatus("error"); setErrorMsg("App konnte nicht geladen werden."); }
    }
  }, []);

  useEffect(() => {
    if (started.current) return; // run once (strict-mode safe)
    started.current = true;
    init();
  }, [init]);

  const save = useCallback((m: LearnerModel) => {
    setModel(m);
    try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* quota — ignore, in-memory still works */ }
  }, []);
  const record = useCallback((a: Attempt) => {
    setModel((prev) => { if (!prev) return prev; const next = recordAttempt(prev, a); try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {} return next; });
  }, []);
  const reset = useCallback(() => save(emptyModel()), [save]);
  const retry = useCallback(() => { started.current = false; init(); }, [init]);

  return { model, record, reset, retry, ready: status === "ready", status, errorMsg };
}
