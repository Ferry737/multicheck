"use client";
import { useEffect, useState, useRef } from "react";
import { useLearner } from "@/lib/useLearner";
import { selectNext } from "@/lib/learner";
import { generateForSkill, Question } from "@/lib/questions";
import { skillById } from "@/lib/curriculum";

type Phase = "asking" | "revealed";

export default function Practice() {
  const { model, record, ready } = useLearner();
  const [skillId, setSkillId] = useState<string | null>(null);
  const [q, setQ] = useState<Question | null>(null);
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<Phase>("asking");
  const [correct, setCorrect] = useState<boolean | null>(null);
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const startRef = useRef(0);

  // pick skill + question
  function nextQuestion(forceSkill?: string) {
    const useSkill = forceSkill ?? (model ? selectNext(model).skillId : "add");
    setSkillId(useSkill);
    const m = model?.skills[useSkill]?.mastery ?? 0;
    // difficulty rises with mastery (band 1..3 for MVP)
    const diff = 1 + Math.round(m * 2);
    const ques = generateForSkill(useSkill, diff, Date.now());
    setQ(ques);
    setInput("");
    setPhase("asking");
    setCorrect(null);
    setAiText("");
    startRef.current = performance.now();
  }

  useEffect(() => { if (ready && model && !q) nextQuestion(); /* eslint-disable-next-line */ }, [ready]);

  if (!ready) return <div className="container-x py-20 text-ink-muted">Lade…</div>;

  function check() {
    if (!q) return;
    const userAns = input.trim();
    const isCorrect = normalize(userAns) === normalize(q.answer) ||
      (q.kind === "multiple-choice" && userAns === q.answer);
    const ms = performance.now() - startRef.current;
    setCorrect(isCorrect);
    setPhase("revealed");
    record({
      skill: q.skill, ts: Date.now(), correct: isCorrect, ms,
      errorCategory: isCorrect ? undefined : guessError(q, userAns),
    });
  }

  function askAI(mode: string, prompt: string) {
    setAiLoading(true); setAiText("");
    fetch("/api/tutor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode, prompt,
        context: `Aufgabe: ${q?.prompt}\nRichtig: ${q?.answer}\nErklärung: ${q?.explanation}`,
      }),
    })
      .then((r) => r.json())
      .then((d) => { setAiText(d.text || "(keine Antwort)"); setAiLoading(false); })
      .catch(() => { setAiText("KI gerade nicht erreichbar."); setAiLoading(false); });
  }

  const skill = skillId ? skillById(skillId) : null;

  return (
    <main className="container-x py-8 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Üben</h1>
        {skill && <span className="text-sm text-ink-muted">{skill.name}</span>}
      </div>

      {q && (
        <div className="mt-6 rounded-card border border-line bg-paper p-6 shadow-card">
          <p className="text-lg font-medium">{q.prompt}</p>

          {q.kind === "multiple-choice" && phase === "asking" && (
            <div className="mt-4 grid grid-cols-1 gap-2">
              {q.options?.map((o) => (
                <button key={o} onClick={() => setInput(o)}
                  className={`rounded-xl border px-4 py-3 text-left text-sm ${input === o ? "border-brand bg-brand-soft" : "border-line hover:border-brand/50"}`}>
                  {o}
                </button>
              ))}
            </div>
          )}

          {q.kind !== "multiple-choice" && (
            <input
              autoFocus value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && phase === "asking" && check()}
              placeholder="Deine Antwort…"
              className="mt-4 w-full rounded-xl border border-line px-4 py-3 text-base outline-none focus:border-brand"
            />
          )}

          {phase === "asking" && (
            <button onClick={check}
              className="mt-4 w-full rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white">
              Prüfen
            </button>
          )}

          {phase === "revealed" && (
            <div className="mt-5">
              <div className={`rounded-xl p-4 text-sm ${correct ? "bg-good/10 text-good" : "bg-bad/10 text-bad"}`}>
                {correct ? "✓ Richtig!" : `✗ Richtig wäre: ${q.answer}`}
              </div>
              <p className="mt-3 text-sm text-ink-muted">{q.explanation}</p>

              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={() => askAI("explain", "Erkläre diese Aufgabe Schritt für Schritt einfach.")}
                  className="rounded-xl border border-line px-4 py-2 text-sm hover:border-brand">💡 KI erklärt es mir</button>
                {!correct && (
                  <button onClick={() => askAI("why", "Warum ist meine Antwort falsch? Erkläre den Fehler freundlich.")}
                    className="rounded-xl border border-line px-4 py-2 text-sm hover:border-brand">❓ Warum falsch?</button>
                )}
                <button onClick={() => nextQuestion()}
                  className="rounded-xl bg-brand px-5 py-2 text-sm font-semibold text-white">Nächste →</button>
              </div>

              {aiLoading && <p className="mt-3 text-sm text-ink-muted">KI denkt…</p>}
              {aiText && <div className="mt-3 rounded-xl bg-page p-4 text-sm whitespace-pre-wrap">{aiText}</div>}
            </div>
          )}

          <button onClick={() => nextQuestion()} className="mt-4 text-xs text-ink-faint hover:text-ink">
            andere Aufgabe zu diesem Thema
          </button>
        </div>
      )}

      {!q && <p className="mt-6 text-ink-muted">Wähle ein Thema oder starte die Diagnose.</p>}
    </main>
  );
}

function normalize(s: string) {
  return s.replace(/\s/g, "").replace(",", ".").toLowerCase();
}

function guessError(q: Question, ans: string): string {
  if (!ans) return "leer";
  if (q.kind === "numeric" || q.skill === "mul" || q.skill === "div")
    return "Rechenfehler";
  return "Verständnis";
}
