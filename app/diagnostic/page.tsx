"use client";
import { useState } from "react";
import { useLearner } from "@/lib/useLearner";
import { generateForSkill, Question } from "@/lib/questions";
import { skillById } from "@/lib/curriculum";
import Link from "next/link";

const DIAG = ["add", "sub", "mul", "div", "frac", "dec", "pct", "de-vocab", "de-read", "log-seq"];

export default function Diagnostic() {
  const { model, record, ready } = useLearner();
  const [i, setI] = useState(0);
  const [q, setQ] = useState<Question | null>(generateForSkill(DIAG[0], 1, 12345));
  const [input, setInput] = useState("");
  const [done, setDone] = useState(false);
  const [wrong, setWrong] = useState(0);

  if (!ready) return <div className="container-x py-20">Lade…</div>;
  if (done) return (
    <main className="container-x py-10 max-w-xl text-center">
      <h1 className="text-2xl font-bold">Diagnose abgeschlossen</h1>
      <p className="mt-3 text-ink-muted">Fehler bei {wrong} von {DIAG.length} Bereichen. Dein Profil wurde angepasst.</p>
      <Link href="/" className="mt-6 inline-block rounded-xl bg-brand px-6 py-3 text-white font-semibold">Zum Coaching →</Link>
    </main>
  );

  function next(a: Question, ans: string, correct: boolean) {
    record({ skill: a.skill, ts: Date.now(), correct, ms: 8000 });
    if (!correct) setWrong((w) => w + 1);
    const ni = i + 1;
    if (ni >= DIAG.length) { setDone(true); return; }
    setI(ni);
    setInput("");
    setQ(generateForSkill(DIAG[ni], 1, 12345 + ni * 31));
  }

  if (!q) return null;
  const isCorrect = input.trim() !== "" && (input.trim() === q.answer);

  return (
    <main className="container-x py-10 max-w-xl">
      <p className="text-sm text-ink-faint">Diagnose {i + 1}/{DIAG.length} · {skillById(q.skill)?.name}</p>
      <div className="mt-4 rounded-card border border-line bg-paper p-6 shadow-card">
        <p className="text-lg font-medium">{q.prompt}</p>
        {q.kind === "multiple-choice" ? (
          <div className="mt-4 grid gap-2">
            {q.options?.map((o) => (
              <button key={o} onClick={() => next(q, o, o === q.answer)}
                className="rounded-xl border border-line px-4 py-3 text-left text-sm hover:border-brand">{o}</button>
            ))}
          </div>
        ) : (
          <>
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Antwort…"
              className="mt-4 w-full rounded-xl border border-line px-4 py-3 outline-none focus:border-brand" />
            <button onClick={() => next(q, input, isCorrect)}
              className="mt-4 w-full rounded-xl bg-brand px-5 py-3 text-white font-semibold">Weiter</button>
          </>
        )}
      </div>
      <p className="mt-3 text-xs text-ink-faint">Keine Sorge bei Fehlern — wir bauen genau da weiter.</p>
    </main>
  );
}
