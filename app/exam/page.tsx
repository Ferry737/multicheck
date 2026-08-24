"use client";
import { useState } from "react";
import { generateBatch, Question } from "@/lib/questions";
import { skillById } from "@/lib/curriculum";
import { useLearner } from "@/lib/useLearner";

export default function ExamSim() {
  const { record, ready } = useLearner();
  const [qs, setQs] = useState<Question[]>([]);
  const [i, setI] = useState(0);
  const [input, setInput] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [results, setResults] = useState<boolean[]>([]);
  const [started, setStarted] = useState(false);
  const [seconds, setSeconds] = useState(0);

  function start() {
    // build a mixed set across skills (assumed distribution)
    const pool = ["add", "sub", "mul", "div", "frac", "dec", "pct", "word", "de-read", "de-grammar", "log-seq", "log-pattern"];
    const all: Question[] = [];
    for (const s of pool) all.push(...generateBatch(s, 2, 2, Date.now() + Math.floor(Math.random() * 99999)));
    setQs(all.slice(0, 12));
    setI(0); setStarted(true); setResults([]); setSeconds(0);
  }

  if (!ready) return <div className="container-x py-20">Lade…</div>;
  if (!started) return (
    <main className="container-x py-10 max-w-xl text-center">
      <h1 className="text-2xl font-bold">Prüfungssimulation</h1>
      <p className="mt-3 text-ink-muted">12 Aufgaben, gemischt, mit Zeit. Keine Hinweise.</p>
      <button onClick={start} className="mt-6 rounded-xl bg-brand px-6 py-3 text-white font-semibold">Simulation starten</button>
    </main>
  );

  if (i >= qs.length) {
    const score = Math.round((results.filter(Boolean).length / results.length) * 100);
    return (
      <main className="container-x py-10 max-w-xl text-center">
        <h1 className="text-2xl font-bold">Ergebnis</h1>
        <p className="mt-3 text-4xl font-bold tabular">{score}%</p>
        <p className="mt-2 text-ink-muted">{results.filter(Boolean).length}/{results.length} richtig · {seconds}s</p>
        <button onClick={start} className="mt-6 rounded-xl border border-line px-6 py-3 font-medium hover:border-brand">Nochmal</button>
      </main>
    );
  }

  const q = qs[i];
  const isCorrect = input.trim() !== "" && input.trim() === q.answer;

  return (
    <main className="container-x py-10 max-w-xl">
      <div className="flex justify-between text-sm text-ink-muted">
        <span>{i + 1}/{qs.length}</span>
        <Timer seconds={seconds} setSeconds={setSeconds} />
      </div>
      <div className="mt-4 rounded-card border border-line bg-paper p-6 shadow-card">
        <p className="text-lg font-medium">{q.prompt}</p>
        {!revealed ? (
          <>
            {q.kind === "multiple-choice" ? (
              <div className="mt-4 grid gap-2">
                {q.options?.map((o) => (
                  <button key={o} onClick={() => setInput(o)}
                    className={`rounded-xl border px-4 py-3 text-left text-sm ${input === o ? "border-brand bg-brand-soft" : "border-line"}`}>{o}</button>
                ))}
              </div>
            ) : (
              <input value={input} onChange={(e) => setInput(e.target.value)}
                className="mt-4 w-full rounded-xl border border-line px-4 py-3 outline-none focus:border-brand" />
            )}
            <button onClick={() => { setRevealed(true); record({ skill: q.skill, ts: Date.now(), correct: isCorrect, ms: 20000 }); }}
              className="mt-4 w-full rounded-xl bg-brand px-5 py-3 text-white font-semibold">Antwort abgeben</button>
          </>
        ) : (
          <div>
            <p className={`mt-2 text-sm ${isCorrect ? "text-good" : "text-bad"}`}>{isCorrect ? "✓ Richtig" : `✗ ${q.answer}`}</p>
            <button onClick={() => { setResults((r) => [...r, isCorrect]); setRevealed(false); setInput(""); setI((v) => v + 1); }}
              className="mt-4 w-full rounded-xl border border-line px-5 py-3 font-medium hover:border-brand">Weiter</button>
          </div>
        )}
      </div>
    </main>
  );
}

function Timer({ seconds, setSeconds }: { seconds: number; setSeconds: (f: (n: number) => number) => void }) {
  setTimeout(() => setSeconds((s) => s + 1), 1000);
  return <span className="tabular">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</span>;
}
