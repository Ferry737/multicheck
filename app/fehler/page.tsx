"use client";
import { useState } from "react";
import { useLearner } from "@/lib/useLearner";
import { markFehlerMastered } from "@/lib/learner";
import { subskillById } from "@/lib/curriculum";
import { generateBatch } from "@/lib/questions";
import { Trainer } from "@/components/Trainer";

export default function Fehler() {
  const { model, record, ready } = useLearner();
  const [reviewSkill, setReviewSkill] = useState<string | null>(null);
  if (!ready || !model) return <div className="container-x py-20 text-ink-muted">Lade…</div>;

  if (reviewSkill) {
    const m = model.subs[reviewSkill]?.mastery ?? 0;
    const diff = 1 + Math.round(m * 2);
    return <Trainer title={"Fehler: " + (subskillById(reviewSkill)?.name ?? "")} getQuestions={() => generateBatch(reviewSkill, diff, 8, Date.now())} />;
  }

  // prioritize: recent, repeated, slow, weak category
  const open = model.fehler.filter((f) => !f.mastered)
    .sort((a, b) => (b.repeats * 2 + b.lastWrong / 1e12) - (a.repeats * 2 + a.lastWrong / 1e12));

  return (
    <main className="container-x py-8 max-w-2xl">
      <h1 className="text-2xl font-bold">Fehler</h1>
      <p className="mt-1 text-ink-muted text-sm">{open.length} offene Fehler. Zuerst die wiederholten und aktuellen.</p>
      {open.length === 0 && <p className="mt-6 text-ink-muted">Keine offenen Fehler — stark! 🎉</p>}
      <div className="mt-5 space-y-3">
        {open.map((f) => (
          <div key={f.id} className="rounded-card border border-line bg-paper p-4 shadow-card">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs text-ink-faint">{subskillById(f.subskill)?.name} · {new Date(f.date).toLocaleDateString("de-CH")}</p>
                <p className="mt-1 font-medium">{f.prompt}</p>
                <p className="mt-1 text-sm text-bad">Deine Antwort: {f.studentAnswer || "—"} · Richtig: {f.correctAnswer}</p>
                {f.repeats > 1 && <p className="mt-1 text-xs text-ink-faint">×{f.repeats} wiederholt</p>}
              </div>
              <button onClick={() => setReviewSkill(f.subskill)} className="ml-3 shrink-0 rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-white">Erneut üben</button>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
