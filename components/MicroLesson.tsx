"use client";
import { useState } from "react";
import { gradeAnswer } from "@/lib/grading";
import { Lesson, lessonForConcept } from "@/lib/lessons";
import { Button } from "@/components/ui";

export function MicroLesson({ concept, onDone }: { concept?: string; onDone: (success: boolean) => void }) {
  const lesson = lessonForConcept(concept);
  const [step, setStep] = useState(0); // 0 explain,1 worked,2 guided,3 independent,4 result
  const [g, setG] = useState("");
  const [i, setI] = useState("");
  const [gOk, setGOk] = useState<boolean | null>(null);
  const [iOk, setIOk] = useState<boolean | null>(null);

  if (!lesson) {
    return (
      <div className="enter max-w-xl mx-auto px-6 py-8">
        <p className="text-ink-soft">Kurze Wiederholung zu diesem Thema.</p>
        <button onClick={() => onDone(true)} className="mt-4 rounded-md border border-line px-5 py-2.5 text-sm font-medium hover:border-brand">Weiter</button>
      </div>
    );
  }

  const checkGuided = () => { const ok = gradeAnswer(g, lesson.guided.a); setGOk(ok); };
  const checkIndep = () => { const ok = lesson.independent.check(i); setIOk(ok); };

  return (
    <div className="enter max-w-xl mx-auto px-6 py-8">
      <p className="text-2xs uppercase tracking-wide text-brand font-medium">Mikro-Lektion · {lesson.title}</p>
      <div className="mt-4 rounded-card border border-line bg-surface p-6 shadow-card space-y-4">
        {step === 0 && (
          <div>
            <p className="text-base leading-relaxed">{lesson.explain}</p>
            <Button className="mt-4" onClick={() => setStep(1)}>Beispiel ansehen →</Button>
          </div>
        )}
        {step === 1 && (
          <div>
            <p className="text-sm text-ink-muted">Gearbeitetes Beispiel:</p>
            <p className="mt-2 rounded-md bg-page p-3 text-base">{lesson.worked}</p>
            <Button className="mt-4" onClick={() => setStep(2)}>Übungsfrage →</Button>
          </div>
        )}
        {step === 2 && (
          <div>
            <p className="text-base">{lesson.guided.q}</p>
            <input autoFocus value={g} onChange={(e) => setG(e.target.value)} onKeyDown={(e) => e.key === "Enter" && checkGuided()}
              placeholder="Antwort…" className="mt-3 w-full rounded-md border border-line px-4 py-3 text-base outline-none focus:border-brand" />
            {gOk === null && <Button className="mt-3" onClick={checkGuided}>Prüfen</Button>}
            {gOk !== null && (
              <p className={`mt-3 text-sm ${gOk ? "text-good" : "text-bad"}`}>{gOk ? "✓ Richtig" : `✗ Richtig: ${lesson.guided.a}`}</p>
            )}
            {gOk !== null && <Button className="mt-3" onClick={() => setStep(3)}>Weiter →</Button>}
          </div>
        )}
        {step === 3 && (
          <div>
            <p className="text-base">{lesson.independent.q}</p>
            <input autoFocus value={i} onChange={(e) => setI(e.target.value)} onKeyDown={(e) => e.key === "Enter" && checkIndep()}
              placeholder="Antwort…" className="mt-3 w-full rounded-md border border-line px-4 py-3 text-base outline-none focus:border-brand" />
            {iOk === null && <Button className="mt-3" onClick={checkIndep}>Prüfen</Button>}
            {iOk !== null && (
              <p className={`mt-3 text-sm ${iOk ? "text-good" : "text-bad"}`}>{iOk ? "✓ Richtig — zurück zum Training" : `✗ Richtig: ${lesson.independent.a}`}</p>
            )}
            {iOk !== null && <Button className="mt-3" onClick={() => setStep(4)}>Abschließen →</Button>}
          </div>
        )}
        {step === 4 && (
          <div>
            <p className="text-lg font-medium">{iOk ? "Geschafft! Weiterübung folgt." : "Noch einmal versuchen wir es im Training."}</p>
            <Button className="mt-4" onClick={() => onDone(iOk === true)}>Zurück zum Training</Button>
          </div>
        )}
      </div>
    </div>
  );
}
