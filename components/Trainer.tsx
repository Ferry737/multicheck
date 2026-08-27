"use client";
import { useEffect, useState, useRef } from "react";
import { gradeAnswer } from "@/lib/grading";
import { loadMemWindows, saveMemWindows, planMemWindow, consumeMemWindow, MEMWINDOW_TTL_MS } from "@/lib/memwindow";
import { Question, resolveDifficulty } from "@/lib/questions";
import { useLearner } from "@/lib/useLearner";
import { subskillById, areaOf } from "@/lib/curriculum";
import { classifyError, midSessionDecision } from "@/lib/coach";
import { MicroLesson } from "@/components/MicroLesson";

interface TrainerProps {
  getQuestions: () => Question[];
  title: string;
  showTimer?: boolean;
  noImmediateFeedback?: boolean;
  onDone?: (results: { correct: number; total: number; ms: number }) => void;
  onResults?: (attempts: { subskill: string; correct: boolean; ms: number }[]) => void;
}

type Intervention =
  | { kind: "lesson"; subskill: string; concept?: string }
  | { kind: "accuracy"; subskill: string }
  | { kind: "speed"; subskill: string };

export function Trainer({ getQuestions, title, showTimer, noImmediateFeedback, onDone, onResults }: TrainerProps) {
  const { record, model, ready, status, retry } = useLearner();
  const [qs, setQs] = useState<Question[]>([]);
  const [i, setI] = useState(0);
  const [input, setInput] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [correct, setCorrect] = useState<boolean | null>(null);
  const [results, setResults] = useState<boolean[]>([]);
  const [resultsDetail, setResultsDetail] = useState<{ subskill: string; correct: boolean; ms: number }[]>([]);
  const [seconds, setSeconds] = useState(0);
  const [failed, setFailed] = useState(false);

  const [failStreak, setFailStreak] = useState<Record<string, number>>({});
  const [intervention, setIntervention] = useState<Intervention | null>(null);
  const [speedFlag, setSpeedFlag] = useState<Record<string, boolean>>({});
  const [accuracyFlag, setAccuracyFlag] = useState<Record<string, boolean>>({});

  const loadedRef = useRef(false);
  const qStartRef = useRef(0); // per-question start (Phase 5-A: correct timing)
  // Idempotency latch for submit(): holds the key of the item already recorded, so a
  // double/triple click or held Enter cannot write the same attempt twice (R12.4).
  const submittedForRef = useRef<string | null>(null);
  const doneRef = useRef(false); // guard against duplicate completion side effects (Phase 5-I)
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => { if (!cancelled && !loadedRef.current) { console.error("[trainer] load timeout, qs empty"); setFailed(true); } }, 2500);
    try { const q = getQuestions(); if (!cancelled) { loadedRef.current = q.length > 0; setQs(q); qStartRef.current = performance.now(); } }
    catch (e) { console.error("[trainer] getQuestions threw:", e); if (!cancelled) setFailed(true); }
    return () => { cancelled = true; clearTimeout(t); };
  }, []);

  // Reset per-question state (timing + memory stimulus visibility) whenever the question index changes.
  useEffect(() => {
    qStartRef.current = performance.now();
    setHidden(false);
    setRevealed(false);
    setInput("");
    setCorrect(null);
  }, [i]);

  const [hidden, setHidden] = useState(false);
  // MEMORY-WINDOW INTEGRITY (P0 memory-exploit loop): previously this window was
  // plain component state, so a refresh remounted with a FULL fresh window and
  // a student could re-memorize indefinitely. The absolute deadline and
  // consumed state now persist in lib/memwindow.ts, keyed by the STABLE
  // exactHash (question ids are regenerated on every mount and would silently
  // reopen the exploit). Within TTL: remaining time only, never an extension;
  // once consumed/expired the stimulus cannot re-render this session.
  // Recall items legitimately recur ACROSS days, so entries go stale after TTL
  // and the next real session gets a fresh window (test-memwindow.mjs case 7).
  useEffect(() => {
    const cur = qs[i];
    if (cur?.type !== "recall" || !cur.memorizeMs) return;
    // Key = rendered CONTENT (subskill + prompt), not q.id: ids regenerate every
    // mount and would silently reopen the exploit. structHash/templateKey are
    // coarser than the rendered task (shared by every item of the struct), which
    // would wrongly consume siblings' windows; prompt uniquely identifies what
    // the student actually sees.
    const qk = "memw:" + cur.subskill + ":" + cur.prompt;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const all = loadMemWindows(typeof window !== "undefined" ? window.localStorage : null);
      const plan = planMemWindow(all, qk, Date.now(), cur.memorizeMs, MEMWINDOW_TTL_MS);
      saveMemWindows(typeof window !== "undefined" ? window.localStorage : null, { ...all, [qk]: plan.entry });
      setHidden(!plan.renderStimulus);
      if (plan.renderStimulus && plan.hideAfterMs != null) {
        timer = setTimeout(() => {
          setHidden(true);
          try {
            const store = typeof window !== "undefined" ? window.localStorage : null;
            const latest = loadMemWindows(store);
            saveMemWindows(store, { ...latest, [qk]: consumeMemWindow(latest[qk] ?? plan.entry) });
          } catch { /* private mode */ }
        }, plan.hideAfterMs);
      }
    } catch { setHidden(false); }
    return () => { if (timer) clearTimeout(timer); };
  }, [qs, i]);

  if (status === "error") return (
    <div className="enter max-w-md mx-auto px-6 py-20 text-center">
      <p className="text-ink-soft">App konnte nicht geladen werden.</p>
      <button onClick={retry} className="mt-4 rounded-md border border-line px-5 py-2.5 text-sm font-medium hover:border-brand">Erneut versuchen</button>
    </div>
  );
  if (!ready) return <div className="enter max-w-md mx-auto px-6 py-20 text-sm text-ink-faint">Lade…</div>;
  if (failed) return (
    <div className="enter max-w-md mx-auto px-6 py-20 text-center">
      <p className="text-ink-soft">⚠️ Aufgaben konnten nicht geladen werden.</p>
      <button onClick={() => location.reload()} className="mt-4 rounded-md border border-line px-5 py-2.5 text-sm font-medium hover:border-brand">Erneut versuchen</button>
    </div>
  );
  if (qs.length === 0) return <div className="enter max-w-md mx-auto px-6 py-20 text-sm text-ink-faint">Lade…</div>;

  if (intervention) {
    if (intervention.kind === "lesson") {
      return <MicroLesson concept={intervention.concept} onDone={() => {
        setIntervention(null);
        setFailStreak((s) => ({ ...s, [intervention.subskill]: 0 }));
        setI((v) => v + 1);
        setRevealed(false); setInput("");
      }} />;
    }
    if (intervention.kind === "accuracy") {
      return (
        <div className="enter max-w-xl mx-auto px-6 py-10">
          <div className="rounded-card border border-bad/30 bg-bad/5 p-6">
            <p className="text-sm font-medium">Genauigkeit vor Tempo</p>
            <p className="mt-2 text-sm text-ink-muted">Du warst sehr schnell, aber nicht richtig. Nimm dir beim nächsten Mal eine Sekunde mehr Zeit und prüfe deine Antwort, bevor du sie abgibst.</p>
            <button onClick={() => { setIntervention(null); setAccuracyFlag((f) => ({ ...f, [intervention.subskill]: true })); }} className="mt-4 rounded-md bg-brand px-5 py-3 text-white font-medium">Verstanden — weiter</button>
          </div>
        </div>
      );
    }
    if (intervention.kind === "speed") {
      return (
        <div className="enter max-w-xl mx-auto px-6 py-10">
          <div className="rounded-card border border-brand/30 bg-brand/5 p-6">
            <p className="text-sm font-medium">Tempo-Training</p>
            <p className="mt-2 text-sm text-ink-muted">Du rechnest richtig, aber zu langsam. Die nächsten Aufgaben zu dieser Fähigkeit sind als Speed-Drill markiert — versuche, schneller zu entscheiden.</p>
            <button onClick={() => { setIntervention(null); }} className="mt-4 rounded-md bg-brand px-5 py-3 text-white font-medium">Weiter</button>
          </div>
        </div>
      );
    }
  }

  if (i >= qs.length) {
    const corr = results.filter(Boolean).length;
    const ms = performance.now() - qStartRef.current;
    // Guard: completion side effects must run EXACTLY once (Phase 5-I).
    if (!doneRef.current) {
      doneRef.current = true;
      if (onResults) onResults(resultsDetail);
      if (onDone) onDone({ correct: corr, total: qs.length, ms });
    }
    return (
      <div className="enter max-w-xl mx-auto px-6 py-10 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Fertig</h1>
        <p className="mt-3 text-4xl font-bold tnum">{Math.round((corr / qs.length) * 100)}%</p>
        <p className="mt-2 text-ink-muted">{corr}/{qs.length} richtig · {Math.round(ms / 1000)}s</p>
        <button onClick={() => location.reload()} className="mt-6 rounded-md border border-line px-6 py-3 font-medium hover:border-brand">Nochmal</button>
      </div>
    );
  }

  const q = qs[i];
  const isCorrect = gradeAnswer(input, q.answer, q.kind);
  const SPEED_TARGET = 12000;

  function submit() {
    // IDEMPOTENCY GUARD (R12.4): the button was only disabled={!input}, so a rapid
    // double/triple click (or held Enter) called submit() repeatedly and record()
    // wrote one attempt per click — measured as history +3 for one triple-click,
    // silently corrupting the learner model. The latch is keyed to the question that
    // is being answered, so it blocks repeats for THIS item but never the next one.
    if (revealed) return;
    const itemKey = `${q.id ?? ""}|${q.prompt}`;
    if (submittedForRef.current === itemKey) return;
    submittedForRef.current = itemKey;
    const c = isCorrect;
    const ms = performance.now() - qStartRef.current; // per-question timing (Phase 5-A)
    const attempt: any = {
      subskill: q.subskill, area: q.area, ts: Date.now(), correct: c, ms,
      difficulty: q.difficultyScore ?? resolveDifficulty(q.difficulty),
      mode: speedFlag[q.subskill] ? "speed" : "adaptive",
      templateKey: q.templateKey,
      prompt: q.prompt, studentAnswer: input, correctAnswer: q.answer,
    };
    attempt.errorType = c ? undefined : classifyError(q, attempt);
    setRevealed(true); setCorrect(c);
    setResultsDetail((d) => [...d, { subskill: q.subskill, correct: c, ms }]);
    record(attempt);

    if (model) {
      const streak = (failStreak[q.subskill] ?? 0) + (c ? 0 : 1);
      if (!c) setFailStreak((s) => ({ ...s, [q.subskill]: streak }));
      else setFailStreak((s) => ({ ...s, [q.subskill]: 0 }));
      const dec = midSessionDecision(model, q.subskill, c, ms, streak, !!speedFlag[q.subskill]);
      if (dec.kind === "lesson") { setIntervention({ kind: "lesson", subskill: q.subskill, concept: dec.concept }); return; }
      if (dec.kind === "accuracy") { setIntervention({ kind: "accuracy", subskill: q.subskill }); return; }
      if (dec.kind === "speed") { setSpeedFlag((f) => ({ ...f, [q.subskill]: true })); }
    }
  }

  return (
    <div className="enter max-w-2xl mx-auto px-6 py-6">
      <div className="flex items-center justify-between text-sm text-ink-muted">
        <span>{title} · {i + 1}/{qs.length}</span>
        {showTimer && <Timer seconds={seconds} setSeconds={setSeconds} />}
      </div>
      {speedFlag[q.subskill] && <p className="mt-1 text-2xs text-brand">⚡ Tempo-Drill</p>}
      {accuracyFlag[q.subskill] && <p className="mt-1 text-2xs text-bad">◎ Genauigkeit achten</p>}
      {areaOf(q.subskill) && <p className="mt-1 text-xs text-ink-faint">{areaOf(q.subskill)!.label} → {subskillById(q.subskill)?.name}</p>}

      <div className="mt-4 rounded-card border border-line bg-surface p-6 shadow-card">
        {q.stimulus && !hidden && (
          <div className="mb-4 flex flex-col items-center rounded-md bg-page p-4">
            <div dangerouslySetInnerHTML={{ __html: q.stimulus }} />
            {q.type === "recall" && !revealed && (
              <div className="mt-3 flex flex-col items-center gap-2">
                <p className="text-2xs text-ink-faint">Merke dir die Schilder…</p>
                <button onClick={() => setHidden(true)} className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-deep">
                  Gemerkt — zur Frage
                </button>
              </div>
            )}
          </div>
        )}
        {q.type === "recall" && hidden && <p className="mb-3 text-sm text-ink-faint">Schilder sind ausgeblendet. Beantworte aus dem Gedächtnis.</p>}
        <p className="text-lg font-medium leading-relaxed">{q.prompt}</p>

        {!revealed ? (
          <>
            {q.kind === "choice" ? (
              <div className="mt-4 grid gap-2">
                {q.options?.map((o, idx) => (
                  <button key={o} onClick={() => setInput(o)} aria-label={`Antwort ${o}`}
                    className={`flex items-center justify-between rounded-md border px-4 py-3 text-left text-base min-h-[44px] ${input === o ? "border-brand bg-brand-soft" : "border-line hover:border-brand/50"}`}>
                    <span>{o}</span><span className="text-ink-faint text-xs tnum">{idx + 1}</span>
                  </button>
                ))}
              </div>
            ) : (
              <input autoFocus value={input} onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="Antwort…" aria-label="Antwort eingeben"
                className="mt-4 w-full rounded-md border border-line px-4 py-3 text-base outline-none focus:border-brand min-h-[44px]" />
            )}
            <button onClick={submit} disabled={!input} className="mt-4 w-full rounded-md bg-brand px-5 py-3 text-white font-medium disabled:opacity-40">
              {showTimer && noImmediateFeedback ? "Weiter" : "Prüfen"}
            </button>
          </>
        ) : (
          <div>
            {!noImmediateFeedback && (
              <div className={`mt-4 rounded-md p-4 text-sm ${correct ? "bg-goodSoft text-good" : "bg-badSoft text-bad"}`} role="status">
                {correct ? "✓ Richtig" : `✗ Richtig: ${q.answer}`}
              </div>
            )}
            {!noImmediateFeedback && <p className="mt-2 text-sm text-ink-muted">{q.explanation}</p>}
            <button onClick={() => { setResults((r) => [...r, isCorrect]); setRevealed(false); setInput(""); setI((v) => v + 1); }} className="mt-4 w-full rounded-md bg-brand px-5 py-3 text-white font-medium">Weiter →</button>
          </div>
        )}
      </div>
      {!revealed && <button onClick={() => setInput("")} className="mt-3 text-xs text-ink-faint">Eingabe leeren</button>}
    </div>
  );
}

function Timer({ seconds, setSeconds }: { seconds: number; setSeconds: (f: (n: number) => number) => void }) {
  useEffect(() => { const t = setInterval(() => setSeconds((s) => s + 1), 1000); return () => clearInterval(t); }, []);
  return <span className="tabular">⏱ {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</span>;
}
