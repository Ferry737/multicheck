"use client";
import { useState } from "react";
import { useLearner } from "@/lib/useLearner";
import { subskillById } from "@/lib/curriculum";
import { generateBatch } from "@/lib/questions";
import { Trainer } from "@/components/Trainer";
import { Card, Button } from "@/components/ui";

export default function Fehler() {
  const { model, ready } = useLearner();
  const [reviewSkill, setReviewSkill] = useState<string | null>(null);
  if (!ready || !model) return <div className="text-sm text-ink-faint">Lade…</div>;

  if (reviewSkill) {
    const m = model.subs[reviewSkill]?.mastery ?? 0;
    const diff = 1 + Math.round(m * 2);
    return <Trainer title={"Fehler: " + (subskillById(reviewSkill)?.name ?? "")} getQuestions={() => generateBatch(reviewSkill, diff, 8, Date.now())} />;
  }

  const open = model.fehler.filter((f) => !f.mastered)
    .sort((a, b) => (b.repeats * 2 + b.lastWrong / 1e12) - (a.repeats * 2 + a.lastWrong / 1e12));

  return (
    <div className="enter">
      <h1 className="text-2xl font-semibold tracking-tight">Fehler</h1>
      <p className="mt-1 text-sm text-ink-muted">{open.length} offene Fehler · zuerst die wiederholten und aktuellen.</p>

      {open.length === 0 && <Card className="mt-6 p-6 text-center text-ink-muted">Keine offenen Fehler — stark! 🎉</Card>}

      <div className="mt-5 space-y-3">
        {open.map((f) => (
          <Card key={f.id} className="p-4">
            <div className="flex justify-between items-start gap-3">
              <div className="min-w-0">
                <p className="text-2xs text-ink-faint">{subskillById(f.subskill)?.name} · {new Date(f.date).toLocaleDateString("de-CH")}</p>
                <p className="mt-1 font-medium text-sm">{f.prompt}</p>
                <p className="mt-1 text-sm text-bad">Deine Antwort: {f.studentAnswer || "—"} · Richtig: <span className="text-good">{f.correctAnswer}</span></p>
                {f.repeats > 1 && <span className="inline-block mt-1 text-2xs bg-badSoft text-bad px-2 py-0.5 rounded-pill">×{f.repeats} wiederholt</span>}
              </div>
              <Button onClick={() => setReviewSkill(f.subskill)} className="shrink-0">Erneut üben</Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
