"use client";
import { useEffect, useState, useRef } from "react";
import { Question } from "@/lib/questions";
import { useLearner } from "@/lib/useLearner";
import { subskillById, areaOf } from "@/lib/curriculum";

interface TrainerProps {
  getQuestions: () => Question[]; // provides the session's questions
  title: string;
  showTimer?: boolean; // total timer (no per-q feedback if exam)
  noImmediateFeedback?: boolean;
  onDone?: (results: { correct: number; total: number; ms: number }) => void;
}

export function Trainer({ getQuestions, title, showTimer, noImmediateFeedback, onDone }: TrainerProps) {
  const { record, model, ready } = useLearner();
  const [qs, setQs] = useState<Question[]>([]);
  const [i, setI] = useState(0);
  const [input, setInput] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [correct, setCorrect] = useState<boolean | null>(null);
  const [results, setResults] = useState<boolean[]>([]);
  const [seconds, setSeconds] = useState(0);
  const startRef = useRef(0);
  const [failed, setFailed] = useState(false);

  // robust load (avoid indefinite Lade…): timeout fallback
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => { if (!cancelled && qs.length === 0) setFailed(true); }, 2500);
    try { const q = getQuestions(); if (!cancelled) { setQs(q); startRef.current = performance.now(); } }
    catch { if (!cancelled) setFailed(true); }
    return () => { cancelled = true; clearTimeout(t); };
  }, []);

  const [hidden, setHidden] = useState(false); // for recall delay

  if (!ready) return <div className="container-x py-20 text-ink-muted">Lade…</div>;
  if (failed) return <div className="container-x py-20">⚠️ Aufgaben konnten nicht geladen werden. <button onClick={() => location.reload()} className="underline">Erneut</button></div>;
  if (qs.length === 0) return <div className="container-x py-20 text-ink-muted">Lade…</div>;

  if (i >= qs.length) {
    const corr = results.filter(Boolean).length;
    const ms = performance.now() - startRef.current;
    if (onDone) onDone({ correct: corr, total: qs.length, ms });
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
  const norm = (s: string) => s.replace(/\s/g, "").replace(",", ".").toLowerCase();
  const isCorrect = norm(input) === norm(q.answer) || (q.kind === "choice" && input === q.answer);

  function submit() {
    const c = isCorrect;
    setRevealed(true); setCorrect(c);
    record({
      subskill: q.subskill, area: q.area, ts: Date.now(), correct: c, ms: performance.now() - startRef.current,
      errorType: c ? undefined : (q.subskill.includes("zaehlen") || q.subskill.includes("symbole") ? "Konzentration" : q.subskill.includes("satzbau") || q.subskill.includes("textverstaendnis") ? "Deutsch" : "Rechenfehler"),
      prompt: q.prompt, studentAnswer: input, correctAnswer: q.answer,
    });
  }

  return (
    <div className="enter max-w-2xl mx-auto px-6 py-6">
      <div className="flex items-center justify-between text-sm text-ink-muted">
        <span>{title} · {i + 1}/{qs.length}</span>
        {showTimer && <Timer seconds={seconds} setSeconds={setSeconds} />}
      </div>
      {areaOf(q.subskill) && <p className="mt-1 text-xs text-ink-faint">{areaOf(q.subskill)!.label} → {subskillById(q.subskill)?.name}</p>}

      <div className="mt-4 rounded-card border border-line bg-surface p-6 shadow-card">
        {q.stimulus && !hidden && (
          <div className="mb-4 flex flex-col items-center rounded-md bg-page p-4">
            <div dangerouslySetInnerHTML={{ __html: q.stimulus }} />
            {q.type === "recall" && !revealed && (
              <button onClick={() => setHidden(true)} className="mt-3 rounded-md border border-line px-4 py-2 text-sm font-medium hover:border-brand">
                Gemerkt — zur Frage
              </button>
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
