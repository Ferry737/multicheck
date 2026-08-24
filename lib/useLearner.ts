"use client";
import { useEffect, useState, useCallback } from "react";
import { LearnerModel, emptyModel, recordAttempt, Attempt } from "@/lib/learner";

const KEY = "multicheck-model-v1";

export function useLearner() {
  const [model, setModel] = useState<LearnerModel | null>(null);

  useEffect(() => {
    let m: LearnerModel;
    try {
      const raw = localStorage.getItem(KEY);
      m = raw ? JSON.parse(raw) : emptyModel();
    } catch {
      m = emptyModel();
    }
    // ensure all skills exist (schema migration safety)
    const base = emptyModel();
    m.skills = { ...base.skills, ...(m.skills || {}) };
    setModel(m);
  }, []);

  const save = useCallback((m: LearnerModel) => {
    setModel(m);
    try { localStorage.setItem(KEY, JSON.stringify(m)); } catch {}
  }, []);

  const record = useCallback((a: Attempt) => {
    setModel((prev) => { if (!prev) return prev; const next = recordAttempt(prev, a); try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {} return next; });
  }, []);

  const reset = useCallback(() => save(emptyModel()), [save]);

  return { model, record, reset, ready: model !== null };
}
